# Rook — Learn It Locally

Goal: run the Rook operator on a local `kind` cluster, bring up a real (if tiny) Ceph cluster backed by loopback block devices, provision a `StorageClass`/PVC through it, and mount that volume in a pod — in about 40 minutes.

**Honest caveat up front**: `kind` nodes are Docker containers, not real machines with their own physical disks. Ceph's OSDs need actual raw block devices. There is a real, documented workaround — mounting **loopback devices** (sparse files exposed as block devices via `losetup`) into the kind node containers — and that's what this tutorial uses to get a genuinely functional (not fake/mocked) Ceph cluster. It's a small cluster on small loop devices, but the OSDs, MONs, CSI driver, and PVC provisioning are all real. For anything beyond learning/poking around, use a real multi-node cluster with actual disks (bare metal, or cloud VMs with attached raw block volumes) — Rook explicitly recommends against single-node/loopback setups for anything resembling production.

## Prerequisites
- Docker installed and running, on Linux or macOS (loop device setup below assumes a Linux Docker host; on macOS/Docker Desktop this runs inside its Linux VM, which also works).
- `kind` and `kubectl` installed.
- `helm` installed.
- Root/sudo access on the Docker host, to create loopback devices.

---

## Step 1 — Prepare Loopback Block Devices

Create sparse files and attach them as loop devices on the Docker host — these will become the raw disks Ceph's OSDs consume.

```bash
# Create three 10GB sparse files (sparse = doesn't actually use 10GB on disk yet)
sudo mkdir -p /mnt/rook-disks
for i in 0 1 2; do
  sudo truncate -s 10G /mnt/rook-disks/disk${i}.img
  sudo losetup -fP /mnt/rook-disks/disk${i}.img
done

# Confirm they're attached
losetup -a
```
Note the resulting device paths (e.g. `/dev/loop0`, `/dev/loop1`, `/dev/loop2`).

---

## Step 2 — Create a Kind Cluster with the Loop Devices Mounted In

`kind` nodes are containers — we mount the host's loop devices into the node container via `extraMounts` so the node's kernel view includes them as raw block devices.

```yaml
# kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    extraMounts:
      - hostPath: /dev/loop0
        containerPath: /dev/loop0
      - hostPath: /dev/loop1
        containerPath: /dev/loop1
      - hostPath: /dev/loop2
        containerPath: /dev/loop2
```
```bash
kind create cluster --name rook-lab --config kind-config.yaml
kubectl cluster-info --context kind-rook-lab

# Verify the node container can see the devices
docker exec rook-lab-control-plane lsblk
```
You should see `loop0`, `loop1`, `loop2` listed inside the node container — this is what makes them visible to Rook's device-discovery.

Since this is a single-node cluster, also untaint the control-plane so Ceph daemons can schedule on it:
```bash
kubectl taint nodes rook-lab-control-plane node-role.kubernetes.io/control-plane- 2>/dev/null || true
```

---

## Step 3 — Install the Rook Operator

```bash
git clone --single-branch --branch v1.15.4 https://github.com/rook/rook.git
cd rook/deploy/examples

kubectl create -f crds.yaml -f common.yaml -f operator.yaml
kubectl -n rook-ceph get pods -w
```
Wait for `rook-ceph-operator-...` to reach `Running`.

---

## Step 4 — Deploy a CephCluster Using the Loop Devices

Edit (or create) a minimal single-node `CephCluster` that targets the exact loop devices rather than `useAllDevices`, since we want to be explicit about what's real storage here:

```yaml
# cluster-test.yaml
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
    count: 1
  mgr:
    count: 1
  dashboard:
    enabled: true
  storage:
    useAllNodes: true
    useAllDevices: false
    deviceFilter: "^loop[0-2]"
  resources: {}
```
```bash
kubectl apply -f cluster-test.yaml
kubectl -n rook-ceph get pods -w
```
Give this several minutes. Watch for `rook-ceph-mon-a`, `rook-ceph-mgr-a`, then `rook-ceph-osd-prepare-*` jobs (these detect and format the loop devices), and finally `rook-ceph-osd-0`, `rook-ceph-osd-1`, `rook-ceph-osd-2` reaching `Running` — one OSD per loop device.

