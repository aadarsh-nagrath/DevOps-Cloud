# Advanced Workloads & Multi-tenancy: StatefulSets, Jobs, Native Sidecars, Quotas, GPUs/DRA, Windows, Multi-cluster, Backup & Cost

> Part of the [Kubernetes deep dives](./README.md). Previous: [Observability & Troubleshooting](./13-observability-and-troubleshooting.md).
>
> The StatefulSet, Job, sidecar and quota results are real, from a v1.37 cluster. Workload basics are in [05-workloads-rollouts-scheduling.md](./05-workloads-rollouts-scheduling.md), and storage basics in [04-storage-config-secrets.md](./04-storage-config-secrets.md).

---

## 1. StatefulSets in depth

```yaml
apiVersion: v1
kind: Service
metadata: { name: db }
spec:
  clusterIP: None                 # headless → per-pod DNS records
  selector: { app: db }
  ports: [{ port: 80 }]
---
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: db }
spec:
  serviceName: db                 # MUST point at the headless Service
  replicas: 3
  podManagementPolicy: OrderedReady        # or Parallel (faster, no ordering guarantees)
  selector: { matchLabels: { app: db } }
  persistentVolumeClaimRetentionPolicy:
    whenScaled: Retain                      # or Delete
    whenDeleted: Retain
  updateStrategy:
    type: RollingUpdate
    rollingUpdate: { partition: 0, maxUnavailable: 1 }
  template:
    metadata: { labels: { app: db } }
    spec:
      containers:
        - name: c
          image: nginx:1.27-alpine
          volumeMounts: [{ name: data, mountPath: /data }]
          readinessProbe: { httpGet: { path: /, port: 80 } }
  volumeClaimTemplates:
    - metadata: { name: data }
      spec: { accessModes: [ReadWriteOnce], resources: { requests: { storage: 64Mi } } }
```

### The guarantees, demonstrated
```text
# Ordered creation: each pod waits for the previous to be Ready
db-0   2026-10-18T21:15:49Z
db-1   2026-10-18T21:15:51Z
db-2   2026-10-18T21:15:52Z

# One PVC per ordinal: <template>-<sts>-<ordinal>
data-db-0 Bound    data-db-1 Bound    data-db-2 Bound

# Stable DNS per pod (via headless service)
$ nslookup db-1.db.adv.svc.cluster.local     → 10.244.0.28
$ wget -qO- db-2.db                          → I am db-2

# Delete a pod: same NAME, same PVC, same DATA — new IP
ip 10.244.0.28 -> 10.244.0.29
$ kubectl exec db-1 -- cat /data/id          → I am db-1

# Scale 3 → 1: highest ordinals removed first; PVCs RETAINED (whenScaled: Retain)
pods: db-0          pvcs: data-db-0 data-db-1 data-db-2 (all Bound)
# Scale back to 3 → db-1/db-2 re-attach their old PVCs and old data
```
**Peers must use DNS names, never Pod IPs**, because the IP changed on restart while the name didn't.

### Partitioned rollouts: canary for stateful apps
```text
$ kubectl patch sts db -p '{"spec":{"updateStrategy":{"rollingUpdate":{"partition":2}}}}'
$ kubectl set image sts/db c=nginx:1.28-alpine
db-0   nginx:1.27-alpine
db-1   nginx:1.27-alpine
db-2   nginx:1.28-alpine          ← only ordinals ≥ partition updated
current=db-b4fcc78cc update=db-8467945cc6 updated=1
```
Lower `partition` step by step (2 → 1 → 0) to promote. Updates go in **reverse ordinal order**, one at a time (or `maxUnavailable` at a time).

