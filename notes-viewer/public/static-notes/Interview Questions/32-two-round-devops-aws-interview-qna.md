# Two-Round DevOps + AWS Interview (24 Questions) — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. A typical two-round DevOps/AWS loop: round 1 checks fundamentals, round 2 is scenario troubleshooting. 18 of the 24 questions already have full answers elsewhere in the hub, and the tables below link to them. The other 6 are answered in full here.

---

## Round 1: already answered elsewhere

| # | Question | Where |
|---|---|---|
| 1 | Explain your project architecture and CI/CD pipeline | **Answered below**, also [29 Q1](./29-jenkins-k8s-helm-interview-rounds-qna.md), [19 Q10](./19-company-specific-and-behavioral-plus-qna.md) |
| 2 | What is Docker? Image vs container | [03 Q1–3](./03-docker-qna.md) |
| 3 | What is Kubernetes? Its architecture | [04 Q1–4](./04-kubernetes-qna.md) |
| 4 | Pod, Service and Deployment | [04 Q2, Q5, Q6](./04-kubernetes-qna.md) |
| 5 | Rolling vs Blue-Green vs Canary | [14 Q2–4](./14-deployment-systemdesign-behavioral-qna.md), [13 Q18](./13-sre-incident-loadbalancing-servicemesh-qna.md) |
| 6 | What is Terraform? What is the state file? | [06 Q2, Q5](./06-terraform-and-iac-qna.md), [24 Q57–58](./24-aws-deep-dive-qna.md) |
| 7 | Public vs private subnets in AWS | [07 Q7, Q18](./07-aws-cloud-qna.md), [24 Q11](./24-aws-deep-dive-qna.md) |
| 8 | What is IAM? Role vs policy | [07 Q5](./07-aws-cloud-qna.md), [31 Q14](./31-core-devops-scenarios-gap-fill-qna.md) |
| 9 | What is a load balancer and how does it work? | [08 Q12](./08-networking-and-security-fundamentals-qna.md), [07 Q35](./07-aws-cloud-qna.md) |
| 10 | Git branching strategy | [02 Q38, Q44](./02-git-version-control-qna.md) |
| 11 | Monitoring applications in production | [13 Q27](./13-sre-incident-loadbalancing-servicemesh-qna.md), [24 Q82](./24-aws-deep-dive-qna.md), [11](./11-monitoring-logging-observability-qna.md) |
| 12 | What is DNS and how does it work? | [08 Q7](./08-networking-and-security-fundamentals-qna.md), [23 Q14](./23-how-it-works-internals-qna.md) |

## Round 2: already answered elsewhere

| # | Question | Where |
|---|---|---|
| 1 | Scaling an application in Kubernetes | [04 Q30](./04-kubernetes-qna.md), [23 Q5](./23-how-it-works-internals-qna.md), [28 Q6](./28-production-scenarios-rapid-round-qna.md) |
| 2 | Securing container images in Kubernetes | [03 Q38](./03-docker-qna.md), [12 Q14](./12-security-devsecops-qna.md), [28 Q19](./28-production-scenarios-rapid-round-qna.md), [20 Q20](./20-devops-roadmap-gap-fill-qna.md) |
| 3 | Role of Amazon CloudFront in an architecture | [23 Q13](./23-how-it-works-internals-qna.md), [07 Q35](./07-aws-cloud-qna.md) |
| 9 | Kubernetes can't expose a pod | [04 Q62](./04-kubernetes-qna.md), [20 Q14](./20-devops-roadmap-gap-fill-qna.md), [28 Q8](./28-production-scenarios-rapid-round-qna.md) |
| 10 | Pods running but users get 503s | [31 Q5](./31-core-devops-scenarios-gap-fill-qna.md), [13 Q24](./13-sre-incident-loadbalancing-servicemesh-qna.md), [20 Q14](./20-devops-roadmap-gap-fill-qna.md) |
| 11 | Terraform apply failed midway | [06 Q26](./06-terraform-and-iac-qna.md), [31 Q20](./31-core-devops-scenarios-gap-fill-qna.md) |
| 12 | Secrets across multiple environments | [28 Q18](./28-production-scenarios-rapid-round-qna.md), [20 Q11, Q24](./20-devops-roadmap-gap-fill-qna.md) |

---

