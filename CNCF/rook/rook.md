# Rook — Complete Notes

## 1. Beginner

### What is Rook?
- **Rook** is a **CNCF graduated** storage **orchestrator** for Kubernetes. It graduated in 2020.
- Critical distinction: **Rook does not store your data.** Rook automates the deployment, configuration, scaling, upgrading, and failure recovery of an underlying distributed storage system — primarily **Ceph**. Rook is the operator; Ceph (or another supported backend) is the thing that actually stores bytes.
- Think of Rook the way you'd think of a Kubernetes operator for Postgres or Kafka, but for storage infrastructure itself.

### The Core Problem It Solves
Running Ceph by hand is traditionally a multi-day, specialist task:
```
Without Rook:
  - Manually provision MON/MGR/OSD daemons on specific hosts
  - Hand-manage Ceph's cluster map, CRUSH rules, auth keys
  - Manually handle disk failures: identify, evacuate, replace, rebalance
  - Manually manage upgrades across a live, ordered set of daemons
  - Build your own glue to expose RBD/CephFS/RGW to Kubernetes as PVs

With Rook:
  - kubectl apply a CephCluster CRD
  - Rook operator deploys and wires up MONs/MGRs/OSDs automatically
  - Disk failure -> operator detects, can auto-recover via CRUSH rebalancing
  - Upgrade -> bump image tag on the CR, operator handles daemon ordering
  - CSI driver (deployed by Rook) gives you StorageClass -> PVC -> PV, natively
```
Rook turns "operate a distributed storage system" from a dedicated ops discipline into "manage a few Kubernetes custom resources."

### Core Architecture
```
                     +----------------------+
                     |    Rook Operator      |  (watches CRDs, reconciles)
                     +----------------------+
                         |        |        |
              watches:  |        |        |
        CephCluster ----+   CephBlockPool  CephObjectStore / CephFilesystem
                         |        |        |
                         v        v        v
          +------------------------------------------+
          |              Ceph Cluster                  |
          |  MON (quorum/cluster map) x3 (odd number)   |
          |  MGR (metrics, dashboard, mgr modules)      |
          |  OSD (one per disk — actually stores data)  |
          |  (optional) MDS — for CephFS                |
          |  (optional) RGW — for S3-compatible object  |
          +------------------------------------------+
                         |
                         v
              +-----------------------+
              |   Rook-Ceph CSI Driver |
              +-----------------------+
                         |
                         v
        StorageClass -> PersistentVolumeClaim -> PersistentVolume
                         |
                         v
                    Your application Pod
```

### Core Concepts

| Term | Meaning |
|---|---|
| **Rook Operator** | The controller that watches Rook/Ceph CRDs and reconciles the actual Ceph daemon pods to match |
| **CephCluster** | The top-level CRD defining the Ceph cluster itself — which nodes/disks to use, daemon placement, network config |
| **OSD (Object Storage Daemon)** | One per physical/virtual disk — the process that actually reads/writes data to that disk |
| **MON (Monitor)** | Maintains the cluster map and quorum (always an odd number — 3 or 5 — for quorum voting) |
| **MGR (Manager)** | Exposes metrics, runs mgr modules (including the Ceph Dashboard) |
| **CephBlockPool** | A CRD defining a Ceph RBD (RADOS Block Device) pool — backs block `StorageClass`es |
| **CephObjectStore** | A CRD defining an S3-compatible object storage endpoint (via RGW — RADOS Gateway) |
| **CephFilesystem** | A CRD defining a shared POSIX filesystem (CephFS) — supports `ReadWriteMany` |
| **CSI (Container Storage Interface)** | The standard Kubernetes uses to talk to any storage backend — Rook deploys Ceph's CSI driver so PVCs work natively |

### Basic Usage Example
```yaml
# minimal CephCluster
apiVersion: ceph.rook.io/v1
kind: CephCluster
metadata:
  name: rook-ceph
  namespace: rook-ceph
spec:
  cephVersion:
    image: quay.io/ceph/ceph:v18.2.4
  dataDirHostPath: /var/lib/rook
  mon:
    count: 3
  mgr:
    count: 2
  storage:
    useAllNodes: true
    useAllDevices: true
```
Apply this and the operator provisions MONs, MGRs, and one OSD per unused raw block device it finds across cluster nodes — no manual `ceph-deploy`, no SSHing into hosts.

---

## 2. Intermediate

### From CephCluster to a Usable PVC
Three CRDs chain together to turn a raw Ceph cluster into something an app can mount:

**1. Define a pool (replication policy)**
```yaml
apiVersion: ceph.rook.io/v1
kind: CephBlockPool
metadata:
  name: replicapool
  namespace: rook-ceph
spec:
  failureDomain: host
  replicated:
    size: 3    # 3 copies of every object, spread across hosts
```