### StatefulSet gotchas
- **A rollout stuck on a broken Pod:** with `OrderedReady`, if the new revision's Pod never becomes Ready, the rollout stops, and reverting the template **doesn't** replace the stuck Pod automatically. Delete that Pod after reverting.
- **`volumeClaimTemplates` are effectively immutable.** To resize, expand each PVC directly (StorageClass `allowVolumeExpansion: true`), then recreate the StatefulSet with `--cascade=orphan` and the new template size.
- **Node failure:** Pods aren't rescheduled until the old Pod is confirmed gone ([page 13 §7](./13-observability-and-troubleshooting.md#7-when-a-node-fails-real-timeline)). That's at-most-one semantics by design.
- **PVCs outlive the StatefulSet** with `Retain`, so remember to clean them up (and pay attention to the PV `reclaimPolicy`).
- **Zonal disks:** an EBS/PD volume pins its Pod to one AZ forever. Use `WaitForFirstConsumer` StorageClasses and spread replicas over zones from day one.
- **StatefulSet ≠ database operator.** It gives you identity and storage, not failover, backups or replication. For real databases use an operator (CloudNativePG, Percona, Strimzi, Vitess) or a managed DB.
- `.spec.ordinals.start` lets ordinals start at N, which helps migrate a StatefulSet between clusters or namespaces in slices.

---

## 2. DaemonSets

One Pod per (matching) node: log shippers, CNI, CSI node plugins, node-exporter, security agents.
```yaml
spec:
  updateStrategy:
    type: RollingUpdate
    rollingUpdate: { maxUnavailable: 10%, maxSurge: 0 }   # maxSurge>0 = start new before killing old (zero-gap agents)
  template:
    spec:
      priorityClassName: system-node-critical             # don't get evicted before the apps
      tolerations: [{ operator: Exists }]                  # run on every node, including tainted ones
      nodeSelector: { kubernetes.io/os: linux }
```
DaemonSet Pods are scheduled by the default scheduler (with node affinity pinning them to each node). `kubectl drain --ignore-daemonsets` leaves them running, because they'd be recreated immediately anyway.

---

## 3. Jobs and CronJobs

### Indexed Jobs (sharded parallel work)
```yaml
apiVersion: batch/v1
kind: Job
metadata: { name: indexed }
spec:
  completionMode: Indexed       # each pod gets JOB_COMPLETION_INDEX 0..completions-1
  completions: 4
  parallelism: 2
  ttlSecondsAfterFinished: 600  # auto-delete the Job (and pods) 10m after it finishes
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: c
          image: busybox:1.36
          command: ["sh", "-c", "echo processing shard $JOB_COMPLETION_INDEX of 4; sleep 2"]
```
```text
indexed   Complete   4/4   10s
processing shard 0 of 4
processing shard 1 of 4
processing shard 2 of 4
processing shard 3 of 4
```
Indexed Pods also get stable hostnames (`indexed-0`, ...) with a headless Service, which suits MPI and PyTorch distributed jobs.

### Pod failure policy: don't retry what will never succeed
```yaml
spec:
  backoffLimit: 6
  podFailurePolicy:
    rules:
      - action: FailJob                          # config error → stop immediately
        onExitCodes: { containerName: c, operator: In, values: [42] }
      - action: Ignore                           # node drained/preempted → don't count against backoffLimit
        onPodConditions: [{ type: DisruptionTarget }]
      - action: Count                            # everything else → normal retry
        onExitCodes: { operator: NotIn, values: [0] }
```
```text
failpolicy   Failed   0/1
PodFailurePolicy: Container c for pod adv/failpolicy-fgdks failed with exit code 42 matching FailJob rule at index 0   failedPods=1
```
Without the policy, the Job would have retried 6 times with exponential backoff (10 s, 20 s, 40 s ...) for a failure that can't recover.

### Other Job knobs
| Field | Purpose |
|---|---|
| `backoffLimit` / `backoffLimitPerIndex` + `maxFailedIndexes` | Retries for the whole Job or per index |
| `activeDeadlineSeconds` | Hard wall-clock limit for the whole Job |
| `successPolicy` | Succeed early when certain indexes succeed (leader-worker patterns) |
| `suspend: true` | Create a Job paused (Kueue uses this to queue Jobs) |
| `podReplacementPolicy: Failed` | Don't start a replacement until the old Pod has fully terminated (no double-running) |
| `restartPolicy: OnFailure` vs `Never` | Restart the container in place, or create a new Pod (easier to debug, and logs are kept) |

