# ConfigMaps, Secrets & Persistent Storage — In Depth

> Extends [k8s-learning-path §5, §8, §29](../k8s-learning-path.md).

---

## 1. ConfigMap — four ways to consume it

```yaml
apiVersion: v1
kind: ConfigMap
metadata: { name: app-config }
data:
  LOG_LEVEL: info
  app.properties: |
    feature.x=true
binaryData: {}          # base64 for non-UTF8
immutable: false
```

| Method | YAML | Updates propagate? |
|---|---|---|
| Single env var | `env[].valueFrom.configMapKeyRef {name,key}` | **No** — needs pod restart |
| All keys as env | `envFrom[].configMapRef {name}` | **No** |
| Volume (each key = file) | `volumes[].configMap {name}` + `volumeMounts` | **Yes**, eventually (kubelet sync ≈ 60–90 s) via symlink swap |
| Volume with `subPath` | `volumeMounts[].subPath: app.properties` | **No** (subPath mounts never update) |
| Command args | `$(VAR)` from env | No |

Practical consequences:
- Apps must **re-read files** to benefit from live volume updates (or you restart them).
- Common restart trigger: Helm annotation `checksum/config: {{ include (print $.Template.BasePath "/cm.yaml") . | sha256sum }}` on the pod template, or tools like Reloader.
- Mounting a ConfigMap over a directory **hides** the directory's existing files — mount a single key with `subPath` (and accept no live updates), or mount elsewhere.
- Limit: 1 MiB per object. `immutable: true` ⇒ safer and less load on apiserver, but you must roll a new name (`app-config-v2`) to change it.
- `items:` in the volume selects/renames keys: `items: [{key: app.properties, path: app.conf}]`; `defaultMode: 0440` sets permissions.

---

## 2. Secret — types and the truth about security

```yaml
apiVersion: v1
kind: Secret
metadata: { name: db }
type: Opaque
stringData:             # convenience: plain text; stored in `data` as base64
  username: admin
  password: s3cr3t
```

| `type` | Required keys | Use |
|---|---|---|
| `Opaque` | none | arbitrary |
| `kubernetes.io/tls` | `tls.crt`, `tls.key` | **Ingress `tls.secretName`**, Gateway listeners, webhooks |
| `kubernetes.io/dockerconfigjson` | `.dockerconfigjson` | `imagePullSecrets` for private registries |
| `kubernetes.io/basic-auth` | `username`, `password` | convention |
| `kubernetes.io/ssh-auth` | `ssh-privatekey` | git over ssh |
| `kubernetes.io/service-account-token` | — | legacy long-lived SA tokens |
| `bootstrap.kubernetes.io/token` | — | kubeadm join |

```bash
kubectl create secret tls api-tls --cert=tls.crt --key=tls.key -n prod
kubectl create secret docker-registry regcred --docker-server=ghcr.io --docker-username=u --docker-password=$TOKEN
```
The TLS Secret **must live in the same namespace as the Ingress** that references it; otherwise the controller falls back to its default cert (browser warning).

### Security reality check
- `data` is **base64 = encoding, not encryption**. Anyone with `get secrets` RBAC (or etcd access) reads them. Also `kubectl auth can-i list secrets` — `list` reveals values too.
- Hardening ladder: (1) RBAC least privilege, (2) **encryption at rest** for etcd (`EncryptionConfiguration`, KMS provider), (3) mount as **files** (tmpfs, not in env/`ps`/crash dumps), (4) external store: **External Secrets Operator**, Secrets Store CSI driver (Vault / AWS Secrets Manager / Azure KV), **Sealed Secrets** / **SOPS** for GitOps, (5) rotate; short-lived creds (workload identity / IRSA) instead of static keys.
- Never commit raw Secret YAML. Env vars leak via logs and child processes; files are safer.
- Secret volume updates behave like ConfigMap (live, except `subPath`).

---

## 3. Volumes — the layers

