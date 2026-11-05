# Senior Platform Design & Production Scenarios — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Two question sets: a 20-question senior scenario set (13 answered elsewhere and linked below, 7 answered here) and a 20-question core fundamentals set (19 answered elsewhere and linked below, 1 answered here). Answers are structured the way you'd talk through them in a design or troubleshooting round.

## Already answered elsewhere — senior scenario set
| # | Question | Where |
|---|---|---|
| 3 | Zero-downtime Kubernetes cluster upgrade in production | [04 Q47](./04-kubernetes-qna.md), [33 Q55](./33-platform-engineering-deep-dive-qna.md), [39 K8-5](./39-ansible-aws-fintech-production-scenarios-qna.md) |
| 6 | CI/CD pipeline takes 30 minutes; get it under 5 | [05 Q24](./05-cicd-jenkins-github-actions-qna.md), [30 Q03](./30-azure-production-scenarios-qna.md) |
| 7 | Rollback strategy that works even if the deployment stage fails | [05 Q27, Q31](./05-cicd-jenkins-github-actions-qna.md), [30 Q12](./30-azure-production-scenarios-qna.md), [39 CI-6](./39-ansible-aws-fintech-production-scenarios-qna.md), [43 Q18](./43-k8s-health-checks-mid-level-sre-qna.md) |
| 8 | Multi-environment CI/CD without configuration drift | [38 R-2](./38-vpc-terraform-grafana-linux-scenarios-qna.md), [20 Q10](./20-devops-roadmap-gap-fill-qna.md), [28 Q14](./28-production-scenarios-rapid-round-qna.md) |
| 10 | Terraform partially created infrastructure before failing | [06 Q26](./06-terraform-and-iac-qna.md) |
| 12 | Securing secrets for 100+ microservices | [28 Q18](./28-production-scenarios-rapid-round-qna.md), [20 Q3, Q11](./20-devops-roadmap-gap-fill-qna.md), [43 Q15](./43-k8s-health-checks-mid-level-sre-qna.md) |
| 13 | SLO-based alerting that minimises alert fatigue | [20 Q17](./20-devops-roadmap-gap-fill-qna.md), [11 Q21](./11-monitoring-logging-observability-qna.md), [28 Q17](./28-production-scenarios-rapid-round-qna.md) |
| 14 | Correlating logs, metrics and traces during an incident | [28 Q16](./28-production-scenarios-rapid-round-qna.md), [23 Q18](./23-how-it-works-internals-qna.md), [35 Q6](./35-observability-rca-scripting-go-qna.md) |
| 16 | Handling cascading failures across microservices | [42 Q3](./42-system-design-staff-sre-qna.md), [38 R-10](./38-vpc-terraform-grafana-linux-scenarios-qna.md), [13 Q15](./13-sre-incident-loadbalancing-servicemesh-qna.md), [43 Q02](./43-k8s-health-checks-mid-level-sre-qna.md) |
| 17 | Cloud bill up 40% overnight | [39 OB-4](./39-ansible-aws-fintech-production-scenarios-qna.md), [07 Q27](./07-aws-cloud-qna.md), [20 Q22](./20-devops-roadmap-gap-fill-qna.md) |
| 18 | DR strategy with defined RTO and RPO | [27 Q6](./27-cloud-architecture-scenarios-qna.md), [07 Q28](./07-aws-cloud-qna.md), [20 Q5, Q21](./20-devops-roadmap-gap-fill-qna.md) |
| 19 | Deploy succeeds but latency goes from 80 ms to 2 s | [28 Q21](./28-production-scenarios-rapid-round-qna.md), [35 Q14](./35-observability-rca-scripting-go-qna.md), [13 Q25](./13-sre-incident-loadbalancing-servicemesh-qna.md) |
| 20 | Most challenging production incident + architectural follow-ups | [14 Q17](./14-deployment-systemdesign-behavioral-qna.md), [35 Q18, Q20](./35-observability-rca-scripting-go-qna.md) (RCA structure + sample STAR answer) |


