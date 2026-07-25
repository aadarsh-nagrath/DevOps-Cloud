# IaC Testing & Policy as Code — Overview

Why infrastructure code needs the same testing discipline as application code, the testing pyramid applied to infrastructure, and a glossary for the rest of this folder.

---

## 1. Why IaC Needs Testing

A bad `terraform apply` can take down production exactly as effectively as a bad application deploy — it can delete a database, open a security group to the world, or replace a load balancer with zero downtime tolerance. The blast radius of infrastructure code is often *larger* than application code, because one Terraform change can simultaneously affect networking, compute, IAM, and data storage across an entire environment.

Despite this, IaC has historically been tested far less rigorously than application code. Common reasons this happens in practice:

- **"We'll just apply it and see."** This is a real and dangerous anti-pattern — treating `terraform apply` in a shared environment as the test. By the time the plan output is wrong, the damage may already be applied.
- IaC changes are often reviewed as a diff of HCL/YAML text, not as a diff of *behavior* — reviewers approve syntax they can read, not the actual infrastructure effect.
- Teams assume "it's just config, not real code" — but config with a Turing-complete-adjacent language (loops, conditionals, modules, dynamic blocks) has exactly the same failure modes as code: logic bugs, bad assumptions, untested edge cases.
- There's no equivalent of a unit test runner built into most IaC workflows by default, so testing has to be deliberately bolted on.

The practical fix is to apply the same rigor to IaC that's already standard for application code: static analysis, policy enforcement, automated testing of what a change actually does, and validation of the real result — all before a human ever manually eyeballs a `terraform apply` in production.

---

## 2. The Testing Pyramid, Applied to Infrastructure

The classic application testing pyramid (many fast unit tests at the base, fewer slow end-to-end tests at the top) maps directly onto IaC:

```
                    ▲
                   / \      Integration / E2E testing
                  /   \     (provision real infra, validate, tear down)
                 /-----\
                /       \   Plan / unit testing
               /         \  (validate what Terraform SAYS it will do)
              /-----------\
             /             \ Policy & compliance checks
            /               \ ("does this violate our rules?")
           /-----------------\
          /                   \ Static analysis & linting
         /_____________________\ (fmt, validate, TFLint, Checkov, tfsec)

         FAST / CHEAP  <-------------------->  SLOW / EXPENSIVE
```

| Layer | What it checks | Speed/cost | Trustworthiness |
|---|---|---|---|
| **Static analysis / linting** | Syntax, style, provider-specific mistakes (deprecated arguments, invalid instance types) | Seconds, free, runs locally | Catches surface issues only |
| **Policy / compliance checks** | "Does this violate our security/cost/tagging rules?" — evaluated against the plan or config before it's ever applied | Seconds, free/cheap | Catches known-bad patterns, doesn't prove correctness |
| **Plan / unit testing** | Validates what Terraform *says* it will do — resource counts, attribute values, output values — without necessarily touching real infrastructure | Seconds to low minutes | Good confidence, but a plan can still lie relative to real provider behavior |
| **Integration / end-to-end testing** | Actually provisions real (often ephemeral) infrastructure, asserts against it, tears it down | Minutes to tens of minutes, costs real cloud spend | Highest — this is the only layer that proves the infrastructure actually works |

The pyramid shape matters: run many cheap static/policy checks on every single commit, and reserve expensive full-apply integration tests for critical, reusable modules or pre-release validation — not every PR. See [`terraform-testing-frameworks.md`](terraform-testing-frameworks.md) for the concrete trade-off spectrum between plan review and Terratest.

---

## 3. Glossary

| Term | Definition |
|---|---|
| **Linting** | Automated checking of code style/syntax against a defined rule set (e.g. `terraform fmt`, TFLint) — fast, no execution required. |
| **Static analysis** | Broader than linting — analyzing code without running it to find bugs, security issues, or anti-patterns (e.g. Checkov, tfsec scanning for an open security group). |
| **Policy as Code** | Expressing organizational rules (security, compliance, cost, tagging) as code that's automatically evaluated against infrastructure changes, instead of relying on manual review or a wiki page nobody reads. See [`policy-as-code-with-opa-and-conftest.md`](policy-as-code-with-opa-and-conftest.md). |
| **Plan testing** | Validating the output of `terraform plan` (or its JSON representation) — either by human review or automated assertions — before anything is applied. |
| **Drift detection** | Identifying when real infrastructure state has diverged from what's declared in code, usually via a scheduled `terraform plan` that's expected to show no changes. See [`drift-detection-and-continuous-validation.md`](drift-detection-and-continuous-validation.md). |
| **Admission control** | A Kubernetes-native enforcement point where a policy engine (e.g. OPA Gatekeeper, Kyverno) can accept or reject a resource at the moment it's submitted to the cluster API, not just in CI. |
| **Shift left** | Catching problems as early as possible in the pipeline (ideally at commit/PR time) rather than at deploy time or, worst case, in production as an incident. |

---

## 4. Contents of This Folder

| File | Covers |
|---|---|
| [`linting-and-static-analysis.md`](linting-and-static-analysis.md) | `terraform fmt`/`validate`, TFLint, Checkov, tfsec, worked insecure-code example, pipeline placement |
| [`policy-as-code-with-opa-and-conftest.md`](policy-as-code-with-opa-and-conftest.md) | OPA, Rego from first principles, Conftest, OPA Gatekeeper, Kyverno, shift-left argument |
| [`terraform-testing-frameworks.md`](terraform-testing-frameworks.md) | `terraform plan` review, Terratest, native `terraform test`, module testing strategy |
| [`drift-detection-and-continuous-validation.md`](drift-detection-and-continuous-validation.md) | What drift is, detecting and preventing it, full combined pipeline example |

Related notes elsewhere in this repo: [`../Terraform and CF/terraform.md`](../Terraform%20and%20CF/terraform.md) for core Terraform syntax/workflow, [`../Continuous Integration/ci-fundamentals.md`](../Continuous%20Integration/ci-fundamentals.md) for general CI pipeline structure, [`../Kubernetes/K-pods.md`](../Kubernetes/K-pods.md) for pod resource concepts referenced by the Gatekeeper/Kyverno examples.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
