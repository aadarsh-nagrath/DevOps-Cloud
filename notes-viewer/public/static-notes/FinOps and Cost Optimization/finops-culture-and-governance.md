# FinOps Culture and Governance

Making cost optimization sustainable rather than a one-time cleanup sprint — the "Operate" phase of the FinOps Framework: embedding cost into engineering workflow, guardrails vs hard blocks, ownership, and a summary of common anti-patterns.

---

## 1. Why "Operate" Exists: Optimization Sprints Don't Stick

A common pattern: a team runs a focused cost-cutting sprint (right-sizing instances, buying commitments, tiering storage — see [compute-cost-optimization.md](compute-cost-optimization.md) and [storage-and-data-transfer-costs.md](storage-and-data-transfer-costs.md)), the bill drops noticeably, everyone moves on. Six months later the bill has crept most of the way back up — new services were provisioned with the same old default-oversized settings, nobody re-checked utilization, temporary environments from a project were never torn down.

This happens because the *optimization* was addressed but the *process that caused the waste in the first place* was not. The Operate phase of the FinOps Framework (see [finops-overview.md](finops-overview.md)) is specifically about embedding cost discipline into the everyday engineering workflow so it doesn't require a periodic dedicated cleanup effort to stay in check — cost awareness becomes a standing part of how infrastructure changes are made, reviewed, and owned.

---

## 2. Embedding Cost Awareness Into the Engineering Workflow

The highest-leverage place to catch a cost problem is **before** it's deployed, not after it's already accruing charges. This means treating a cost estimate as a normal part of code/infra review, the same way security or correctness review already is.

```bash
# Example: reviewing the cost delta of a Terraform plan before merging,
# using Infracost as part of a CI pipeline / PR check.
infracost breakdown --path . --format table
```

```
 Name                                Monthly Qty  Unit    Monthly Cost

 aws_instance.web (m5.4xlarge)              730  hours        $552.24
 aws_ebs_volume.data (500GB gp3)            500  GB             $40.00

 Monthly cost change: +$592.24 (up from $210.16 baseline on this branch)
```

```yaml
# Example: Infracost as a GitHub Actions PR check, so the cost delta shows
# up as a PR comment alongside the diff — reviewers see "this PR adds
# ~$592/mo" at the same time they see the code/infra change itself.
- name: Infracost comment
  uses: infracost/actions/comment@v3
  with:
    path: infracost.json
    behavior: update
```

The point isn't to block every cost increase — plenty of legitimate work costs more money. The point is that **the person approving the change should see the cost delta at decision time**, the same moment they're evaluating whether the change is otherwise sound, rather than discovering it as an unexplained bill increase weeks later with no clear link back to which change caused it.

---

## 3. Guardrails vs Hard Blocks

Not every cost control needs to be, or should be, a hard block. There's a spectrum, and picking the wrong point on it for a given situation causes real friction:

