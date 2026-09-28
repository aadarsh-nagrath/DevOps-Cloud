# etcd — Learn It Locally

Goal: run a real 3-node etcd cluster with Docker, use etcdctl to put/get/watch keys, kill a node and observe quorum behavior, then do a snapshot save/restore — in under 20 minutes. A bonus section inspects the etcd instance backing a real Kubernetes (kind) cluster.

## Prerequisites
- Docker installed and running.
- `etcdctl` on your host is convenient but not required — every command below can also run via `docker exec` into a container.
- (Optional, for the Kubernetes section) `kind` and `kubectl`.

---

## Step 1 — Create a Docker Network

```bash
docker network create etcd-net
```

---

## Step 2 — Run a 3-Node etcd Cluster

Three separate containers, each pointed at the same `--initial-cluster` list so they know about each other and can hold a Raft election.

```bash
docker run -d --name etcd1 --network etcd-net \
  -p 2379:2379 -p 2380:2380 \
  quay.io/coreos/etcd:v3.5.12 \
  etcd --name etcd1 \
  --initial-advertise-peer-urls http://etcd1:2380 \
  --listen-peer-urls http://0.0.0.0:2380 \
  --listen-client-urls http://0.0.0.0:2379 \
  --advertise-client-urls http://etcd1:2379 \
  --initial-cluster-token etcd-cluster-1 \
  --initial-cluster etcd1=http://etcd1:2380,etcd2=http://etcd2:2380,etcd3=http://etcd3:2380 \
  --initial-cluster-state new

docker run -d --name etcd2 --network etcd-net \
  -p 2381:2379 -p 2382:2380 \
  quay.io/coreos/etcd:v3.5.12 \
  etcd --name etcd2 \
  --initial-advertise-peer-urls http://etcd2:2380 \
  --listen-peer-urls http://0.0.0.0:2380 \
  --listen-client-urls http://0.0.0.0:2379 \
  --advertise-client-urls http://etcd2:2379 \
  --initial-cluster-token etcd-cluster-1 \
  --initial-cluster etcd1=http://etcd1:2380,etcd2=http://etcd2:2380,etcd3=http://etcd3:2380 \
  --initial-cluster-state new

docker run -d --name etcd3 --network etcd-net \
  -p 2383:2379 -p 2384:2380 \
  quay.io/coreos/etcd:v3.5.12 \
  etcd --name etcd3 \
  --initial-advertise-peer-urls http://etcd3:2380 \
  --listen-peer-urls http://0.0.0.0:2380 \
  --listen-client-urls http://0.0.0.0:2379 \
  --advertise-client-urls http://etcd3:2379 \
  --initial-cluster-token etcd-cluster-1 \
  --initial-cluster etcd1=http://etcd1:2380,etcd2=http://etcd2:2380,etcd3=http://etcd3:2380 \
  --initial-cluster-state new
```

Verify all three joined and elected a leader:
```bash
docker exec etcd1 etcdctl --endpoints=http://etcd1:2379,http://etcd2:2379,http://etcd3:2379 \
  endpoint status --write-out=table
```
You'll see a table with three rows — one row's `IS LEADER` column will be `true`, the other two `false`.

---

## Step 3 — Put, Get, and List Keys

```bash
export ETCDCTL_API=3
alias e1="docker exec etcd1 etcdctl --endpoints=http://etcd1:2379"

e1 put /config/db-host "postgres.internal"
e1 put /config/db-port "5432"
e1 put /config/cache-ttl "60s"

e1 get /config/db-host
e1 get /config/ --prefix
```

Watch a key in one terminal, update it from another:
```bash
# Terminal A — blocks and streams events
docker exec -it etcd1 etcdctl --endpoints=http://etcd1:2379 watch /config/db-host

# Terminal B — trigger a change
e1 put /config/db-host "postgres-replica.internal"
```
Terminal A immediately prints the new value — no polling involved. This is the exact mechanism Kubernetes' API server uses internally to power `kubectl get --watch`.

---

## Step 4 — Kill a Node and Observe Quorum

With 3 nodes, quorum is 2 — the cluster tolerates exactly 1 failure.

