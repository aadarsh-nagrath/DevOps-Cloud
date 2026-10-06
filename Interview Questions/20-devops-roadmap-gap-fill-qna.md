# DevOps Roadmap Gap-Fill (GitOps, Production K8s, DR, Cost, Observability at Scale, Supply Chain) — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. This file fills the gaps left by the other topic files against the common **Junior → Mid → Senior DevOps roadmap** (see the coverage map in the [README](./README.md#-roadmap-coverage-map)). See also [`GitOps.md`](../GitOps.md), [`Backup and Disaster Recovery/`](../Backup%20and%20Disaster%20Recovery), [`FinOps and Cost Optimization/`](../FinOps%20and%20Cost%20Optimization), and [`Security in DevOps/`](../Security%20in%20DevOps) in this repo. Grouped **Junior → Mid → Senior**.

---

## Table of Contents
- [Junior Level (0–2 yrs)](#junior-level-02-yrs)
- [Mid Level (2–5 yrs)](#mid-level-25-yrs)
- [Senior Level (5+ yrs)](#senior-level-5-yrs)

---

## Junior Level (0–2 yrs)

### 1. What's the difference between horizontal and vertical scaling, and why does horizontal scaling require the app to be stateless?
**Vertical scaling** (scale up) gives one instance more CPU/RAM; it's simple and needs no code changes, but it has a hard ceiling (the biggest machine available), usually needs a restart, and still leaves you with a single point of failure. **Horizontal scaling** (scale out) adds more instances behind a load balancer; it's effectively unbounded and improves availability, but it only works cleanly if any instance can serve any request. So session state, uploaded files, and in-memory caches have to move out of the process into shared stores like Redis, a database, or object storage. If you don't do that, users lose their session or see inconsistent data depending on which replica they hit, and you end up relying on sticky sessions, which undermines both load distribution and failover. In Kubernetes terms, HPA is horizontal, VPA is vertical, and Cluster Autoscaler or Karpenter scales the nodes underneath both.

### 2. What is GitOps, and what are its core principles?
GitOps is an operating model where **Git is the single source of truth for the desired state** of your infrastructure and applications, and an **agent running inside the target environment continuously pulls that state and reconciles reality toward it**. The OpenGitOps principles are: the system is **declarative**; desired state is **versioned and immutable** (Git history gives you an audit log and rollback via `git revert`); changes are **pulled automatically** by an agent rather than pushed by CI; and state is **continuously reconciled**, so manual drift (someone running `kubectl edit` in prod) is detected and optionally reverted. The practical difference from classic CI/CD is that CI never holds production cluster credentials. CI builds and publishes an artifact and updates a manifest in Git, and the in-cluster agent (Argo CD or Flux) does the deploying.

### 3. Are Kubernetes Secrets actually secret? What's the catch?
Not by default. A Secret's data is only **base64-encoded**, which is an encoding and not encryption, so anyone who can `get` the Secret via RBAC can read it. Unless the cluster is configured otherwise, it's also stored **unencrypted in etcd**. What makes Secrets reasonably safe in practice: enable **encryption at rest** for etcd (an `EncryptionConfiguration`, ideally with a KMS provider; managed services like EKS, GKE and AKS offer KMS envelope encryption); keep **RBAC on Secrets tight**, remembering that anyone who can create a Pod in a namespace can mount any Secret in it; never commit raw Secret manifests to Git; and preferably source them from an external manager (Vault, AWS Secrets Manager, etc.) through External Secrets Operator or the Secrets Store CSI driver.

### 4. What is a PodDisruptionBudget (PDB)?
A PDB limits how many replicas of an app can be taken down at once by **voluntary disruptions**: node drains during upgrades, Cluster Autoscaler or Karpenter consolidation, and spot-node rebalancing. It does not protect against involuntary ones like a node crashing. You express it as `minAvailable` or `maxUnavailable`:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: api-pdb }
spec:
  minAvailable: 2          # or maxUnavailable: 1
  selector: { matchLabels: { app: api } }
```

Without one, a routine node-pool upgrade can evict every replica of a service at once. A classic mistake is the opposite extreme: `minAvailable` equal to the replica count, or a PDB on a single-replica Deployment, which blocks drains forever and stalls cluster upgrades.

### 5. What are RTO and RPO?
**RTO (Recovery Time Objective)** is how long the service can be down before the business impact is unacceptable, so it's a target for *time to restore*. **RPO (Recovery Point Objective)** is how much data you can afford to lose, measured as time, so it's a target for *how stale the restored data can be*. An RPO of 15 minutes means backups or replication must capture state at least every 15 minutes. Both are business decisions that drive cost. Near-zero RPO needs synchronous or continuous replication, and near-zero RTO needs a hot standby or active-active setup, so you set them per system based on its criticality rather than one number for everything.

### 6. What are the "golden signals," and how do RED and USE relate to them?
Google SRE's **four golden signals** for a user-facing service are **latency, traffic, errors, and saturation**. **RED** (Rate, Errors, Duration) is the request-centric subset you apply to every *service* or endpoint. **USE** (Utilization, Saturation, Errors) is applied to every *resource* (CPU, memory, disk, network, connection pools, queues). A good rule of thumb is RED for services, which tells you users are hurting, and USE for infrastructure, which tells you why. Standardizing these gives every team's dashboard the same shape, which pays off during incidents.

### 7. What is APM (Application Performance Monitoring), and how is it different from infrastructure monitoring?
Infrastructure monitoring tells you about hosts and containers: CPU, memory, disk, and network. APM looks *inside the application*: per-endpoint latency and error rates, slow database queries, external call timings, exceptions with stack traces, and distributed traces across services. Examples are Datadog APM, New Relic, Dynatrace, Elastic APM, and the open-source route of OpenTelemetry plus Jaeger or Tempo. A host can be at 20% CPU while checkout is slow because of an N+1 query, and only APM-level data shows that.

### 8. What are the basic cloud pricing models, and what is FinOps?
**On-demand** means paying per second or hour with no commitment. **Reserved Instances / Savings Plans / Committed Use Discounts** trade a 1–3 year commitment for roughly 30–70% off and suit steady baseline load. **Spot / preemptible** capacity is spare capacity at up to about 90% off that can be reclaimed at short notice, which suits stateless, fault-tolerant, or batch workloads. **FinOps** is the practice of making engineering teams accountable for cloud spend: visibility (tagging, showback/chargeback), optimization (rightsizing, commitments, spot, removing waste), and governance (budgets, anomaly alerts). The cultural point is that cost becomes a metric engineers see and own, like latency, rather than a surprise finance finds at month-end.

---

## Mid Level (2–5 yrs)

### 9. Compare Argo CD and Flux. How does Argo CD actually detect and fix drift?
Both are CNCF-graduated GitOps controllers. **Argo CD** is application-centric, with a strong UI, multi-cluster management from one control plane, SSO/RBAC, and `Application` / `ApplicationSet` CRDs; it tends to be the choice when teams want visibility and a central platform. **Flux** is a set of composable controllers (source, kustomize, helm, notification, image-automation), is more CLI- and Kubernetes-native, typically runs per cluster, and has built-in image update automation. Argo CD works in a loop. The repo-server renders manifests from Git (plain YAML, Kustomize, Helm), the application controller compares that rendered *desired* state with the *live* state from the API server, and differences mark the app **OutOfSync**. With `syncPolicy.automated` it applies the diff. `selfHeal: true` reverts manual changes in the cluster, and `prune: true` deletes resources that were removed from Git. Fields that controllers legitimately mutate, such as `replicas` under an HPA, need `ignoreDifferences` or Argo and the HPA will fight each other.

### 10. How do you structure GitOps repos and promote a release across dev → staging → prod?
The common pattern is to **separate app source repos from a config/environment repo**. CI in the app repo builds an image tagged with the commit SHA or semver (never a moving `latest`) and then updates the manifest for the *first* environment. It can do this directly with a commit or PR, or through Argo CD Image Updater or Flux image automation. Environments are usually **Kustomize overlays** (`base/` plus `overlays/dev|staging|prod`) or Helm values files per environment, preferably as **directories on one branch** rather than long-lived branch-per-environment, which drifts and makes merges painful. Promotion is a PR that copies the verified image tag from staging's overlay into prod's, which gives an approval point, an audit trail, and one-commit rollback. At scale, the **app-of-apps** pattern or an `ApplicationSet` with a cluster or Git generator stamps the same app out across many clusters and environments without hand-writing each `Application`.

### 11. How do you manage secrets in a GitOps workflow without putting plaintext in Git?
There are four main options:
- **Sealed Secrets**: you encrypt with the controller's public key, commit the `SealedSecret`, and only the in-cluster controller can decrypt it. It's simple, but tied to the cluster key and awkward to rotate.
- **SOPS** (with age or KMS): encrypts values inside YAML files, and Flux decrypts natively (Argo CD needs a plugin). Diffs stay readable.
- **External Secrets Operator (ESO)**: Git holds only an `ExternalSecret` *reference* (which key to fetch from Vault or AWS Secrets Manager), and the operator syncs it into a native Secret on a refresh interval. The secret value never touches Git, and rotation in the backend propagates automatically.
- **Secrets Store CSI driver**: mounts secrets straight from the provider as files, optionally syncing them to a Secret.

For most production setups ESO with a cloud secrets manager is the strongest default, because the secret store stays the single source of truth for secret values while Git stays the source of truth for everything else. Pair it with **workload identity** (IRSA, EKS Pod Identity, GKE Workload Identity, Azure Workload Identity) so the operator doesn't need a long-lived cloud key of its own, the "secret zero" problem.

### 12. You update a ConfigMap or Secret, but the app still uses the old value. Why, and how do you fix it?
It depends on how the value is consumed. **Environment variables** (`env` / `envFrom`) are read once at container start and never update, so the Pod must restart. **Volume mounts** are updated by the kubelet eventually (typically within a minute), *except* when mounted with `subPath`, which never updates, but the app still has to re-read the file, and many only read config at boot. Fixes: put a **hash of the config in a Pod template annotation** (Helm's `checksum/config: {{ include ... | sha256sum }}`), so any config change changes the template and triggers a rolling restart; use a controller like **Stakater Reloader** that restarts workloads when referenced ConfigMaps or Secrets change; or make the app watch and hot-reload its config file. Another useful pattern is **immutable, versioned ConfigMaps** (`immutable: true` with a name suffix, as Kustomize's `configMapGenerator` does), which makes config changes roll out and roll back exactly like image changes.

### 13. How do you automate canary analysis and rollback instead of a human watching dashboards?
Use a progressive delivery controller: **Argo Rollouts** (a `Rollout` CRD replacing the Deployment) or **Flagger** (which wraps an existing Deployment). You define traffic steps and an analysis that queries your metrics provider (Prometheus, Datadog, CloudWatch) at each step:

```yaml
strategy:
  canary:
    steps:
      - setWeight: 10
      - pause: { duration: 5m }
      - analysis: { templates: [ { templateName: success-rate } ] }
      - setWeight: 50
      - pause: { duration: 10m }
```

The `AnalysisTemplate` runs a query such as "5xx ratio of the *canary* pods < 1%" and "p99 latency < 400ms". If it fails, the controller **automatically aborts and shifts traffic back** to the stable version. Precise traffic weights come from a service mesh (Istio, Linkerd) or ingress/Gateway API integration. Without one, the weight is only approximated by replica ratio. What makes it work in practice: metrics labelled by version so you compare canary against baseline rather than canary against the whole fleet, enough traffic at each step for statistical meaning, and backwards-compatible DB schema changes, because traffic rollback can't undo a destructive migration.

### 14. A Kubernetes Service isn't routing traffic (connection refused, 503s, timeouts). Walk through your debugging.
Work outward from the Pods:
1. `kubectl get endpoints <svc>` (or `endpointslices`). **Empty endpoints** is the most common cause: the Service `selector` doesn't match Pod labels, or Pods exist but aren't **Ready** (failing readiness probe), so they're excluded.
2. Check ports. `port` is what clients call, `targetPort` must match the port the container *actually listens on* (and a named targetPort must match the container port's name). Also check that the app binds `0.0.0.0` and not `127.0.0.1`.
3. Test from inside the cluster: `kubectl run tmp --rm -it --image=nicolaka/netshoot -- bash`, then `curl <pod-ip>:<port>` (bypasses the Service), `curl <svc>.<ns>.svc.cluster.local` (tests DNS and the Service), and `nslookup` to rule out CoreDNS.
4. **NetworkPolicies**: a default-deny in the namespace silently drops traffic, so check both ingress on the target and egress on the caller, including egress to kube-dns on port 53.
5. Going outward: the Ingress/Gateway rules and backend service name/port, the ingress controller logs, cloud LB health checks, and security groups for NodePort or LoadBalancer types. If it's intermittent, look at a subset of unhealthy Pods, kube-proxy/CNI issues on a specific node, or conntrack exhaustion.

### 15. Docker builds in CI take 15 minutes. How do you speed them up?
Start with **layer ordering**: copy dependency manifests (`package.json`, `go.mod`, `requirements.txt`) and install dependencies *before* copying the source, so code changes don't bust the dependency layer. Add a tight `.dockerignore` (`.git`, `node_modules`, build output) to shrink the build context. Use **BuildKit features**: `RUN --mount=type=cache,target=/root/.npm` for package-manager caches, and **multi-stage builds** where independent stages build in parallel. The biggest CI-specific win is that CI runners are usually ephemeral, so the local layer cache is empty on every run. Fix that with **remote cache export/import**: `docker buildx build --cache-from type=registry,ref=repo:buildcache --cache-to type=registry,ref=repo:buildcache,mode=max`, or `type=gha` on GitHub Actions. Also pin base images by digest (deterministic cache hits), use slim or distroless runtime images (faster push, pull, and scanning), and avoid rebuilding the same image per environment: **build once, promote the same digest**.

### 16. How would you instrument a service with OpenTelemetry, and why route data through a Collector?
Add the OTel SDK, or use **auto-instrumentation** (Java agent, Python or Node auto-instrumentation, or the OTel Operator injecting it into Pods via an annotation). That captures HTTP, gRPC and DB spans plus metrics with little or no code change. Then add manual spans and attributes for business-critical paths. Make sure **context propagation** (W3C `traceparent`) flows across every hop, including message queues, or traces break into fragments. Send everything via OTLP to an **OpenTelemetry Collector** instead of straight to a vendor, because the Collector decouples apps from backends (switch Jaeger→Tempo or Datadog→Honeycomb without redeploying apps), and its processors can batch, retry, redact PII, add Kubernetes metadata (`k8sattributes`), drop noisy spans, and do **tail-based sampling**. The usual topology is an agent DaemonSet per node feeding a gateway Deployment. Also put trace IDs in logs so you can pivot from a log line to the trace.

### 17. What is multi-window, multi-burn-rate SLO alerting, and why is it better than "alert when error rate > 1%"?
**Burn rate** is how fast you're consuming the error budget relative to plan. A burn rate of 1 uses exactly the whole budget over the SLO window (say 30 days), and a burn rate of 14.4 uses 2% of a 30-day budget in 1 hour. Static thresholds either page on harmless blips or miss slow leaks. The Google SRE workbook approach pages on **fast burn** (e.g. 14.4× over 1h *and* 5m) and tickets on **slow burn** (e.g. 1× over 3d *and* 6h). The short window makes the alert reset quickly once the problem stops. For a 99.9% SLO:

```promql
(
  sum(rate(http_requests_total{code=~"5.."}[1h])) / sum(rate(http_requests_total[1h])) > (14.4 * 0.001)
)
and
(
  sum(rate(http_requests_total{code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > (14.4 * 0.001)
)
```

Every page now means "users are hurt badly enough to threaten the SLO," which is what makes on-call sustainable. Tools like Sloth or Pyrra generate these rules from an SLO spec.

### 18. How do you rightsize Kubernetes workloads, and why does it matter so much for cost?
In Kubernetes you pay for **requests, not usage**. The scheduler reserves requested CPU and memory on nodes, so a Pod requesting 2 CPU and using 0.2 wastes 1.8 CPU of node capacity you're billed for. Compare actual usage (p95/p99 from Prometheus, e.g. `container_cpu_usage_seconds_total` vs `kube_pod_container_resource_requests`) against requests, use **VPA in recommendation mode** (`updateMode: "Off"`) or tools like Goldilocks, Kubecost or OpenCost to propose values, and apply changes gradually through Git. General guidance: set memory requests near observed peak and the memory limit equal to or slightly above the request (memory isn't compressible, so exceeding the limit means OOMKill); set CPU requests near typical usage and be cautious with CPU limits, since CFS throttling causes latency spikes. Don't combine HPA on CPU with VPA auto-updating CPU on the same workload. Rightsizing also improves bin-packing, which lets the node autoscaler remove nodes, and that's where the money is actually saved.

---

## Senior Level (5+ yrs)

### 19. Design a production-grade Kubernetes platform. What's on your checklist beyond "create a cluster"?
- **Control plane & topology**: managed control plane (EKS/GKE/AKS) unless there's a strong reason not to; nodes spread across ≥3 AZs; separate node pools for system, general, memory-heavy, GPU, and spot workloads, using taints; clear cluster boundaries (prod separate from non-prod at minimum, often per region or per compliance boundary).
- **Workload resilience defaults**: ≥2–3 replicas, **PDBs**, `topologySpreadConstraints` across zones and nodes, readiness/liveness/startup probes, graceful shutdown (`preStop` plus `terminationGracePeriodSeconds`), and **PriorityClasses** so critical workloads preempt batch jobs.
- **Resource governance**: required requests and limits, `ResourceQuota` and `LimitRange` per namespace, and autoscaling at every layer (HPA/KEDA, Karpenter or Cluster Autoscaler).
- **Security**: Pod Security Standards (`restricted`) enforced; a policy engine (Kyverno or OPA Gatekeeper) for non-root, no `:latest`, approved registries, signed images, and required labels; default-deny NetworkPolicies; least-privilege RBAC through SSO groups; workload identity instead of static cloud keys; etcd encryption at rest; a private API endpoint; runtime detection (Falco).
- **Delivery**: everything through GitOps, including the add-ons themselves (ingress, cert-manager, external-dns, ESO, monitoring); progressive delivery for critical services.
- **Observability**: metrics, logs and traces wired in by default, with SLOs and alerts on the platform itself (API server, CoreDNS, ingress).
- **Operations**: a documented upgrade cadence (stay within supported versions, upgrade non-prod first, check deprecated APIs with tools like `pluto` or `kubent`); backups and DR (Velero plus a GitOps rebuild path); capacity planning; cost visibility per team.

The senior framing is a **paved road**: teams get these defaults automatically through templates and policy, rather than every team re-deriving them.

### 20. Design an end-to-end software supply chain security program.
The goal is to **prove that what runs in production is exactly what was built from reviewed source by a trusted pipeline, with no known critical vulnerabilities**. Layer it as follows:
- **Source**: branch protection, required reviews, signed commits, CODEOWNERS, secret scanning, and pinned dependencies with lockfiles; defend against dependency confusion and typosquatting with private registries or proxies (Artifactory, Nexus) and scoped package names.
- **Build**: ephemeral, isolated, hardened runners; OIDC to the cloud instead of stored keys; third-party CI actions pinned by commit SHA; build provenance generated per **SLSA** (aim for Build L3: hosted, isolated, non-forgeable provenance).
- **Artifact**: **SBOM** (Syft, or CycloneDX/SPDX), vulnerability scanning (Trivy, Grype), **signing with Sigstore cosign** (keyless via OIDC, recorded in the Rekor transparency log), and SBOM and provenance attached as **attestations**. Reference images by **digest**, not tag.
- **Deploy**: enforce at admission. Kyverno `verifyImages` or the Sigstore policy-controller rejects any image that isn't signed by *your* pipeline's identity, doesn't come from an approved registry, or lacks provenance.
- **Runtime**: continuous rescanning of running images against new CVEs, prioritized by exploitability (KEV, EPSS) and reachability rather than raw CVSS, with **VEX** to suppress non-exploitable findings; runtime detection for anything that slips through.

The key insight is that signing without verification at admission adds nothing, and scanning without a prioritization and SLA process just produces unread reports.

### 21. How do you design disaster recovery for Kubernetes-based workloads?
Separate what needs restoring:
- **Cluster configuration and apps**: if everything is in Git (GitOps) and the cluster is built from IaC, the fastest "restore" is often **building a fresh cluster and letting Argo CD or Flux re-sync**. That's why "cattle clusters" matter.
- **Cluster state not in Git** (CRs created at runtime, some Secrets): back up with **Velero** (resources plus PV snapshots to object storage in another region or account) on a schedule matched to RPO. For self-managed control planes, also take **etcd snapshots**.
- **Stateful data**: databases are the hard part and usually shouldn't rely on Kubernetes-level backup alone. Use the database's native replication and PITR (RDS/Aurora cross-region replicas, CloudNativePG/WAL archiving, Kafka MirrorMaker) to meet RPO.

Then choose a pattern per tier against its RTO/RPO: backup-and-restore (hours, cheap), pilot light, warm standby, or active-active multi-region (seconds, expensive, and needs a strategy for data consistency and global traffic steering via DNS/GSLB). Watch the dependencies people forget: container registry, secrets manager, DNS, certificates, and IdP, which must all be reachable from the DR region. Keep backups immutable and in a separate account so ransomware or a compromised admin can't delete them. Most importantly, **regularly run real restore drills** and measure the actual RTO. An untested backup is a hope, not a DR plan.

### 22. Your Kubernetes and cloud bill grew 40% in six months while traffic grew 10%. How do you approach cost optimization?
1. **Visibility first**: enforce cost-allocation tags and labels (team, service, env), deploy Kubecost/OpenCost or the cloud's cost tooling, and attribute spend per team and service through showback. You can't optimize what nobody owns.
2. **Quick waste wins**: idle or forgotten resources (unattached volumes, old snapshots, idle load balancers, abandoned dev namespaces and clusters), non-prod scaled down out of hours, log and metric retention cut on noisy sources.
3. **Kubernetes efficiency**: rightsize requests (question 18), which is usually the biggest lever; use **Karpenter** (or a tuned Cluster Autoscaler) for consolidation and better bin-packing; allow diverse instance types and Graviton/ARM; move stateless and batch workloads to **spot** with instance diversification, PDBs and graceful termination handling; scale to zero with **KEDA** for event-driven workloads.
4. **Pricing**: cover the stable baseline with Savings Plans or CUDs, but only *after* rightsizing, or you're committing to waste.
5. **Architecture**: cross-AZ and NAT gateway data transfer (often a surprisingly large line item; use VPC endpoints and topology-aware routing), observability ingest volume, over-provisioned managed databases, and storage class choices (gp3 vs gp2, S3 lifecycle tiers).
6. **Governance**: budgets and anomaly alerts, cost reviewed in architecture decisions, and unit economics (cost per request, per customer) instead of the absolute bill, since spend growing with revenue is fine.

The senior point is to never trade away reliability blindly. Spot on a stateful single replica or removing headroom from an SLO-critical service is a false saving.

### 23. Prometheus is falling over as the platform grows to dozens of clusters. How do you design observability at scale?
**Metrics**: a single Prometheus is a single-node TSDB, and vertical scaling and federation hit limits on cardinality, retention and global query. Keep a lightweight Prometheus or agent-mode scraper (or OTel Collector) per cluster and `remote_write` to a horizontally scalable, long-term store: **Grafana Mimir**, **Thanos** (sidecar or receive mode with object-storage blocks), Cortex, VictoriaMetrics, or a managed service (AMP, Grafana Cloud). That gives a global query view, HA through deduplication, and cheap long retention in object storage. Control **cardinality** (no user IDs or request IDs as labels, enforced with per-tenant limits), and precompute expensive queries with **recording rules**.

**Logs**: Fluent Bit or Vector agents parse, filter, drop debug noise and redact at the edge before shipping to Loki or Elasticsearch/OpenSearch, with tiered retention (hot for days, cold in object storage for compliance).

**Traces**: **tail-based sampling** in an OTel Collector gateway keeps 100% of errors and slow traces plus a small percentage of normal ones. Head sampling alone throws away the interesting traces.

**Organizational**: multi-tenancy per team with quotas, shared instrumentation libraries and semantic conventions, SLO-based alerting rather than per-host alerts, and observability cost tracked as a line item. The design goal is that you can answer a new question during an incident without having predicted it, at a cost that grows slower than traffic.

### 24. How would you run secrets management across a large organization (hundreds of services, multiple clouds and clusters)?
Centralize on one or a few **authoritative secret stores** (Vault, or the cloud-native managers per cloud) with a clear ownership model, and eliminate long-lived static credentials wherever possible:
- **Identity-based access**: workloads authenticate with their platform identity (Kubernetes ServiceAccount via OIDC, IRSA or Workload Identity, cloud instance identity) instead of a bootstrap token, which solves "secret zero". Humans go through SSO with short-lived credentials and no shared accounts.
- **Dynamic, short-lived secrets**: Vault database or cloud secret engines issue per-workload credentials with TTLs, so a leaked credential expires on its own and each one is attributable.
- **Automated rotation** for whatever must stay static, tested so rotation doesn't cause outages (apps must reload credentials, and dual-credential overlap windows help).
- **Delivery**: External Secrets Operator or the CSI driver into clusters, with apps reading from files or env vars and never from Git. CI uses OIDC federation rather than stored cloud keys.
- **Guardrails and detection**: pre-commit and server-side secret scanning (gitleaks, GitHub push protection), audit logs on every secret read shipped to the SIEM, alerts on anomalous access, and a rehearsed **leaked-secret runbook**: revoke and rotate first, then investigate usage in the audit logs, then find the root cause.
- **Policy**: least-privilege paths per service, separate stores or namespaces per environment so dev can't read prod, and break-glass access that's logged and reviewed.

Success means the number of long-lived static secrets trends toward zero and a leak becomes a non-event because the credential has already expired.

---

*Part of the [DevOps & Cloud Preparation Hub](../README.md). See [`../Index.md`](../Index.md) for the full repository index.*
