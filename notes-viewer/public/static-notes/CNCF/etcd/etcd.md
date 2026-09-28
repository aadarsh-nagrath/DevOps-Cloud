# etcd — Complete Notes

## 1. Beginner

### What is etcd?
- Open-source **distributed, reliable key-value store**, written in Go, originally built at CoreOS, donated to CNCF, **graduated** in 2020.
- Solves one specific problem: a distributed system needs a single source of truth for critical configuration and state that survives node failures and stays consistent even when multiple clients read/write concurrently. etcd is that store.
- It is not a general-purpose database — no complex queries, no joins, no secondary indexes. It's optimized for a small number of frequently-read, occasionally-written, small values, with strong consistency guarantees and a **watch** API for reacting to changes in real time.
- etcd's single most important consumer is **Kubernetes** — every Kubernetes object (Pod, Deployment, Secret, ConfigMap, everything) is a key in etcd. If etcd is gone, the Kubernetes cluster's state is gone. See [Kubernetes notes](../../Kubernetes/kubernetes.md) and [CKA notes](../../CKA/README.md).

### The Core Problem It Solves
```
Without etcd (naive approach):
  API Server 1 ---\
  API Server 2 ----> (where does cluster state live? in-memory? one server crashes -> state lost)
  API Server 3 ---/

With etcd:
  API Server 1 ---\
  API Server 2 ----> [etcd cluster: 3 or 5 nodes, Raft-replicated] --> durable, consistent, survives node loss
  API Server 3 ---/
```
Multiple Kubernetes API server replicas can all read/write the same state safely because they all talk to the same etcd cluster, which guarantees **linearizable reads/writes** — every client sees the same data in the same order, no matter which etcd node they hit.

### Core Concepts
| Term | Meaning |
|---|---|
| **Key-Value Store** | Data model is a flat namespace of keys (strings) mapped to values (bytes) — no tables, no schema |
| **Raft** | The consensus algorithm etcd uses to replicate the log across nodes and keep them in agreement |
| **Leader** | The single node in a Raft cluster that accepts writes and replicates them to followers |
| **Quorum** | Majority of nodes (`N/2 + 1`) that must agree before a write is committed — this is why cluster size matters |
| **Revision** | A monotonically increasing counter, incremented on every write to the whole store — the basis for etcd's MVCC model |
| **Watch** | A streaming API that notifies a client the instant a key (or key range) changes — no polling |
| **Lease** | A TTL attached to keys; when the lease expires, the key is auto-deleted — used for things like service liveness |
| **Compaction** | Removing old revisions to reclaim space (etcd keeps full history by default until compacted) |
| **Defragmentation** | Reclaiming disk space at the storage-engine (boltdb) level after compaction — a separate step |

### Architecture
```
        Client (etcdctl / Kubernetes API server / any etcd client)
                        |
                        | gRPC
                        v
        +-------------------------------+
        |         etcd Cluster          |
        |                                |
        |   [Leader] <--Raft log--> [Follower]
        |       ^                        |
        |       |                        |
        |       +------Raft log----------+--> [Follower]
        +-------------------------------+
                        |
                        v
              Local disk (WAL + boltdb snapshot per node)
```
- Every node keeps a **write-ahead log (WAL)** and a **boltdb**-backed snapshot on local disk.
- All writes go through the leader; the leader replicates to followers via Raft; a write is only acknowledged once a **quorum** of nodes has persisted it.
- Reads can be served locally by any node (with linearizable or serializable consistency options) since all nodes converge to the same state.

### Basic etcdctl Usage
```bash
# Set the API version (v3 is what everyone uses today)
export ETCDCTL_API=3

# Put a key
etcdctl put /config/db-host "postgres.internal"

# Get a key
etcdctl get /config/db-host

# Get with prefix (range query)
etcdctl get /config/ --prefix

# Delete a key
etcdctl del /config/db-host

# Watch a key for changes (blocks, streams updates)
etcdctl watch /config/db-host
```

---

## 2. Intermediate

### Raft Consensus — How It Actually Works
Raft breaks consensus into three sub-problems: **leader election**, **log replication**, and **safety**.

1. **Leader election**: nodes start as followers. If a follower doesn't hear from a leader within an election timeout, it becomes a candidate, increments its term, and requests votes. Whoever gets a majority becomes leader for that term.
2. **Log replication**: the leader appends every write to its own log, then sends `AppendEntries` RPCs to followers. Once a majority have persisted the entry, it's **committed** and applied to the state machine (the actual key-value data).
3. **Safety**: Raft guarantees that once an entry is committed, it will be present in the logs of all future leaders — no committed write is ever lost or silently overwritten.

