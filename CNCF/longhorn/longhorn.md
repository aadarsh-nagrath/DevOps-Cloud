# Longhorn — Complete Notes

## 1. Beginner

### What is Longhorn?
- **Longhorn** is a **CNCF graduated** (2024) cloud-native **distributed block storage** system for Kubernetes, originally built by Rancher (now part of SUSE).
- Positioning: it exists specifically for teams that need reliable, replicated `PersistentVolume`s without taking on the full operational weight of Ceph/Rook. It does one thing — block storage — and keeps the mental model small.
- Ships as a set of Kubernetes-native controllers/CRDs plus a web UI, installed via Helm/YAML/kubectl plugin/Rancher's app catalog.

### The Core Problem It Solves
Default Kubernetes local storage (`hostPath`, local `PersistentVolume`s) ties data to a single node — if that node dies, the data is gone or at minimum the pod can never reschedule anywhere else and reattach it:
```
Without Longhorn:
  Pod -> hostPath volume on Node A
  Node A dies -> data is gone, or pod is stuck unable to reschedule

With Longhorn:
  Pod -> Longhorn volume, synchronously replicated across Node A, B, C
  Node A dies -> Longhorn fails over to a replica on Node B automatically,
                 pod reschedules and reattaches with no data loss
```
It gives you the durability property of a SAN/distributed storage array, using each node's local disks, without deploying a separate external storage cluster.

### Core Architecture
```
                     +---------------------------+
                     |   Longhorn Manager           |  <- DaemonSet, one per node
                     |   (watches Volume CRDs,       |
                     |    orchestrates engine/       |
                     |    replica processes)         |
                     +---------------------------+
                        |         |          |
                  Node A|   Node B|    Node C|
                        v         v          v
              +-----------------------------------+
              |   Longhorn Engine (per volume)       |
              |   - a lightweight controller process  |
              |     attached to the consuming pod's   |
              |     node, presents the block device    |
              +-----------------------------------+
                        |
          synchronous replication to:
                        |
        +---------------+---------------+
        v               v               v
  +----------+    +----------+    +----------+
  | Replica    |    | Replica    |    | Replica    |
  | (sparse     |    | (sparse     |    | (sparse     |
  |  file on     |    |  file on     |    |  file on     |
  |  Node A disk)|    |  Node B disk)|    |  Node C disk)|
  +----------+    +----------+    +----------+
                        |
                        v
              +-----------------------+
              |   Longhorn CSI Driver  |
              +-----------------------+
                        |
                        v
        StorageClass -> PersistentVolumeClaim -> Pod
```

### Core Concepts

| Term | Meaning |
|---|---|
| **Longhorn Manager** | DaemonSet running on every node — the control plane, reconciles Volume/Engine/Replica CRDs |
| **Longhorn Engine** | A per-volume controller process, runs on the node where the volume is currently attached, presents the block device to the pod and coordinates writes to all replicas |
| **Replica** | One copy of a volume's data, stored as a sparse file on a node's disk — a volume typically has 3 replicas spread across different nodes |
| **Synchronous replication** | Every write is acknowledged by the engine only after it's committed to (a quorum of) replicas — durability by design, not eventual consistency |
| **Longhorn UI** | Web dashboard for volume management, snapshots, backups, node/disk status |
| **Instance Manager** | Node-level pod that hosts the actual Engine and Replica processes for that node |
| **Backup** | An out-of-cluster copy of a volume (or snapshot) pushed to S3/NFS — disaster recovery, not just node-failure tolerance |

### Basic Usage Example
```yaml
# StorageClass — Longhorn's default, created automatically on install
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: longhorn
provisioner: driver.longhorn.io
allowVolumeExpansion: true
parameters:
  numberOfReplicas: "3"
  staleReplicaTimeout: "2880"
  fromBackup: ""
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-data
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: longhorn
  resources:
    requests:
      storage: 5Gi
```
Apply both, mount the PVC in a pod — Longhorn provisions a 3-way-replicated volume with zero further setup.

---

## 2. Intermediate

### The Write Path
1. App writes to the block device the Engine presents (via iSCSI internally, abstracted away from the pod).
2. Engine fans the write out to all replicas synchronously.
3. Write is acknowledged back to the app only once enough replicas confirm (governed by replica count/quorum settings) — this is what gives Longhorn its durability guarantee, at the cost of write latency versus a single local disk.

