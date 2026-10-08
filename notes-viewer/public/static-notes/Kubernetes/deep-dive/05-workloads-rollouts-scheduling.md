# Workload Controllers, Rollouts & Scheduling — In Depth

> Extends [k8s-learning-path §3, §10, §13, §16, §26, §33](../k8s-learning-path.md).

---

## 1. Which controller for what

| Controller | Pods are… | Use for |
|---|---|---|
| **Deployment** (→ ReplicaSet → Pods) | interchangeable, random names | stateless apps/APIs |
| **StatefulSet** | numbered, stable name + DNS + disk | databases, Kafka, ZooKeeper |
| **DaemonSet** | exactly one per (matching) node | log/metrics agents, CNI, kube-proxy |
| **Job** | run to completion | batch, migrations |
| **CronJob** | creates Jobs on a schedule | backups, reports |
| **ReplicaSet** | — | don't create directly; Deployment manages it |

The chain: `Deployment → ReplicaSet (one per revision, name = deploy-<hash of pod template>) → Pods`. Changing the **pod template** creates a new ReplicaSet (a rollout); changing `replicas` does not.

---

## 2. Deployment rollouts

```bash
kubectl set image deploy/api app=ghcr.io/acme/api:1.5.0
kubectl rollout status deploy/api            # blocks until done / fails
kubectl rollout history deploy/api --revision=3
kubectl rollout undo deploy/api [--to-revision=2]
kubectl rollout pause|resume deploy/api      # batch several edits into one rollout
kubectl rollout restart deploy/api           # rolling restart (adds restartedAt annotation to template)
kubectl scale deploy/api --replicas=5
```
**RollingUpdate maths** (replicas = 10, `maxSurge: 25%`, `maxUnavailable: 25%`): surge rounds **up** → 3 extra pods allowed; unavailable rounds **down** → 2 may be down. So between 8 and 13 pods exist during the roll.
- Zero-downtime recipe: `maxUnavailable: 0`, `maxSurge: 1+`, a real **readinessProbe**, `minReadySeconds`, preStop sleep (see [03](03-pod-lifecycle-probes-resources.md)), PDB.
- `Recreate`: terminate all, then create — for apps that can't run two versions (schema locks, singletons).
- Stuck rollout: `progressDeadlineSeconds` expires ⇒ condition `Progressing=False, reason ProgressDeadlineExceeded`. Kubernetes does **not** auto-rollback; use Argo Rollouts / Flagger for automated canary/blue-green analysis.
- `revisionHistoryLimit` bounds the number of old ReplicaSets (rollback targets).
- Selector is immutable; label changes on pods that stop matching make them orphans.

### Blue-green & canary with plain objects
- **Blue/green**: two Deployments (`app-blue`, `app-green`), Service selector `version: green`; flip the selector (instant cutover/rollback).
- **Canary**: two Deployments with the same `app` label behind one Service (traffic ∝ replica count), or weighted routing via ingress-nginx canary annotations / Gateway API `weight` / mesh.

---

## 3. StatefulSet specifics
- Pod names `name-0..n-1`; created **in order** (each must be Ready before next, unless `podManagementPolicy: Parallel`), deleted in reverse.
- Needs a **headless Service** (`serviceName`) for per-pod DNS: `db-0.db.ns.svc.cluster.local`.
- `volumeClaimTemplates` ⇒ per-replica PVC (see [04 §5](04-storage-config-secrets.md)).
- `updateStrategy`: `RollingUpdate` (reverse ordinal, `partition: N` updates only ordinals ≥ N → canary) or `OnDelete` (manual).
- Not a database operator: replication, failover, backups are *your* job → use an Operator (CloudNativePG, Strimzi, …).

## 4. DaemonSet specifics
- One pod per node; new node ⇒ pod appears automatically. Restrict with `nodeSelector`/affinity.
- Tolerates nothing by default → add tolerations for control-plane/tainted nodes (`operator: Exists`).
- `updateStrategy.rollingUpdate.maxUnavailable` (default 1).
- Often uses `hostNetwork`, `hostPath`, `priorityClassName: system-node-critical`.

