# GCP Deep Dive — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Complements [10 — Azure & GCP core Q&A](./10-azure-and-gcp-qna.md) (no repeats). Notes: [`Cloud/GCP/`](../Cloud/GCP/gcp.md). Questions compiled from the common GCP banks (Hyring, SecondTalent, WeCreateProblems, Cloud Digital Leader topics) and answered here, with `gcloud` examples where interviewers expect them. Grouped **Junior → Mid → Senior**.

---

## Table of Contents
- [Junior Level (0–2 yrs)](#junior-level-02-yrs)
- [Mid Level (2–5 yrs)](#mid-level-25-yrs)
- [Senior Level (5+ yrs)](#senior-level-5-yrs)

---

## Junior Level (0–2 yrs)

### 1. What is GCP, and what does it offer?
Google Cloud Platform provides on-demand, usage-billed infrastructure and managed services on Google's global network: compute (Compute Engine, GKE, Cloud Run, App Engine), storage and databases (Cloud Storage, Cloud SQL, Spanner, Firestore, Bigtable, BigQuery), networking (global VPC, Cloud Load Balancing, CDN), data and AI (Pub/Sub, Dataflow, Vertex AI), and operations/security tooling. Interviewers want "rentable, API-driven infrastructure", not a product list.

### 2. Explain GCP projects, folders, organizations, and why the project matters.
Organization (your domain) → folders (departments/environments) → projects → resources. IAM policies and organization policies **inherit downward**. The **project** is the boundary for resources, IAM, billing linkage, quotas, and enabled APIs; everything belongs to exactly one project. Project ID is globally unique and immutable.

### 3. What is the difference between a region and a zone?
A region is a geographic location (e.g. `asia-south1`); zones (`asia-south1-a/b/c`) are isolated failure domains within it. Zonal resources (VMs, zonal disks) die with their zone; regional resources (regional MIGs, regional PD, Cloud SQL HA, regional buckets) survive a zone failure. Spread replicas across zones; use multiple regions for DR.

### 4. What is IAM in GCP, and how does it work?
An allow policy on a resource contains bindings of **members** (users, groups, service accounts, domains, federated principals) to **roles** (collections of permissions), optionally with **conditions**. Policies inherit from org → folder → project → resource, and effective access is the union. Practice least privilege with predefined roles at the narrowest scope.

### 5. What are the types of IAM roles in GCP?
**Basic** (Owner, Editor, Viewer — very broad, avoid in production), **predefined** (service-specific, Google-maintained, e.g. `roles/storage.objectViewer`), and **custom** (your own permission sets when predefined roles are too broad; you maintain them).

### 6. What is a service account, and how does it differ from a user account?
A service account is an identity for workloads (VMs, Cloud Run, GKE pods, pipelines), not people. It authenticates with short-lived tokens from the metadata server or via impersonation/federation, ideally never with downloaded keys. It's also a resource — granting `roles/iam.serviceAccountUser` lets someone act as it. `gcloud iam service-accounts create app-sa --display-name="App"`.

### 7. What is Compute Engine?
GCP's IaaS VMs — the most control (you own the OS, patching, scaling). Predefined or **custom machine types**, Spot VMs, live migration during maintenance, Persistent Disk/Hyperdisk/Local SSD. `gcloud compute instances create web-1 --machine-type=e2-medium --zone=asia-south1-a`.

### 8. How do you create a custom machine type?
Choose exact vCPUs and memory for N/E families instead of predefined shapes, paying only for what you need: `gcloud compute instances create app-1 --custom-cpu=6 --custom-memory=24GB --zone=asia-south1-a` (or `--machine-type=n2-custom-6-24576`). Extended memory is available beyond the default per-vCPU ratio.

### 9. What are the main ways to run compute on GCP?
From most control to least: **Compute Engine** (VMs) → **GKE Standard** → **GKE Autopilot** → **Cloud Run** (serverless containers) → **App Engine** (PaaS) → **Cloud Run functions** (event-driven functions). Pick the most managed option that meets the requirements.

### 10. What is Cloud Run, and when would you use it?
A fully managed platform that runs stateless containers on demand: request-driven autoscaling including scale to zero, per-100 ms billing, revisions with traffic splitting, HTTPS endpoints, jobs for batch, worker pools for background consumers. Ideal for APIs, web apps, and event handlers with variable traffic. `gcloud run deploy web --image=IMAGE --region=asia-south1`.

### 11. What are Cloud Functions (Cloud Run functions)?
Event-driven, single-purpose functions (HTTP, Pub/Sub, Cloud Storage, Eventarc events) where you write only the function and Google builds the container. Renamed **Cloud Run functions** in 2024 — they deploy as Cloud Run services. Use for glue code; use Cloud Run when you need a full containerized service.

### 12. What is App Engine?
A PaaS where you deploy code and Google manages servers and scaling. **Standard** environment: sandboxed runtimes, fast scaling to zero. **Flexible** environment: Docker containers on VMs, no scale to zero. Supports versions and traffic splitting (`gcloud app deploy`, `gcloud app services set-traffic`). For new apps Cloud Run is usually preferred.

### 13. What is Cloud Storage, and what are its storage classes?
Object storage with buckets and objects, 11-nines durability, strong consistency. Classes: **Standard** (hot), **Nearline** (≥30 days, ~monthly access), **Coldline** (≥90 days, ~quarterly), **Archive** (≥365 days, ~yearly). All return data in milliseconds; colder classes are cheaper to store but charge retrieval and early-deletion fees. **Autoclass** manages classes automatically.

### 14. What is a bucket, and how do you upload data to Cloud Storage?
A bucket is a globally uniquely named container with a location (region, dual-region, multi-region) and default storage class. Upload via console, `gcloud storage cp file gs://bucket/` (or `rsync` for directories), client libraries, resumable uploads for large files, Storage Transfer Service for other clouds/on-prem, Transfer Appliance for offline bulk transfer.

### 15. What is the difference between Cloud Storage and a Persistent Disk?
Cloud Storage is object storage accessed via API, unlimited, shareable globally. Persistent Disk is block storage attached to VMs (formatted with a filesystem), low latency, zonal or regional. Use GCS for files/backups/data lakes; PD for OS and database disks.

### 16. What's the difference between Persistent Disk and Local SSD?
Persistent Disk is network-attached, durable, snapshot-able, resizable, and detachable. Local SSD is physically attached NVMe with much higher IOPS and lower latency but **ephemeral** — data is lost when the VM stops or is deleted. Use Local SSD for caches, scratch space, or databases that replicate data themselves.

### 17. What is a VPC in GCP?
A virtual network that is **global**, with **regional subnets** — one VPC can span all regions without peering. Use custom-mode VPCs in production with planned CIDRs; firewall rules, routes, Cloud NAT, and Private Google Access are configured per VPC/subnet.

### 18. How do firewall rules work in a GCP VPC?
Stateful rules applied VPC-wide with direction, priority (0–65535, lower wins), allow/deny action, and targets selected by **network tags** or **service accounts**. Implied rules deny all ingress and allow all egress. `gcloud compute firewall-rules create allow-https --network=prod-vpc --target-tags=web --rules=tcp:443 --source-ranges=0.0.0.0/0`. Prefer service-account targets and hierarchical firewall policies at org/folder level.

### 19. What is BigQuery?
Google's serverless, columnar data warehouse for analytics on terabytes–petabytes using SQL, with storage and compute separated, on-demand (per TB scanned) or capacity (slots/editions) pricing, built-in ML (BigQuery ML), and streaming ingestion. It's for analytics (OLAP), not transactional workloads.

### 20. What is Cloud SQL, and how does it differ from BigQuery?
Cloud SQL is managed MySQL/PostgreSQL/SQL Server for OLTP — transactions, single-row reads/writes, application backends. BigQuery is OLAP — large analytical scans and aggregations. Typical pattern: app writes to Cloud SQL, data replicates (Datastream) to BigQuery for reporting.

### 21. What is the gcloud CLI, and what do you use it for?
The command-line interface (part of the Google Cloud SDK) to manage resources and automate tasks: `gcloud config set project my-proj`, `gcloud config configurations create prod` for multiple contexts, `gcloud auth login` / `gcloud auth application-default login`, plus `gcloud storage`, `bq` for BigQuery, and `kubectl` for GKE. Cloud Shell gives a browser terminal with everything pre-installed.

### 22. What is Pub/Sub, and when would you use it?
A global, serverless messaging service for asynchronous, decoupled communication: publishers send to topics, subscribers receive via subscriptions (pull, push, or export to BigQuery/GCS). Delivery is at-least-once by default. Use for event fan-out, buffering spikes, streaming ingestion into Dataflow/BigQuery, and decoupling microservices.

### 23. What is Firestore?
A serverless NoSQL document database (collections → documents) with strong consistency, ACID transactions, automatic scaling and multi-region replication, real-time listeners and offline SDKs for mobile/web (**Native mode**), or **Datastore mode** for server workloads using the Datastore API.

### 24. How do you monitor resources on GCP?
Cloud Monitoring (metrics, dashboards, uptime checks, alerting policies, SLOs), Cloud Logging (Logs Explorer, log-based metrics, sinks), Cloud Trace and Profiler for application performance, Error Reporting, and the Ops Agent on VMs for system metrics/logs. Managed Service for Prometheus for Kubernetes metrics.

### 25. What is GCP's billing structure?
A Cloud Billing account (linked to a payment profile) pays for one or more projects; usage is metered per resource (per-second VMs, GB-month storage, operations, network egress). Discounts: sustained use (automatic), committed use, Spot. Control with budgets and alerts, labels, and billing export to BigQuery for analysis.

---

## Mid Level (2–5 yrs)

### 26. What is GKE, and what does it manage for you?
Google Kubernetes Engine runs the Kubernetes control plane (API server, etcd, scheduler — upgraded, scaled, and backed up by Google) and integrates node management (auto-upgrade, auto-repair, node auto-provisioning), VPC-native networking, Cloud Load Balancing, Workload Identity, logging/monitoring, and security features. In Autopilot mode Google also manages the nodes.

### 27. What is the difference between GKE Autopilot and Standard mode?
**Autopilot**: Google manages nodes, scaling, and hardening; you pay **per Pod resource request**; fewer knobs (no privileged pods or node SSH). **Standard**: you manage node pools (machine types, autoscaling, upgrades) and pay **per node** whether used or not; full control for GPUs, kernel tuning, privileged workloads. Default to Autopilot; Standard clusters can now run some workloads in Autopilot mode via ComputeClasses.

### 28. When would you choose Cloud Run vs GKE vs Compute Engine?
Choose the most managed option that fits. **Cloud Run** for stateless HTTP/event services, spiky traffic, small teams (jobs for batch). **GKE** for many services needing Kubernetes APIs (StatefulSets, DaemonSets, operators, service mesh), portability, or fine scheduling control. **Compute Engine** for full OS control, licenses bound to VMs, special kernels/drivers, Windows apps, or lift-and-shift. State each trade-off: control vs ops effort vs cost model.

### 29. How do Cloud Run concurrency and autoscaling work?
Concurrency is the maximum number of simultaneous requests one instance handles (default 80, up to 1000) — a ceiling, not a target. Cloud Run adds instances when concurrency or CPU utilization approaches limits and scales to zero when idle. Set concurrency to 1 for non-thread-safe code, use **min instances** to avoid cold starts, and **max instances** to protect downstream databases.

### 30. Walk me through deploying and rolling back a service on Cloud Run.
Build and push the image to Artifact Registry, then `gcloud run deploy web --image=...:v2 --no-traffic --tag=canary` to create a new revision without traffic; shift a portion with `gcloud run services update-traffic web --to-tags=canary=10`, watch errors and latency, then go to 100%. **Rollback is a traffic change**: `gcloud run services update-traffic web --to-revisions=web-00041-xyz=100` — revisions are immutable, so the old version is still there.

### 31. What is Workload Identity (Federation) for GKE, and why use it?
It lets Kubernetes service accounts get IAM identities so pods call Google APIs with **short-lived federated tokens** exchanged via the GKE metadata server and STS — no service account key files in Secrets. You grant IAM roles directly to the KSA principal (or bind it to a Google service account). Benefits: no long-lived secrets, per-workload least privilege, audit.

### 32. Explain Workload Identity Federation and why it's preferred over exported service account keys.
WIF lets external workloads (GitHub Actions, AWS, Azure, on-prem OIDC/SAML) exchange their own identity tokens for short-lived Google credentials through a **workload identity pool and provider**, with attribute mappings and conditions (e.g. only a given repo/branch). Keys are long-lived secrets that leak, need rotation, and can't be scoped by context; WIF eliminates them, limits blast radius, and is fully audited. Enforce with org policy `iam.disableServiceAccountKeyCreation`.

### 33. What are the load balancing options in GCP?
Application load balancers (L7 HTTP/S): global external, regional external, internal (regional and cross-region). Network load balancers (L4): **proxy** (TCP/SSL, terminates connections) and **passthrough** (TCP/UDP, preserves client IP), external or internal. Sort by layer, external vs internal, global vs regional. The global external Application LB gives one anycast IP with backends in many regions plus Cloud CDN, Cloud Armor, and IAP.

### 34. What is GCP's global load balancer, and how is it different from AWS/Azure?
The global external Application LB uses a single anycast IP announced from Google's edge; users connect to the nearest point of presence and are routed over Google's backbone to the closest healthy backend in any region, with automatic cross-region failover — no DNS-based tricks. AWS/Azure typically combine regional LBs with DNS routing (Route 53/Traffic Manager) or a separate global service (Global Accelerator/Front Door).

### 35. What is Cloud NAT, and when do you need it?
Managed, software-defined NAT giving instances, GKE nodes, and serverless (Direct VPC egress) **outbound-only** internet access without external IPs — e.g. pulling packages or calling third-party APIs. It's regional, configured on a Cloud Router, with static or automatic IPs and port allocation settings.

### 36. What is Private Google Access, and how is it different from Cloud NAT?
PGA, enabled per subnet, lets VMs without external IPs reach **Google APIs and services** (Cloud Storage, BigQuery, Artifact Registry) over internal routing. Cloud NAT is for general internet egress. You often enable both; with VPC Service Controls use the `restricted.googleapis.com` VIP. Private Service Connect provides private endpoints for Google APIs and producer services.

### 37. What is a managed instance group, and how does autoscaling work?
A MIG runs identical VMs from an instance template; **regional MIGs** spread across zones. Autoscaling adds/removes VMs based on CPU, load balancer serving capacity, custom metrics, or schedules (with predictive mode). It also provides autohealing via health checks and rolling/canary updates. Comparable to a Kubernetes Deployment + HPA. `gcloud compute instance-groups managed set-autoscaling web-mig --region=asia-south1 --min-num-replicas=2 --max-num-replicas=10 --target-cpu-utilization=0.6`.

### 38. What are Spot VMs (and preemptible VMs), and when do you use them?
Spare capacity at up to ~91% discount that Google can reclaim at any time with a 30-second notice. Spot VMs have no maximum runtime, unlike legacy preemptible VMs (24-hour limit). Use only for interruption-tolerant work: batch, CI, rendering, stateless workers in MIGs, Dataproc secondary workers — never single-instance databases.

### 39. How do committed use discounts and sustained use discounts work?
**Sustained use discounts** apply automatically to certain VM families the longer they run in a month. **Committed use discounts** give larger discounts for a 1- or 3-year commitment — resource-based (vCPU/memory in a region) or flexible spend-based. Rightsize first, then commit only to the stable baseline.

### 40. What are IAM conditions, and how do they tighten access?
CEL expressions on role bindings that limit when/where a role applies, e.g. temporary access (`request.time < timestamp("2026-11-01T00:00:00Z")`), access to objects with a name prefix (`resource.name.startsWith("projects/_/buckets/data/objects/teamA/")`), or resources with certain tags. They reduce the need for custom roles, though not every service supports every attribute.

### 41. How do you manage secrets on GCP?
**Secret Manager**: store secrets as versions, grant `roles/secretmanager.secretAccessor` per secret to the workload's service account, pin versions in production, enable rotation schedules, use CMEK and replication policies, and audit access. Cloud Run/GKE can mount secrets as env vars or files. Better: avoid secrets with IAM database authentication and Workload Identity Federation. `gcloud secrets create db-pass --data-file=-`, `gcloud secrets versions access latest --secret=db-pass`.

### 42. What is Cloud Monitoring and Cloud Logging, and how do they work together?
Logging collects and stores logs (routed by the Log Router via sinks to buckets, BigQuery, Pub/Sub); Monitoring stores metrics, dashboards, uptime checks, SLOs, and alerting policies. **Log-based metrics** turn log patterns into metrics for alerting, and Cloud Trace adds request-level latency. Together they form the Cloud Operations suite (formerly Stackdriver).

### 43. How do you provision GCP infrastructure as code?
Terraform (google/google-beta providers) with remote state in a GCS bucket (versioned, locked), separate state per environment, modules (Cloud Foundation Fabric), CI running `plan` on PR and `apply` after approval with a deployer service account via WIF. **Infrastructure Manager** runs Terraform as a managed service. Deployment Manager reached end of support (March 2026) — migrate to Terraform by importing resources and confirming a no-change plan.

### 44. What is Cloud CDN, and how does it fit with load balancing?
Cloud CDN caches content at Google's edge for backends of the global external Application Load Balancer (MIGs, Cloud Storage buckets, Cloud Run, custom origins). You enable it on the backend service/bucket, choose a cache mode, configure cache keys and TTLs, and invalidate when needed. Signed URLs/cookies protect private content.

### 45. What are organization policies, and how do they differ from IAM?
Organization policies constrain **what configurations are allowed** (e.g. no service account keys, no external IPs on VMs, allowed regions, uniform bucket-level access, domain-restricted sharing), inherited down the hierarchy. IAM controls **who can perform actions**. A project owner still can't create an external IP if the org policy forbids it.

### 46. How do you connect an on-prem network to a GCP VPC?
**HA VPN** (IPsec over internet, 99.99% SLA with redundant tunnels) for quick or modest bandwidth; **Dedicated Interconnect** (10/100 Gbps direct links at colocation facilities) or **Partner Interconnect** (via provider, 50 Mbps–50 Gbps) for private, high-bandwidth, steady-latency connectivity. **Cloud Router** exchanges routes via BGP. Add hybrid DNS (forwarding zones, inbound server policies).

### 47. What is Shared VPC, and how does it compare with VPC peering?
In Shared VPC, a **host project** owns the VPC and subnets, and **service projects** deploy resources into those subnets — central network/firewall control by a network team with project-level isolation and billing for app teams. VPC peering connects two separately administered VPCs; it's non-transitive and requires non-overlapping ranges. Shared VPC is the standard enterprise pattern; peering is for connecting separate orgs or a few VPCs.

### 48. Explain Cloud Armor.
WAF and DDoS protection attached to external load balancers via security policies: IP/geo rules, custom CEL rules, preconfigured OWASP rules (SQLi, XSS, LFI, RCE), rate limiting and rate-based bans, bot management with reCAPTCHA, Adaptive Protection (ML-based L7 DDoS detection), and threat intelligence lists. It protects only traffic through supported load balancers.

### 49. What is the Identity-Aware Proxy (IAP)?
IAP verifies a user's identity and IAM permissions (plus context like device) before requests reach applications behind HTTPS load balancers, App Engine, or Cloud Run — zero-trust access without a VPN. **IAP TCP forwarding** lets admins SSH/RDP into VMs without public IPs: `gcloud compute ssh vm-1 --tunnel-through-iap`.

### 50. Explain Cloud Storage lifecycle rules, signed URLs, and object versioning.
**Lifecycle rules** transition (`SetStorageClass`) or delete objects by age, version count, or other conditions — e.g. Nearline after 30 days, delete noncurrent versions beyond 3. **Signed URLs** grant time-limited access to a specific object for anyone holding the URL (V4 maximum 7 days), signed by a service account — great for direct uploads/downloads. **Object versioning** keeps noncurrent generations when objects are overwritten or deleted; combine with lifecycle to control cost, and soft delete/Bucket Lock for protection.

### 51. Compare Cloud SQL, AlloyDB, Firestore, Bigtable, Spanner, and BigQuery.
**Cloud SQL**: managed MySQL/Postgres/SQL Server for standard OLTP. **AlloyDB**: high-performance Postgres-compatible with columnar engine for HTAP. **Firestore**: serverless document DB for mobile/web/app data. **Bigtable**: wide-column NoSQL for massive, low-latency key-based time series/IoT. **Spanner**: horizontally scalable, globally consistent relational DB with 99.999% multi-region SLA. **BigQuery**: serverless analytics warehouse.

### 52. How do you configure high availability for Cloud SQL?
Create a **regional** instance (`--availability-type=REGIONAL`): a primary and a standby in different zones with synchronous replication to regional persistent storage, automatic failover on zone or instance failure (connection name stays the same). Add read replicas for scaling, cross-region replicas for DR (promote on regional failure), automated backups with PITR, maintenance windows, and consider Enterprise Plus for 99.99% SLA and near-zero-downtime maintenance.

### 53. What is the Cloud SQL Auth Proxy?
A local process (or language connector library) that creates an encrypted, IAM-authorized tunnel to a Cloud SQL instance using short-lived certificates — no need to manage authorized networks or SSL certificates. Common as a sidecar in GKE or with Cloud Run's built-in Cloud SQL connection. Can also use IAM database authentication.

### 54. What is Bigtable, and how should you design row keys?
A wide-column NoSQL database for very high read/write throughput at low latency on huge datasets (time series, IoT, ad-tech, financial ticks). Rows are sorted by row key — the only index — so key design determines performance: avoid monotonically increasing keys like timestamps at the start (hotspots), use field promotion (`deviceId#reverseTimestamp`), salting, and keep related data contiguous. Not for joins, multi-row transactions, or ad hoc SQL.

### 55. Firestore Native mode vs Datastore mode?
Native mode is the full Firestore product with real-time listeners and mobile/web client SDKs with offline support. Datastore mode uses the Datastore API for server-side apps (and existing Datastore apps), without real-time/mobile features. The mode is chosen when the database is created.

### 56. How do Pub/Sub delivery semantics work: at-least-once, ordering, dead-letter topics, and retries?
By default Pub/Sub delivers **at least once**: unacknowledged messages are redelivered after the ack deadline, so consumers must be idempotent. **Exactly-once delivery** can be enabled for pull subscriptions in one region (publisher duplicates still possible). **Ordering keys** deliver messages with the same key in order. **Retry policy** can be immediate or exponential backoff; after max delivery attempts messages go to a **dead-letter topic** for inspection/reprocessing. Seek/snapshots allow replay.

### 57. What's the difference between Pub/Sub pull, push, and export subscriptions?
**Pull**: subscribers request messages and control their rate — highest throughput (StreamingPull). **Push**: Pub/Sub sends HTTPS POSTs to an endpoint such as Cloud Run (with OIDC tokens) — simple for serverless. **Export**: BigQuery or Cloud Storage subscriptions write messages directly with no subscriber code.

### 58. Cloud Tasks vs Pub/Sub vs Cloud Scheduler?
**Cloud Tasks**: explicit task delivery to one handler with rate limiting, scheduling, deduplication, and retries (task queue). **Pub/Sub**: fan-out of events to many independent subscribers (publisher doesn't know consumers). **Cloud Scheduler**: managed cron triggering HTTP, Pub/Sub, or App Engine targets on a schedule.

### 59. What is Dataflow, and how does it differ from Dataproc?
Dataflow is a serverless runner for Apache Beam pipelines — unified batch and streaming with autoscaling, exactly-once processing, windowing, and watermarks. Dataproc is managed Spark/Hadoop clusters (or Dataproc Serverless) — best for existing Spark code and ecosystem tools. Choose Dataflow for new streaming pipelines with minimal ops; Dataproc for Spark workloads and control over clusters.

### 60. What is Cloud Composer, and when would you use it?
Managed Apache Airflow for orchestrating complex, scheduled data workflows (DAGs) across GCP and external systems — dependencies, retries, backfills, monitoring. Use when pipelines span many systems; use Workflows for lighter-weight serverless orchestration of API calls.

### 61. How do you optimize BigQuery queries for performance and cost?
Select only needed columns (no `SELECT *`); partition tables by date and require partition filters; cluster by frequently filtered columns; preview cost with dry runs and set maximum bytes billed; use materialized views, BI Engine, and cached results; denormalize with nested/repeated fields; filter early and avoid skewed or cross joins; use approximate aggregation functions; monitor expensive jobs in `INFORMATION_SCHEMA.JOBS`; choose on-demand vs editions/reservations based on usage. Note that `LIMIT` doesn't reduce bytes scanned.

### 62. What is Security Command Center?
GCP's security and risk platform: asset inventory, misconfiguration detection (Security Health Analytics), vulnerability findings, threat detection (Event, Container, and VM Threat Detection), compliance reporting (CIS, PCI, NIST), and attack-path simulation in Premium/Enterprise tiers.

### 63. How do you implement encryption at rest in GCP?
Data is encrypted by default with Google-managed keys. For control, use **CMEK** with Cloud KMS (key rings/keys, rotation, IAM on keys, revocation), Cloud HSM for FIPS 140-2 Level 3, **Cloud EKM** to keep keys in an external key manager, or CSEK for Cloud Storage/PD. KMS uses envelope encryption: data keys encrypt data, key-encryption keys in KMS wrap data keys.

### 64. What is Sensitive Data Protection (Cloud DLP)?
A service to discover, classify, and de-identify sensitive data (PII, credentials, financial data) — inspection jobs over BigQuery/Cloud Storage/Datastore, de-identification via masking, tokenization, bucketing, or format-preserving encryption, and an API to scrub data in pipelines. Integrate findings with Dataplex/data catalog and security policies.

### 65. How do you set up a custom domain for a GCP app?
Cloud Run: domain mapping (limited regions) or, preferably, a global external Application LB with a serverless NEG and a Google-managed certificate (Certificate Manager), then point DNS A/AAAA records (Cloud DNS) to the LB IP. App Engine: verify the domain and add custom domain mapping with managed SSL. Firebase Hosting also supports custom domains.

### 66. What is Artifact Registry, and why move off Container Registry?
Artifact Registry stores container images and language packages (Maven, npm, Python, Go, OS packages) with per-repository IAM, vulnerability scanning, remote/virtual repos, and regional repos. Container Registry (gcr.io) stopped accepting writes in March 2025; Artifact Registry can host gcr.io domains for a smooth migration.

---

## Senior Level (5+ yrs)

### 67. How do you structure projects and folders for a large organization?
Folders by business unit and environment (prod/non-prod), one project per application per environment for isolation and billing, Shared VPC host projects in a networking folder, central logging/security/billing projects, guardrails (org policies, hierarchical firewall policies) set at folder level, groups-based IAM, and project factory automation via Terraform. Keep blast radius small and permissions inherited sensibly.

### 68. What are VPC Service Controls, and what threat do they address?
They create service perimeters around projects so Google-managed APIs (BigQuery, Cloud Storage, etc.) can only be accessed from inside the perimeter or from allowed access levels, and data can't be copied to resources outside it. They defend against **data exfiltration** even with stolen valid credentials or misconfigured IAM — a layer on top of IAM. Start in dry-run mode and define ingress/egress rules carefully.

### 69. How do you design for high availability across regions on GCP?
State RTO/RPO first. Stateless services in two or more regions behind the global external Application LB (automatic failover); data replication is the hard part — Spanner multi-region for strong consistency, or Cloud SQL/AlloyDB cross-region replicas (accepting possible data loss on promotion), dual/multi-region Cloud Storage buckets, Firestore multi-region; Pub/Sub is global; replicate secrets and Artifact Registry; run failover drills.

### 70. What is Cloud Spanner, and when is it the right choice?
A horizontally scalable relational database with strong external consistency (TrueTime), SQL, automatic sharding, and 99.999% availability in multi-region configurations. It's right when write throughput outgrows a single primary or you need globally consistent multi-region writes (global inventory, payments, gaming). Start with Cloud SQL unless those needs are real — Spanner costs more and requires schema/key design for distribution (avoid monotonically increasing primary keys).

### 71. How do you harden a GKE cluster?
Private nodes and private/DNS-based control-plane endpoint with authorized networks; Workload Identity Federation; least-privilege node service accounts; Shielded GKE nodes with Container-Optimized OS; Binary Authorization; network policies (Dataplane V2); Pod Security Standards via Policy Controller; Secret Manager CSI and application-layer secrets encryption with CMEK; release channels for timely upgrades; RBAC via Google Groups; GKE security posture and Container Threat Detection; restricted egress via Cloud NAT and firewall policies.

### 72. How do you monitor and troubleshoot performance issues in a GKE cluster?
Check Cloud Monitoring GKE dashboards and Managed Prometheus for node/pod CPU, memory, throttling, restarts; `kubectl top`, `describe`, events for Pending pods (insufficient resources, quota, affinity), CrashLoopBackOff, OOMKills; HPA/cluster autoscaler events; Cloud Logging for container logs; Cloud Trace for latency; network issues via VPC Flow Logs and Dataplane V2 observability; control-plane metrics for API latency. Fix with right requests/limits, autoscaling configuration, node pool sizing, and PDBs.

### 73. How do you approach hybrid or multi-cloud with GCP?
Start from a clear requirement (regulation, latency to on-prem data, M&A, best-of-breed) that justifies the complexity. Tools: **GKE Enterprise** (fleet management across GKE, on-prem Google Distributed Cloud, and attached EKS/AKS clusters with Config Sync, Policy Controller, Cloud Service Mesh), Interconnect/Cross-Cloud Interconnect, BigQuery Omni for cross-cloud analytics, Apigee hybrid, WIF for cross-cloud identity, and Terraform as a common IaC layer.

### 74. How would you build a streaming data pipeline on GCP?
Pub/Sub ingestion with schemas and dead-letter topics → Dataflow streaming job that validates, enriches, deduplicates, and applies event-time windowing with watermarks and allowed lateness for late data → BigQuery (Storage Write API) into partitioned and clustered tables, plus raw archive in Cloud Storage → Looker dashboards → orchestration/governance with Composer/Dataform and Dataplex. Monitor system lag, data freshness, backlog, and oldest unacked message age.

### 75. How would you design a data pipeline using Pub/Sub, Dataflow, BigQuery, and Looker for analytics?
Producers publish events to Pub/Sub; Dataflow transforms and loads into BigQuery staging, then curated models via Dataform/scheduled queries; Looker's semantic layer (LookML) defines metrics once for consistent dashboards; partitioning/clustering and BI Engine keep queries fast; policy tags and row-level security protect sensitive data; Composer orchestrates batch backfills; cost is controlled with editions/reservations and query limits.

### 76. How do you approach cost optimization on GCP without hurting reliability?
Measure and attribute spend first (billing export to BigQuery, labels, budgets), then act: Recommender rightsizing and idle resources, custom machine types and Arm, Spot for fault-tolerant workloads, CUDs on the stable baseline, scale-to-zero serverless, GKE Autopilot or tuned requests with autoscalers, storage lifecycle/Autoclass, BigQuery query hygiene and reservations, network tier and egress review. Keep regional HA and SLO headroom for production — don't cut what protects reliability.

### 77. How do you control BigQuery cost and improve performance at scale?
Partitioning and clustering, `require_partition_filter`, column pruning, custom quotas and maximum bytes billed, materialized views, BI Engine, editions with autoscaling slots and commitments for predictable spend, separate reservations for ETL vs BI workloads, monitoring `INFORMATION_SCHEMA` for expensive queries and teams, table expiration and long-term storage pricing, and governance on who can run ad hoc queries on large tables.

### 78. How do you design backup and disaster recovery on GCP?
Define RTO/RPO per tier; use Backup and DR Service or snapshots with schedules and cross-region storage; Cloud SQL automated backups + PITR + cross-region replicas; Spanner/Firestore backups and multi-region configs; GCS dual/multi-region buckets with versioning, soft delete, and Bucket Lock; IaC to recreate infrastructure; separate backup projects with restricted IAM; and regularly tested restores and failovers.

### 79. How does audit logging work on GCP, and why does it matter?
Cloud Audit Logs record **Admin Activity** (configuration changes — always on, free), **Data Access** (reads/writes of data — off by default except BigQuery, must be enabled per service), **System Event**, and **Policy Denied** logs. Export them with an aggregated org-level sink to a locked log bucket, BigQuery, or a SIEM. They're essential for security investigations, compliance evidence, and change tracking.

### 80. How would you plan a migration of an on-prem application to GCP?
Discover and assess with Migration Center (inventory, dependencies, TCO), build a landing zone first (org hierarchy, IAM, Shared VPC, Interconnect, logging, org policies), choose rehost (Migrate to Virtual Machines), replatform (Cloud SQL via Database Migration Service, containers via Migrate to Containers), or refactor (Cloud Run/GKE), migrate in waves with testing and rollback plans, cut over, then optimize cost and modernize.

### 81. Design question: architect a scalable web application on GCP.
Ask clarifying questions first (traffic profile, latency targets, data model, compliance, team skills, budget). A typical answer: Cloud DNS → global external Application LB with Cloud CDN and Cloud Armor (managed certs) → Cloud Run services (or GKE Autopilot) in two regions with min instances → Memorystore for caching → Cloud SQL HA (or Spanner for global writes) via private IP → Cloud Storage for assets → Pub/Sub + Cloud Run workers for async jobs → Secret Manager + per-service service accounts → Cloud Build/Cloud Deploy CI/CD → Cloud Monitoring SLOs and alerts. Explain the trade-offs at each layer.

### 82. How would you secure a GCP project using IAM, Organization Policies, VPC Service Controls, and Secret Manager?
IAM: groups-based predefined roles, no basic roles, dedicated service accounts per workload, PAM for temporary elevation, IAM Recommender cleanup. Org policies: disable SA key creation, domain-restricted sharing, allowed locations, no external IPs, uniform bucket access, public access prevention. VPC-SC: perimeter around projects with sensitive data, access levels for corporate networks. Secret Manager: per-secret access, versioned and rotated, CMEK. Plus audit logs to a central SIEM and SCC for posture.

### 83. How would you secure communication between services on GCP?
Private networking (internal LBs, PSC, no external IPs), firewall policies by service account, mTLS and authorization policies through Cloud Service Mesh (Istio-based) on GKE, IAM-authenticated invocation for Cloud Run (`roles/run.invoker` with ID tokens), IAP for user-facing internal apps, and TLS everywhere with Certificate Manager.

### 84. What are the challenges of deploying multi-region applications on GCP?
Data consistency vs latency (synchronous replication cost, conflict handling), increased cost (duplicate capacity, inter-region egress), regional service availability differences, quota management per region, failover testing, configuration drift between regions, compliance/data residency restrictions, and observability across regions. Mitigate with Spanner/global services where appropriate, IaC for identical deployments, and regular drills.

### 85. What recent GCP changes should a senior engineer know?
Cloud Functions became **Cloud Run functions** (2024); **Container Registry** writes stopped (March 2025) — use Artifact Registry; **Deployment Manager** support ended (March 2026) — use Terraform/Infrastructure Manager; GKE Standard clusters can run Autopilot-mode workloads via ComputeClasses (2025); Cloud Run added GPUs and **worker pools** for background workloads; Pub/Sub Lite was retired. Knowing these signals current, hands-on experience.
