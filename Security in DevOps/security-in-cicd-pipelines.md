# Security in CI/CD Pipelines

Pulling every control from this folder into one realistic, annotated pipeline — fail-vs-warn policy design, a practical gate rollout strategy, and a brief note on compliance-as-code.

---

## 1. Where Each Control Fits

| Control | Covered in | Pipeline stage | Needs a running app? |
|---|---|---|---|
| Secret scanning | [sast-dast-and-code-scanning.md §5](sast-dast-and-code-scanning.md) | Pre-commit, then every push/PR | No |
| SAST | [sast-dast-and-code-scanning.md §1](sast-dast-and-code-scanning.md) | Every push/PR | No |
| SCA (dependency scanning) | [sast-dast-and-code-scanning.md §3](sast-dast-and-code-scanning.md) | Every push/PR, plus scheduled (new CVEs on unchanged deps) | No |
| Image vulnerability scanning | [container-and-image-security.md §1](container-and-image-security.md) | After build, before push to registry | No (scans the built image) |
| SBOM generation | [container-and-image-security.md §3](container-and-image-security.md) | At build time, alongside the image | No |
| Image signing | [container-and-image-security.md §4](container-and-image-security.md) | After scan passes, before/at push | No |
| DAST | [sast-dast-and-code-scanning.md §2](sast-dast-and-code-scanning.md) | Against a deployed staging environment | Yes |
| Admission control (signature/CVE enforcement) | [container-and-image-security.md §5](container-and-image-security.md) | At deploy time, in-cluster | N/A — enforced at deploy, not in CI |

This repo's base GitHub Actions pipeline structure (jobs, `needs:`, artifact passing between jobs) is covered in [GitHub Actions reusable-workflows-and-cicd-patterns.md §2](../Continuous%20Integration/GithubActions/reusable-workflows-and-cicd-patterns.md) — the example below layers security scanning **on top of** that structure rather than re-explaining job dependencies, runners, or artifact mechanics from scratch.

---

## 2. Full Annotated Pipeline

```yaml
# .github/workflows/secure-pipeline.yml
name: Secure CI/CD Pipeline
on: [pull_request, push]

permissions:
  contents: read
  id-token: write          # required for OIDC-based cloud auth at deploy — see iam-and-least-privilege.md

jobs:
  # ── Stage 1: fast, no-deployment-needed checks — run on every push/PR ──
  fast-security-checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Secret scan
        uses: gitleaks/gitleaks-action@v2
        # BLOCKS on any finding — a leaked secret is never acceptable to warn-only on (§4)

      - name: SAST (Semgrep)
        uses: semgrep/semgrep-action@v1
        with:
          config: p/owasp-top-ten
        continue-on-error: true   # WARN-only initially — see rollout strategy in §4 before flipping to blocking

      - name: SCA (Snyk)
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=critical   # BLOCK only on CRITICAL to start; tighten over time

  # ── Stage 2: build the image, scan it, generate SBOM, sign it ──
  build-scan-sign:
    needs: fast-security-checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build image
        run: docker build -t myregistry/myapp:${{ github.sha }} .

      - name: Scan image (Trivy)
        run: |
          trivy image --severity CRITICAL --exit-code 1 myregistry/myapp:${{ github.sha }}
          # BLOCKS only on CRITICAL — HIGH findings are logged but don't fail the build yet (§4)
          trivy image --severity HIGH --exit-code 0 myregistry/myapp:${{ github.sha }}

      - name: Generate SBOM
        run: syft myregistry/myapp:${{ github.sha }} -o spdx-json > sbom.spdx.json

      - name: Push image
        run: docker push myregistry/myapp:${{ github.sha }}

      - name: Sign image (cosign, keyless via OIDC)
        run: cosign sign --yes myregistry/myapp:${{ github.sha }}
        # no signing key stored anywhere — identity comes from THIS job's OIDC token,
        # same underlying mechanism as the AWS OIDC example in iam-and-least-privilege.md §4

      - name: Attach SBOM as attestation
        run: cosign attest --yes --predicate sbom.spdx.json --type spdx myregistry/myapp:${{ github.sha }}

  # ── Stage 3: deploy to staging, then DAST against the real running app ──
  deploy-staging:
    needs: build-scan-sign
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy to staging
        run: kubectl set image deployment/myapp myapp=myregistry/myapp:${{ github.sha }} -n staging
        # in-cluster admission control (Kyverno/Gatekeeper — see container-and-image-security.md §5)
        # independently verifies the signature here too — CI passing is not the only enforcement point

  dast:
    needs: deploy-staging
    runs-on: ubuntu-latest
    steps:
      - name: DAST scan against staging
        uses: zaproxy/action-baseline@v0.12.0
        with:
          target: 'https://staging.example.com'
        continue-on-error: true   # WARN-only initially — DAST findings often need triage before blocking (§4)

  # ── Stage 4: production deploy — gated behind manual approval (see GitHub Actions secrets-and-security.md §5) ──
  deploy-production:
    needs: dast
    runs-on: ubuntu-latest
    environment: production   # required reviewers configured on this environment = human sign-off gate
    steps:
      - run: kubectl set image deployment/myapp myapp=myregistry/myapp:${{ github.sha }} -n production
```

