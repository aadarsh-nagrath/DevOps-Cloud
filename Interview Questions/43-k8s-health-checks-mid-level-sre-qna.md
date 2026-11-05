# Kubernetes Health Checks, Dependency Failures & Mid-Level DevOps/SRE Round-Up — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. **Part A** is the probes-and-database question chain interviewers use to separate "I've read the docs" from "I've been paged for this". **Part B** fills the mid-level Kubernetes gaps not answered elsewhere in the hub. **Part C** is a rapid-fire revision round across the whole stack, and **Part D** maps every common mid-level DevOps/SRE topic to its answer.

Already answered elsewhere, not repeated here:
| Topic | Where |
|---|---|
| Readiness vs liveness basics, and what the kubelet does internally | [04 Q15](./04-kubernetes-qna.md), [23 Q4](./23-how-it-works-internals-qna.md) |
| Many Pods failing readiness at once (cluster-wide cause) | [04 Q43](./04-kubernetes-qna.md) |
| Pending / CrashLoopBackOff / ImagePullBackOff debugging | [04 Q36–Q38, Q49–Q50, Q60](./04-kubernetes-qna.md), [28 Q05](./28-production-scenarios-rapid-round-qna.md) |
| Requests, limits, QoS, HPA, Cluster Autoscaler | [04 Q28–Q30, Q57, Q61](./04-kubernetes-qna.md), [28 Q06](./28-production-scenarios-rapid-round-qna.md) |
| Zero-downtime rollouts, preStop, graceful shutdown | [04 Q39, Q59](./04-kubernetes-qna.md), [23 Q17](./23-how-it-works-internals-qna.md) |
| Circuit breakers, backpressure, cascading failures | [13 Q15](./13-sre-incident-loadbalancing-servicemesh-qna.md), [42 Q3](./42-system-design-staff-sre-qna.md) |

---

