# Kubernetes YAML — Field-by-Field Explained

> How to read *any* manifest. Pair with `kubectl explain` (see §9) when you meet a field you don't know.

---

## 1. Anatomy — every object has the same four top-level keys

```yaml
apiVersion: apps/v1        # API group/version that defines this kind
kind: Deployment           # the resource type
metadata:                  # identity: name, namespace, labels, annotations
  name: api
spec:                      # DESIRED state (you write this)
status: {}                 # OBSERVED state (controllers write this; never put it in manifests)
```
(ConfigMap/Secret/RBAC roles have `data`/`rules` instead of `spec`.)

### apiVersion cheat-sheet
| Kind | apiVersion |
|---|---|
| Pod, Service, ConfigMap, Secret, Namespace, PVC, PV, ServiceAccount | `v1` |
| Deployment, ReplicaSet, StatefulSet, DaemonSet | `apps/v1` |
| Job, CronJob | `batch/v1` |
| Ingress, NetworkPolicy, IngressClass | `networking.k8s.io/v1` |
| Role, ClusterRole, (Cluster)RoleBinding | `rbac.authorization.k8s.io/v1` |
| StorageClass | `storage.k8s.io/v1` |
| HPA | `autoscaling/v2` |
| PodDisruptionBudget | `policy/v1` |
| Gateway, HTTPRoute | `gateway.networking.k8s.io/v1` |

`kubectl api-resources` lists kind ↔ group; `kubectl api-versions` lists what the cluster serves.

---

## 2. `metadata`

