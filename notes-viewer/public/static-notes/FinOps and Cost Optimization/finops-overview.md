# FinOps Overview

What FinOps actually is, why cloud cost behaves fundamentally differently from traditional IT budgeting, and the operating framework (Inform, Optimize, Operate) that makes cost discipline sustainable.

---

## 1. What FinOps Actually Is

FinOps is **not** "cost cutting." It's a cultural and operational practice — a collaboration model between engineering, finance, and business/product teams — that brings financial accountability to the variable spend model of the cloud. The Linux Foundation-backed FinOps Foundation defines it as bringing financial accountability to the variable spend model of cloud, enabling distributed teams to make business trade-offs between speed, cost, and quality.

The goal is **maximizing business value per dollar spent**, not minimizing the dollar amount in isolation. A team that doubles cloud spend to ship a feature that triples revenue made a good FinOps decision. A team that cuts spend 50% by degrading reliability and losing customers made a bad one. FinOps exists to make that trade-off visible and deliberate, rather than accidental.

Three things FinOps is explicitly **not**:
- Not a one-time cost-cutting sprint (see [finops-culture-and-governance.md](finops-culture-and-governance.md) for why this matters).
- Not solely a finance/procurement function — engineers make the architectural decisions that determine the bill.
- Not just "buy Reserved Instances and call it done" — that's one tactic within the much larger practice (see [compute-cost-optimization.md](compute-cost-optimization.md)).

---

## 2. Why Cloud Cost Is a Fundamentally Different Problem Than On-Prem Budgeting

Traditional on-prem IT budgeting is a **CapEx** model: you buy hardware once or twice a year, depreciate it over 3-5 years, and the budget line is fixed and predictable regardless of how efficiently that hardware is actually used. An engineer provisioning a slightly-oversized on-prem server has no meaningful, immediate financial consequence — the hardware was already bought.

Cloud is an **OpEx**, pay-as-you-go model, and this changes the dynamics completely:

