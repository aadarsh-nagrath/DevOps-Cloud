# Longhorn — Learn It Locally

Goal: install Longhorn on a local `kind` cluster, get the environment prerequisites actually satisfied, provision a real replicated volume, write data, take a snapshot via the UI, and understand how failover testing works — in about 30 minutes.

**Honest caveat up front**: Longhorn's Engine talks to the Linux kernel via **iSCSI** (`iscsiadm`), and needs `open-iscsi`/`iscsid` running on the node the volume attaches to. `kind` nodes are containers sharing the host kernel, so this requirement lands on your **Docker host's kernel**, not something installable purely inside the container image. On a Linux Docker host, installing `open-iscsi` on the host and loading the right kernel modules is enough and this tutorial genuinely works end to end. On macOS/Windows with Docker Desktop, the relevant kernel lives inside Docker Desktop's own Linux VM, which does not ship `open-iscsi` and cannot have host packages installed into it the normal way — volume attachment will not fully succeed there. This tutorial walks the full path and tells you exactly which step is the fork: you'll still stand up the operator, CRDs, and UI regardless of platform, and if you're on Linux you'll get real attached, written-to volumes; if you're on Docker Desktop, note where it stops and what a real environment (a Linux VM, minikube's own VM driver with a modified ISO, or bare metal) buys you.

## Prerequisites
- Docker installed and running.
- `kind` and `kubectl` installed.
- `helm` installed.
- Linux host recommended for the full write-a-file experience (see caveat above).

---

## Step 1 — Install open-iscsi on the Host (Linux)

```bash
# Debian/Ubuntu
sudo apt-get update && sudo apt-get install -y open-iscsi
sudo systemctl enable --now iscsid

# RHEL/CentOS/Fedora
sudo yum install -y iscsi-initiator-utils
sudo systemctl enable --now iscsid

# Verify
sudo systemctl status iscsid
lsmod | grep iscsi_tcp || sudo modprobe iscsi_tcp
```
If you're on Docker Desktop (macOS/Windows), skip this — there's no host package manager reaching the VM's kernel this way. Continue anyway; Step 4's preflight check will confirm the actual state rather than guessing.

---

## Step 2 — Create the Kind Cluster

```bash
kind create cluster --name longhorn-lab
kubectl cluster-info --context kind-longhorn-lab
```

---

## Step 3 — Install Longhorn

```bash
helm repo add longhorn https://charts.longhorn.io
helm repo update

kubectl create namespace longhorn-system
helm install longhorn longhorn/longhorn \
  --namespace longhorn-system \
  --version 1.7.2
```
```bash
kubectl -n longhorn-system get pods -w
```
Wait for `longhorn-manager`, `longhorn-driver-deployer`, `longhorn-csi-plugin`, `csi-*` sidecar pods, and `longhorn-ui` to reach `Running`.

---

## Step 4 — Run the Environment Check

Longhorn ships a preflight DaemonSet that checks each node for the actual kernel-level prerequisites (iscsiadm, required kernel modules, multipathd conflicts) instead of leaving you to discover a broken attach later:

```bash
curl -sSfL https://raw.githubusercontent.com/longhorn/longhorn/v1.7.2/deploy/prerequisite/longhorn-iscsi-installation.yaml -o iscsi-installation.yaml
kubectl apply -f iscsi-installation.yaml
kubectl get pods --field-selector=status.phase=Running -l app=longhorn-iscsi-installation
kubectl logs -l app=longhorn-iscsi-installation --tail=50
```
On a Linux Docker host with Step 1 done correctly, the logs report iSCSI is installed and ready. On Docker Desktop, this is where you'll see the real gap — the check will report it cannot find/enable `iscsid` at the kernel level it actually has access to. That's expected given the caveat above, not a misconfiguration on your part; it's the honest boundary of what a containerized kind node can do.

---

## Step 5 — Access the Longhorn UI

```bash
kubectl -n longhorn-system port-forward svc/longhorn-frontend 8080:80
```
Open http://localhost:8080. You'll see the Longhorn dashboard: Node list (with disk/CPU/memory usage), Volume list (empty so far), and system health status. Click into **Node** to confirm your single kind node is listed with a schedulable disk (Longhorn auto-adds the node's root disk by default for this kind of test install).

