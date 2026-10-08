# Pod Lifecycle, Probes, Resources & Graceful Shutdown — In Depth

> Extends [k8s-learning-path §11–12](../k8s-learning-path.md) and [K-pods.md](../K-pods.md).

---

## 1. Pod phases vs container states vs conditions (three different things)

**Pod `status.phase`** (coarse): `Pending` → `Running` → `Succeeded` | `Failed` (+ `Unknown` when node unreachable).
- `Pending`: not scheduled yet (no node fits — check `kubectl describe pod` Events) **or** images still pulling.
- `Running`: at least one container running/starting.
- `Succeeded/Failed`: all containers terminated (Jobs; `restartPolicy` ≠ Always).

**Container state**: `Waiting` (reason: `ContainerCreating`, `ImagePullBackOff`, `ErrImagePull`, `CrashLoopBackOff`, `CreateContainerConfigError`) → `Running` → `Terminated` (reason: `Completed`, `Error`, `OOMKilled`; exit code).

**Pod conditions**: `PodScheduled`, `Initialized`, `ContainersReady`, `Ready`. **`Ready` is what Services/EndpointSlices use** — not `Running`. A pod can be `Running` but not `Ready` (readiness probe failing).

The `READY 1/2 STATUS Running` column = ready containers / total containers.

### Common status reasons
| You see | Meaning | Look at |
|---|---|---|
| `Pending` forever | unschedulable: resources, taints, nodeSelector, unbound PVC | `describe pod` → Events (`0/3 nodes available: …`) |
| `ImagePullBackOff` | wrong name/tag, private registry w/o `imagePullSecrets`, rate limit | Events |
| `CrashLoopBackOff` | container exits repeatedly; kubelet backs off 10s→20s→…→5 min | `kubectl logs --previous`, exit code |
| `CreateContainerConfigError` | missing ConfigMap/Secret/key referenced | Events |
| `OOMKilled` (exit 137) | memory limit exceeded | raise limit / fix leak |
| exit 137 without OOM | SIGKILL after grace period | slow shutdown, liveness kill |
| `Evicted` | node pressure (disk/memory) | node conditions, QoS |
| `Terminating` stuck | finalizer or kubelet/node problem | `kubectl get pod -o yaml` → finalizers; `--force --grace-period=0` last resort |

---

## 2. Startup order

1. Scheduler binds pod to node.
2. kubelet pulls images, sets up volumes, CNI gives pod IP.
3. **initContainers** run **sequentially**, each to completion (restart on failure per `restartPolicy`). Use for: wait for DB, run migrations, fetch config, set file permissions.
4. App containers start (in parallel). Native **sidecars** (`initContainers` with `restartPolicy: Always`, GA 1.33) start in order and stay running, shut down after main containers.
5. `postStart` hook (async with ENTRYPOINT — no ordering guarantee) → `startupProbe` → `liveness`/`readiness`.
6. Pod marked `Ready` → added to EndpointSlices.

---

## 3. Probes — what each does and the numbers

| Probe | Question | On failure | Gates |
|---|---|---|---|
| `startupProbe` | has the app finished booting? | container **restarted** | disables the other two until it succeeds once |
| `livenessProbe` | is the process wedged? | container **restarted** | — |
| `readinessProbe` | should it receive traffic now? | **removed from endpoints**, not restarted | Service/Ingress routing, rollout progress |

Mechanisms: `httpGet` (2xx/3xx = ok), `tcpSocket` (port opens), `exec` (exit 0), `grpc` (standard gRPC health protocol).

```yaml
startupProbe:                 # allows up to 30 × 10 = 300 s to boot
  httpGet: { path: /healthz, port: http }
  periodSeconds: 10
  failureThreshold: 30
livenessProbe:
  httpGet: { path: /healthz, port: http }
  periodSeconds: 10
  timeoutSeconds: 2           # default 1 — too tight for busy apps
  failureThreshold: 3         # 3 consecutive failures → restart
readinessProbe:
  httpGet: { path: /ready, port: http }
  periodSeconds: 5
  successThreshold: 1         # (must be 1 for liveness/startup)
  failureThreshold: 3
```
Defaults: `initialDelaySeconds 0, periodSeconds 10, timeoutSeconds 1, successThreshold 1, failureThreshold 3`.

