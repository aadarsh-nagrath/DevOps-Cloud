# ☁️ Cloud Hub — AWS, Azure & GCP

Everything cloud in one place: **cross-cloud fundamentals first**, then **provider deep dives**, then **interview Q&A and architecture rounds**.

> **How to study:** don't memorize service names. Learn each concept once (fundamentals), then learn how *each provider names and implements it* (deep dives + mapping table below), then practise **scenario questions** ("design a highly available API", "secure a database", "cut cloud cost 40%", "migrate a monolith to containers").

---

## 📂 Map of this folder

### 1. Cross-cloud fundamentals — [`Fundamentals/`](./Fundamentals)
| # | Note | Covers |
|---|---|---|
| 01 | [Cloud Computing Fundamentals](./Fundamentals/01-cloud-computing-fundamentals.md) | NIST definition, benefits/risks, IaaS/PaaS/SaaS/CaaS/FaaS, public/private/hybrid/community/multi-cloud, regions/AZs/fault domains/edge, scaling vs elasticity, virtualization/containers/serverless, shared responsibility, SLA math, pricing models |
| 02 | [Storage & Databases](./Fundamentals/02-cloud-storage-and-databases.md) | Object vs block vs file, tiers & redundancy per cloud, relational vs NoSQL families vs warehouse/lake/lakehouse, OLTP vs OLAP, CAP & consistency, choosing a DB, data transfer |
| 03 | [Security & IAM](./Fundamentals/03-cloud-security-and-iam.md) | IAM model across clouds, least privilege, RBAC/ABAC, encryption & KMS envelope encryption, secrets, network security, zero trust, securing a multi-tier app, threat detection, compliance (GDPR/HIPAA/PCI), incident response |
| 04 | [HA, DR & Backup](./Fundamentals/04-high-availability-dr-backup.md) | HA principles, RTO/RPO, backup & restore → pilot light → warm standby → active-active, provider DR services, 3-2-1 backups, DR checklist |
| 05 | [Cost Optimization](./Fundamentals/05-cloud-cost-optimization.md) | Where money goes, optimization playbook, "cut 40%" answer, capacity planning |
| 06 | [Cloud Migration](./Fundamentals/06-cloud-migration.md) | 7 Rs, phases, landing zones, migration tools per cloud, legacy challenges, monolith → containers |
| 07 | [Observability](./Fundamentals/07-cloud-observability.md) | Native monitoring/logging/tracing per cloud, key metrics, alerting, latency troubleshooting method |
| 08 | [Architecture Patterns](./Fundamentals/08-cloud-architecture-patterns.md) | Well-Architected frameworks (AWS/Azure/GCP), reference designs: 3-tier, SaaS, serverless, data pipeline, CI/CD, multi-region, hybrid; design patterns; lock-in |

### 2. Provider deep dives
| AWS — [`AWS/`](./AWS/aws.md) | Azure — [`AZURE/`](./AZURE/azure.md) | GCP — [`GCP/`](./GCP/gcp.md) |
|---|---|---|
| [Compute](./AWS/aws-compute.md) — EC2, ASG, Lambda, ECS, EKS, Beanstalk | [Core & Governance](./AZURE/azure-core-and-governance.md) — hierarchy, ARM/Bicep, Policy, locks, cost | [IAM, Security & Governance](./GCP/gcp-iam-and-security.md) — hierarchy, IAM, WIF, Org Policy, VPC-SC |
| [Storage](./AWS/aws-storage.md) — S3, EBS, EFS, FSx, Glacier | [Compute](./AZURE/azure-compute.md) — VMs, VMSS, App Service, Functions, Container Apps, AKS | [Compute](./GCP/gcp-compute.md) — GCE, MIGs, App Engine, Cloud Run, GKE |
| [Databases](./AWS/aws-databases.md) — RDS, Aurora, DynamoDB, ElastiCache, Redshift | [Storage & Databases](./AZURE/azure-storage-and-databases.md) — Blob, Files, disks, Azure SQL, Cosmos DB, Fabric | [Storage & Databases](./GCP/gcp-storage-and-databases.md) — GCS, PD, Cloud SQL, AlloyDB, Spanner, Firestore, Bigtable, BigQuery |
| [Networking](./AWS/aws-networking.md) — VPC, ELB, Route 53, CloudFront, hybrid | [Networking](./AZURE/azure-networking.md) — VNet, NSG, Firewall, Private Endpoints, ExpressRoute, LB family | [Networking](./GCP/gcp-networking.md) — global VPC, firewall, NAT, PGA/PSC, Shared VPC, LB, CDN, Armor |
| [IAM & Security](./AWS/aws-iam-and-security.md) — IAM, STS, SCPs, KMS, GuardDuty | [Identity & Security](./AZURE/azure-identity-and-security.md) — Entra ID, CA, PIM, RBAC, managed identity, Key Vault, Defender, Sentinel | [Data, DevOps & Ops](./GCP/gcp-data-devops-and-operations.md) — Pub/Sub, Dataflow, Cloud Build/Deploy, Operations suite, cost |
| [DevOps, IaC & Monitoring](./AWS/aws-devops-iac-monitoring.md) — CFN/CDK/Terraform, Code*, SSM, CloudWatch | [Monitoring, DevOps & DR](./AZURE/azure-monitoring-devops-and-dr.md) — Azure Monitor, KQL, Azure DevOps, Backup, Site Recovery | |
| [Integration, Analytics & AI](./AWS/aws-integration-analytics-ai.md) — SQS/SNS/EventBridge, Kinesis, Bedrock | | |

