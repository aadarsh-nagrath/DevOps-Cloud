# Security: RBAC, ServiceAccounts, NetworkPolicy, Pod Security — In Depth

> Extends [k8s-learning-path §15, §18, §28](../k8s-learning-path.md).

---

## 1. How an API request is processed
```
kubectl / pod / controller
  → Authentication  (who are you? cert, OIDC token, ServiceAccount JWT)
  → Authorization   (may you do this? RBAC)
  → Admission       (mutating → schema validation → validating; PSA, quotas, webhooks, Kyverno/OPA)
  → etcd
```
Authn establishes identity only; **Kubernetes has no User object** — users come from certs/OIDC. RBAC is **additive** (no deny rules).

---

## 2. RBAC

| Object | Scope | Defines |
|---|---|---|
| `Role` | namespace | permitted verbs on resources in one namespace |
| `ClusterRole` | cluster | same, for cluster-scoped resources or all namespaces; also reusable template |
| `RoleBinding` | namespace | binds Role **or ClusterRole** to subjects *within that namespace* |
| `ClusterRoleBinding` | cluster | grants ClusterRole across **all** namespaces |

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { name: pod-reader, namespace: dev }
rules:
  - apiGroups: [""]                 # "" = core group; "apps", "batch", …
    resources: ["pods", "pods/log"] # sub-resources are separate
    verbs: ["get", "list", "watch"] # get list watch create update patch delete deletecollection; also exec = pods/exec "create"
    # resourceNames: ["only-this-pod"]
---
kind: RoleBinding
metadata: { name: read-pods, namespace: dev }
subjects:
  - { kind: User, name: alice, apiGroup: rbac.authorization.k8s.io }
  - { kind: Group, name: dev-team, apiGroup: rbac.authorization.k8s.io }
  - { kind: ServiceAccount, name: ci, namespace: dev }
roleRef: { kind: Role, name: pod-reader, apiGroup: rbac.authorization.k8s.io }   # immutable
```
```bash
kubectl auth can-i delete pods -n dev --as alice
kubectl auth can-i --list --as system:serviceaccount:dev:ci
kubectl create rolebinding … ; kubectl get clusterrole cluster-admin -o yaml
```
**Dangerous permissions** (treat as near-admin): `*` verbs/resources, `secrets` get/list, `pods/exec`, `create pods` (can mount any secret/hostPath), `impersonate`, `bind`/`escalate` on roles, `nodes/proxy`, `create` on `serviceaccounts/token`.
Built-in ClusterRoles: `cluster-admin`, `admin` (namespace admin), `edit`, `view`. Aggregation labels let CRDs extend them.

---

## 3. ServiceAccounts
- Identity for **pods** talking to the API. Every namespace has `default` SA — don't use it for workloads; create one per app, grant least privilege.
- Token is a **projected, short-lived, audience-bound JWT** (auto-rotated) mounted at `/var/run/secrets/kubernetes.io/serviceaccount/`. Legacy never-expiring token Secrets are no longer auto-created (≥1.24).
- `automountServiceAccountToken: false` on SA or pod if the app doesn't call the API.
- **Workload identity to cloud**: annotate SA to assume a cloud role (AWS IRSA `eks.amazonaws.com/role-arn`, GKE Workload Identity `iam.gke.io/gcp-service-account`, Azure `azure.workload.identity/client-id`) — no static cloud keys in Secrets.
- `kubectl create token <sa> --duration=1h` mints a temporary token.

---

## 4. NetworkPolicy
By default **all pods can talk to all pods**. A NetworkPolicy selects pods and, once any policy selects a pod for a direction, that direction becomes **default-deny** except what policies allow (rules are additive/union).

**Requires a CNI that enforces it** (Calico, Cilium, Antrea…). Flannel alone silently ignores NetworkPolicy; the object is accepted anyway.

```yaml
# 1. Deny all ingress to every pod in namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny, namespace: prod }
spec:
  podSelector: {}            # {} = all pods
  policyTypes: [Ingress, Egress]