**Design rules**
- Liveness must check **only the process itself** — never dependencies (DB down ⇒ every replica restarts ⇒ outage amplified). Readiness *may* check dependencies, carefully (a shared dependency failing will remove all pods → total 503).
- Prefer `startupProbe` over big `initialDelaySeconds`.
- Probes run by the kubelet **on the node** against the pod IP — NetworkPolicies don't block them; but a 5-s GC pause with `timeoutSeconds: 1` will.
- No readinessProbe = ready as soon as the container starts → traffic during boot → errors on every rollout.

---

## 4. Graceful termination (why deploys drop requests)

When a pod is deleted (rollout, scale-down, drain, `kubectl delete`):

```
t=0   pod marked Terminating; deletionTimestamp set
        ├─ (A) EndpointSlice controller removes pod from endpoints  ─┐ happen IN PARALLEL
        └─ (B) kubelet runs preStop hook, then sends SIGTERM        ─┘
t=…   app should finish in-flight requests and exit
t=terminationGracePeriodSeconds (default 30)  →  SIGKILL
```
The race: (A) propagates to kube-proxy/ingress controllers/cloud LBs **after** (B) already started. Traffic can still arrive at a pod that is shutting down.

**Fix:**
```yaml
terminationGracePeriodSeconds: 45
containers:
  - lifecycle:
      preStop:
        exec: { command: ["sleep", "10"] }   # keep serving while endpoint removal propagates
```
and the app must **handle SIGTERM**: stop accepting new connections, drain, exit. Gotchas:
- If `command: ["sh","-c","app"]`, the shell is PID 1 and may not forward SIGTERM → use `exec app` or a direct entrypoint (or `tini`).
- `preStop` time counts against the grace period.
- Pair with PodDisruptionBudget so drains don't remove too many pods at once.
- With rolling updates: `maxUnavailable: 0` + readiness probe + preStop sleep = no dropped requests.

---

## 5. Resources, QoS and what happens at the limit

```yaml
resources:
  requests: { cpu: 250m, memory: 256Mi }   # scheduler reserves this; also CPU weight under contention
  limits:   { cpu: 1,     memory: 512Mi }
```
- **CPU** is *compressible*: over the limit ⇒ throttled via CFS quota (latency spikes, no kill). `1` = 1 core = `1000m`.
- **Memory** is *incompressible*: over the limit ⇒ **OOMKill** (exit 137). Units: `Mi`/`Gi` (binary) vs `M`/`G` (decimal) — `512M` ≠ `512Mi`.
- **Requests drive scheduling**; the sum of requests on a node ≤ node *allocatable* (capacity − system/kube reserved − eviction threshold).
- **QoS** (computed, not set): `Guaranteed` (every container requests == limits, both cpu & memory) / `Burstable` / `BestEffort`. Eviction order under node pressure: BestEffort → Burstable exceeding requests → Guaranteed.
- JVM/Go/Node: make the runtime *aware* of the limit (`-XX:MaxRAMPercentage`, `GOMEMLIMIT`, `--max-old-space-size`) or the container gets OOMKilled before GC reacts.
- **LimitRange** sets per-namespace defaults/min/max for containers; **ResourceQuota** caps namespace totals (cpu, memory, pods, PVCs, services of type LoadBalancer…). Pods without requests are *rejected* if a quota on cpu/memory exists and no LimitRange default fills them.
- HPA percentages are relative to **requests** — no requests ⇒ HPA can't compute CPU utilisation.
- In-place pod resize (resize subresource) is GA in recent versions: change requests/limits without restart for supported fields.

---

## 6. restartPolicy & Jobs
| Workload | Policy | Behaviour |
|---|---|---|
| Deployment/StatefulSet/DaemonSet | `Always` | restart on any exit (backoff up to 5 min) |
| Job | `OnFailure` or `Never` | `Never` = new Pod per retry; `OnFailure` = restart in place; `backoffLimit` bounds retries |
Restarts are by the **kubelet on the same node**; if the *pod* is deleted, a controller creates a *new* pod (new name, new IP).

---

## 7. Debug toolbox
```bash
kubectl describe pod p                       # Events at bottom = first stop
kubectl logs p -c app --previous             # logs of the crashed instance
kubectl get pod p -o jsonpath='{.status.containerStatuses[*].lastState}'
kubectl exec -it p -- sh
kubectl debug -it p --image=busybox --target=app     # ephemeral container for distroless images
kubectl debug node/n1 -it --image=ubuntu             # node-level shell
kubectl top pod --containers                          # needs metrics-server
kubectl get events --sort-by=.lastTimestamp -A
```