Also: [Cloud Networking for DevOps (long-form, AWS Terraform example)](./Cloud-Networking-for-DevOps.md).

### 3. Interview Q&A
| File | Focus |
|---|---|
| [23 — Cloud Fundamentals (cross-cloud)](../Interview%20Questions/23-cloud-fundamentals-cross-cloud-qna.md) | Concepts asked first in every cloud interview |
| [07 — AWS core](../Interview%20Questions/07-aws-cloud-qna.md) + [24 — AWS deep dive](../Interview%20Questions/24-aws-deep-dive-qna.md) | Services, design, security, cost, DevOps, Terraform, GenAI |
| [10 — Azure & GCP core](../Interview%20Questions/10-azure-and-gcp-qna.md) + [25 — Azure deep dive](../Interview%20Questions/25-azure-deep-dive-qna.md) | AZ-900 → AZ-104/305-style |
| [26 — GCP deep dive](../Interview%20Questions/26-gcp-deep-dive-qna.md) | Compute choice, IAM/WIF, VPC, data, Pub/Sub, GKE, cost |
| [27 — Cloud Architecture Scenarios](../Interview%20Questions/27-cloud-architecture-scenarios-qna.md) | Design rounds on all three clouds |

---

## 🗺️ Provider service mapping

| Concept | AWS | Azure | GCP |
|---|---|---|---|
| Hierarchy / guardrails | Organizations, OUs, accounts, SCPs/RCPs | Management groups, subscriptions, resource groups, Azure Policy | Organization, folders, projects, Org Policies |
| Landing zone | Control Tower | Azure Landing Zones (CAF) | Cloud Foundation / Fabric FAST |
| VMs | EC2 | Virtual Machines | Compute Engine |
| VM autoscaling group | Auto Scaling Group | VM Scale Sets | Managed Instance Groups |
| PaaS web apps | Elastic Beanstalk, App Runner | App Service | App Engine |
| Serverless functions | Lambda | Azure Functions | Cloud Run functions |
| Serverless containers | ECS on Fargate, App Runner | Container Apps, ACI | Cloud Run |
| Managed Kubernetes | EKS | AKS | GKE (Autopilot/Standard) |
| Container registry | ECR | ACR | Artifact Registry |
| Object storage | S3 | Blob Storage | Cloud Storage |
| Block storage | EBS | Managed Disks | Persistent Disk / Hyperdisk |
| File storage | EFS, FSx | Azure Files, NetApp Files | Filestore |
| Archive | S3 Glacier classes | Blob Archive tier | Archive class |
| Relational DB | RDS, Aurora | Azure SQL, SQL MI, PostgreSQL/MySQL Flexible | Cloud SQL, AlloyDB |
| Global relational | Aurora Global / DSQL | Cosmos DB for PostgreSQL / SQL geo-replication | Spanner |
| NoSQL document/key-value | DynamoDB, DocumentDB | Cosmos DB | Firestore, Bigtable |
| Cache | ElastiCache, MemoryDB | Azure Managed Redis | Memorystore |
| Data warehouse | Redshift | Synapse / Microsoft Fabric | BigQuery |
| Stream ingest | Kinesis, MSK | Event Hubs | Pub/Sub, Managed Kafka |
| Queue | SQS | Service Bus / Queue Storage | Pub/Sub, Cloud Tasks |
| Pub/sub / event routing | SNS, EventBridge | Service Bus topics, Event Grid | Pub/Sub, Eventarc |
| Workflow | Step Functions | Logic Apps, Durable Functions | Workflows, Composer |
| ETL / big data | Glue, EMR | Data Factory, Databricks | Dataflow, Dataproc |
| BI | QuickSight | Power BI | Looker |
| GenAI platform | Bedrock, SageMaker | Azure AI Foundry / Azure OpenAI | Vertex AI |
| Virtual network | VPC (regional) | VNet (regional) | VPC (**global**, regional subnets) |
| Subnet firewall (stateless) | NACL | — (NSG on subnet is stateful) | — |
| Instance firewall (stateful) | Security Group | NSG / ASG | Firewall rules / policies |
| Managed firewall | Network Firewall | Azure Firewall | Cloud NGFW |
| NAT | NAT Gateway | NAT Gateway | Cloud NAT |
| Private access to PaaS | VPC endpoints / PrivateLink | Private Endpoints / Service Endpoints | Private Service Connect / Private Google Access |
| VPC-to-VPC | Peering, Transit Gateway | VNet peering, Virtual WAN | VPC peering, Shared VPC, NCC |
| VPN | Site-to-Site VPN | VPN Gateway | Cloud VPN (HA VPN) |
| Dedicated link | Direct Connect | ExpressRoute | Cloud Interconnect |
| L7 load balancer | ALB | Application Gateway (regional), Front Door (global) | External/Internal Application LB (global/regional) |
| L4 load balancer | NLB | Azure Load Balancer | Network LB (passthrough/proxy) |
| DNS | Route 53 | Azure DNS, Traffic Manager | Cloud DNS |
| CDN | CloudFront | Front Door / Azure CDN | Cloud CDN, Media CDN |
| WAF / DDoS | AWS WAF, Shield | Azure WAF, DDoS Protection | Cloud Armor |
| Identity provider | IAM Identity Center (+ external IdP) | Microsoft Entra ID | Cloud Identity / Workspace |
| Access control | IAM policies & roles | Azure RBAC | Cloud IAM |
| Workload identity | IAM roles (instance profile, IRSA/Pod Identity) | Managed identities | Service accounts, Workload Identity Federation |
| Keys | KMS, CloudHSM | Key Vault, Managed HSM | Cloud KMS, Cloud HSM, EKM |
| Secrets | Secrets Manager, Parameter Store | Key Vault | Secret Manager |
| Posture / threat detection | Security Hub, GuardDuty, Inspector | Defender for Cloud | Security Command Center |
| SIEM | Security Lake + partners | Microsoft Sentinel | Google SecOps |
| Data exfiltration perimeter | SCP/RCP + endpoint policies | Private Endpoints + Policy | VPC Service Controls |
| Zero-trust app access | Verified Access | Entra Conditional Access / Private Access | Identity-Aware Proxy |
| IaC (native) | CloudFormation, CDK | ARM, Bicep | Infrastructure Manager (Terraform) |
| CI/CD (native) | CodePipeline, CodeBuild, CodeDeploy | Azure DevOps Pipelines | Cloud Build, Cloud Deploy |
| Monitoring | CloudWatch | Azure Monitor | Cloud Monitoring |
| Logs | CloudWatch Logs | Log Analytics | Cloud Logging |
| Tracing/APM | X-Ray, Application Signals | Application Insights | Cloud Trace |
| Audit log | CloudTrail | Activity Log | Cloud Audit Logs |
| Config compliance | AWS Config | Azure Policy | Org Policy / SCC |
| Recommendations | Trusted Advisor, Compute Optimizer | Azure Advisor | Recommender |
| Backup | AWS Backup | Azure Backup | Backup and DR Service |
| DR replication | Elastic Disaster Recovery | Azure Site Recovery | Backup and DR / regional services |
| Migration hub | Migration Hub, MGN, DMS | Azure Migrate, DMS | Migration Center, Migrate to VMs, DMS |
| Offline transfer | Snowball | Data Box | Transfer Appliance |
| Hybrid / multi-cloud mgmt | Outposts, EKS Anywhere, SSM | Azure Arc, Azure Local | GKE Enterprise (Anthos), Distributed Cloud |
| Cost | Cost Explorer, Budgets | Cost Management + Billing | Cloud Billing reports, BigQuery export |
| Discounts | Savings Plans, RIs, Spot | Reservations, Savings Plan, Spot, Hybrid Benefit | CUDs, SUDs, Spot |