| Dimension | Traditional On-Prem (CapEx) | Cloud (OpEx) |
|---|---|---|
| Spend cadence | Fixed, annual/quarterly budget cycle | Continuous, accrues by the second/hour |
| Who influences cost | Procurement/finance, infrequently | Every engineer, on every commit/deploy |
| Feedback loop | Months (next budget cycle) | Near real-time (next day's bill line) |
| Cost of over-provisioning | Sunk — hardware already purchased | Ongoing — you keep paying for it every hour it exists |
| Granularity | Whole servers/racks | Per-resource, per-hour, sometimes per-request |
| Reversibility | Slow (hardware resale/repurposing) | Fast (terminate/resize in minutes) — but also fast to waste money if nobody's watching |

The critical shift: **cost is now an engineering-influenced, continuous variable**, not a finance-owned fixed line item. Choosing an oversized instance type, forgetting to tear down a test environment, or architecting chatty cross-AZ microservices (see [storage-and-data-transfer-costs.md](storage-and-data-transfer-costs.md)) all show up on next month's bill — sometimes next week's. This is a genuinely new dynamic that traditional IT financial processes were never built to handle, which is precisely the gap FinOps fills.

---

## 3. The FinOps Framework: Three Phases

The FinOps Foundation's framework describes a continuous, iterative lifecycle — not a linear project with an end date.

### Inform
Visibility into what's being spent, by whom, and on what. Without this phase nothing else is possible — you cannot optimize or govern spend you cannot see or attribute. This covers cost allocation, tagging, showback/chargeback, and dashboards. See [cost-visibility-and-allocation.md](cost-visibility-and-allocation.md).

### Optimize
Actively reducing waste and improving efficiency: right-sizing compute, buying commitment discounts for steady-state workloads, using spot capacity where appropriate, tiering storage, and trimming data transfer costs. See [compute-cost-optimization.md](compute-cost-optimization.md) and [storage-and-data-transfer-costs.md](storage-and-data-transfer-costs.md).

### Operate
Continuous governance so the gains from Optimize don't erode over time. This is the phase most teams skip — they run one cost-cutting sprint, feel good for a quarter, and then waste creeps back in because there's no process keeping it out. Operate embeds cost awareness into everyday engineering workflows: budgets, alerts, policy guardrails, and ownership. See [finops-culture-and-governance.md](finops-culture-and-governance.md).

```
  ┌──────────┐      ┌───────────┐      ┌──────────┐
  │  INFORM  │ ───▶ │ OPTIMIZE  │ ───▶ │ OPERATE  │
  │ visibility│      │ reduce    │      │ govern & │
  │ & alloc.  │      │ waste     │      │ sustain  │
  └────┬─────┘      └───────────┘      └────┬─────┘
       │                                     │
       └─────────────── feedback loop ───────┘
       (this repeats continuously, not once a year)
```

---

## 4. Who's Involved — It's Not Just Finance

A common misconception is that FinOps is a finance team function that hands engineering a spreadsheet of things to fix. In practice, effective FinOps requires three groups collaborating continuously:

- **Engineering** — makes the moment-to-moment architectural and operational decisions (instance sizing, autoscaling config, storage class, retry/backoff logic that affects egress) that actually determine the bill. Engineering owns the *how*.
- **Finance** — brings budgeting discipline, forecasting, unit economics analysis, and negotiates commitment discounts (Reserved Instances/Savings Plans/Committed Use Discounts) with cloud providers. Finance owns the *how much should this cost* and *are we predictable*.
- **Leadership/Product** — sets the business trade-off appetite (is this a growth-at-all-costs quarter, or a margin-discipline quarter?) and prioritizes cost-related engineering work against feature work.

A FinOps practice that's siloed in any one of these groups fails: finance-only produces reports nobody acts on; engineering-only produces point optimizations with no forecasting or context; leadership-only produces mandates ("cut cloud spend 20%") with no understanding of what's actually safe to cut.

---

## 5. Glossary

| Term | Definition |
|---|---|
| **Unit economics** | Cost normalized to a business metric — e.g., cost per customer, cost per API request, cost per transaction — rather than a raw dollar total. Lets you tell whether cost is growing because the business is growing (fine) or because of waste (not fine). |
| **Showback** | Reporting a team's/service's cloud cost to them for awareness, without actually moving money between budgets. Lightweight, low-friction first step. See [cost-visibility-and-allocation.md](cost-visibility-and-allocation.md). |
| **Chargeback** | Actually billing/allocating cost against a team's or business unit's budget, as if they were paying a real invoice internally. Drives much stronger behavioral incentives than showback, but requires accurate, complete cost allocation (tagging) to be fair — a harder bar to clear. |
| **Committed Use Discount (CUD)** | Umbrella term for committing to a certain level of usage over a term (1-3 years) in exchange for a discounted rate — AWS Reserved Instances/Savings Plans, Azure Reserved VM Instances, GCP Committed Use Discounts. See [compute-cost-optimization.md](compute-cost-optimization.md). |
| **Spot / Preemptible instances** | Spare cloud capacity sold at a steep discount (often 60-90% off on-demand), reclaimable by the provider with little notice (seconds to 2 minutes). Suited only to fault-tolerant, interruptible workloads. |
| **Cost allocation tags** | Key-value metadata (`team=payments`, `env=prod`, `cost-center=CC-1042`) attached to cloud resources so spend can be grouped and attributed. The entire foundation of the Inform phase. |
| **Right-sizing** | Matching provisioned capacity (instance type, pod resource requests, disk size) to actually-observed usage instead of a guessed or default size. |
| **Egress / data transfer cost** | Charges for data leaving a cloud provider's network (to the internet) or moving between zones/regions within it. Frequently underestimated. |
| **Anomaly detection / budget alert** | Automated notification triggered when spend crosses a threshold or deviates from a historical baseline, so surprises are caught in near-real-time instead of at month-end billing. |

---

## Contents of This Folder

1. [finops-overview.md](finops-overview.md) — this file: what FinOps is, why cloud cost is different, the Inform/Optimize/Operate framework, glossary.
2. [cost-visibility-and-allocation.md](cost-visibility-and-allocation.md) — tagging, showback vs chargeback, native cloud cost tools, Kubecost, budgets & anomaly alerts.
3. [compute-cost-optimization.md](compute-cost-optimization.md) — right-sizing, Reserved Instances/Savings Plans/CUDs, spot/preemptible instances, autoscaling as a cost lever, Kubernetes-specific cost tuning.
4. [storage-and-data-transfer-costs.md](storage-and-data-transfer-costs.md) — storage tiering, cross-AZ/region/internet egress costs, snapshot/backup accumulation, CDN as cost optimization.
5. [finops-culture-and-governance.md](finops-culture-and-governance.md) — the Operate phase, cost-aware code/infra review, policy guardrails, "you build it, you own the cost," anti-patterns summary table.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
