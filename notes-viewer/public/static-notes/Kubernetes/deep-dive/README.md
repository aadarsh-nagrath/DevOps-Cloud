# Kubernetes Deep Dives

In-depth, field-level companions to the summary notes in [k8s-learning-path.md](../k8s-learning-path.md).

1. [Services, Endpoints, Pod IPs & Ports](01-services-endpoints-ports.md) — port vs targetPort vs nodePort, EndpointSlices, kube-proxy, DNS, 502/503 debugging
2. [YAML Fields Explained](02-yaml-fields-explained.md) — every top-level key, labels vs annotations (and common annotations), pod/deployment/ingress fields, `secretName`, `pathType`
3. [Pod Lifecycle, Probes & Resources](03-pod-lifecycle-probes-resources.md) — phases, CrashLoopBackOff, probes, graceful shutdown, QoS/OOM
4. [ConfigMaps, Secrets & Storage](04-storage-config-secrets.md) — consumption modes, Secret types, PV/PVC/StorageClass, StatefulSet storage
5. [Workloads, Rollouts & Scheduling](05-workloads-rollouts-scheduling.md) — Deployment strategy maths, StatefulSet/DaemonSet/Job, HPA, affinity/taints, PDB
6. [Security: RBAC, NetworkPolicy, Pod Security](06-security-rbac-networkpolicy.md)
7. [Kubernetes Networking: The Complete Deep Dive](../kubernetes-networking-deep-dive.md): CNI internals, packet walks, kube-proxy chains, DNS, Gateway API, NetworkPolicy, troubleshooting
8. [Architecture & API Internals](07-architecture-and-api-internals.md): request path through the apiserver, watches and informers, etcd storage (secrets in plaintext, proved), authn/authz/admission, API Priority & Fairness, resourceVersion and conflicts, server-side apply and field managers, owner refs, GC cascade modes, finalizers, leases, HA, outage reasoning
9. [Scheduling in Depth](08-scheduling-in-depth.md): scheduler framework and plugins, real FailedScheduling messages, node affinity, taints with NoExecute timing, pod (anti-)affinity, topology spread, priority and preemption (real), scheduling gates, requests/limits/QoS, node-pressure eviction, PDB/drain, descheduler, Kueue
10. [Autoscaling](09-autoscaling.md): HPA algorithm and real scale-up/scale-down timeline, behavior policies, metric types and adapters, pitfalls, VPA, KEDA, Cluster Autoscaler vs Karpenter, overprovisioning, in-place Pod resize (real)
11. [Extending Kubernetes](10-extending-kubernetes.md): CRDs (schema, CEL rules, subresources, versioning and conversion), operators and reconcile loops, admission webhooks (outage reproduced), ValidatingAdmissionPolicy (subresource bypass found and fixed), MutatingAdmissionPolicy, Kyverno vs Gatekeeper, API aggregation
12. [Cluster Operations](11-cluster-operations.md): static Pods, kubeadm, etcd snapshot and restore (real), certificates and expiry, version skew and upgrades, kubelet config, image GC, log rotation, crictl, audit logging (real events)
13. [Security Hardening](12-security-hardening.md): PSA levels and modes, securityContext measured in /proc (default Pods are seccomp-unconfined), RBAC escalation paths (`edit` → any ServiceAccount), bound SA tokens (invalidation proved), workload identity, encryption at rest (before/after etcd bytes), External Secrets, supply chain, sandboxed runtimes, checklist
14. [Observability & Troubleshooting](13-observability-and-troubleshooting.md): metrics/logs/traces/events, PromQL alerts, a real failure zoo (CrashLoop, OOM, ImagePull, ConfigError, StartError, liveness kills, Init), exit codes, node NotReady timeline, all three `kubectl debug` modes
15. [Advanced Workloads & Multi-tenancy](14-advanced-workloads-and-multitenancy.md): StatefulSet guarantees and partitioned rollouts (real), DaemonSets, Indexed Jobs, podFailurePolicy, CronJobs, native sidecars (the SIGTERM trap), Downward API, quotas and LimitRange (real), GPUs and DRA, Velero, Windows, multi-cluster, cost

See also: [Ingress deep dive](../../Service%20Mesh/kubernetes-ingress-deep-dive.md) (TLS termination, pathType, annotations).