**Ecosystem strengths (one-liner answer):** AWS — broadest & most mature catalog, biggest ecosystem; Azure — enterprise/Microsoft stack, hybrid (Arc), identity (Entra), M365 integration; GCP — data/analytics (BigQuery), Kubernetes (GKE), AI/ML (Vertex AI/Gemini), global network.

---

## 📅 5-week study plan
| Week | Focus | Read | Practise |
|---|---|---|---|
| 1 | **Cloud fundamentals** — IaaS/PaaS/SaaS, regions/AZs, networking, IAM, storage, databases, scaling, HA/DR, cost | Fundamentals 01–08 | [Q&A 23](../Interview%20Questions/23-cloud-fundamentals-cross-cloud-qna.md) |
| 2 | **AWS** — EC2, S3, VPC, IAM, RDS/DynamoDB, Lambda, EKS, CloudWatch, CloudFormation/Terraform | AWS deep dives | [Q&A 07](../Interview%20Questions/07-aws-cloud-qna.md), [24](../Interview%20Questions/24-aws-deep-dive-qna.md) |
| 3 | **Azure** — Entra ID, VMs, App Service, Functions, AKS, Blob, Azure SQL/Cosmos DB, VNets, Azure Monitor | Azure deep dives | [Q&A 10](../Interview%20Questions/10-azure-and-gcp-qna.md), [25](../Interview%20Questions/25-azure-deep-dive-qna.md) |
| 4 | **GCP** — projects/IAM, Compute Engine, Cloud Run, GKE, Cloud Storage, Cloud SQL/Firestore/BigQuery, VPC, Pub/Sub | GCP deep dives | [Q&A 26](../Interview%20Questions/26-gcp-deep-dive-qna.md) |
| 5 | **Architecture rounds** — scalable SaaS, secure multi-tier app, CI/CD, data pipeline, DR on each cloud | Architecture Patterns | [Q&A 27](../Interview%20Questions/27-cloud-architecture-scenarios-qna.md) — draw diagrams, state trade-offs |