---

## 3. "Fail the Build" vs "Warn Only" — Severity Policy

Not every finding should block a merge. A pipeline that blocks on every LOW-severity SAST hit or every non-critical dependency CVE trains developers to route around it (disable the check, ignore the bot, merge with `--admin`) rather than fix the underlying issue — which is worse for security than a calibrated policy.

| Severity | Typical policy | Reasoning |
|---|---|---|
| Critical | Block | Near-certain real exploitability; the cost of a false positive (an annoyed developer re-running CI) is far lower than the cost of shipping it |
| High | Block, once the pipeline is mature (see rollout below) | Usually genuine, but a new pipeline may have a backlog of these — block only after triage |
| Medium | Warn / track, don't block | Often real but lower urgency; blocking here tends to generate the most false-positive fatigue |
| Low / Info | Warn / track only, or ignore in CI entirely and surface in a dashboard | Rarely worth interrupting a merge for |

```yaml
# Pattern: block on the severities you've decided to enforce, warn (but still visibly report) on the rest
- run: trivy image --severity CRITICAL --exit-code 1 myapp:latest   # blocks
- run: trivy image --severity HIGH,MEDIUM --exit-code 0 myapp:latest  # reports, doesn't block
```

---

## 4. Rollout Strategy — Introducing Gates Without Breaking Everything

Turning on `--exit-code 1`-style hard gates against an **existing** codebase on day one almost always fails badly: the first scan surfaces months or years of accumulated findings, every open PR is suddenly blocked, and the team's response is usually to disable the check entirely rather than fix the backlog — which is a worse long-term outcome than rolling out gradually.

A practical sequence:

1. **Audit/warn-only mode first.** Run every new scanner in CI, publish results (PR comments, a dashboard, a Slack digest), but don't fail the build (`continue-on-error: true` / `--exit-code 0`). This establishes a baseline of what already exists without blocking anyone's work.
2. **Triage the backlog.** Sort findings by severity and exploitability, not just CVSS score alone. Fix or explicitly accept/suppress (with a documented reason and, ideally, an expiry/review date) each Critical and High finding.
3. **Block new findings, not old ones, first — "ratchet" enforcement.** Some tools support baselining: fail the build only on *newly introduced* findings, while the pre-existing backlog is tracked separately with its own burn-down. This lets teams merge normal work immediately while the backlog shrinks on its own timeline.
4. **Turn on hard blocking for Critical.** Once the Critical backlog is at zero (or has documented exceptions), flip that severity tier to `--exit-code 1`. This is usually a fast, low-friction step since Criticals are rare and usually clearly worth fixing.
5. **Progressively tighten to High, then Medium**, repeating steps 2–4 for each tier, on whatever cadence the team can actually absorb — weeks to months apart is normal, not a sign of moving too slowly.
6. **Revisit thresholds periodically.** A policy that was reasonable at rollout can be tightened once the team has caught up — treat the severity/fail policy as a living configuration, not a one-time decision.

The same staged approach applies to admission-control policies in Kubernetes (`Audit` mode before `Enforce` — see [container-and-image-security.md §5](container-and-image-security.md)) and to any new automated gate in general: **visibility before enforcement, backlog cleared before the gate goes hard, one severity tier at a time.**

---

## 5. Compliance-as-Code (Brief)

Rather than a manual audit periodically checking infrastructure/configuration against a standard (e.g., CIS Benchmarks, SOC 2 control requirements), **compliance-as-code** encodes those requirements as automated policy checks that run continuously — on every commit/PR/deploy rather than once a quarter.

```
Manual audit model:                    Compliance-as-code model:
  Auditor reviews config quarterly       Policy engine checks EVERY commit/deploy
  Findings reported weeks later           Findings surfaced in minutes, at the PR
  Drift between audits goes unnoticed     Drift is caught the moment it's introduced
```

Conceptually, tools like **OPA (Open Policy Agent)** and **Conftest** (OPA applied to config files/IaC) let you express a rule like "no S3 bucket may be publicly readable" or "every container must specify resource limits" as code, then run it as a CI gate the same way a SAST/SCA scan runs — a policy failure blocks the change the same way a critical CVE would.

This repo has (or may have, depending on when it was written) a dedicated **IaC Testing / Policy-as-Code**-type folder elsewhere with deeper OPA/Conftest/Rego coverage — treat this section as the conceptual pointer into that broader topic rather than the canonical reference; the CI/CD-pipeline-placement angle (compliance checks as just another pipeline gate, subject to the same fail/warn rollout logic as §3–§4) is this file's actual contribution.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
