# Core DevOps Scenarios Gap-Fill (20 Most-Asked Questions) — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. This is a common list of 20 mid-to-senior DevOps questions. 13 of them already have full answers elsewhere in the hub, and the table below links to them. The other 7 are answered in full here.

---

## Already answered elsewhere

| # | Question | Where |
|---|---|---|
| 2 | What happens internally when you run a Docker container? | [23 Q6](./23-how-it-works-internals-qna.md) |
| 3 | How does Kubernetes decide which node should run a pod? | [23 Q1](./23-how-it-works-internals-qna.md), [04 Q44](./04-kubernetes-qna.md) |
| 4 | Difference between Readiness, Liveness and Startup probes | [23 Q4](./23-how-it-works-internals-qna.md), [04 Q15](./04-kubernetes-qna.md) |
| 6 | Lifecycle of a CI/CD pipeline from commit to production | [23 Q10](./23-how-it-works-internals-qna.md) |
| 7 | How Terraform builds and executes its dependency graph | [23 Q8](./23-how-it-works-internals-qna.md), [06 Q17](./06-terraform-and-iac-qna.md) |
| 8 | Terraform drift and how to handle it | [28 Q14](./28-production-scenarios-rapid-round-qna.md), [06 Q20](./06-terraform-and-iac-qna.md) |
| 9 | Terraform state locking with S3 and DynamoDB | [28 Q13](./28-production-scenarios-rapid-round-qna.md), [23 Q9](./23-how-it-works-internals-qna.md), [06 Q12–13](./06-terraform-and-iac-qna.md) |
| 11 | Rolling vs Blue-Green vs Canary | [14 Q2–4](./14-deployment-systemdesign-behavioral-qna.md), [13 Q18](./13-sre-incident-loadbalancing-servicemesh-qna.md) |
| 12 | Implementing a zero-downtime deployment | [28 Q10](./28-production-scenarios-rapid-round-qna.md), [04 Q59](./04-kubernetes-qna.md) |
| 13 | Securing secrets across CI/CD, Kubernetes and cloud | [28 Q18](./28-production-scenarios-rapid-round-qna.md), [20 Q24](./20-devops-roadmap-gap-fill-qna.md), [24 Q32](./24-aws-deep-dive-qna.md) |
| 15 | Troubleshooting intermittent 503s in Kubernetes | [13 Q24](./13-sre-incident-loadbalancing-servicemesh-qna.md), [20 Q14](./20-devops-roadmap-gap-fill-qna.md) |
| 17 | Logs vs metrics vs traces, and when to use each | [23 Q18](./23-how-it-works-internals-qna.md), [28 Q16](./28-production-scenarios-rapid-round-qna.md) |
| 18 | Monitoring and alerting design that reduces alert fatigue | [11 Q21](./11-monitoring-logging-observability-qna.md), [20 Q17](./20-devops-roadmap-gap-fill-qna.md) |

---