| Field | Meaning |
|---|---|
| `name` | unique per kind per namespace (DNS-1123: lowercase, digits, `-`, `.`) |
| `generateName` | server appends random suffix (`job-` → `job-x7k2p`); used with `kubectl create` |
| `namespace` | scope; omit → `default` (or your context's namespace) |
| `labels` | key/value for **selection** (see §3) |
| `annotations` | key/value for **non-identifying metadata** (see §4) |
| `ownerReferences` | set by controllers (ReplicaSet owns Pods); deleting owner garbage-collects children |
| `finalizers` | block deletion until a controller cleans up (stuck `Terminating` = finalizer waiting) |
| `uid`, `resourceVersion`, `creationTimestamp`, `generation` | server-set; don't write them. `resourceVersion` powers optimistic concurrency |

---

## 3. Labels & selectors — the glue of Kubernetes

Labels are how objects find each other. Nothing links by name except a few explicit refs (`secretName`, `serviceName`, `configMapKeyRef`).

```yaml
labels: { app: api, tier: backend, env: prod }
```
- **Equality selector** (Service, `matchLabels`): `app: api` — all pairs must match (AND).
- **Set-based** (`matchExpressions`): `{key: env, operator: In, values: [prod, staging]}`; operators `In, NotIn, Exists, DoesNotExist`.
- CLI: `kubectl get pods -l app=api,env!=dev`, `-l 'env in (prod,staging)'`.
- **Recommended labels**: `app.kubernetes.io/name`, `/instance`, `/version`, `/component`, `/part-of`, `/managed-by`.

### The Deployment triple that must agree
```yaml
spec:
  selector:
    matchLabels: { app: api }      # (1) which pods this Deployment owns — IMMUTABLE after create
  template:
    metadata:
      labels: { app: api }         # (2) labels stamped on pods — must satisfy (1)
```
and the Service `selector: {app: api}` (3) must match (2). A mismatch is the most common "my service has no endpoints" bug.

---

## 4. Annotations — what, why, who reads them

| | Labels | Annotations |
|---|---|---|
| Purpose | identify & select | attach arbitrary **non-identifying** data |
| Queryable by selector | **yes** | **no** |
| Value limits | ≤63 chars, restricted charset | up to 256 KB total, any string |
| Typical consumer | Services, controllers, `kubectl -l` | tools, controllers, humans |

Annotations are the **extension mechanism**: when the core spec has no field for something, a controller defines `domain/key: value` that it reads from objects it manages. Values are always **strings** (quote `"true"`, `"10"`).

### Common families
| Annotation | Reader | Effect |
|---|---|---|
| `nginx.ingress.kubernetes.io/rewrite-target: /$2` | ingress-nginx | rewrite path before forwarding |
| `nginx.ingress.kubernetes.io/ssl-redirect: "true"` | ingress-nginx | force HTTP→HTTPS |
| `nginx.ingress.kubernetes.io/proxy-body-size: "50m"` | ingress-nginx | raise upload limit (default 1m → `413`) |
| `nginx.ingress.kubernetes.io/proxy-read-timeout: "120"` | ingress-nginx | upstream timeout (`504` fix) |
| `nginx.ingress.kubernetes.io/canary: "true"`, `canary-weight: "20"` | ingress-nginx | canary traffic split |
| `cert-manager.io/cluster-issuer: letsencrypt-prod` | cert-manager | auto-create cert → fills `tls.secretName` |
| `service.beta.kubernetes.io/aws-load-balancer-type: nlb` | AWS cloud provider | choose NLB for LoadBalancer Service |
| `prometheus.io/scrape: "true"`, `prometheus.io/port: "9102"` | Prometheus (convention, SD config) | scrape this pod |
| `kubectl.kubernetes.io/last-applied-configuration` | `kubectl apply` | 3-way merge baseline |
| `deployment.kubernetes.io/revision: "3"` | Deployment controller | rollout revision (used by `rollout undo`) |
| `kubernetes.io/change-cause: "bump to v2"` | `kubectl rollout history` | human note per revision |
| `argocd.argoproj.io/sync-wave: "-1"` | Argo CD | ordering of sync |
| `checksum/config: <sha>` (Helm idiom) | you | change forces pod template change → rolling restart when ConfigMap changes |
| `storageclass.kubernetes.io/is-default-class: "true"` | PVC admission | default StorageClass |
| `ingressclass.kubernetes.io/is-default-class: "true"` | Ingress admission | default IngressClass |

**Pitfalls:** annotations are untyped and controller-specific → typos fail silently; they aren't portable between controllers (the motivation behind Gateway API); changing an annotation on a Deployment's *pod template* triggers a rollout, on the Deployment's own metadata it doesn't.

---

## 5. The Pod spec fields you'll meet constantly

```yaml
spec:
  serviceAccountName: api-sa          # identity used for API access (RBAC); token auto-mounted
  automountServiceAccountToken: false # don't mount the token if the app never calls the API
  nodeSelector: { disktype: ssd }
  tolerations: [{ key: gpu, operator: Exists, effect: NoSchedule }]
  affinity: {}                        # node/pod (anti-)affinity
  topologySpreadConstraints: []       # spread across zones/nodes
  priorityClassName: high
  terminationGracePeriodSeconds: 30   # SIGTERM → wait → SIGKILL
  restartPolicy: Always               # Always (Deployments) | OnFailure | Never (Jobs)
  dnsPolicy: ClusterFirst
  hostNetwork: false
  imagePullSecrets: [{ name: regcred }]
  initContainers: []                  # run to completion, in order, before app containers
  securityContext: { runAsNonRoot: true, fsGroup: 2000 }   # pod level
  containers:
    - name: app
      image: ghcr.io/acme/api:1.4.2   # pin tags/digests; avoid :latest
      imagePullPolicy: IfNotPresent   # Always | IfNotPresent | Never (default Always for :latest, else IfNotPresent)
      command: ["/app"]               # overrides image ENTRYPOINT
      args: ["--port=8080"]           # overrides image CMD
      workingDir: /srv
      ports: [{ name: http, containerPort: 8080 }]
      env:
        - { name: LOG_LEVEL, value: info }
        - name: DB_PASSWORD
          valueFrom: { secretKeyRef: { name: db, key: password } }
        - name: POD_IP
          valueFrom: { fieldRef: { fieldPath: status.podIP } }     # downward API
        - name: MEM_LIMIT
          valueFrom: { resourceFieldRef: { resource: limits.memory } }
      envFrom:
        - configMapRef: { name: app-config }   # every key → env var
        - secretRef: { name: app-secret }
      resources:
        requests: { cpu: 250m, memory: 256Mi }
        limits:   { memory: 512Mi }
      volumeMounts:
        - { name: cfg, mountPath: /etc/app, readOnly: true }
      livenessProbe: {}
      readinessProbe: {}
      startupProbe: {}
      lifecycle:
        preStop: { exec: { command: ["sleep", "5"] } }
      securityContext:                # container level (overrides pod level)
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities: { drop: ["ALL"] }
  volumes:
    - name: cfg
      configMap: { name: app-config }
```

Notes:
- `command` ≙ Docker `ENTRYPOINT`, `args` ≙ `CMD`. Setting `command` discards the image's `CMD` too.
- `env` `$(VAR)` expansion works in `command/args`/`env.value`, not in a shell sense.
- `limits.cpu` causes throttling; many teams set only memory limits + CPU requests.
- Pod-level `securityContext` has `runAsUser, runAsGroup, runAsNonRoot, fsGroup, seccompProfile, sysctls`; container-level has `privileged, capabilities, readOnlyRootFilesystem, allowPrivilegeEscalation`.

---

## 6. Deployment spec fields

```yaml
spec:
  replicas: 3
  revisionHistoryLimit: 10        # old ReplicaSets kept for rollback
  minReadySeconds: 5              # pod must be Ready this long to count as available
  progressDeadlineSeconds: 600    # mark rollout Failed after this
  strategy:
    type: RollingUpdate           # or Recreate (kill all, then create)
    rollingUpdate: { maxSurge: 25%, maxUnavailable: 0 }
  selector: { matchLabels: { app: api } }
  template: { ... pod template ... }
```
- `maxSurge`: extra pods above `replicas` during rollout. `maxUnavailable`: how many may be down. `0` + surge ≥1 = zero-downtime (requires working readiness probe).

---

## 7. Ingress fields (cross-ref)

```yaml
spec:
  ingressClassName: nginx          # which controller handles this (replaces old annotation)
  tls:
    - hosts: [api.example.com]
      secretName: api-tls          # kubernetes.io/tls Secret with tls.crt + tls.key, SAME namespace as the Ingress
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /v1
            pathType: Prefix       # Exact | Prefix | ImplementationSpecific
            backend:
              service: { name: api, port: { number: 80 } }   # Service `port`, not targetPort
```
- **`secretName`**: a *reference by name* to a Secret; contains `tls.crt` (cert + chain) and `tls.key` (private key). Controller loads it and serves it via SNI for `hosts`. Omit `secretName` → controller's default/fake cert. cert-manager can create it for you. Full detail: [Ingress deep dive §4](../../Service%20Mesh/kubernetes-ingress-deep-dive.md).
- **TLS termination**: TLS ends at the ingress controller; traffic to pods is plain HTTP (unless you re-encrypt with backend-protocol annotations or a mesh).
- **`pathType`**: `Exact` = `/foo` only. `Prefix` = element-wise prefix: `/foo` matches `/foo`, `/foo/`, `/foo/bar` but **not** `/foobar`; longest match wins. `ImplementationSpecific` = controller decides (regex etc.).

---

## 8. Other fields people ask about
| Field | Where | Meaning |
|---|---|---|
| `selector.matchLabels` | Deployment/StatefulSet/Job | ownership selector (immutable) |
| `serviceName` | StatefulSet | headless Service providing stable pod DNS |
| `volumeClaimTemplates` | StatefulSet | one PVC per replica |
| `schedule`, `concurrencyPolicy`, `startingDeadlineSeconds` | CronJob | cron string; `Allow/Forbid/Replace` |
| `backoffLimit`, `completions`, `parallelism`, `ttlSecondsAfterFinished` | Job | retries / fan-out / auto-cleanup |
| `type: Opaque / kubernetes.io/tls / kubernetes.io/dockerconfigjson` | Secret | validates required keys |
| `stringData` vs `data` | Secret | `stringData` plain text (write-only convenience); `data` base64 |
| `immutable: true` | ConfigMap/Secret | can't be changed; cheaper for kube-apiserver |
| `accessModes`, `storageClassName`, `resources.requests.storage` | PVC | see [storage note](04-storage-config-secrets.md) |
| `subjects`, `roleRef` | RoleBinding | who gets which Role |

---

## 9. Learn fields yourself — don't memorise
```bash
kubectl explain pod.spec.containers.livenessProbe --recursive | less
kubectl explain ingress.spec.tls
kubectl get deploy api -o yaml                  # see defaults the API server filled in
kubectl apply --dry-run=server -f x.yaml        # validate against the real API
kubectl diff -f x.yaml
```
`base64` reminder: `echo -n 'pw' | base64` (the `-n` matters); Secret values are **encoded, not encrypted** — enable etcd encryption at rest and restrict RBAC.