### iSCSI Dependency
Longhorn's Engine talks to the kernel using **iSCSI** (`iscsiadm`) to expose the replicated volume as a block device to the node. This means:
- The **host** (the actual node, not just the container) needs `open-iscsi` (Debian/Ubuntu) or `iscsi-initiator-utils` (RHEL/CentOS) installed and the `iscsid` service running.
- This is a real, non-negotiable kernel-level prerequisite — Longhorn ships an `environment-check` script and a preflight `longhorn-environment-check` DaemonSet specifically to catch missing `open-iscsi`/kernel modules before you find out the hard way that volumes won't attach.

### Snapshots and Backups — Two Different Things
| Concept | Where it lives | What it protects against |
|---|---|---|
| **Snapshot** | Local, on the same node disks as the volume's replicas | Point-in-time rollback (e.g. "undo this bad write") — does NOT protect against losing the node/cluster |
| **Backup** | Pushed to an external target — S3-compatible object storage or NFS | Disaster recovery — cluster loss, node loss, accidental volume deletion; survives independently of the cluster |

```yaml
# BackupTarget — configuring where backups go
apiVersion: longhorn.io/v1beta2
kind: BackupTarget
metadata:
  name: default
  namespace: longhorn-system
spec:
  backupTargetURL: s3://my-longhorn-backups@us-east-1/
  credentialSecret: aws-s3-secret
```
Once configured, snapshots can be pushed as backups (via UI, `kubectl` CRD, or a `RecurringJob` schedule) — restoring creates a brand-new volume from the backup, usable even on a completely different cluster pointed at the same backup target.

### Recurring Jobs (Automated Snapshot/Backup Schedules)
```yaml
apiVersion: longhorn.io/v1beta2
kind: RecurringJob
metadata:
  name: daily-backup
  namespace: longhorn-system
spec:
  cron: "0 2 * * *"
  task: "backup"
  groups: ["default"]
  retain: 7
  concurrency: 2
```
Attach a volume to a group via label, and it inherits any `RecurringJob` targeting that group — the standard way to run "nightly backup, keep 7" across a whole fleet of volumes without configuring each one individually.

### Volume Expansion
```bash
kubectl patch pvc my-app-data -p '{"spec":{"resources":{"requests":{"storage":"20Gi"}}}}'
```
`allowVolumeExpansion: true` on the StorageClass (shown above) is what makes this work — Longhorn resizes the underlying replicas and the filesystem online where the volume/filesystem supports it.

---

## 3. Advanced

### Longhorn vs. Rook/Ceph — Choosing Between Them

| Dimension | Longhorn | Rook/Ceph |
|---|---|---|
| **Storage types** | Block only | Block + Object (S3) + File (CephFS) |
| **Operational complexity** | Low — one DaemonSet-based system, one mental model | Higher — MON/MGR/OSD/MDS/RGW daemons, CRUSH tuning, more moving parts |
| **Resource footprint** | Lighter — suits smaller clusters/edge | Heavier — Ceph wants meaningful CPU/RAM per OSD |
| **Replication model** | Simple synchronous replica-per-node | CRUSH-based placement, replication or erasure coding, failure-domain-aware at rack/zone/region granularity |
| **Maturity at extreme scale** | Good for small-to-mid clusters | Proven at very large scale (Ceph predates Kubernetes by over a decade) |
| **Best fit** | Teams that just need durable RWO volumes, want minimal ops burden | Teams that need object/file storage too, or already run Ceph expertise, or need finer-grained failure-domain control |
| **UI** | Built-in Longhorn UI, focused and simple | Ceph Dashboard (via MGR module), more Ceph-native/complex |
| **CNCF status** | Graduated | Graduated |

Neither is strictly "better" — Longhorn trades capability breadth for operational simplicity; Rook/Ceph trades operational simplicity for capability breadth and battle-tested scale. Many teams that only need block storage deliberately choose Longhorn specifically to avoid Ceph's complexity when they don't need object/file storage.

### High Availability and Failover
- Volumes are attached to whichever node the consuming pod is scheduled to; the Engine runs there, replicas are spread elsewhere.
- If the node running the Engine (i.e., the attached node) fails, Longhorn Manager detects it, the pod reschedules (standard Kubernetes behavior via the StatefulSet/Deployment controller), and Longhorn reattaches the volume using a healthy replica on the new node — a fresh Engine starts there.
- **Cordoning a node for maintenance**: `kubectl cordon <node>` prevents new pods scheduling there; Longhorn separately supports **node eviction** (via the UI or `Node.spec.evictionRequested`) to proactively move replicas off a node before you drain it, avoiding a window where a replica count drops below your durability target during planned maintenance.