**2. Define a StorageClass backed by that pool**
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: rook-ceph-block
provisioner: rook-ceph.rbd.csi.ceph.com
parameters:
  clusterID: rook-ceph
  pool: replicapool
  imageFormat: "2"
  imageFeatures: layering
  csi.storage.k8s.io/fstype: ext4
  csi.storage.k8s.io/provisioner-secret-name: rook-csi-rbd-provisioner
  csi.storage.k8s.io/provisioner-secret-namespace: rook-ceph
reclaimPolicy: Delete
allowVolumeExpansion: true
```

**3. Claim it normally, like any Kubernetes storage**
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-data
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: rook-ceph-block
  resources:
    requests:
      storage: 5Gi
```
From here it's indistinguishable from any other dynamically-provisioned PV to the application — that's the entire point of the CSI abstraction.

### Three Storage Types from One Cluster
| Type | CRD | Backing Ceph component | Access pattern |
|---|---|---|---|
| **Block** | `CephBlockPool` + `StorageClass` (rbd.csi.ceph.com) | RBD | `ReadWriteOnce` (one pod at a time), fast, good for databases |
| **Object (S3-compatible)** | `CephObjectStore` | RGW | HTTP S3 API — buckets, for apps that speak S3 natively |
| **File** | `CephFilesystem` + `StorageClass` (cephfs.csi.ceph.com) | MDS + CephFS | `ReadWriteMany` — many pods, same volume, simultaneously |

This is Rook/Ceph's headline differentiator versus most other Kubernetes storage projects: **one cluster, three storage paradigms**, instead of running separate systems for block vs. object vs. shared-file needs.

### Object Storage Example
```yaml
apiVersion: ceph.rook.io/v1
kind: CephObjectStore
metadata:
  name: my-store
  namespace: rook-ceph
spec:
  metadataPool:
    failureDomain: host
    replicated:
      size: 3
  dataPool:
    failureDomain: host
    erasureCoded:
      dataChunks: 2
      codingChunks: 1
  gateway:
    port: 80
    instances: 2
```
Once reconciled, this exposes an S3-compatible endpoint (`rook-ceph-rgw-my-store`) — create buckets via an `ObjectBucketClaim` CRD, get back standard S3 credentials in a Kubernetes Secret.

### Toolbox Pod (Operational Access)
Rook ships a `rook-ceph-tools` deployment giving you a shell with the native `ceph` CLI, for anything the CRDs don't expose directly:
```bash
kubectl -n rook-ceph exec -it deploy/rook-ceph-tools -- bash
ceph status
ceph osd tree
ceph df
```

---

## 3. Advanced

### CRUSH and Failure Domains
- Ceph places data copies using the **CRUSH algorithm** — deterministic, no central lookup table needed to find where an object lives.
- `failureDomain: host` (as used above) means replicas are spread across different *hosts*, so losing one node doesn't lose all copies of any object. Can also be set to `rack`, `zone`, `region` in larger topologies for stronger failure isolation.
- Rook's `CephCluster.spec.storage` lets you pin specific nodes/devices for storage, or restrict which nodes MONs/MGRs/OSDs land on via `placement` (node affinity/tolerations) — important in mixed clusters where only some nodes have local disks.

### Replication vs. Erasure Coding
| Strategy | How it works | Tradeoff |
|---|---|---|
| **Replicated** (`replicated.size: 3`) | N full copies of every object | Simple, fast recovery, higher raw storage overhead (3x for size:3) |
| **Erasure Coded** (`erasureCoded.dataChunks/codingChunks`) | Data split into chunks + parity chunks (like RAID 6), reconstructible from a subset | Better storage efficiency, higher CPU cost and slower recovery — typically used for object storage's data pool, not for latency-sensitive block volumes |

### Scaling and Disk Failure Handling
- Adding capacity: add a node/disk matching `storage.useAllNodes`/`useAllDevices` (or explicit `nodes:` list) — the operator provisions a new OSD automatically on reconcile.
- Disk failure: Ceph marks the OSD down/out, CRUSH automatically rebalances replicas of the affected data across remaining OSDs to restore full replication — no manual intervention needed for the data-safety part, though replacing the physical disk and cleaning up the old OSD entry is an operator/admin action (`rook-ceph` provides `CephCluster` device-management + `ceph osd purge` workflows for this).
- Ceph is CPU/RAM hungry at scale — OSD daemons alone commonly need 2-4GB RAM budgeted per daemon; undersized nodes are the most common cause of Ceph instability in Rook deployments.