### Why Odd Numbers of Nodes
Quorum = `floor(N/2) + 1`. Fault tolerance = `floor((N-1)/2)`.

| Cluster size | Quorum needed | Nodes that can fail | Notes |
|---|---|---|---|
| 1 | 1 | 0 | No fault tolerance — dev only |
| 2 | 2 | 0 | Worse than 1 — both nodes needed, no benefit |
| 3 | 2 | 1 | Standard production minimum |
| 4 | 3 | 1 | Same fault tolerance as 3, but more write overhead — never do this |
| 5 | 3 | 2 | Higher fault tolerance, higher write latency (more nodes to replicate to) |

Even numbers are always a mistake — they add replication cost without adding fault tolerance over the odd number below them. 3 nodes is the standard for most Kubernetes clusters; 5 for very large/critical clusters that need to tolerate 2 simultaneous failures.

### Data Model Deep Dive — MVCC
- etcd v3 is **multi-version concurrency control**: every write creates a new revision rather than overwriting in place.
- `etcdctl get key --rev=<N>` can read the value of a key as of a past revision — this is what makes Kubernetes' watch-from-a-resourceVersion pattern work reliably (API server watches resume from an exact revision after a reconnect).
- Old revisions accumulate until **compacted**; uncompacted history is what makes etcd's disk usage grow over time under heavy write load.

### Watches in Practice
```bash
# Watch everything under a prefix, from a specific revision onward
etcdctl watch /registry/pods/ --prefix --rev=1500

# Kubernetes API servers do exactly this internally:
# they watch /registry/... in etcd and turn every change into
# a Kubernetes "watch event" that kubectl/controllers consume.
```
This is the mechanism that makes `kubectl get pods --watch` and every controller's reconcile loop work — controllers don't poll, they watch etcd (indirectly, via the API server, which itself watches etcd).

### Backup and Restore (Critical Operational Skill)
```bash
# Snapshot save — always run this against a specific endpoint
ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /backup/etcd-snapshot-$(date +%F).db

# Verify the snapshot
etcdctl snapshot status /backup/etcd-snapshot-2026-09-28.db --write-out=table

# Restore (creates a new data-dir, does NOT overwrite a live cluster in place)
etcdctl snapshot restore /backup/etcd-snapshot-2026-09-28.db \
  --data-dir=/var/lib/etcd-restored \
  --initial-cluster="node1=https://10.0.0.1:2380" \
  --initial-advertise-peer-urls="https://10.0.0.1:2380" \
  --name=node1
```
Key points:
- `snapshot save` is a live, non-blocking read of the whole keyspace — safe to run against a running cluster.
- `snapshot restore` writes a fresh data directory; you then point etcd's `--data-dir` at it and restart. It does not merge into a running cluster — the cluster identity is effectively reset.
- For Kubernetes, this is the single most important disaster-recovery procedure: lose etcd, lose the cluster, restore from snapshot to get it back.

---

## 3. Advanced

### Performance: etcd Is Disk-Latency Sensitive
- Every write must be fsync'd to disk on a quorum of nodes before being acknowledged — etcd's write latency is bounded by disk fsync latency, not network latency, in most well-connected clusters.
- **SSDs are mandatory** for any real cluster. Spinning disks or slow network-attached storage cause `heartbeat time out` and leader elections under load — a classic symptom of etcd running on the wrong disk.
- Key metrics to watch: `etcd_disk_wal_fsync_duration_seconds` (should be well under 10ms p99), `etcd_disk_backend_commit_duration_seconds`, `etcd_server_leader_changes_seen_total` (frequent leader changes = instability, usually disk or network).
- **etcd struggles above a few GB of data.** The recommended max db size is 8GB (hard limit configurable via `--quota-backend-bytes`, default ~2GB). This is by design — etcd is meant for cluster state and coordination data, not as a general application database. Hitting the quota puts the cluster in a read-only alarm state until compaction/defrag frees space.

### Compaction vs Defragmentation
| Operation | What it does | When needed |
|---|---|---|
| **Compaction** | Removes old MVCC revisions below a given revision number, freeing *logical* space | Regularly, to bound keyspace history growth — Kubernetes API servers auto-compact by default (`--auto-compaction-retention`) |
| **Defragmentation** | Reclaims *physical* disk space from boltdb after compaction (compaction alone leaves gaps in the boltdb file) | Periodically, especially after heavy compaction, or when `etcd_mvcc_db_total_size_in_use_in_bytes` is much smaller than the actual file size on disk |