### Data Locality
- `dataLocality: disabled | best-effort | strict-local` (a StorageClass/Volume parameter) controls whether Longhorn tries to keep a replica on the same node as the attached Engine — improves read latency (no network hop) at the cost of failover behavior (`strict-local` means no replication at all, effectively opting out of the durability guarantee for latency).

### Disk and Node Management
- Longhorn discovers and uses disks you explicitly add via the UI/CRD (`Node.spec.disks`) — not "every raw block device," unlike Rook's `useAllDevices` default. You choose a path (can be a dedicated disk mount or just a directory on the root filesystem, though a dedicated disk is strongly recommended for production).
- **Replica scheduling** respects `numberOfReplicas`, node/disk tags, and zone-awareness (`node.longhorn.io/zone` labels) so replicas of the same volume can be forced onto different failure domains, similar in spirit to Ceph's `failureDomain`.

### Security
- Volumes support encryption at rest via LUKS, configured through a `StorageClass` parameter (`encrypted: "true"`) pointing at a Kubernetes Secret holding the passphrase/key.
- Longhorn UI/API access should sit behind an authenticating ingress or `kubectl port-forward` only — it has no built-in user auth by default, a common early misconfiguration in real deployments (exposing the UI publicly with no auth in front of it).

### Performance Tuning
- Replica count is the main durability/performance/cost lever: `numberOfReplicas: 3` is the sane default; dropping to `1` removes replication entirely (fine for scratch/cache-tier data, not for anything you care about); raising it increases write latency (must fan out to more replicas) and storage cost.
- Dedicated disks (not sharing the OS root disk) avoid I/O contention between node system load and volume I/O — a common production recommendation.
- `guaranteedInstanceManagerCPU` setting reserves CPU for Longhorn's own Engine/Replica processes so they aren't starved under node CPU pressure, which otherwise shows up as latency spikes.

### Common Failure Modes / Debugging
| Symptom | Likely cause |
|---|---|
| Volume stuck `Attaching` | Missing `open-iscsi`/`iscsid` on the node — check the `longhorn-environment-check` DaemonSet output |
| Volume `Degraded` | One or more replicas unhealthy/rebuilding (e.g. after a node reboot) — check `kubectl -n longhorn-system get volumes.longhorn.io` and the UI's replica view |
| Backup fails | `BackupTarget` credentials wrong, or S3 endpoint unreachable from the cluster — check `longhorn-manager` logs |
| Slow writes | Replica count too high for the workload's latency needs, or replicas sharing a disk with heavy unrelated I/O |
| Pod stuck waiting for volume after node loss | Old Engine/replica on the dead node not yet marked down — Longhorn's node monitor has a timeout before it reassigns; verify via `kubectl -n longhorn-system get nodes.longhorn.io` |

### Integration with the Wider Ecosystem
- **Rancher**: Longhorn is Rancher/SUSE's default recommended block storage for Rancher-managed clusters, tightly integrated into the Rancher UI.
- **Velero**: works alongside Longhorn's native snapshot/backup CRDs for broader cluster-level backup strategies (app manifests + PV data together).
- **Prometheus**: `longhorn-manager` exposes metrics natively; a `ServiceMonitor` plugs it into an existing Prometheus stack for volume health/latency/capacity dashboards.

---

## Quick Revision — Longhorn
- Longhorn = simple, CNCF-graduated **distributed block storage** for Kubernetes — block only, not object/file (that's Rook/Ceph's territory).
- Architecture: Longhorn Manager (DaemonSet, control plane) + per-volume Engine (on the attached node) + Replicas (sparse files on other nodes' disks), synchronously replicated.
- Requires `open-iscsi`/`iscsid` on the **host** node — a real kernel-level prerequisite, not optional; Longhorn ships a preflight check DaemonSet for this.
- Snapshot = local, fast, point-in-time — does not survive cluster/node loss. Backup = pushed to S3/NFS — true disaster recovery.
- `RecurringJob` CRD automates snapshot/backup schedules across labeled volume groups.
- vs. Rook/Ceph: Longhorn trades capability breadth (no object/file storage) for much lower operational complexity — the right choice when you only need reliable block PVs.
- `numberOfReplicas` is the central durability/performance/cost knob.
- Node eviction (not just cordon) is the correct way to safely drain a node without dropping below your replication target.
- Longhorn UI has no built-in auth — put it behind an authenticating ingress, never expose it raw.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
