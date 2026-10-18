# Cloud Architecture & Scenario Rounds (AWS / Azure / GCP) — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Notes: [Architecture Patterns](../Cloud/Fundamentals/08-cloud-architecture-patterns.md), [Cloud hub service mapping](../Cloud/README.md). These are the "design / what would you do" questions used in mid–senior cloud loops. Each answer gives a structure you can speak to in 5–10 minutes, with service picks for all three clouds.

---

## How to answer any design round (use this every time)
1. **Clarify requirements** — users & traffic (RPS, peak vs average), latency targets, data size & growth, consistency needs, availability target (SLO), RTO/RPO, compliance/data residency, budget, team skills, existing platform.
2. **Sketch the high-level flow** — client → edge (DNS/CDN/WAF) → LB → compute → data → async → observability.
3. **Pick services with reasons** — prefer managed; say *why* and what you trade off.
4. **Address the -ilities** — availability (AZs/regions), scalability, security (identity, network, data), cost, operations (CI/CD, IaC, monitoring).
5. **Call out failure modes and trade-offs** — what breaks first, how you'd detect and recover.
6. **Iterate** — "for v1 I'd do X; at 10× scale I'd add Y".

---

## Table of Contents
1. [Design a highly available API / web app](#1-design-a-highly-available-api--web-app)
2. [Design a scalable multi-tenant SaaS application](#2-design-a-scalable-multi-tenant-saas-application)
3. [Secure a multi-tier web application and its database](#3-secure-a-multi-tier-web-application-and-its-database)
4. [Design a CI/CD pipeline for cloud workloads](#4-design-a-cicd-pipeline-for-cloud-workloads)
5. [Design a data pipeline (batch + streaming)](#5-design-a-data-pipeline-batch--streaming)
6. [Design disaster recovery for a critical application](#6-design-disaster-recovery-for-a-critical-application)
7. [Cut the cloud bill by 40%](#7-cut-the-cloud-bill-by-40)
8. [Migrate a monolith to containers](#8-migrate-a-monolith-to-containers)
9. [Migrate an on-premises application to the cloud](#9-migrate-an-on-premises-application-to-the-cloud)
10. [Diagnose high latency in production](#10-diagnose-high-latency-in-production)
11. [Respond to a cloud security breach](#11-respond-to-a-cloud-security-breach)
12. [Highly available Kubernetes microservices](#12-highly-available-kubernetes-microservices)
13. [Design a multi-cloud architecture](#13-design-a-multi-cloud-architecture)
14. [Serverless event-driven file processing](#14-serverless-event-driven-file-processing)
15. [Global low-latency application](#15-global-low-latency-application)
16. [Centralized logging & security monitoring for many accounts](#16-centralized-logging--security-monitoring-for-many-accounts)
17. [Handle a traffic spike for a flash sale](#17-handle-a-traffic-spike-for-a-flash-sale)
18. [Choose a cloud provider for a new company](#18-choose-a-cloud-provider-for-a-new-company)

---

### 1. Design a highly available API / web app
**Clarify:** 99.9 vs 99.99%? Read/write ratio? Single region OK?
**Design (single region, 3 AZs):** DNS → CDN + WAF → L7 load balancer → stateless app tier autoscaled across 3 AZs → cache → managed relational DB with synchronous standby in another AZ + read replicas → object storage for files → queue for async work.
| Layer | AWS | Azure | GCP |
|---|---|---|---|
| Edge | Route 53, CloudFront, WAF, Shield | Azure DNS, Front Door + WAF | Cloud DNS, Cloud CDN, Cloud Armor |
| LB | ALB | Application Gateway / Front Door | Global external Application LB |
| Compute | ECS Fargate / EKS / ASG | App Service / Container Apps / AKS | Cloud Run / GKE Autopilot / regional MIG |
| Cache | ElastiCache (Valkey) | Azure Managed Redis | Memorystore |
| DB | Aurora Multi-AZ + replicas, RDS Proxy | Azure SQL zone-redundant / PostgreSQL Flexible HA | Cloud SQL HA (regional) / AlloyDB |
| Async | SQS + DLQ | Service Bus | Pub/Sub + DLQ |
**Key points:** health checks + autoscaling replace failures; stateless sessions; connection pooling; timeouts/retries with jitter and circuit breakers; multi-AZ NAT; IaC; SLO-based alerts. For 99.99%+ or regional failure tolerance → see #6 and #15.

### 2. Design a scalable multi-tenant SaaS application
- **Tenancy model:** pool (shared everything, tenant_id everywhere) for small tenants, silo (dedicated DB/account) for enterprise/regulated tenants — a **bridge** model supports both tiers.
- **Identity:** Cognito / Entra External ID / Identity Platform; JWT carries tenant ID and role; API gateway validates tokens and applies per-tenant rate limits/quotas.
- **Compute:** containers on EKS/AKS/GKE or serverless (Lambda/Container Apps/Cloud Run); namespaces or separate services per noisy/premium tenant.
- **Data isolation:** row-level security (Postgres RLS), partition key = tenant in DynamoDB/Cosmos DB/Firestore, IAM ABAC on tenant tags, separate DBs/encryption keys for silo tenants (per-tenant CMK).
- **Onboarding automation:** tenant provisioning pipeline (IaC + DB schema + DNS custom domain via CDN managed certs).
- **Observability & billing:** tenant dimension on metrics/logs/traces, per-tenant metering events → usage-based billing; cost per tenant.
- **Scale:** cell-based architecture (groups of tenants per cell) to limit blast radius; global routing to the tenant's home cell/region (data residency).
- **Ops:** feature flags per tenant, canary releases per cell, tenant-aware support tooling.

### 3. Secure a multi-tier web application and its database
- **Identity:** SSO + MFA for humans, roles/managed identities/service accounts for workloads, no long-lived keys, least privilege, JIT admin.
- **Network:** public subnets only for LB/NAT; app & DB in private subnets; security groups/NSGs/firewall rules chained (LB → app → DB port only); private endpoints for PaaS; egress filtering; no SSH/RDP from internet (SSM/Bastion/IAP).
- **Edge:** WAF managed rules + rate limiting, DDoS protection, TLS 1.2+ with managed certs, HSTS/security headers.
- **Database:** no public IP; encryption at rest with customer-managed key; TLS required; IAM/Entra DB auth instead of passwords (or secrets manager with rotation); least-privilege DB users; automated backups + PITR + cross-region copies; auditing (pgaudit, SQL auditing, Cloud SQL audit); separate read replica for analytics; deletion protection.
- **Detection & governance:** audit logs (CloudTrail/Activity Log/Audit Logs), threat detection (GuardDuty/Defender/SCC), posture (Security Hub/Defender CSPM/SCC), policy guardrails (SCP/Azure Policy/Org Policy), vulnerability scanning, incident runbooks.

### 4. Design a CI/CD pipeline for cloud workloads
1. **Source:** GitHub/GitLab/Azure Repos, trunk-based with short-lived branches, PR reviews, branch protection.
2. **CI:** lint, unit tests, SAST, dependency (SCA) scan, secret scan, build container once, scan image, generate SBOM, sign image (cosign), push to ECR/ACR/Artifact Registry with immutable tags.
3. **Infra:** Terraform/Bicep/CDK plan on PR → policy checks (Checkov/OPA) → apply after approval, per environment account/subscription/project.
4. **CD:** deploy the same artifact dev → staging → prod; Kubernetes via Argo CD/Flux (GitOps) or native (CodeDeploy blue/green for ECS, App Service slots/Container Apps revisions, Cloud Deploy canary for GKE/Cloud Run); automated smoke tests and canary analysis on SLO metrics; auto-rollback.
5. **Auth:** OIDC federation from CI to cloud (IAM role / federated credential / Workload Identity Federation) — no stored keys.
6. **Governance:** approvals for prod, audit trail, DORA metrics (deploy frequency, lead time, change failure rate, MTTR).

### 5. Design a data pipeline (batch + streaming)
- **Ingest:** streaming events → Kinesis/MSK | Event Hubs | Pub/Sub; batch files → S3 | ADLS | GCS; DB changes via CDC (DMS/Datastream/Debezium).
- **Process:** streaming → Managed Flink/Glue streaming | Stream Analytics/Fabric RTI | **Dataflow**; batch → Glue/EMR | Data Factory/Databricks/Fabric | Dataflow/Dataproc; handle late data with event-time windows and watermarks; dedupe with idempotent keys.
- **Store:** raw → curated → serving zones in the lake (Parquet/Iceberg/Delta), warehouse Redshift | Fabric/Synapse | **BigQuery**, partitioned and clustered.
- **Orchestrate & govern:** Airflow (MWAA/Composer) or Data Factory; catalog + lineage + quality (Glue Catalog/Lake Formation | Purview | Dataplex); PII tagging and masking.
- **Serve:** BI (QuickSight | Power BI | Looker), ML features, APIs.
- **Ops:** monitoring of lag/freshness/backlog, DLQs for bad records, replay capability from raw storage, cost controls (lifecycle, query limits).

### 6. Design disaster recovery for a critical application
1. **Business input:** RTO/RPO per tier (e.g. payments RTO 15 min / RPO ~0; reporting RTO 24 h).
2. **Pattern choice:** backup & restore (cheap, hours) → pilot light → warm standby (minutes) → active-active (near zero).
3. **Data replication:** Aurora Global DB / DynamoDB global tables | SQL auto-failover groups / Cosmos DB multi-region | Spanner multi-region / Cloud SQL cross-region replicas; object replication (CRR, GZRS, dual-region buckets); backups to a separate account with immutability.
4. **Compute & config:** IaC to deploy identical stacks; container images replicated; secrets/keys replicated; capacity/quotas reserved in DR region.
5. **Traffic failover:** Route 53 health checks/ARC | Front Door/Traffic Manager | global LB + Cloud DNS routing policies.
6. **Dependencies:** IdP, DNS, certificates, CI/CD, third-party APIs available from DR region.
7. **Runbooks & drills:** who declares, automated steps, comms, failback; quarterly game days measuring real RTO/RPO.
8. **Remember:** replication ≠ backup (ransomware/corruption replicates) — keep point-in-time immutable backups too.

### 7. Cut the cloud bill by 40%
1. **Week 1 — visibility:** break spend down by service/account/team/env with tags; find the top 10 line items (~80% of spend); set budgets and anomaly alerts.
2. **Quick wins:** delete idle/orphaned resources (unattached disks, old snapshots, idle LBs, unused IPs), schedule non-prod off nights/weekends (~65% saving on those), gp2→gp3 / right disk types, reduce log retention and debug logging.
3. **Rightsizing:** Compute Optimizer / Advisor / Recommender; Kubernetes request tuning + bin-packing (Karpenter/NAP); Arm instances (Graviton/Cobalt/Axion).
4. **Architecture:** Spot for CI/batch/stateless, serverless scale-to-zero for spiky services, caching/CDN to cut origin and egress, VPC/private endpoints to cut NAT charges, storage lifecycle/Intelligent-Tiering/Autoclass, BigQuery/Athena query hygiene.
5. **Commitments:** Savings Plans / Reservations / CUDs on the **new, lower** baseline only.
6. **Sustain:** tagging enforcement, showback per team, monthly FinOps review, unit economics, cost checks in design reviews.
**Guardrail:** don't remove prod multi-AZ, backups, or SLO headroom — show reliability metrics alongside savings.

### 8. Migrate a monolith to containers
1. **Containerize as-is:** Dockerfile, externalize config (env/secrets manager), logs to stdout, health endpoints, stateless (sessions to Redis, files to object storage).
2. **Run on a managed platform:** ECS Fargate/EKS | Container Apps/AKS | Cloud Run/GKE; CI/CD + IaC; same DB initially.
3. **Observability first:** metrics, tracing, logs — baseline before splitting.
4. **Strangler fig:** route selected paths through the gateway/LB to new services; extract bounded contexts with their own data stores; use events (SNS/SQS, Service Bus, Pub/Sub) for integration; anti-corruption layer.
5. **Data:** split schemas gradually; CDC to keep stores in sync during transition; avoid distributed transactions (sagas).
6. **Risks:** don't big-bang rewrite; watch latency from new network hops; invest in platform (templates, golden paths) before many services.

### 9. Migrate an on-premises application to the cloud
Assess (discovery tools, dependency mapping, utilization, TCO) → choose per-app 7-R strategy → build landing zone (Control Tower | Azure Landing Zones | Cloud Foundation) with hybrid connectivity (Direct Connect/ExpressRoute/Interconnect), identity sync/federation, logging, guardrails → pilot app → waves of tightly coupled apps → migrate servers (MGN | Azure Migrate | Migrate to VMs) and DBs with CDC (DMS | Azure DMS | Database Migration Service) and data (DataSync/Snowball | AzCopy/Data Box | Storage Transfer/Transfer Appliance) → test → cutover with rollback plan (DNS switch, freeze window) → decommission → optimize & modernize. Address licensing, IP plan, latency to remaining on-prem systems, security mapping, training, and dual-run costs.

### 10. Diagnose high latency in production
1. **Scope:** which endpoints/regions/tenants, p50 vs p99, since when, what changed (deploy, config, traffic, provider incident)?
2. **Golden signals per tier:** LB latency vs target latency (is it the app or before it?), error rates, saturation.
3. **Traces:** X-Ray / Application Insights / Cloud Trace — find the slow span (DB query, external API, cold start, lock contention).
4. **Resources:** CPU throttling, memory/GC, DB CPU/IOPS/connections/locks/slow queries (Performance Insights/Query Store/Query Insights), cache hit rate, queue backlog, throttling on managed APIs (DynamoDB/Cosmos RU/Lambda concurrency).
5. **Network:** cross-AZ/region calls, DNS, NAT port exhaustion, TLS handshakes, payload sizes.
6. **Mitigate:** rollback, scale out, add caching/CDN, add read replicas, fail over; then fix root cause (index, query, connection pooling, async processing, region placement) and add an alert/test so it's caught earlier.

### 11. Respond to a cloud security breach
1. **Detect & triage:** GuardDuty/Defender/SCC finding, unusual billing, leaked key report — confirm scope and severity, open incident, assign roles.
2. **Contain:** disable/rotate compromised credentials, revoke active sessions, quarantine instances (isolation security group), block attacker IPs, restrict via SCP/policy if needed; snapshot disks and preserve logs for forensics.
3. **Investigate:** audit logs (CloudTrail/Activity/Audit Logs) for the identity's actions, regions used, persistence (new users/keys/roles/functions), data accessed (S3/Blob/GCS data events, DB audit).
4. **Eradicate & recover:** remove persistence, rebuild from known-good IaC/images, restore clean data, rotate all potentially exposed secrets.
5. **Notify:** legal/compliance (GDPR 72 h), customers if required.
6. **Post-incident:** blameless review; enforce MFA, remove long-lived keys, add detections and guardrails, tabletop exercises.

### 12. Highly available Kubernetes microservices
- Managed cluster (EKS/AKS/GKE) with control plane HA; node pools across 3 zones; separate system and workload pools; autoscaling (HPA/KEDA + Karpenter/cluster autoscaler/NAP).
- Workloads: ≥3 replicas, topology spread constraints across zones, **PodDisruptionBudgets**, readiness/liveness/startup probes, resource requests/limits, graceful shutdown, priority classes.
- Traffic: cloud LB + Gateway API/Ingress; service mesh for mTLS, retries, timeouts, traffic splitting; global LB across clusters/regions for DR.
- Data: managed DBs outside the cluster (Multi-AZ); persistent volumes zone-aware (regional disks where supported); backups (Velero).
- Delivery: GitOps (Argo CD/Flux), progressive delivery (Argo Rollouts/Flagger), policy (Kyverno/Gatekeeper), image signing.
- Observability: Prometheus/managed Prometheus, logs, traces, SLO alerts; regular upgrade cadence via release channels.

### 13. Design a multi-cloud architecture
Start with **why** (regulation, M&A, best-of-breed services like BigQuery/Vertex, resilience, customer requirements) — avoid multi-cloud for its own sake. Then: common identity provider (Entra ID/Okta) federated into each cloud; private interconnect (Cross-Cloud Interconnect, partner fabrics, VPN) with non-overlapping IP plan; common platform layers (Kubernetes with GitOps, Terraform modules per cloud, OpenTelemetry → one observability backend); data strategy (which cloud owns which data; replication/egress costs; open formats like Parquet/Iceberg); unified security (CSPM across clouds — Defender/Wiz/Prisma, central SIEM); FinOps tooling normalizing billing (FOCUS spec). Accept per-cloud native services where they're the reason you're there.

### 14. Serverless event-driven file processing
User uploads via presigned URL / SAS / signed URL directly to object storage → event (S3 event/EventBridge | Event Grid | Eventarc/Pub/Sub notification) → queue for buffering and retries → function/container (Lambda | Functions | Cloud Run) processes (resize/OCR/scan) → results to object storage + metadata DB (DynamoDB | Cosmos DB | Firestore) → notify user (SNS/WebSocket | SignalR/Web PubSub | Pub/Sub/Firebase). Idempotent processing (object key + version as dedupe key), DLQ for failures, max concurrency to protect downstream, malware scanning before processing, lifecycle on originals, tracing across hops.

### 15. Global low-latency application
Anycast global entry (CloudFront + Global Accelerator | Front Door | Google global LB) → regional stacks in 3+ regions close to users → read-local data: globally replicated DB (DynamoDB global tables, Aurora Global reads | Cosmos DB multi-region writes | Spanner multi-region / Firestore) with an explicit consistency strategy (home-region writes per user, last-writer-wins, or strongly consistent global DB at higher write latency) → edge caching and edge compute for personalization → regional caches → async replication of non-critical data → data residency constraints respected by routing users to their legal region.

### 16. Centralized logging & security monitoring for many accounts
Organization-level audit logging (org CloudTrail | Activity Log diagnostic settings via Policy | aggregated org sink) into a dedicated, locked-down log archive (Object Lock / immutable storage / bucket lock); delegated admin for threat detection (GuardDuty/Security Hub | Defender for Cloud | SCC) in a security account/subscription/project; app/infra logs via OpenTelemetry/agents to central Log Analytics/OpenSearch/Cloud Logging buckets with retention tiers; SIEM (Security Lake/Splunk | Sentinel | Google SecOps) correlation; automated response (EventBridge+Lambda | Logic Apps playbooks | Pub/Sub+Cloud Run); access to logs least-privilege and itself audited; cost controls via filtering and tiering.

### 17. Handle a traffic spike for a flash sale
Pre-event: load test to 2–3× forecast, raise service quotas, scheduled scale-up and warm pools/min instances, pre-warm DB capacity (DynamoDB/Cosmos provisioned or on-demand, extra read replicas), cache product pages at CDN, feature-flag non-essential features off. During: queue orders (SQS/Service Bus/Pub/Sub) and process asynchronously, virtual waiting room for extreme peaks, WAF rate limiting and bot protection, inventory reservation with atomic conditional writes to avoid overselling, autoscaling on request count. After: scale down, review metrics and costs.

### 18. Choose a cloud provider for a new company
Evaluate against requirements, not hype: team skills and hiring market; workload fit (AWS breadth & maturity; Azure for Microsoft stack, Entra ID, hybrid, enterprise agreements; GCP for data/analytics/AI, Kubernetes, developer experience); regions needed for users and data residency; managed services you'll rely on (databases, AI); pricing and startup credits; compliance certifications; support and partner ecosystem; exit strategy. Recommend starting single-cloud with portable practices (containers, Terraform, OpenTelemetry, open data formats) to keep options open.