```bash
# Compact to current revision
etcdctl compact $(etcdctl endpoint status --write-out="json" | jq -r '.[0].Status.header.revision')

# Defrag (do this one node at a time in a live cluster — it's a blocking, expensive operation on that node)
etcdctl defrag --endpoints=https://127.0.0.1:2379
```
Defrag briefly blocks the node it runs on — never defrag all nodes simultaneously in a production cluster, or you risk losing quorum availability during the operation.

### etcd in kubeadm Clusters
- Runs as a **static pod** on control-plane nodes, defined by a manifest at `/etc/kubernetes/manifests/etcd.yaml` — the kubelet watches this directory and runs it directly, not through the API server (chicken-and-egg problem: etcd has to exist before the API server can schedule anything).
- Certs live under `/etc/kubernetes/pki/etcd/`: `ca.crt`, `server.crt`/`server.key` (peer/client TLS), `peer.crt`/`peer.key`.
- Data directory: `/var/lib/etcd` by default.
- Inspect it directly:
```bash
# From the control-plane node
sudo crictl ps | grep etcd
sudo ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  endpoint health
```

### Security
- **TLS everywhere by default in Kubernetes deployments**: client-to-server TLS (API server to etcd) and peer TLS (etcd node to etcd node) are separate cert pairs.
- **RBAC in etcd itself** exists (`etcdctl role`, `etcdctl user`) but in Kubernetes deployments access control is almost always enforced at the API server layer instead — etcd is treated as a trusted backend only the API server talks to directly. Anyone with direct etcd access effectively has full cluster-admin (they can read every Secret in plaintext unless encryption-at-rest is configured).
- **Encryption at rest**: Kubernetes supports encrypting Secrets (and optionally other resources) before they're written to etcd via an `EncryptionConfiguration` — etcd itself has no native encryption-at-rest, so without this, Secrets sit in etcd as base64 (not encrypted) plaintext.

### Multi-Node Topologies and Failure Modes
| Scenario | What happens |
|---|---|
| Minority of nodes down (e.g. 1 of 3) | Cluster stays available — quorum intact, writes continue |
| Majority of nodes down (e.g. 2 of 3) | Cluster loses quorum — **no writes accepted**, reads may still work from surviving nodes depending on consistency mode, cluster is effectively down for control-plane purposes |
| Network partition splitting quorum | Only the partition with quorum can elect a leader and accept writes — the minority partition is read-only/stale, preventing split-brain |
| Disk full / quota exceeded | Cluster enters `NOSPACE` alarm — rejects writes until compacted + defragged and alarm is disarmed (`etcdctl alarm disarm`) |

### Integration with the Kubernetes Control Plane
```
kubectl --> API Server --> etcd (only component that talks to etcd directly)
                |
                +--> Scheduler   (watches etcd via API server for unscheduled pods)
                +--> Controller Manager (watches + reconciles via API server)
                +--> kubelet (per node, watches for pods assigned to it)
```
No other Kubernetes component talks to etcd directly — this is a deliberate architectural boundary. It's why the API server can enforce admission control, RBAC, and validation uniformly: everything funnels through it before touching the source of truth.

---

## Quick Revision — etcd

- Distributed, strongly-consistent key-value store; **is** the Kubernetes cluster's entire state.
- Uses **Raft** for consensus: leader election + log replication + majority quorum commits.
- Cluster size should always be odd — 3 nodes tolerates 1 failure, 5 tolerates 2. Even numbers waste replication cost for no extra fault tolerance.
- MVCC data model: every write is a new **revision** — enables point-in-time reads and reliable watch resumption.
- **Watch API** is what powers `kubectl get --watch` and every controller reconcile loop, indirectly through the API server.
- **Disk latency is the #1 performance factor** — SSD mandatory, watch `wal_fsync_duration_seconds`.
- Recommended max DB size ~8GB — etcd is not meant to be a general-purpose database.
- **Compaction** frees logical MVCC history; **defrag** frees physical boltdb disk space — different operations, both needed periodically.
- `etcdctl snapshot save` / `snapshot restore` is the core disaster-recovery workflow — practice it before you need it.
- In kubeadm clusters: static pod, manifest at `/etc/kubernetes/manifests/etcd.yaml`, certs at `/etc/kubernetes/pki/etcd/`.
- Only the API server talks to etcd directly — every other control-plane component goes through the API server.
- No native encryption at rest — use Kubernetes `EncryptionConfiguration` for Secrets, or anyone with etcd access reads all Secrets in plaintext.

See also: [Kubernetes notes](../../Kubernetes/kubernetes.md), [CKA notes](../../CKA/README.md) for control-plane context.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
