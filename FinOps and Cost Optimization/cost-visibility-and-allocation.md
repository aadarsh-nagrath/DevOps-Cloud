# Cost Visibility and Allocation

Why you can't optimize what you can't see — tagging strategy, showback vs chargeback, native cloud cost tools, Kubernetes-granular visibility, and proactive budget alerts.

---

## 1. The Foundational Problem: An Unattributed Bill Is Unactionable

A single consolidated cloud bill — "$340,000 this month" — tells you almost nothing actionable. You can't answer any of the questions that actually drive a cost conversation:

- Which team/service is responsible for the spend?
- Is this growth proportional to business growth, or is it waste?
- Which environment (prod vs staging vs dev) is burning the budget?
- Did last week's deploy cause a cost regression, and whose deploy was it?

Without attribution, cost optimization becomes a guessing game, or worse, a blanket mandate ("everyone cut 15%") that punishes efficient teams equally with wasteful ones. **Visibility is the prerequisite for every other phase of FinOps** — this is why Inform is phase one of the framework, not an afterthought (see [finops-overview.md](finops-overview.md)).

---

## 2. Cost Allocation Tagging Strategy

Tagging is the mechanism that turns an opaque bill into a queryable, attributable dataset. Every resource should carry a minimum consistent set of tags:

| Tag key | Example value | Purpose |
|---|---|---|
| `team` / `owner` | `payments-platform` | Who is accountable for this resource's cost |
| `project` / `service` | `checkout-api` | What business function it serves |
| `environment` | `prod` / `staging` / `dev` | Separates steady-state cost from experimentation cost |
| `cost-center` | `CC-1042` | Maps to a finance budget line for chargeback |
| `expiry` / `ttl` (optional but high-value) | `2026-08-01` | Flags temporary infra so it doesn't become permanent by accident |

### Enforcing tagging discipline

Tagging only works if it's close to universal — a bill that's 60% tagged still leaves 40% as unattributed "mystery cost" that nobody owns and nobody is incentivized to clean up. Enforcement approaches, roughly in order of maturity:

```bash
# 1. Detect: query untagged resources (AWS example via Resource Groups Tagging API)
aws resourcegroupstaggingapi get-resources \
  --tag-filters Key=team \
  --resources-per-page 50 \
  --query 'ResourceTagMappingList[?TagList==`[]`]'   # resources with no tags at all
```

```hcl
# 2. Prevent at creation time: require tags in Terraform via a variable + validation
variable "required_tags" {
  type = map(string)
  validation {
    condition     = alltrue([for k in ["team", "environment", "cost-center"] : contains(keys(var.required_tags), k)])
    error_message = "Missing one of the required cost-allocation tags: team, environment, cost-center."
  }
}
```

```
# 3. Block at admission time (strongest guarantee): a policy-as-code rule that
# rejects any resource create/apply lacking the required tags. See
# finops-culture-and-governance.md for the guardrails-vs-hard-blocks discussion,
# and the sibling IaC Testing/Policy-as-Code notes elsewhere in this repo for
# the policy engine mechanics (OPA/Sentinel-style admission control).
```

Untagged resources are not a cosmetic problem — they are literally invisible in cost reports grouped by team/project, which means nobody is ever prompted to question whether they're still needed. This is one of the most common silent sources of long-run waste (see the anti-patterns table in [finops-culture-and-governance.md](finops-culture-and-governance.md)).

---

## 3. Showback vs Chargeback

Both are ways of attributing shared cloud spend back to the teams that generated it, but they differ in how "real" the attribution is:

| | Showback | Chargeback |
|---|---|---|
| What happens | Team sees a report/dashboard of what they cost | Team's budget is actually debited for what they cost |
| Money movement | None — informational only | Real internal transfer against a cost-center budget |
| Maturity required | Low — works even with partial tagging coverage | High — requires near-complete, accurate tagging and finance buy-in |
| Behavioral effect | Awareness, mild social pressure | Strong incentive — a real budget line is affected |
| Typical rollout stage | First step for most orgs | Adopted only after showback has proven the allocation data is trustworthy |

**Start with showback.** Rolling out chargeback before your tagging/allocation data is trustworthy causes real damage — teams get billed unfairly for shared infrastructure or mis-tagged resources, and it poisons trust in the whole FinOps initiative. Showback lets you validate that the numbers are right first, with no financial stakes attached, before making them "real" via chargeback.

---

## 4. Native Cloud Cost Tools