## Already answered elsewhere — core fundamentals set
| # | Question | Where |
|---|---|---|
| 1 | How a CI/CD pipeline works end to end (commit → production) | [23 Q10–Q11](./23-how-it-works-internals-qna.md), [05 Q35](./05-cicd-jenkins-github-actions-qna.md), [29 Q1](./29-jenkins-k8s-helm-interview-rounds-qna.md) |
| 2 | What happens internally when you run a Docker container | [23 Q6–Q7](./23-how-it-works-internals-qna.md) |
| 3 | How Kubernetes schedules Pods on nodes | [23 Q1](./23-how-it-works-internals-qna.md), [04 Q44](./04-kubernetes-qna.md) |
| 4 | Causes of CrashLoopBackOff and how to debug it | [04 Q37, Q49–Q50](./04-kubernetes-qna.md), [28 Q05](./28-production-scenarios-rapid-round-qna.md) |
| 5 | Readiness vs liveness probes | [04 Q15](./04-kubernetes-qna.md), [23 Q4](./23-how-it-works-internals-qna.md), [43 Q01–Q11](./43-k8s-health-checks-mid-level-sre-qna.md) |
| 6 | Kubernetes architecture (API server, scheduler, etcd) | [04 Q3–Q4, Q45](./04-kubernetes-qna.md) |
| 7 | How service discovery works in Kubernetes | [23 Q3](./23-how-it-works-internals-qna.md), [43 Q12, Q25](./43-k8s-health-checks-mid-level-sre-qna.md) |
| 8 | What happens internally on `kubectl apply` | [23 Q2](./23-how-it-works-internals-qna.md), [04 Q21](./04-kubernetes-qna.md) |
| 9 | Deployment vs StatefulSet vs DaemonSet | [04 Q5, Q18–Q19](./04-kubernetes-qna.md) |
| 10 | Configuration management across environments | [38 R-2](./38-vpc-terraform-grafana-linux-scenarios-qna.md), [20 Q10](./20-devops-roadmap-gap-fill-qna.md), [09 Q17](./09-ansible-and-config-management-qna.md), [43 Q14](./43-k8s-health-checks-mid-level-sre-qna.md) |
| 11 | How Terraform manages state and dependencies internally | [23 Q8–Q9](./23-how-it-works-internals-qna.md), [06 Q5, Q12, Q17](./06-terraform-and-iac-qna.md) |
| 12 | Terraform drift and how to detect it | [06 Q20](./06-terraform-and-iac-qna.md), [28 Q14](./28-production-scenarios-rapid-round-qna.md), [39 TF-3](./39-ansible-aws-fintech-production-scenarios-qna.md) |
| 13 | Designing IaC for multiple environments | [06 Q22](./06-terraform-and-iac-qna.md), [38 R-2](./38-vpc-terraform-grafana-linux-scenarios-qna.md) |
| 14 | How DNS resolution works step by step | [23 Q14](./23-how-it-works-internals-qna.md), [08 Q7](./08-networking-and-security-fundamentals-qna.md), [01 Q68](./01-linux-and-scripting-qna.md) |
| 15 | Layer 4 vs Layer 7 load balancers | [08 Q14](./08-networking-and-security-fundamentals-qna.md), [23 Q12](./23-how-it-works-internals-qna.md) |
| 16 | App is slow under load: finding the bottleneck | [31 Q16](./31-core-devops-scenarios-gap-fill-qna.md), [28 Q15](./28-production-scenarios-rapid-round-qna.md), [41 Q2](./41-linux-programming-dsa-gap-fill-qna.md) |
| 17 | Designing monitoring and alerting for production | [11 Q21, Q23](./11-monitoring-logging-observability-qna.md), [20 Q17](./20-devops-roadmap-gap-fill-qna.md), [35 Q8](./35-observability-rca-scripting-go-qna.md) |
| 19 | Zero-downtime deployment strategies | [28 Q10](./28-production-scenarios-rapid-round-qna.md), [04 Q59](./04-kubernetes-qna.md), [14](./14-deployment-systemdesign-behavioral-qna.md), [30 Q14](./30-azure-production-scenarios-qna.md) (DB migrations) |
| 20 | Production system is down: step-by-step debugging | [23 Q19](./23-how-it-works-internals-qna.md), [13 Q12](./13-sre-incident-loadbalancing-servicemesh-qna.md), [31 Q19](./31-core-devops-scenarios-gap-fill-qna.md) |

Not covered before, answered below: **#18 secure authentication between services** → [Q08](#08-how-do-you-implement-secure-authentication-between-services).

---

