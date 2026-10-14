# ☁️ AWS (Amazon Web Services) — Overview & Hub

AWS is the largest and broadest cloud platform (200+ services). This page is the **map**; each area has a deep-dive file.

| Deep dive | Covers |
|---|---|
| [AWS Compute](./aws-compute.md) | EC2 (types, purchasing, AMIs, placement), Auto Scaling, Lambda, ECS/Fargate, EKS, Elastic Beanstalk, App Runner, Batch |
| [AWS Storage](./aws-storage.md) | S3 (classes, lifecycle, versioning, presigned URLs, policies, encryption, replication), EBS, instance store, EFS, FSx, Glacier, Storage Gateway, Backup |
| [AWS Databases](./aws-databases.md) | RDS, Aurora, DynamoDB, ElastiCache, Redshift, DocumentDB, Neptune, DMS — and how to choose |
| [AWS Networking](./aws-networking.md) | VPC, subnets, route tables, IGW, NAT, SG vs NACL, endpoints, peering/TGW/PrivateLink, ELB (ALB/NLB/GWLB), Route 53, CloudFront, Global Accelerator, VPN/Direct Connect |
| [AWS IAM & Security](./aws-iam-and-security.md) | IAM users/roles/policies, evaluation logic, permission boundaries, SCPs, STS, Identity Center, KMS, Secrets Manager, GuardDuty, Config, CloudTrail, WAF/Shield |
| [AWS DevOps, IaC & Monitoring](./aws-devops-iac-monitoring.md) | CloudFormation, CDK, Terraform on AWS, CodePipeline/Build/Deploy, Systems Manager, CloudWatch, X-Ray, EventBridge |
| [AWS Integration, Analytics & AI](./aws-integration-analytics-ai.md) | SQS, SNS, EventBridge, Kinesis, Step Functions, API Gateway, Athena/Glue, Bedrock, SageMaker |
| [AWS Cloud Networking (multi-VPC guide)](../Cloud-Networking-for-DevOps.md) | Long-form networking guide with Terraform example |

Interview prep: [AWS Q&A (core)](../../Interview%20Questions/07-aws-cloud-qna.md) · [AWS Deep-Dive Q&A](../../Interview%20Questions/24-aws-deep-dive-qna.md) · [Architecture Scenarios](../../Interview%20Questions/27-cloud-architecture-scenarios-qna.md).

---

## 1. Global infrastructure
- **Regions** (e.g. `us-east-1`, `ap-south-1` Mumbai) — choose by compliance, latency, service availability, price. Most services are regional.
- **Availability Zones** — ≥3 per region, isolated DCs connected by low-latency fiber. Names (`us-east-1a`) are mapped per account; use **AZ IDs** (`use1-az1`) to align across accounts.
- **Edge locations / Regional Edge Caches** — CloudFront, Route 53, Global Accelerator, Lambda@Edge/CloudFront Functions.
- **Local Zones** (compute in metro areas), **Wavelength** (5G edge), **Outposts** (AWS racks on-prem).
- **Global services**: IAM, Route 53, CloudFront, Organizations, WAF for CloudFront.

## 2. Accounts & organization
- **AWS account** = billing + security boundary. **Root user**: lock with MFA, no access keys, use only for few tasks (close account, change support plan, some billing).
- **AWS Organizations**: management account + member accounts in **OUs**; consolidated billing; **SCPs** (max permissions for accounts) and **RCPs** (max permissions on resources); tag policies, backup policies.
- **Control Tower**: automated **landing zone** (log archive + audit accounts, guardrails/controls, Account Factory).
- Typical OU layout: Security (log archive, audit), Infrastructure (network, shared services), Workloads (prod, non-prod), Sandbox, Suspended.

## 3. How you interact
```bash
aws configure sso                      # SSO via IAM Identity Center (preferred)
aws sts get-caller-identity            # who am I?
aws ec2 describe-instances --region ap-south-1 --query 'Reservations[].Instances[].[InstanceId,State.Name]' --output table
aws s3 ls s3://my-bucket --recursive --human-readable
export AWS_PROFILE=prod-readonly       # switch profiles
```
Console, CLI v2, SDKs (boto3), CloudShell, IaC (CloudFormation/CDK/Terraform). Credentials resolution order: CLI flags → env vars → SSO/profile config → container/instance role.

## 4. Service cheat sheet (by category)
| Category | Key services |
|---|---|
| Compute | EC2, Auto Scaling, Lambda, ECS, EKS, Fargate, Elastic Beanstalk, App Runner, Batch, Lightsail |
| Storage | S3, EBS, EFS, FSx, S3 Glacier classes, Storage Gateway, AWS Backup, Snow Family, DataSync |
| Database | RDS, Aurora (incl. Serverless v2, DSQL), DynamoDB, ElastiCache, MemoryDB, Redshift, DocumentDB, Neptune, Keyspaces, Timestream |
| Networking & CDN | VPC, Transit Gateway, PrivateLink, Route 53, CloudFront, ELB, Global Accelerator, Direct Connect, Site-to-Site/Client VPN, Cloud WAN, VPC Lattice |
| Security & identity | IAM, IAM Identity Center, Organizations, KMS, CloudHSM, Secrets Manager, ACM, WAF, Shield, GuardDuty, Inspector, Macie, Security Hub, Detective, Config, CloudTrail, Firewall Manager, Network Firewall, Cognito, Verified Access |
| Management & governance | CloudWatch, CloudTrail, Config, Systems Manager, Control Tower, Service Catalog, Trusted Advisor, Health, License Manager, Compute Optimizer |
| DevOps / IaC | CloudFormation, CDK, CodePipeline, CodeBuild, CodeDeploy, CodeArtifact, ECR, X-Ray, FIS |
| Integration | SQS, SNS, EventBridge, Step Functions, API Gateway, MQ, MSK, AppSync |
| Analytics | Athena, Glue, EMR, Kinesis, Redshift, OpenSearch, QuickSight, Lake Formation, MSK |
| AI/ML | Bedrock, SageMaker AI, Amazon Q, Rekognition, Comprehend, Textract, Transcribe, Polly |
| Migration | Migration Hub, Application Migration Service (MGN), DMS, DataSync, Snowball, Transfer Family |
| Cost | Cost Explorer, Budgets, Cost Anomaly Detection, Savings Plans, Data Exports (CUR) |

Note: **CodeCommit** and **Cloud9** stopped onboarding new customers (2024) — use GitHub/GitLab + IDE of choice. **OpsWorks** reached end of life (2024) — use Systems Manager / Ansible.

## 5. AWS DevOps best practices (summary)
1. Multi-account landing zone (Control Tower), SSO, no IAM users/long-lived keys, OIDC from CI.
2. Everything as code: CloudFormation/CDK/Terraform; pipelines with automated tests & approvals.
3. Multi-AZ by default for prod; backups + cross-region copies; tested DR.
4. Observability: CloudWatch metrics/alarms, structured logs, X-Ray/OpenTelemetry tracing, CloudTrail org trail.
5. Security baseline: GuardDuty, Security Hub, Config, IAM Access Analyzer org-wide; encryption with KMS; least privilege.
6. Cost: tagging, budgets, Savings Plans after rightsizing, Spot for fault-tolerant work, Graviton.
7. Use the [Well-Architected Framework](../Fundamentals/08-cloud-architecture-patterns.md) for reviews.
