# AWS Deep Dive — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Complements [07 — AWS core Q&A](./07-aws-cloud-qna.md) (no repeats). Notes: [`Cloud/AWS/`](../Cloud/AWS/aws.md). Questions compiled from the common banks (K21 Academy, sv222/cloud-engineer-interview-questions, DataCamp, AWS certification prep topics) and answered here. Grouped **Junior → Mid → Senior**, then **DevOps/Terraform**, **GenAI**, and **scenario** rounds.

---

## Table of Contents
- [Junior Level (0–2 yrs)](#junior-level-02-yrs)
- [Mid Level (2–5 yrs)](#mid-level-25-yrs)
- [Senior Level (5+ yrs)](#senior-level-5-yrs)
- [AWS DevOps & Terraform](#aws-devops--terraform)
- [AWS Generative AI](#aws-generative-ai)
- [Scenario-Based Architecture Questions](#scenario-based-architecture-questions)

---

## Junior Level (0–2 yrs)

### 1. Explain EC2, Lambda, ECS, EKS, and Elastic Beanstalk — when would you use each?
**EC2**: virtual servers with full OS control — legacy apps, special software, steady long-running workloads. **Lambda**: event-driven functions up to 15 minutes, scale to zero, pay per ms — glue code, APIs with spiky traffic, file/stream processing, scheduled tasks. **ECS**: AWS-native container orchestration, simple to operate (with Fargate, no servers) — containerized microservices on AWS. **EKS**: managed Kubernetes — teams standardized on Kubernetes, portability, rich ecosystem. **Elastic Beanstalk**: PaaS that provisions EC2/ASG/ELB for your code — simple web apps with minimal ops.

### 2. What's the difference between EC2 and Lambda?
EC2 is a server you manage (OS, patching, scaling via ASG), billed while running, no time limit, any software. Lambda runs code per event without servers, auto-scales per request, billed per invocation and duration, max 15 min, limited to supported runtimes/container images up to 10 GB, with cold starts. EC2 is cheaper for steady high utilization; Lambda for intermittent or unpredictable load.

### 3. What's the difference between S3, EBS, EFS, and Glacier?
**S3**: object storage via API, virtually unlimited, 11-nines durability — backups, static assets, data lakes. **EBS**: block volume attached to one EC2 in one AZ — boot disks, databases. **EFS**: managed NFS shared by many instances across AZs — shared content. **Glacier** (S3 Glacier Instant/Flexible/Deep Archive storage classes): cheapest archival storage with retrieval times from milliseconds to 48 hours — compliance archives.

### 4. What is the difference between an instance store volume and an EBS volume?
Instance store is physically attached NVMe on the host — very fast but **ephemeral** (lost on stop, terminate, or hardware failure), can't be detached or snapshotted. EBS is network-attached, persistent independent of instance life, snapshot-able, resizable, and can be moved between instances in the same AZ. Use instance store for caches/scratch/replicated data only.

### 5. What's the difference between stopping and terminating an EC2 instance?
**Stop**: instance shuts down, EBS volumes persist (you pay for storage, not compute), instance-store data is lost, public IP changes unless you have an Elastic IP, and it may start on different hardware. **Terminate**: instance is deleted permanently; root EBS volume is deleted by default (`DeleteOnTermination`). Enable termination protection for critical instances. **Hibernate** saves RAM to EBS for fast resume.

### 6. What are S3 storage classes?
Standard (frequent), Intelligent-Tiering (unknown/changing patterns, auto-tiering), Express One Zone (single-digit-ms, high request rate), Standard-IA and One Zone-IA (infrequent, ms access, retrieval fees, 30-day minimum), Glacier Instant Retrieval (quarterly access, ms), Glacier Flexible Retrieval (minutes–hours), Glacier Deep Archive (12–48 h, cheapest). Choose by access frequency and retrieval latency; automate with lifecycle rules.

### 7. What is an S3 bucket, and what is versioning?
A bucket is a container for objects with a globally unique name in a chosen region. Versioning keeps every version of an object; deletes add a delete marker so you can recover from accidental deletes/overwrites. Once enabled it can only be suspended. Combine with lifecycle rules to expire old versions and MFA Delete/Object Lock for extra protection.

### 8. How do you upload a file larger than 100 MB to S3?
Use **multipart upload**: split the file into parts (5 MB–5 GB each), upload in parallel, retry failed parts individually, then complete the upload. It's recommended above ~100 MB and required above 5 GB. The AWS CLI (`aws s3 cp`) and SDK transfer managers do it automatically; add Transfer Acceleration for long-distance uploads and a lifecycle rule to abort incomplete uploads.

### 9. What is a presigned URL?
A time-limited URL signed with the creator's credentials that lets anyone holding it perform one specific operation (GET or PUT) on one object without having AWS credentials — e.g. letting a browser upload directly to S3 or share a private download. Expiry is set at creation (max 7 days with IAM user SigV4; limited to session lifetime with role credentials).

### 10. What is a bucket policy, and how is it different from an IAM policy?
A bucket policy is a **resource-based** JSON policy attached to the bucket that says which principals (including other accounts or everyone) can do what on it, with conditions (enforce TLS, restrict to a VPC endpoint or your organization). An IAM policy is **identity-based**, attached to users/roles. Same-account access needs either to allow; cross-account access needs both.

### 11. Explain VPC, subnets, route tables, NAT gateway, internet gateway, security groups, and NACLs together.
A VPC is your isolated network with a CIDR. Subnets live in one AZ each. Route tables decide where traffic goes — a public subnet routes `0.0.0.0/0` to an **internet gateway**; a private subnet routes it to a **NAT gateway** (outbound only). **Security groups** are stateful allow-lists on instances/ENIs; **NACLs** are stateless allow/deny lists on subnets, evaluated by rule number. Typical: ALB in public subnets, app and DB in private subnets.

### 12. What are Connection Draining and Deregistration Delay in AWS load balancers?
When a target is deregistered (scale-in, deployment) or becomes unhealthy, the load balancer stops sending it new requests but keeps existing in-flight connections alive for the **deregistration delay** (default 300 s; called connection draining on Classic LB) so requests complete gracefully. Tune it lower for short requests to speed deployments.

### 13. What is a stateful vs stateless firewall in AWS?
Security groups are **stateful**: if inbound traffic is allowed, the response is automatically allowed. NACLs are **stateless**: you must explicitly allow both directions, including ephemeral return ports (1024–65535). That's why a missing outbound NACL rule can break connections even when security groups are correct.

### 14. What is the relation between an Availability Zone and a Region?
A region is a geographic area containing at least three isolated AZs; each AZ is one or more data centers with independent power/network, connected to the other AZs by low-latency links. Spreading across AZs gives high availability within a region; spreading across regions gives disaster recovery.

### 15. What is PowerUser access in AWS?
`PowerUserAccess` is an AWS managed policy granting full access to all AWS services and resources **except** management of IAM users/groups/roles and Organizations (it allows a few IAM read and service-linked-role actions). Developers can build anything but cannot escalate privileges by changing IAM — though it's still too broad for least privilege in production.

### 16. What's the difference between an IAM role and an IAM user?
An IAM user is a permanent identity with long-term credentials (password/access keys) for one person or app. An IAM role has no permanent credentials; trusted entities (services like EC2/Lambda, users, other accounts, federated identities) assume it and get temporary STS credentials. Roles are preferred everywhere to avoid long-lived keys.

### 17. Describe the use cases for SNS and SQS.
**SNS** is pub/sub push: one message to many subscribers immediately (email/SMS alerts, fan-out an "order created" event to several services). **SQS** is a durable queue: producers enqueue work and consumers pull at their own pace with retries and DLQs (decoupling, smoothing spikes, background jobs). Combined **SNS → multiple SQS** gives durable fan-out where each consumer has its own queue.

### 18. What is Elastic Beanstalk, and how does it work?
You upload application code (or a Docker image); Beanstalk provisions and manages the environment — EC2 instances in an ASG, load balancer, security groups, CloudWatch monitoring, and platform updates — using CloudFormation under the hood. You choose deployment policies (all at once, rolling, rolling with batch, immutable, traffic splitting, blue/green via CNAME swap) and customize with `.ebextensions`/platform hooks.

---

## Mid Level (2–5 yrs)

### 19. Explain S3 lifecycle policies with an example.
Rules filtered by prefix/tag/size that transition or expire objects automatically. Example for logs: Standard → Standard-IA at 30 days → Glacier Flexible Retrieval at 90 days → Deep Archive at 365 days → delete at 7 years; expire noncurrent versions after 30 days; abort incomplete multipart uploads after 7 days. Mind minimum storage durations (early deletion fees) and per-object transition costs for millions of tiny objects.

### 20. How do you secure an S3 bucket?
Keep Block Public Access on; disable ACLs (bucket owner enforced); least-privilege IAM and bucket policies (deny non-TLS, require SSE-KMS, restrict to VPC endpoint/`aws:PrincipalOrgID`); default encryption (SSE-KMS with bucket keys for sensitive data); versioning + Object Lock for critical data; CloudFront with Origin Access Control instead of public website hosting; presigned URLs for temporary sharing; Macie for PII discovery; CloudTrail data events and access logs; IAM Access Analyzer for external access findings; GuardDuty S3 protection.

### 21. Compare RDS, Aurora, DynamoDB, Redshift, and ElastiCache.
**RDS**: managed relational (Postgres, MySQL, MariaDB, Oracle, SQL Server, Db2) for standard OLTP. **Aurora**: cloud-native MySQL/Postgres-compatible with 6-way replicated storage across 3 AZs, 15 low-lag replicas, fast failover, Serverless v2, Global Database. **DynamoDB**: serverless NoSQL key-value/document with single-digit-ms latency at any scale, needs access-pattern-driven design. **Redshift**: columnar MPP data warehouse for analytics. **ElastiCache**: in-memory Valkey/Redis/Memcached for caching, sessions, leaderboards.

### 22. What's the difference between RDS Multi-AZ and read replicas?
Multi-AZ (instance) keeps a **synchronous** standby in another AZ purely for **high availability** — automatic failover via DNS, standby not readable. Multi-AZ DB cluster adds two readable standbys. **Read replicas** use **asynchronous** replication for **read scaling** (up to 15), can be cross-region for DR, and can be promoted to standalone. You often use both.

### 23. How do you choose between RDS, Aurora, DynamoDB, and Redshift for a workload?
Relational data with joins/transactions at moderate scale → RDS. Same but needing higher throughput, faster failover, many replicas or global reads → Aurora. Massive scale, predictable key-based access, serverless, spiky traffic → DynamoDB. Analytics/BI over terabytes → Redshift (or Athena on S3). Add ElastiCache for hot reads. Real examples: orders/payments in Aurora PostgreSQL, user sessions/carts in DynamoDB, reporting in Redshift.

### 24. Explain DynamoDB partition keys, GSIs and LSIs, and capacity modes.
The partition key determines data distribution; choose high-cardinality keys to avoid hot partitions; an optional sort key enables range queries within a partition. **GSI**: different partition/sort key, eventually consistent, own capacity, can be added anytime. **LSI**: same partition key, different sort key, defined at table creation, supports strong consistency. **On-demand** capacity charges per request and scales instantly; **provisioned** sets RCU/WCU with auto scaling and is cheaper for steady load.

### 25. What's the difference between ALB, NLB, and Gateway Load Balancer?
**ALB** (L7): HTTP/HTTPS/gRPC/WebSocket, host/path/header routing, TLS termination with SNI, authentication, WAF, Lambda targets. **NLB** (L4): TCP/UDP/TLS, millions of requests/s, ultra-low latency, **static IP per AZ**/Elastic IPs, preserves client IP, PrivateLink endpoint services. **GWLB** (L3): transparently inserts fleets of third-party virtual appliances (firewalls, IDS/IPS) using GENEVE, with flow stickiness and health checks.

### 26. How does Route 53 work? Explain hosted zones, records, health checks, and failover routing.
Route 53 is AWS's authoritative DNS. A **hosted zone** holds records for a domain (public for internet, private for VPCs). **Records**: A/AAAA/CNAME/MX/TXT/etc. plus **Alias** records that point to AWS resources, work at the zone apex, and are free to query. **Health checks** probe endpoints (HTTP/HTTPS/TCP), combine via calculated checks, or follow CloudWatch alarms. **Failover routing** returns the primary record while healthy and the secondary when the primary's health check fails — active-passive DR. Other policies: weighted, latency, geolocation, geoproximity, multivalue, IP-based.

### 27. How does Route 53 provide high availability and low latency?
Authoritative DNS is served from a global anycast network of edge locations (100% availability SLA), so queries are answered close to users. Latency-based routing sends users to the lowest-latency region; health checks remove failed endpoints automatically; failover and weighted policies enable DR and gradual shifts.

### 28. Explain IAM permission boundaries and STS.
A **permission boundary** is a managed policy attached to a user/role that sets the **maximum** permissions it can ever have — effective permissions are the intersection of identity policies and the boundary. Used for safe delegation: developers can create roles for their apps but only within the boundary, preventing privilege escalation. **STS** issues temporary credentials: `AssumeRole` (cross-account/role switching), `AssumeRoleWithWebIdentity` (OIDC: GitHub Actions, EKS IRSA), `AssumeRoleWithSAML` (enterprise SSO), `GetSessionToken` (MFA).

### 29. What are SCPs, and how do they differ from IAM policies?
Service Control Policies (AWS Organizations) attach to OUs/accounts and define the **maximum permissions** for all principals in those accounts, including the account root user (but not the management account). They never grant access — an IAM policy must still allow. Use for guardrails: deny leaving the organization, disabling CloudTrail/GuardDuty, using unapproved regions, or creating IAM users. **RCPs** do the same for resource policies.

### 30. How does AWS Lambda handle concurrent executions?
Each concurrent request uses its own execution environment; when all are busy, Lambda creates new ones (cold starts) up to the account's regional concurrency limit (default 1,000, raisable). **Reserved concurrency** guarantees and caps a function's share; **provisioned concurrency** keeps environments initialized for no cold starts. Exceeding limits throttles: synchronous callers get 429, asynchronous events are retried, and SQS pollers back off.

### 31. How do you restrict access to EC2 instances?
No inbound SSH/RDP from the internet — use SSM Session Manager (IAM-controlled, logged); security groups allowing only required ports from specific SGs; private subnets; IMDSv2 required; least-privilege instance profiles; EC2 Instance Connect for short-lived keys if SSH is needed; IAM conditions on `ec2:` actions by tag; Inspector scanning; patching via SSM Patch Manager.

### 32. How do you manage secrets on AWS?
Secrets Manager for credentials needing rotation (native RDS/Aurora rotation, cross-region replicas), SSM Parameter Store SecureString for config and non-rotating secrets, KMS for encryption, IAM roles to grant per-secret access, and runtime injection (ECS `secrets`, EKS External Secrets Operator/CSI driver, Lambda extension). Never in code, AMIs, user data, or plaintext Terraform state; prefer IAM database authentication where possible.

### 33. Explain CloudWatch, CloudTrail, X-Ray, Config, and GuardDuty.
**CloudWatch**: metrics, logs, alarms, dashboards — "how is it performing?". **CloudTrail**: audit log of API calls — "who did what, when, from where?". **X-Ray**: distributed tracing — "where is the latency/error in this request path?". **Config**: resource inventory, configuration history, and compliance rules — "what does it look like and is it compliant?". **GuardDuty**: managed threat detection from CloudTrail, VPC Flow Logs, DNS, EKS, S3, and runtime signals — "is something malicious happening?".

### 34. What's the difference between CloudFormation and Elastic Beanstalk?
CloudFormation is general-purpose IaC — you declare any AWS resources in templates and it provisions them as stacks. Beanstalk is an application platform — you give it code and it decides and manages the infrastructure (using CloudFormation internally). Beanstalk is faster for standard web apps; CloudFormation gives full control over arbitrary architectures.

### 35. Explain Elastic Beanstalk vs EKS — when would you choose each?
Beanstalk for a small team running a standard web app or API that wants managed scaling and deployments with minimal Kubernetes knowledge. EKS for many microservices, a platform team, Kubernetes ecosystem needs (Helm, operators, service mesh, GitOps), portability, and fine-grained control. Beanstalk trades flexibility for simplicity; EKS trades simplicity for power.

### 36. What are DDoS attacks, and which AWS services mitigate them?
Attacks that overwhelm resources with traffic at network (L3/4) or application (L7) layers. Mitigation: **Shield Standard** (automatic, free L3/4 protection), **Shield Advanced** (enhanced detection, DDoS Response Team, cost protection), **CloudFront** and **Route 53** at the edge to absorb volumetric attacks, **WAF** rate-based and managed rules for L7 floods, ALB/NLB and Auto Scaling to absorb load, and minimizing exposed surface (private subnets, security groups).

### 37. What are some security best practices for Amazon EC2?
IMDSv2, least-privilege instance roles, no hardcoded keys, private subnets, tight security groups, SSM Session Manager instead of SSH, encrypted EBS by default, patched hardened golden AMIs, Inspector vulnerability scans, CloudWatch agent logging, GuardDuty runtime monitoring, termination protection, AWS Backup, and regular AMI refreshes via instance refresh.

### 38. How does AWS handle scalability and elasticity for customers?
Auto Scaling (EC2, ECS services, DynamoDB, Aurora replicas), serverless services that scale automatically (Lambda, Fargate, DynamoDB on-demand, S3), Elastic Load Balancing that scales with traffic, CloudFront for global caching, and pay-per-use pricing so capacity follows demand up and down.

### 39. Can a company's data center connect to AWS? How?
Yes: **Site-to-Site VPN** (IPsec over internet, quick, redundant tunnels, ~1.25 Gbps per tunnel), **Direct Connect** (dedicated private fiber 1–100 Gbps, consistent latency, lower egress cost; add MACsec or VPN for encryption; use two locations for HA), terminated on a Transit Gateway or virtual private gateway with BGP routing; hybrid DNS via Route 53 Resolver endpoints; Storage Gateway/DataSync for data.

### 40. What is hybrid cloud, and how does it relate to AWS?
Combining on-prem infrastructure with AWS as one environment: connectivity (VPN/Direct Connect), identity federation (Identity Center with AD/Entra), hybrid storage (Storage Gateway), management of on-prem servers with Systems Manager, AWS Outposts (AWS racks on-prem), EKS Anywhere/ECS Anywhere, and DR to AWS with Elastic Disaster Recovery.

### 41. What factors do you consider when migrating to AWS?
Business case/TCO, application inventory and dependencies, the right 7-R strategy per app, landing zone (Control Tower accounts, network, identity, security baseline), data volume and transfer method (DataSync/Snowball/DMS with CDC), downtime tolerance and cutover plan, licensing, compliance and data residency, performance testing, team skills, and post-migration optimization. Tools: Migration Hub, Application Discovery Service, MGN, DMS.

### 42. How does AWS ensure data security and compliance?
AWS secures the infrastructure under the shared responsibility model (physical security, hardware, network, hypervisor) and maintains certifications (SOC 1/2/3, ISO 27001, PCI DSS, HIPAA eligibility, FedRAMP) available in **AWS Artifact**. Customers use KMS/CloudHSM encryption, IAM, CloudTrail, Config conformance packs, Security Hub standards, Macie, Audit Manager, and region controls to meet their own obligations.

### 43. How does AWS handle disaster recovery and business continuity?
Multi-AZ by design, multiple regions, and services for each DR tier: AWS Backup (cross-region/account, Vault Lock), Elastic Disaster Recovery (block-level replication with fast recovery), Aurora Global Database, DynamoDB global tables, S3 replication, Route 53 health-checked failover, Application Recovery Controller, and IaC to rebuild environments. Customers choose backup-restore, pilot light, warm standby, or active-active by RTO/RPO.

---

## Senior Level (5+ yrs)

### 44. How would you reduce AWS costs for a growing SaaS workload?
Make costs visible per tenant/team (cost allocation tags, CUR in Athena, unit cost per customer), then: rightsize with Compute Optimizer, move to Graviton, autoscale and schedule non-prod, Fargate Spot/EC2 Spot for stateless and batch, Savings Plans on the rightsized baseline, S3 Intelligent-Tiering and lifecycle, gp3, DynamoDB on-demand vs provisioned review, Aurora I/O-Optimized if I/O-heavy, VPC endpoints to cut NAT costs, CloudFront to cut egress, reduce log ingestion and retention, consolidate idle environments, pooled multi-tenancy where possible. Track savings and protect SLOs.

### 45. Describe a fault-tolerant, highly available system you'd build on AWS and the trade-offs.
Route 53 → CloudFront + WAF → ALB across 3 AZs → ECS on Fargate (or EKS) services in private subnets with autoscaling and circuit-breaker rollbacks → Aurora PostgreSQL Multi-AZ with replicas + RDS Proxy → ElastiCache Valkey Multi-AZ → SQS for async work with DLQs → S3 for files. Trade-offs: cost of multi-AZ NAT gateways and replicas, eventual consistency in async paths, operational complexity of distributed tracing, and needing static stability (pre-provisioned capacity) in case an AZ fails.

### 46. What risks and security problems are common in AWS environments, and how do you reduce them?
Public S3 buckets, over-permissive IAM (`*:*`, long-lived access keys leaked in Git), open security groups (0.0.0.0/0 on 22/3389/DB ports), unencrypted data, missing logging, unpatched AMIs, IMDSv1 SSRF credential theft, secrets in environment variables or user data, no MFA on root. Reduce with org-wide guardrails (SCPs), Identity Center + roles, Access Analyzer, Security Hub/GuardDuty/Config, Block Public Access, IMDSv2 enforcement, secrets manager, IaC scanning, and automated remediation.

### 47. How do you diagnose and improve performance problems in an AWS environment?
Define the symptom with metrics (p99 latency, errors) and traces (X-Ray/OpenTelemetry) to find the bottleneck tier; check saturation (CPU, memory via agent, EBS IOPS/throughput and burst balance, network PPS limits), DB Performance Insights for top SQL/waits, connection pool exhaustion (RDS Proxy), Lambda throttles/cold starts, DynamoDB throttling/hot keys, cross-AZ/region calls; then fix: caching (CloudFront/ElastiCache), right instance family, gp3/io2, read replicas, query/index tuning, async processing, autoscaling policies.

### 48. How do you make sure your systems can withstand traffic spikes?
Load test beyond expected peak; autoscaling with target tracking plus scheduled/predictive scaling for known events and warm pools; CloudFront caching; SQS buffering for writes; DynamoDB on-demand or pre-warmed capacity; Aurora replicas and RDS Proxy; Lambda reserved/provisioned concurrency; service quota increases in advance; rate limiting/WAF to protect backends; graceful degradation (feature flags, static fallbacks).

### 49. How do you design a multi-account AWS security monitoring strategy?
Delegated administrator in a security account for GuardDuty, Security Hub, Inspector, Macie, Config aggregator, IAM Access Analyzer; organization CloudTrail to an immutable log-archive account (Object Lock, KMS); Security Lake/SIEM ingestion; EventBridge rules routing high-severity findings to on-call and automated remediation (Lambda/SSM); SCP guardrails preventing tampering; regular access reviews and detective controls for root usage and IAM changes.

---

## AWS DevOps & Terraform

### 50. How do CloudFormation, CDK, Terraform, CodePipeline, and CodeDeploy fit together?
CloudFormation/CDK/Terraform define infrastructure as code (CDK synthesizes CloudFormation; Terraform is multi-cloud with its own state). CodePipeline orchestrates the release (source → build → test → approve → deploy), CodeBuild builds and tests, and CodeDeploy rolls out application versions to EC2/on-prem, ECS (blue/green), or Lambda (canary/linear) with automatic rollback on alarms. Many teams use GitHub Actions + Terraform + Argo CD instead, with OIDC roles into AWS.

### 51. An EC2 instance in a CodeDeploy fleet sits idle and never gets the new version. What could be wrong?
CodeDeploy agent not installed/running or outdated; instance role missing permissions to read the revision from S3/GitHub; instance not matching the deployment group's tags or ASG; no outbound access to CodeDeploy/S3 endpoints (missing NAT or VPC endpoints); lifecycle hook scripts failing or timing out; the instance launched after deployment started without the ASG integration. Check agent logs (`/var/log/aws/codedeploy-agent/`) and deployment events.

### 52. What happens if there's an error in a CloudFormation template you deployed, and how do you fix it?
Syntax errors fail validation before anything is created. Runtime resource failures trigger an automatic **rollback** to the last stable state (create failures delete created resources). Read the stack events for the first failure reason, fix the template, preview with a **change set**, and redeploy. For `UPDATE_ROLLBACK_FAILED`, fix the underlying issue and continue the rollback (optionally skipping resources). Prevent with cfn-lint, cfn-guard, and change-set review in CI.

### 53. How would you auto-deploy new versions to Elastic Beanstalk on each commit?
CodePipeline with a GitHub (CodeConnections) source → CodeBuild to build/test and produce the bundle → Elastic Beanstalk deploy action to the target environment (rolling with additional batch or immutable policy; blue/green via a second environment and CNAME swap for prod). Alternatively a GitHub Actions workflow using OIDC and `eb deploy`.

### 54. How would you use Systems Manager to automate application deployments?
Package the app in S3 or Distributor, write an SSM Command/Automation document that downloads, installs, configures, and restarts the service, target instances by tags with rate control and error thresholds, trigger it from the pipeline or EventBridge, and use State Manager for desired-state drift correction. Parameter Store holds config, Session Manager gives audited access, and Patch Manager handles OS patching.

### 55. How would you track changes to applications and infrastructure through your CI/CD pipeline?
Everything in Git with PR reviews and linked tickets; immutable versioned artifacts (image digests, tagged releases); stored Terraform plans or CloudFormation change sets per deploy; pipeline execution history; deployment markers on dashboards; CloudTrail for every API change and Config for resource history; drift detection to catch out-of-band edits.

### 56. How would you make your CI/CD workflow more effective?
Shorten feedback (parallel tests, caching, incremental builds), shift security left (SAST/SCA/IaC scans in PRs), build once and promote the same artifact, use ephemeral preview environments, automate canary analysis and rollback, adopt trunk-based development with feature flags, measure DORA metrics, remove manual gates through policy-as-code, and keep pipelines as code with reusable templates.

### 57. What is Terraform, and how does it differ from CloudFormation?
Terraform is an open-source (BSL; OpenTofu is the open fork) multi-cloud IaC tool using HCL with an explicit `plan`/`apply` workflow and a state file you manage. CloudFormation is AWS-only, uses YAML/JSON, and AWS manages state and automatic rollback. Terraform wins for multi-cloud/third-party providers and module ecosystem; CloudFormation for native integration, StackSets, and no state management.

### 58. What is Terraform state, and how do you secure state files in production?
State maps your configuration to real resource IDs and attributes so Terraform can plan changes. It often contains secrets. Store it remotely in S3 with versioning, SSE-KMS encryption, Block Public Access, a strict bucket policy limited to CI roles and admins, and state locking (S3 native lockfile; DynamoDB locking is deprecated); split state per environment/component; never commit it to Git; audit access with CloudTrail.

### 59. How do you manage dev, test, and prod with Terraform?
Separate AWS accounts per environment, separate state per environment (directory-per-env or workspaces with care), shared versioned modules with environment-specific variables (`*.tfvars`), the same pipeline promoting changes dev → test → prod with plan review and approval, and OIDC roles per account so a dev pipeline can't touch prod.

### 60. How do you integrate Terraform into CI/CD pipelines?
On PR: `fmt -check`, `validate`, `tflint`, Checkov/tfsec, `plan` with output posted to the PR. On merge: apply the saved plan with an approval gate for prod, authenticated by OIDC to an environment role. Add scheduled drift-detection plans, policy as code (OPA/Sentinel), and notifications.

### 61. What is a Terraform module, and why is it useful?
A reusable, versioned package of Terraform configuration with inputs and outputs (e.g. a VPC module or an ECS service module). Modules enforce standards (tagging, encryption), reduce duplication, and let teams consume golden patterns; publish them in a private registry with semantic versions.

### 62. How do you update or change AWS infrastructure with Terraform safely?
Change code → PR → plan review (watch for destroy/replace, especially `forces replacement`) → apply via pipeline. Use `lifecycle { prevent_destroy = true }` and `create_before_destroy`, `moved`/`import` blocks for refactors, targeted rollouts across environments, and backups before risky DB changes.

### 63. How do you manage secrets in Terraform?
Don't hardcode them; read from Secrets Manager/SSM data sources at apply time or let services generate and manage them (`manage_master_user_password` for RDS); mark variables `sensitive`; pass via environment variables in CI from a vault; remember values may still land in state, so encrypt and lock down the state; consider ephemeral resources/write-only arguments in newer Terraform versions to keep secrets out of state.

### 64. What are best practices for Terraform on AWS?
Remote encrypted state with locking, small blast-radius state files, pinned provider/module versions, `default_tags`, consistent naming, modules for golden patterns, OIDC-authenticated pipelines, policy and security scanning, no manual console changes (drift detection), least-privilege deployment roles, documentation via `terraform-docs`, and plan review culture.

### 65. What is IaC, and why is it relevant in AWS?
Defining AWS resources in code (CloudFormation, CDK, Terraform) so environments are reproducible across accounts and regions, reviewable, versioned, testable, and recoverable — essential at AWS's scale of services and for multi-account landing zones, DR, and compliance evidence.

---

## AWS Generative AI

### 66. What is Amazon Bedrock, and how does it help build GenAI applications?
A fully managed, serverless service giving API access to foundation models (Anthropic Claude, Amazon Nova, Meta Llama, Mistral, Cohere, etc.) with enterprise features: Knowledge Bases (managed RAG), Agents/AgentCore (tool use and orchestration), Guardrails (safety), fine-tuning, model evaluation, and private connectivity — without managing GPUs. Your data isn't used to train the base models.

### 67. What's the difference between Amazon Bedrock and Amazon SageMaker?
Bedrock consumes and customizes existing foundation models through an API with no ML infrastructure. SageMaker AI is a full ML platform for building, training, tuning, and hosting your own models (including open-weight LLMs) with control over instances, containers, and MLOps pipelines. Use Bedrock for most GenAI apps; SageMaker when you need custom training or full control over hosting.

### 68. Explain the architecture of a RAG application on AWS.
Documents in S3 → Bedrock Knowledge Base chunks them and creates embeddings with an embedding model → vectors stored in a vector store (OpenSearch Serverless, Aurora pgvector, S3 Vectors) → user query arrives via API Gateway/Lambda → retrieve top-k relevant chunks → build a prompt with context → Bedrock model generates a grounded answer with citations → Guardrails filter input/output → logs/metrics to CloudWatch; access controls ensure users only retrieve documents they're allowed to see.

### 69. What are Bedrock Agents and Knowledge Bases?
**Knowledge Bases** are managed RAG pipelines (ingestion, chunking, embedding, vector storage, retrieval). **Agents** let a model plan multi-step tasks and call tools/APIs (action groups via Lambda or OpenAPI schemas), use knowledge bases, and keep session memory — e.g. "check order status and open a return". **AgentCore** provides production runtime, identity, memory, gateway, and observability for agents built with any framework.

### 70. What are embeddings, and how are they used in AWS GenAI apps?
Embeddings are numeric vectors capturing semantic meaning; similar texts produce nearby vectors. They power semantic search, RAG retrieval, recommendations, clustering, and deduplication. On AWS: Titan/Cohere embedding models on Bedrock, stored in OpenSearch/Aurora pgvector/S3 Vectors, queried with k-NN similarity.

### 71. How do you prevent hallucinations in GenAI applications?
Ground answers with RAG from trusted, up-to-date sources; use Guardrails contextual grounding and relevance checks; instruct the model to answer only from context and say "I don't know"; lower temperature; require citations; use structured outputs and validation; evaluate with test sets (Bedrock Evaluations, LLM-as-judge plus human review); add human approval for high-stakes actions.

### 72. What are Bedrock Guardrails?
Configurable policies applied to model inputs and outputs: content filters (hate, violence, sexual, misconduct, prompt attacks), denied topics, word filters, sensitive information filters (PII masking/blocking), contextual grounding checks, and automated reasoning checks. They work across models and can be applied to any text via the ApplyGuardrail API.

### 73. How do you secure GenAI applications on AWS?
Least-privilege IAM on model invocation and knowledge bases; PrivateLink/VPC endpoints; KMS encryption for data, logs, and vector stores; Guardrails against prompt injection and PII leaks; document-level authorization in retrieval; no secrets in prompts; input validation and output encoding; invocation logging with data-retention controls; rate limiting/quotas per user; red-teaming and evaluation before release.

### 74. How would you design an enterprise AI chatbot on AWS?
Users authenticate via Identity Center/Cognito → front end on CloudFront/Amplify → API Gateway (WebSocket for streaming) → orchestration in Lambda or ECS → Bedrock model with Knowledge Base over company docs (S3 + vector store, synced regularly) and Agents for actions (create tickets, query systems) → Guardrails → conversation history in DynamoDB → observability via CloudWatch and invocation logs → cost controls (model tiering, prompt caching, limits) → feedback loop for evaluation.

### 75. Which AWS services monitor and govern GenAI applications?
CloudWatch metrics (invocations, latency, tokens, throttles) and dashboards, Bedrock model invocation logging to CloudWatch Logs/S3, CloudTrail for API audit, Guardrails metrics, Bedrock Evaluations for quality, AgentCore observability for agents, IAM/SCPs to restrict which models can be used, cost allocation tags and application inference profiles for chargeback, and Config/Security Hub for configuration compliance.

---

## Scenario-Based Architecture Questions

### 76. Design a highly available architecture for an e-commerce application on AWS.
Route 53 (latency/failover) → CloudFront (static assets from S3 with OAC, caching, Shield) + WAF → ALB across 3 AZs → product/cart/checkout services on ECS Fargate or EKS in private subnets with autoscaling → Aurora PostgreSQL Multi-AZ (orders, payments) + read replicas → DynamoDB for carts/sessions → ElastiCache for catalog caching → OpenSearch for product search → SQS/SNS/EventBridge for order events (inventory, email, analytics) → Step Functions for checkout saga → S3 for images → Cognito for customers → CloudWatch/X-Ray observability → AWS Backup + cross-region copies. Why: AZ-redundant everywhere, async decoupling for spikes, caching for read-heavy catalog.

### 77. How would you design a multi-region disaster recovery solution for an AWS application?
Set RTO/RPO, then choose: backup-restore (AWS Backup cross-region copies + IaC), pilot light (Aurora Global Database secondary, minimal compute), warm standby (scaled-down full stack in second region, scale on failover), or active-active (DynamoDB global tables, Route 53 latency routing). Replicate S3 with CRR, ECR images with replication, secrets with Secrets Manager replicas; Route 53 health checks or Application Recovery Controller for failover; pre-request quotas; run regular failover drills.

### 78. Your company wants to migrate an in-house application to AWS. Which approach and services would you recommend?
Assess with Migration Hub/Application Discovery Service and Migration Evaluator; build a Control Tower landing zone with Direct Connect/VPN; rehost VMs with **Application Migration Service (MGN)** for speed, migrate databases with **DMS** (+ Schema Conversion) using CDC for minimal downtime, move files with **DataSync** or **Snowball**; test, cut over in waves, then replatform (RDS, ECS/Fargate) and optimize costs.

### 79. How would you build a secure three-tier web application on AWS?
VPC with public (ALB, NAT), private app, and isolated DB subnets across 3 AZs; CloudFront + WAF + Shield in front; ALB with ACM TLS; app tier on ECS/EC2 accepting only from the ALB security group, using IAM roles and Secrets Manager; RDS/Aurora accepting only from the app SG, encrypted with KMS, IAM auth; VPC endpoints for AWS APIs; SSM for access; CloudTrail, Config, GuardDuty, Security Hub; backups and least-privilege IAM.

### 80. How would you design a cost-effective architecture without compromising performance and availability?
Serverless/managed where load is variable (Lambda, Fargate, DynamoDB on-demand, Aurora Serverless v2), Graviton instances, autoscaling to real demand, Spot for stateless/batch with capacity-optimized diversification, Savings Plans for the baseline, CloudFront caching, S3 Intelligent-Tiering, VPC endpoints to avoid NAT charges, right-sized multi-AZ only for production, and continuous cost monitoring with budgets.

### 81. A company plans a serverless application on AWS. Which services would you recommend?
API Gateway (HTTP API) or AppSync for APIs, Lambda for compute, DynamoDB for data, S3 for files, Cognito for auth, EventBridge/SQS/SNS for events and decoupling, Step Functions for workflows, CloudFront for front end, Secrets Manager/Parameter Store for config, CloudWatch + X-Ray (Powertools) for observability, and SAM/CDK for IaC with CodePipeline or GitHub Actions.

### 82. How would you monitor and troubleshoot a production workload on AWS?
Dashboards for golden signals per service (ALB 5xx/latency, ECS/Lambda metrics, Aurora Performance Insights), structured logs in CloudWatch Logs with Logs Insights queries, X-Ray/OTel traces, Synthetics canaries, alarms on SLO burn routed via SNS to on-call, Container Insights for clusters, CloudTrail + Config to correlate changes, and runbooks with SSM Automation for common fixes.

### 83. Design an architecture for a web app that faces sudden traffic spikes during events.
CloudFront caching aggressively (static and cacheable API responses), WAF rate limits, ALB + ECS/EKS with scheduled scale-up before the event plus target tracking, warm pools/pre-provisioned capacity, SQS to queue writes (orders) and process asynchronously, DynamoDB on-demand or pre-warmed, Aurora replicas + RDS Proxy, ElastiCache for hot reads, a virtual waiting room for extreme peaks, quota increases in advance, and load testing at 2–3× expected peak.

### 84. Build a secure system for sensitive data that preserves confidentiality and integrity.
Dedicated account with SCP guardrails; data in S3/Aurora encrypted with customer-managed KMS keys and tight key policies; TLS everywhere; private subnets and VPC endpoints with endpoint policies; least-privilege IAM with ABAC and MFA; S3 Object Lock and versioning for integrity; CloudTrail data events with log file validation; Macie for discovery; GuardDuty; backups in a separate account with Vault Lock; audit and access reviews.