### CronJobs
```yaml
apiVersion: batch/v1
kind: CronJob
metadata: { name: nightly-report }
spec:
  schedule: "30 2 * * *"
  timeZone: "Europe/London"          # without it, the controller-manager's time zone (usually UTC)
  concurrencyPolicy: Forbid          # Allow | Forbid | Replace
  startingDeadlineSeconds: 300       # if missed by more than this, skip
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 5
  suspend: false
  jobTemplate:
    spec:
      backoffLimit: 2
      activeDeadlineSeconds: 3600
      template:
        spec:
          restartPolicy: OnFailure
          containers: [{ name: report, image: acme/report:1.4.2 }]
```
Gotchas: CronJobs are **at-least-once** (rarely, a run can happen twice or be skipped), so make Jobs idempotent. If more than 100 schedules were missed (for example while the controller was down), the CronJob stops scheduling and logs an error. Trigger one manually with `kubectl create job --from=cronjob/nightly-report manual-1`.

---

## 4. Native sidecars (`initContainers` with `restartPolicy: Always`)

Before native sidecars, a log-shipper or proxy sidecar in a **Job** never exited, so the Job never completed. Sidecars also started *after* the app (a race), and on shutdown they could die *before* the app.

```yaml
spec:
  restartPolicy: Never
  initContainers:
    - name: log-shipper
      image: busybox:1.36
      restartPolicy: Always            # ← this makes it a sidecar
      command: ["sh", "-c", "echo sidecar up; while true; do sleep 1; done"]
      # startupProbe here gates the main containers until the sidecar is ready
  containers:
    - name: main
      image: busybox:1.36
      command: ["sh", "-c", "echo main working; sleep 5; echo main done"]
```
What a native sidecar does:
- It **starts before** the main containers, in order (main containers wait for its `startupProbe`).
- It **keeps running** and is restarted if it crashes, even in a Job.
- It **doesn't block completion**: once main containers finish, sidecars are terminated **after** them, in reverse order.

Real run:
```text
sidecar-job   Complete   1/1   39s            ← main only needed ~5s!
phase=Succeeded  main=Completed
sidecar={"terminated":{"exitCode":137,"reason":"Error", ...}}   ← SIGKILLed
```
**The lesson: the sidecar's shell loop ignored SIGTERM**, so the kubelet waited the full `terminationGracePeriodSeconds` (30 s) and then SIGKILLed it (exit 137). That added ~30 s to every Job and marked the sidecar `Error`. **Sidecars must exit promptly on SIGTERM** (`trap 'exit 0' TERM` in shell, or proper signal handling in the binary). Mesh proxies such as Envoy (Istio) and Linkerd support native sidecar mode.

---

## 5. Downward API: Pod metadata inside the container

```yaml
env:
  - name: POD_NAME
    valueFrom: { fieldRef: { fieldPath: metadata.name } }
  - name: POD_IP
    valueFrom: { fieldRef: { fieldPath: status.podIP } }
  - name: NODE_NAME
    valueFrom: { fieldRef: { fieldPath: spec.nodeName } }
  - name: MEM_LIMIT
    valueFrom: { resourceFieldRef: { containerName: app, resource: limits.memory, divisor: 1Mi } }
volumes:
  - name: podinfo
    downwardAPI:
      items:
        - { path: labels, fieldRef: { fieldPath: metadata.labels } }   # file updates when labels change; env vars never do
```
Typical uses: OTel resource attributes (pod, node), JVM heap sizing from the limit, and leader-election identity.

---

## 6. Multi-tenancy

