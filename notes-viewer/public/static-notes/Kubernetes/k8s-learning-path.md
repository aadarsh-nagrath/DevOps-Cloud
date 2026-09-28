# Kubernetes: Beginner → Intermediate → Advanced (Learning & Revision Notes)

> This file is structured as a progressive learning path. For deep dives on specific topics already covered elsewhere in this folder, see: [kubernetes.md](kubernetes.md) (core concepts), [K-pods.md](K-pods.md) (pod internals), [Networking.md](Networking.md) (networking deep dive), [k8-doubts.md](k8-doubts.md) (Q&A style clarifications), [helmVkustomize.md](helmVkustomize.md), [good-practice-networking.md](good-practice-networking.md).

---

## Table of Contents

**BEGINNER**
1. [What is Kubernetes & Why](#1-what-is-kubernetes--why)
2. [Architecture Overview](#2-architecture-overview)
3. [Core Objects: Pods, ReplicaSets, Deployments](#3-core-objects-pods-replicasets-deployments)
4. [Services & Basic Networking](#4-services--basic-networking)
5. [ConfigMaps & Secrets](#5-configmaps--secrets)
6. [Namespaces & Labels/Selectors](#6-namespaces--labelsselectors)
7. [kubectl Essentials](#7-kubectl-essentials)

**INTERMEDIATE**
8. [Volumes & Persistent Storage](#8-volumes--persistent-storage)
9. [Ingress & External Access](#9-ingress--external-access)
10. [StatefulSets, DaemonSets, Jobs, CronJobs](#10-statefulsets-daemonsets-jobs-cronjobs)
11. [Health Checks & Probes](#11-health-checks--probes)
12. [Resource Management: Requests, Limits, QoS](#12-resource-management-requests-limits-qos)
13. [Autoscaling (HPA/VPA/Cluster Autoscaler)](#13-autoscaling-hpavpacluster-autoscaler)
14. [Helm Basics](#14-helm-basics)
15. [RBAC & Service Accounts](#15-rbac--service-accounts)

**ADVANCED**
16. [Scheduling: Affinity, Taints, Priority](#16-scheduling-affinity-taints-priority)
17. [Networking Deep Dive: CNI, kube-proxy, DNS](#17-networking-deep-dive-cni-kube-proxy-dns)
18. [Network Policies & Security](#18-network-policies--security)
19. [Custom Resources & Operators](#19-custom-resources--operators)
20. [Multi-container Pod Patterns](#20-multi-container-pod-patterns)
21. [Cluster Internals: etcd, API Server, Controller Manager](#21-cluster-internals-etcd-api-server-controller-manager)
22. [Observability: Logging, Metrics, Tracing](#22-observability-logging-metrics-tracing)
23. [Troubleshooting Playbook](#23-troubleshooting-playbook)
24. [Production Best Practices Checklist](#24-production-best-practices-checklist)
25. [Quick-Revision Cheat Sheet](#25-quick-revision-cheat-sheet)

**MORE TOPICS YOU WERE MISSING**
26. [PodDisruptionBudgets & Voluntary Disruptions](#26-poddisruptionbudgets--voluntary-disruptions)
27. [Owner References, Garbage Collection & Finalizers](#27-owner-references-garbage-collection--finalizers)
28. [Admission Webhooks in Depth](#28-admission-webhooks-in-depth)
29. [CSI: Container Storage Interface](#29-csi-container-storage-interface)
30. [Service Nuances: Headless, EndpointSlices, Traffic Policy, Session Affinity](#30-service-nuances-headless-endpointslices-traffic-policy-session-affinity)
31. [Dual-Stack & IPv6](#31-dual-stack--ipv6)
32. [Ephemeral Containers & kubectl debug](#32-ephemeral-containers--kubectl-debug)
33. [Node Lifecycle: Cordon, Drain, PodDisruption During Upgrades](#33-node-lifecycle-cordon-drain-poddisruption-during-upgrades)
34. [Karpenter & Modern Node Autoscaling](#34-karpenter--modern-node-autoscaling)
35. [Backup & DR: Velero](#35-backup--dr-velero)
36. [Multi-Tenancy Patterns](#36-multi-tenancy-patterns)
37. [Cost Management (FinOps for K8s)](#37-cost-management-finops-for-k8s)
38. [API Versioning, Deprecation Policy & CRD Versions](#38-api-versioning-deprecation-policy--crd-versions)
39. [Kustomize](#39-kustomize)
40. [Vertical Pod Autoscaler — Practical Detail](#40-vertical-pod-autoscaler--practical-detail)
41. [Service Mesh Concepts: mTLS, Circuit Breaking, Traffic Splitting](#41-service-mesh-concepts-mtls-circuit-breaking-traffic-splitting)
42. [Common Exam/Interview Gotchas](#42-common-examinterview-gotchas)

---

# BEGINNER

## 1. What is Kubernetes & Why

- **Kubernetes (K8s)** is a container orchestration platform: it automates deployment, scaling, healing, and networking of containerized applications.
- Solves problems that arise once you have more than a handful of containers: *where do they run, how do they find each other, what happens when one dies, how do I roll out an update safely, how do I scale under load?*
- Think of Docker as "how to package/run one container" and Kubernetes as "how to run thousands of containers reliably across many machines."

**Key value props:**
- **Self-healing**: restarts failed containers, reschedules pods from dead nodes.
- **Declarative model**: you describe *desired state* (YAML), K8s continuously reconciles *actual state* to match it.
- **Portability**: same manifests run on AWS EKS, GCP GKE, Azure AKS, or bare metal.
- **Service discovery & load balancing** built in.
- **Horizontal scaling** with a single command or automatically via metrics.

## 2. Architecture Overview

A cluster = **Control Plane** (the brain) + **Worker Nodes** (where workloads run).

### Control Plane components
| Component | Role |
|---|---|
| **kube-apiserver** | Front door to the cluster. All `kubectl` commands and internal component communication go through it. Validates and stores requests via etcd. |
| **etcd** | Distributed key-value store — the single source of truth for all cluster state. |
| **kube-scheduler** | Decides which node a new pod should run on, based on resource needs, constraints, affinity rules. |
| **kube-controller-manager** | Runs controllers (Deployment controller, Node controller, ReplicaSet controller, etc.) that continuously reconcile actual vs desired state. |
| **cloud-controller-manager** | Talks to the cloud provider API (for LoadBalancers, volumes, node lifecycle) when running on a cloud. |

### Node (worker) components
| Component | Role |
|---|---|
| **kubelet** | Agent on every node; ensures containers described in PodSpecs are running and healthy. Talks to the container runtime. |
| **kube-proxy** | Maintains network rules (iptables/IPVS) on each node so Services can route traffic to the right pods. |
| **Container runtime** | containerd / CRI-O (Docker Engine itself is deprecated as a direct runtime since K8s 1.24 — dockershim removed). |

**Mental model:** You `kubectl apply` a YAML → API server stores it in etcd → controllers notice a Deployment wants 3 pods → scheduler assigns nodes → kubelet on each node pulls the image and starts containers → kube-proxy wires up networking.

## 3. Core Objects: Pods, ReplicaSets, Deployments

- **Pod**: smallest deployable unit. Wraps one or more tightly-coupled containers that share network namespace (same IP, can talk via `localhost`) and can share storage volumes. Pods are ephemeral — never rely on a pod's IP staying stable.
- **ReplicaSet**: ensures a specified number of identical pod replicas are running at all times. You rarely create these directly.
- **Deployment**: manages ReplicaSets on your behalf. Gives you:
  - Declarative updates (change image version → rolling update).
  - Rollback (`kubectl rollout undo`).
  - Scaling (`kubectl scale`).

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
        - name: backend
          image: myapp/backend:1.2.0
          ports:
            - containerPort: 8080
```

**Rollout mechanics**: default strategy is `RollingUpdate` — old pods are replaced gradually with new ones, controlled by `maxUnavailable` and `maxSurge`, so you get zero-downtime deploys by default.

## 4. Services & Basic Networking

Pods are disposable and get new IPs when recreated — a **Service** gives a stable virtual IP + DNS name in front of a group of pods (selected via label selector).

| Service type | Use case |
|---|---|
| **ClusterIP** (default) | Internal-only. Other pods reach it via `service-name.namespace.svc.cluster.local`. |
| **NodePort** | Exposes a static port (30000–32767) on every node's IP. Mostly for dev/testing. |
| **LoadBalancer** | Provisions a cloud load balancer (AWS ELB, GCP LB) pointing at the service. Standard way to expose to the internet on cloud. |
| **ExternalName** | Maps a service to an external DNS name (no proxying, just CNAME-like behavior). |

```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend-service
spec:
  selector:
    app: backend
  ports:
    - port: 80
      targetPort: 8080
  type: ClusterIP
```

- Traffic flow: Client → Service (virtual IP) → kube-proxy rules → one of the matching Pod IPs (load-balanced, typically round-robin/random via iptables or IPVS).
- **Service discovery** happens through **CoreDNS**: every Service automatically gets a DNS record.

## 5. ConfigMaps & Secrets

- **ConfigMap**: non-sensitive key-value config (env vars, config files) decoupled from image/code.
- **Secret**: same idea but for sensitive data (passwords, tokens, TLS certs). Stored base64-encoded (NOT encrypted by default — enable encryption-at-rest in etcd for real security, or use an external secret manager like Vault/AWS Secrets Manager/Sealed Secrets).

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  LOG_LEVEL: "debug"
  API_URL: "http://backend-service"
```

Consumed as env vars or mounted as files:
```yaml
envFrom:
  - configMapRef:
      name: app-config
```

**Beginner trap**: updating a ConfigMap does NOT automatically restart pods using it as env vars — you need a rollout restart (or a tool like Reloader) unless it's mounted as a volume (which updates live, with some delay).

## 6. Namespaces & Labels/Selectors

- **Namespace**: a virtual cluster within a cluster — logical isolation for resources (e.g., `dev`, `staging`, `prod`, or per-team). Resource quotas and RBAC are typically scoped per namespace.
- Default namespaces: `default`, `kube-system` (K8s internals), `kube-public`, `kube-node-lease`.
- **Labels**: key-value tags on objects (`app: backend`, `env: prod`). Used everywhere for grouping/selecting.
- **Selectors**: how Services, Deployments, NetworkPolicies etc. find the pods they target, based on labels.
- **Annotations**: like labels but not used for selection — for metadata (build info, tool config, e.g. ingress controller hints).

## 7. kubectl Essentials

```bash
kubectl get pods -n <namespace>              # list pods
kubectl get pods -o wide                     # with node/IP info
kubectl describe pod <name>                  # detailed events/state — first stop when debugging
kubectl logs <pod> -c <container> -f         # stream logs (add -c for multi-container pods)
kubectl exec -it <pod> -- /bin/sh            # shell into a container
kubectl apply -f manifest.yaml               # declarative create/update
kubectl delete -f manifest.yaml
kubectl scale deployment backend --replicas=5
kubectl rollout status deployment/backend
kubectl rollout undo deployment/backend
kubectl get events --sort-by=.metadata.creationTimestamp
kubectl top pods                             # needs metrics-server
kubectl port-forward svc/backend-service 8080:80
```

Contexts & config: `kubectl config get-contexts`, `kubectl config use-context <ctx>` — critical when juggling multiple clusters.

---

# INTERMEDIATE

## 8. Volumes & Persistent Storage

- Container filesystem is ephemeral — dies with the container. **Volumes** solve this.
- **emptyDir**: scratch space, lives as long as the pod (shared between containers in the pod, e.g. sidecar log shipping).
- **PersistentVolume (PV)**: a piece of storage provisioned in the cluster (could be backed by EBS, NFS, etc.) — cluster-scoped resource.
- **PersistentVolumeClaim (PVC)**: a request for storage by a user/pod — binds to a matching PV.
- **StorageClass**: enables *dynamic provisioning* — instead of pre-creating PVs, a PVC references a StorageClass and the volume is created on demand (e.g., `gp3` on AWS).

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: db-pvc
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: gp3
  resources:
    requests:
      storage: 10Gi
```

**Access modes**: `ReadWriteOnce` (single node), `ReadOnlyMany`, `ReadWriteMany` (needs a filesystem like EFS/NFS), `ReadWriteOncePod` (newer, single pod).

**Reclaim policy**: `Retain` (keep data after PVC deletion — recommended for prod DBs) vs `Delete` (default for dynamic provisioning).

## 9. Ingress & External Access

- **Ingress**: L7 HTTP(S) routing rules (host/path-based) into cluster Services — one entry point instead of a LoadBalancer per service. Requires an **Ingress Controller** (nginx-ingress, Traefik, AWS ALB Ingress Controller, etc.) actually running in the cluster to do anything.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
    - host: myapp.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: backend-service
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend-service
                port:
                  number: 80
  tls:
    - hosts: ["myapp.example.com"]
      secretName: myapp-tls
```

- **Gateway API** is the modern successor to Ingress (more expressive, role-oriented: infra admin vs app dev), increasingly the recommended path going forward.
- TLS termination usually handled at the ingress controller, often automated via **cert-manager** + Let's Encrypt.

## 10. StatefulSets, DaemonSets, Jobs, CronJobs

- **StatefulSet**: for stateful apps (databases, Kafka, etc.) needing stable network identity and stable storage per replica. Pods get predictable names (`db-0`, `db-1`, ...) and each gets its own PVC that persists across rescheduling. Scaling up/down is ordered (0, 1, 2... and reverse for scale-down).
- **DaemonSet**: ensures exactly one pod runs per node (or per matching subset of nodes) — used for node-level agents: log collectors (Fluentd/Fluent Bit), monitoring agents (node-exporter), CNI plugins.
- **Job**: runs a pod to completion (batch task), retries on failure up to a limit, then stops. Good for migrations, one-off scripts.
- **CronJob**: schedules Jobs on a cron schedule (`schedule: "0 * * * *"`) — backups, periodic reports.

**Beginner-to-intermediate trap**: StatefulSet ≠ automatic replication/clustering logic — K8s just gives stable identity/storage; the app itself (e.g., Postgres, Kafka) or an Operator still needs to handle actual clustering/replication.

## 11. Health Checks & Probes

Three probe types, each answering a different question:
- **livenessProbe**: "Is this container alive?" Fails → kubelet kills & restarts the container.
- **readinessProbe**: "Is this container ready to serve traffic?" Fails → pod removed from Service endpoints (not restarted) — critical during startup or temporary overload.
- **startupProbe**: "Has the app finished starting up?" Useful for slow-starting apps — disables liveness/readiness checks until it passes, avoiding premature kills.

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  periodSeconds: 5
```

Probe mechanisms: `httpGet`, `tcpSocket`, `exec` (run a command), `grpc`.

**Common mistake**: setting liveness too aggressive (short period, no initialDelay) on slow-starting apps → crash loop from self-inflicted restarts.

## 12. Resource Management: Requests, Limits, QoS

```yaml
resources:
  requests:
    cpu: "250m"
    memory: "256Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"
```

- **requests**: what the scheduler guarantees is reserved on a node — used for scheduling decisions.
- **limits**: hard ceiling. CPU limit → throttled if exceeded. Memory limit → container **OOMKilled** if exceeded (not throttled, memory can't be "throttled").
- **QoS classes** (derived automatically, not set directly):
  - **Guaranteed**: requests == limits for all containers → highest priority, last to be evicted.
  - **Burstable**: requests < limits → medium priority.
  - **BestEffort**: no requests/limits set → first to be evicted under node pressure.
- **ResourceQuota** (namespace-level) and **LimitRange** (default/min/max per pod/container) enforce guardrails across teams.

## 13. Autoscaling (HPA/VPA/Cluster Autoscaler)

- **HPA (Horizontal Pod Autoscaler)**: scales *replica count* based on metrics (CPU%, memory, or custom/external metrics via Prometheus Adapter). Requires `metrics-server` installed.
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```
- **VPA (Vertical Pod Autoscaler)**: adjusts requests/limits of existing pods (usually requires a restart to apply) — good for right-sizing over time, less commonly run live in "Auto" mode in prod due to restarts.
- **Cluster Autoscaler**: adds/removes *nodes* when pods are unschedulable (pending due to resource shortage) or nodes are underutilized. Works at the infra layer, complements HPA.
- Newer alternative: **KEDA** — event-driven autoscaling (scale on queue length, Kafka lag, etc., including scale-to-zero).

## 14. Helm Basics

- **Helm** = the package manager for Kubernetes. A **Chart** bundles templated YAML manifests + a `values.yaml` for configuration.
- Key commands:
```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install my-release bitnami/postgresql -f values.yaml
helm upgrade my-release bitnami/postgresql -f values.yaml
helm rollback my-release 1
helm uninstall my-release
helm template .            # render locally without installing — great for debugging
```
- Chart structure: `Chart.yaml`, `values.yaml`, `templates/*.yaml`, `charts/` (subcharts/dependencies).
- Templating uses Go templates: `{{ .Values.replicaCount }}`, `{{ .Release.Name }}`, `{{- if .Values.ingress.enabled }}`.
- See [helmVkustomize.md](helmVkustomize.md) for Helm vs Kustomize tradeoffs and the [Helm/](Helm/) folder for more.

## 15. RBAC & Service Accounts

- **ServiceAccount**: identity for processes running inside pods (distinct from user accounts). Every pod runs as some ServiceAccount (default: `default` in its namespace unless specified).
- **Role / ClusterRole**: define *what actions* are allowed on *which resources* (verbs: get, list, watch, create, update, delete, on resources: pods, secrets, deployments...). Role = namespace-scoped, ClusterRole = cluster-wide.
- **RoleBinding / ClusterRoleBinding**: attach a Role/ClusterRole to a user, group, or ServiceAccount.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: dev
  name: pod-reader
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods
  namespace: dev
subjects:
  - kind: ServiceAccount
    name: ci-bot
    namespace: dev
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

**Principle of least privilege**: never bind `cluster-admin` to app workloads; scope tightly to only the verbs/resources needed.

---

# ADVANCED

## 16. Scheduling: Affinity, Taints, Priority

- **nodeSelector**: simplest constraint — schedule only on nodes with a matching label.
- **Node affinity**: more expressive nodeSelector (`requiredDuringSchedulingIgnoredDuringExecution` = hard rule, `preferred...` = soft preference).
- **Pod affinity / anti-affinity**: schedule pods relative to *other pods* (e.g., spread replicas across zones with anti-affinity; co-locate a cache with its consumer with affinity).
- **Taints & Tolerations**: taints repel pods from a node unless the pod has a matching toleration (e.g., dedicated GPU nodes tainted `gpu=true:NoSchedule`, only workloads tolerating that taint land there).
- **PriorityClass**: influences scheduling order and preemption — higher-priority pending pods can evict lower-priority running pods under resource pressure.
- **Pod Topology Spread Constraints**: finer-grained control to spread pods evenly across zones/nodes (complements anti-affinity, more flexible for "even distribution" goals).

## 17. Networking Deep Dive: CNI, kube-proxy, DNS

- **CNI (Container Network Interface)**: pluggable networking layer — Calico, Cilium, Flannel, AWS VPC CNI, etc. Responsible for assigning pod IPs and enabling pod-to-pod communication across nodes (each pod gets a real, routable IP — the "flat network" model).
- **kube-proxy modes**:
  - `iptables` (default historically): chains of NAT rules, O(n) rule evaluation — degrades at very large scale (thousands of services).
  - `IPVS`: hash-table-based, better performance at scale.
  - **eBPF-based dataplanes** (Cilium without kube-proxy): bypass iptables entirely for higher performance and better observability.
- **CoreDNS**: cluster DNS server; every Service gets `<svc>.<namespace>.svc.cluster.local`; pods get DNS search suffixes appended automatically so `curl backend-service` works from within the same namespace.
- **Service mesh** (Istio/Linkerd): adds a sidecar proxy (Envoy) per pod for mTLS, fine-grained traffic management (canary, retries, circuit breaking), and rich observability — operates above the base CNI layer. See [istio.md](../istio.md).

For a much deeper treatment, see [Networking.md](Networking.md) and [good-practice-networking.md](good-practice-networking.md).

## 18. Network Policies & Security

- **NetworkPolicy**: firewall rules for pod traffic — default is "all pods can talk to all pods" (flat network), NetworkPolicies restrict this. Requires a CNI that supports enforcement (Calico, Cilium — not plain Flannel).
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-from-other-namespaces
spec:
  podSelector: {}
  policyTypes: ["Ingress"]
  ingress:
    - from:
        - podSelector: {}
```
- **Pod Security Standards** (replaced deprecated PodSecurityPolicy): `privileged`, `baseline`, `restricted` levels enforced via namespace labels + the built-in Pod Security Admission controller.
- Other hardening: run as non-root (`runAsNonRoot: true`), read-only root filesystem (`readOnlyRootFilesystem: true`), drop capabilities (`capabilities.drop: ["ALL"]`), disable privilege escalation (`allowPrivilegeEscalation: false`), image scanning (Trivy), admission control (OPA Gatekeeper / Kyverno) to enforce org policy (e.g., "no `:latest` tags", "must have resource limits").
- **Secrets management at scale**: External Secrets Operator, Sealed Secrets, or a real vault (HashiCorp Vault, AWS Secrets Manager/Parameter Store via CSI driver) instead of raw K8s Secrets in Git.

## 19. Custom Resources & Operators

- **CRD (CustomResourceDefinition)**: extends the Kubernetes API with your own object kinds (e.g., `kind: PostgresCluster`).
- **Operator**: a controller that watches a CRD and drives real-world state to match it — encodes operational knowledge (how to back up, fail over, upgrade a specific piece of software) as code. Examples: Prometheus Operator, cert-manager, Postgres Operator (Zalando/CrunchyData), Strimzi (Kafka).
- **Operator pattern = CRD + custom controller** implementing the reconcile loop (`observe → diff → act`), typically built with **Kubebuilder** or **Operator SDK**.
- This is how Kubernetes becomes a platform for anything, not just stateless web apps — "if you can describe desired state and write a reconciler, K8s can manage it."

## 20. Multi-container Pod Patterns

- **Sidecar**: helper container alongside main app in the same pod (e.g., log shipper, Envoy proxy for service mesh, config reloader). Shares network/volumes with main container.
- **Ambassador**: proxy container that simplifies talking to external services (e.g., local proxy to a remote DB with connection pooling).
- **Adapter**: normalizes output of the main container for external consumption (e.g., converting logs/metrics to a standard format for monitoring).
- **Init containers**: run to completion *before* app containers start — used for setup tasks (wait-for-dependency, DB migrations, fetching secrets/config). Run sequentially, each must succeed before the next starts.

```yaml
initContainers:
  - name: wait-for-db
    image: busybox
    command: ["sh", "-c", "until nc -z db-service 5432; do sleep 2; done"]
```

## 21. Cluster Internals: etcd, API Server, Controller Manager

- **etcd**: Raft-consensus based, needs an odd number of members (3 or 5) for quorum/HA. Losing quorum = read-only or fully down cluster. Backups (`etcdctl snapshot save`) are non-negotiable for disaster recovery — see [Backup and Disaster Recovery/](../Backup%20and%20Disaster%20Recovery/).
- **Watch mechanism**: controllers don't poll — they establish long-lived *watch* connections to the API server and react to change events, which is why K8s reconciliation is near-real-time.
- **Reconciliation loop** (the core K8s philosophy): every controller runs `for {} { observe current state; compare to desired state; take action to reduce the diff }`. This is why declarative YAML + controllers is more robust than imperative scripts — self-correcting by design.
- **Admission Controllers**: run after authentication/authorization, before persistence to etcd. Two phases: **Mutating** (e.g., inject sidecars, defaults) then **Validating** (e.g., reject non-compliant specs). This is the hook point for tools like Istio sidecar injection, OPA Gatekeeper, Kyverno.
- **API aggregation**: `metrics-server`, custom API servers can register as extensions under the main API server.

## 22. Observability: Logging, Metrics, Tracing

- **Logging**: containers log to stdout/stderr → captured by container runtime → shipped by a node-level DaemonSet (Fluent Bit/Fluentd) to a central store (Loki, Elasticsearch, CloudWatch). Never rely on `kubectl logs` alone in prod — logs vanish when pods are deleted.
- **Metrics**: `metrics-server` for basic CPU/mem (powers `kubectl top`, HPA). For real observability: **Prometheus** scrapes metrics endpoints, **Grafana** visualizes, **Alertmanager** fires alerts. `kube-state-metrics` exposes cluster object state (pod status, deployment replicas, etc.) as Prometheus metrics — distinct from node/container resource metrics.
- **Tracing**: distributed tracing (Jaeger/Tempo + OpenTelemetry) to follow a request across microservices — essential once you have more than a few services calling each other.
- See [Monitoring and Loggin/](../Monitoring%20and%20Loggin/) folder for more.

## 23. Troubleshooting Playbook

Systematic order when a pod misbehaves:

1. `kubectl get pods -o wide` — check status: `Pending`, `CrashLoopBackOff`, `ImagePullBackOff`, `OOMKilled`, `Evicted`.
2. `kubectl describe pod <name>` — read the **Events** section at the bottom first; it usually tells you exactly what's wrong (scheduling failure, probe failures, image pull errors, volume mount issues).
3. `kubectl logs <pod> --previous` — logs from the *last crashed* instance, critical for CrashLoopBackOff.
4. Common causes by symptom:
   - **Pending**: insufficient resources, no matching node (affinity/taint), PVC not bound.
   - **ImagePullBackOff**: wrong image name/tag, missing `imagePullSecrets` for private registry.
   - **CrashLoopBackOff**: app crashes on start — bad config, missing env var, failing migration, wrong entrypoint.
   - **OOMKilled**: memory limit too low, or memory leak — check `kubectl describe pod` for `Reason: OOMKilled` under last state.
   - **Readiness probe failing, pod running fine otherwise**: check probe path/port/timing — app may just need a longer `initialDelaySeconds`.
   - **Service not reachable**: check `kubectl get endpoints <svc>` — empty means label selector mismatch between Service and Pod.
5. `kubectl exec -it <pod> -- sh` to poke around live (if the container has a shell and is running).
6. For node-level issues: `kubectl describe node <name>` — check conditions (`MemoryPressure`, `DiskPressure`, `PIDPressure`), and `kubectl get events -A`.
7. For networking: `kubectl run -it --rm debug --image=nicolaka/netshoot -- sh` — a debug pod with DNS/network tools, then test `nslookup`, `curl`, `nc` from inside the cluster.

More scenario-based Q&A in [k8-doubts.md](k8-doubts.md).

## 24. Production Best Practices Checklist

- [ ] Set **requests AND limits** on every container (no BestEffort in prod).
- [ ] Define **readiness + liveness probes** (and startupProbe for slow starters).
- [ ] Use **rolling updates** with sane `maxUnavailable`/`maxSurge`; test rollback path.
- [ ] Run as **non-root**, read-only root FS where possible, drop unneeded Linux capabilities.
- [ ] Never store secrets in Git in plaintext — use Sealed Secrets/External Secrets/Vault.
- [ ] Apply **NetworkPolicies** — default-deny, then explicitly allow needed traffic.
- [ ] Use **PodDisruptionBudgets** to protect availability during voluntary disruptions (node drains, cluster upgrades).
- [ ] Spread replicas across **zones/nodes** via topology spread constraints or anti-affinity.
- [ ] Set up **HPA** for stateless services; consider KEDA for event-driven workloads.
- [ ] Centralized logging + Prometheus/Grafana + alerting wired to on-call.
- [ ] Regular **etcd backups** tested with actual restore drills.
- [ ] RBAC scoped to least privilege per team/namespace; avoid `cluster-admin` sprawl.
- [ ] Pin image tags (never `:latest`) and scan images for vulnerabilities in CI.
- [ ] Use **namespaces + ResourceQuotas** to prevent noisy-neighbor problems in shared clusters.
- [ ] GitOps (Argo CD/Flux) for declarative, auditable deployments instead of manual `kubectl apply`. See [GitOps.md](../GitOps.md) and [argo-cd-integration-helm.md](../argo-cd-integration-helm.md).

## 25. Quick-Revision Cheat Sheet

**Object hierarchy**: Deployment → ReplicaSet → Pod → Container(s)

**Traffic path (external → pod)**:
Internet → Ingress Controller (L7 routing) → Service (ClusterIP, stable VIP) → kube-proxy rules → Pod (via CNI network)

**When to use what workload type**:
| Need | Use |
|---|---|
| Stateless, scalable app | Deployment |
| Stateful app w/ stable identity/storage | StatefulSet |
| One-per-node agent | DaemonSet |
| Run-once task | Job |
| Scheduled run-once task | CronJob |

**Probe cheat sheet**: liveness = restart if dead; readiness = pull from LB if not ready; startup = don't kill me while I'm still booting.

**Autoscale cheat sheet**: HPA = more pods; VPA = bigger pods; Cluster Autoscaler = more nodes; KEDA = event-driven pods (incl. scale-to-zero).

**Debug order**: `get` → `describe` (read Events!) → `logs` (`--previous` if crashed) → `exec` → check `endpoints`/DNS if it's a networking issue.

**etcd**: source of truth. **API server**: front door + validation. **Scheduler**: picks nodes. **Controller manager**: reconciles desired vs actual. **kubelet**: runs containers on a node. **kube-proxy**: wires up Service networking on a node.

---

---

# MORE TOPICS YOU WERE MISSING

## 26. PodDisruptionBudgets & Voluntary Disruptions

- Two categories of disruption:
  - **Involuntary**: hardware failure, kernel panic, node crash — K8s can't prevent these.
  - **Voluntary**: node drains for upgrades, cluster autoscaler scale-down, `kubectl delete pod` — these you *can* control.
- **PodDisruptionBudget (PDB)** limits how many pods of a set can be voluntarily taken down at once, protecting availability during drains/upgrades.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: backend-pdb
spec:
  minAvailable: 2        # or use maxUnavailable: 1
  selector:
    matchLabels:
      app: backend
```

- If a `kubectl drain` would violate the PDB, the drain blocks on that pod until it's safe — this is why PDBs are non-negotiable before any managed node upgrade (EKS/GKE/AKS all respect them).
- Common mistake: setting `minAvailable: 100%` or `maxUnavailable: 0` on a Deployment with only 1 replica — this makes the pod *undrainable*, blocking node maintenance indefinitely.

## 27. Owner References, Garbage Collection & Finalizers

- **ownerReference**: metadata field linking a child object to its parent (e.g., a Pod's owner is its ReplicaSet, whose owner is the Deployment). This is how `kubectl delete deployment` cascades down to delete ReplicaSets and Pods automatically.
- **Garbage collection modes**:
  - `Foreground`: children deleted first, parent lingers in "deleting" state until children are gone.
  - `Background` (default): parent deleted immediately, children cleaned up asynchronously.
  - `Orphan`: children are kept, ownerReference stripped (`kubectl delete --cascade=orphan`) — useful when you want to delete a Deployment but keep pods running temporarily.
- **Finalizers**: a hook that blocks deletion of an object until some cleanup logic runs (e.g., a PVC finalizer ensures the underlying cloud disk is detached/deleted before the PVC object disappears). If you've ever seen a namespace or PVC stuck in `Terminating` forever, it's almost always a finalizer waiting on a controller that's no longer running to acknowledge it — the fix is to identify *why* the controller isn't clearing it, not to blindly `kubectl patch` the finalizer away (that can leak the underlying cloud resource).

## 28. Admission Webhooks in Depth

- Extends the two built-in admission phases (Mutating, then Validating — see section 21) with **your own** webhook servers the API server calls out to over HTTPS before persisting an object.
- **MutatingWebhookConfiguration**: can modify the object (e.g., Istio/linkerd sidecar injection, defaulting missing fields, injecting env vars).
- **ValidatingWebhookConfiguration**: can only accept/reject (e.g., OPA Gatekeeper/Kyverno policy enforcement — "reject any Deployment without resource limits").
- Order: Mutating webhooks run first (object can change shape), then Validating webhooks see the final object.
- **failurePolicy: Fail vs Ignore** — a critical prod gotcha: if your webhook server is down and `failurePolicy: Fail`, *all* matching object creates/updates across the cluster start failing (including kube-system pods, potentially bricking the cluster). Always scope webhooks tightly with `namespaceSelector`/`objectSelector` and consider `Ignore` for non-critical policies, plus keep the webhook deployment highly available.

## 29. CSI: Container Storage Interface

- **CSI** is the standard plugin interface for storage, replacing older in-tree volume plugins (`kubernetes.io/aws-ebs`, etc., now deprecated/removed).
- Every cloud/storage vendor ships a CSI driver (`ebs.csi.aws.com`, `pd.csi.storage.gke.io`, `disk.csi.azure.com`) that implements provisioning, attaching, mounting, resizing, and snapshotting volumes.
- **VolumeSnapshot / VolumeSnapshotClass**: CSI-based point-in-time snapshots of a PVC — the building block underneath backup tools like Velero.
- **Volume expansion**: if `allowVolumeExpansion: true` on the StorageClass, you can just edit the PVC's `spec.resources.requests.storage` to a bigger value and the CSI driver resizes it live (for most cloud block storage).
- CSI also powers the **Secrets Store CSI Driver** — mounts secrets from Vault/AWS Secrets Manager/Azure Key Vault directly as volumes instead of native K8s Secrets.

## 30. Service Nuances: Headless, EndpointSlices, Traffic Policy, Session Affinity

- **Headless Service** (`clusterIP: None`): no virtual IP/load-balancing — DNS query returns the individual Pod IPs directly. Essential for StatefulSets (each replica needs its own stable DNS name like `db-0.db-headless.default.svc.cluster.local`) and for clients that want to do their own client-side load balancing (e.g., gRPC).
- **EndpointSlices**: the modern replacement for the old `Endpoints` object — shards endpoints into groups of ~100 for scalability (a Service with 5,000 pods used to create one giant `Endpoints` object that choked the API server on every update).
- **externalTrafficPolicy**:
  - `Cluster` (default): traffic can be routed to any pod on any node, may add an extra hop, but evens out load.
  - `Local`: only routes to pods on the *same node* that received the traffic — preserves client source IP (important for logging/rate-limiting) but can cause uneven load if pods aren't spread evenly.
- **sessionAffinity: ClientIP**: sticky sessions at the Service level (same client IP always hits the same pod) — a blunt instrument compared to app-level session handling, but sometimes necessary for stateful protocols.

## 31. Dual-Stack & IPv6

- Kubernetes supports **dual-stack** (IPv4 + IPv6 simultaneously) — pods and Services can get addresses in both families.
- Relevant mostly at larger scale or in regulated environments (e.g., some government/telco requirements mandate IPv6). Config lives in cluster provisioning (`--service-cluster-ip-range` becomes a dual CIDR list) — not something you toggle per-workload.
- Good to know it exists and why (IPv4 exhaustion in very large clusters), but low priority to go deep unless your infra specifically requires it.

## 32. Ephemeral Containers & kubectl debug

- **Ephemeral containers**: a special container type you can *add to an already-running pod* for debugging, without restarting it — can't be added via normal spec updates, only via the ephemeral containers subresource.
- In practice you almost always use the wrapper:
```bash
kubectl debug -it <pod> --image=busybox --target=<container-name>
```
- Hugely useful for **distroless/minimal images** (no shell, no debug tools baked in for security) — you attach a full-featured debug container into the same pod namespace instead of needing to rebuild the image with debug tools.
- Also: `kubectl debug node/<node-name> -it --image=busybox` — drops you into a debug pod with the *node's* filesystem mounted at `/host`, useful for node-level troubleshooting without SSH.

## 33. Node Lifecycle: Cordon, Drain, PodDisruption During Upgrades

- `kubectl cordon <node>`: marks a node unschedulable (existing pods keep running, no new pods land there).
- `kubectl drain <node>`: cordons + evicts all pods gracefully (respecting PDBs), used before maintenance/decommission.
  - `--ignore-daemonsets` (DaemonSet pods aren't evicted by drain by design — they're recreated on the node anyway).
  - `--delete-emptydir-data` (needed if pods use emptyDir, since that data is node-local and will be lost).
- `kubectl uncordon <node>`: makes it schedulable again after maintenance.
- **Managed K8s node upgrades** (EKS managed node groups, GKE node auto-upgrade) do exactly this drain/cordon dance automatically per node — this is precisely why PDBs (#26) and readiness probes (#11) matter: a badly configured app can turn a routine node upgrade into an outage.

## 34. Karpenter & Modern Node Autoscaling

- **Karpenter** (AWS-originated, now broader): a newer alternative/complement to the traditional Cluster Autoscaler.
- Key difference: instead of scaling predefined node groups/ASGs, Karpenter provisions **right-sized nodes on demand** directly from the cloud API based on the actual pending pod requirements (bin-packing aware), and can mix instance types/Spot automatically.
- Faster scale-up (skips ASG launch template overhead), better bin-packing, and native Spot interruption handling.
- Cluster Autoscaler is still extremely common and perfectly fine — Karpenter is worth knowing as the direction the ecosystem is moving, especially on AWS.

## 35. Backup & DR: Velero

- **Velero**: the de facto standard tool for cluster-level backup/restore and migration — backs up Kubernetes object manifests (from etcd, via the API) *and* can snapshot PVs (via CSI snapshots or provider-native APIs), storing both in object storage (S3, GCS, etc.).
- Use cases: scheduled backups of a namespace/cluster, disaster recovery, cloning a namespace to a new cluster, cluster migration (e.g., moving from self-managed to EKS).
- Distinct from **etcd snapshot backups** (`etcdctl snapshot save`) — etcd snapshots restore the *entire* control plane state (lower-level, harder to do partial restores); Velero works at the Kubernetes object level (easier to restore just "the `payments` namespace" or a single PVC).
- See [Backup and Disaster Recovery/](../Backup%20and%20Disaster%20Recovery/) for hands-on notes.

## 36. Multi-Tenancy Patterns

- **Soft multi-tenancy** (namespace-based): teams share a cluster, isolated by namespace + RBAC + ResourceQuota + NetworkPolicy. Cheaper, simpler, but a determined/misconfigured tenant can still affect others (noisy neighbor on shared nodes, kernel-level isolation gaps since containers share the host kernel).
- **Hard multi-tenancy** (cluster-per-tenant, or virtual clusters via **vCluster**/**Kamaji**): full isolation, higher cost/ops overhead. Virtual clusters give each tenant what looks like their own API server/control plane while sharing underlying node infrastructure.
- **Hierarchical Namespaces (HNC)**: lets you organize namespaces in a tree so policies/RBAC/quotas can be inherited, useful when one "team" namespace needs several sub-namespaces (dev/staging per squad).
- Rule of thumb: start with soft multi-tenancy (namespaces + quotas + policies); only reach for hard multi-tenancy when compliance or blast-radius requirements demand it — it's a significant operational cost jump.

## 37. Cost Management (FinOps for K8s)

- Kubernetes bin-packs workloads onto nodes, which makes "who's spending what" opaque compared to per-VM billing — this is why dedicated tooling exists.
- **kube-state-metrics + Prometheus + Grafana** can approximate cost allocation from resource *requests* (not actual usage) per namespace/label.
- **OpenCost** / **Kubecost**: purpose-built cost allocation tools — break down spend by namespace, deployment, label, team; identify overprovisioned requests (requested 2 CPU, using 200m — wasted spend).
- Common cost levers: right-sizing requests/limits (via VPA recommendations, even if not auto-applying them), Spot/preemptible nodes for fault-tolerant workloads, Cluster Autoscaler/Karpenter scale-to-need, scale-to-zero for dev/staging off-hours (KEDA or simple CronJob-based scaling).

## 38. API Versioning, Deprecation Policy & CRD Versions

- K8s API object versions: `v1alpha1` (experimental, may break/disappear) → `v1beta1` (more stable, still can change) → `v1` (stable, long-term guarantees).
- K8s has a formal **deprecation policy**: a GA (`v1`) API is supported for a minimum period before removal; beta APIs can be deprecated faster. This is why cluster upgrades sometimes break old manifests (e.g., `extensions/v1beta1` Ingress removed in 1.22 in favor of `networking.k8s.io/v1`) — always check the changelog/deprecation guide before major version upgrades.
- `kubectl convert` (plugin) and `pluto`/`kubent` tools scan manifests for soon-to-be-removed API versions before you upgrade.
- **CRDs also version** (`apiVersion` in the CRD's own `spec.versions`), supporting multiple versions simultaneously with conversion webhooks — same discipline applies if you're building your own CRDs/operators.

## 39. Kustomize

- Built into `kubectl` (`kubectl apply -k`), a template-free alternative to Helm — works via **overlays** on top of a `base`, patching fields per environment instead of templating strings.
```
base/
  deployment.yaml
  kustomization.yaml
overlays/
  dev/kustomization.yaml       # patches replicas: 1
  prod/kustomization.yaml      # patches replicas: 5, adds resource limits
```
- Strengths vs Helm: no templating language to learn, plain YAML stays valid YAML, easy to reason about diffs. Weaker at packaging/distributing reusable charts to others (no public "Kustomize Hub" equivalent to Artifact Hub).
- Many teams use **both**: consume third-party software as Helm charts, but manage their own app manifests with Kustomize overlays per environment. Argo CD and Flux both support Kustomize natively. Full comparison in [helmVkustomize.md](helmVkustomize.md).

## 40. Vertical Pod Autoscaler — Practical Detail

- Three modes on `updateMode`:
  - `Off`: just gives *recommendations* (visible via `kubectl describe vpa`) without acting — the safest way to use VPA in prod, feeding recommendations into your own review process.
  - `Initial`: sets requests only at pod creation time, never touches running pods.
  - `Auto`/`Recreate`: actually evicts and recreates pods with new resource values — causes disruption, generally avoided for latency-sensitive services unless paired with PDBs and multiple replicas.
- **Don't run HPA-on-CPU and VPA on the same metric/resource simultaneously** — they can fight each other (VPA resizes pods while HPA is trying to add replicas based on utilization of those same resources). If combining, VPA on memory + HPA on CPU (or custom metrics) is a safer split.

## 41. Service Mesh Concepts: mTLS, Circuit Breaking, Traffic Splitting

(Complements [istio.md](../istio.md) — high-level concepts every mesh shares, regardless of Istio/Linkerd/Cilium's mesh mode.)

- **mTLS (mutual TLS)**: sidecar proxies automatically encrypt and authenticate pod-to-pod traffic without app code changes — the mesh issues/rotates certs per workload identity.
- **Traffic splitting / canary**: route e.g. 95% of traffic to `v1` and 5% to `v2` of a service, independent of Kubernetes' own rollout mechanics — enables progressive delivery decoupled from Deployment replica counts.
- **Circuit breaking**: mesh proxy stops sending requests to an unhealthy upstream after error-rate/latency thresholds, preventing cascading failure.
- **Retries/timeouts as policy, not code**: configured declaratively at the mesh layer instead of hardcoded in every service's HTTP client.
- Tradeoff to remember: a mesh adds real latency/resource overhead (extra proxy hop per call) and operational complexity — don't reach for it until you actually need multi-service traffic control/mTLS/observability that plain K8s + an ingress controller can't give you.

## 42. Common Exam/Interview Gotchas

- A **Deployment's `replicas`** is *desired* count — actual running count can differ temporarily during rollouts/node failures; check `kubectl get deployment` `READY` column, not just that you set replicas.
- **`restartPolicy`** only applies to containers *within the same pod restarted by kubelet* — it does not control ReplicaSet-level pod replacement (that's the Deployment/ReplicaSet controller's job entirely). Valid values: `Always` (default, for Deployments), `OnFailure`, `Never` (typical for Jobs).
- **A Pod's IP changes** every time it's recreated — never hardcode pod IPs; always go through a Service/DNS.
- **ConfigMap/Secret updates don't restart pods automatically** (see section 5) — need a rollout restart or a Reloader-style controller.
- **`kubectl delete pod`** on a pod managed by a Deployment just gets it immediately replaced — if you actually want to reduce pod count, scale the Deployment, don't just delete pods.
- **Namespaces don't provide network isolation by default** — a NetworkPolicy is required; namespaces alone are an organizational/RBAC boundary, not a firewall.
- **Liveness probe failing ≠ readiness probe failing** — mixing these up is the #1 debugging confusion for new users (see section 11).
- **`emptyDir` is not persistent** — surviving a container restart within the same pod is fine, but pod deletion wipes it; don't mistake it for durable storage.
- **Resource `limits` without `requests`** — if you set only limits, K8s defaults requests to equal limits, which can silently make scheduling stricter than intended.

---

## Suggested Learning Order (if starting from zero)

1. Read sections 1–7 here, then spin up a local cluster (`minikube start` or `kind create cluster`).
2. Deploy a simple app: write a Deployment + Service, `kubectl apply`, `kubectl port-forward` to see it.
3. Break things on purpose: delete a pod, scale to 0, set a bad image tag — watch how K8s reacts. This builds intuition fast.
4. Move to sections 8–15: add a PVC-backed database, an Ingress, an HPA, wrap it all in a Helm chart.
5. Sections 16–24: once comfortable, study scheduling constraints, NetworkPolicies, and read through [K-pods.md](K-pods.md) and [Networking.md](Networking.md) for depth.
6. For certification-style structured practice, see the [CKA/](../CKA/) folder.