---
# 2. Allow only the ingress controller → api on 8080, and api → db on 5432 + DNS
kind: NetworkPolicy
metadata: { name: api, namespace: prod }
spec:
  podSelector: { matchLabels: { app: api } }
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: ingress-nginx } }
          podSelector: { matchLabels: { app.kubernetes.io/name: ingress-nginx } }   # same list item = AND
      ports: [{ protocol: TCP, port: 8080 }]
  egress:
    - to: [{ podSelector: { matchLabels: { app: db } } }]
      ports: [{ port: 5432 }]
    - to: [{ namespaceSelector: {} , podSelector: { matchLabels: { k8s-app: kube-dns } } }]
      ports: [{ protocol: UDP, port: 53 }, { protocol: TCP, port: 53 }]
```
Gotchas:
- `from: [ {namespaceSelector}, {podSelector} ]` as **two list items = OR**; both keys in **one item = AND**. Classic mistake.
- Default-deny egress **breaks DNS** — always allow port 53 to kube-dns.
- `ipBlock` with `except` for CIDRs (external IPs). Policies are L3/L4 only; L7 (HTTP path/method) needs Cilium L7 policy or a mesh `AuthorizationPolicy`.
- Probes from kubelet and node-local traffic are usually allowed regardless of the policy (CNI-dependent).
- Ingress controllers need allow rules too once you default-deny the app namespace.

---

## 5. Pod hardening
```yaml
securityContext:           # pod
  runAsNonRoot: true
  runAsUser: 10001
  fsGroup: 10001           # group ownership applied to mounted volumes
  seccompProfile: { type: RuntimeDefault }
containers:
  - securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true      # mount emptyDir for /tmp
      capabilities: { drop: ["ALL"] }   # add back only e.g. NET_BIND_SERVICE
      # privileged: true  ← avoid
```
**Pod Security Admission** (replaced PodSecurityPolicy, removed 1.25): namespace labels choose a profile and mode:
```bash
kubectl label ns prod pod-security.kubernetes.io/enforce=restricted \
                      pod-security.kubernetes.io/warn=restricted
```
Profiles: `privileged` (anything) → `baseline` (blocks known escalations: hostNetwork, privileged, hostPath…) → `restricted` (non-root, drop ALL caps, seccomp). Modes: `enforce`, `audit`, `warn`. For finer policy use **Kyverno** or **OPA Gatekeeper** / ValidatingAdmissionPolicy (CEL, built in).

---

## 6. Supply chain & runtime checklist
- Pin images by digest; scan (Trivy/Grype); sign & verify (cosign + admission policy); minimal/distroless bases.
- Private registry creds via `imagePullSecrets` (type `kubernetes.io/dockerconfigjson`).
- Secrets: encryption at rest, external secret managers (see [04 §2](04-storage-config-secrets.md)).
- Audit logging on the apiserver; restrict kubelet (`--anonymous-auth=false`, authorization Webhook); protect etcd (mTLS, network-isolated, backed up).
- Runtime detection: Falco/Tetragon; sandboxed runtimes (gVisor/Kata) via `RuntimeClass` for untrusted workloads.
- CIS benchmark: `kube-bench`. Control-plane/worker network paths locked down; API server not public if avoidable.

## 7. TLS inside the cluster (don't confuse with Ingress TLS)
- Control-plane components talk over mTLS using a cluster CA (kubeadm: `/etc/kubernetes/pki`, certs valid 1 y — `kubeadm certs check-expiration`; renewed on upgrade).
- **Ingress TLS** = north-south, user-facing cert (`tls.secretName`, cert-manager).
- **Service-mesh mTLS** = east-west pod-to-pod, certs issued per workload identity (SPIFFE) by the mesh CA.
- **Admission webhooks** need a CA bundle the apiserver trusts (cert-manager `cainjector` automates it).
