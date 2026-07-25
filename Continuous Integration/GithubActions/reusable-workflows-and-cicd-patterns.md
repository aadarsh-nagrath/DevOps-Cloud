# Reusable Workflows and CI/CD Patterns

Reusable workflows vs composite actions, a complete end-to-end CI/CD pipeline example, self-hosted runners, and monorepo path filtering. See [actions-and-marketplace.md](actions-and-marketplace.md) for composite/JS/Docker actions, and [secrets-and-security.md](secrets-and-security.md) for the environment-gate mechanic used in the pipeline example below.

---

## 1. Reusable Workflows (`workflow_call`) vs Composite Actions

Both let you avoid duplicating logic, but they operate at different levels and solve different problems.

| | Composite Action | Reusable Workflow (`workflow_call`) |
|---|---|---|
| Reuses | A sequence of **steps** | An entire **job or set of jobs** (with its own `runs-on`, `strategy`, multiple jobs, `needs` between them) |
| Invoked from | A `step` (`uses: ./.github/actions/x`) | A `job` (`uses: org/repo/.github/workflows/x.yml@ref`) |
| Can define its own `runs-on`? | No — runs on whatever runner the calling job specifies | Yes — each job in the called workflow sets its own `runs-on` |
| Can have multiple jobs with `needs:` between them? | No — it's just a flat list of steps | Yes — full job graph, matrices, everything |
| Secrets handling | Inherits the calling job's env/secrets automatically (same job, same runner) | Must be **explicitly passed** via `secrets:` (or `secrets: inherit`) — separate job context |
| Typical use case | "These 5 steps (checkout, setup, install) repeat across many workflows" | "This entire lint-test-build job graph should be shared across many *repositories*, not just steps within one" |

**Rule of thumb**: if you're deduplicating a handful of steps within jobs, use a composite action. If you're deduplicating an entire job or pipeline shape — especially across multiple repos — use a reusable workflow.

### Defining a reusable workflow
```yaml
# .github/workflows/reusable-test.yml
on:
  workflow_call:                 # this trigger is what makes the workflow callable by others
    inputs:
      node-version:
        type: string
        default: '20'
      run-lint:
        type: boolean
        default: true
    secrets:
      NPM_TOKEN:                 # secrets must be declared explicitly to be passed in
        required: false

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3 # v4.1.7
      - uses: actions/setup-node@60edb5dd545a775178f52524783378180af0d1f # v4.0.2
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm ci
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - run: npm run lint
        if: inputs.run-lint
      - run: npm test
```