| Approach | Mechanism | Best for | Trade-off |
|---|---|---|---|
| **Documentation / convention** | Wiki page, onboarding doc | Low-stakes guidance, contextual judgment calls | Relies entirely on individuals remembering — the weakest control, tends to erode |
| **Guardrail (warn, don't block)** | CI check that comments/warns but doesn't fail the build | Cost increases that are often legitimate and need human judgment | Can be ignored/dismissed — needs a culture where warnings are actually read |
| **Hard block (policy-as-code)** | Admission control / CI gate that rejects the change outright | Well-understood, rarely-legitimate mistakes (e.g. launching an unapproved oversized instance type, missing required cost-allocation tags) | Needs to be genuinely reliable and well-scoped, or it becomes an obstacle people route around |

The general rule: **use a hard block for mistakes that are almost never intentional** (an untagged resource, a instance type nobody approved for this workload, a database accidentally provisioned without termination protection), and use a guardrail/warning for judgment calls that depend on context a policy engine can't fully evaluate (this specific cost increase might be totally justified by the feature being shipped).

```rego
# Example: a policy-as-code rule (Rego/OPA-style) blocking launch of an
# instance type outside an approved list — the "relying on individuals to
# remember every time" version of this rule fails the moment the team scales
# past a handful of people or onboards someone new.
package terraform.cost

deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_instance"
  not approved_instance_type(resource.change.after.instance_type)
  msg := sprintf("instance_type '%s' is not in the approved list for cost governance", [resource.change.after.instance_type])
}

approved_instance_type(t) {
  approved := {"t3.medium", "t3.large", "m5.large", "m5.xlarge"}
  approved[t]
}
```

The deeper mechanics of writing and enforcing policy-as-code rules like this (OPA/Conftest/Sentinel, admission controllers, CI gating) are covered in more depth in this repo's IaC Testing & Policy-as-Code notes — the point to take from this section specifically is *when* to reach for a hard block versus a softer guardrail in a cost-governance context, not the policy engine mechanics themselves.

---

## 4. "You Build It, You Own the Cost of It"

Most mature engineering orgs already operate on a "you build it, you run it" principle for reliability — the team that owns a service is also on-call for it, responsible for its uptime, and accountable when it breaks. FinOps governance works best when **cost ownership is treated as a natural extension of that same model**, rather than a separate concern owned only by a central finance or platform team.

Concretely, this means:
- A service's cost shows up in the owning team's dashboards and reviews, the same way its error rate and latency do (this requires the tagging/allocation groundwork in [cost-visibility-and-allocation.md](cost-visibility-and-allocation.md)).
- Cost regressions get triaged with the same seriousness as a latency regression, by the team that caused them — not routed to a central team to investigate and chase down the original author after the fact.
- Decisions about right-sizing, commitment purchases for a given workload, and storage tiering are made by the people who understand the workload's actual behavior (the owning team), informed by finance's broader forecasting — not made unilaterally by finance without engineering context, or unilaterally by engineering without visibility into committed-spend trade-offs.

A central FinOps/platform function still has an important role — building the tooling, negotiating enterprise-level commitment discounts, setting org-wide policy — but that's different from being the *sole* party responsible for noticing and fixing every instance of waste across every team's services. Centralizing all cost accountability in one small team doesn't scale past a handful of services, for exactly the same reason centralizing all on-call responsibility in one team doesn't scale.

---

## 5. Common Cost Anti-Patterns — Summary

A quick-reference table of the most common, highest-frequency sources of cloud waste. If a cost review doesn't turn up at least a few of these, it likely hasn't looked hard enough.

| Anti-pattern | Why it happens | Typical fix |
|---|---|---|
| Unattached/orphaned EBS volumes | Instance terminated but its volume wasn't (volumes aren't deleted by default) | Automated scan for unattached volumes past N days; set `DeleteOnTermination` by default |
| Idle load balancers | Service decommissioned, LB never cleaned up; LBs bill hourly even with zero traffic | Alert on LBs with near-zero request count over 30 days |
| Dev/staging environments running 24/7 | Provisioned like prod "for consistency," never scheduled down | Scheduled scale-to-zero / stop outside business hours (see autoscaling as a cost lever, [compute-cost-optimization.md](compute-cost-optimization.md)) |
| Oversized default instance types | Chosen out of caution ("let's not under-provision") rather than measurement | Right-sizing based on observed utilization (see [compute-cost-optimization.md](compute-cost-optimization.md)) |
| Forgotten proof-of-concept infrastructure | Spun up for a demo/spike, never torn down once the project concluded | Mandatory `expiry`/TTL tag on non-prod resources (see [cost-visibility-and-allocation.md](cost-visibility-and-allocation.md)), automated teardown on expiry |
| Untagged / unattributed resources | No enforcement at creation time | Policy-as-code block on missing required tags (section 3, above) |
| Unbounded snapshot/backup retention | Automation turned on once, retention never revisited | Explicit, deliberately-chosen retention policy — see [storage-and-data-transfer-costs.md](storage-and-data-transfer-costs.md) |
| Chatty cross-AZ/region service calls | Architected without AZ-affinity routing, cost invisible in compute/storage line items | Topology-aware routing, reduce call-chain depth — see [storage-and-data-transfer-costs.md](storage-and-data-transfer-costs.md) |
| Paying 100% on-demand for known steady-state workloads | Commitment purchase never revisited after initial launch | Reserved Instances / Savings Plans / CUDs sized to the usage floor (see [compute-cost-optimization.md](compute-cost-optimization.md)) |
| Unset or wildly overestimated Kubernetes resource requests | Copy-pasted defaults, never tuned against real usage | Right-size `requests`/`limits` against observed usage — see [compute-cost-optimization.md](compute-cost-optimization.md) and [../Kubernetes/K-pods.md](../Kubernetes/K-pods.md) |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
