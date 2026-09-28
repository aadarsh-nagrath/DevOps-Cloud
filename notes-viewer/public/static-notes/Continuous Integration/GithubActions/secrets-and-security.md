# Secrets and Security

Secrets scoping, `GITHUB_TOKEN` permissions, OIDC for cloud deployments, and GitHub's built-in security tooling. See [CI Fundamentals §7](../ci-fundamentals.md) for secrets rules that apply generically across every CI tool — this file covers GitHub-Actions-specific mechanics. See [workflow-syntax-and-triggers.md §1](workflow-syntax-and-triggers.md) for the `pull_request_target` secrets-exposure risk with fork PRs.

---

## 1. Secrets Scoping — Repo, Environment, Organization

GitHub Actions secrets exist at three levels, and they compose (not just override):

| Level | Set where | Visible to |
|---|---|---|
| **Repository** | Repo → Settings → Secrets and variables → Actions | Every workflow in that repo (unless further restricted by an environment) |
| **Environment** | Repo → Settings → Environments → (env name) → Secrets | Only jobs that declare `environment: <name>` — and can require approval before those jobs even see the secret (see §5) |
| **Organization** | Org → Settings → Secrets and variables → Actions | Every repo in the org, or a restricted subset you pick — useful for credentials shared across many repos (e.g., a shared registry token) |

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production        # this job can now see production-environment secrets
    steps:
      - run: echo "Deploying with token"
        env:
          TOKEN: ${{ secrets.DEPLOY_TOKEN }}   # resolves from environment secret if set there,
                                                # else falls back to repo secret, else org secret
```

**Precedence**: if the same secret name exists at multiple levels, the most specific wins — environment beats repository, repository beats organization. Organization-level secrets can also be scoped to specific repos (not automatically shared with every repo in the org), which is worth doing deliberately rather than granting org-wide access by default.

**Practical scoping guidance**: put deploy credentials (cloud provider keys, production DB access) in **environment** secrets tied to a protected environment (see §5) — not repo-level secrets — so that even a workflow run with the right trigger can't touch them without also passing the environment's approval gate. Reserve repo-level secrets for things every job genuinely needs (e.g., a package registry read token used by every CI run).

---

## 2. `GITHUB_TOKEN` — the Automatic Token

Every workflow run automatically gets a short-lived `GITHUB_TOKEN`, scoped to that one run, expiring when the job finishes (or after a few hours at most) — no manual secret creation needed for basic repo interactions.

```yaml
steps:
  - uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3 # v4.1.7
    # actions/checkout uses GITHUB_TOKEN implicitly to authenticate the clone

  - name: Comment on the PR
    uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea # v7.0.1
    with:
      github-token: ${{ secrets.GITHUB_TOKEN }}   # explicit reference — always available, no setup needed
      script: |
        github.rest.issues.createComment({
          issue_number: context.issue.number,
          owner: context.repo.owner,
          repo: context.repo.repo,
          body: 'CI finished!'
        })
```

### Default permissions and scoping down with `permissions:`

By default (depending on a repo/org setting), `GITHUB_TOKEN` may be granted **broad read/write permissions** across the repo — contents, issues, PRs, packages, etc. This is more than almost any single job actually needs, and violates least privilege. Scope it explicitly:

```yaml
permissions:
  contents: read      # workflow-wide default: read-only on repo contents, nothing else

jobs:
  comment:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write   # override for THIS job only — it needs to post a PR comment
    steps:
      - uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea # v7.0.1
        with:
          script: |
            github.rest.issues.createComment({ /* ... */ })
```
`permissions:` can be set workflow-wide (top level) and overridden per-job. The safest baseline for any workflow that doesn't specifically need write access is:
```yaml
permissions: read-all   # or, more surgically:
permissions:
  contents: read