### Calling it — same repo or a different one
```yaml
# .github/workflows/ci.yml
jobs:
  call-tests:
    uses: ./.github/workflows/reusable-test.yml    # same-repo reference
    with:
      node-version: '22'
    secrets: inherit                                 # pass ALL secrets available to the caller through

  call-tests-external:
    uses: your-org/shared-workflows/.github/workflows/reusable-test.yml@v1   # cross-repo, pinned to a tag/SHA
    with:
      node-version: '20'
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}             # explicit pass-through, only what's declared
```
`secrets: inherit` is convenient but broad — it hands every secret the caller has to the called workflow. For cross-repo reusable workflows (where you don't control the callee), prefer explicit `secrets:` mappings so you know exactly what's being shared, following the same least-privilege reasoning as `permissions:` scoping in [secrets-and-security.md](secrets-and-security.md).

---

## 2. Full End-to-End CI/CD Pipeline Example

Lint -> test (matrix) -> build Docker image -> push to registry -> deploy (behind an environment gate). Every stage annotated.

```yaml
# .github/workflows/pipeline.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read      # least-privilege baseline; individual jobs escalate only what they need

jobs:
  # ---------- STAGE 1: Lint ----------
  # Fast, cheap check — fail here before spending time on the matrix test stage.
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3 # v4.1.7
      - uses: actions/setup-node@60edb5dd545a775178f52524783378180af0d1f # v4.0.2
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  # ---------- STAGE 2: Test (matrix) ----------
  # Runs across multiple Node versions in parallel; only starts after lint passes.
  test:
    needs: lint
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
      fail-fast: false          # see every failing version, not just the first
    steps:
      - uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3 # v4.1.7
      - uses: actions/setup-node@60edb5dd545a775178f52524783378180af0d1f # v4.0.2
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm test

  # ---------- STAGE 3: Build & push Docker image ----------
  # Only runs on pushes to main (not on every PR) — no point publishing an image
  # for code that hasn't merged yet. Waits for the full test matrix to pass.
  build-and-push:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write            # needed to push to GitHub Container Registry
    outputs:
      image-tag: ${{ steps.meta.outputs.tag }}
    steps:
      - uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3 # v4.1.7

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@9780b0c442fbb1117ed29e0efdff1e18412f7567 # v3.3.0
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}   # GITHUB_TOKEN is sufficient for GHCR — no extra secret needed

      - name: Compute image tag
        id: meta
        run: echo "tag=ghcr.io/${{ github.repository }}:${{ github.sha }}" >> "$GITHUB_OUTPUT"

      - name: Build and push
        uses: docker/build-push-action@ca877d9245402d1537745e8438e2f60ba6c9ea1 # v6.7.0
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tag }}
          cache-from: type=gha       # use GitHub Actions cache backend for Docker layer caching
          cache-to: type=gha,mode=max

  # ---------- STAGE 4: Deploy (behind an environment approval gate) ----------
  # `environment: production` means this job honors whatever protection rules are
  # configured on the "production" environment (required reviewers, wait timer —
  # see secrets-and-security.md §5). The job literally pauses in "Waiting" state
  # until approved, even though everything upstream succeeded automatically.
  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
      id-token: write             # for OIDC cloud auth — see secrets-and-security.md §3
    steps:
      - name: Assume cloud deploy role via OIDC
        uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d42e0343502 # v4.0.2
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-deploy-role
          aws-region: us-east-1

      - name: Deploy image to production
        run: |
          echo "Deploying ${{ needs.build-and-push.outputs.image-tag }}"
          # e.g.: aws ecs update-service --force-new-deployment --task-definition ...
          # or:   kubectl set image deployment/app app=${{ needs.build-and-push.outputs.image-tag }}
```

Stage-by-stage summary:

| Stage | Job | Runs when | Purpose |
|---|---|---|---|
| 1 | `lint` | Every push/PR | Fast fail on style/syntax issues before burning matrix minutes |
| 2 | `test` | After lint passes | Full test suite across supported Node versions, in parallel |
| 3 | `build-and-push` | After tests pass, only on `main` push | Package the app as a Docker image, publish to a registry |
| 4 | `deploy` | After image is pushed | Deploy to production, gated by required-reviewer approval on the `production` environment |

---

## 3. Self-Hosted Runners

```yaml
jobs:
  build:
    runs-on: [self-hosted, linux, x64, gpu]   # matches a runner registered with these labels
```

| | GitHub-hosted | Self-hosted |
|---|---|---|
| Setup | Zero — always available | You register/maintain a machine (physical, VM, container, or auto-scaled) running the runner agent |
| Environment | Fresh, ephemeral VM every job; fixed preinstalled toolset | Whatever you configure — custom hardware (GPUs), internal network access, persistent caches on disk |
| Cost | Included minutes on free/paid plans, then billed per-minute (varies by OS) | Your own infrastructure cost, but no per-minute Actions billing |
| Networking | Public internet only — cannot reach your private VPC/on-prem systems directly | Can sit inside your private network — needed for jobs that must reach internal-only resources (private databases, on-prem deploy targets) |

**When you'd want self-hosted**: specialized hardware GitHub doesn't offer (GPUs for ML training), jobs needing access to an internal network GitHub-hosted runners can't reach, persistent local caches too large/slow to rebuild every run, or cost optimization at very high build volumes.

**Security considerations with public repos — important**: self-hosted runners attached to a **public** repository are a well-known attack vector. Anyone can open a PR against a public repo; if a workflow triggered by that PR (even under the relatively safe `pull_request` trigger) runs on a self-hosted runner, **arbitrary code from that PR executes on YOUR machine**, inside your network, with whatever access that runner has. GitHub's own docs explicitly warn against this configuration. If you must use self-hosted runners with a public repo:
- Never use `runs-on: self-hosted` on workflows triggered by `pull_request` (or worse, `pull_request_target`) from public/fork contributors.
- Use ephemeral, single-job self-hosted runners (destroyed and rebuilt after every job) rather than long-lived persistent ones, so a compromise doesn't persist.
- Isolate self-hosted runners in a network segment with no access to anything sensitive, treating every job as potentially hostile.
- Prefer requiring approval for all first-time/external contributor workflow runs (`Settings → Actions → Fork pull request workflows from outside collaborators`).

---

## 4. Monorepo Patterns — Path Filters

In a monorepo, you usually don't want every workflow running on every commit — a change to `docs/` shouldn't trigger the backend's full test+deploy pipeline.

```yaml
# .github/workflows/backend-ci.yml
on:
  push:
    branches: [main]
    paths:
      - 'services/backend/**'        # only trigger if a file under this path changed
      - '.github/workflows/backend-ci.yml'   # also re-run if the workflow itself changes

# .github/workflows/frontend-ci.yml
on:
  push:
    branches: [main]
    paths:
      - 'apps/frontend/**'
```
`paths:` (and its inverse, `paths-ignore:`) filters at the **workflow trigger level** — if no changed file matches, the workflow doesn't run at all (shows as no run, not a skipped one). This is the simplest and most common monorepo pattern: one workflow file per logical package/service, each scoped to its own directory.

For finer-grained control within a single workflow (e.g., deciding at runtime which of several jobs to run based on what changed), combine path filtering with a detection job and `dorny/paths-filter` or similar:
```yaml
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      backend: ${{ steps.filter.outputs.backend }}
      frontend: ${{ steps.filter.outputs.frontend }}
    steps:
      - uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3 # v4.1.7
      - uses: dorny/paths-filter@de90cc6fb38fc0963ad72b210f1f284cd68cea36 # v3.0.2
        id: filter
        with:
          filters: |
            backend:
              - 'services/backend/**'
            frontend:
              - 'apps/frontend/**'

  backend-test:
    needs: changes
    if: needs.changes.outputs.backend == 'true'   # only runs if backend files actually changed
    runs-on: ubuntu-latest
    steps: [...]

  frontend-test:
    needs: changes
    if: needs.changes.outputs.frontend == 'true'
    runs-on: ubuntu-latest
    steps: [...]
```
This pattern is preferable when you want a **single PR status check** covering the whole monorepo (rather than N separate workflow files that each show up as their own check, some of which never even run), while still skipping the actual work for unaffected packages.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