## Table of Contents
1. [Design a multi-region Kubernetes architecture for high availability](#01-how-would-you-design-a-multi-region-kubernetes-architecture-for-high-availability)
2. [Cluster is healthy, but requests intermittently return 503](#02-your-kubernetes-cluster-is-healthy-but-requests-intermittently-return-503-how-would-you-troubleshoot-it)
3. [Migrate a stateful application to Kubernetes with minimal downtime](#03-how-would-you-migrate-a-stateful-application-to-kubernetes-with-minimal-downtime)
4. [Design a GitOps workflow for 20+ teams with independent release cycles](#04-design-a-gitops-workflow-for-20-teams-with-independent-release-cycles)
5. [Terraform state is 300 MB and planning takes 15 minutes](#05-terraform-state-is-300-mb-and-planning-takes-15-minutes-how-would-you-optimise-it)
6. [Runtime security beyond image vulnerability scanning](#06-how-do-you-implement-runtime-security-beyond-image-vulnerability-scanning)
7. [Design a self-healing platform for critical production services](#07-design-a-self-healing-platform-for-critical-production-services)
8. [Implement secure authentication between services](#08-how-do-you-implement-secure-authentication-between-services)

---

### 01. How would you design a multi-region Kubernetes architecture for high availability?
**Start by clarifying the target**, because it changes the whole design: what RTO/RPO? Active-active or active-passive? Do users need to be served from the nearest region (latency) or is this purely for resilience? Any data-residency rules?

**1. One independent cluster per region, never a stretched cluster.**
etcd needs low-latency quorum, so a single control plane across regions is fragile and has one global blast radius. Run separate clusters (EKS/GKE/AKS) per region that share **nothing at runtime** and can each survive alone. Within each region, the normal HA rules apply: nodes in 3 AZs, `topologySpreadConstraints` across zones, PDBs, at least 2–3 replicas per service.

**2. Global traffic layer.**
| Option | Notes |
|---|---|
| DNS-based (Route 53 latency/failover/weighted records with health checks, Azure Traffic Manager) | Simple; failover speed is bounded by TTL and client DNS caching, so keep TTL ~30–60 s |
| Anycast (AWS Global Accelerator, Cloudflare, GCP global LB / multi-cluster Gateway, Azure Front Door) | Fails over in seconds with no DNS caching problem; better for strict RTOs |

Health checks should hit a **deep regional health endpoint** (can this region actually serve a request end to end?), not just "the LB is up".

**3. The data layer is the hard part.** Stateless services are easy to run active-active. Data decides your real RPO:
- **Active-active**: globally distributed databases (DynamoDB global tables, Spanner, Cosmos DB, CockroachDB). Watch for write conflicts (last-writer-wins) and design data ownership accordingly.
- **Active-passive**: a primary region for writes with async replicas elsewhere (Aurora Global Database, cross-region read replicas). RPO is seconds of replication lag; failover means promoting the replica.
- Caches and queues stay **regional**; don't make synchronous cross-region calls on the request path.
- Object storage: cross-region replication.

**4. Deploy identically everywhere with GitOps.**
Argo CD ApplicationSets with a **cluster generator** (or Flux per cluster) deploy the same manifests to every region, with small per-region overlays. Roll out **one region at a time** (canary region first), so a bad release never hits every region together.

**5. Make each region truly self-sufficient.**
Everything a region needs to boot and run must be local: container images (ECR cross-region replication or a regional pull-through cache), secrets (replicated Secrets Manager secrets, multi-region KMS keys), DNS, CI-independent deploy capability, and observability. A common hidden failure: region B can't start Pods during region A's outage because images or secrets only live in region A.

**6. Capacity for failover.**
If region A fails, region B gets its traffic. Either keep each region at ~N+1 capacity (expensive) or rely on fast autoscaling (Karpenter) with headroom, and check that you have the **cloud quotas** in the failover region to scale that far.

**7. Observability and operations.**
Per-region dashboards and SLOs, plus a global view. Alerts should say *which region* is unhealthy. Run **failover game days** regularly: an untested failover plan fails when you need it.

**Optional extras:** multi-cluster service mesh (Istio multi-primary) for cross-region service failover, though it adds a lot of complexity; **cell-based architecture** to limit blast radius even within a region ([42 Q9](./42-system-design-staff-sre-qna.md)).

> Summary line: "Independent regional clusters, a global traffic layer with real health checks, GitOps rolling out region by region, every region self-sufficient, and a data strategy chosen explicitly from the RPO. The data layer drives the design."

See also: [13 Q20](./13-sre-incident-loadbalancing-servicemesh-qna.md) (what has to be true for regional failover to work), [08 Q25](./08-networking-and-security-fundamentals-qna.md) (multi-region DNS).

---

### 02. Your Kubernetes cluster is healthy, but requests intermittently return 503. How would you troubleshoot it?
"Intermittent" plus "cluster healthy" usually means a **timing or subset problem**: some Pods, some moments (rollouts, scale-down), or some connections. (General 503 triage: [13 Q24](./13-sre-incident-loadbalancing-servicemesh-qna.md). Mesh 503s: [33 Q51](./33-platform-engineering-deep-dive-qna.md).)

**Step 1 — Characterise the pattern before guessing.**
- What percentage of requests, and is it steady or bursty?
- Does it **correlate with events**: deploys, HPA scale-down, node consolidation (Karpenter), node drains, ingress controller reloads, cron jobs?
- Is it **one Pod / one node / one AZ**? Break the 5xx rate down by `pod`, `node` and `zone` labels. "1 in 5 requests fails" with 5 replicas is one bad Pod.

**Step 2 — Find which layer generates the 503.**
- Response `Server` header and body (ALB, NGINX, Envoy and app 503 pages look different).
- **ALB access logs**: `elb_status_code` vs `target_status_code`. ELB 503 with no target code = the LB had no healthy target; target 503 = the app returned it.
- **NGINX ingress logs**: `upstream_addr`, `upstream_status`, "no live upstreams".
- **Envoy/Istio**: the response flags tell you exactly why: `UH` (no healthy upstream), `UO` (circuit breaker overflow), `UF` (upstream connection failure), `URX` (retries exhausted), `UC` (upstream connection termination).

**Step 3 — Check the usual suspects:**
| Cause | Signature | Fix |
|---|---|---|
| **Termination race during rollouts/scale-down** | Errors spike on every deploy or scale-in | The Pod exits before kube-proxy/ingress/ALB stop sending it traffic. Add a `preStop` sleep (5–15 s), handle SIGTERM gracefully, set `terminationGracePeriodSeconds` above that, use ALB readiness gates ([43 Q11](./43-k8s-health-checks-mid-level-sre-qna.md)) |
| **Readiness flapping** | Pods go Ready/NotReady under load; endpoints count fluctuates | Probe timeouts too tight, CPU throttling, or the probe checks a dependency ([43 Q04, Q10](./43-k8s-health-checks-mid-level-sre-qna.md)) |
| **Keep-alive / idle timeout mismatch** | Sporadic 502/503 at low traffic, on reused connections | The app's idle timeout is shorter than the proxy's, so the proxy reuses a connection the app already closed. Make the app's keep-alive timeout **longer** than the LB/ingress idle timeout |
| **Overload / limits** | 503s at peak; app or mesh rejects work | App-level load shedding, Envoy circuit breaker limits (`maxConnections`, `maxPendingRequests`) too low, connection pool exhausted. Scale earlier (HPA on RPS/latency), raise limits deliberately |
| **One unhealthy Pod still in rotation** | Errors only from one Pod/node | Readiness doesn't detect that Pod's failure mode. Fix the probe; mesh outlier detection can eject it automatically |
| **Outlier detection ejecting too much** | `UH` flags while Pods look fine | Envoy ejected several hosts; tune `maxEjectionPercent` and consecutive-error thresholds |
| **Zonal imbalance** | Errors in one AZ only | Target group with no healthy targets in an AZ when cross-zone load balancing is off; topology-aware routing sending traffic to a zone with too few Pods |
| **Upstream dependency** | App returns 503 itself | App passes through a dependency's failure. Trace a failing request to see where |

**Step 4 — Prove it.** Reproduce with load (`hey`/`k6`) while doing a rolling restart; compare error rates before and after the fix. Add an SLO alert on the 5xx ratio so the next regression is caught automatically.

---

### 03. How would you migrate a stateful application to Kubernetes with minimal downtime?
**First, challenge the premise.** For a production database, a managed service (RDS/Aurora, Cloud SQL, Azure Database) is often better than running it in Kubernetes. Moving it to K8s makes sense when you need portability, the same platform on-prem and in cloud, or there's no managed equivalent. Say this, then answer the question.

**1. Prepare the target.**
- Use a mature **operator** rather than a hand-written StatefulSet: CloudNativePG / Crunchy (Postgres), Percona or MySQL Operator, Strimzi (Kafka), ECK (Elasticsearch). They handle replication, failover, backups and upgrades.
- **Storage**: a StorageClass with the right performance (e.g. gp3 with provisioned IOPS), `volumeBindingMode: WaitForFirstConsumer` (so volumes are created in the AZ where the Pod is scheduled), `allowVolumeExpansion: true`, and `reclaimPolicy: Retain` for data you can't lose.
- **HA**: replicas spread across AZs (anti-affinity / topology spread), a PDB, a dedicated node pool with taints, Guaranteed QoS so it's never evicted first.
- **Backups and restore tested** in the new environment *before* migration (e.g. CloudNativePG to S3 with PITR, Velero for volumes).

**2. Add an indirection layer for clients first.** Point applications at a name you control (a DNS CNAME, or a K8s `ExternalName` Service) that currently resolves to the old database. Cutover then becomes a DNS/config switch, not a redeploy of every client.

**3. Move the data with replication, not a dump-and-restore.** The goal is to make downtime independent of data size:
- Set up the new instance in K8s as a **replica** of the existing one: native replication (Postgres streaming or logical replication, MySQL replication), or CDC (AWS DMS, Debezium) when versions or engines differ.
- Let it catch up and keep syncing. Verify data: row counts, checksums (`pt-table-checksum` for MySQL), application read tests against the replica.
- For file-based state: `rsync` a full copy while live, then a final short delta sync during the window.

**4. Cutover (minutes, rehearsed in staging first).**
1. Freeze writes: put the app in maintenance/read-only mode, or set the source DB read-only.
2. Wait for replication lag to hit **zero**; verify.
3. **Promote** the K8s instance to primary.
4. Switch the DNS/Service indirection; restart or reconnect clients (watch connection pools that cache DNS).
5. Smoke test, then unfreeze writes.

Downtime is only the write freeze: typically **seconds to a few minutes**.

**5. Keep a rollback path.** Before unfreezing writes, set up **reverse replication** (new → old) so the old database stays current. If something goes wrong in the first days, switch the indirection back without losing data. Decommission the old system only after a defined soak period.

**6. Operational readiness.** Monitoring and alerts for the new setup (replication lag, disk usage, connections), runbooks for failover and restore, and a team that has practised them.

---

### 04. Design a GitOps workflow for 20+ teams with independent release cycles.
**Goals to state up front:** teams release independently without waiting on each other or the platform team; the platform team owns guardrails, not every deploy; every environment change is auditable in Git; one team can't break another.

**1. Repository layout.**
- **App repos (one per service/team)**: source code, Dockerfile, Helm chart or Kustomize base. CI lives here.
- **Environment config repo(s)**: what version runs where. Either one repo per team (strongest isolation, easiest permissions) or one shared repo with a directory per team protected by `CODEOWNERS`. Structure: `teams/<team>/<app>/envs/{dev,staging,prod}`.
- **Platform repo**: cluster add-ons (ingress, cert-manager, ESO, Kyverno, monitoring), owned by the platform team.

Separating code from config means a config change doesn't trigger a build, and a build doesn't deploy anything to prod by itself.

**2. Argo CD multi-tenancy.**
- **One `AppProject` per team**: limits which source repos they can use, which **destination clusters and namespaces** they can deploy to, and which resource kinds they can create (no cluster-scoped resources, no `ClusterRole`s).
- **SSO groups → Argo CD RBAC**: team A can sync and roll back its own apps only.
- **ApplicationSets** with a Git directory generator (optionally a matrix with a cluster generator): a team adds a folder and gets an Application per environment automatically, so onboarding needs no platform ticket.
- At scale: shard the application controller, or run one Argo CD per cluster/region with a hub for visibility.

**3. Promotion flow (independent per app).**
1. Merge to main → CI builds, tests, scans, signs the image, pushes an immutable tag/digest.
2. CI (or Argo CD Image Updater / Kargo) opens a PR to bump the **dev** overlay; dev **auto-syncs**.
3. Promotion to staging and prod is a **PR** that copies the same digest forward. Prod PRs require approval from the team's `CODEOWNERS` and passing checks (staging soak, tests, policy).
4. Argo CD syncs prod. **Argo Rollouts** handles canary steps with metric analysis and automatic abort.

Each app is its own Argo Application, so team A shipping five times a day never blocks team B's weekly release.

**4. Guardrails (platform-owned, enforced automatically).**
- **Admission policy** (Kyverno/Gatekeeper): signed images only, no `:latest`, resource requests required, non-root, approved registries.
- **CI policy checks** on config PRs (conftest, `kubeconform`, `helm template` + diff posted on the PR).
- **ResourceQuotas/LimitRanges** per team namespace; NetworkPolicies default-deny.
- **Sync windows** in AppProjects for freeze periods.
- **Secrets** via External Secrets Operator; never in Git.

**5. Paved road.** A service template (Backstage scaffolder or a cookiecutter) that generates the app repo, chart, CI pipeline and config folder in one step. Shared Helm library charts so teams don't copy and diverge. Most "GitOps at scale" problems are really consistency problems.

**6. Operating it.** Argo CD notifications to each team's channel; `selfHeal: true` so manual cluster edits get reverted (drift is visible and short-lived); rollback = `git revert` of the promotion commit; DORA metrics per team from Git history.

Deep dives: [33 Q29–Q36](./33-platform-engineering-deep-dive-qna.md) (Argo CD internals, multi-tenancy, OutOfSync, rollback), [20 Q9–Q11](./20-devops-roadmap-gap-fill-qna.md).

---

### 05. Terraform state is 300 MB and planning takes 15 minutes. How would you optimise it?
**Diagnose why first.** Plan time is mostly **refresh**: Terraform calls the cloud API for every resource in state, and providers get rate-limited. A huge state also means a big graph, slow state upload/download and lock contention.
```bash
terraform state list | wc -l                         # how many resources?
terraform state list | cut -d. -f1-2 | sort | uniq -c | sort -rn | head   # what dominates?
TF_LOG=debug terraform plan 2>&1 | grep -i "throttl\|rate exceeded\|retry"  # API throttling?
terraform state pull | jq '[.resources[] | {t:.type, size:(tostring|length)}] | sort_by(-.size) | .[:10]'  # biggest entries
```

**Quick wins (days):**
1. **Find state bloat.** 300 MB usually means something large is stored in state: `aws_s3_object` / `local_file` with inline `content`, huge rendered templates, big policy documents, large outputs, or thousands of near-identical resources. Move file uploads out of Terraform (CI sync) and remove unneeded outputs.
2. **`terraform plan -refresh=false`** for PR plans, combined with a **scheduled full-refresh drift job** (`plan -refresh-only -detailed-exitcode` nightly). Plans become fast, and drift is still caught. Be explicit that a no-refresh plan can miss out-of-band changes.
3. **Raise `-parallelism`** (default 10) to 20–30 if the provider isn't throttling. If it is, raise provider retry settings instead.
4. **Expensive data sources**: data sources that list everything (all AMIs, all subnets) run on every plan. Replace with direct lookups or pass values in.
5. Upgrade Terraform and providers (refresh performance improves), and use a provider plugin cache in CI.

**The real fix: split the state (weeks).**
- Split by **lifecycle and ownership**: `network` (changes rarely), `data` (RDS, S3), `platform` (EKS, IAM), then per-service stacks. Per environment and region as well.
- Rule of thumb: a stack should be owned by one team and plan in under a minute or two, a few hundred resources at most.
- Share values between stacks with outputs + `terraform_remote_state`, or better, publish them to SSM Parameter Store and read them with data sources (looser coupling).
- **Migrate without destroying anything**: in the new stack, add `import` blocks for the moved resources; in the old stack, use `removed { from = ... lifecycle { destroy = false } }` blocks (Terraform ≥ 1.7). Plan both sides and confirm **zero destroys** before applying. (`terraform state mv` with two state files also works but is manual and error-prone.)
- **Orchestrate many stacks** with Terragrunt, Terramate, Atlantis or HCP Terraform/Spacelift, and run plans **only for stacks whose files changed**, so a typical PR plans one or two small stacks in parallel.

**Prevent it coming back:** module standards, CI that fails if a stack's plan time or resource count passes a threshold, and no "just add it to the main stack".

`-target` is not a fix: it's for emergencies and leaves the rest of the state unchecked. (Related: [06 Q28](./06-terraform-and-iac-qna.md) for state splitting and locking, [06 Q30](./06-terraform-and-iac-qna.md) for parallelism.)

---

### 06. How do you implement runtime security beyond image vulnerability scanning?
Image scanning tells you what *could* be exploited. Runtime security is about **reducing what an attacker can do** if something is exploited, and **detecting and responding** when it happens. Layer it:

**1. Prevent risky workloads from running (admission).**
- **Pod Security Admission** `restricted` profile on application namespaces: no privileged containers, no host namespaces/hostPath, non-root, `allowPrivilegeEscalation: false`, capabilities dropped.
- **Kyverno/Gatekeeper** policies: only signed images from approved registries (cosign/Sigstore verification), `readOnlyRootFilesystem: true`, resource limits, no `:latest`.

**2. Shrink what a running container can do (hardening).**
- **seccomp `RuntimeDefault`** (or a custom profile) to block dangerous syscalls; **AppArmor/SELinux** profiles.
- Distroless/minimal images: no shell or package manager for an attacker to use.
- `automountServiceAccountToken: false` unless the Pod needs API access; least-privilege RBAC.
- **Sandboxed runtimes** (gVisor, Kata) for untrusted or multi-tenant code.

**3. Limit lateral movement (network and identity).**
- **Default-deny NetworkPolicies** with explicit allow rules, including **egress** (block crypto-mining pools and data exfiltration; allow only known destinations).
- **mTLS and service-level authorization** (Istio/Linkerd/Cilium).
- **Workload identity** (IRSA/Pod Identity) scoped per service; block Pod access to the node's instance metadata (IMDSv2 with hop limit 1 on EKS).

**4. Detect suspicious behaviour at runtime.**
- **Falco** or **Tetragon** (eBPF-based) watching syscalls and kernel events, or managed options (**GuardDuty EKS Runtime Monitoring**, Defender for Containers, GKE Security Posture, Sysdig/Aqua/Prisma).
- Rules worth having: shell spawned in a container, `kubectl exec` into prod, unexpected outbound connections, writes to `/etc` or binary directories, reading `/var/run/secrets/...` from unexpected processes, new executables appearing (containers should be immutable), privilege escalation, crypto-miner signatures.
- **Kubernetes audit logs** and cloud audit logs (CloudTrail) into a SIEM: RBAC changes, secret reads, exec/port-forward, new ClusterRoleBindings.

**5. Keep checking what's already running.**
- Continuously re-scan **running** images against new CVEs (a clean image yesterday can be vulnerable today), and track what's actually deployed with SBOMs.
- CIS benchmark checks for clusters and nodes (kube-bench), hardened node OS (Bottlerocket, Flatcar), no SSH to nodes.

**6. Respond.**
- Runbook: **isolate** (a NetworkPolicy that cuts off the Pod by label, or cordon the node), **capture evidence** (Pod spec, logs, a container filesystem snapshot or memory capture) *before* deleting, rotate any credentials the workload had, then redeploy from a known-good image.
- Optionally automate response for high-confidence detections (Falco → Falcosidekick → kill or isolate the Pod), with humans reviewing.

> "Scanning reduces known vulnerabilities; runtime security assumes something will get through. I'd layer admission policy, hardening, network and identity isolation, runtime detection with Falco or GuardDuty, and a practised response runbook."

See also: [12 Q16](./12-security-devsecops-qna.md) (IDS vs Falco), [03 Q37](./03-docker-qna.md) (gVisor/Kata), [04 Q48](./04-kubernetes-qna.md) (blast radius of a compromised Pod).

---

### 07. Design a self-healing platform for critical production services.
**Principle:** self-healing means the system detects failure and **returns to a known-good state without a human**, at every layer, while still **telling humans** what happened so underlying problems get fixed rather than hidden.

**Layer by layer:**
| Layer | Failure | Self-healing mechanism |
|---|---|---|
| Process | Hung or crashed process | Liveness probes + restart policy; startup probes for slow starts ([43 Q03, Q07](./43-k8s-health-checks-mid-level-sre-qna.md)) |
| Pod | Pod lost or unhealthy | ReplicaSets recreate Pods; readiness removes bad Pods from traffic; mesh outlier detection ejects bad endpoints |
| Capacity | Load spike | HPA (on RPS/latency/queue depth, not only CPU), KEDA, Cluster Autoscaler/Karpenter |
| Node | Node failure, kernel or disk issues | Managed node auto-repair (GKE auto-repair, EKS node monitoring + auto repair), ASG health-check replacement, Karpenter replacing unhealthy nodes, node-problem-detector |
| Zone | AZ outage | Replicas spread across 3 AZs, PDBs, zonal LB health checks, Multi-AZ databases with automatic failover |
| Region | Region outage | Health-checked global traffic failover to another region ([Q01](#01-how-would-you-design-a-multi-region-kubernetes-architecture-for-high-availability)) |
| Configuration | Manual change, drift | GitOps reconciliation with `selfHeal: true`; Terraform drift detection |
| Deployment | Bad release | Canary with automated metric analysis and **automatic rollback** (Argo Rollouts / Flagger), feature flags as kill switches |
| Dependencies | Slow or failing downstream | Timeouts, retries with backoff and budgets, circuit breakers, fallbacks, load shedding ([42 Q3](./42-system-design-staff-sre-qna.md)) |
| Known operational issues | Disk filling, cert expiry, stuck jobs | **Automated runbooks**: alert → remediation (Lambda via EventBridge, StackStorm, Rundeck, a K8s operator), e.g. rotate logs, renew certs (cert-manager), restart a stuck consumer |

**Guardrails, so automation doesn't make things worse:**
- **Rate-limit and cap remediation**: e.g. never restart more than 10% of Pods or drain more than one node at a time. A "fix" applied everywhere at once can cause an outage.
- **Circuit-break the automation itself**: if the same remediation fires repeatedly, stop and page a human instead of looping.
- **Every automatic action emits an event** (a Slack message, a ticket, a metric). Recurring auto-fixes get a ticket for the root cause. A restart that hides a memory leak every night is not healed.
- Prefer **reversible, idempotent** actions; keep destructive actions human-approved.

**Prove it works:** chaos engineering and game days (kill Pods, nodes, an AZ, inject latency into dependencies) with SLO dashboards showing users weren't affected. Measure success with MTTR and the share of incidents resolved automatically.

> "Self-healing at every layer: probes and controllers for Pods, auto-repair for nodes, multi-AZ and multi-region for infrastructure failure, GitOps for drift, auto-rollback for bad releases, resilience patterns for dependencies, and automated runbooks for known issues. All of it rate-limited, observable and tested with chaos experiments."

See also: [23 Q16](./23-how-it-works-internals-qna.md) (how Kubernetes self-heals internally), [20 Q13](./20-devops-roadmap-gap-fill-qna.md) (automated canary analysis and rollback).

---

### 08. How do you implement secure authentication between services?
**Goal:** every service-to-service call proves **who is calling** (authentication), is checked against **what that caller may do** (authorization), and is **encrypted**, without trusting the network ("inside the VPC" is not a security boundary). Identities should be short-lived and issued automatically; no shared static API keys.

**1. Give every workload a cryptographic identity.**
- In a mesh: Istio/Linkerd issue each Pod an X.509 certificate tied to its **ServiceAccount** (a SPIFFE ID such as `spiffe://cluster.local/ns/payments/sa/checkout`), rotated automatically (Istio defaults to ~24 h).
- Without a mesh: **SPIFFE/SPIRE** issues the same kind of identity to Pods, VMs and serverless; or use cert-manager with a private CA.
- Kubernetes-native: **projected ServiceAccount tokens** (short-lived, audience-bound JWTs) that the receiving service validates with the TokenReview API or the cluster's OIDC discovery endpoint.

**2. Authenticate the connection with mTLS.**
Both sides present certificates and verify each other against the trusted CA, so traffic is encrypted and the caller's identity is proven at the transport layer. With a mesh this needs no app changes. Roll it out with Istio `PeerAuthentication` in `PERMISSIVE` mode first (accepts plaintext and mTLS), watch until all traffic is mTLS, then switch to `STRICT`.

**3. Authorize per call, deny by default.**
Authentication alone means any service with a valid certificate can call anything. Add policy:
- **Mesh authorization**: Istio `AuthorizationPolicy` such as "only `sa/checkout` in `ns/payments` may `POST /charge` on the payments service"; start with a namespace-wide deny-all.
- **Network layer as defence in depth**: default-deny NetworkPolicies (L3/L4), so a policy mistake at L7 isn't the only barrier.
- **Fine-grained or business rules**: OPA/Envoy ext_authz or the app itself.

**4. Propagate end-user identity separately, when needed.**
mTLS proves *which service* is calling, not *on behalf of which user*. For user context, pass a **signed JWT** (from your IdP: OIDC/OAuth2), validated at every hop (`RequestAuthentication` in Istio, or middleware). For service-only calls outside a mesh, use the **OAuth2 client-credentials** flow with short-lived, scoped access tokens. Prefer token exchange (RFC 8693) over forwarding a user's raw token everywhere.

**5. Calls to cloud services and across environments.**
- To AWS/GCP/Azure APIs: **workload identity** (IRSA / EKS Pod Identity, GKE Workload Identity, Azure Workload Identity). No cloud keys stored as secrets.
- Across clusters or to legacy VMs: a shared trust domain (SPIFFE federation, mesh multi-cluster), or an API gateway that terminates external auth and re-establishes mTLS inward.
- External partners: mTLS with client certificates, or OAuth2 with scoped tokens, at the edge gateway.

**6. Operate it.**
- Automated certificate rotation, with alerts on expiry and on CA health (an expired root CA takes down all service traffic at once).
- Log and alert on authorization denials; they show both attacks and misconfigured new services.
- Test policies in CI (e.g. `istioctl analyze`), and keep an explicit list of which services may call which.

> Summary line: "Each workload gets a short-lived identity from its ServiceAccount (SPIFFE certs via the mesh or SPIRE), every connection is mTLS in STRICT mode, every call is authorized by deny-by-default policy, user identity travels separately as a validated JWT, and cloud access uses workload identity, so no static secrets exist to leak."

See also: [08 Q20–Q22](./08-networking-and-security-fundamentals-qna.md) (authn vs authz, mTLS basics, VPN vs mesh mTLS), [33 Q48–Q50, Q52](./33-platform-engineering-deep-dive-qna.md) (Istio architecture, policies, mTLS rollout, Pod Identity), [44 Q06](#06-how-do-you-implement-runtime-security-beyond-image-vulnerability-scanning).