| Cloud | Primary tool | Detailed/raw data tool | Notes |
|---|---|---|---|
| **AWS** | Cost Explorer — UI for browsing/filtering spend by service, tag, account | Cost and Usage Report (CUR) — line-item-level CSV/Parquet export to S3, queryable via Athena | CUR is the ground truth; Cost Explorer is convenient for ad hoc exploration but samples/aggregates |
| **Azure** | Azure Cost Management + Billing | Cost Management data export to a Storage Account, or query via Azure Resource Graph | Integrated with Azure Policy for enforcing tag requirements (see [azure.md](../Cloud/AZURE/azure.md)) |
| **GCP** | Cost Table / Billing Reports in the console | Billing export to BigQuery — full line-item detail, SQL-queryable | The BigQuery export is widely considered the best-in-class raw cost data pipeline of the three, since it's immediately SQL-queryable without a separate ETL step |

All three follow the same pattern: a friendly console view for quick answers, and a raw, queryable export (CUR / Storage export / BigQuery) for building real dashboards, anomaly detection, or feeding a FinOps platform. If you're building any custom cost reporting, allocation logic, or unit-economics calculation, build it against the raw export, not the console UI — the console tools are not designed to be scripted against reliably.

```sql
-- Example: GCP BigQuery billing export — cost by team tag for the last 30 days
SELECT
  labels.value AS team,
  SUM(cost) AS total_cost
FROM `project.dataset.gcp_billing_export_v1`,
  UNNEST(labels) AS labels
WHERE labels.key = 'team'
  AND usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY team
ORDER BY total_cost DESC;
```

---

## 5. Third-Party FinOps Platforms: The Kubernetes Blind Spot

Native cloud billing tools show cost at the level cloud providers bill you: per VM/node, per disk, per load balancer. This is a real blind spot for anyone running Kubernetes, because **the cloud bill shows you the node cost, not which workload running on that node actually consumed the capacity.**

### Concrete example of the blind spot

Say a GKE cluster has 10 `n2-standard-8` nodes costing $3,200/month total. The GCP billing export shows exactly that: $3,200/month against the GKE cluster's resource. It does **not** tell you that:
- Namespace `checkout` is using 60% of that cluster's requested CPU/memory (~$1,920/month worth)
- Namespace `batch-jobs` is using 25% (~$800/month)
- Namespace `staging-experiments` — someone's forgotten proof-of-concept — is using 15% (~$480/month) and has had near-zero traffic for six weeks

The raw cloud bill has no concept of "namespace" or "Kubernetes workload" — it only sees the VM. Without workload-level attribution, that $480/month of dead weight in `staging-experiments` is invisible in every report, and stays invisible indefinitely.

**Kubecost** (and similar tools — OpenCost is the open-source/CNCF project it's built on) solves this specific gap: it observes actual CPU/memory requests and usage per pod/namespace/label, and allocates the node's real cloud cost down to that level, producing a per-namespace, per-deployment, even per-label cost breakdown that native billing tools structurally cannot produce.

```bash
# Install OpenCost (CNCF, the open-source core Kubecost is built on) via Helm
helm repo add opencost-charts https://opencost.github.io/opencost-helm-chart
helm install opencost opencost-charts/opencost --namespace opencost --create-namespace

# Query allocated cost by namespace for the last 7 days
curl "http://localhost:9003/allocation/compute?window=7d&aggregate=namespace"
```

Use a Kubernetes-cost tool whenever a meaningful share of your cloud spend runs on a shared cluster with multiple teams/namespaces — otherwise your tagging strategy (section 2) stops at the node boundary and everything inside the cluster stays a black box.

---

## 6. Budgets and Anomaly Alerts

The entire point of proactive budgeting is catching a runaway cost **before** it shows up as a surprise line on next month's invoice, not after.

```bash
# AWS Budgets — alert at 80% of a $50,000 monthly budget, and again if forecast exceeds it
aws budgets create-budget \
  --account-id 123456789012 \
  --budget '{
    "BudgetName": "monthly-prod-compute",
    "BudgetLimit": {"Amount": "50000", "Unit": "USD"},
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }' \
  --notifications-with-subscribers '[{
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80
    },
    "Subscribers": [{"SubscriptionType": "EMAIL", "Address": "platform-team@example.com"}]
  }]'
```

```bash
# GCP: budget alert with anomaly-style thresholds at 50/90/100% of a $20,000 budget
gcloud billing budgets create \
  --billing-account=XXXXXX-XXXXXX-XXXXXX \
  --display-name="prod-monthly-budget" \
  --budget-amount=20000USD \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0
```

Two complementary alert types worth setting up together:

- **Threshold budget alerts** (above) — fire when spend crosses a known, expected limit. Good for "are we on track."
- **Anomaly detection** (AWS Cost Anomaly Detection, Azure Cost Management anomaly alerts, GCP's budget forecast alerts) — use historical spend patterns to flag *unexpected* deviations even when you're still under the total budget. Good for catching something like a misconfigured autoscaler that 5x'd a service's compute cost overnight, which a static monthly threshold might not catch until much later in the month.

A budget alert that fires on day 3 of the month, when a runaway job has burned through 15% of the monthly budget already, is far more useful than discovering the same fact from the invoice on day 30 — by then the damage is both larger and already irreversible.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