## Table of Contents
**Part A — Probes and dependency failures**
1. [Which probe would you use to check database connectivity?](#01-which-probe-would-you-use-to-check-database-connectivity)
2. [What happens if the database becomes slow but doesn't go down?](#02-what-happens-if-the-database-becomes-slow-but-doesnt-go-down)
3. [Why shouldn't you check database connectivity in a liveness probe?](#03-why-shouldnt-you-check-database-connectivity-using-a-liveness-probe)
4. [How do you prevent temporary DB latency from making Pods NotReady?](#04-how-do-you-prevent-temporary-db-latency-from-making-pods-notready)
5. [What happens if all Pods fail their readiness probes simultaneously?](#05-what-happens-if-all-pods-fail-their-readiness-probes-simultaneously)
6. [What are the probe parameters, and how do you calculate detection time?](#06-what-are-the-probe-parameters-and-how-do-you-calculate-detection-time)
7. [When do you need a startup probe?](#07-when-do-you-need-a-startup-probe-and-how-do-you-size-it)
8. [What should each health endpoint actually check?](#08-what-should-each-health-endpoint-actually-check)
9. [httpGet vs tcpSocket vs exec vs grpc probes](#09-httpget-vs-tcpsocket-vs-exec-vs-grpc-probes--when-would-you-use-each)
10. [Pods are being restarted by liveness probes under load. What's going on?](#10-pods-keep-getting-restarted-by-liveness-probes-but-only-under-load-whats-happening)
11. [Readiness gates, and how cloud load balancers see Pod health](#11-what-are-readiness-gates-and-how-does-pod-readiness-reach-a-cloud-load-balancer)

**Part B — Mid-level Kubernetes gap-fill**

12. [Headless Services and StatefulSet DNS](#12-what-is-a-headless-service-and-why-do-statefulsets-need-one)
13. [Init containers vs sidecars (including native sidecars)](#13-init-containers-vs-sidecar-containers--what-runs-when)
14. [ConfigMap/Secret changes — do running Pods see them?](#14-you-update-a-configmap-do-running-pods-pick-up-the-change)
15. [Are Kubernetes Secrets secure?](#15-are-kubernetes-secrets-actually-secret-how-do-you-make-them-safe)
16. [CPU limits and throttling — should you set CPU limits?](#16-what-is-cpu-throttling-and-should-you-set-cpu-limits)
17. [`imagePullPolicy` and why `:latest` is a problem](#17-how-does-imagepullpolicy-work-and-why-is-latest-a-problem)
18. [A rollout is stuck. How do you detect it and recover?](#18-a-rollout-is-stuck-how-do-you-detect-it-and-recover)
19. [`maxSurge` / `maxUnavailable` math, and Recreate vs RollingUpdate](#19-explain-maxsurge-and-maxunavailable-with-numbers-and-when-to-use-recreate)
20. [`kubectl drain` hangs. Why, and how do PDBs interact with it?](#20-kubectl-drain-hangs-why-and-how-do-pdbs-interact-with-it)
21. [A Pod is stuck in Terminating](#21-a-pod-is-stuck-in-terminating-what-do-you-do)
22. [HPA isn't scaling. What do you check?](#22-the-hpa-isnt-scaling-what-do-you-check)
23. [How does kubectl authenticate (kubeconfig, contexts, EKS)?](#23-how-does-kubectl-authenticate-and-what-is-in-a-kubeconfig)
24. [CRDs and Operators](#24-what-are-crds-and-operators-and-when-would-you-write-one)
25. [Cross-namespace service calls and DNS names](#25-how-does-a-pod-call-a-service-in-another-namespace)
26. [Your daily kubectl troubleshooting toolkit](#26-what-kubectl-commands-do-you-use-most-when-troubleshooting)

**Part C — Rapid-fire revision round (whole stack)**

27. [Rapid-fire: Kubernetes](#27-rapid-fire-kubernetes)
28. [Rapid-fire: Docker, Linux, networking](#28-rapid-fire-docker-linux-networking)
29. [Rapid-fire: CI/CD, Git, Terraform, cloud](#29-rapid-fire-cicd-git-terraform-cloud)
30. [Rapid-fire: Observability and SRE](#30-rapid-fire-observability-and-sre)

**Part D — [Mid-level DevOps/SRE topic map](#-part-d--mid-level-devopssre-topic-map)**

---

## 🔹 Part A — Probes and Dependency Failures

### 01. Which probe would you use to check database connectivity?
**Short answer: never liveness. Readiness, only if the Pod truly cannot serve anything without the DB, and with tolerance built in. Often the right answer is no probe at all for the DB.**

How to say it in an interview:
1. **Liveness: no.** Liveness answers "is this process broken in a way only a restart fixes?" A restart doesn't fix a database. (Full reasoning in [Q03](#03-why-shouldnt-you-check-database-connectivity-using-a-liveness-probe).)
2. **Readiness: possibly.** Readiness answers "should this Pod get traffic right now?" If the Pod can't do anything useful without the DB, taking it out of the endpoints is reasonable. But every replica shares the same DB, so a DB problem makes **all** Pods NotReady together, and the Service ends up with zero endpoints ([Q05](#05-what-happens-if-all-pods-fail-their-readiness-probes-simultaneously)). Readiness is good for **Pod-local** problems (this Pod is warming up, overloaded, or lost its own connection). It's a poor tool for **shared-dependency** problems.
3. **Startup probe or init container: for the first connection.** It's reasonable to wait for the DB once at startup, either with a startup probe that checks "migrations done, pool initialised" or an init container that waits for the DB port. After that, the app should handle DB problems itself.
4. **What mature teams do:** readiness checks only that the process can serve (`/readyz`: HTTP server up, config loaded, caches warm). DB health is handled **in the application** with timeouts, retries with backoff, a circuit breaker, and graceful degradation (serve cached reads, return a fast 503 for writes). DB health shows up in **metrics and alerts**, not in probes.

> "I'd put DB connectivity in readiness only if a Pod without a DB is useless *and* the failure could be specific to that Pod, like a broken connection pool. For a shared DB outage, readiness can't route around the problem because every Pod has it, so I'd rather the app fail fast with clean 503s and let alerting on DB metrics page us."

A pragmatic compromise many teams use: readiness checks a **cached** DB status updated by a background thread, with a long tolerance window ([Q04](#04-how-do-you-prevent-temporary-db-latency-from-making-pods-notready)).

---

### 02. What happens if the database becomes slow but doesn't go down?
This is the more dangerous case. "Down" fails fast and is obvious; "slow" fails **slowly** and spreads. Walk through the chain:

1. **Queries take longer**, so each request holds a DB connection and an app worker (thread, goroutine, event-loop slot) for longer.
2. **The connection pool runs out.** New requests wait for a connection (e.g. HikariCP `connectionTimeout` defaults to 30 s), so request latency climbs to the pool timeout.
3. **App worker threads saturate.** Requests that don't touch the DB at all, **including the health endpoint**, now queue behind DB-bound ones.
4. **Probes start timing out.** `timeoutSeconds` defaults to **1 s**. If `/healthz` sits in the same thread pool, it times out even though the process is fine.
   - Readiness fails → Pods leave the endpoints → the remaining Pods get more load → they slow down too → **all Pods NotReady → outage**.
   - Liveness fails (if it shares the thread pool or checks the DB) → **restart storm**: in-flight requests are lost, caches go cold, every Pod opens a new connection pool at once, and the DB, which was already struggling, gets hit with a reconnect storm.
5. **Upstream amplification.** Callers time out and **retry**, multiplying load on a DB that's already slow (a retry storm). Upstream services' own thread pools fill up waiting on you, so the slowdown cascades through the call graph.
6. **Autoscaling makes it worse.** HPA sees CPU or latency rise and adds Pods, and every new Pod opens more DB connections. That can push the DB past `max_connections`.

**What you see:** p99 latency climbing, then 5xx and timeouts, `Ready` flapping, endpoints count dropping, pool-wait metrics spiking, and DB CPU/IO/lock waits up, with no single "DB down" alert.

**What protects you:**
| Layer | Control |
|---|---|
| App | Tight **query and pool-acquire timeouts** (fail in hundreds of ms, not 30 s), **circuit breaker** on the DB client, **bulkhead** (separate small pool for health checks and non-DB endpoints), **load shedding** (fast 503 when the queue is too deep) |
| Callers | Retry budgets, exponential backoff with jitter, deadlines propagated through the call chain |
| Probes | Health endpoint that doesn't touch the DB and doesn't share the request thread pool; liveness never checks the DB |
| Capacity | Cap total connections (`replicas × pool size < max_connections`), use a pooler (PgBouncer, RDS Proxy), cap HPA `maxReplicas` with the DB in mind |
| Detection | Alert on DB latency, pool saturation, and error-budget burn rate, not just "DB up" |

---

### 03. Why shouldn't you check database connectivity using a liveness probe?
Because a liveness failure **restarts the container**, and restarting your app cannot fix the database. You only make things worse:

1. **Correlated failure.** The DB is shared, so every replica fails liveness at the same moment and the whole service restarts together. A DB blip becomes a full outage.
2. **Restarts don't help.** The new container finds the same broken DB and fails again.
3. **CrashLoopBackOff delays recovery.** Repeated restarts back off exponentially (10 s, 20 s, 40 s … capped at 5 min). When the DB comes back, your Pods might be sitting in a 5-minute backoff, so your outage lasts longer than the DB's.
4. **Thundering herd on the DB.** Every restarted Pod opens a full connection pool and warms its caches against the DB at the same time, which can knock over a DB that was just recovering.
5. **Lost work.** In-flight requests are dropped, and background jobs are killed mid-way.
6. **It hides the real problem.** The alert you get is "Pods restarting" instead of "DB slow", which sends on-call in the wrong direction.

**Rule:** liveness checks only things a restart can fix: a deadlock, a wedged event loop, a corrupted in-memory state. Good liveness endpoints are local and cheap: "can the main loop respond?", maybe "has the worker heartbeat updated in the last N seconds?". Same rule for any shared dependency: cache, message broker, another microservice, an external API.

---

### 04. How do you prevent temporary DB latency from making Pods NotReady?
Layer it from probe config inward:

**1. Give the probe a tolerance window.** NotReady happens after `failureThreshold` consecutive failures, each taking up to `periodSeconds` (plus `timeoutSeconds`). Size it to ride out blips you don't care about:
```yaml
readinessProbe:
  httpGet: { path: /readyz, port: 8080 }
  periodSeconds: 5
  timeoutSeconds: 3        # default 1s is too aggressive for most real apps
  failureThreshold: 6      # ~30s of continuous failure before NotReady
  successThreshold: 1
```

**2. Don't check the DB synchronously in the probe.** Have a background goroutine/thread check the DB every few seconds and record the result. `/readyz` reads that cached value and returns instantly, so probe latency never depends on DB latency. You can add hysteresis there too: only mark unhealthy after N consecutive failures, or only after the error rate is above X% for Y seconds.

**3. Keep the health endpoint off the hot path.** Serve it from a separate listener/port or a dedicated small thread pool, so a saturated request pool can't make it time out.

**4. Decide what "ready" means.** Usually: "this process can accept and handle requests". If the DB is slow, the app is still ready, but requests are slow. Handle that with **timeouts, circuit breakers and degraded responses**, not by pulling the Pod out of rotation.

**5. Fix the latency side.** DB-side: connection pooler, read replicas, query optimisation. App-side: short query and pool-acquire timeouts so latency is bounded instead of piling up.

**6. Watch for the opposite problem.** A very tolerant readiness probe means a genuinely broken Pod keeps receiving traffic for longer. That's why the probe should cover Pod-local failure modes quickly (process up, can serve) and treat shared-dependency issues slowly or not at all.

---

### 05. What happens if all Pods fail their readiness probes simultaneously?
**Mechanically:**
1. The kubelet on each node sets the Pod's `Ready` condition to `False`. **Nothing is restarted.**
2. The EndpointSlice controller marks every endpoint not-ready, so the Service has **zero ready endpoints**.
3. Traffic fails, and how it fails depends on the path:
   - **ClusterIP via kube-proxy (iptables mode):** no backends, so kube-proxy installs a REJECT rule, and clients get an immediate **connection refused** (some CNIs/eBPF dataplanes drop instead, giving timeouts).
   - **NGINX Ingress:** returns **503 Service Unavailable** ("no endpoints").
   - **AWS ALB with IP targets** (AWS Load Balancer Controller): targets fail health checks. If **all** targets in a target group are unhealthy, the ALB **fails open** and sends traffic to all of them anyway, so you may see errors from the app rather than a clean 503.
   - **Service mesh** (Istio/Envoy): 503 with `no healthy upstream`.
4. **Rollouts stall.** A new Pod must become Ready before old ones are removed, so a Deployment stuck in this state won't progress and eventually hits `progressDeadlineSeconds`.
5. **Drains get blocked.** PDBs count NotReady Pods as already disrupted, so `kubectl drain` may refuse to evict anything (unless the PDB sets `unhealthyPodEvictionPolicy: AlwaysAllow`).
6. **HPA reacts strangely.** HPA treats not-ready Pods conservatively when computing CPU, so scaling may stall when you'd expect it to scale out.

**Why it happens:** almost always a **shared cause**, not 30 independent Pod failures. Common culprits: a shared dependency checked in readiness (the DB, Redis, an auth service), a bad config or secret rolled out to everyone, DNS/CoreDNS failure, a NetworkPolicy change blocking the kubelet's probe or the dependency, node-level pressure, or a probe timeout too tight after a latency increase. (Full cluster-wide diagnosis: [04 Q43](./04-kubernetes-qna.md).)

**Triage:**
```bash
kubectl get endpointslices -l kubernetes.io/service-name=<svc> -n <ns>   # ready: false everywhere?
kubectl describe pod <pod> | grep -A5 -i readiness                         # probe failure message
kubectl get events -n <ns> --sort-by=.lastTimestamp | grep -i unhealthy
kubectl exec <pod> -- curl -sv localhost:8080/readyz                       # what does the endpoint say?
```

**Mitigations if you need traffic flowing again fast:**
- Fix or roll back the change that broke readiness (`kubectl rollout undo`).
- Temporarily relax the probe (raise `failureThreshold`/`timeoutSeconds`) or change the readiness endpoint to stop checking the shared dependency.
- Only in very specific cases: `publishNotReadyAddresses: true` on a Service publishes endpoints regardless of readiness. That's meant for StatefulSet peer discovery, not as an outage fix.

**The design lesson:** readiness should fail **independently per Pod**. If one shared event can fail all of them, the probe is turning a partial degradation into a total outage. It's better to serve degraded responses than nothing.

---

### 06. What are the probe parameters, and how do you calculate detection time?
| Field | Default | Meaning |
|---|---|---|
| `initialDelaySeconds` | 0 | Wait before the first probe. Prefer a startup probe over a big initial delay |
| `periodSeconds` | 10 | How often to probe |
| `timeoutSeconds` | 1 | How long each probe may take before counting as a failure |
| `failureThreshold` | 3 | Consecutive failures before acting |
| `successThreshold` | 1 | Consecutive successes to be considered passing again. **Must be 1 for liveness and startup** |
| `terminationGracePeriodSeconds` (probe-level) | Pod's value | Grace period used when a **liveness/startup** failure kills the container, so you can kill a hung container faster than a normal shutdown |

**Time to act ≈ `failureThreshold × periodSeconds`** (plus up to one `timeoutSeconds`). Defaults: 3 × 10 s = **~30 s** to mark NotReady or restart.

**Time to recover readiness ≈ `successThreshold × periodSeconds`.**

**Startup budget = `failureThreshold × periodSeconds`** of the startup probe, e.g. 30 × 10 s = 5 minutes for the app to start before it's killed.

Typical tuning: readiness fast and sensitive (react in 10–15 s to Pod-local problems), liveness slow and conservative (only restart after something is clearly wedged, e.g. 3–5 failures with a generous timeout).

---

### 07. When do you need a startup probe, and how do you size it?
Use one when **startup time is long or variable**: JVM apps, apps that load models or large caches, apps that run migrations, or anything that sometimes starts in 10 s and sometimes in 3 min.

**The problem it solves:** without it, you either set a large `initialDelaySeconds` on liveness (which slows detection of real hangs for the Pod's whole life) or keep liveness tight and get the container killed during slow starts, which leads to CrashLoopBackOff for a healthy app.

**How it works:** while the startup probe is running, **liveness and readiness are disabled**. Once it succeeds once, it never runs again and the other two take over. If it never succeeds within `failureThreshold × periodSeconds`, the container is killed.

```yaml
startupProbe:
  httpGet: { path: /healthz, port: 8080 }
  periodSeconds: 10
  failureThreshold: 30     # up to 5 min to start
livenessProbe:
  httpGet: { path: /healthz, port: 8080 }
  periodSeconds: 10
  failureThreshold: 3      # once started, ~30s to detect a hang
```
**Sizing:** set the startup budget to roughly the **p99 observed startup time × 1.5–2**. Check it against actual startup times: compare the container's `startedAt` with the Pod's `Ready` condition `lastTransitionTime`.

---

### 08. What should each health endpoint actually check?
| Endpoint | Used by | Should check | Should NOT check |
|---|---|---|---|
| `/livez` or `/healthz` | Liveness | Process responsive, main loop / event loop not blocked, worker heartbeat recent | DB, cache, downstream services, disk-full warnings |
| `/readyz` | Readiness | Server listening, config/secrets loaded, caches warmed, not draining (returns 503 after SIGTERM), not overloaded (optional) | Shared dependencies synchronously; anything slow |
| Startup | Startup probe | Initialisation finished (migrations, cache warm-up, model loaded) | — |
| `/health/deep` (optional) | Humans, synthetic monitoring, dashboards | Everything, including DB, cache and downstreams, with latency | Never wired to a probe |

Rules of thumb:
- Probes must be **cheap** (no DB queries, no heavy computation) and **fast** (well under `timeoutSeconds`).
- Make readiness return **503 as soon as shutdown begins** so the Pod leaves the endpoints while it drains in-flight requests.
- Don't put auth on probe endpoints, and serve them on a port that doesn't go through the public Ingress if they expose internals.
- Spring Boot Actuator, for example, has separate `liveness` and `readiness` groups. Make sure `db` isn't in the liveness group.

---

### 09. httpGet vs tcpSocket vs exec vs grpc probes — when would you use each?
| Type | Passes when | Use for | Watch out |
|---|---|---|---|
| `httpGet` | HTTP status 200–399 | Most web services | Redirects count as success; follow app semantics |
| `tcpSocket` | TCP connection opens | Non-HTTP services (DBs, brokers, raw TCP) | Only proves the port is open, not that the app works |
| `exec` | Command exits 0 | Custom checks (e.g. `pg_isready`, a CLI health command) | Forks a process in the container every period, which costs CPU at scale; the command must exist in the image; `timeoutSeconds` is enforced |
| `grpc` | gRPC Health Checking Protocol returns `SERVING` | gRPC services | App must implement `grpc.health.v1.Health` |

All probes are executed **by the kubelet on the node**, from the node's network namespace (for http/tcp/grpc) against the Pod IP. That's why most CNIs/NetworkPolicy implementations allow node-to-Pod probe traffic, and why a probe can pass while traffic from other Pods is blocked.

---

### 10. Pods keep getting restarted by liveness probes, but only under load. What's happening?
Classic symptoms: restart count rising during traffic peaks, `Liveness probe failed: ... context deadline exceeded (Client.Timeout exceeded while awaiting headers)` in events, and no crash in the logs (`kubectl logs --previous` shows a normal SIGTERM/SIGKILL).

**Likely causes:**
1. **Health endpoint shares the request thread pool.** Under load it queues behind real requests and exceeds `timeoutSeconds` (default 1 s).
2. **CPU throttling.** The container hits its CPU limit, CFS throttles it, and the probe response is delayed ([Q16](#16-what-is-cpu-throttling-and-should-you-set-cpu-limits)).
3. **GC pauses** (JVM/.NET/Go) longer than the probe timeout.
4. **Liveness checks a dependency** that slows under load ([Q03](#03-why-shouldnt-you-check-database-connectivity-using-a-liveness-probe)).

**Why it's a death spiral:** each restart removes capacity, the rest of the Pods get more load, they also fail liveness, and so on.

**Fix:**
- Look at events and probe failure messages, then at `container_cpu_cfs_throttled_periods_total` and GC metrics.
- Raise `timeoutSeconds` and `failureThreshold` on liveness. Liveness should be the **most tolerant** probe.
- Serve health on a separate lightweight path/thread.
- Fix capacity: right-size CPU requests, consider removing CPU limits, and scale out earlier with HPA.

---

### 11. What are readiness gates, and how does Pod readiness reach a cloud load balancer?
**The problem:** with the AWS Load Balancer Controller in **IP target mode**, the ALB sends traffic straight to Pod IPs and runs its **own** health checks. During a rolling update, Kubernetes might consider a new Pod Ready and terminate an old one **before** the ALB has registered the new target and marked it healthy. For a short window, the ALB has fewer (or zero) healthy targets, and you get 502/503s during deploys.

**Readiness gates** add extra conditions to Pod readiness: `spec.readinessGates` lists condition types that an external controller must set to `True` before the Pod counts as Ready. With the AWS LB Controller you enable injection with the namespace label `elbv2.k8s.aws/pod-readiness-gate-inject=enabled`. The controller then marks the Pod Ready only when its target is **healthy in the target group**, so the rollout waits for the load balancer.

Pair it with:
- `preStop` sleep (a few seconds longer than the ALB's deregistration) and a matching `terminationGracePeriodSeconds`, so old Pods finish in-flight requests after deregistration.
- ALB health-check settings that match your readiness endpoint.

GKE has the equivalent with NEGs (`cloud.google.com/neg` and its readiness gate).

---

## 🔹 Part B — Mid-Level Kubernetes Gap-Fill

### 12. What is a headless Service, and why do StatefulSets need one?
A **headless Service** has `clusterIP: None`. It gets no virtual IP and kube-proxy doesn't load-balance it. Instead, DNS returns the **individual Pod IPs**:
- `my-svc.ns.svc.cluster.local` → A records for every ready Pod (the client chooses).
- With a StatefulSet that sets `serviceName: my-svc`, each Pod also gets a **stable per-Pod DNS name**: `web-0.my-svc.ns.svc.cluster.local`, `web-1.my-svc...`.

**Why StatefulSets need it:** clustered stateful systems (Kafka, ZooKeeper, Cassandra, MongoDB/Postgres replicas, Elasticsearch) need to address **specific peers** ("the leader is db-0"), not a random replica behind a VIP. Stable names survive Pod restarts even though IPs change.

Also used for client-side load balancing (gRPC clients balancing across Pod IPs, since a normal ClusterIP balances per **connection**, and gRPC holds one long-lived HTTP/2 connection). `publishNotReadyAddresses: true` is often set so peers can discover each other before they're Ready.

---

### 13. Init containers vs sidecar containers — what runs when?
| | Init container | Sidecar (classic) | Native sidecar (`initContainers` + `restartPolicy: Always`) |
|---|---|---|---|
| Runs | **Sequentially, to completion**, before app containers start | Alongside app containers | Starts before app containers in init order, then **keeps running** |
| Typical use | Wait for a dependency, run migrations, fetch config/secrets, fix volume permissions | Log shipper, proxy (Envoy), config reloader | Same as sidecar, but with correct lifecycle |
| Failure | Pod restarts init sequence (per `restartPolicy`); Pod stays `Init:Error`/`Init:CrashLoopBackOff` | Container restarted | Restarted independently |

**Why native sidecars exist** (stable in recent Kubernetes versions): classic sidecars have lifecycle bugs. There's no guarantee the sidecar (e.g. the mesh proxy) starts before the app, so the app's first outbound calls fail. In a **Job**, the sidecar never exits, so the Job never completes. On shutdown, the sidecar may die before the app finishes draining. Native sidecars start first, don't block Job completion, and are stopped **after** the app containers.

Debugging an init container: `kubectl logs <pod> -c <init-container-name>`, and `kubectl describe pod` shows which one is stuck.

---

### 14. You update a ConfigMap. Do running Pods pick up the change?
Depends how it's consumed:
| Consumed as | Updates in running Pod? |
|---|---|
| Environment variables (`env`/`envFrom`) | **Never.** Env is fixed at container start |
| Mounted volume | **Yes, eventually**: the kubelet syncs it (typically within about a minute). The app must re-read the file (watch it, or reload on SIGHUP) |
| Volume with `subPath` | **Never** |
| Read via the API by the app | Whenever the app re-reads it |

**How teams handle it:**
- **Roll Pods on config change.** Helm: put a `checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}` annotation on the Pod template, so a config change changes the template and triggers a rollout. Or use Stakater **Reloader**, or Kustomize `configMapGenerator`, which appends a content hash to the name.
- Prefer a **rollout** over hot reload for most config: it's gradual, it goes through readiness, and it can be rolled back. Hot reload changes every Pod at once with no rollback.
- `immutable: true` ConfigMaps/Secrets reduce API server watch load and prevent accidental edits. You create a new one per version.

Same rules apply to Secrets.

---

### 15. Are Kubernetes Secrets actually secret? How do you make them safe?
Out of the box, not very:
- Values are **base64-encoded, not encrypted**. Anyone who can `get secrets` in a namespace can read them.
- They're stored in **etcd**, unencrypted unless you turn on encryption at rest.
- Anyone who can **create a Pod** in a namespace can mount any Secret in that namespace, so "can create Pods" effectively means "can read Secrets".
- They end up in places like Git if people commit manifests.

**Hardening:**
1. **Encryption at rest** for etcd: `EncryptionConfiguration` with a KMS provider (EKS/GKE/AKS envelope encryption with a cloud KMS key).
2. **Tight RBAC**: no wildcard `get/list` on secrets, and watch out for `list` (it returns full contents). Restrict who can create Pods in sensitive namespaces.
3. **Keep the source of truth outside the cluster**: External Secrets Operator or the Secrets Store CSI Driver pulling from AWS Secrets Manager / Vault / Azure Key Vault, so Git never holds secrets. For GitOps, Sealed Secrets or SOPS if they must live in Git encrypted.
4. **Avoid long-lived secrets entirely** where possible: workload identity (IRSA / EKS Pod Identity, GKE Workload Identity, Azure Workload Identity) instead of static cloud keys.
5. Prefer **mounted files over env vars** (env vars leak into crash dumps, `/proc`, and child processes), and set `automountServiceAccountToken: false` where the Pod doesn't need API access.
6. **Audit logs** on secret access, and rotation.

---

### 16. What is CPU throttling, and should you set CPU limits?
**Memory and CPU behave differently at the limit:**
- Memory over limit → the container is **OOMKilled** (exit code 137). Memory isn't compressible.
- CPU over limit → the container is **throttled**, not killed. CPU is compressible.

**How throttling works:** the CPU limit becomes a CFS quota, e.g. `limits.cpu: 500m` = 50 ms of CPU time per 100 ms period. A multi-threaded app can burn through 50 ms in the first 10 ms of the period (e.g. 5 threads), then it's **frozen for 90 ms**. Average CPU usage might look like 30%, but p99 latency spikes, probes time out, and GC stalls.

**Detect:** `container_cpu_cfs_throttled_periods_total / container_cpu_cfs_periods_total` (throttled ratio). Anything consistently above a few percent on a latency-sensitive service is worth fixing.

**Should you set CPU limits?** A common, defensible position:
- **Always set CPU requests** (scheduling and fair share under contention depend on them) and **memory requests = memory limits** for predictable behaviour.
- **Many teams drop CPU limits** for latency-sensitive services: with requests set, contention is already shared proportionally, and limits only add throttling when spare CPU is sitting idle on the node.
- **Keep CPU limits** where you need hard isolation: multi-tenant clusters, noisy batch jobs, or when you need **Guaranteed QoS** (requests = limits for both CPU and memory).
- Language runtimes need to know their CPU budget: set `GOMAXPROCS` (e.g. `automaxprocs`), and use JVM container awareness (`-XX:ActiveProcessorCount` if needed).

---

### 17. How does `imagePullPolicy` work, and why is `:latest` a problem?
| Policy | Behaviour |
|---|---|
| `Always` | Kubelet checks the registry every time a container starts (it only downloads layers it doesn't have) |
| `IfNotPresent` | Uses the cached image on the node if present |
| `Never` | Only uses a local image |

**Defaults:** if the tag is `:latest` or there's **no tag**, the default is `Always`; otherwise `IfNotPresent`.

**Why `:latest` (or any mutable tag) hurts:**
- **Nodes drift**: with `IfNotPresent`, different nodes run different "latest" images depending on when they pulled.
- **No rollback**: `kubectl rollout undo` goes back to the same tag, which now points to the new image.
- **No audit**: you can't tell from the manifest what's actually running.
- **Changing the image behind a tag doesn't trigger a rollout**, because the Pod spec didn't change.

**Do this instead:** immutable tags (git SHA or semver) or, better, **digests** (`image: repo/app@sha256:...`). Enable tag immutability in the registry (ECR/ACR/Artifact Registry support it), and enforce it with an admission policy (Kyverno/Gatekeeper: "disallow `:latest`").

---

### 18. A rollout is stuck. How do you detect it and recover?
**Detect:**
```bash
kubectl rollout status deploy/api -n prod --timeout=5m   # exits non-zero if not complete (use in CI)
kubectl get deploy api -o jsonpath='{.status.conditions}' # Progressing=False, reason ProgressDeadlineExceeded
kubectl get rs -l app=api                                  # new RS stuck with 0/1 ready
```
`progressDeadlineSeconds` (default **600 s**) marks the Deployment `Progressing=False` with `ProgressDeadlineExceeded` if no progress is made. Kubernetes **doesn't roll back automatically**: it just reports it. Your pipeline or tool (Argo Rollouts, Flux, Helm `--atomic`/`--rollback-on-failure`) decides what to do.

**Why rollouts get stuck:** new Pods never become Ready (bad config, failing readiness, image pull error, crash), not enough capacity for `maxSurge` Pods (Pending), a ResourceQuota blocking new Pods, or a PDB/quorum issue on StatefulSets.

**Recover:**
```bash
kubectl rollout undo deploy/api -n prod                 # back to previous revision
kubectl rollout undo deploy/api --to-revision=12        # specific revision
kubectl rollout history deploy/api                      # what revisions exist
kubectl rollout pause / resume deploy/api               # stop mid-rollout to investigate
```
In GitOps, **revert the commit** instead of using `rollout undo`, otherwise Argo CD/Flux will put the broken version straight back.

---

### 19. Explain `maxSurge` and `maxUnavailable` with numbers, and when to use Recreate.
For a Deployment with **10 replicas**, defaults `maxSurge: 25%`, `maxUnavailable: 25%`:
- `maxSurge` 25% of 10 = 2.5 → **rounded up** to 3: up to **13** Pods can exist during the rollout.
- `maxUnavailable` 25% of 10 = 2.5 → **rounded down** to 2: at least **8** must stay available.

Common settings:
| Setting | Effect |
|---|---|
| `maxSurge: 1, maxUnavailable: 0` | Safest: never below full capacity, one new Pod at a time; slow; needs spare cluster capacity |
| `maxSurge: 100%, maxUnavailable: 0` | Brings up a full new set before removing old (blue/green-like); needs 2× capacity briefly |
| `maxSurge: 0, maxUnavailable: 1` | No extra capacity needed, but runs one Pod short during rollout |

Both can't be 0. `minReadySeconds` makes a new Pod stay Ready for N seconds before it counts as available, which catches apps that crash shortly after starting.

**`Recreate`**: kills all old Pods, then starts new ones, so there is **downtime**. Use it when two versions **cannot run at the same time**: a `ReadWriteOnce` volume that only one Pod can mount, a singleton that must not run twice, or an incompatible schema change you can't make backward-compatible.

---

### 20. `kubectl drain` hangs. Why, and how do PDBs interact with it?
`kubectl drain` cordons the node, then **evicts** Pods through the Eviction API, which respects **PodDisruptionBudgets**. It hangs (retrying "Cannot evict pod as it would violate the pod's disruption budget") when:
1. **PDB with no slack**: e.g. `minAvailable: 2` with 2 replicas, or `maxUnavailable: 0`. Nothing can ever be evicted.
2. **Unhealthy Pods count against the budget**: if some replicas are already NotReady, the PDB has no room left.
3. **Replacement can't schedule**: the evicted Pod's replacement stays Pending (no capacity, affinity/taints, PV in another AZ), so the PDB stays at its limit for the next eviction.
4. **Single-replica Deployments** with a PDB of `minAvailable: 1`.

Other drain blockers: Pods with `emptyDir` (needs `--delete-emptydir-data`), DaemonSet Pods (`--ignore-daemonsets`), bare Pods with no controller (`--force`, and they won't come back).

**Fix:** check `kubectl get pdb -A` (look at `ALLOWED DISRUPTIONS` = 0), scale up the workload or fix unhealthy Pods, make sure there's capacity elsewhere. **Design rule:** PDBs should always allow at least one disruption at normal replica counts (`maxUnavailable: 1` is often easier to reason about than `minAvailable`), and set `unhealthyPodEvictionPolicy: AlwaysAllow` so broken Pods don't block maintenance. Managed node upgrades (EKS, GKE) will also stall or eventually force through on a bad PDB.

---

### 21. A Pod is stuck in Terminating. What do you do?
**Find out why first:**
```bash
kubectl get pod <p> -o jsonpath='{.metadata.finalizers}{"\n"}{.metadata.deletionTimestamp}'
kubectl describe pod <p>
kubectl get node <node>     # is the node NotReady?
```
Common causes:
1. **Node is down/unreachable.** The kubelet can't confirm the containers stopped, so the API keeps the Pod in Terminating. This is deliberate safety, especially for StatefulSets (to avoid two Pods with the same identity writing to the same volume).
2. **Finalizers** that a controller hasn't removed (the controller is broken or uninstalled).
3. **The app ignores SIGTERM** and the grace period is long. It will be SIGKILLed when `terminationGracePeriodSeconds` expires.
4. **Volume detach/unmount problems** (CSI driver issues).

**Fixes:** bring the node back, or delete the Node object if it's truly gone. Fix or remove the stuck finalizer only if you understand what it protects (`kubectl patch pod <p> -p '{"metadata":{"finalizers":null}}'`). As a last resort, `kubectl delete pod <p> --grace-period=0 --force`. That **only removes the API object**; the container may still be running on an unreachable node. For StatefulSets with RWO volumes, that risk is split-brain/data corruption, so confirm the node is really dead first. (Newer Kubernetes adds the `node.kubernetes.io/out-of-service` taint for safely handling dead nodes.)

---

### 22. The HPA isn't scaling. What do you check?
```bash
kubectl get hpa api -n prod            # TARGETS shows <unknown>/70% ?
kubectl describe hpa api -n prod       # conditions + events tell you exactly why
```
Checklist:
1. **`<unknown>` metrics**: metrics-server not installed/healthy (`kubectl top pods` fails), or for custom metrics the Prometheus Adapter / KEDA isn't serving that metric.
2. **No resource requests.** CPU utilisation % is calculated against **requests**. Without a request on every container (including sidecars), HPA can't compute it.
3. **At `maxReplicas`**, so `ScalingLimited` shows in conditions.
4. **Wrong metric for the bottleneck**: CPU looks fine because the app is I/O or queue bound. Scale on RPS, latency, or queue depth instead (custom/external metrics, or **KEDA** for queue lag, cron schedules, Kafka lag, scale-to-zero).
5. **Stabilisation windows**: scale-down waits 5 min by default; `behavior` controls rate limits in both directions.
6. **Pods scheduled but Pending**: the HPA did scale, but there's no node capacity, so look at Cluster Autoscaler/Karpenter.
7. **Conflict with VPA** on CPU/memory, or something else (like a GitOps tool) resetting `replicas`. Don't set `spec.replicas` in Git when an HPA owns it.

---

### 23. How does kubectl authenticate, and what is in a kubeconfig?
A kubeconfig (`~/.kube/config` or `$KUBECONFIG`) has three lists and a pointer:
- **clusters**: API server URL + CA certificate.
- **users**: credentials (client cert/key, token, or an **exec plugin** that fetches a token on demand).
- **contexts**: a (cluster, user, default namespace) triple.
- **current-context**: which one kubectl uses.

```bash
kubectl config get-contexts
kubectl config use-context prod-eks
kubectl config set-context --current --namespace=payments
kubectl auth can-i delete pods -n prod           # check your permissions
kubectl auth can-i --list --as=system:serviceaccount:ci:deployer
```
**Flow:** authentication (who are you: cert, OIDC token, cloud IAM token) → authorization (RBAC: are you allowed this verb on this resource) → admission (mutating/validating webhooks, policy engines) → persisted to etcd.

**EKS specifically:** `aws eks update-kubeconfig` writes an exec plugin entry that runs `aws eks get-token`, generating a short-lived token from your IAM identity. The cluster maps IAM principals to Kubernetes users/groups using **EKS access entries** (the newer approach) or the legacy `aws-auth` ConfigMap. "You must be logged in to the server (Unauthorized)" usually means your IAM principal isn't mapped, or you're using the wrong AWS profile.

Safety habits: show the current context in your prompt, use separate kubeconfigs per environment, and give humans read-only access to prod by default with break-glass for writes.

---

### 24. What are CRDs and Operators, and when would you write one?
- A **CustomResourceDefinition (CRD)** adds a new resource type to the API (e.g. `Certificate`, `KafkaTopic`, `Rollout`). You can `kubectl get` and `apply` it like built-in types, and it's stored in etcd.
- An **Operator** is a CRD plus a **controller** that reconciles it: it watches the custom resources and does whatever is needed to make reality match the spec, encoding the operational knowledge a human would apply (provisioning, failover, backup, upgrades).

Examples you've probably used: cert-manager, Prometheus Operator (`ServiceMonitor`), Argo CD (`Application`), External Secrets, CloudNativePG/Strimzi, Karpenter (`NodePool`).

**When to write one:** when you have repeated, stateful operational logic that should run continuously (e.g. provisioning tenant environments, managing a database cluster's lifecycle). Frameworks: Kubebuilder / Operator SDK (Go), kopf (Python). **When not to:** if a Helm chart or a CI job does it, an operator is extra code to own, upgrade and secure. Note: a broken or deleted operator can leave resources with **finalizers that never clear**, which is a common cause of namespaces stuck in Terminating.

---

### 25. How does a Pod call a Service in another namespace?
DNS names Kubernetes creates for a Service `orders` in namespace `shop`:
- `orders` — only works from Pods **in the same namespace** (resolved via the search path)
- `orders.shop` — works from any namespace
- `orders.shop.svc.cluster.local` — fully qualified (cluster domain is usually `cluster.local`)

So from namespace `web`: `http://orders.shop:8080` or the FQDN.

**If it doesn't work:**
1. Does DNS resolve? `kubectl exec -it <pod> -- nslookup orders.shop` (if it fails: CoreDNS health, or egress NetworkPolicy blocking port 53 UDP/TCP to kube-dns).
2. Does the Service have endpoints? `kubectl get endpointslices -n shop -l kubernetes.io/service-name=orders`.
3. Is a **NetworkPolicy** blocking it? Check the destination namespace's ingress policies (they need a `namespaceSelector` allowing `web`) and the source's egress policies.
4. Mesh mTLS / AuthorizationPolicy denying it (Istio returns 403 `RBAC: access denied`).

Performance note: with the default `ndots:5`, a short name like `api.example.com` is tried against every search domain first, adding several DNS lookups per call. Use FQDNs with a trailing dot for external names, or lower `ndots` in `dnsConfig`.

---

### 26. What kubectl commands do you use most when troubleshooting?
```bash
# Overview
kubectl get pods -n <ns> -o wide                    # status, restarts, node, IP
kubectl get events -n <ns> --sort-by=.lastTimestamp # the timeline; check this first
kubectl describe pod <pod>                           # events, probe failures, last state, exit code

# Logs
kubectl logs <pod> -c <container> --previous         # logs from the crashed instance
kubectl logs -l app=api --tail=100 -f --max-log-requests=10

# Inside the Pod
kubectl exec -it <pod> -- sh
kubectl debug -it <pod> --image=nicolaka/netshoot --target=<container>   # ephemeral debug container (distroless images)
kubectl debug node/<node> -it --image=ubuntu                              # shell on the node (host fs at /host)

# Resources and scheduling
kubectl top pods -n <ns> --containers ; kubectl top nodes
kubectl describe node <node>                         # allocated resources, conditions, taints

# Networking
kubectl get svc,endpointslices -n <ns>
kubectl port-forward svc/api 8080:80

# Rollouts and config
kubectl rollout status|history|undo deploy/<name>
kubectl get deploy <name> -o yaml | less             # what's actually applied
kubectl diff -f manifest.yaml                        # what would change
kubectl auth can-i <verb> <resource> --as=<user>
```
Exit codes to know from `describe` → `Last State`: **0** clean exit, **1** app error, **126/127** command not executable / not found, **137** SIGKILL (OOMKilled or killed after the grace period), **139** segfault, **143** SIGTERM.

---

## 🔹 Part C — Rapid-Fire Revision Round
One- or two-line answers for the "quick questions" part of a screen. If they dig in, expand using the linked deep answers.

### 27. Rapid-fire: Kubernetes
| Question | Answer |
|---|---|
| Deployment vs StatefulSet vs DaemonSet? | Stateless interchangeable replicas / stable identity + per-Pod storage + ordered rollout / one Pod per (matching) node |
| What does etcd store? | All cluster state. Back it up (`etcdctl snapshot save`); it's the only stateful control-plane component |
| What does the scheduler do? | Filters nodes (resources, taints, affinity, volumes) then scores them, and binds the Pod. It doesn't start containers; the kubelet does |
| What does kube-proxy do? | Programs iptables/IPVS (or eBPF with Cilium) rules so Service VIPs route to Pod endpoints |
| ClusterIP vs NodePort vs LoadBalancer? | Internal VIP / port on every node (30000–32767) / cloud LB in front of NodePort or Pod IPs |
| Ingress vs Gateway API? | Ingress: L7 HTTP routing, controller-specific annotations. Gateway API: its successor, role-oriented (GatewayClass/Gateway/HTTPRoute), richer and portable |
| What decides QoS class? | Guaranteed (requests = limits for all), Burstable (some requests), BestEffort (none). BestEffort is evicted first |
| What is a PDB? | Limits voluntary disruptions (drains, upgrades), not crashes or node failures |
| Taints vs node affinity? | Taints repel Pods from nodes (Pods opt in with tolerations); affinity attracts Pods to nodes |
| How do you spread Pods across AZs? | `topologySpreadConstraints` on `topology.kubernetes.io/zone`, or pod anti-affinity |
| What happens when a node dies? | NotReady after ~40 s, Pods evicted after the toleration (default 300 s), recreated elsewhere by controllers |
| How do Pods get AWS permissions? | IRSA or EKS Pod Identity: ServiceAccount mapped to an IAM role, short-lived credentials, no static keys |
| Pod Security Standards? | Privileged / Baseline / Restricted, enforced per namespace by Pod Security Admission labels |
| What's a NetworkPolicy default? | No policy = all traffic allowed. Once any policy selects a Pod, only explicitly allowed traffic in that direction is permitted |
| Helm: what's a release? | An installed instance of a chart with a revision history; `helm rollback` restores a previous revision |
| How do you back up a whole cluster's apps? | GitOps repo for manifests + Velero for resources and PV snapshots + etcd snapshots for self-managed control planes |
| Static Pod? | Pod defined by a file on the node (`/etc/kubernetes/manifests`), run directly by the kubelet; how kubeadm runs the control plane |
| Why can't Pods reach each other across nodes? | CNI broken or misconfigured, security groups/firewall blocking Pod CIDRs, or a NetworkPolicy |

### 28. Rapid-fire: Docker, Linux, networking
| Question | Answer |
|---|---|
| Container vs VM? | Containers share the host kernel (namespaces + cgroups); VMs have their own kernel on a hypervisor |
| `CMD` vs `ENTRYPOINT`? | ENTRYPOINT is the executable; CMD gives default arguments (overridable at `docker run`) |
| Why multi-stage builds? | Build tools stay in the build stage; the final image only has the runtime artefact. Smaller and fewer CVEs |
| Why is my container ignoring `docker stop`? | App runs as a child of a shell (shell-form CMD), so PID 1 doesn't forward SIGTERM. Use exec form or `tini`/`--init` |
| `COPY` vs `ADD`? | Use COPY. ADD also extracts tarballs and fetches URLs, which is surprising |
| How do layers cache? | Each instruction is a layer; a change invalidates that layer and all after it. Copy dependency files and install before copying source |
| Load average 8 on 4 cores? | Runnable + uninterruptible (D-state) tasks; check whether it's CPU (`us/sy`) or I/O wait (`wa`) |
| Disk full but `du` doesn't add up? | Deleted file still held open by a process: `lsof +L1`, restart or truncate via `/proc/<pid>/fd` |
| Inodes full? | `df -i`; usually millions of tiny files (sessions, cache) |
| TCP 3-way handshake? | SYN, SYN-ACK, ACK. TIME_WAIT is on the side that closes first |
| What does `curl -v` connect timeout vs refused tell you? | Timeout: packet dropped (firewall/SG/routing). Refused: host reachable, nothing listening (or REJECT rule) |
| DNS record types? | A/AAAA (address), CNAME (alias), MX, TXT, NS, SRV, PTR (reverse). Route 53 alias records work at the zone apex |
| HTTP 502 vs 503 vs 504? | 502 bad response from upstream / 503 no healthy upstream or overloaded / 504 upstream timed out |
| TLS handshake basics? | Client hello → server cert + key exchange → session keys. Cert must chain to a trusted CA and match the hostname (SAN) |

### 29. Rapid-fire: CI/CD, Git, Terraform, cloud
| Question | Answer |
|---|---|
| CI vs CD vs continuous deployment? | Integrate and test every change / always releasable / every passing change goes to prod automatically |
| Merge vs rebase? | Merge keeps history with a merge commit; rebase rewrites onto the new base for linear history. Don't rebase shared branches |
| Undo a pushed commit? | `git revert` (new commit), not `reset` + force push on a shared branch |
| How do you store secrets in CI? | CI secret store or OIDC federation to the cloud (no long-lived keys); mask them in logs; scope per environment |
| Blue/green vs canary? | Two full environments with a switch / gradual traffic shift with metric-based promotion |
| Terraform state, why remote? | Shared source of truth, locking (S3 + DynamoDB or S3 native locking, TF Cloud), encryption, no local loss |
| `terraform plan` shows drift? | Someone changed infra outside Terraform: import, revert, or codify the change; `-refresh-only` to update state |
| `count` vs `for_each`? | `for_each` keys by name, so removing one item doesn't shift and recreate the others |
| Module vs workspace? | Reusable code unit / separate state for the same config. Many teams prefer separate directories per environment over workspaces |
| Security group vs NACL? | Stateful, instance-level, allow-only / stateless, subnet-level, allow + deny, ordered rules |
| Public vs private subnet? | Public has a route to an Internet Gateway; private goes out through a NAT gateway (or not at all) |
| IAM role vs user? | Role: assumed, temporary credentials; user: long-lived identity. Prefer roles everywhere |
| RTO vs RPO? | How long to recover / how much data you can lose |
| How to reduce cloud cost quickly? | Rightsize, delete idle resources, Savings Plans/RIs for baseline, Spot for fault-tolerant workloads, storage lifecycle policies, watch NAT and cross-AZ data transfer |

### 30. Rapid-fire: Observability and SRE
| Question | Answer |
|---|---|
| Metrics vs logs vs traces? | Aggregated numbers over time / discrete events / a request's path across services |
| Golden signals? | Latency, traffic, errors, saturation (RED for services, USE for resources) |
| SLI vs SLO vs SLA? | The measurement / the internal target / the contractual promise with penalties |
| 99.9% monthly availability = ? | ~43 minutes of downtime a month (99.99% ≈ 4.3 min) |
| What's an error budget? | 1 − SLO. When it's spent, reliability work takes priority over features |
| Why alert on burn rate? | Pages on how fast you're spending the budget, so you get fewer false alarms and catch slow burns |
| Counter vs gauge vs histogram? | Only goes up (use `rate()`) / goes up and down / buckets for latency percentiles |
| Why is high cardinality bad? | Each label combination is a separate time series; user IDs as labels blow up memory and cost |
| p99 vs average? | Averages hide the slow tail; users feel p99 |
| What's toil? | Manual, repetitive, automatable work that scales with load and has no lasting value |
| Blameless postmortem? | Focus on systems and contributing factors, not who; produce action items with owners |
| Incident roles? | Incident commander, operations lead, communications lead, scribe |
| MTTD / MTTR? | Time to detect / time to restore. Improve with good alerts, runbooks, fast rollback |
| How do you reduce alert fatigue? | Alert on symptoms (SLOs), not causes; every page must be actionable; route the rest to tickets/dashboards |

---

## 🗺️ Part D — Mid-Level DevOps/SRE Topic Map
Every topic that comes up regularly in mid-level (2–5 years) DevOps and SRE interviews, and where to find the answer in this hub.

| Area | Topic | Where |
|---|---|---|
| **K8s architecture** | Control plane, worker components, `kubectl apply` flow | [04 Q3–Q4, Q21](./04-kubernetes-qna.md), [23 Q2](./23-how-it-works-internals-qna.md) |
| | Scheduling, taints, affinity, topology spread | [04 Q31, Q44, Q63](./04-kubernetes-qna.md), [23 Q1](./23-how-it-works-internals-qna.md) |
| | etcd, backups, controllers / reconciliation | [04 Q41, Q45](./04-kubernetes-qna.md) |
| **K8s workloads** | Deployment / StatefulSet / DaemonSet / Job | [04 Q5, Q18–Q20](./04-kubernetes-qna.md) |
| | Init and sidecar containers, headless Services | [43 Q12–Q13](#12-what-is-a-headless-service-and-why-do-statefulsets-need-one) |
| | Rolling updates, surge math, stuck rollouts, rollback | [04 Q14, Q39, Q59](./04-kubernetes-qna.md), [43 Q18–Q19](#18-a-rollout-is-stuck-how-do-you-detect-it-and-recover) |
| **Health & resilience** | Liveness / readiness / startup probes, DB checks | [43 Q01–Q11](#01-which-probe-would-you-use-to-check-database-connectivity), [04 Q15](./04-kubernetes-qna.md), [23 Q4](./23-how-it-works-internals-qna.md) |
| | Graceful shutdown, preStop, PDBs, drains | [04 Q59](./04-kubernetes-qna.md), [23 Q17](./23-how-it-works-internals-qna.md), [43 Q20](#20-kubectl-drain-hangs-why-and-how-do-pdbs-interact-with-it) |
| | Node failure and self-healing | [04 Q64](./04-kubernetes-qna.md), [23 Q16](./23-how-it-works-internals-qna.md) |
| **K8s resources** | Requests/limits, QoS, OOMKilled, eviction | [04 Q28–Q29, Q57, Q61](./04-kubernetes-qna.md) |
| | CPU throttling, CPU limits debate | [43 Q16](#16-what-is-cpu-throttling-and-should-you-set-cpu-limits) |
| | HPA / VPA / Cluster Autoscaler / Karpenter / KEDA | [04 Q30, Q52](./04-kubernetes-qna.md), [23 Q5](./23-how-it-works-internals-qna.md), [28 Q06](./28-production-scenarios-rapid-round-qna.md), [43 Q22](#22-the-hpa-isnt-scaling-what-do-you-check) |
| **K8s networking** | Pod networking model, kube-proxy, Services | [04 Q6–Q7, Q22–Q23](./04-kubernetes-qna.md), [23 Q3](./23-how-it-works-internals-qna.md) |
| | Ingress, Gateway API, traffic flow | [04 Q24–Q26](./04-kubernetes-qna.md), [33](./33-platform-engineering-deep-dive-qna.md) |
| | DNS, cross-namespace calls, NetworkPolicy debugging | [04 Q35, Q53](./04-kubernetes-qna.md), [28 Q08](./28-production-scenarios-rapid-round-qna.md), [43 Q25](#25-how-does-a-pod-call-a-service-in-another-namespace) |
| **K8s security** | RBAC, ServiceAccounts, kubeconfig/auth | [04 Q33–Q34](./04-kubernetes-qna.md), [43 Q23](#23-how-does-kubectl-authenticate-and-what-is-in-a-kubeconfig) |
| | Secrets, encryption, ESO, workload identity | [28 Q18](./28-production-scenarios-rapid-round-qna.md), [43 Q15](#15-are-kubernetes-secrets-actually-secret-how-do-you-make-them-safe) |
| | Multi-tenancy, blast radius, admission policy | [04 Q42, Q48, Q55](./04-kubernetes-qna.md) |
| **K8s troubleshooting** | Pending, CrashLoopBackOff, ImagePullBackOff, Terminating | [04 Q36–Q38, Q49–Q50, Q60](./04-kubernetes-qna.md), [43 Q21](#21-a-pod-is-stuck-in-terminating-what-do-you-do) |
| | Node issues: DiskPressure, kubelet restarts | [40](./40-aws-eks-linux-troubleshooting-scenarios-qna.md), [04 Q56](./04-kubernetes-qna.md) |
| | Command toolkit, exit codes | [43 Q26](#26-what-kubectl-commands-do-you-use-most-when-troubleshooting) |
| **K8s ecosystem** | Helm, Argo CD/Flux, Argo Rollouts, operators/CRDs | [29](./29-jenkins-k8s-helm-interview-rounds-qna.md), [20](./20-devops-roadmap-gap-fill-qna.md), [33](./33-platform-engineering-deep-dive-qna.md), [43 Q24](#24-what-are-crds-and-operators-and-when-would-you-write-one) |
| | ConfigMap reloads, image tags & pull policy | [43 Q14, Q17](#14-you-update-a-configmap-do-running-pods-pick-up-the-change) |
| **Containers** | Docker internals, images, multi-stage, security | [03](./03-docker-qna.md), [23 Q6](./23-how-it-works-internals-qna.md), [28 Q03–Q04](./28-production-scenarios-rapid-round-qna.md) |
| **Linux** | Processes, high CPU/memory/disk, OOM, systemd | [01](./01-linux-and-scripting-qna.md), [41 Q1–Q3](./41-linux-programming-dsa-gap-fill-qna.md), [28 Q01](./28-production-scenarios-rapid-round-qna.md) |
| **Networking** | OSI, TCP, DNS, TLS, LBs, 502/503/504 | [08](./08-networking-and-security-fundamentals-qna.md), [31 Q01](./31-core-devops-scenarios-gap-fill-qna.md), [40 Q03](./40-aws-eks-linux-troubleshooting-scenarios-qna.md) |
| **CI/CD** | Pipelines, Jenkins, GitHub Actions, failures | [05](./05-cicd-jenkins-github-actions-qna.md), [28 Q09–Q10](./28-production-scenarios-rapid-round-qna.md) |
| | Deployment strategies, rollback, approvals | [14](./14-deployment-systemdesign-behavioral-qna.md), [28 Q10](./28-production-scenarios-rapid-round-qna.md) |
| **Git** | Branching, rebase vs merge, recovery | [02](./02-git-version-control-qna.md) |
| **IaC** | Terraform state, locking, modules, drift | [06](./06-terraform-and-iac-qna.md), [28 Q13–Q14](./28-production-scenarios-rapid-round-qna.md) |
| | Ansible | [09](./09-ansible-and-config-management-qna.md), [39](./39-ansible-aws-fintech-production-scenarios-qna.md) |
| **Cloud** | AWS core services, VPC, IAM, EKS | [07](./07-aws-cloud-qna.md), [24](./24-aws-deep-dive-qna.md), [36](./36-aws-networking-deep-dive-qna.md) |
| | HA / DR design | [27](./27-cloud-architecture-scenarios-qna.md), [28 Q11–Q12](./28-production-scenarios-rapid-round-qna.md) |
| **Observability** | Prometheus, Grafana, OTel, alerting, latency RCA | [11](./11-monitoring-logging-observability-qna.md), [35](./35-observability-rca-scripting-go-qna.md), [28 Q15–Q16](./28-production-scenarios-rapid-round-qna.md) |
| **SRE practice** | SLI/SLO/error budgets, incidents, postmortems, toil | [13](./13-sre-incident-loadbalancing-servicemesh-qna.md), [28 Q17](./28-production-scenarios-rapid-round-qna.md), [42 Q5](./42-system-design-staff-sre-qna.md) |
| | Slow dependencies, retries, circuit breakers | [43 Q02](#02-what-happens-if-the-database-becomes-slow-but-doesnt-go-down), [13 Q15](./13-sre-incident-loadbalancing-servicemesh-qna.md), [42 Q3](./42-system-design-staff-sre-qna.md) |
| **Security** | DevSecOps, scanning, secrets in CI | [12](./12-security-devsecops-qna.md), [28 Q18–Q19](./28-production-scenarios-rapid-round-qna.md) |
| **Scripting** | Bash/Python tasks, live-coding | [18](./18-practical-scripting-challenges-qna.md), [15](./15-python-for-devops-qna.md), [28 Q02, Q20](./28-production-scenarios-rapid-round-qna.md) |
| **Design & behavioural** | System design, STAR stories | [27](./27-cloud-architecture-scenarios-qna.md), [42](./42-system-design-staff-sre-qna.md), [14](./14-deployment-systemdesign-behavioral-qna.md), [19](./19-company-specific-and-behavioral-plus-qna.md) |

**How to use this for a mid-level loop:** expect one round on Kubernetes depth (Part A is a very common thread, because each answer leads to the next question), one troubleshooting scenario (pick three from [28](./28-production-scenarios-rapid-round-qna.md) and [40](./40-aws-eks-linux-troubleshooting-scenarios-qna.md) and practise them out loud with commands), one round on CI/CD + IaC + cloud, and a behavioural round. Use Part C the night before.