```
then grant specific write scopes (`pull-requests: write`, `packages: write`, `id-token: write` for OIDC, etc.) only on the individual jobs that need them. This limits blast radius: if a job is somehow tricked into running attacker-influenced commands (e.g., via an injected `run:` value), the token it holds can only do what its `permissions:` block allows, not everything the repo's default token would otherwise permit.

| Permission key | Controls access to |
|---|---|
| `contents` | Repo contents (checkout, commits, releases) |
| `pull-requests` | Reading/writing PRs, comments, labels |
| `issues` | Reading/writing issues |
| `packages` | GitHub Packages registry |
| `id-token` | OIDC token issuance — required for cloud OIDC auth, see §3 |
| `actions` | Managing workflow runs (cancel, rerun) |
| `security-events` | Uploading CodeQL/SARIF results |

---

## 3. OIDC / Federated Identity for Cloud Deployments

### The old way, and why it's a problem
```yaml
# The pattern OIDC replaces — a long-lived static credential stored as a secret
- uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```
A static access key stored as a GitHub secret works, but: it doesn't expire on its own, it grants whatever permissions were attached at creation time indefinitely, it can be copy-pasted or logged accidentally, and if it ever leaks (a misconfigured log, a compromised dependency reading `process.env`, a `pull_request_target` mistake per [workflow-syntax-and-triggers.md](workflow-syntax-and-triggers.md)) it remains valid and exploitable until someone notices and manually revokes it — which could be days or weeks.

### The OIDC way
GitHub Actions can issue a short-lived, cryptographically signed **OIDC token** for each workflow run, which your cloud provider (AWS/Azure/GCP) can be configured to trust *without you ever storing a credential at all*. The workflow requests a token, presents it to the cloud provider, and the provider — having been told in advance "trust tokens from this specific GitHub repo/branch/environment" — hands back a **temporary session credential** valid for that run only.

**Why this is better:**
- No long-lived secret exists anywhere to leak — there's nothing in GitHub Secrets for an attacker to steal.
- Tokens are scoped to a single workflow run and expire in minutes/hours, not indefinitely.
- The trust relationship is scoped precisely (e.g., "only workflows on `main` in `org/repo` may assume this role") — a fork PR or a different repo cannot get a token that the cloud side will honor.
- Credential rotation is a non-issue — there's nothing to rotate.

### Worked example: OIDC-based AWS role assumption

**AWS side (one-time setup)** — create an IAM OIDC identity provider trusting `token.actions.githubusercontent.com`, and an IAM role with a trust policy scoped to your repo:
```json
{
  "Effect": "Allow",
  "Principal": { "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
    "StringLike": { "token.actions.githubusercontent.com:sub": "repo:your-org/your-repo:ref:refs/heads/main" }
  }
}
```

**Workflow side**:
```yaml
permissions:
  id-token: write     # REQUIRED — grants this job permission to request an OIDC token at all
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3 # v4.1.7

      - name: Assume AWS role via OIDC
        uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d42e0343502 # v4.0.2
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-deploy-role
          aws-region: us-east-1
          # No access key / secret key anywhere — the action requests a GitHub OIDC
          # token, presents it to AWS STS, and gets back short-lived credentials
          # scoped to `role-to-assume`'s permissions, valid only for this job.

      - name: Deploy
        run: aws s3 sync ./dist s3://my-app-bucket/
```
`permissions: id-token: write` is the switch that must be present — without it, GitHub refuses to mint an OIDC token for the job at all, regardless of what the cloud-side trust policy allows.

Azure and GCP have equivalent mechanisms (`azure/login` with federated credentials, `google-github-actions/auth` with Workload Identity Federation) — same underlying idea: trust a signed token instead of storing a static secret.

---

## 4. Dependabot and CodeQL — Built-In Security Features

| Feature | What it does | Config location |
|---|---|---|
| **Dependabot version updates** | Opens PRs bumping outdated dependencies (npm, pip, Docker base images, **and GitHub Actions themselves**, including SHA-pinned ones) | `.github/dependabot.yml` |
| **Dependabot security updates** | Automatically opens PRs fixing dependencies with known CVEs, using advisory data | Enabled via repo Settings → Security, no YAML needed |
| **CodeQL** | Static analysis (SAST) — scans your code for security vulnerabilities (injection, unsafe deserialization, etc.) on every push/PR | `.github/workflows/codeql.yml` (auto-generated by GitHub's setup UI, or hand-written) |

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"

  - package-ecosystem: "github-actions"   # keeps your SHA-pinned actions current — see actions-and-marketplace.md
    directory: "/"
    schedule:
      interval: "weekly"
```

```yaml
# .github/workflows/codeql.yml (simplified)
name: CodeQL
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'   # weekly deep scan

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      security-events: write   # required to upload CodeQL results
      contents: read
    steps:
      - uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3 # v4.1.7
      - uses: github/codeql-action/init@2e230e8fe0ad3a14a340ad0815ddb96d599d2aff # v3.26.6
        with:
          languages: javascript
      - uses: github/codeql-action/analyze@2e230e8fe0ad3a14a340ad0815ddb96d599d2aff # v3.26.6
```

---

## 5. Environment Protection Rules — Manual Approval Gates

Environments (Settings → Environments) aren't just a secrets namespace (§1) — they can enforce protection rules that block a job until conditions are met:

```yaml
jobs:
  deploy-production:
    runs-on: ubuntu-latest
    environment: production   # this job now honors whatever protection rules are set on "production"
    steps:
      - run: ./deploy.sh
```

Configured on the environment itself (not in YAML):
- **Required reviewers**: the job pauses — literally shown as "Waiting" in the Actions UI — until one of the named reviewers manually approves the run. This is the mechanism for "a human must sign off before this touches production," fully native to GitHub, no external approval-gate tooling needed.
- **Wait timer**: forces a minimum delay (e.g., 10 minutes) before the job is allowed to proceed, even with no human action — useful as a "cool-down"/last-chance-to-cancel window on automatic deploys.
- **Deployment branch/tag restrictions**: only allow this environment's jobs to run from specific branches (e.g., only `main`) or tag patterns, so a stray branch can never accidentally deploy to production even if the workflow file allowed it.

This is the direct GitHub-native equivalent of Continuous **Delivery** vs Continuous **Deployment** from [CI Fundamentals §2](../ci-fundamentals.md) — an environment with required reviewers turns an otherwise fully automatic deploy job into a human-gated one, without changing a single line of pipeline logic.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
