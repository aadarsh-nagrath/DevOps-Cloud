# Drift Detection & Continuous Validation

What configuration drift is, why it's dangerous, how to detect and prevent it, and a full combined pipeline tying this entire folder together.

---

## 1. What Configuration Drift Actually Is

**Drift** is when the real state of infrastructure diverges from what's declared in code. Terraform believes (via its state file) that a resource looks a certain way; the actual cloud resource has been changed to look different — and code and reality disagree.

Common causes:

- **Manual out-of-band changes** — someone opens the AWS console under time pressure during an incident and bumps an instance type, adds a security group rule, or changes an IAM policy directly, without ever touching the Terraform code.
- **CLI changes outside the IaC workflow** — a one-off `aws` CLI command run to "quickly fix" something.
- **External automated processes** — an autoscaler adjusting `desired_count`, a security tool auto-remediating a finding by mutating a resource directly, another team's automation touching a shared resource.
- **Provider-side changes** — some resource attributes can change on the provider side without any action by the account owner (e.g. AWS deprecating a default value).

---

## 2. Why Drift Is Dangerous

- **Your IaC becomes a lie about what's actually running.** Anyone reading the Terraform code to understand the infrastructure — a new team member, an auditor, an incident responder — is now working from inaccurate information.
- **The next `terraform apply` may have unexpected effects.** Terraform's plan is computed as a diff between desired state (code) and last-known state (state file) — not necessarily real-world current state, depending on when state was last refreshed. If a manually-changed attribute gets reverted by the next apply, that's a surprise change with real impact, potentially during an unrelated deploy.
- **Compliance and security assumptions quietly stop holding.** If a security group was declared to allow only port 443 and someone manually opened port 22 "temporarily," every compliance check, audit, and mental model based on the *declared* config is now wrong — until someone notices the drift, the org is running with a security posture nobody signed off on and nobody's tooling knows about.

---

## 3. Detecting Drift

The core technique: run `terraform plan` on a schedule, purely to detect unexpected diffs — **not to apply them**. A non-empty plan on a schedule means something diverged from code since the last known-good state.

### 3.1 Worked example: nightly drift-detection job

```yaml
# .github/workflows/drift-detection.yml (conceptual — see
# ../Continuous Integration/ci-fundamentals.md for general pipeline/trigger mechanics)

name: Nightly Drift Detection

on:
  schedule:
    - cron: "0 3 * * *"   # 3 AM daily — off-peak, doesn't compete with active deploys

jobs:
  detect-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Terraform init
        run: terraform init

      - name: Plan (detect-only, never apply)
        id: plan
        run: |
          terraform plan -detailed-exitcode -out=driftplan
          # -detailed-exitcode changes the exit code semantics:
          #   0 = no changes (no drift)
          #   1 = an error occurred
          #   2 = changes present (drift detected) — NOT treated as a failure here,
          #       it's the signal we're specifically looking for
        continue-on-error: true   # so exit code 2 doesn't kill the job before we can act on it

      - name: Alert on drift
        if: steps.plan.outcome == 'failure'   # triggered by the non-zero exit from exitcode 2
        run: |
          terraform show driftplan > drift_summary.txt
          # Send drift_summary.txt to Slack/PagerDuty/wherever the team actually
          # looks — the point is a human reviews the unexpected diff and decides:
          # reconcile via a real `apply`, or update the code to match a deliberate
          # manual change (and figure out why it bypassed the IaC workflow).
```

The critical detail: this job never runs `terraform apply`. Its only job is to surface unexpected diffs to a human — auto-applying on a schedule risks reverting a deliberate emergency fix that just hasn't been backported to code yet, which is its own kind of incident.

---

## 4. Preventing Drift in the First Place

Detection is a safety net; prevention is the actual goal. Two complementary layers:

1. **Discipline: never make manual console/CLI changes to IaC-managed resources.** This has to be a genuinely held team norm, not just a line in a wiki — "I'll just fix it in the console real quick" during an incident is exactly how drift creeps in, and it compounds because the next person doesn't know the console was touched.
2. **Technical enforcement, not just policy on paper: restrict console/CLI write access for IaC-managed resource types via IAM.** A policy that says "don't do X" without a technical control preventing X is optional under pressure. Concretely, this means scoping IAM permissions so that humans (as opposed to the CI/CD role that runs `terraform apply`) have read-only access to production resource types managed by Terraform, and mutating them requires going through the IaC pipeline. Break-glass emergency access should exist but should be logged, time-limited, and followed by a mandatory reconciliation step (either codify the emergency change or revert it) — not a silent, permanent bypass.

---

## 5. Full Combined Pipeline — Tying the Whole Folder Together

Bringing together linting, security scanning, policy checks, plan review, apply, and drift detection into one coherent pipeline:

```
1. terraform fmt -check -recursive   ┐
   terraform validate                │  STATIC ANALYSIS (fast, free, local or CI)
   tflint                            │  see linting-and-static-analysis.md
                                      ┘

2. checkov -d . / trivy config .     ┐  SECURITY SCAN
                                      │  catches known-bad patterns: unencrypted
                                      │  storage, open security groups, public buckets
                                      ┘  see linting-and-static-analysis.md

3. terraform plan -out=tfplan        ┐
   terraform show -json tfplan |     │  POLICY CHECK (Conftest/OPA)
     conftest test -                 │  catches ORG-SPECIFIC rules: tagging,
                                      │  allowed regions, cost thresholds, naming
                                      ┘  see policy-as-code-with-opa-and-conftest.md

4. terraform plan (human review)     ┐  PLAN REVIEW
   [+ terraform test, for critical   │  what WILL change — the last chance for a
      modules]                        │  human or automated assertion to catch a
                                      ┘  semantically wrong (but policy-valid) change
                                         see terraform-testing-frameworks.md

5. [MANUAL APPROVAL GATE]            —  a human explicitly approves the plan before
                                         apply — required for production-impacting
                                         changes regardless of how much automation
                                         precedes this step

6. terraform apply                   —  only reachable if steps 1-5 all passed;
                                         this is the only place real infrastructure
                                         changes happen

7. [SCHEDULED] drift-detection job   —  runs independently on a cron schedule,
   terraform plan -detailed-exitcode    completely decoupled from the deploy
   (never applies, only alerts)         pipeline above — its job is to catch
                                         anything that changed OUTSIDE this
                                         pipeline entirely
```

Why this order matters: static analysis and security scanning run first because they're the cheapest checks — no reason to wait for a full plan to catch a formatting error. Policy checks run against the actual plan (step 3) because org-specific rules like "no resources outside `us-east-1`" often need to see the concrete planned resource attributes, not just the raw HCL. Plan review comes after policy checks pass, because there's no point asking a human to review a plan that automated policy would have rejected anyway. The manual approval gate stays in place even with all this automation — automated checks catch *known* categories of problems; a human reviewing the actual plan is still the best defense against a *novel* mistake nothing was written to detect. And drift detection runs entirely outside this flow, on its own schedule, because its entire purpose is catching changes that never went through steps 1–6 at all.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