### Isolation spectrum
| Model | Isolation | Cost | Tools |
|---|---|---|---|
| **Namespaces per team/app** (soft) | RBAC, quotas, NetworkPolicy, PSA. Shared control plane and nodes | Lowest | Built in, Capsule, Hierarchical Namespaces, Kyverno generate |
| **Virtual clusters** | Each tenant gets its own API server and CRDs, with workloads on shared nodes | Medium | **vCluster**, Kamaji |
| **Dedicated node pools** per tenant | Taints/affinity, so there's no noisy neighbour on CPU or kernel | Medium | Karpenter NodePools, node groups |
| **Cluster per tenant** (hard) | Full | Highest | Cluster API, managed K8s, fleet tooling |

### Namespace tenant baseline (each item enforced by something)
- RBAC: a team role bound in its namespaces only ([page 12 §3](./12-security-hardening.md#3-rbac-the-escalation-paths-people-miss))
- PSA `restricted` ([page 12 §1](./12-security-hardening.md#1-pod-security-admission-psa))
- NetworkPolicy default-deny plus explicit allows ([networking §12](../kubernetes-networking-deep-dive.md#12-networkpolicy-in-depth))
- **ResourceQuota + LimitRange** (below)
- Policy: allowed registries, required labels, no LoadBalancer/NodePort without approval
- Cost allocation by namespace and labels (OpenCost/Kubecost)

### ResourceQuota and LimitRange (real enforcement)
```yaml
apiVersion: v1
kind: ResourceQuota
metadata: { name: team-quota, namespace: adv }
spec:
  hard:
    requests.cpu: "1"
    requests.memory: 1Gi
    limits.memory: 2Gi
    pods: "10"
    persistentvolumeclaims: "5"
    services.loadbalancers: "0"        # tenants can't create cloud LBs
    # count/deployments.apps: "20"    # object counts for any resource
    # requests.storage, <storageclass>.storageclass.storage.k8s.io/requests.storage
---
apiVersion: v1
kind: LimitRange
metadata: { name: defaults, namespace: adv }
spec:
  limits:
    - type: Container
      default:        { memory: 256Mi }               # limit if none set
      defaultRequest: { cpu: 100m, memory: 128Mi }    # request if none set
      max:            { memory: 1Gi }
```
```text
# pod with no resources → LimitRange defaults injected at admission
defaults applied: {"limits":{"memory":"256Mi"},"requests":{"cpu":"100m","memory":"128Mi"}}

# limit above LimitRange max
pods "q2" is forbidden: maximum memory usage per Container is 1Gi, but limit is 2Gi

# request exceeding remaining quota
pods "q3" is forbidden: exceeded quota: team-quota, requested: requests.cpu=2, used: requests.cpu=100m, limited: requests.cpu=1

# object-count quota
services "lb" is forbidden: exceeded quota: team-quota, requested: services.loadbalancers=1, used: ..=0, limited: ..=0

$ kubectl describe quota team-quota
Resource                Used   Hard
limits.memory           256Mi  2Gi
persistentvolumeclaims  3      5
pods                    4      10       ← counts non-terminal pods only
requests.cpu            100m   1
requests.memory         128Mi  1Gi
services.loadbalancers  0      0
```
Gotchas:
- **Once a quota covers `requests.cpu`, every Pod must specify it.** Without a LimitRange default, creates fail with `must specify requests.cpu`. Always pair a quota with a LimitRange.
- Quota is checked at **admission**. A Deployment that can't create Pods shows `FailedCreate` on its **ReplicaSet** (`kubectl describe rs`), not on the Deployment, which is a common "why isn't it scaling?" moment.
- Use `scopeSelector` on `PriorityClass` so that "critical" capacity is capped per team.

---

## 7. GPUs, device plugins and DRA

### Device plugins (classic)
A DaemonSet (e.g. NVIDIA device plugin, via the **NVIDIA GPU Operator**, which also installs drivers, the container toolkit and DCGM metrics) advertises an **extended resource** on each node:
```text
Capacity: nvidia.com/gpu: 8
```
```yaml
resources:
  limits: { nvidia.com/gpu: 1 }        # whole devices only; requests = limits; no overcommit
tolerations: [{ key: nvidia.com/gpu, operator: Exists, effect: NoSchedule }]
nodeSelector: { nvidia.com/gpu.product: NVIDIA-A100-SXM4-80GB }
```
Sharing a GPU: **MIG** (hardware partitions on A100/H100 that appear as `nvidia.com/mig-1g.10gb`), **time-slicing** (the device plugin advertises N replicas per GPU, with no memory isolation), and MPS.

### Dynamic Resource Allocation (DRA): `resource.k8s.io/v1`, served on this 1.37 cluster
```text
$ kubectl api-resources --api-group=resource.k8s.io
deviceclasses  devicetaintrules  resourceclaims  resourceclaimtemplates  resourceslices
```
DRA replaces "count of opaque devices" with **claims on devices with attributes**, filtered with CEL. It's a richer model for GPUs, NICs and FPGAs:
```yaml
apiVersion: resource.k8s.io/v1
kind: ResourceClaimTemplate
metadata: { name: big-gpu }
spec:
  spec:
    devices:
      requests:
        - name: gpu
          exactly:
            deviceClassName: gpu.nvidia.com
            selectors:
              - cel: { expression: "device.capacity['gpu.nvidia.com'].memory.compareTo(quantity('40Gi')) >= 0" }
---
apiVersion: v1
kind: Pod
metadata: { name: trainer }
spec:
  resourceClaims:
    - { name: gpu, resourceClaimTemplateName: big-gpu }
  containers:
    - name: train
      image: acme/train:2.1
      resources:
        claims: [{ name: gpu }]
```
Drivers publish **ResourceSlices** (inventory per node), admins define **DeviceClasses**, and the scheduler's `DynamicResources` plugin allocates matching devices. It needs a DRA driver from the vendor (NVIDIA's DRA driver, or the example driver for testing). AI/ML scheduling in practice also uses Kueue (quotas and queues), gang scheduling, and topology-aware placement (NVLink, NUMA).

---

## 8. Backup and DR with Velero

etcd snapshots restore the *whole* cluster ([page 11 §3](./11-cluster-operations.md#3-etcd-backup-and-restore)). **Velero** backs up and restores **namespaces, label selections and PV data**, even into a *different* cluster:
```bash
velero install --provider aws --plugins velero/velero-plugin-for-aws:v1.x \
  --bucket acme-velero --backup-location-config region=us-east-1 --use-node-agent   # file-level PV backups (Kopia)
velero backup create orders-$(date +%F) --include-namespaces orders --snapshot-volumes --ttl 720h
velero schedule create daily --schedule "0 1 * * *" --include-namespaces orders,payments --ttl 168h
velero restore create --from-backup orders-2026-10-18 --namespace-mappings orders:orders-restored
velero backup describe orders-2026-10-18 --details
```
- PV data comes from **CSI snapshots** (fast, same cloud and region) or the **node agent** (Kopia file copy, portable across clouds).
- Pre/post hooks (`pre.hook.backup.velero.io/command`) quiesce databases (`fsfreeze`, or `pg_start_backup`). For databases, prefer the DB's own backup tooling as well.
- **DR drills:** restore into a scratch namespace or cluster on a schedule and verify that the app works. A backup you haven't restored isn't a backup.
- With GitOps, the *config* is already in Git. Velero then mostly covers **state** (PVs) and things not in Git (Secrets created at runtime, CRs created by operators).

---

## 9. Windows nodes

- The control plane is always Linux. Windows **worker** nodes run Windows containers (Server 2019/2022 base images must match the host OS version, or use Hyper-V isolation).
- Steer Pods by OS: `nodeSelector: { kubernetes.io/os: windows }`, and **taint Windows nodes** (`os=windows:NoSchedule`) so Linux Pods don't land there and fail with `exec format error`.
- Not supported or different: privileged containers (use **HostProcess** containers instead), many `securityContext` fields (`runAsUser`, seccomp, capabilities: use `windowsOptions.runAsUserName`), and `hostNetwork` (limited). Some CNIs and CSIs support Windows (Calico, Azure CNI, AWS VPC CNI on EKS, SMB/CSI proxy).
- Typical use is lifting and shifting .NET Framework apps. Budget for larger images and slower starts.

---

## 10. Multi-cluster

| Need | Approach |
|---|---|
| Same app in many clusters/regions | GitOps fleet: **Argo CD ApplicationSets** (cluster generator), Flux with Kustomize overlays, Rancher Fleet |
| Cross-cluster service discovery and traffic | Multi-cluster Services API (`ServiceExport`/`ServiceImport`), Cilium ClusterMesh, Istio multi-primary, Submariner, Skupper |
| Global ingress / failover | DNS-based (Route 53 latency/failover, external-dns), global LBs (GCP, AWS Global Accelerator), Gateway API multi-cluster gateways (GKE) |
| Cluster lifecycle | **Cluster API** (declarative clusters as CRDs), Crossplane, Terraform ([Terraform notes](../../Terraform%20and%20CF/terraform.md)), managed fleets (GKE Fleet, EKS Anywhere, Azure Fleet) |
| Policy and identity everywhere | Kyverno/Gatekeeper through GitOps, a central OIDC provider, a shared trust domain (SPIFFE/SPIRE) |

Rules: non-overlapping Pod and Service CIDRs if you'll ever connect clusters ([networking §15](../kubernetes-networking-deep-dive.md#15-ip-planning-dual-stack-and-mtu)). Treat clusters as **cattle** (re-creatable from Git). Keep data in managed services or replicate it explicitly, because the cluster is not where data lives safely.

---

## 11. Cost: where Kubernetes money goes

| Waste | Detect | Fix |
|---|---|---|
| Requests far above usage ("slack") | Requests vs usage PromQL ([page 13](./13-observability-and-troubleshooting.md#2-metrics-that-matter-with-promql)), VPA `Off` recommendations, Kubecost/OpenCost | Right-size requests in Git |
| Under-packed nodes | Allocation % per node | Karpenter consolidation, `MostAllocated` scoring, fewer node-group shapes |
| On-demand for interruptible work | Capacity-type mix | Spot for stateless and batch (with PDBs and spread), on-demand floors for critical work |
| Cross-AZ traffic | Cloud bill line items, flow logs | `trafficDistribution: PreferClose`, zone-aware routing |
| Idle dev/test environments | Namespace usage over time | Scale to zero at night (KEDA cron, kube-downscaler), ephemeral PR environments with TTLs |
| Orphaned PVs, LBs, snapshots | Cloud inventory vs cluster | `Retain` policies reviewed, Velero TTLs, tag everything |
| Logs and metrics volume | Ingest by namespace | Drop debug logs, reduce cardinality, set retention tiers |

The FinOps practice is covered in [FinOps & Cost Optimization](../../FinOps%20and%20Cost%20Optimization/).

---

## 12. Workload selection cheat sheet

| Workload | Use |
|---|---|
| Stateless service | Deployment + HPA + PDB + topology spread |
| Clustered stateful app | StatefulSet (or better, an operator) + headless Service + PDB + zonal spread |
| Per-node agent | DaemonSet (system priority, tolerate all) |
| Finite batch | Job (Indexed for shards, `podFailurePolicy`, TTL) |
| Scheduled task | CronJob (`timeZone`, `concurrencyPolicy: Forbid`, idempotent) |
| Helper alongside the app | Native sidecar (`initContainers` + `restartPolicy: Always`) that handles SIGTERM |
| One-shot setup before the app | Init container |
| ML training | Indexed Job / JobSet + Kueue + DRA/device plugin + gang scheduling |

Back to the [Kubernetes deep dives index](./README.md).