```bash
# Kill one follower (check the table from Step 2 to pick a non-leader)
docker stop etcd3

# Writes still work — quorum (2 of 3) still intact
e1 put /config/still-works "yes"
e1 get /config/still-works
```

Now kill a second node to break quorum entirely:
```bash
docker stop etcd2

# This will hang and eventually time out — no quorum, no writes accepted
e1 put /config/will-fail "no" --command-timeout=5s
```
You'll see a context-deadline-exceeded error. This is exactly what happens to a Kubernetes cluster if you lose the majority of your etcd nodes: the API server can't write anything (no new pods, no updates) until quorum is restored.

Bring the nodes back:
```bash
docker start etcd2 etcd3
sleep 5
docker exec etcd1 etcdctl --endpoints=http://etcd1:2379,http://etcd2:2379,http://etcd3:2379 \
  endpoint status --write-out=table
```
They rejoin and catch up via Raft log replication automatically.

---

## Step 5 — Snapshot Save and Restore

```bash
mkdir -p /tmp/etcd-backup

docker exec etcd1 etcdctl --endpoints=http://etcd1:2379 \
  snapshot save /tmp/snapshot.db
docker cp etcd1:/tmp/snapshot.db /tmp/etcd-backup/snapshot.db

docker exec etcd1 etcdctl snapshot status /tmp/snapshot.db --write-out=table
```

Simulate disaster recovery — restore into a fresh single-node cluster:
```bash
docker run -d --name etcd-restored --network etcd-net \
  -p 2389:2379 \
  -v /tmp/etcd-backup:/backup \
  quay.io/coreos/etcd:v3.5.12 \
  /bin/sh -c "etcdctl snapshot restore /backup/snapshot.db --data-dir=/restored-data --name=etcd-restored --initial-cluster=etcd-restored=http://etcd-restored:2380 --initial-advertise-peer-urls=http://etcd-restored:2380 && \
  etcd --name etcd-restored --data-dir=/restored-data \
  --listen-client-urls http://0.0.0.0:2379 --advertise-client-urls http://etcd-restored:2379 \
  --listen-peer-urls http://0.0.0.0:2380"

sleep 3
docker exec etcd-restored etcdctl --endpoints=http://etcd-restored:2379 get /config/ --prefix
```
Your original keys (`/config/db-host`, `/config/db-port`, `/config/cache-ttl`, `/config/still-works`) all appear — the restore rebuilt the full keyspace from the snapshot.

---

## Step 6 — Inspect a Real Kubernetes Cluster's etcd (kind)

```bash
kind create cluster --name etcd-lab

# etcd runs as a static pod container inside the kind control-plane node
docker exec -it etcd-lab-control-plane crictl ps | grep etcd
```

Exec into the node and query the cluster's own etcd directly:
```bash
docker exec -it etcd-lab-control-plane sh -c '
  ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  endpoint health
'
```

List actual Kubernetes objects as raw etcd keys — this is what `kubectl get pods` looks like underneath:
```bash
docker exec -it etcd-lab-control-plane sh -c '
  ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  get /registry/pods/kube-system/ --prefix --keys-only
'
```
Every pod, deployment, secret, and configmap in the cluster is a key under `/registry/...` — this is the moment it clicks that Kubernetes isn't magic, it's a very well-designed etcd client.

---

## Cleanup

```bash
docker rm -f etcd1 etcd2 etcd3 etcd-restored
docker network rm etcd-net
kind delete cluster --name etcd-lab
```

## What to Explore Next
- Bring the cluster to `NOSPACE` alarm state on purpose by setting a tiny `--quota-backend-bytes` and writing until it trips, then practice `etcdctl alarm disarm` after compacting.
- Compare `etcdctl get --consistency=l` (linearizable, default) vs `--consistency=s` (serializable, faster but can read slightly stale data from a follower) under load.
- Take a snapshot of the kind cluster's real etcd (`kubeadm`-style backup command from the notes) and practice a full `kubeadm`-style restore into a fresh data directory.
- Run `etcdctl defrag` against a node with a lot of accumulated history and watch `etcd_mvcc_db_total_size_in_use_in_bytes` vs the actual file size on disk before/after.
