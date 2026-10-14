# AWS DevOps, IaC & Monitoring — Complete Notes

> Part of [AWS hub](./aws.md). Related: [`Terraform and CF/`](../../Terraform%20and%20CF), [Observability fundamentals](../Fundamentals/07-cloud-observability.md).

---

## 1. Infrastructure as Code on AWS
| Tool | Language | State | Notes |
|---|---|---|---|
| **CloudFormation** | YAML/JSON templates | Managed by AWS (stacks) | Native, free, drift detection, **change sets**, **StackSets** (multi-account/region), nested stacks, rollback on failure, stack policies, custom resources (Lambda), `cfn-lint`/`cfn-guard` |
| **AWS CDK** | TypeScript/Python/Java/C#/Go | Synthesizes CloudFormation | Constructs (L1/L2/L3 patterns), real programming (loops, classes), `cdk diff/deploy`, CDK Pipelines |
| **Terraform / OpenTofu** | HCL | **State file** (S3 backend + locking — native S3 lockfile, DynamoDB locking deprecated) | Multi-cloud, huge provider ecosystem, modules, plan/apply |
| **AWS SAM** | YAML (CFN extension) | CFN | Serverless apps, local testing (`sam local`) |
| **Pulumi** | General languages | Pulumi state | Multi-cloud |

### Terraform vs CloudFormation
Terraform: cloud-agnostic, explicit `plan`, larger module ecosystem, you manage state (security!), faster new-feature support via provider sometimes. CloudFormation: AWS-native, no state to manage, automatic rollback, StackSets for org-wide baselines, supported by AWS Support, day-0 support for some services via CFN registry. Many orgs: Terraform for infra, CDK/SAM for app-level serverless.

### What happens when a CloudFormation template has an error?
Validation/lint errors fail before deploy (`aws cloudformation validate-template`, cfn-lint). If a resource fails during create/update, the stack **rolls back** to the last known good state automatically (unless `--disable-rollback`/retain-on-failure for debugging) → check **stack events** for the failing resource and reason → fix template → use **change sets** to preview → redeploy. `UPDATE_ROLLBACK_FAILED` may need "continue update rollback" skipping resources. Prevent with linting, cfn-guard policy checks, and change-set review in CI.

### Terraform on AWS — best practices
- Remote state in S3 (versioning, encryption with KMS, Block Public Access, tight bucket policy) with state locking; separate state per environment/component (blast radius).
- Environments via separate directories/workspaces + separate AWS accounts; reusable versioned **modules**.
- Secrets: never hardcode; fetch from Secrets Manager/SSM data sources or generate (`manage_master_user_password` for RDS); mark `sensitive`; remember **state contains secrets**.
- CI/CD: `fmt` → `validate` → `tflint`/`checkov`/`tfsec` → `plan` (posted to PR) → manual approval → `apply` with OIDC role per account. Drift detection with scheduled plans.
- Pin provider/module versions; tag everything via `default_tags`.

## 2. AWS developer tools (CI/CD)
| Service | Role |
|---|---|
| **CodePipeline** | Orchestrates stages (source → build → test → approve → deploy); V2 pipelines with triggers/variables; sources: GitHub/GitLab/Bitbucket (CodeStar Connections), S3, ECR |
| **CodeBuild** | Managed build containers (`buildspec.yml`), pay per minute, can run in VPC, reports, caching |
| **CodeDeploy** | Deploys to **EC2/on-prem** (in-place or blue/green, `appspec.yml` lifecycle hooks), **ECS** (blue/green with traffic shifting), **Lambda** (canary/linear via aliases); automatic rollback on CloudWatch alarms |
| **CodeArtifact** | Package repository (npm, PyPI, Maven, NuGet) |
| **ECR** | Container registry |
| CodeCommit | Git hosting — closed to new customers since 2024 |

```yaml
# buildspec.yml (CodeBuild) - build & push image
version: 0.2
phases:
  pre_build:
    commands:
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REPO
  build:
    commands:
      - docker build -t $ECR_REPO:$CODEBUILD_RESOLVED_SOURCE_VERSION .
  post_build:
    commands:
      - docker push $ECR_REPO:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - printf '[{"name":"app","imageUri":"%s"}]' $ECR_REPO:$CODEBUILD_RESOLVED_SOURCE_VERSION > imagedefinitions.json
artifacts:
  files: imagedefinitions.json
```