## 5. Job & CronJob fields
```yaml
kind: Job
spec:
  completions: 5          # total successful pods needed
  parallelism: 2          # run at once
  backoffLimit: 4         # retries before marking Failed (exponential backoff)
  activeDeadlineSeconds: 600
  ttlSecondsAfterFinished: 3600   # auto-delete finished Job+pods
  completionMode: Indexed         # each pod gets JOB_COMPLETION_INDEX
  template: { spec: { restartPolicy: Never, containers: [...] } }
---
kind: CronJob
spec:
  schedule: "0 2 * * *"           # min hour dom mon dow ; use timeZone: "Asia/Kolkata" (GA 1.27)
  concurrencyPolicy: Forbid       # Allow | Forbid | Replace
  startingDeadlineSeconds: 300    # miss window → skip (if >100 missed, CronJob stops)
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  suspend: false
  jobTemplate: { spec: { ... } }
```
Make Jobs **idempotent** — at-least-once semantics (a CronJob can occasionally run twice).

---

## 6. Autoscaling (HPA in depth)
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: api }
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }  # % of REQUEST
  behavior:
    scaleDown: { stabilizationWindowSeconds: 300, policies: [{ type: Percent, value: 50, periodSeconds: 60 }] }
```
- Formula: `desired = ceil(current × currentMetric / targetMetric)`; checked every 15 s; 10 % tolerance.
- Needs **metrics-server** (resource metrics); custom/external metrics via Prometheus Adapter or **KEDA** (queue length, Kafka lag, cron, HTTP).
- Don't set `replicas` in the Deployment manifest when HPA manages it (GitOps will fight HPA) — omit the field.
- **VPA** adjusts requests (conflicts with HPA on same metric); **Cluster Autoscaler / Karpenter** add nodes for **Pending** pods — pods must have requests for this to work.

---

## 7. Scheduling — how a pod picks a node
Scheduler: **filter** (predicates) → **score** → bind. Filters: resource fit (requests), nodeSelector/affinity, taints, volume zone, ports, topology spread.

| Mechanism | Direction | Notes |
|---|---|---|
| `nodeName` | pin | bypasses scheduler — avoid |
| `nodeSelector` | pod → node labels | exact match, simplest |
| **Node affinity** | pod → node labels | `requiredDuringSchedulingIgnoredDuringExecution` (hard) / `preferred…` (soft, with weights); operators `In, NotIn, Exists, Gt, Lt` |
| **Pod affinity / anti-affinity** | pod → other pods | needs `topologyKey` (`kubernetes.io/hostname`, `topology.kubernetes.io/zone`); anti-affinity = spread replicas |
| **Taints / tolerations** | node → pod | node *repels*; effects `NoSchedule`, `PreferNoSchedule`, `NoExecute` (evicts running pods; `tolerationSeconds`) |
| **topologySpreadConstraints** | even distribution | `maxSkew`, `topologyKey`, `whenUnsatisfiable: DoNotSchedule|ScheduleAnyway`, `labelSelector` — preferred over anti-affinity for "spread evenly" |
| **PriorityClass** | ordering/preemption | `preemptionPolicy: Never` for non-evicting |

Taints vs affinity: taints say "keep **out** unless tolerated" (dedicated nodes); affinity says "I **want** to be there". Dedicated GPU pool = taint **and** nodeSelector/affinity (toleration alone doesn't attract).

Built-in taints: `node.kubernetes.io/not-ready`, `unreachable` (pods get a default 300 s toleration), `unschedulable` (cordon), `disk-pressure`, `memory-pressure`.

---

## 8. Voluntary disruptions: drain, PDB
```bash
kubectl cordon n1              # unschedulable, existing pods stay
kubectl drain n1 --ignore-daemonsets --delete-emptydir-data   # evict pods respecting PDBs
kubectl uncordon n1
```
```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
spec:
  minAvailable: 2          # or maxUnavailable: 1  (use one of them)
  selector: { matchLabels: { app: api } }
```
PDB only guards **voluntary** evictions (drain, autoscaler, upgrades) — not crashes or node failure. A PDB with `minAvailable` = replicas blocks drains forever.

---

## 9. Namespaces, quotas, multi-tenancy quick facts
- Namespaces scope names, RBAC, quotas, NetworkPolicies, secrets — **not** network or node isolation by default.
- Cluster-scoped (no namespace): Node, PV, StorageClass, Namespace, ClusterRole, CRD, IngressClass.
- Deleting a namespace deletes everything inside; stuck `Terminating` ⇒ leftover finalizers/CRs.