### Security
- **Ceph auth (cephx)**: every client (including each Rook CSI plugin) authenticates to the cluster with a cephx key, scoped by capability (`mon 'allow r', osd 'allow rwx pool=replicapool'`) — Rook manages generating and rotating these automatically, stored as Kubernetes Secrets.
- **Encryption at rest**: OSDs can be created with `encryptedDevice: true` in the `CephCluster` spec, backed by LUKS — Rook wires the key management through Kubernetes Secrets or a KMS integration (Vault supported).
- **Encryption in transit**: Ceph's `msgr2` protocol supports encrypting daemon-to-daemon traffic (`spec.network.connections.encryption.enabled: true`).
- **Network isolation**: `CephCluster.spec.network` can split public (client-facing) and cluster (OSD replication) traffic onto separate NetworkPolicies/interfaces — reduces blast radius if a client-facing network segment is compromised.

### Performance Tuning
- **Device class awareness**: mix SSD and HDD in one cluster, tag pools to a `deviceClass` (`ssd`/`hdd`) so latency-sensitive pools land only on fast media.
- **PG (Placement Group) count**: governs how data is sharded across OSDs for parallelism — Ceph's `pg_autoscaler` (on by default in modern Ceph/Rook) handles this automatically now; manual PG tuning is mostly a legacy concern.
- **MDS scaling** (CephFS): multiple active MDS daemons (`CephFilesystem.spec.metadataServer.activeCount > 1`) shard filesystem metadata for higher throughput on heavy multi-client workloads — adds failover complexity in exchange.
- **RGW instances**: scale `CephObjectStore.spec.gateway.instances` horizontally for object storage throughput; they're stateless in front of the same RADOS pools.

### Common Failure Modes / Debugging
| Symptom | Likely cause / where to look |
|---|---|
| `CephCluster` stuck, no OSDs created | No raw unformatted block devices found matching selectors — check `kubectl -n rook-ceph logs -l app=rook-ceph-operator` and confirm devices are truly raw (no filesystem/partition table) |
| MONs never reach quorum | Odd MON count not satisfied, or network policy blocking MON ports between nodes |
| PVC stuck in `Pending` | CSI provisioner pods not running, or `StorageClass` pool/cluster ID mismatch — check `rook-ceph-rbd-provisioner`/`rook-ceph-csi` pod logs |
| `ceph status` shows `HEALTH_WARN` | Very common transient states: clock skew across MONs, near-full OSDs, degraded PGs after a node loss mid-rebalance — `ceph health detail` in the toolbox pod gives the specific cause |
| Slow ops / high latency | Undersized node resources for OSD count, or PG count badly out of proportion to OSD count on older/manually-tuned clusters |

### Integration with the Wider Ecosystem
- **Kubernetes CSI**: Rook's entire value delivery to applications flows through CSI — any tool that consumes standard `StorageClass`/PVC (Helm charts, operators for databases, etc.) works unmodified against Rook-Ceph storage.
- **Prometheus**: Ceph's MGR ships a Prometheus exporter module Rook enables by default — `ServiceMonitor` CRs plug straight into an existing kube-prometheus-stack (see [prometheus.md](../../Monitoring%20and%20Loggin/prometheous/prometheus.md)).
- **Velero / backup tooling**: CephFS/RBD snapshots (via `VolumeSnapshotClass`, another CSI-standard resource Rook implements) integrate with Kubernetes-native backup tools for PV-level backup/restore.

---

## Quick Revision — Rook
- Rook = **storage orchestrator**, not a storage system itself — it automates deploying/operating Ceph (primarily) as Kubernetes-native CRDs.
- Architecture: Rook Operator watches `CephCluster`/`CephBlockPool`/`CephObjectStore`/`CephFilesystem` CRDs, reconciles actual Ceph daemon pods (MON/MGR/OSD/MDS/RGW).
- One Ceph cluster gives three storage types: **block** (RBD, RWO), **object** (RGW, S3-compatible), **file** (CephFS, RWX).
- CSI is the bridge from Ceph to Kubernetes: `StorageClass` → `PVC` → `PV`, fully standard from the app's point of view.
- CRUSH algorithm + `failureDomain` control where replicas land — spread across hosts/racks/zones for real fault tolerance.
- Replicated (simple, more storage overhead) vs. erasure coded (efficient, more CPU/slower recovery) pool tradeoff.
- OSDs are RAM-hungry; undersized nodes are the #1 real-world source of Rook/Ceph instability.
- Toolbox pod (`rook-ceph-tools`) gives raw `ceph` CLI access for anything the CRDs abstract away.
- Security: cephx auth (auto-managed by Rook), optional LUKS encryption-at-rest, `msgr2` encryption-in-transit.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
