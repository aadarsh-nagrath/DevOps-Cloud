# Cloud Cost Optimization — Complete Notes

> Part of the [Cloud hub](../README.md). Full FinOps material: [`FinOps and Cost Optimization/`](../../FinOps%20and%20Cost%20Optimization).

---

## 1. Where cloud money goes
Compute (VMs, containers, serverless) → usually largest; **storage** (GB-month + requests + snapshots); **data transfer** (internet egress, cross-AZ, cross-region, NAT gateway processing); managed DB/analytics units; observability ingest (logs!); idle/forgotten resources; licenses; support plans.

## 2. The playbook (in order)
1. **Visibility & ownership** — mandatory tags/labels (`team`, `env`, `app`, `cost-center`) enforced by policy; cost allocation reports; showback/chargeback; budgets + anomaly detection.
   - AWS: Cost Explorer, Budgets, Cost Anomaly Detection, CUR/Data Exports, Cost Allocation Tags, Compute Optimizer, Trusted Advisor.
   - Azure: **Cost Management + Billing**, Budgets, **Advisor**, tags + Policy to enforce them.
   - GCP: Billing reports, **BigQuery billing export**, budgets & alerts, **Recommender** (idle VMs, rightsizing), labels.
2. **Eliminate waste** — idle VMs, unattached disks, old snapshots/AMIs, unused Elastic IPs/public IPs, idle load balancers, orphaned dev environments; schedule non-prod to stop nights/weekends.
3. **Rightsize** — match instance size/family to observed p95 usage; newer generations and Arm (Graviton / Azure Cobalt / Google Axion) give better price-performance; rightsize Kubernetes requests.
4. **Autoscale & go serverless where it fits** — scale to demand, scale to zero for spiky workloads.
5. **Purchase smarter** — commit only on the **rightsized baseline**: Savings Plans/RIs, Azure Reservations/Savings Plan, GCP CUDs (SUDs automatic); Spot for fault-tolerant work; Azure Hybrid Benefit for Windows/SQL licenses.
6. **Storage tiering** — lifecycle policies, Intelligent-Tiering/Autoclass, delete incomplete multipart uploads, gp2→gp3, archive old logs, compress.
7. **Network costs** — keep chatty services in the same AZ when safe, VPC/private endpoints instead of NAT for cloud APIs, CDN to cut origin egress, avoid cross-region traffic, compress responses.
8. **Architecture** — caching, async processing, right database for the job, reduce log verbosity, sample traces.
9. **Governance** — budgets per team, policies preventing expensive SKUs/regions, cost review in design docs, unit economics (cost per customer/request).

## 3. "Cut the bill by 40%" — interview-ready answer
Start with data not guesses: break down spend by service/team/env (top 10 line items usually = 80% of spend). Quick wins week 1: delete idle/orphaned resources, stop non-prod off-hours (~65% saving for those), gp3 migration, log retention. Weeks 2–4: rightsize top compute (Compute Optimizer/Advisor/Recommender), Kubernetes request tuning + bin-packing (Karpenter/cluster autoscaler), Spot for CI/batch/stateless, storage lifecycle, CDN/VPC endpoints for egress/NAT. Then lock in: Savings Plans/CUDs on the new lower baseline. Sustain: tagging enforcement, budgets and anomaly alerts, monthly FinOps review, cost dashboards per team. Never cut reliability blindly (keep multi-AZ for prod, headroom for SLOs).

## 4. Capacity planning
Forecast from historical usage + business growth; load test to find per-instance capacity; set autoscaling min/max and quotas; plan reserved capacity for baseline; keep headroom for AZ failure (N+1); review quarterly; watch service quotas (vCPU limits, IPs) — request increases before launches.