If OSDs never appear, check the prepare job logs — this is the most common failure point on the loopback path:
```bash
kubectl -n rook-ceph logs -l app=rook-ceph-osd-prepare --all-containers
```

---

## Step 5 — Verify Cluster Health with the Toolbox

```bash
kubectl apply -f toolbox.yaml
kubectl -n rook-ceph exec -it deploy/rook-ceph-tools -- bash
```
Inside the toolbox:
```bash
ceph status
ceph osd tree
ceph df
```
`ceph status` should show `HEALTH_OK` (or `HEALTH_WARN` about a single-MON/single-node setup not being fault tolerant — expected and fine for this lab) with 3 OSDs up/in.

Exit the toolbox with `exit`.

---

## Step 6 — Create a Pool, StorageClass, and PVC

```bash
kubectl apply -f csi/rbd/storageclass-test.yaml
kubectl get storageclass
```
This applies a `CephBlockPool` (`replicapool`, single-replica for this tiny lab — see `storageclass-test.yaml` in the cloned repo, it's sized for exactly this kind of single-node test) and a `StorageClass` named `rook-ceph-block`.

```yaml
# my-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: rook-test-pvc
spec:
  storageClassName: rook-ceph-block
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 1Gi
```
```bash
kubectl apply -f my-pvc.yaml
kubectl get pvc rook-test-pvc -w
```
Watch it go from `Pending` to `Bound` — that's the Rook CSI driver provisioning a real RBD image on the loopback-backed Ceph cluster.

---

## Step 7 — Mount It in a Pod and Write Real Data

```yaml
# test-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: rook-test-writer
spec:
  containers:
    - name: writer
      image: busybox:1.36
      command: ["sh", "-c", "echo 'hello from rook' > /data/hello.txt && sleep 3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: rook-test-pvc
```
```bash
kubectl apply -f test-pod.yaml
kubectl wait --for=condition=Ready pod/rook-test-writer --timeout=60s
kubectl exec rook-test-writer -- cat /data/hello.txt
```
You should see `hello from rook` — a real write, replicated by Ceph, on a PV your app just consumed through a completely standard Kubernetes PVC.

Delete and recreate the pod to confirm the data persists independent of the pod's lifecycle:
```bash
kubectl delete pod rook-test-writer
kubectl apply -f test-pod.yaml
kubectl wait --for=condition=Ready pod/rook-test-writer --timeout=60s
kubectl exec rook-test-writer -- cat /data/hello.txt   # still there
```

---

## Cleanup
```bash
kind delete cluster --name rook-lab

# detach and remove the loop devices on the host
for dev in /dev/loop0 /dev/loop1 /dev/loop2; do
  sudo losetup -d $dev 2>/dev/null || true
done
sudo rm -rf /mnt/rook-disks
```

## What to Explore Next
- Bump `CephBlockPool.spec.replicated.size` and `mon.count`/`mgr.count` on a **multi-node** kind cluster (one loop device per node) to see real multi-host replication and MON quorum in action — this single-node lab intentionally skips that to keep setup simple.
- Deploy a `CephObjectStore` and create an `ObjectBucketClaim` to get an S3-compatible endpoint from the same cluster, then upload a file with `aws s3` CLI pointed at it.
- Enable the Ceph Dashboard (`spec.dashboard.enabled: true` is already set above) and port-forward to it (`kubectl -n rook-ceph port-forward svc/rook-ceph-mgr-dashboard 8443:8443`) to browse cluster health visually instead of via the toolbox CLI.
- Kill an OSD pod (`kubectl -n rook-ceph delete pod rook-ceph-osd-0`) and watch Rook/Ceph detect and recover it — observe `ceph status` during the transition.
- Compare this whole workflow against the Longhorn tutorial in this repo — same underlying goal (Kubernetes-native replicated storage), very different operational complexity.