## Table of Contents
1. [How does a request flow from a browser to a Kubernetes pod?](#01-how-does-a-request-flow-from-a-browser-to-a-kubernetes-pod)
2. [Why would a pod be Running but the application still be unavailable?](#05-why-would-a-pod-be-running-but-the-application-still-be-unavailable)
3. [How do you design reusable Terraform modules for enterprise projects?](#10-how-do-you-design-reusable-terraform-modules-for-enterprise-projects)
4. [IAM Roles vs IAM Policies with a real-world scenario](#14-explain-iam-roles-vs-iam-policies-with-a-real-world-scenario)
5. [How do you find the bottleneck when an app becomes slow in production?](#16-how-do-you-identify-the-bottleneck-when-an-application-becomes-slow-in-production)
6. [A production incident you resolved and your RCA approach](#19-explain-a-production-incident-you-resolved-and-your-rca-approach)
7. [A deployment fails midway in production. How do you recover safely?](#20-if-a-deployment-fails-midway-in-production-how-do-you-recover-safely)

Numbers below match the original 20-question list.

---

### 01. How does a request flow from a browser to a Kubernetes pod?
Take `https://shop.example.com/cart` hitting an app on EKS behind an AWS Load Balancer and an NGINX Ingress controller:

1. **DNS**: the browser checks its cache, then the OS resolver, then a recursive resolver, which walks root → `.com` → the `example.com` authoritative servers (Route 53). The record is usually an ALIAS/CNAME to the cloud load balancer, so it resolves to the LB's IPs.
2. **TCP + TLS**: the browser opens TCP 443 to the LB and does the TLS handshake. TLS is usually **terminated at the LB** (ACM cert) or at the Ingress controller (cert-manager cert). SNI tells it which cert to present.
3. **Cloud load balancer**: it picks a healthy target. There are two common modes:
   - **Instance mode**: the target is a **NodePort** on every node. The packet lands on any node, and **kube-proxy** (iptables/IPVS rules) DNATs it to an Ingress controller pod, possibly on another node. That's an extra hop, and the client IP is lost unless `externalTrafficPolicy: Local`.
   - **IP mode** (AWS LB Controller, VPC CNI): the LB targets **pod IPs directly** and skips the NodePort hop.
4. **Ingress controller** (NGINX/Traefik/Envoy, or a Gateway API implementation): this is an L7 reverse proxy. It matches `Host` + path against the Ingress rules and picks a backend Service. Most controllers read **EndpointSlices** and send traffic **straight to a ready pod IP** rather than through the Service's ClusterIP.
5. **Service → Pod**: when traffic does go through the ClusterIP, kube-proxy's rules DNAT it to one ready endpoint. The **EndpointSlice** only lists pods whose **readiness probe** is passing.
6. **Pod network**: the CNI (VPC CNI, Calico, Cilium) routes the packet to the pod's IP, either natively in the VPC or through an overlay. It goes through the node's veth pair into the pod's network namespace, and the container listening on `containerPort` gets it.
7. **Response** goes back the same path. Conntrack reverses the NAT.

**Where it breaks, layer by layer:** NXDOMAIN or a stale record (DNS) → cert or SNI mismatch (TLS) → LB has no healthy targets (502/503) → no matching Ingress rule (404 from the controller) → Service selector doesn't match pod labels, so endpoints are empty (503) → NetworkPolicy drops it (timeout) → app is bound to `127.0.0.1` instead of `0.0.0.0` (connection refused).

*See also: [23 Q3](./23-how-it-works-internals-qna.md) (service discovery), [28 Q8](./28-production-scenarios-rapid-round-qna.md) (Service/Ingress/DNS debugging).*

---

### 05. Why would a pod be Running but the application still be unavailable?
`Running` only means **at least one container process has started and hasn't exited**. It says nothing about whether the app can serve traffic. Common reasons:

| Cause | How you spot it |
|---|---|
| **Not Ready**: readiness probe failing (app still warming up, a dependency is down, wrong probe path/port) | `kubectl get pod` shows `0/1` READY. `describe` shows `Readiness probe failed` events |
| **No probe at all**: the pod counts as Ready the moment the process starts, even though the app takes 40 s to load | Errors right after every deploy or scale-up |
| **Service selector mismatch**: labels don't match, so the Service has no endpoints | `kubectl get endpointslices -l kubernetes.io/service-name=<svc>` is empty |
| **Port mismatch**: Service `targetPort` ≠ the port the app listens on | Connection refused. `kubectl port-forward pod/x 8080` works but the Service doesn't |
| **App bound to localhost** (`127.0.0.1`) instead of `0.0.0.0` | Works with `kubectl exec ... curl localhost`, fails from other pods |
| **App is wedged**: deadlock, thread pool exhausted, GC thrash. The process is alive but not answering | No liveness probe (or a liveness probe that only checks the port is open) |
| **Dependency down**: DB, cache or downstream API is unreachable, so every request errors | App logs. 5xx rate goes up while pods stay "healthy" |
| **NetworkPolicy** blocks ingress from the Ingress controller namespace | Timeouts. Works once you test from inside the same namespace |
| **Ingress/LB misconfig**: wrong host/path, LB health check hits the wrong path | 404 or 503 from the controller or LB, and pod logs show no requests at all |
| **Resource starvation**: CPU throttled at its limit, so responses time out | `container_cpu_cfs_throttled_periods_total` is high |
| **Sidecar not ready** (e.g. Istio proxy) or an init/config issue | `2/2` vs `1/2` containers. Proxy logs |

**Debug order:** `kubectl get pod -o wide` (READY column) → `kubectl describe pod` (probe events) → `kubectl logs` → check endpoints → `kubectl exec` and curl the app port → curl the Service from another pod → curl the Ingress. Each step moves one hop outward, so the first failing step tells you the layer.

**Prevention:** a readiness probe that checks the app can actually serve, a liveness probe that only detects a wedged process, a startup probe for slow boots, and alerts on the **error rate and latency** users see, not on pod phase.

---

### 10. How do you design reusable Terraform modules for enterprise projects?
**Principles:**
- **One module = one coherent capability** (e.g. `vpc`, `eks-cluster`, `rds-postgres`, `s3-secure-bucket`), not a module per resource and not one giant "platform" module. If you can't describe it in one sentence, split it.
- **Small, typed interface**: explicit `variable` types (`object({...})` instead of `any`), `validation` blocks, sensible secure defaults, and `optional()` attributes. Expose only what consumers need.
- **Bake in guardrails**: encryption on, public access blocked, mandatory tags, logging on. Consumers shouldn't have to remember them.
- **No provider config inside child modules**. The caller passes providers in (`providers = { aws = aws.us_east_1 }`). Declare `required_providers` with version constraints.
- **Outputs are the contract**: output the IDs/ARNs other stacks need. Don't make consumers reach into internals.
- **No hardcoded environments**: no `if env == "prod"` inside. Environments differ by **inputs**, not by code.

**Layout:**
```
modules/                       # or one repo per module: terraform-aws-rds-postgres
  rds-postgres/
    main.tf  variables.tf  outputs.tf  versions.tf
    README.md                  # generated with terraform-docs
    examples/basic/            # runnable example, also used by tests
    tests/basic.tftest.hcl     # terraform test
live/                          # root modules: thin, mostly module calls + tfvars
  prod/us-east-1/payments/main.tf
  staging/us-east-1/payments/main.tf
```

```hcl
variable "instance_class" {
  type    = string
  default = "db.t4g.medium"
  validation {
    condition     = can(regex("^db\\.", var.instance_class))
    error_message = "instance_class must look like db.<family>.<size>."
  }
}

# Consumer pins an exact released version
module "orders_db" {
  source         = "git::https://github.com/acme/terraform-aws-rds-postgres.git?ref=v3.2.1"
  name           = "orders"
  instance_class = "db.r6g.large"
  tags           = local.tags
}
```

**Enterprise lifecycle:**
- **Versioning**: semver tags and a CHANGELOG, published to a private registry (Terraform Cloud/HCP, GitLab, Artifactory) or Git tags. Consumers **pin versions**, and Renovate/Dependabot opens upgrade PRs.
- **Testing in CI**: `terraform fmt`/`validate`, `tflint`, `checkov`/`trivy` for security, `terraform test` (or Terratest) that deploys the example into a sandbox account and destroys it.
- **Breaking changes**: major version bump, and `moved {}` blocks so renamed resources don't get destroyed and recreated.
- **Composition**: platform team owns the base modules, and app teams compose them in thin root modules. Avoid modules nested more than 2 levels deep, since debugging gets painful.
- **State boundaries**: split state per environment and per component (network, cluster, app) so one blast radius stays small and `plan` stays fast. Share values across stacks via outputs, `terraform_remote_state`, or SSM parameters.
- **Policy**: OPA/Sentinel checks on the plan enforce what modules alone can't (e.g. "no one creates an S3 bucket without our module").

*See also: [06 Q9, Q21, Q27](./06-terraform-and-iac-qna.md).*

---

### 14. Explain IAM Roles vs IAM Policies with a real-world scenario.
- A **policy** is a JSON document that says **what is allowed or denied**: actions, resources, conditions. On its own it does nothing until it's attached to something.
- A **role** is an **identity with no long-term credentials** that someone or something **assumes** to get temporary credentials from STS. A role has two policies attached:
  - a **trust policy**: **who** may assume it (EC2, Lambda, another account, a GitHub OIDC identity)
  - **permission policies**: **what** it can do once assumed

In short: the role is *who you become*, the policy is *what you can do*.

**Scenario: an app on EC2/EKS needs to read one S3 bucket and one secret.**

Bad: create an IAM user, generate access keys, put them in an env var. They're long-lived, they leak, and they need manual rotation.

Good: create a role `orders-api-role`.

Trust policy (who can assume it). For EKS with IRSA, only one service account can:
```json
{
  "Effect": "Allow",
  "Principal": { "Federated": "arn:aws:iam::111122223333:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/ABC123" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": { "StringEquals": {
    "oidc.eks.us-east-1.amazonaws.com/id/ABC123:sub": "system:serviceaccount:orders:orders-api"
  }}
}
```
Permission policy (what it can do), least privilege:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::acme-orders-invoices/*" },
    { "Effect": "Allow", "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:us-east-1:111122223333:secret:orders/db-*" }
  ]
}
```
The SDK in the pod picks up temporary credentials automatically and refreshes them. No keys exist anywhere. (On EKS today, **EKS Pod Identity** does the same with a simpler trust setup.)

**Other places the same split shows up:**
- **CI/CD**: GitHub Actions assumes `deploy-role` through OIDC. The trust policy is restricted to `repo:acme/orders:ref:refs/heads/main`, so no AWS keys are stored in GitHub.
- **Cross-account**: an auditor account's role is trusted by prod and given `ReadOnlyAccess`.
- **Guardrails on top**: **permission boundaries** cap what a role can ever get, and **SCPs** cap a whole account. An explicit `Deny` anywhere wins over any `Allow`.

*See also: [07 Q5, Q16](./07-aws-cloud-qna.md), [24 Q16, Q29](./24-aws-deep-dive-qna.md).*

---

### 16. How do you identify the bottleneck when an application becomes slow in production?
Narrow it down from the outside in. Don't guess.

**1. Scope it first**
- **What exactly is slow?** All endpoints or one? All users or one region/tenant? p50 or only p99? Constant or periodic?
- **What changed?** Deploys, config/flag changes, traffic spike, infra events, a dependency's status page. A slowdown that lines up with a change is the cheapest lead.

**2. Find the slow hop (traces)**
- Open a distributed trace for a slow request (Jaeger/Tempo/X-Ray/Datadog APM). The span waterfall shows where the time goes: the app itself, a DB query, a cache miss, a downstream HTTP call, or a queue wait.
- No tracing? Compare latency at each layer: LB `TargetResponseTime` vs app-reported latency vs DB query time. The gap between two layers is where the time is going.

**3. Check the slow component with USE and RED**
- **RED** for services: Rate, Errors, Duration. Is latency up because traffic is up (saturation) or at constant traffic (regression)?
- **USE** for resources: Utilization, Saturation, Errors for CPU, memory, disk, network, and **also pools** (DB connections, thread pools, file descriptors). Saturation is often a queue: run queue, connection-pool wait time, request backlog.

**4. Common culprits and the signal that points to each**

| Bottleneck | Signal |
|---|---|
| CPU-bound / throttled | High CPU. In K8s, `cpu_cfs_throttled` close to the limit while node CPU looks fine |
| Memory / GC | GC pause time up, heap close to max, swapping, OOMKills |
| Database | Slow query log, `pg_stat_statements`, lock waits, missing index after a new query, connection pool exhausted |
| Downstream dependency | Trace span for the external call is long. Timeouts and retries pile up |
| Thread/connection pool exhaustion | Low CPU **and** high latency, with requests waiting for a worker or a DB connection |
| Disk I/O | `iowait`, `iostat` await, EBS burst credits used up |
| Network | Retransmits, DNS lookup latency (`ndots:5`), cross-AZ calls, NAT gateway limits |
| Lock contention / N+1 queries | A profile shows time in locks, or a trace shows hundreds of small DB spans |

**5. Confirm with a profiler.** Use a continuous profiler (Pyroscope, Parca, Datadog Profiler), or `py-spy`, `async-profiler`, `perf` + flame graphs on one pod. This shows which function is burning time.

**6. Mitigate first, then fix.** Roll back if a deploy caused it, scale out if it's saturation, turn off the expensive feature flag, add caching or rate limits. Then fix the root cause (index, query, pool size, timeout/retry budget) and **add an alert or SLO** on the signal that would have caught it earlier.

*See also: [28 Q15, Q21](./28-production-scenarios-rapid-round-qna.md), [30 Q4, Q10](./30-azure-production-scenarios-qna.md), [01 performance troubleshooting](./01-linux-and-scripting-qna.md).*

---

### 19. Explain a production incident you resolved and your RCA approach.
Answer with **STAR**, and spend most of the time on *your* actions and the follow-up. A sample answer (swap in your own real incident):

**Situation.** "Friday evening, our checkout API's error rate went from 0.1% to 18% and p99 latency from 300 ms to 8 s. PagerDuty fired on the SLO burn-rate alert, and I was on call."

**Task.** "I was incident commander until a second engineer joined, then I owned the technical investigation."

**Action.**
1. **Declared the incident** and opened a channel. Posted a status update every 15 minutes.
2. **Checked what changed**: no deploy in 6 hours, but a marketing campaign had started 20 minutes earlier, so traffic was 3× normal.
3. **Followed the traces**: the time was spent waiting to acquire a DB connection, not in the queries. App pods had scaled from 10 to 30 via HPA, and each pod had a pool of 20 connections. That's 600 connections against an RDS instance with `max_connections` ≈ 400. New pods couldn't connect, failed readiness, and the pods still running were overloaded.
4. **Mitigated**: capped the HPA at 18 replicas and lowered the pool size to 15 through config, which brought the error rate back to normal in about 10 minutes. Put a temporary rate limit on the campaign endpoint.
5. **Verified** the SLO had recovered and closed the incident with customer support.

**Result / RCA.** I wrote a blameless postmortem the next week:
- **Timeline** built from alerts, deploy logs, and chat.
- **Root cause, found with "5 whys"**: autoscaling had no awareness of the DB connection limit. The deeper cause was that nobody owned capacity planning for the DB when the HPA was added.
- **Contributing factors**: no alert on DB connection count, and marketing launches weren't shared with on-call.
- **Action items, each with an owner and a date**: put RDS Proxy in front of the DB (connection pooling), add an alert on connections > 80% of max, a load test at 3× traffic in staging, and a launch checklist that includes notifying on-call. Each one was tracked to done.

**What interviewers listen for:** your specific role, a concrete technical chain from symptom to cause, **mitigating before root-causing**, a blameless framing, and follow-ups that actually changed the system, not just "we fixed it".

*See also: [14 Q17](./14-deployment-systemdesign-behavioral-qna.md), [13 Q2–4](./13-sre-incident-loadbalancing-servicemesh-qna.md).*

---

### 20. If a deployment fails midway in production, how do you recover safely?
**Rule one: stop the bleeding, and don't make it worse.**

**1. Freeze and assess (first minutes)**
- **Pause the rollout** so it doesn't keep replacing healthy instances: `kubectl rollout pause deploy/api`, abort the Argo Rollout, or stop the pipeline.
- **Check user impact**: error rate and latency on the dashboards. Is it actually broken, or did the *pipeline* fail while the app is fine (e.g. a post-deploy step timed out)?
- **Find out what state you're in**: mixed versions? Which step failed: image, migration, config, infra?
  ```bash
  kubectl rollout status deploy/api
  kubectl get rs -l app=api          # old vs new ReplicaSet counts
  helm history api -n prod
  ```

**2. Pick a recovery path**
- **App-only change, users affected → roll back.** It's the fastest known-good state.
  ```bash
  kubectl rollout undo deploy/api            # or --to-revision=N
  helm rollback api <REV> -n prod --wait
  # Argo CD: revert the Git commit (or sync to the previous revision) so GitOps doesn't re-apply the bad one
  ```
  Blue-green: switch traffic back to blue. Canary: set weight to 0 / abort. Feature flag: turn it off.
- **A DB migration already ran → be careful with rollback.** If the migration was **backward-compatible** (expand/contract: add columns, don't drop or rename), the old code still works, so roll back the app and leave the schema. If it was destructive, **roll forward** with a fix instead. Restoring from backup is the last resort, since it loses writes.
- **Terraform/infra apply failed partway** → don't rerun blindly. Run `terraform plan` to see what was actually created, fix the cause, and re-apply. Terraform converges to the desired state. Clear a stale lock only after confirming nothing else is running.
- **Not much impact and the fix is obvious** → roll forward through the **normal pipeline**, not with a hand-edited hotfix in prod.

**3. Verify**
- All pods are on one version, the error rate and latency are back to baseline, and queues/consumers have caught up. Check data for partial writes (orders created twice, half-processed jobs). Idempotent consumers make this safe.

**4. Communicate and follow up**
- Status updates during the incident, then a blameless postmortem. Common action items: an automated rollback on SLO/analysis failure (Argo Rollouts, Flagger), migrations split into expand/contract, `maxUnavailable: 0` + readiness probes so a broken version never takes traffic, a `progressDeadlineSeconds` alert, and making every deploy step idempotent so it's safe to re-run.

**Why it's usually recoverable:** a Deployment's old ReplicaSet is kept (`revisionHistoryLimit`), so rollback is just scaling it back up. The hard parts are **state**: DB schema, data, and external side effects. That's why safe deploys design for those up front.

*See also: [28 Q10, Q21](./28-production-scenarios-rapid-round-qna.md), [30 Q12, Q14](./30-azure-production-scenarios-qna.md), [06 Q26](./06-terraform-and-iac-qna.md).*

---

*Back to the [Interview Questions hub](./README.md).*