---

## Step 6 — Create a StorageClass and PVC

Longhorn's Helm chart installs a default `StorageClass` named `longhorn`. Confirm it:
```bash
kubectl get storageclass longhorn -o yaml
```

```yaml
# longhorn-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: longhorn-test-pvc
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: longhorn
  resources:
    requests:
      storage: 1Gi
```
```bash
kubectl apply -f longhorn-pvc.yaml
kubectl get pvc longhorn-test-pvc -w
```
On a Linux host this should reach `Bound` within seconds. Check the corresponding `Volume` CRD and see it reflected in the UI's Volume tab too:
```bash
kubectl -n longhorn-system get volumes.longhorn.io
```

---

## Step 7 — Mount It in a Pod and Write Data

```yaml
# longhorn-test-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: longhorn-test-writer
spec:
  containers:
    - name: writer
      image: busybox:1.36
      command: ["sh", "-c", "echo 'hello from longhorn' > /data/hello.txt && sleep 3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: longhorn-test-pvc
```
```bash
kubectl apply -f longhorn-test-pod.yaml
kubectl wait --for=condition=Ready pod/longhorn-test-writer --timeout=60s
kubectl exec longhorn-test-writer -- cat /data/hello.txt
```
Expected output: `hello from longhorn`. If the pod is stuck in `ContainerCreating`, describe it (`kubectl describe pod longhorn-test-writer`) — an attach failure due to missing iSCSI support (the Docker Desktop case) shows up here as a mount timeout.

---

## Step 8 — Take a Manual Snapshot via the UI

In the Longhorn UI (http://localhost:8080), go to **Volume**, click into `longhorn-test-pvc`'s corresponding volume, and click **Take Snapshot**. Name it `manual-snap-1`.

This is a local, node-disk-resident copy — fast, but tied to this cluster's disks. To see the difference between a snapshot and a real backup, configure a `BackupTarget` (needs an S3-compatible endpoint — MinIO running locally works fine for this):
```bash
docker run -d --name minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=longhorn -e MINIO_ROOT_PASSWORD=longhornpass \
  minio/minio server /data --console-address ":9001"
```
Then in the UI under **Setting > General > Backup Target**, point it at `s3://longhorn-backups@us-east-1/` with a credential secret referencing the MinIO keys, create the bucket in MinIO's console (http://localhost:9001), and click **Backup** on the snapshot you just took — now the data exists outside the cluster entirely.

---

## Step 9 — Understand Failover Testing (Cordon a Node)

On this single-node lab there's nowhere for a replica to fail over to, so this step is conceptual — but the mechanic is worth knowing cold since it's exactly what you'd exercise on a real multi-node cluster:

```bash
# On a real multi-node cluster:
kubectl cordon <node-name>              # stops new pods scheduling there
# In the Longhorn UI: Node -> select the node -> Edit node and disks -> "Request Eviction"
# This proactively moves replicas off the node BEFORE you drain/reboot it,
# avoiding a window where the volume's replica count drops below its durability target.
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
```
The distinction that matters: `cordon` alone does nothing to move existing replicas — **eviction** is the Longhorn-specific step that actually relocates data proactively, which is the safe way to take a storage node down for maintenance without a durability gap.

---

## Cleanup
```bash
docker rm -f minio
kind delete cluster --name longhorn-lab
```

## What to Explore Next
- On a real Linux multi-node cluster (3+ nodes, each with a dedicated disk), rerun this tutorial with `numberOfReplicas: 3` and actually kill a node (`docker stop <node-container>` for a kind multi-node setup, or power off a VM) to watch Longhorn detect the loss and reattach the volume elsewhere using a surviving replica.
- Try `dataLocality: best-effort` on a multi-node cluster and observe whether Longhorn relocates a replica onto the same node as the attached Engine for lower read latency.
- Set up a `RecurringJob` for automated nightly backups instead of the manual snapshot/backup taken above.
- Compare this tutorial against the Rook tutorial in this repo — same underlying "replicated Kubernetes storage" goal, very different setup complexity and kernel prerequisites (iSCSI here vs. raw block devices for Ceph OSDs there).
