# Kubernetes Deep Dives

In-depth, field-level companions to the summary notes in [k8s-learning-path.md](../k8s-learning-path.md).

1. [Services, Endpoints, Pod IPs & Ports](01-services-endpoints-ports.md) — port vs targetPort vs nodePort, EndpointSlices, kube-proxy, DNS, 502/503 debugging
2. [YAML Fields Explained](02-yaml-fields-explained.md) — every top-level key, labels vs annotations (and common annotations), pod/deployment/ingress fields, `secretName`, `pathType`
3. [Pod Lifecycle, Probes & Resources](03-pod-lifecycle-probes-resources.md) — phases, CrashLoopBackOff, probes, graceful shutdown, QoS/OOM
4. [ConfigMaps, Secrets & Storage](04-storage-config-secrets.md) — consumption modes, Secret types, PV/PVC/StorageClass, StatefulSet storage
5. [Workloads, Rollouts & Scheduling](05-workloads-rollouts-scheduling.md) — Deployment strategy maths, StatefulSet/DaemonSet/Job, HPA, affinity/taints, PDB
6. [Security: RBAC, NetworkPolicy, Pod Security](06-security-rbac-networkpolicy.md)

See also: [Ingress deep dive](../../Service%20Mesh/kubernetes-ingress-deep-dive.md) (TLS termination, pathType, annotations).
