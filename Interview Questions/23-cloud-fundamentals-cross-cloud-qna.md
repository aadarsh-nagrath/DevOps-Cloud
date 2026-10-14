# Cloud Fundamentals (Cross-Cloud: AWS, Azure, GCP) — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Notes: [`Cloud/Fundamentals/`](../Cloud/Fundamentals) and the [Cloud hub](../Cloud/README.md) (service mapping table). Questions compiled from the common cloud question banks (Adaface, WeCreateProblems, DataCamp, sv222/cloud-engineer-interview-questions) and answered here. Grouped **Junior → Mid → Senior**.

---

## Table of Contents
- [Junior Level (0–2 yrs)](#junior-level-02-yrs)
- [Mid Level (2–5 yrs)](#mid-level-25-yrs)
- [Senior Level (5+ yrs)](#senior-level-5-yrs)

---

## Junior Level (0–2 yrs)

### 1. What is cloud computing, and what are its key characteristics?
On-demand delivery of IT resources (compute, storage, databases, networking, analytics) over the internet with pay-as-you-go pricing. NIST's five characteristics: **on-demand self-service**, **broad network access**, **resource pooling** (multi-tenancy), **rapid elasticity**, and **measured service**. You rent capacity instead of owning data centers, trading CapEx for OpEx.

### 2. Explain cloud computing to a non-technical person.
It's like electricity from the grid instead of running your own generator: you plug in, use what you need, and pay for what you used, while the provider handles the power plants. Google Drive or Netflix are everyday examples — your files/movies live on someone else's computers and you access them from anywhere.

### 3. What are the advantages of cloud computing over traditional servers?
No upfront hardware (OpEx not CapEx), scale up/down in minutes, global reach, higher reliability with multiple AZs/regions, managed services remove operational toil, faster experimentation, economies of scale, built-in security/compliance programs. Traditional hosting means buying for peak, long procurement cycles, and running everything yourself.

### 4. What's the difference between IaaS, PaaS, and SaaS? Give examples.
**IaaS** gives raw infrastructure (VMs, disks, networks) — you manage OS upward (EC2, Azure VMs, Compute Engine). **PaaS** gives a platform to deploy code — provider manages OS/runtime (Elastic Beanstalk, App Service, App Engine, managed DBs). **SaaS** is finished software you just use (Gmail, Microsoft 365, Salesforce). Add **CaaS** (EKS/AKS/GKE) and **FaaS** (Lambda/Functions/Cloud Run functions). Pizza analogy: take-and-bake vs delivery vs dining out.

### 5. Explain public, private, hybrid, community, and multi-cloud.
**Public**: shared provider infrastructure (AWS/Azure/GCP). **Private**: dedicated to one organization (on-prem VMware/OpenStack or hosted). **Hybrid**: private/on-prem + public connected and managed together (keep sensitive data on-prem, burst to cloud). **Community**: shared by orgs with common compliance needs (government, healthcare). **Multi-cloud**: two or more public providers, for best-of-breed services, resilience, regulation, or negotiating leverage.

### 6. What are regions, availability zones, fault domains, and edge locations?
A **region** is a geographic area with multiple data centers. An **AZ** is one or more physically separate data centers in a region with independent power, cooling, and networking, linked by low-latency fiber. A **fault domain** is a group of hardware sharing a single point of failure like a rack (Azure availability sets expose fault and update domains). **Edge locations** are points of presence for CDN/DNS/edge compute close to users. Spread across AZs for HA, across regions for DR.

### 7. What's the difference between vertical and horizontal scaling?
**Vertical (scale up)**: bigger machine — simple, no app change, but has a ceiling and usually a restart, and remains a single point of failure. **Horizontal (scale out)**: more machines behind a load balancer — near-unlimited and improves availability, but the app must be stateless (sessions in Redis/DB). Cloud-native designs prefer horizontal.

### 8. What's the difference between scalability and elasticity?
**Scalability** is the ability to handle more load by adding resources (could be manual/planned). **Elasticity** is automatically adding *and removing* resources in real time as demand changes, so you only pay for what you use (autoscaling groups, serverless).

### 9. What is virtualization, and how does it relate to cloud computing?
A **hypervisor** lets one physical server run many isolated **virtual machines**, each with its own OS. Type 1 (bare-metal: KVM, Hyper-V, ESXi, AWS Nitro) is what clouds use; Type 2 runs on a host OS (VirtualBox). Virtualization enables multi-tenancy, resource pooling, snapshots, and rapid provisioning — the foundation of IaaS.

### 10. What is a virtual machine, and how is it different from a container?
A VM virtualizes hardware and runs a full guest OS (GBs, boots in minutes, strong isolation). A container packages an app with its dependencies and shares the host kernel using namespaces and cgroups (MBs, starts in seconds, higher density, weaker isolation by default). Containers are portable "build once, run anywhere"; VMs suit full OS control or strong isolation.

### 11. What is serverless computing?
You run code or containers without managing servers: the provider handles provisioning, scaling (including to zero), patching, and availability; you pay per request/execution time. Examples: Lambda, Azure Functions, Cloud Run functions; serverless containers like Fargate, Container Apps, Cloud Run; serverless data like DynamoDB, BigQuery. "Serverless" still has servers — you just don't manage them.

### 12. What is the shared responsibility model?
The provider secures the cloud itself (physical DCs, hardware, hypervisor, network); the customer secures what they put in it (data, identities/IAM, OS patching for IaaS, network rules, app code, encryption choices). The split shifts with the service model — in SaaS the provider does more — but **data and identity/access are always the customer's**. Most breaches come from customer misconfiguration.

### 13. What is object storage, block storage, and file storage?
**Object** (S3, Blob, GCS): objects with metadata in a flat namespace via HTTP API — backups, media, data lakes, static sites. **Block** (EBS, Managed Disks, Persistent Disk): raw volumes attached to a VM, formatted with a filesystem — boot disks, databases. **File** (EFS, Azure Files, Filestore): shared NFS/SMB file systems mounted by many clients — shared content, lift-and-shift apps.

### 14. What is a load balancer?
It distributes incoming traffic across multiple healthy backends, performs health checks, and removes failed targets — improving availability and scalability. L7 (application) balancers route by HTTP host/path and terminate TLS (ALB, Application Gateway, Application LB); L4 (network) balancers route TCP/UDP at high performance (NLB, Azure Load Balancer, Network LB).

### 15. What is a CDN?
A Content Delivery Network caches content at edge locations close to users, reducing latency and origin load and absorbing traffic spikes/DDoS. Examples: CloudFront, Azure Front Door/CDN, Cloud CDN, Cloudflare. Use for static assets, media, and cacheable API responses.

### 16. What is a VPC?
A Virtual Private Cloud is a logically isolated private network in a public cloud where you define IP ranges (CIDR), subnets, route tables, gateways, and firewall rules (security groups/NSGs/firewall rules, NACLs). AWS VPC and Azure VNet are regional; GCP VPC is global with regional subnets.

### 17. What is multi-tenancy?
Many customers (tenants) share the same physical infrastructure or application instance while being logically isolated from each other. Cloud providers are multi-tenant at the hardware level; SaaS apps are multi-tenant at the application level (data partitioned by tenant ID or separate databases).

### 18. What is an SLA in cloud services?
A Service Level Agreement is the provider's contractual commitment (e.g. 99.99% monthly uptime for VMs across AZs) with service credits if missed. 99.9% ≈ 43.8 min downtime/month; 99.99% ≈ 4.4 min/month. An **SLO** is an internal target; an **SLI** is the measured metric.

### 19. What is pay-as-you-go pricing, and how do cloud providers charge?
You pay for consumption: compute per second/hour, storage per GB-month plus requests, data transfer (especially egress), and managed-service units. Discounts come from commitments (Savings Plans/RIs, Azure Reservations, GCP CUDs), automatic discounts (GCP SUDs), and spare capacity (Spot). Free tiers help learning.

### 20. How do you access cloud services?
Web console/portal, CLIs (`aws`, `az`, `gcloud`), SDKs (boto3 etc.), REST APIs, browser-based Cloud Shell, and Infrastructure as Code tools (Terraform, CloudFormation, Bicep). Everything is ultimately an authenticated API call.

### 21. What is Infrastructure as Code (IaC)?
Defining infrastructure in version-controlled code (Terraform, CloudFormation/CDK, Bicep, Pulumi) instead of clicking in consoles. Benefits: repeatable environments, code review, rollback, drift detection, faster DR (rebuild from code), self-documenting infrastructure.

### 22. What is a firewall in the cloud?
Rules that allow/deny traffic: stateful instance-level controls (AWS Security Groups, Azure NSGs, GCP firewall rules), stateless subnet-level ACLs (AWS NACLs), managed central firewalls (AWS Network Firewall, Azure Firewall, Cloud NGFW), and WAFs for HTTP attacks at the edge.

### 23. What is high availability?
Designing so the service keeps running through component failures — redundant instances across multiple AZs behind a load balancer, health checks with automatic replacement, multi-AZ databases, no single points of failure. Measured as uptime percentage.

### 24. What's the difference between stateless and stateful applications?
**Stateless** apps keep no client data between requests (session in Redis/DB/token), so any instance can serve any request and scaling out is easy. **Stateful** apps (databases, queues, sticky-session apps) keep data locally and need replication, persistent storage, and careful failover.

### 25. What are microservices, and how do they relate to cloud computing?
An architecture of small, independently deployable services owning their own data and communicating over APIs/events. Cloud fits them well: containers/Kubernetes/serverless for independent deploys and scaling, managed databases per service, managed messaging, and observability tooling. Trade-off: distributed-system complexity.

### 26. What is a cloud-native application?
An app designed to exploit cloud capabilities: containers or serverless, microservices, dynamic orchestration, managed services, declarative APIs, immutable infrastructure, CI/CD, observability, and resilience patterns (12-factor). Opposite of lift-and-shift VMs.

### 27. What is an API in the context of cloud computing, and why do APIs matter?
Every cloud operation is an API call — provisioning, configuring, monitoring. APIs make automation, IaC, and integrations possible, and services expose APIs to each other. Applications also publish APIs (via API gateways) as their interface. Securing APIs (auth, throttling, TLS, WAF) is therefore core to cloud security.

### 28. What is cloud bursting?
Running workloads in a private data center/cloud normally and "bursting" overflow capacity into a public cloud during demand peaks — requires portable workloads (containers), network connectivity, and data accessibility. A hybrid cloud pattern.

### 29. What is a cloud broker?
A third party (company or software) that helps organizations select, integrate, aggregate, and manage services across multiple cloud providers — e.g. unified billing, governance, or integration across clouds. Pros: simplicity and negotiation; cons: extra cost and dependency.

### 30. What is edge computing / an edge cloud?
Processing data close to where it's generated or consumed (CDN POPs, 5G edge like AWS Wavelength, Local Zones, IoT gateways, on-prem edge appliances) to reduce latency and bandwidth, and to operate when connectivity is limited. The cloud remains the central control/analytics plane.

---

## Mid Level (2–5 yrs)

### 31. How is data redundancy achieved in the cloud?
Replication within a zone (multiple copies), across AZs (S3 Standard, ZRS, regional PD/DBs), and across regions (CRR, GRS, dual/multi-region buckets, global tables); snapshots and backups to another region/account; versioning; erasure coding inside provider storage. Remember replication propagates deletions/corruption — you still need backups.

### 32. How do you design for high availability, disaster recovery, and backup?
HA: ≥2–3 AZs, load balancer + autoscaling + health checks, stateless app tier, managed multi-AZ databases, queues for decoupling. DR: define RTO/RPO, pick backup-restore / pilot light / warm standby / active-active, replicate data cross-region, IaC to rebuild, DNS/global LB failover. Backup: 3-2-1 rule, immutable copies in a separate account, PITR for DBs, and regular restore tests.

### 33. What are RTO and RPO?
**RTO** — maximum acceptable time to restore service. **RPO** — maximum acceptable data loss measured in time. They drive DR architecture and cost: near-zero RPO needs synchronous/continuous replication; near-zero RTO needs hot standby or active-active.

### 34. When would you avoid serverless?
Long-running jobs (Lambda 15-min limit), steady high-throughput workloads where containers/VMs are cheaper, ultra-low-latency paths sensitive to cold starts, workloads needing special hardware/kernel access or large local state, heavy in-memory processing, strict portability needs, and teams without good distributed tracing/observability. Cost at very high request volumes can exceed a reserved fleet.

### 35. Explain containers, orchestration, and Kubernetes in the cloud.
Containers package apps portably; orchestration schedules containers across a cluster and handles scaling, self-healing, service discovery, rolling updates, config and secrets. Kubernetes is the standard orchestrator; managed versions (EKS, AKS, GKE) run the control plane for you. Simpler managed options: ECS, Container Apps, Cloud Run.

### 36. How do IAM and least privilege work?
IAM decides **who** (users, groups, roles/service accounts/managed identities) can do **what** (actions) on **which resources** under **which conditions**. Least privilege means granting only required permissions, at the narrowest scope, for the shortest time — via roles not long-lived keys, group-based grants, guardrails (SCPs, Azure Policy, Org Policies), JIT elevation, and access reviews/recommenders to remove unused permissions.

### 37. How does encryption at rest and in transit work in the cloud?
**In transit**: TLS 1.2+/1.3 for clients, load balancers, service-to-service (mTLS), and DB connections; VPN/MACsec for private links. **At rest**: storage is encrypted by default with provider-managed keys; for control use customer-managed keys in KMS/Key Vault/Cloud KMS (rotation, revocation, audit), or HSM/external key managers for strict compliance. Under the hood, **envelope encryption**: data keys encrypt data, a KMS key encrypts data keys.

### 38. How do you manage secrets and sensitive information in the cloud?
Store in a secrets manager (AWS Secrets Manager/Parameter Store, Azure Key Vault, GCP Secret Manager), grant per-secret least-privilege access to workload identities, inject at runtime (env/volume/SDK), rotate automatically, audit every access, and never put secrets in code, images, Git, or plaintext IaC state. Better still, remove secrets with identity-based auth (IAM DB auth, managed identities, workload identity federation).

### 39. How do you secure a multi-tier web application in the cloud?
Edge: CDN + WAF + DDoS protection, TLS. Web/LB tier in public subnets accepting only 443. App tier in private subnets, accepting traffic only from the LB security group, egress via NAT/firewall, roles for cloud access, secrets from a manager, patched images. DB tier in isolated subnets, accepting only from the app tier, encrypted with CMK, backups/PITR, no public access. Cross-cutting: least-privilege IAM, MFA, centralized audit/flow logs, threat detection, vulnerability scanning, config compliance, incident runbooks.

### 40. What is a bastion host, and what are modern alternatives?
A hardened jump server in a public subnet used to reach private instances, locked down by IP allow-lists, MFA, keys, and logging. Modern alternatives remove inbound SSH/RDP entirely: AWS SSM Session Manager, Azure Bastion, GCP IAP TCP forwarding — identity-based, audited, no public IPs.

### 41. Compare object, block, file, relational, NoSQL, and data-warehouse storage.
Object for unstructured blobs at massive scale; block for low-latency VM disks and databases; file for shared POSIX/SMB access. Relational DBs for structured data with joins and ACID transactions (RDS, Azure SQL, Cloud SQL). NoSQL for flexible schemas and horizontal scale with known access patterns (DynamoDB, Cosmos DB, Firestore, Bigtable). Data warehouses for columnar analytics over huge datasets (Redshift, Synapse/Fabric, BigQuery).

### 42. What's the difference between OLTP and OLAP?
OLTP handles many small, concurrent transactional reads/writes with row storage and strong consistency (orders, payments). OLAP runs large scans/aggregations over historical data with columnar storage (reporting, BI). Keep them separate — replicate OLTP data into a warehouse for analytics.

### 43. How do you optimize cloud costs?
Visibility first (tags, cost allocation, budgets, anomaly alerts), then eliminate waste (idle/orphaned resources, non-prod schedules), rightsize, autoscale and use serverless for spiky loads, commit on the rightsized baseline (Savings Plans/Reservations/CUDs), Spot for fault-tolerant work, storage tiering and lifecycle policies, reduce egress/NAT costs (CDN, private endpoints), newer/Arm instance generations, and govern continuously with FinOps reviews.

### 44. How would you migrate an on-premises application to the cloud?
Assess (inventory, dependencies, utilization, TCO) → choose a strategy per app from the **7 Rs** (retire, retain, rehost, relocate, replatform, repurchase, refactor) → build the landing zone (accounts, identity, network, security, logging) → plan waves and pilot → migrate data (online sync/CDC or offline appliance) and servers (block replication tools) → test → cutover with rollback plan → optimize and modernize. Use AWS MGN/DMS, Azure Migrate, GCP Migrate to VMs/DMS.

### 45. What are the challenges of cloud migration?
Hidden dependencies, hard-coded IPs, unsupported OS versions, licensing restrictions, data volume vs bandwidth, downtime constraints, performance differences (IOPS, latency to remaining on-prem systems), security/compliance mapping, skills gaps, dual-running costs, and cost surprises after migration.

### 46. How do you monitor, log, trace, and alert in the cloud?
Metrics and alarms (CloudWatch / Azure Monitor / Cloud Monitoring), centralized structured logs (CloudWatch Logs / Log Analytics / Cloud Logging), distributed tracing (X-Ray / Application Insights / Cloud Trace, ideally via OpenTelemetry), audit logs (CloudTrail / Activity Log / Audit Logs), dashboards, synthetic checks. Alert on user-facing symptoms (error rate, latency, SLO burn) and route to on-call with runbooks.

### 47. What key metrics do you monitor for cloud applications?
Request rate, error rate (5xx), latency percentiles (p95/p99), saturation (CPU, memory, disk IOPS, connections), LB healthy hosts, autoscaling activity, DB replica lag/connections/storage, queue depth and oldest message age, function errors/throttles/duration, cost and quota usage, and business KPIs.

### 48. What is vendor lock-in, and how do you handle it?
Dependence on provider-specific services that makes switching costly. Mitigate where it matters: containers/Kubernetes, Terraform, OpenTelemetry, open data formats (Parquet/Iceberg), standard protocols (Postgres, Kafka, S3 API), and documented exit plans for critical systems. Accept lock-in consciously when managed services deliver large speed/cost benefits.

### 49. How does load balancing work in cloud environments?
Clients hit a load balancer endpoint (DNS name or anycast IP); the LB checks backend health and distributes requests (round robin, least outstanding requests, hash), can terminate TLS, route by host/path (L7), integrate with autoscaling target groups, and use connection draining when backends are removed. Global LBs/DNS route across regions by latency/health.

### 50. What is DevOps, and how does it relate to cloud computing?
DevOps combines culture and practices (CI/CD, IaC, automation, monitoring, shared ownership) to deliver software quickly and reliably. Cloud amplifies it with API-driven infrastructure, ephemeral environments, managed CI/CD and observability services, and elastic capacity for testing.

### 51. How do you implement CI/CD for cloud applications?
Source control with PR reviews → CI builds, tests, scans (SAST, SCA, image scanning) → immutable artifact in a registry → IaC applied via pipeline → deploy with a safe strategy (rolling, blue/green, canary) → automated verification and rollback on alarms → promotion through environments with approvals. Authenticate pipelines to cloud with OIDC federation, not stored keys.

### 52. How do you approach latency issues in cloud applications?
Measure first (traces, p99 by endpoint/region), then: place workloads close to users (region choice, CDN, edge), cache (CDN, Redis), reduce chatty cross-service/cross-region calls, tune databases (indexes, read replicas, connection pooling), scale out saturated tiers, use async processing for slow work, and avoid cold starts (min instances/provisioned concurrency).

### 53. What is cloud governance?
The policies, processes, and tooling that keep cloud usage secure, compliant, and cost-effective: account/subscription/project structure, identity standards, guardrails (SCPs, Azure Policy, Org Policies), tagging standards, budgets, approved services/regions, security baselines, audit logging, and review processes — ideally enforced as code.

### 54. How do you ensure data security in the cloud?
Classify data, encrypt at rest (CMK for sensitive) and in transit, least-privilege access with audit, private networking (private endpoints, no public buckets), DLP/sensitive-data discovery, backups with immutability, key management and rotation, monitoring for anomalous access, and data residency controls.

---

## Senior Level (5+ yrs)

### 55. How do you design a cloud architecture for high availability across regions?
Start from RTO/RPO and business tiers. Stateless compute in ≥2 regions behind global routing (Route 53 latency/failover or Global Accelerator, Azure Front Door/Traffic Manager, GCP global external Application LB). Data is the hard part: choose replication by consistency needs — DynamoDB global tables / Cosmos DB multi-region writes / Spanner multi-region for active-active, or Aurora Global/SQL failover groups/Cloud SQL cross-region replicas for active-passive. Keep dependencies (DNS, IdP, secrets, registry, CI/CD) available in both regions, pre-provision capacity/quotas, automate failover, and test it with game days.

### 56. How do you design zero trust security in the cloud?
Never trust network location: verify explicitly (strong identity with MFA, device posture, context via Conditional Access/IAP/Verified Access), least-privilege and just-in-time access, micro-segmentation (private endpoints, security groups per service, service mesh mTLS), encrypt everything, continuous monitoring and anomaly detection, and assume breach in design (limit blast radius, immutable logs).

### 57. What are the main challenges of multi-cloud strategies?
Different IAM models, networking, and service semantics; duplicated tooling and skills; egress costs and latency between clouds; inconsistent security posture; harder observability and incident response; "lowest common denominator" architectures. Mitigate with a clear business reason, a common identity provider, Terraform and Kubernetes as common layers, central logging/SIEM, CSPM across clouds, and FinOps tooling that normalizes billing.

### 58. How do you approach cloud provider or service selection for an organization?
Map requirements: workloads and their technical needs, existing skills and licensing (Microsoft estate → Azure Hybrid Benefit), data/AI needs (BigQuery/Vertex), compliance and regions, managed-service maturity, support and partner ecosystem, pricing and discounts, exit strategy. Run proofs of concept against real workloads, compare TCO, and evaluate governance tooling — not just feature checklists.

### 59. How do you implement cost governance at scale?
FinOps operating model: mandatory tagging enforced by policy, showback/chargeback per team, budgets and anomaly alerts, unit economics (cost per customer/transaction), commitment management centrally, guardrails against expensive SKUs/regions, cost review in design docs, automated cleanup of idle resources, monthly reviews with engineering leads, and tracking savings alongside reliability.

### 60. How do you handle compliance requirements like GDPR or HIPAA in the cloud?
Use the provider's compliance programs (BAA for HIPAA, attestations via AWS Artifact / Service Trust Portal / Compliance Reports Manager) but remember they cover only the provider's part. Implement data classification, residency controls (region restrictions), encryption with customer-managed keys, access controls and audit logs, retention and deletion (GDPR right to erasure), DLP, breach-notification processes, DPIAs, continuous compliance monitoring (Config/Policy/SCC), and evidence collection for audits.

### 61. How would you implement multi-tenancy in a cloud application?
Choose isolation per tier: **silo** (account/DB per tenant — strong isolation, higher cost), **pool** (shared resources with tenant ID enforced everywhere — efficient, noisy-neighbour risk), or **bridge** (shared app, separate data stores or premium silos). Enforce isolation in the data layer (row-level security, partition keys, IAM ABAC with tenant tags), per-tenant quotas/rate limits, tenant-aware observability and metering, and onboarding automation.

### 62. Describe your approach to incident response for a cloud security breach.
Detect (GuardDuty/Defender/SCC, billing anomaly) → contain (revoke/rotate credentials, revoke sessions, isolate instances, block IPs) → preserve evidence (snapshots, logs) → investigate via audit logs (what the identity did, persistence created, data accessed) → eradicate and recover from known-good IaC/images/backups → notify per regulations → blameless post-incident review with hardening actions (MFA, removing long-lived keys, new detections).

### 63. How do you troubleshoot issues in a complex distributed cloud system?
Scope the blast radius (which services/regions/customers, since when, what changed), use golden-signal dashboards to find the failing tier, follow distributed traces to the slow/failing span, correlate with deploys/config changes and provider health dashboards, check saturation and throttling/quota limits, and mitigate first (rollback, failover, scale, feature flag) before deep root-cause analysis. Then postmortem and add the missing alert/test.

### 64. How do you approach capacity planning in the cloud?
Combine historical usage trends with business forecasts; load-test to know per-instance throughput; set autoscaling bounds and keep N+1/AZ-failure headroom; pre-request service quota increases (vCPU, IPs, DB limits) before launches; reserve capacity for critical events; commit only to the steady baseline; review quarterly.

### 65. What role does observability play in cloud architecture, and how do you scale it?
It's how you understand system behaviour from outputs (metrics, logs, traces, profiles) — essential in distributed systems where failures are emergent. At scale: OpenTelemetry instrumentation standards, central collectors, sampling (tail-based for traces), cardinality control, tiered log retention, SLO-based alerting, and per-team ownership of dashboards and alerts.

### 66. What are the implications of data residency and sovereignty for cloud design?
Data must stay in permitted jurisdictions: restrict regions via policy, choose region pairs/replication targets inside the allowed geography, control where backups/logs/support access go, consider sovereign cloud offerings and customer-managed/external keys, and document data flows for regulators. It may limit which managed services or global features (e.g. global tables, multi-region buckets) you can use.

### 67. What's the role of AI in cloud computing today?
Clouds provide managed foundation models and AI platforms (Amazon Bedrock/SageMaker, Azure AI Foundry/OpenAI, Vertex AI/Gemini), GPU/accelerator capacity, vector search for RAG, and AI-assisted operations (anomaly detection, cost recommendations, code assistants). DevOps concerns: model access governance, data privacy, cost per token, guardrails, evaluation, and observability of AI apps.

### 68. How do you design and secure an API gateway layer in the cloud?
Use a managed gateway (API Gateway, Azure API Management, Apigee/API Gateway) for routing, authentication (OAuth2/OIDC JWT validation, mTLS), authorization, throttling/quotas per client, request validation, caching, versioning, and observability; front it with WAF/DDoS protection; keep backends private (VPC links/private endpoints); log requests centrally; manage APIs as code.
