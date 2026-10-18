# Cluster Operations: kubeadm, etcd Backup & Restore, Upgrades, Certificates, Static Pods, Nodes & Audit

> Part of the [Kubernetes deep dives](./README.md). Previous: [Extending Kubernetes](./10-extending-kubernetes.md). Next: [Security Hardening](./12-security-hardening.md).
>
> The output is real, from a v1.37 kubeadm-based minikube node (containerd 2.3, etcd 3.7). Minikube keeps its PKI in `/var/lib/minikube/certs`, whereas a plain kubeadm cluster uses `/etc/kubernetes/pki`. The paths are otherwise identical. The [CKA notes](../../CKA/README.md) have the 40-day exam-style walk-through. This page is the operational *why*.

On managed Kubernetes (EKS, GKE, AKS), the provider handles etcd, the control plane and certificates. **You still own** node upgrades, add-on versions, workload backups and API deprecations. Everything here applies to self-managed clusters, and most of it to managed ones too.

---

## 1. What lives where on a control-plane node

```text
/etc/kubernetes/
├── manifests/                 ← STATIC POD manifests (kubelet runs these directly)
│   ├── etcd.yaml
│   ├── kube-apiserver.yaml
│   ├── kube-controller-manager.yaml
│   └── kube-scheduler.yaml
├── pki/  (minikube: /var/lib/minikube/certs)   ← CAs, component certs, SA signing keys
├── admin.conf  super-admin.conf  controller-manager.conf  scheduler.conf  kubelet.conf
/var/lib/kubelet/config.yaml   ← KubeletConfiguration
/var/lib/kubelet/pki/          ← kubelet client/serving certs (auto-rotated)
/var/lib/etcd/  (minikube: /var/lib/minikube/etcd)   ← etcd data dir — THE cluster
/var/log/pods/<ns>_<pod>_<uid>/<container>/0.log      ← container logs (symlinked from /var/log/containers)
```

### Static Pods
```text
$ ls /etc/kubernetes/manifests
etcd.yaml  kube-apiserver.yaml  kube-controller-manager.yaml  kube-scheduler.yaml
$ grep staticPodPath /var/lib/kubelet/config.yaml
staticPodPath: /etc/kubernetes/manifests
```
- The kubelet **watches that directory**. Drop a file in and the Pod starts. Edit it and the Pod restarts. Delete it and the Pod stops. No apiserver is involved, which is how the apiserver itself can run as a Pod.
- What you see in the API (`kube-apiserver-k8slab`) is a read-only **mirror Pod**. `kubectl delete` on it is pointless, because the kubelet recreates it.
- **Changing control-plane flags means editing the manifest.** Real example from this lab, adding audit logging and encryption at rest:
  ```text
  edit /etc/kubernetes/manifests/kube-apiserver.yaml  (flags + volumeMounts + hostPath volumes)
  → kubelet restarted the apiserver; /readyz OK after ~37s
  ```
  A typo here means **no apiserver**, and `kubectl` stops working. Always `cp` a backup first. Debug with `crictl ps -a | grep apiserver` and `crictl logs <id>` on the node, and check `journalctl -u kubelet`.

---

## 2. kubeadm in one page

```bash
# control plane (first node)
kubeadm init --control-plane-endpoint "k8s-api.example.com:6443" --upload-certs \
  --pod-network-cidr 10.244.0.0/16 --kubernetes-version v1.37.0
# → install a CNI immediately (nodes NotReady until then)

# join workers / extra control-plane nodes (tokens expire in 24h)
kubeadm token create --print-join-command
kubeadm join k8s-api.example.com:6443 --token ... --discovery-token-ca-cert-hash sha256:...
kubeadm join ... --control-plane --certificate-key ...      # HA control plane

kubeadm reset                                                  # tear a node down
```

`kubeadm init` runs in phases: preflight → certs → kubeconfig → kubelet-start → control-plane (writes the static manifests) → etcd → upload-config → mark-control-plane (taint) → bootstrap-token → addons (CoreDNS, kube-proxy). You can run any phase alone with `kubeadm init phase <name>`, which is handy for regenerating one cert or one manifest.

Node prerequisites: swap configured (kubelet tolerates swap only when `failSwapOn: false` / `memorySwap`), `br_netfilter` + `net.ipv4.ip_forward=1`, a container runtime with **the same cgroup driver as the kubelet** (`systemd` on systemd hosts. A mismatch causes kubelet crash loops), unique hostnames, MAC addresses and product UUIDs, and ports 6443, 2379-2380, 10250 open.