```
Pod volume (what the pod sees)
   emptyDir | configMap | secret | projected | downwardAPI | hostPath | persistentVolumeClaim | csi …
```
- **emptyDir**: scratch space, lives and dies with the pod; `medium: Memory` ⇒ tmpfs (counts against memory limit); `sizeLimit` available.
- **hostPath**: node directory; security risk, breaks portability; OK for node agents.
- **projected**: merge several sources (secret + configMap + SA token) into one dir.
- **persistentVolumeClaim**: durable storage — below.

---

## 4. PV / PVC / StorageClass

```
Pod ──mounts──▶ PVC ──binds 1:1──▶ PV ──backed by──▶ disk (EBS, GCE PD, NFS, Ceph, local…)
                  │
                  └─ storageClassName ─▶ StorageClass ─(provisioner)─▶ creates PV on demand
```

| Object | Who creates | Scope | Meaning |
|---|---|---|---|
| **PersistentVolume** | admin or dynamic provisioner | cluster | an actual piece of storage |
| **PersistentVolumeClaim** | developer | namespace | "I need 10 Gi RWO" |
| **StorageClass** | admin | cluster | *how* to create volumes (provisioner, parameters, reclaim, binding mode, expansion) |

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata: { name: fast, annotations: { storageclass.kubernetes.io/is-default-class: "false" } }
provisioner: ebs.csi.aws.com
parameters: { type: gp3 }
reclaimPolicy: Delete                   # Delete | Retain
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer # delay provisioning until pod is scheduled → volume in the right zone
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: data }
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: fast                # "" = no dynamic provisioning; omitted = default class
  resources: { requests: { storage: 10Gi } }
```

### Access modes
| Mode | Meaning |
|---|---|
| `ReadWriteOnce` (RWO) | read-write by **one node** (many pods on that node can share) |
| `ReadWriteOncePod` (RWOP) | exactly **one pod** |
| `ReadOnlyMany` (ROX) | read-only by many nodes |
| `ReadWriteMany` (RWX) | read-write by many nodes — needs NFS/EFS/CephFS/Azure Files; **block disks (EBS/PD) can't** |

### Reclaim policy
- `Delete`: delete PVC ⇒ PV **and the cloud disk** are deleted (dynamic default).
- `Retain`: PV goes `Released`, data kept, must be manually reclaimed (clear `claimRef`). Use for precious data.

### Lifecycle & gotchas
- PVC states: `Pending` (no PV / waiting for first consumer — **normal with WaitForFirstConsumer**) → `Bound` → `Lost`.
- Deleting a PVC in use is blocked (`kubernetes.io/pvc-protection` finalizer) until pods stop using it.
- Zone affinity: an EBS volume is in one AZ; pod must schedule there → `WaitForFirstConsumer`, or "volume node affinity conflict" errors.
- **Expansion**: edit `spec.resources.requests.storage` upward (class needs `allowVolumeExpansion`); shrinking is not supported.
- **Snapshots / clones**: `VolumeSnapshot` + `VolumeSnapshotClass` (CSI). Basis for Velero/CSI backups.
- **CSI**: the plugin interface (controller + node plugin) replacing in-tree drivers; `kubectl get csidrivers,csinodes`.
- Ephemeral inline CSI / generic ephemeral volumes: per-pod PVC created and deleted with the pod.

---

## 5. StatefulSet storage
```yaml
spec:
  serviceName: db-headless          # stable DNS: db-0.db-headless.ns.svc
  replicas: 3
  podManagementPolicy: OrderedReady # or Parallel
  volumeClaimTemplates:
    - metadata: { name: data }
      spec: { accessModes: [ReadWriteOnce], resources: { requests: { storage: 20Gi } } }
```
- Creates PVCs `data-db-0`, `data-db-1`, … — **one per replica, sticky to the ordinal**; pod `db-1` always re-attaches `data-db-1`.
- Scaling down **does not delete PVCs** (data safety); control with `persistentVolumeClaimRetentionPolicy {whenDeleted, whenScaled}`.
- Ordered create (0→n), reverse delete; `updateStrategy.rollingUpdate.partition` for staged/canary updates.
