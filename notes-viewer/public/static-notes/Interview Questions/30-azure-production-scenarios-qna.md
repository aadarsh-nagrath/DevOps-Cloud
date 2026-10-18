# Azure Production Scenarios (19 Scenario Questions) — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Scenario-style questions from Azure-heavy DevOps/SRE loops: AKS debugging, Azure DevOps pipelines, App Gateway/WAF, DNS, Functions, DR, cost and scaling. Each answer is a walkthrough you can say out loud, and ends with **See also** links to the deeper Q&A elsewhere in this hub.

---

## Table of Contents
1. [You've deployed an app to AKS and it fails health checks randomly. How do you debug this end-to-end?](#01-youve-deployed-an-app-to-aks-and-it-fails-health-checks-randomly-how-do-you-debug-this-end-to-end)
2. [In a canary deployment to production, half the traffic returns 502, while others succeed. Walk us through your troubleshooting approach.](#02-in-a-canary-deployment-to-production-half-the-traffic-returns-502-while-others-succeed-walk-us-through-your-troubleshooting-approach)
3. [CI/CD pipeline takes 40 mins to deploy a small change. What would you do to optimize it?](#03-cicd-pipeline-takes-40-mins-to-deploy-a-small-change-what-would-you-do-to-optimize-it)
4. [You see high CPU usage in one pod, but logs look clean. What next?](#04-you-see-high-cpu-usage-in-one-pod-but-logs-look-clean-what-next)
5. [You're asked to design a highly available logging system for 100+ microservices across 3 regions. What tools and architecture would you suggest?](#05-youre-asked-to-design-a-highly-available-logging-system-for-100-microservices-across-3-regions-what-tools-and-architecture-would-you-suggest)
6. [Production app works fine for internal users but fails for external ones (403 error). How will you isolate the issue?](#06-production-app-works-fine-for-internal-users-but-fails-for-external-ones-403-error-how-will-you-isolate-the-issue)
7. [How do you ensure secure and dynamic secret rotation in Azure DevOps pipelines?](#07-how-do-you-ensure-secure-and-dynamic-secret-rotation-in-azure-devops-pipelines)
8. [Explain how you'd use Azure Application Gateway with Web Application Firewall for a sensitive banking application.](#08-explain-how-youd-use-azure-application-gateway-with-web-application-firewall-for-a-sensitive-banking-application)
9. [During an Azure deployment, you receive intermittent DNS resolution issues. What can be the causes?](#09-during-an-azure-deployment-you-receive-intermittent-dns-resolution-issues-what-can-be-the-causes)
10. [A user reports 10-second delays every 15 minutes in an app running on AKS. No code changes happened. How would you begin RCA?](#10-a-user-reports-10-second-delays-every-15-minutes-in-an-app-running-on-aks-no-code-changes-happened-how-would-you-begin-rca)
11. [Jenkins jobs are randomly failing at the artifact upload step. What layers would you check?](#11-jenkins-jobs-are-randomly-failing-at-the-artifact-upload-step-what-layers-would-you-check)
12. [How would you set up an automated rollback strategy in Kubernetes for failed deployments?](#12-how-would-you-set-up-an-automated-rollback-strategy-in-kubernetes-for-failed-deployments)
13. [Design a cost-optimized cloud architecture for an internal reporting app that runs every night and stores logs for 3 years.](#13-design-a-cost-optimized-cloud-architecture-for-an-internal-reporting-app-that-runs-every-night-and-stores-logs-for-3-years)
14. [How do you handle zero-downtime database migrations in a distributed application?](#14-how-do-you-handle-zero-downtime-database-migrations-in-a-distributed-application)
15. [What's your approach to disaster recovery for stateful apps running on containers?](#15-whats-your-approach-to-disaster-recovery-for-stateful-apps-running-on-containers)
16. [An Azure Function is being throttled. How will you detect and fix it?](#16-an-azure-function-is-being-throttled-how-will-you-detect-and-fix-it)
17. [Define a plan for blue/green deployment with rollback on Azure using Terraform and pipelines.](#17-define-a-plan-for-bluegreen-deployment-with-rollback-on-azure-using-terraform-and-pipelines)
18. [How would you monitor end-to-end SLA for services involved in a payments pipeline?](#18-how-would-you-monitor-end-to-end-sla-for-services-involved-in-a-payments-pipeline)
19. [Explain the difference in scaling strategies for compute-intensive vs I/O-intensive workloads in Azure.](#19-explain-the-difference-in-scaling-strategies-for-compute-intensive-vs-io-intensive-workloads-in-azure)

---

### 01. You've deployed an app to AKS and it fails health checks randomly. How do you debug this end-to-end?
"Randomly" means it's intermittent, so first work out **which health check is failing and at which layer**. There are three separate checkers: kubelet probes, the Azure Load Balancer / App Gateway health probe, and any external uptime monitor.

**1. Which check is failing?**
```bash
kubectl get pods -o wide -w                       # restarts? READY flapping 1/1 → 0/1?
kubectl describe pod <pod>                        # Events: "Liveness probe failed: ... timeout"
kubectl get events --sort-by=.lastTimestamp | grep -i probe
kubectl logs <pod> --previous                     # logs from before the last restart
```
- **Liveness failing** → the container gets restarted (RESTARTS count goes up).
- **Readiness failing** → the pod is removed from the Service endpoints (`kubectl get endpointslices`), with no restart.
- **App Gateway (AGIC) backend health "Unhealthy"** → check the probe path, host header and port in the portal under *Backend health*. A common cause is the probe hitting `/` with the wrong Host header and getting 404 or a redirect.

**2. Probe configuration** (the most common cause):
- `timeoutSeconds: 1` (the default) is too tight under load or during GC. Raise it to 3–5s.
- No `startupProbe` on a slow-starting app (JVM, .NET), so liveness kills the pod before it's ready.
- Liveness checks dependencies (DB, Redis). One slow dependency then restarts every pod. **Liveness should only check the process itself; readiness can check dependencies.**

**3. Resource pressure:**
- CPU **throttling** under the limit makes the health endpoint slow. Check `container_cpu_cfs_throttled_periods_total` in Container Insights / Managed Prometheus.
- Memory near the limit causes GC pauses or OOMKills (`kubectl describe` → `Last State: OOMKilled`).
- Node pressure: `kubectl describe node` (MemoryPressure, DiskPressure), and noisy neighbours on the same node.

**4. Network / platform:**
- SNAT port exhaustion on outbound traffic (if the health endpoint calls out), visible in the LB metrics *SNAT Connection Count* and *Allocated SNAT Ports*.
- An NSG or NetworkPolicy blocking probe traffic from `168.63.129.16` (the Azure LB probe source).
- Node upgrades or autoscaler scale-downs evicting pods. Check Activity Log and `kubectl get events -A`.

**5. Correlate in time:** put probe failures, restarts, CPU throttling, GC and node events on one timeline in Log Analytics (KQL against `KubePodInventory`, `KubeEvents`, `ContainerLogV2`). An intermittent issue almost always lines up with a resource spike or a periodic job.

**Fix:** tune the probes (startupProbe, realistic timeouts and `failureThreshold`), make liveness a cheap check, right-size requests and limits, and add a PDB plus multiple replicas so one failing pod doesn't affect users.

**See also:** [28 Rapid round](./28-production-scenarios-rapid-round-qna.md) Q5, [23 Internals](./23-how-it-works-internals-qna.md) (probes), [04 Kubernetes](./04-kubernetes-qna.md).

---

### 02. In a canary deployment to production, half the traffic returns 502, while others succeed. Walk us through your troubleshooting approach.
A 502 means the proxy (App Gateway, NGINX Ingress, Istio) reached a backend but got an invalid or no response. "Half fails" with a canary strongly suggests the **canary version (or its routing) is the bad half**, so stop the damage first, then diagnose.

1. **Contain:** shift canary weight to 0% (Argo Rollouts `abort`, Flagger, Istio `VirtualService` weight, or App Gateway rule back to stable). If the 502s stop, the canary is confirmed as the cause. Keep one canary pod around for debugging.
2. **Confirm the split:** group errors by backend/pod/version in the proxy logs (App Gateway access logs: `serverRouted`, `httpStatus`; NGINX: `upstream_addr`). Is it all the canary pods, or one node/zone?
3. **Common canary-side causes:**
   - **Port/protocol mismatch**: the new version listens on a different port, or speaks HTTP/2 / gRPC / TLS when the proxy expects plain HTTP/1.1.
   - **Readiness missing or wrong**: pods receive traffic before they're ready, or crash right after (`kubectl get pods`, restarts).
   - **Keep-alive timeout mismatch**: the app closes idle connections sooner than the proxy does, so the proxy reuses a dead connection and gets a 502. The app's keep-alive timeout must be longer than the proxy's.
   - **Missing config/secret** in the canary, causing a crash on certain requests. Check logs filtered to canary pods.
   - **Response headers too large**, or a malformed response that the proxy rejects.
4. **If stable pods also fail:** the issue is in routing, not the code. Check the Service selector (it may match both versions with different ports), a DestinationRule subset mismatch, or a canary weight that's actually 50/50 when it should be 10/90.
5. **Reproduce directly:** `kubectl port-forward` to a canary pod and `curl -v` it. Then curl through the Ingress with the canary header or cookie.

**Prevent:** gate the canary on automated analysis (error rate and p99 from Prometheus / Azure Monitor), so a 502 spike triggers auto-abort within minutes instead of a human noticing.

**See also:** [08 Networking](./08-networking-and-security-fundamentals-qna.md) Q17 (502 deep dive), [20 Gap-fill](./20-devops-roadmap-gap-fill-qna.md) Q13 (Argo Rollouts analysis).

---

### 03. CI/CD pipeline takes 40 mins to deploy a small change. What would you do to optimize it?
**Measure first.** Pull per-stage timings over the last 20 runs (Azure DevOps *Pipeline analytics*, Jenkins stage view) and find where the time goes: queueing, checkout, dependency install, build, tests, image push, or deployment waits.

Typical fixes, roughly in order of payoff:
- **Agent wait time**: if jobs sit queued, add parallel jobs or self-hosted / Managed DevOps Pool / VMSS agents that keep warm caches.
- **Dependency caching**: the `Cache@2` task (npm, Maven, NuGet, pip) keyed on the lockfile hash. Often saves 5–10 min.
- **Docker layer caching**: order the Dockerfile so dependencies come before source, use BuildKit with `--cache-from` a registry cache (ACR), and use multi-stage builds for smaller images.
- **Only build what changed**: path filters (`trigger.paths.include`) in a monorepo, plus affected-only builds (Nx, Turborepo, Bazel).
- **Parallelize**: run lint, unit tests and security scans as parallel jobs; shard slow test suites; use a stage dependency graph instead of a strict sequence.
- **Shallow checkout**: `fetchDepth: 1`, and skip LFS if not needed.
- **Move slow work out of the critical path**: full E2E and DAST nightly or post-deploy, smoke tests on the PR.
- **Deployment waits**: replace fixed `sleep`s and manual approvals for low-risk environments with health-gated checks. Use `helm upgrade --wait --atomic` with a sane timeout instead of polling.
- **Build once, promote the artifact**: don't rebuild for dev, staging and prod; promote the same image digest.

Target: under 10 minutes from commit to a dev deploy. Track it as a metric (lead time is a DORA metric) so it doesn't creep back up.

**See also:** [05 CI/CD](./05-cicd-jenkins-github-actions-qna.md) Q24, [20 Gap-fill](./20-devops-roadmap-gap-fill-qna.md) Q15 (build caching).

---

### 04. You see high CPU usage in one pod, but logs look clean. What next?
Clean logs only mean the app isn't *reporting* a problem. CPU tells you it's doing work, so profile it and work out what that work is.

1. **Is it one pod or all of them?** If only one replica is hot, it's either uneven load (sticky sessions, a hash-based route, one partition of a Kafka topic) or something specific to that pod's state (a stuck loop, a huge cache or in-memory job).
   ```bash
   kubectl top pod --containers -l app=myapp
   kubectl top node                     # is the node itself hot?
   ```
2. **Check traffic per pod**: request rate by pod in Prometheus / App Insights. If one pod gets 5x the traffic, look at load balancing (gRPC/HTTP2 long-lived connections pinning to one pod are a classic cause).
3. **Look inside the process:**
   ```bash
   kubectl exec -it <pod> -- top -H            # which thread
   kubectl debug -it <pod> --image=busybox --target=<container>   # ephemeral debug container
   ```
   - JVM: `jcmd <pid> Thread.print` or async-profiler; also check GC (`jstat -gcutil`). Constant GC looks like CPU load with no errors.
   - .NET: `dotnet-counters` / `dotnet-trace`. Python: `py-spy top --pid`. Go: `pprof`.
4. **Non-app causes**: a sidecar (Istio/Envoy, log shipper) eating CPU (check `--containers`), a cron or background worker inside the pod, regex backtracking on certain inputs, or crypto/compression on large payloads.
5. **Check throttling vs real usage**: compare usage against the limit. A pod pinned at its CPU limit is being throttled, which shows up as latency, not errors.

**Fix:** depends on what the profile shows — fix the hot code path, rebalance connections (client-side LB or a mesh for gRPC), raise requests/limits, or scale out with HPA. Keep a flame graph from the incident for the postmortem.

**See also:** [28 Rapid round](./28-production-scenarios-rapid-round-qna.md) Q1, Q6.

---

### 05. You're asked to design a highly available logging system for 100+ microservices across 3 regions. What tools and architecture would you suggest?
Requirements to confirm first: volume (GB/day), retention (hot vs archive), query latency, compliance (PII, data residency per region), and budget.

**Architecture (agent → buffer → store → query):**
```
Pods (stdout JSON) → Fluent Bit / OTel Collector (DaemonSet, per cluster)
  → Regional buffer: Event Hubs (Kafka API) or Kafka
  → Regional store: Loki / Elasticsearch / Azure Monitor Logs (Log Analytics)
  → Archive: Blob Storage (Cool → Archive tier, immutable)
  → Query: Grafana (multi-datasource) / Log Analytics cross-workspace queries
```

Key design points:
- **Structured logging standard**: JSON with `service`, `env`, `region`, `trace_id`, `level`. Trace IDs let you correlate logs with traces across services.
- **Agent per node**, not per pod. Fluent Bit is lightweight; filesystem buffering covers short outages of the downstream system.
- **Durable buffer per region** (Event Hubs / Kafka) decouples producers from the store, absorbs spikes, and allows replay if the store is down.
- **Store per region** for HA and data residency, with zone-redundant deployment (3 AZs). A failure in one region doesn't affect the others. Use a global query layer (Grafana with all three regions as data sources) instead of shipping all logs to one central region, which costs a lot in egress.
- **Choosing the store**:
  - **Loki** on AKS with Blob Storage backend: cheapest at scale, label-indexed only.
  - **Elasticsearch/OpenSearch**: full-text search, more expensive to run.
  - **Azure Monitor Logs**: fully managed, KQL, but cost per GB ingested is high at 100+ services. Use Basic/Auxiliary log tiers for noisy logs.
- **Cost control**: drop debug logs in prod at the agent, sample high-volume access logs, set retention per stream, and move old data to Blob Archive.
- **Security**: TLS everywhere, managed identities for agents, RBAC per team, PII masking in the pipeline.

**See also:** [11 Monitoring](./11-monitoring-logging-observability-qna.md) (ELK vs Loki, cardinality), [20 Gap-fill](./20-devops-roadmap-gap-fill-qna.md) Q23.

---

### 06. Production app works fine for internal users but fails for external ones (403 error). How will you isolate the issue?
A 403 means *something understood the request and refused it*. The job is to find **which hop** is returning the 403. Internal and external users usually take different paths (external: Front Door / App Gateway WAF → app; internal: private endpoint or VNet path → app), so compare those paths.

1. **Find who sent the 403**: look at the response headers and body. A WAF block page, `x-azure-ref` (Front Door), `Server: Microsoft-Azure-Application-Gateway`, or the app's own JSON error all point to different layers.
2. **WAF** (most common): check the App Gateway / Front Door WAF logs (`AzureDiagnostics` where `Category == "ApplicationGatewayFirewallLog"`, action `Blocked`) for the rule ID. External requests may carry headers, cookies or payloads that trigger OWASP rules, or a geo-filter / IP-reputation rule is matching. Fix with a targeted exclusion, not by turning WAF off.
3. **IP restrictions**: App Service *Access Restrictions*, Storage firewall, NSG rules, or APIM IP filter policies that only allow corporate ranges. Also check whether Front Door is forwarding the client IP in `X-Forwarded-For` while the restriction checks the wrong IP.
4. **Authentication / authorization**: Entra ID Conditional Access policies that block untrusted locations or unmanaged devices; app roles or tenant restrictions that only allow your own tenant (external B2B guests fail); a missing CORS origin for the external domain.
5. **Host header / domain**: the external domain isn't configured as a custom domain or the backend rejects the forwarded Host header.
6. **Reproduce** from outside the network (`curl -v` from a cloud shell or a VM outside the VNet) with the same headers as the user, and compare against an internal request.

**See also:** [25 Azure deep dive](./25-azure-deep-dive-qna.md) (Front Door/App Gateway, Conditional Access), [08 Networking](./08-networking-and-security-fundamentals-qna.md) (WAF).

---

### 07. How do you ensure secure and dynamic secret rotation in Azure DevOps pipelines?
The goal is **no long-lived secrets stored in the pipeline**, and rotation that doesn't need anyone to edit the pipeline.

1. **Remove secrets you don't need**: use **Workload Identity Federation (OIDC)** for Azure service connections. No client secret to rotate at all — the pipeline gets a short-lived token from Entra ID.
2. **Store the rest in Key Vault**, not in pipeline variables:
   - A variable group linked to Key Vault, or the `AzureKeyVault@2` task, which fetches secrets at runtime. When the secret rotates in Key Vault, the next run picks up the new value automatically.
   - Restrict access with Key Vault RBAC (`Key Vault Secrets User`) scoped to the specific vault, for the pipeline's identity only.
3. **Automate rotation**:
   - Key Vault **rotation policies** for keys, and **Event Grid `SecretNearExpiry`** events triggering an Azure Function that rotates DB passwords, storage keys, or third-party API keys.
   - Use the dual-credential pattern (two keys/users, rotate one at a time) so rotation never breaks running apps.
   - Prefer managed identities for apps (Azure SQL, Storage, Service Bus) so the app has no secret either.
4. **Protect in the pipeline**: secrets are masked in logs, never `echo`ed, and not passed as command-line args. Set secret variables as non-overridable at queue time. Use pipeline approvals and checks on protected environments, and branch controls on service connections.
5. **Audit**: Key Vault diagnostic logs to Log Analytics, alerts on unusual access, and secret scanning (GitHub Advanced Security for Azure DevOps / gitleaks) to catch secrets committed to code.

**See also:** [12 Security](./12-security-devsecops-qna.md) Q12–Q13, [28 Rapid round](./28-production-scenarios-rapid-round-qna.md) Q18.

---

### 08. Explain how you'd use Azure Application Gateway with Web Application Firewall for a sensitive banking application.
```
Users → (Front Door Premium + WAF, optional for global/DDoS edge)
      → Application Gateway WAF_v2 (zone-redundant, in its own subnet, DDoS Network Protection on VNet)
      → Private backends: AKS (AGIC / App Gateway for Containers) or App Service via Private Endpoint
```

- **SKU and HA**: WAF_v2 with autoscaling (set minimum instances for predictable capacity) across 3 availability zones.
- **WAF policy**:
  - **Prevention mode** in production (run Detection mode first in staging to tune false positives).
  - Microsoft **Default Rule Set (DRS 2.x)** plus **Bot Manager** rules.
  - **Custom rules**: geo-filtering to countries you serve, rate limiting on login and OTP endpoints, IP allow-lists for admin paths.
  - Per-path policies (stricter on `/login`, `/transfer`), and targeted exclusions instead of disabling whole rules.
- **TLS**:
  - TLS 1.2+ only with a strong custom policy; certificates from **Key Vault** via managed identity, with auto-renewal.
  - **End-to-end TLS** (re-encrypt to the backend), since banking compliance usually doesn't allow plaintext inside the network either.
  - Mutual TLS for partner/B2B APIs.
- **Network isolation**: backends have no public IPs; NSGs only allow traffic from the App Gateway subnet; private endpoints for databases; Azure Firewall for outbound traffic.
- **Headers**: rewrite rules to add HSTS, CSP, X-Content-Type-Options, and strip `Server` and other info-leaking headers.
- **Monitoring and compliance**: WAF and access logs to Log Analytics and **Microsoft Sentinel**, alerts on block spikes, Azure Policy to enforce that every App Gateway has WAF in Prevention mode. Map controls to PCI DSS.
- **Pair with**: Entra ID / B2C for authentication, APIM for API policies (JWT validation, quotas), and DDoS Network Protection.

**See also:** [25 Azure deep dive](./25-azure-deep-dive-qna.md) Q35, [08 Networking](./08-networking-and-security-fundamentals-qna.md) (WAF, mTLS).

---

### 09. During an Azure deployment, you receive intermittent DNS resolution issues. What can be the causes?
"Intermittent" usually points to caching, multiple resolvers that disagree, or load on the resolver.

- **Private DNS zone not linked to every VNet**: resolution works from one VNet/spoke and fails from another. Common with Private Endpoints (`privatelink.*` zones) in hub-and-spoke setups.
- **Custom DNS servers** on the VNet (on-prem AD DNS, a DNS VM) without a conditional forwarder to Azure DNS `168.63.129.16` for `privatelink` zones, or with one of the two DNS servers down/misconfigured so only half the queries succeed.
- **Propagation and caching (TTL)**: a record was just created or changed during the deployment, and clients or resolvers still have the old value or an earlier negative (NXDOMAIN) cached.
- **Race in the deployment**: the app starts before the Private Endpoint DNS record or zone link has been created (Terraform/Bicep missing a `depends_on`).
- **CoreDNS in AKS**: too few replicas or CPU-throttled CoreDNS, the `ndots:5` setting multiplying external lookups, and **conntrack races on UDP** causing 5-second timeouts. Fixes: scale CoreDNS, enable NodeLocal DNSCache, and use FQDNs with a trailing dot or lower `ndots`.
- **Azure DNS query limits**: per-VM rate limits on `168.63.129.16` (about 1000 queries/sec per VM) hit by chatty apps without client-side caching.
- **DNS Private Resolver / forwarding loops** between on-prem and Azure.
- **Split-horizon conflicts**: the same name exists in a public and a private zone, and different clients hit different resolvers.

**Debug:** `nslookup`/`dig` from the failing workload (`kubectl run tmp --image=busybox -- nslookup ...`), compare the answer and resolver IP with a working client, check `/etc/resolv.conf` in the pod, and check CoreDNS logs and metrics.

**See also:** [28 Rapid round](./28-production-scenarios-rapid-round-qna.md) Q8, [25 Azure deep dive](./25-azure-deep-dive-qna.md) (Private Endpoints).

---

### 10. A user reports 10-second delays every 15 minutes in an app running on AKS. No code changes happened. How would you begin RCA?
A **regular period** is the biggest clue: something runs on a 15-minute schedule. Since the code didn't change, look for periodic jobs, timeouts and caches.

1. **Confirm and measure**: does App Insights / Prometheus show the p99 spike at a fixed interval? Is it all requests or only some endpoints / pods / nodes? Get exact timestamps.
2. **Look for things on a 15-minute (or similar) schedule:**
   - **CronJobs** in the cluster (`kubectl get cronjobs -A`), backup jobs, Velero schedules, DB maintenance/stats jobs, report queries locking tables.
   - **Token / cache expiry**: an auth token, Key Vault secret cache or DNS cache with a ~15-minute TTL that's refreshed synchronously on the request path. Entra ID tokens and managed identity token refreshes are classic causes.
   - **Connection pool idle timeout**: Azure Load Balancer kills idle TCP flows after **4 minutes** by default, and other firewalls/NAT gateways have their own timeouts. The app then tries a dead pooled connection, waits for a timeout (often ~10s), and reconnects. Very common.
   - **Garbage collection** of a growing heap, cache rebuilds, or log rotation.
   - **HPA / Cluster Autoscaler** scale-down cycles evicting pods (`kubectl get events -A`).
3. **Correlate**: put the latency timeline next to CronJob runs, pod restarts, node events, DB CPU/locks (Query Store), and outbound connection errors. A distributed trace of a slow request shows which span takes the 10 seconds — DB call, external HTTP, DNS, or token fetch.
4. **Test the hypothesis**: change one thing (e.g. TCP keep-alive, or move the CronJob) and see if the pattern moves or disappears.

**See also:** [28 Rapid round](./28-production-scenarios-rapid-round-qna.md) Q15, Q21, [13 SRE](./13-sre-incident-loadbalancing-servicemesh-qna.md) (incident response).

---

### 11. Jenkins jobs are randomly failing at the artifact upload step. What layers would you check?
Go layer by layer, from the agent outward, and first compare failing and passing runs (which agent, what time, how big the artifact).

1. **Agent**: disk full (`df -h` on the workspace), out of memory, or an agent getting killed mid-upload (spot VM eviction, K8s pod agent OOM or eviction). Check whether failures cluster on specific agents.
2. **Jenkins controller**: if using `archiveArtifacts`, large artifacts go through the controller — check controller disk, heap and the remoting channel (`ChannelClosedException`). Better to upload directly to a repository.
3. **Network**: proxy timeouts on large uploads, a corporate proxy or firewall limiting body size, DNS flakiness for the repo hostname, SNAT port exhaustion on the agent subnet, or MTU problems over VPN.
4. **Artifact repository** (Nexus, Artifactory, Azure Artifacts, ACR, Blob): storage quota, rate limits (`429`), repository maintenance windows, expired credentials or token, version-already-exists conflicts (a release repo that doesn't allow redeploy), or the repo running out of disk.
5. **Credentials**: a token that expires mid-job, or a credential rotated without updating Jenkins.
6. **Concurrency**: parallel jobs writing the same artifact path or version at the same time.

**Fix:** add `retry(3)` with backoff around the upload step, use the repository's native client (with chunked/resumable upload), get timeouts and error codes into the logs, and alert on repository health. Version artifacts uniquely (build number + commit SHA).

**See also:** [29 Jenkins rounds](./29-jenkins-k8s-helm-interview-rounds-qna.md) (random failures), [28 Rapid round](./28-production-scenarios-rapid-round-qna.md) Q9.

---

### 12. How would you set up an automated rollback strategy in Kubernetes for failed deployments?
There are two kinds of failure to handle: **the rollout itself fails** (pods don't become ready), and **the rollout succeeds but the new version is bad** (errors and latency go up).

1. **Rollout fails** — the basic layer:
   - Good readiness probes, `maxUnavailable: 0`, `maxSurge: 25%` so old pods stay until new ones are ready.
   - `progressDeadlineSeconds` on the Deployment so Kubernetes marks it as failed.
   - `helm upgrade --install --atomic --wait --timeout 10m` automatically rolls back the release if pods aren't healthy in time. Or in the pipeline: `kubectl rollout status deploy/x --timeout=5m || kubectl rollout undo deploy/x`.
2. **New version is bad** — progressive delivery:
   - **Argo Rollouts** or **Flagger** canary: 10% → 25% → 50% → 100%, with an `AnalysisTemplate` querying Prometheus / Azure Monitor (error rate < 1%, p99 < SLO). If analysis fails, it **aborts and shifts traffic back to stable automatically**.
   - Post-deploy smoke tests in the pipeline that trigger a rollback when they fail.
3. **GitOps**: with Argo CD, a rollback is a `git revert` of the image tag commit, so Git stays the source of truth (otherwise Argo CD would re-apply the bad version).
4. **Make rollback safe**: database migrations must be backward compatible (expand/contract, Q14), otherwise rolling back the code breaks against the new schema. Feature flags let you turn off a bad feature without redeploying.
5. **Alert and record**: notify the team on automatic rollback, and keep the failed ReplicaSet for debugging.

**See also:** [28 Rapid round](./28-production-scenarios-rapid-round-qna.md) Q7, Q10, [20 Gap-fill](./20-devops-roadmap-gap-fill-qna.md) Q13.

---

### 13. Design a cost-optimized cloud architecture for an internal reporting app that runs every night and stores logs for 3 years.
The key point: it runs **once a night**, so **nothing should be running (or billed) during the day**.

**Compute (pay only while running):**
- **Azure Container Apps Jobs** (scheduled, scale to zero) or **Azure Functions** on the Flex Consumption plan for short jobs; **Azure Batch with Spot VMs** or an **AKS node pool with Spot + autoscale to zero** for heavy ones. Make the job idempotent and checkpoint progress so Spot evictions are just a retry.
- Orchestrate with **Data Factory** / Logic Apps / a cron trigger.

**Data:**
- Source data via read replica or export, so reporting doesn't load the production DB.
- **Azure SQL Serverless** (auto-pause when idle) or files in **ADLS Gen2 + Synapse Serverless / DuckDB**, where you pay per query.
- Reports to Blob Storage, served through a static website or Power BI.

**3-year log retention (the biggest cost item):**
- Write logs to **Blob Storage** with a **lifecycle policy**: Hot (30 days) → Cool (90 days) → Cold → **Archive** until 3 years, then delete.
- **Immutable storage (time-based retention policy)** if it's for compliance/audit.
- If logs go to Log Analytics, keep a short interactive retention (30–90 days) and use long-term retention / data export to storage for the rest — interactive retention for 3 years is very expensive.
- Compress (gzip/Parquet) before storing.

**Other:** LRS or ZRS is enough for an internal app (no GRS unless required), budgets and cost alerts, tags for cost allocation, and Reserved Capacity only if usage turns out to be steady.

**See also:** [20 Gap-fill](./20-devops-roadmap-gap-fill-qna.md) Q8, Q22, [27 Scenarios](./27-cloud-architecture-scenarios-qna.md).

---

### 14. How do you handle zero-downtime database migrations in a distributed application?
During a rolling deploy, **old and new versions of the app run at the same time against the same database**. So every schema change has to work with both. The standard approach is **expand / contract** (parallel change):

1. **Expand**: add new things without breaking old code — new nullable columns, new tables, new indexes (created online: `CREATE INDEX CONCURRENTLY` in Postgres, `ONLINE = ON` in SQL Server).
2. **Deploy code that writes both** old and new columns (dual-write), still reading the old one.
3. **Backfill** existing rows in small batches (throttled, to avoid locks and replication lag).
4. **Switch reads** to the new column (behind a feature flag if possible).
5. **Contract**: once no running version uses the old column, stop writing to it, then drop it in a later release.

Example — renaming `name` to `full_name` takes several releases, never one `ALTER TABLE RENAME`.

Other rules:
- Migrations are versioned and run by a tool (Flyway, Liquibase, EF Core migrations, Alembic) as a separate pipeline step or K8s Job before the app rollout, never by each app instance on startup (they'd race).
- Avoid long table locks: no adding a NOT NULL column with a default on huge tables in old engines, no type changes on hot tables. Use online schema tools (`gh-ost`, `pt-online-schema-change`) for MySQL.
- Every step is backward compatible, so **the app can be rolled back** without rolling back the database.
- Test migrations against a production-sized copy to measure lock times.

**See also:** [14 Deployment](./14-deployment-systemdesign-behavioral-qna.md), [17 Distributed systems](./17-messaging-caching-distributed-systems-qna.md).

---

### 15. What's your approach to disaster recovery for stateful apps running on containers?
Start from **RTO/RPO per app**, then keep two things separate: the **cluster and config** (rebuildable from code) and the **data** (has to be backed up or replicated).

1. **Get state out of the cluster where possible**: managed databases (Azure SQL / PostgreSQL Flexible Server / Cosmos DB) with zone redundancy, geo-replication or failover groups, and PITR. This is the simplest DR.
2. **If state must live in the cluster** (Kafka, Elasticsearch, self-run DBs on StatefulSets):
   - Use **zone-redundant storage** (ZRS managed disks) and spread replicas across zones with topology spread constraints and PDBs.
   - **Velero** (or AKS Backup) for K8s objects plus volume snapshots, copied to a storage account in another region, with immutability.
   - **App-level replication** is better than disk snapshots for consistency: Postgres streaming replicas, Kafka MirrorMaker, Elasticsearch cross-cluster replication. Disk snapshots of a running DB are only crash-consistent — use pre-backup hooks to flush/freeze.
3. **Rebuild the rest**: clusters via Terraform, workloads via GitOps (Argo CD / Flux), so a DR cluster can be stood up quickly. Keep container images in a geo-replicated ACR.
4. **Choose a DR pattern based on RTO**: backup/restore (hours), pilot light / warm standby (minutes), active-active (near zero, but needs multi-region data replication and conflict handling).
5. **Failover**: Front Door / Traffic Manager with health probes, a documented and scripted runbook, and a clear decision on who declares DR.
6. **Test it**: regular restore drills and failover game days, measuring the real RTO/RPO. An untested backup isn't a backup.

**See also:** [20 Gap-fill](./20-devops-roadmap-gap-fill-qna.md) Q5, Q21, [28 Rapid round](./28-production-scenarios-rapid-round-qna.md) Q22, [`../Backup and Disaster Recovery/`](../Backup%20and%20Disaster%20Recovery/).

---

### 16. An Azure Function is being throttled. How will you detect and fix it?
**Detect:**
- **HTTP 429** responses to callers, or `503` from the Functions host.
- App Insights: failed requests with 429s, rising duration, and the *Live Metrics* server count stuck at a maximum.
- Metrics on the downstream service: Cosmos DB **429 / RU exhaustion**, Storage throttling, SQL DTU/vCore at 100%, Service Bus throttling. Often it's not the Function that's throttled but what it calls.
- Queue triggers: queue length growing steadily (messages arriving faster than processed).

**Common causes and fixes:**
- **Plan limits**: the Consumption plan has scale-out limits (instance cap per plan) and a 5–10 min timeout. Move to **Flex Consumption** (higher scale, always-ready instances) or **Premium** (pre-warmed, VNet, no cold start). Check `functionAppScaleLimit` / maximum scale-out isn't set too low.
- **Concurrency per instance**: tune `host.json` — `maxConcurrentRequests` for HTTP, `batchSize` / `newBatchThreshold` for queues, `maxConcurrentCalls` for Service Bus, `prefetchCount` for Event Hubs.
- **Downstream throttling**: raise Cosmos DB RUs (or autoscale RUs), add retries with exponential backoff (the SDKs support this), reuse clients (static `HttpClient`/`CosmosClient`) to avoid socket and SNAT exhaustion.
- **Front-door rate limiting**: APIM quotas/rate-limit policies returning 429 — check whether the limit is intentional.
- **Spiky load**: put a queue in front so the function processes at a steady rate instead of failing under bursts.
- **Partitioning**: Event Hubs throughput is capped by the number of partitions — more partitions allow more parallel instances.

**See also:** [25 Azure deep dive](./25-azure-deep-dive-qna.md) (Functions plans), [24 AWS](./24-aws-deep-dive-qna.md) (Lambda concurrency, same idea).

---

### 17. Define a plan for blue/green deployment with rollback on Azure using Terraform and pipelines.
**Infrastructure (Terraform):**
- Two identical environments, **blue** and **green**, from the same module (`module "env" { for_each = toset(["blue","green"]) }`) — e.g. two App Service slots, two AKS clusters/node pools, or two VMSS.
- Shared resources outside both: database, Key Vault, DNS, and the traffic switch (**Front Door** / **App Gateway** / **Traffic Manager**).
- A variable `active_color = "blue"` controls which backend gets the traffic. State in a remote backend (Azure Storage with locking).

**Pipeline (Azure DevOps multi-stage YAML):**
1. **Build** once, push the image/artifact (immutable tag = commit SHA).
2. **Deploy to the idle colour** (green if blue is live). Run DB migrations that are backward compatible (expand/contract, Q14).
3. **Test green** on its private hostname: smoke tests, integration tests, synthetic checks.
4. **Approval gate** (environment check) for production.
5. **Switch traffic**: `terraform apply -var active_color=green`, or for App Service a **slot swap** (`az webapp deployment slot swap`). Optionally shift gradually with Front Door weights (10% → 100%).
6. **Monitor** error rate and latency for a bake period with automated checks (Azure Monitor alerts as a gate).
7. **Rollback**: if checks fail, switch back — `active_color=blue` (or swap slots back). Blue is still running and untouched, so rollback takes seconds.
8. **Clean up**: after the bake period, scale down or keep blue as the next idle target.

**Notes:** don't let Terraform and the pipeline fight over the active colour (one owner, ideally Terraform via the pipeline). Session state must be external (Redis), otherwise users lose sessions on switch. Cost doubles during the overlap, so scale idle down.

**See also:** [14 Deployment](./14-deployment-systemdesign-behavioral-qna.md) Q3, [06 Terraform](./06-terraform-and-iac-qna.md).

---

### 18. How would you monitor end-to-end SLA for services involved in a payments pipeline?
A payment touches many services (API → auth → fraud → ledger → payment provider → notification). An SLA on each one doesn't tell you whether **payments** succeed, so measure the user journey end to end.

1. **Define SLIs for the journey:**
   - **Availability**: % of payment attempts that complete successfully (excluding legitimate declines like insufficient funds — those are business outcomes, not failures).
   - **Latency**: p95/p99 from request to confirmed.
   - **Correctness / freshness**: payments settled and reconciled within N minutes, no stuck "pending" payments.
   - Set **SLOs** stricter than the contractual SLA (e.g. SLO 99.95% for a 99.9% SLA), with an error budget.
2. **Distributed tracing**: OpenTelemetry → Application Insights (or Tempo/Jaeger), with one trace ID (plus a payment/correlation ID) across HTTP and message hops (Service Bus/Kafka). This shows exactly which hop is slow or failing.
3. **Per-service golden signals** (rate, errors, latency, saturation), and **queue lag** between async steps.
4. **Synthetic transactions**: a test payment (sandbox card) every minute from several regions, so you detect outages even when there's no real traffic.
5. **Business-level monitoring**: payments per minute vs the same time last week (a sudden drop is an incident even with no errors), decline rate by provider, reconciliation mismatches.
6. **External dependencies**: track the payment gateway/bank separately (their latency and errors), so you know whether the problem is yours or theirs, and have a circuit breaker or failover provider.
7. **Alerting**: **multi-window burn-rate alerts** on the journey SLO (page on fast burn, ticket on slow burn), dashboards showing the journey and each hop, and SLA reports for stakeholders.
8. **Compliance**: no card data in logs or traces (PCI DSS), tokenised IDs only.

**See also:** [28 Rapid round](./28-production-scenarios-rapid-round-qna.md) Q16, Q17, [11 Monitoring](./11-monitoring-logging-observability-qna.md) Q14–Q15.

---

### 19. Explain the difference in scaling strategies for compute-intensive vs I/O-intensive workloads in Azure.
| | Compute-intensive (CPU/GPU-bound) | I/O-intensive (disk/network/DB-bound) |
|---|---|---|
| Bottleneck | CPU cycles, cores, GPU | Waiting on disk, network, database, external APIs |
| Scaling signal | CPU %, GPU utilisation, job queue depth | Queue length, concurrent connections, request latency, IOPS/throughput — **not CPU** (CPU stays low while waiting) |
| Best scale direction | Out (more instances) for parallel work; up for single-threaded hot paths | Raise concurrency per instance first (async I/O), then out; scale the storage/DB tier itself |
| Azure VM families | **F-series** (compute optimised), **H/HB** (HPC), **N-series** (GPU) | **L-series** (storage optimised, NVMe), Ebsv5 (high disk throughput), accelerated networking |
| Azure services | **Azure Batch**, VMSS with CPU autoscale, AKS with HPA on CPU + Spot node pools, GPU node pools | Functions/Container Apps with **KEDA** scaling on queue length (Service Bus, Event Hubs), Premium SSD v2 / Ultra Disk with provisioned IOPS, caching (Redis), read replicas, Cosmos DB autoscale RUs |
| Cost tips | Spot VMs for batch work, right-size cores, reservations for steady load | Cache to cut I/O, pay for IOPS separately (Premium SSD v2), avoid oversized VMs just to get disk bandwidth |

Key points to say:
- For I/O-bound work, **autoscaling on CPU doesn't work** — CPU stays low while requests queue up. Scale on queue depth, in-flight requests or latency (KEDA, HPA custom metrics).
- For I/O-bound work, adding instances can make things **worse** if the shared backend (DB) is the bottleneck. Scale or shard the backend, add caching, or use connection pooling.
- Check VM limits: every VM size has caps on disk IOPS, disk throughput and network bandwidth, so an I/O workload may need a bigger VM even if its CPU is idle.
- Compute-bound work benefits from parallelising and batching (Batch, MPI on HPC VMs), and from choosing newer CPU generations or GPUs.

**See also:** [28 Rapid round](./28-production-scenarios-rapid-round-qna.md) Q6, [25 Azure deep dive](./25-azure-deep-dive-qna.md) (compute options).

---

*Part of the [Interview Questions](./README.md) hub. See [`../Index.md`](../Index.md) for the full repository index.*