---

## 3. etcd backup and restore

**An etcd snapshot is a backup of the whole cluster state**: every object, Secret, RBAC rule and CRD. It does *not* include PV data or container images.

### Backup (real)
```bash
ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /backup/etcd-$(date +%F-%H%M).db
```
```text
Snapshot saved at /var/lib/minikube/etcd/snap.db
Server version 3.7.0

$ etcdutl snapshot status snap.db -w table
| HASH     | REVISION | TOTAL KEYS | TOTAL SIZE | VERSION |
| 956b3790 |    15091 |        344 |     4.2 MB |   3.7.0 |
```
- `etcdctl` talks to a live member. **`etcdutl`** works on files offline (`status`, `restore`, `defrag`). `etcdctl snapshot restore/status` are deprecated in favour of etcdutl.
- **Find the cert paths** in `/etc/kubernetes/manifests/etcd.yaml` (`--cert-file`, `--key-file`, `--trusted-ca-file`). That's exactly what the CKA exam expects you to do.
- Automate it with a CronJob or systemd timer: snapshot → encrypt → copy **off the cluster** (S3 with Object Lock) → alert on failure → **test restores regularly**.
- **Snapshots contain every Secret**, in plaintext unless encryption at rest is on (§9). Protect them like root credentials.

### Restore (real, into a separate data dir)
```bash
etcdutl snapshot restore /backup/etcd.db --data-dir /var/lib/etcd-restore
```
```text
restored snapshot {"path": ".../snap.db", "wal-dir": ".../restore-test/member/wal", "data-dir": ".../restore-test", ...}
```
Then switch etcd over to it:
1. Stop the apiservers (move `kube-apiserver.yaml` out of `manifests/`) so nothing writes during the swap.
2. Edit `etcd.yaml`: change the `hostPath` of the `etcd-data` volume (or `--data-dir`) to `/var/lib/etcd-restore`.
3. The kubelet restarts etcd on the restored data. Then put the apiserver manifest back.
4. Restart the kubelet, controllers and scheduler if they cache stale state. Check with `kubectl get nodes,pods -A`.

**Multi-member clusters:** restore the *same* snapshot on **every** member with `--name`, `--initial-cluster`, `--initial-advertise-peer-urls` and a **new `--initial-cluster-token`**, so the restored cluster can't join the old one.

