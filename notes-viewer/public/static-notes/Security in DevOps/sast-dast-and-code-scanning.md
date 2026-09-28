# SAST, DAST, SCA, and Secret Scanning

Static and dynamic application scanning, dependency vulnerability scanning, and stopping secrets from ever reaching a git history — the automated checks that catch the majority of common vulnerability classes before release.

---

## 1. SAST — Static Application Security Testing

SAST scans **source code, bytecode, or binaries without executing them**, looking for insecure patterns: SQL injection, command injection, hardcoded credentials, unsafe deserialization, path traversal, use of broken crypto primitives, etc. It works by building an abstract syntax tree / data-flow graph and matching known-dangerous patterns (tainted input reaching a dangerous sink).

### Common tools

| Tool | Notes |
|---|---|
| **Semgrep** | Fast, rule-based, easy to write custom rules in a YAML-like DSL, good CI ergonomics, free tier is generous |
| **CodeQL** | GitHub's engine — treats code as a queryable database, very deep/precise, free for public repos, powers GitHub's default code scanning |
| **SonarQube / SonarCloud** | Combines SAST with general code quality metrics (complexity, duplication) — often already deployed for quality gates, security is one dimension of it |
| **Bandit** (Python), **gosec** (Go), **ESLint security plugins** (JS) | Language-specific, lighter-weight, easy first step |

### Example: Semgrep in CI

```yaml
# .github/workflows/sast.yml
name: SAST
on: [pull_request]

jobs:
  semgrep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Semgrep
        uses: semgrep/semgrep-action@v1
        with:
          config: >-           # p/ prefixes pull curated rule packs, no local rule authoring required to start
            p/owasp-top-ten
            p/secrets
        env:
          SEMGREP_RULES: "p/owasp-top-ten p/secrets"
```

### Example: a Semgrep finding

```python
# vulnerable code Semgrep would flag
query = f"SELECT * FROM users WHERE id = {user_id}"   # tainted input concatenated directly into SQL
cursor.execute(query)

# fix: parameterized query — the pattern SAST rules check you migrated to
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
```

SAST runs fast (seconds to a few minutes) and scans 100% of code paths since it doesn't need the app running — its weakness is that it can't see anything that only manifests at runtime (real HTTP responses, actual auth flows, live configuration).

---

## 2. DAST — Dynamic Application Security Testing

DAST scans a **running application** from the outside, the same way an attacker would: sending real HTTP requests, observing real responses, without any knowledge of the source code (black-box). It catches issues SAST structurally cannot see:

- Authentication/session bypass that only manifests through the actual request flow
- Misconfigured security headers (missing `Content-Security-Policy`, permissive CORS)
- Injection points only reachable through the live, wired-together application (not visible from a single file in isolation)
- Runtime misconfigurations (verbose error pages leaking stack traces, exposed debug endpoints)

### Common tools

| Tool | Notes |
|---|---|
| **OWASP ZAP** | Free, open source, has both a CLI ("baseline"/"full" scan modes) and CI-friendly Docker image |
| **Burp Suite** | Industry-standard for manual pentesting; Burp Suite Enterprise adds CI-automatable scanning |
| **Nuclei** | Fast, template-based scanner, good for known-CVE and misconfiguration checks against live targets |

### Example: OWASP ZAP baseline scan in CI

```yaml
# .github/workflows/dast.yml
name: DAST
on:
  workflow_dispatch:      # DAST needs a running app, typically run against a deployed staging env
                            # rather than on every PR — see §4 for why

jobs:
  zap-scan:
    runs-on: ubuntu-latest
    steps:
      - name: ZAP Baseline Scan
        uses: zaproxy/action-baseline@v0.12.0
        with:
          target: 'https://staging.example.com'   # scans a REAL, already-running deployment
          rules_file_name: '.zap/rules.tsv'         # optional: tune false positives / ignore specific rule IDs
          cmd_options: '-a'                          # include alpha-quality rules for broader coverage
```

### SAST vs DAST — why you need both

| | SAST | DAST |
|---|---|---|
| Target | Source code (static) | Running application (dynamic) |
| Knowledge of internals | White-box — sees the actual code | Black-box — sees only requests/responses |
| When it can run | Any time, no deployment needed — as early as a pre-commit hook | Requires a running instance (staging/deployed env) |
| Speed | Fast (seconds–minutes) | Slower (minutes–hours for a full crawl+scan) |
| Coverage | Every code path that exists in the repo | Only what's actually reachable/exercised at runtime |
| Finds | Insecure coding patterns, hardcoded secrets, unsafe API usage | Auth/session flaws, misconfigured headers, runtime-only injection, exposed endpoints |
| Blind spots | Runtime configuration, environment-specific issues, business-logic flaws | Code paths the crawler never reaches, anything requiring complex multi-step state |

They are complementary, not redundant — a mature pipeline runs both. SAST catches issues cheaply and early; DAST catches the class of issue that literally cannot exist until the application is assembled and running.

---

## 3. SCA — Software Composition Analysis

Most of a modern application's code is not code you wrote — it's dependencies. SCA scans your dependency tree (direct and transitive) against vulnerability databases (the NVD, GitHub Advisory Database, vendor feeds) and flags packages with known CVEs.

### Common tools