---

## 🔗 Free question & practice sources (used to build these notes)
| Platform | Resource | What you get |
|---|---|---|
| Cross-cloud | [Cloud Engineer Interview Questions — Adaface](https://www.adaface.com/blog/cloud-engineer-interview-questions/) | 110 questions, freshers → experienced |
| Cross-cloud | [Cloud Computing Interview Questions — WeCreateProblems](https://www.wecreateproblems.com/interview-questions/cloud-computing-interview-questions) | 120 questions: IaaS/PaaS/SaaS, serverless, security, regions, multi-cloud |
| Cross-cloud | [GitHub: cloud-engineer-interview-questions](https://github.com/sv222/cloud-engineer-interview-questions) | Curated AWS/Azure/GCP questions |
| Cross-cloud | [DataCamp — Cloud Engineer Interview Questions](https://www.datacamp.com/blog/cloud-engineer-interview-questions) | Basic → scenario questions with answers |
| AWS | [AWS Certification prep](https://aws.amazon.com/certification/certification-prep/) | Free official 20-question sets |
| AWS | [AWS Skill Builder](https://skillbuilder.aws/) | Learning paths, labs, practice questions |
| AWS | [K21 Academy — AWS interview questions](https://k21academy.com/aws-cloud/aws-cloud-interview-questions/) | Realistic, architect, DevOps, Terraform, GenAI & scenario questions |
| Azure | [Microsoft Learn Practice Assessments](https://learn.microsoft.com/en-us/credentials/certifications/practice-assessments-for-microsoft-certifications) | Free official assessments with rationales |
| Azure | [AZ-900 study guide](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/az-900) | Official fundamentals syllabus (mapped into the Azure notes) |
| GCP | [100+ GCP Interview Questions — WeCreateProblems](https://www.wecreateproblems.com/interview-questions/gcp-interview-questions) | 120 questions across compute, storage, networking, security |
| GCP | [GCP Interview Questions — Hyring](https://hyring.com/jobseeker-toolkit/interview-questions/technical/gcp) | 50 questions with `gcloud` commands and interviewer expectations |
| GCP | [Google Cloud interview guide — SecondTalent](https://www.secondtalent.com/interview-guide/google-cloud/) | Senior-level GCP questions incl. recent product changes |
| GCP | [Cloud Digital Leader study guide (PDF)](https://services.google.com/fh/files/misc/c-cdlilt-b_study_guide_v2-0.pdf) | Official fundamentals path |