## Table of Contents
1. [R1-01. Explain your project architecture and CI/CD pipeline.](#r1-01-explain-your-project-architecture-and-cicd-pipeline)
2. [R2-04. How do you design disaster recovery for Amazon RDS?](#r2-04-how-do-you-design-disaster-recovery-for-amazon-rds)
3. [R2-05. A developer cannot access an S3 bucket. What will you check?](#r2-05-a-developer-cannot-access-an-s3-bucket-what-will-you-check)
4. [R2-06. You are facing latency issues in an EKS cluster. How do you troubleshoot?](#r2-06-you-are-facing-latency-issues-in-an-eks-cluster-how-do-you-troubleshoot)
5. [R2-07. AWS Lambda is failing internally. What are your debugging steps?](#r2-07-aws-lambda-is-failing-internally-what-are-your-debugging-steps)
6. [R2-08. CI/CD pipeline is not able to connect to GitLab. What will you check?](#r2-08-cicd-pipeline-is-not-able-to-connect-to-gitlab-what-will-you-check)

---

## 🔹 Round 1

### R1-01. Explain your project architecture and CI/CD pipeline.
Keep it to about 2 minutes: **what the product does → architecture → pipeline → your part → one number**. Then let them dig. A sample answer to adapt to your real project:

**Product and scale.** "An e-commerce order platform: about 12 microservices, around 2k requests/second at peak, on AWS."

**Architecture (go from the user inward):**
```
Users → Route 53 → CloudFront (+ WAF) → ALB (public subnets)
      → EKS (private subnets, 3 AZs): Ingress → services (orders, payments, catalog...)
      → RDS PostgreSQL Multi-AZ, ElastiCache Redis, SQS for async jobs, S3 for files
Observability: Prometheus + Grafana, Loki for logs, OpenTelemetry traces, alerts to PagerDuty
Security: IRSA for pod IAM, Secrets Manager + External Secrets, private ECR, NAT for egress
Infra: everything in Terraform (modules per component, S3 remote state with locking)
```

**Pipeline:**
1. **PR**: GitHub Actions (or GitLab CI/Jenkins) runs lint, unit tests, SonarQube, dependency scan (SCA), and a `terraform plan` if infra changed. Branch protection requires it to pass plus one review.
2. **Merge to main**: build the image **once**, tag it with the git SHA, scan it with Trivy (fail on critical), sign it with cosign, push to ECR.
3. **Deploy**: the pipeline updates the image tag in the GitOps repo, and **Argo CD** syncs it to dev automatically. Smoke tests run.
4. **Promote**: the same image goes to staging (integration/E2E tests), then prod after a manual approval. Prod uses an **Argo Rollouts canary** (10% → 50% → 100%) with automatic rollback if error rate or latency crosses the SLO.
5. **Infra changes**: a separate Terraform pipeline. `plan` on the PR, `apply` only from CI after approval, never from a laptop.

**Your part (say "I", not "we").** "I built the Terraform modules for EKS and RDS, moved us from Jenkins push-deploys to Argo CD, and added the canary analysis. Deploy time went from 45 minutes to 12, and failed deploys now roll back automatically."

**Follow-ups to prepare for:** why EKS rather than ECS, how secrets reach pods, how a rollback works, how DB migrations are handled during a deploy, what you'd change next.

*See also: [29 Q1](./29-jenkins-k8s-helm-interview-rounds-qna.md), [19 Q10](./19-company-specific-and-behavioral-plus-qna.md), [14 Q14](./14-deployment-systemdesign-behavioral-qna.md).*

---

## 🔹 Round 2

### R2-04. How do you design disaster recovery for Amazon RDS?
**Start from RTO and RPO.** How long can the DB be down (RTO), and how much data can you lose (RPO)? Then pick the cheapest layer that meets them. Also separate **HA** (an AZ fails) from **DR** (a region fails, or the data gets corrupted).

| Layer | Protects against | RPO / RTO | Notes |
|---|---|---|---|
| **Multi-AZ** (standby or Multi-AZ DB cluster) | Instance or AZ failure | RPO ≈ 0 (synchronous), RTO ~60–120 s (cluster: ~35 s) | Automatic failover. The DNS endpoint stays the same. **Not** a backup: a bad `DELETE` is copied to the standby too |
| **Automated backups + PITR** | Corruption, bad deploy, accidental delete | RPO ~5 min, RTO = restore time (minutes to hours, depends on size) | Retention 1–35 days. Restores to a **new** instance |
| **Manual / AWS Backup snapshots, copied cross-region and cross-account** | Region loss, ransomware, account compromise | RPO = snapshot frequency, RTO = hours | Use AWS Backup **Vault Lock** for immutability. The copy needs a KMS key in the target region |
| **Cross-region read replica** | Region loss | RPO = seconds (async lag), RTO = minutes (promote it) | Pilot-light / warm standby. Promoting it is a manual step and one-way |
| **Aurora Global Database** | Region loss at scale | RPO ~1 s, RTO < 1 min (managed failover) | Up to 5 secondary regions. Managed switchover/failover |

**A typical production design:** Multi-AZ in the primary region, PITR with 14–35 days of retention, daily snapshots copied to a **separate backup account in a second region**, and either a cross-region read replica or Aurora Global DB if RTO must be minutes.

**Things that make DR actually work:**
- **The app has to follow the failover.** Use the cluster/Route 53 endpoint rather than hardcoded hosts, set short DNS TTLs and connection retry/backoff, and make sure secrets (Secrets Manager replicated to the DR region), parameter groups, and security groups already exist in the DR region. Keep all of it in Terraform.
- **Encryption**: KMS multi-Region keys, or re-encrypt when copying, or the snapshot can't be restored there.
- **Test it**: do restore drills every quarter, measure the real RTO, and check the restored data. A backup you've never restored is a guess.
- **Runbook**: who decides to fail over, the steps to promote the replica, how to point the app at it, and how to **fail back** (rebuild replication in the other direction).

*See also: [07 Q28](./07-aws-cloud-qna.md), [27 Q6](./27-cloud-architecture-scenarios-qna.md), [24 Q21](./24-aws-deep-dive-qna.md), [`../Backup and Disaster Recovery/`](../Backup%20and%20Disaster%20Recovery/database-backup-and-restore.md).*

---

### R2-05. A developer cannot access an S3 bucket. What will you check?
**First get the exact error and the exact identity.** "Can't access" could mean `AccessDenied` (403), `NoSuchBucket` (404), a timeout, or a wrong-region error.
```bash
aws sts get-caller-identity                 # who am I, really? (profile/role mix-ups are common)
aws s3 ls s3://acme-data/reports/ --debug   # the full error, and which endpoint/region is used
```

**Then go through AWS's policy evaluation. Access is allowed only if something allows it and nothing denies it:**
1. **Identity policy** on the user or role: is `s3:GetObject`/`s3:ListBucket` allowed? Is the resource ARN right? `ListBucket` needs `arn:aws:s3:::bucket`, while object actions need `arn:aws:s3:::bucket/*`. Mixing these up is the most common bug.
2. **Bucket policy**: is there an explicit `Deny`? Common ones are `aws:SecureTransport`, `aws:SourceVpce` (only allowed from a VPC endpoint), `aws:SourceIp`, or `aws:PrincipalOrgID`. An explicit deny overrides every allow.
3. **SCPs / RCPs** at the Organization level, and **permission boundaries** on the role, can block it even when the policies above allow it.
4. **KMS**: if the bucket uses SSE-KMS, the caller also needs `kms:Decrypt` (and `kms:GenerateDataKey` for uploads) **in the key policy**. The error often still looks like a plain S3 `AccessDenied`.
5. **Cross-account**: both sides must allow it (the identity policy in account A **and** the bucket policy in account B). Also check object ownership: with ACLs enabled, objects uploaded by another account may belong to that account. Use "Bucket owner enforced".
6. **Block Public Access**: only matters if they expect public/anonymous access.
7. **VPC endpoint policy**: if traffic goes through a gateway endpoint, its policy can restrict which buckets are reachable.
8. **Session details**: expired SSO credentials, MFA required by a `Condition`, or the wrong profile being used.

**If it's a timeout rather than a 403**, it's network, not IAM: a private subnet with no NAT or S3 endpoint, a route table missing the endpoint, or a proxy.
**If it's 404 / wrong region**: check the bucket name and region (`aws s3api get-bucket-location`).

**Tools that save time:** **IAM Policy Simulator**, the `AccessDenied` message itself (newer errors name the policy type that denied it, e.g. "explicit deny in a service control policy"), and **CloudTrail** (S3 data events) showing the exact principal and `errorCode`.

**Fix** with the narrowest grant (a specific prefix, read-only), preferably through a role or group rather than per-user policies.

*See also: [24 Q10, Q29](./24-aws-deep-dive-qna.md), [07 Q16](./07-aws-cloud-qna.md), [31 Q14](./31-core-devops-scenarios-gap-fill-qna.md).*

---

### R2-06. You are facing latency issues in an EKS cluster. How do you troubleshoot?
**1. Scope it.** All services or one? All pods or pods on certain nodes or AZs? Constant or spiky? Did it start after a deploy, a node group change, or an add-on upgrade? Compare ALB `TargetResponseTime` with the app's own latency to see if the time is in front of or inside the cluster.

**2. Find the slow hop with traces** (X-Ray / OpenTelemetry). Is it the app, a DB call, a call to another service, or DNS?

**3. Check the EKS-specific suspects:**

| Suspect | What to check |
|---|---|
| **CPU throttling** | `container_cpu_cfs_throttled_periods_total` high because CPU limits are too tight, even though node CPU looks idle. Raise or remove CPU limits |
| **Noisy neighbors / node pressure** | `kubectl top nodes`, node CPU steal, memory pressure, disk I/O. Burstable `t3` instances running out of CPU credits |
| **CoreDNS** | DNS lookup time in traces. `ndots:5` making every external name try 4–5 search domains first, too few CoreDNS replicas, `conntrack` races on UDP. Fixes: NodeLocal DNSCache, FQDNs ending in a dot, `ndots: 2`, scale CoreDNS |
| **Cross-AZ traffic** | Service calls going to pods in other AZs add ~1–2 ms per hop and cost money. Use topology-aware routing (`trafficDistribution: PreferClose`) |
| **Extra network hops** | ALB in instance mode → NodePort → kube-proxy → another node. Switch to IP target mode |
| **VPC CNI / IPs** | Pods slow to start because the subnet ran out of IPs or ENI limits were hit (shows during scaling). Prefix delegation or bigger subnets |
| **kube-proxy / conntrack** | `nf_conntrack` table full (dropped packets in `dmesg`), large iptables rule sets. IPVS mode or Cilium eBPF |
| **Autoscaling lag** | HPA reacting late because it scales on CPU, and new nodes take minutes. Scale on RPS/queue depth, use Karpenter, keep some headroom |
| **Dependencies** | RDS connections or CPU, ElastiCache evictions, NAT gateway port exhaustion (`ErrorPortAllocation`) |
| **Service mesh** | Sidecar CPU limits too low, mTLS overhead, retries making a slow upstream slower |

**4. Narrow it down.** `kubectl exec` into a pod, `curl` the service directly by pod IP, then by Service name, and compare timing (`curl -w '%{time_namelookup} %{time_connect} %{time_total}'`). The step where time jumps tells you the layer.

**5. Fix and prevent.** Mitigate (roll back, scale out, raise limits), then fix the root cause and add an alert on the signal that showed it (p99 latency by service, throttling, DNS latency).

*See also: [31 Q16](./31-core-devops-scenarios-gap-fill-qna.md), [28 Q15](./28-production-scenarios-rapid-round-qna.md), [13 Q25](./13-sre-incident-loadbalancing-servicemesh-qna.md), [30 Q10](./30-azure-production-scenarios-qna.md).*

---

### R2-07. AWS Lambda is failing internally. What are your debugging steps?
**1. Get the error from logs and metrics.**
- **CloudWatch Logs** (`/aws/lambda/<fn>`): the stack trace, and the `REPORT` line showing `Duration`, `Max Memory Used` and `Init Duration`.
- **CloudWatch metrics**: `Errors`, `Throttles`, `Duration` (close to the timeout?), `ConcurrentExecutions`, and `IteratorAge` / `DeadLetterErrors` for stream or async sources.
- **X-Ray / OpenTelemetry**: which downstream call is slow or failing.
```bash
aws logs tail /aws/lambda/orders-fn --since 30m --filter-pattern '?ERROR ?Task ?timed'
```

**2. Match the symptom to the usual cause:**

| Symptom | Likely cause |
|---|---|
| `Task timed out after N seconds` | A downstream call hangs (DB, API). In a VPC with no NAT/VPC endpoint, calls to AWS APIs or the internet hang until the timeout. Check timeouts and network path |
| `Runtime exited with error: signal: killed` / max memory = configured memory | Out of memory. Raise memory (this also gives more CPU) |
| `AccessDeniedException` | The **execution role** is missing a permission (S3, DynamoDB, KMS, Secrets Manager) |
| `Runtime.ImportModuleError` / handler not found | Packaging problem: wrong handler name, missing dependency, built on the wrong architecture (arm64 vs x86_64), layer version mismatch |
| `Throttles` / `TooManyRequestsException` | Concurrency limit reached (account limit or reserved concurrency) |
| Errors right after deploy | The new version is bad. Compare against the previous version/alias |
| Only the first request is slow or failing | Cold start: long init (heavy imports, secrets fetched at init). Provisioned concurrency or SnapStart |
| DB `too many connections` | Each concurrent Lambda opens its own connection. Use RDS Proxy |

**3. Check the configuration:** timeout, memory, environment variables (a wrong endpoint or a missing secret ARN), VPC subnets/security groups, the execution role, KMS access for encrypted env vars, and the **event source**: SQS visibility timeout must be greater than the function timeout, batch size, partial batch failure reporting.

**4. Reproduce it.** Invoke with the failing event (`aws lambda invoke --payload file://event.json out.json`), or locally with `sam local invoke`. For async invocations, get the failing event from the **DLQ / on-failure destination**.

**5. Recover and harden.** Roll back by pointing the alias to the previous version, or use CodeDeploy traffic shifting with an alarm-based rollback. Make handlers **idempotent**, since async and stream invocations retry, so the same event can be processed more than once. Add alarms on `Errors`, `Throttles` and `Duration` near the timeout.

*See also: [24 Q30](./24-aws-deep-dive-qna.md), [07 Q10, Q32](./07-aws-cloud-qna.md).*

---

### R2-08. CI/CD pipeline is not able to connect to GitLab. What will you check?
**First, which direction is failing?** There are three different problems:
- **Runner → GitLab** (runner can't pick up jobs or register)
- **Job → GitLab** (`git clone`/fetch fails inside a job, or pushing a tag or calling the API fails)
- **GitLab → CI server** (a webhook from GitLab to Jenkins/Argo CD isn't arriving)

Read the exact error: `Could not resolve host`, `Connection timed out`, `SSL certificate problem`, `HTTP 401/403`, `Permission denied (publickey)`. Each one points to a different layer.

**Check from the runner/agent host, one layer at a time:**
```bash
nslookup gitlab.example.com                       # DNS (private hosted zone? split-horizon DNS?)
nc -vz gitlab.example.com 443; nc -vz gitlab.example.com 22   # network / firewall / security groups
curl -v https://gitlab.example.com/api/v4/version  # TLS + HTTP; shows cert and proxy problems
ssh -T git@gitlab.example.com                      # SSH key auth, if cloning over SSH
```

| Layer | What to check |
|---|---|
| **GitLab itself** | Is it up? Status page or maintenance window. Rate limiting (HTTP 429) |
| **DNS** | Runner using a resolver that can't see the private GitLab hostname |
| **Network** | Security group / NACL / firewall rules for 443 and 22 (often 22 is blocked and only 443 is open, so use HTTPS clone or SSH over 443). Runner in a private subnet with no NAT. IP allowlist on GitLab that doesn't include the runner's egress IP (it changes when the NAT changes) |
| **Proxy** | Corporate proxy: `HTTPS_PROXY`/`NO_PROXY` set for the runner service **and** inside job containers. Git has its own `http.proxy` setting |
| **TLS** | Self-signed or internal-CA cert not trusted: add the CA to the runner (`tls-ca-file` in `config.toml`) and to job images. Expired cert. Don't fix it with `GIT_SSL_NO_VERIFY` |
| **Authentication** | Expired or revoked **runner token**, PAT, deploy key or deploy token. The `CI_JOB_TOKEN` not allowed to access another project (job token allowlist). SAML/SSO enforcement. Revoked SSH key, or host key changed (`known_hosts`) |
| **Permissions** | Token scope missing (`read_repository`, `write_repository`, `api`). User/bot lost project membership. Protected branch or tag blocking the push |
| **Runner config** | Wrong `url` in `config.toml`, runner paused or locked to another project, tags don't match the job, runner version too old for the GitLab version |
| **Webhooks** (GitLab → Jenkins) | GitLab → project → Webhooks → **Recent events** shows the response code. The CI server must be reachable from GitLab, the secret token must match, and GitLab may block webhooks to local network addresses by default (an admin setting) |

**Fix and prevent:** rotate expired tokens and put them in a secrets manager with expiry alerts, prefer **short-lived tokens** (`CI_JOB_TOKEN`, OIDC) over long-lived PATs, put the runner's egress through a fixed NAT IP if GitLab uses an allowlist, and add a synthetic check from the runner network to GitLab.

*See also: [28 Q9](./28-production-scenarios-rapid-round-qna.md), [05 Q20](./05-cicd-jenkins-github-actions-qna.md), [22 Q10](./22-windows-proxy-vapt-jira-qna.md) (proxy issues).*

---

*Back to the [Interview Questions hub](./README.md).*