What a restore means operationally: everything created after the snapshot is gone *from the API*, but **may still exist in reality** (cloud LBs, PVs, running containers on nodes). Controllers reconcile from the restored state, so Pods may be recreated, and orphans need cleaning up. For workload-level restores, Velero is usually the better tool ([page 14](./14-advanced-workloads-and-multitenancy.md#8-backup-and-dr-with-velero)).

> The etcd container image is **distroless**. `kubectl exec etcd-x -- ls` fails with `exec: "ls": executable file not found`. Only `etcd`, `etcdctl` and `etcdutl` are in it.

### etcd health and maintenance
```bash
etcdctl member list -w table          # 1 member here: 8688e899f7831fc7 started k8slab
etcdctl endpoint status -w table      # leader, DB size, raft index
etcdctl endpoint health --cluster
etcdctl alarm list                    # NOSPACE → cluster read-only
etcdctl defrag --cluster              # reclaim space after compaction (one member at a time in prod)
```
Metrics worth alerting on: `etcd_server_has_leader`, `etcd_server_leader_changes_seen_total`, `etcd_disk_wal_fsync_duration_seconds` (p99 should stay under 10 ms), `etcd_mvcc_db_total_size_in_bytes` vs quota.

---

## 4. Certificates

```text
$ kubeadm certs check-expiration
CERTIFICATE                EXPIRES                  RESIDUAL TIME   CERTIFICATE AUTHORITY
admin.conf                 Oct 18, 2027 16:15 UTC   364d            ca
apiserver                  Oct 17, 2029 16:15 UTC   2y364d          ca           ← minikube issues 3y; kubeadm default 1y
apiserver-etcd-client      Oct 18, 2027 16:15 UTC   364d            etcd-ca
apiserver-kubelet-client   Oct 18, 2027 16:15 UTC   364d            ca
controller-manager.conf    Oct 18, 2027 16:15 UTC   364d            ca
etcd-peer / etcd-server / etcd-healthcheck-client   364d            etcd-ca
front-proxy-client         Oct 18, 2027 16:15 UTC   364d            front-proxy-ca
scheduler.conf / super-admin.conf                   364d            ca
CERTIFICATE AUTHORITY   EXPIRES                  RESIDUAL TIME
ca / etcd-ca / front-proxy-ca                    9y   (10-year CAs)
```

| PKI | Signs | Used for |
|---|---|---|
| `ca` | apiserver serving cert, admin/controller/scheduler client certs, kubelet client certs | Everything talking to the apiserver |
| `etcd-ca` | etcd server, peer, healthcheck, `apiserver-etcd-client` | etcd mTLS |
| `front-proxy-ca` | `front-proxy-client` | apiserver → aggregated APIs |
| `sa.key`/`sa.pub` (key pair, not a CA) | ServiceAccount JWTs | Pod identity |

**The 1-year expiry is the most famous self-managed outage.** After 365 days the apiserver, controllers and scheduler can't authenticate, and the cluster "suddenly" breaks. Defences:
- `kubeadm upgrade apply` **renews all certs automatically**, so upgrading at least yearly avoids the problem.
- Or run `kubeadm certs renew all`, then restart the control-plane static Pods (move the manifests out and back in) so they load the new certs. Update `~/.kube/config` from the new `admin.conf`.
- Monitor expiry (`kubeadm certs check-expiration` in a cron, or x509 exporter metrics).
- **Kubelet certs** auto-rotate (`rotateCertificates: true` is in the lab config). Serving-cert rotation needs `serverTLSBootstrap: true` plus approving CSRs (`kubectl get csr`, `kubectl certificate approve`).
- Rotating the CAs themselves is a multi-step, risky procedure. Plan for 10-year CAs.

Creating a user certificate the Kubernetes way:
```bash
openssl req -new -newkey rsa:4096 -nodes -keyout jane.key -subj "/CN=jane/O=dev-team" -out jane.csr
cat <<EOF | kubectl apply -f -
apiVersion: certificates.k8s.io/v1
kind: CertificateSigningRequest
metadata: { name: jane }
spec:
  request: $(base64 < jane.csr | tr -d '\n')
  signerName: kubernetes.io/kube-apiserver-client
  expirationSeconds: 86400
  usages: [client auth]
EOF
kubectl certificate approve jane
kubectl get csr jane -o jsonpath='{.status.certificate}' | base64 -d > jane.crt
```
(Certificates can't be revoked. Prefer OIDC for humans, and keep cert lifetimes short.)

---

## 5. Upgrades

### Version skew policy (memorise it)
| Component | Allowed relative to kube-apiserver (X) |
|---|---|
| Other apiservers in HA | X or X-1 (during the upgrade) |
| controller-manager, scheduler, cloud-controller-manager | X to X-1 (never newer) |
| **kubelet / kube-proxy** | X to **X-3** (never newer than the apiserver) |
| kubectl | X+1 to X-1 |

That gives you the order: **control plane first, one minor at a time (1.35 → 1.36 → 1.37, never skip), then nodes.** Because kubelets may lag by three minors, nodes can be upgraded later, but never *before* the control plane.

### kubeadm upgrade procedure
```bash
# 0. Read the release notes (API removals!), back up etcd, check add-ons (CNI, CSI, ingress) support the target version
kubectl get --raw /metrics | grep apiserver_requested_deprecated_apis     # what still calls removed APIs
pluto detect-all-in-cluster                                                # or kubent

# 1. first control-plane node
apt-mark unhold kubeadm && apt-get install -y kubeadm=1.37.x-* && apt-mark hold kubeadm
kubeadm upgrade plan
kubeadm upgrade apply v1.37.x            # rewrites static manifests, renews certs, upgrades CoreDNS/kube-proxy
kubectl drain cp-1 --ignore-daemonsets
apt-get install -y kubelet=1.37.x-* kubectl=1.37.x-* && systemctl daemon-reload && systemctl restart kubelet
kubectl uncordon cp-1

# 2. other control-plane nodes
kubeadm upgrade node                     # (not "apply")
# drain → kubelet/kubectl → restart → uncordon

# 3. workers, one (or a batch) at a time
kubectl drain worker-1 --ignore-daemonsets --delete-emptydir-data
# on the node: upgrade kubeadm; kubeadm upgrade node; upgrade kubelet; restart
kubectl uncordon worker-1
```

### Managed and immutable patterns
- **EKS/GKE/AKS:** upgrade the control plane (one click or IaC), then roll node groups or let Karpenter replace drifted nodes. GKE and AKS have release channels and auto-upgrade with maintenance windows.
- **Immutable nodes** (the best practice): don't upgrade nodes in place. Bring up new nodes with the new version and drain the old ones (Karpenter drift, ASG instance refresh, Cluster API `MachineDeployment` rollout).
- **Blue/green clusters** for big jumps or risky add-on changes: build a new cluster, shift traffic over DNS or the LB. This needs GitOps so the new cluster is reproducible.

What usually breaks: removed API versions in manifests and Helm charts, CNI/CSI/ingress versions that don't support the new Kubernetes, webhooks rejecting new fields, PDBs that block drains, and deprecated kubelet flags.

---

## 6. Node operations, the kubelet and the container runtime

### Kubelet config (real, lab)
```yaml
cgroupDriver: cgroupfs          # minikube; production systemd hosts use systemd (must match containerd)
staticPodPath: /etc/kubernetes/manifests
rotateCertificates: true
imageGCHighThresholdPercent: 100   # minikube DISABLES image GC; default 85
imageMinimumGCAge: 0s
evictionHard: {}                   # minikube disables; defaults: memory.available<100Mi, nodefs<10%, imagefs<15%
```
Other settings that matter in production: `maxPods`, `kubeReserved`/`systemReserved` (protect the OS and kubelet, see allocatable in [page 08](./08-scheduling-in-depth.md#9-resources-requests-limits-allocatable-overcommit)), `containerLogMaxSize` (default 10Mi) and `containerLogMaxFiles` (5), `shutdownGracePeriod` (graceful node shutdown), `serializeImagePulls`, and `featureGates`.

### Image garbage collection
- When disk usage passes `imageGCHighThresholdPercent` (85%), the kubelet deletes **unused** images, least recently used first, until usage drops below `imageGCLowThresholdPercent` (80%). Images younger than `imageMinimumGCAge` are skipped, and `imageMaximumGCAge` (if set) removes old unused images regardless of disk usage.
- Dead containers are also garbage-collected.
- If GC can't free enough, you get `DiskPressure` → `NoSchedule` taint → evictions ([page 08 §10](./08-scheduling-in-depth.md#10-node-pressure-eviction-the-kubelet-not-the-scheduler)).

### Container logs and rotation
```text
/var/log/pods/ext_ok-6b4f87fd94-fl9z8_faebed3b-.../nginx/0.log      ← real file (ns_pod_uid/container/restart#.log)
/var/log/containers/coredns-..._kube-system_coredns-<id>.log         ← symlinks (what log agents tail)
```
- The kubelet rotates logs at `containerLogMaxSize`, keeping `containerLogMaxFiles`. `kubectl logs` only reads the **current** file (`--previous` reads the last terminated container).
- Logs are lost when the Pod is deleted, so ship them with a DaemonSet (Fluent Bit, Vector, the OTel collector). See [page 13](./13-observability-and-troubleshooting.md).

### crictl: talking to the runtime directly
`docker` doesn't exist on modern nodes. Use `crictl`, which speaks CRI to containerd or CRI-O:
```text
$ sudo crictl ps --name kube-apiserver
CONTAINER       IMAGE           CREATED       STATE     NAME             ATTEMPT   POD ID          POD
1ea7b8a73631c   6003d52023b9d   5 hours ago   Running   kube-apiserver   0         cc850dec5ae32   kube-apiserver-k8slab
$ sudo crictl images
docker.io/kindest/kindnetd   v20250512-df8de77b   b1a8c6f707935   40.6MB
docker.io/library/busybox    1.36                 b7c873bd97bdc   1.91MB
```
```bash
crictl pods                       # pod sandboxes
crictl ps -a                      # include exited (find crashed control-plane containers!)
crictl logs <container-id>        # works even when the apiserver is down
crictl inspect <id> | jq .info.pid
crictl pull nginx:1.27            # test registry auth from the node
crictl rmi --prune                # remove unused images
crictl stats                      # per-container CPU/mem
nerdctl / ctr -n k8s.io ...       # lower-level containerd tools (images live in the k8s.io namespace)
```

### Kubelet troubleshooting
```bash
systemctl status kubelet
journalctl -u kubelet -f --since "10 min ago"
# common: "failed to run Kubelet: misconfiguration: kubelet cgroup driver: systemd is different from docker cgroup driver: cgroupfs"
#         "x509: certificate has expired"  ·  "node not found" (hostname/cloud-provider mismatch)  ·  swap enabled
#         "container runtime network not ready: cni config uninitialized"  (no CNI)
```

### Node lifecycle commands
```bash
kubectl cordon / drain / uncordon NODE          # see page 08 §11
kubectl delete node NODE                        # after the VM is gone (cloud controllers do this automatically)
kubectl label node NODE node-role.kubernetes.io/worker=
kubectl get nodes -o wide; kubectl describe node NODE   # Conditions, Taints, Allocated resources, Events
```

---

## 7. Audit logging

The apiserver can record **who did what, when, from where** for every request. It's essential for incident response and compliance. (It's off by default on kubeadm. On managed clusters you enable control-plane logs.)

### Policy used in the lab
```yaml
apiVersion: audit.k8s.io/v1
kind: Policy
omitStages: [RequestReceived]          # log once per request, at completion
rules:                                  # FIRST matching rule wins → put exclusions first
  - level: None                         # drop noise
    users: ["system:kube-proxy"]
  - level: None
    nonResourceURLs: ["/healthz*", "/livez*", "/readyz*", "/version"]
  - level: None
    resources: [{ group: "coordination.k8s.io", resources: ["leases"] }]   # heartbeats = huge volume
  - level: Metadata                     # secrets/configmaps: WHO accessed, never the content
    resources: [{ group: "", resources: ["secrets", "configmaps"] }]
  - level: RequestResponse              # full bodies for sensitive changes
    verbs: ["create", "update", "patch", "delete"]
    resources: [{ group: "apps", resources: ["deployments"] }, { group: "rbac.authorization.k8s.io" }]
  - level: Metadata                     # everything else
```
apiserver flags: `--audit-policy-file`, `--audit-log-path`, `--audit-log-maxage=7`, `--audit-log-maxbackup=3`, `--audit-log-maxsize=100`. You can also use `--audit-webhook-config-file` to stream events to a SIEM.

### Real events
```json
{"level":"RequestResponse","stage":"ResponseComplete","verb":"create",
 "requestURI":"/apis/apps/v1/namespaces/ext/deployments?fieldManager=kubectl-create&fieldValidation=Strict",
 "user":{"username":"minikube-user","groups":["system:masters","system:authenticated"]},
 "sourceIPs":["192.168.67.1"],"userAgent":"kubectl/v1.37.1 (darwin/arm64)",
 "objectRef":{"resource":"deployments","namespace":"ext","name":"audited","apiGroup":"apps"},
 "responseStatus":{"code":201}}                 has requestObject: True | responseObject: True

{"level":"Metadata","verb":"get","requestURI":"/api/v1/namespaces/ext/secrets/enc-test",
 "user":{"username":"minikube-user",...},"objectRef":{"resource":"secrets","name":"enc-test"},
 "responseStatus":{"code":200}}                 has requestObject: False | responseObject: False   ← secret value NOT logged
```
| Level | Logged |
|---|---|
| `None` | Nothing |
| `Metadata` | User, verb, resource, source IP, user agent, response code |
| `Request` | + request body |
| `RequestResponse` | + response body |

Rules: **never log Secrets above `Metadata`** (or you've copied every secret into your log pipeline). Drop leases and health checks or the volume explodes. Ship the logs off-node, and alert on `create` of `clusterrolebindings`, `pods/exec` in prod, and `secrets` `list` by unusual users.

---

## 8. HA, sizing and day-2 checklist

- [ ] 3 (or 5) control-plane nodes across AZs, apiserver behind an LB, etcd on SSDs, latency between members under 10 ms
- [ ] Automated, encrypted, **off-cluster** etcd snapshots, plus a restore drill each quarter
- [ ] Cert expiry monitored. Upgrades at least yearly (which renews the certs)
- [ ] Upgrade runbook: deprecated-API scan → etcd backup → control plane one minor at a time → add-ons → nodes (immutable replacement)
- [ ] Static Pod manifest changes go through config management (Ansible / Cluster API / kubeadm config), with backups
- [ ] kubelet: `kubeReserved`/`systemReserved`, eviction thresholds, image GC, log rotation, `systemd` cgroup driver matching containerd
- [ ] Audit logging with a sane policy, shipped to a SIEM
- [ ] Encryption at rest for Secrets (next page)
- [ ] `crictl` and `journalctl -u kubelet` in every on-call engineer's muscle memory

Next: [Security Hardening →](./12-security-hardening.md)