**CodeDeploy instance stays idle / deployment stuck** — causes: CodeDeploy agent not installed/running, instance role lacks S3/permissions, wrong tags/ASG in deployment group, no outbound to CodeDeploy endpoints (NAT/VPC endpoint), failing lifecycle hook script (timeouts in `ApplicationStart`/`ValidateService`), health checks failing → check `/var/log/aws/codedeploy-agent/`, deployment events.

**Tracking changes via CI/CD**: Git history + PR reviews, pipeline execution history, immutable artifact versions (image digests), CloudFormation change sets/stack events, Terraform plans stored, CloudTrail for API activity, Config for resource history, deployment markers in CloudWatch dashboards, Jira links.

Zero-downtime deployments on AWS: ALB + rolling with health checks, ECS blue/green via CodeDeploy, Lambda alias traffic shifting, Route 53 weighted, Elastic Beanstalk immutable/blue-green, DB changes backward compatible (expand/contract).

## 3. AWS Systems Manager (SSM)
Session Manager (shell without SSH/bastion, logged), Run Command (run scripts at scale), Patch Manager + Maintenance Windows, State Manager (desired config), **Automation runbooks** (e.g. AMI patching, remediation, deploy apps — `aws ssm start-automation-execution`), Parameter Store, Inventory, Fleet Manager, Distributor (packages), OpsCenter, Incident Manager, Change Manager. Agent (SSM Agent) + instance role `AmazonSSMManagedInstanceCore`.

Automating application deployments with SSM: package app (S3/Distributor) → Automation runbook or Run Command document that pulls, installs, restarts service across tagged instances with rate control/error thresholds → triggered by pipeline/EventBridge.

## 4. Monitoring & observability
### CloudWatch
- **Metrics**: namespaces (AWS/EC2…), dimensions, standard (5-min) vs detailed (1-min) monitoring, custom metrics (`PutMetricData`, embedded metric format), high-resolution (1 s). EC2 memory/disk need the **CloudWatch agent**.
- **Alarms**: static/anomaly-detection thresholds, composite alarms; actions → SNS, Auto Scaling, EC2 recover/stop, SSM OpsItems.
- **Logs**: log groups/streams, retention, metric filters, subscription filters (→ Lambda/Kinesis/OpenSearch), **Logs Insights** queries, Live Tail, Infrequent Access class.
- **Dashboards**, cross-account observability, **Container Insights** (ECS/EKS), **Lambda Insights**, **Application Signals** (APM/SLOs), **Synthetics** canaries, **RUM**, **Internet Monitor**, Contributor Insights.
```bash
fields @timestamp, @message | filter @message like /ERROR/ | stats count() by bin(5m)
```
### X-Ray / OpenTelemetry
Distributed tracing: service map, traces, segments/subsegments, sampling rules, annotations. Recommended: instrument with **AWS Distro for OpenTelemetry (ADOT)** → X-Ray / CloudWatch / AMP.

### Monitoring an application on AWS (answer)
CloudWatch agent / Container Insights for infra metrics & logs → structured app logs to CloudWatch Logs → custom business metrics (EMF) → ALB metrics (5xx, TargetResponseTime, HealthyHostCount) → alarms on SLO-relevant symptoms to SNS → PagerDuty/Slack → X-Ray/OTel tracing for latency root cause → dashboards per service → Synthetics canaries for user journeys → CloudTrail + Config for change correlation. Optionally Prometheus/Grafana (AMP/AMG) for EKS.

## 5. Event-driven ops automation
**EventBridge** rules (e.g. on `EC2 Instance State-change`, GuardDuty finding, Config non-compliance, scheduled cron) → Lambda / SSM Automation / Step Functions for remediation (auto-tag, isolate instance, revoke SG rule, snapshot before termination). **AWS Health** events → notifications. **FIS** (Fault Injection Service) for chaos experiments.