| Tool | Notes |
|---|---|
| **Snyk** | Broad language support, good remediation advice (suggests the minimum safe version bump), SaaS + CLI |
| **Dependabot** | Native to GitHub, opens PRs automatically for both version updates and security fixes — see [GitHub Actions secrets-and-security.md §4](../Continuous%20Integration/GithubActions/secrets-and-security.md) for its config |
| **OWASP Dependency-Check** | Free, open source, works offline against a local copy of the NVD feed, good for air-gapped environments |
| **npm audit / pip-audit / govulncheck** | Ecosystem-native, zero extra tooling, good baseline but usually less complete than dedicated SCA tools |

### Example: Snyk in CI

```yaml
# .github/workflows/sca.yml
name: SCA
on: [pull_request]

jobs:
  snyk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Snyk to check for vulnerabilities
        uses: snyk/actions/node@master     # language-specific action variant (node/python/golang/...)
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high   # only fail the build on HIGH/CRITICAL — see §severity policy below
```

### SAST vs DAST vs SCA — full comparison

| | SAST | DAST | SCA |
|---|---|---|---|
| Scans | Your own source code | A running application | Third-party dependencies |
| Finds | Insecure code patterns you wrote | Runtime-only vulnerabilities | Known CVEs in libraries you depend on |
| Needs a running app? | No | Yes | No |
| Typical CI stage | On every commit/PR | Against staging, less frequently (nightly/pre-release) | On every commit/PR, and on a schedule (new CVEs get disclosed for *existing* unchanged dependencies) |

---

## 4. Where Each Fits in a CI Pipeline

```yaml
# .github/workflows/ci.yml — annotated placement of each scan type
jobs:
  fast-checks:                # runs on EVERY push/PR — cheap, no deployment needed
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Secret scan            # §5 — must run first, before anything else touches the diff
        uses: gitleaks/gitleaks-action@v2
      - name: SAST
        uses: semgrep/semgrep-action@v1
        with:
          config: p/owasp-top-ten
      - name: SCA
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  build-and-deploy-staging:    # only after fast-checks pass
    needs: fast-checks
    runs-on: ubuntu-latest
    steps:
      - run: echo "build + push image + deploy to staging"
        # image scanning (Trivy/Grype) belongs HERE — see container-and-image-security.md

  dast:                         # runs against the now-deployed staging environment
    needs: build-and-deploy-staging
    runs-on: ubuntu-latest
    steps:
      - uses: zaproxy/action-baseline@v0.12.0
        with:
          target: 'https://staging.example.com'
```

Rule of thumb for ordering: **secret scanning and SAST run first** (fastest, no dependencies, catch the cheapest-to-fix issues) → **SCA** (still fast, no deployment) → **build/image scan** → **DAST** (needs a live deployed target, so necessarily runs last). See [security-in-cicd-pipelines.md](security-in-cicd-pipelines.md) for the fully assembled pipeline with fail/warn policy per stage.

---

## 5. Secret Scanning

Secrets committed to git (API keys, database passwords, private keys) are one of the most common and most damaging classes of leak — a single `git push` can expose a credential publicly (or to every contractor/employee with repo read access) within seconds.

### Tools

| Tool | Notes |
|---|---|
| **gitleaks** | Fast, regex + entropy-based detection, easy pre-commit and CI integration |
| **truffleHog** | Also verifies many secret types against the live provider API (confirms the key is *actually still valid*, not just pattern-shaped) |
| **GitHub secret scanning** | Native, runs automatically on public repos and (with GitHub Advanced Security) private repos, partners with providers to auto-revoke some leaked keys |

### Pre-commit hook — stop the secret before it's ever committed

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.4
    hooks:
      - id: gitleaks    # runs on every `git commit`, blocks the commit if a secret pattern is found
```

```bash
pip install pre-commit
pre-commit install          # wires the hook into .git/hooks/pre-commit
git commit -m "add config"  # gitleaks now scans staged changes before the commit is created
```

Pre-commit is the *cheapest possible place* to catch a secret — before it ever reaches a shared branch, a CI log, or a fork. CI-level secret scanning (as in the pipeline in §4) is the backstop for anyone who bypassed or doesn't have the pre-commit hook installed, not the primary control.

### If a secret DOES leak — rotate, don't just delete

A critical, frequently misunderstood point: **deleting a secret from git history does not undo the exposure.** Once a commit containing a secret has been pushed — even briefly, even if force-pushed over seconds later — that value may already have been:
- Cloned by anyone who pulled in that window
- Indexed by GitHub's own systems, forks, or third-party scrapers/bots that continuously monitor public pushes
- Cached in CI logs, PR diff views, or notification emails

```bash
# This does NOT make the leak safe — it only cleans up the repo going forward.
# The exposed value must be treated as compromised regardless.
git filter-repo --path secrets.env --invert-paths   # or BFG Repo-Cleaner
git push --force
```

**Correct incident response for a leaked secret:**
1. **Rotate/revoke the credential immediately** at the source (cloud provider, database, third-party API) — this is the only step that actually neutralizes the exposure.
2. Only *after* rotation, clean the git history (`git filter-repo`/BFG) to stop it from being casually re-discovered by future clones — treat this as hygiene, not remediation.
3. Check provider-side logs (CloudTrail, API access logs) for any usage of the credential during the exposure window — determine if it was actually used by someone unauthorized, not just theoretically exposed.
4. Add the pattern to your secret-scanning tool's rules if it was a custom format the scanner didn't already catch, and add pre-commit coverage if the leak happened without it.

History rewriting without rotation is a common mistake — it gives a false sense of resolution while the actual live credential remains valid and exploitable.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
