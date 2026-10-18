# ☸️ Kubernetes: Zero to Expert

Every Kubernetes note in this repo, in the order to study them. The deep dives (⭐) were written against a real **v1.37** cluster, so their outputs, error messages and edge cases are real, not paraphrased from docs.

## Learning path

### Stage 1: Foundations (what the objects are)
| # | Note | Covers |
|---|---|---|
| 1 | [Kubernetes Learning Path](./k8s-learning-path.md) | All 42 topics at summary level. Use it as the map and the revision sheet |
| 2 | [Kubernetes Core](./kubernetes.md) | API server, scheduler, kubelet, Services, Ingress, ConfigMaps, namespaces, kubectl |
| 3 | [Pods](./K-pods.md) · [Common doubts](./k8-doubts.md) | Pods hands-on, full-stack app layout, beginner questions |
| 4 | [YAML Fields Explained](./deep-dive/02-yaml-fields-explained.md) | Reading any manifest field by field |
| 5 | [Pod Lifecycle, Probes & Resources](./deep-dive/03-pod-lifecycle-probes-resources.md) | Phases, probes, requests/limits, QoS, graceful shutdown |
| 6 | [ConfigMaps, Secrets & Storage](./deep-dive/04-storage-config-secrets.md) | Config injection, PV/PVC/StorageClass |
| 7 | [Workloads, Rollouts & Scheduling basics](./deep-dive/05-workloads-rollouts-scheduling.md) | Deployments, StatefulSets, DaemonSets, Jobs, HPA, affinity, PDB |

### Stage 2: Networking
| # | Note | Covers |
|---|---|---|
| 8 | [Networking basics (Docker → K8s)](./Networking.md) | Docker network drivers, then Service types |
| 9 | [Services, Endpoints & Ports](./deep-dive/01-services-endpoints-ports.md) | port vs targetPort vs nodePort, 502/503 debugging |
| 10 | ⭐ [**Networking: The Complete Deep Dive**](./kubernetes-networking-deep-dive.md) | CNI internals, packet captures, kube-proxy chains, DNS/ndots, Gateway API, NetworkPolicy, MTU, playbook |
| 11 | [Ingress deep dive](../Service%20Mesh/kubernetes-ingress-deep-dive.md) · [Ingress examples](./examples/ingress-eg.md) · [Good-practice networking](./good-practice-networking.md) | TLS, pathType, annotations |

### Stage 3: How Kubernetes really works
| # | Note | Covers |
|---|---|---|
| 12 | ⭐ [**Architecture & API Internals**](./deep-dive/07-architecture-and-api-internals.md) | Request pipeline, etcd, admission, APF, server-side apply, GC, finalizers, leases |
| 13 | ⭐ [**Scheduling in Depth**](./deep-dive/08-scheduling-in-depth.md) | Plugins, FailedScheduling decoded, taints, spread, preemption, eviction |
| 14 | ⭐ [**Autoscaling**](./deep-dive/09-autoscaling.md) | HPA maths and behaviour, VPA, KEDA, Karpenter, in-place resize |

### Stage 4: Operating and securing clusters
| # | Note | Covers |
|---|---|---|
| 15 | ⭐ [**Cluster Operations**](./deep-dive/11-cluster-operations.md) | kubeadm, etcd backup/restore, certs, upgrades, kubelet, crictl, audit |
| 16 | [RBAC, NetworkPolicy & Pod Security basics](./deep-dive/06-security-rbac-networkpolicy.md) | Roles, bindings, ServiceAccounts |
| 17 | ⭐ [**Security Hardening**](./deep-dive/12-security-hardening.md) | PSA, securityContext, RBAC escalation, tokens, encryption at rest, supply chain |
| 18 | ⭐ [**Observability & Troubleshooting**](./deep-dive/13-observability-and-troubleshooting.md) | PromQL, failure zoo, exit codes, node failure, kubectl debug |

### Stage 5: Expert topics
| # | Note | Covers |
|---|---|---|
| 19 | ⭐ [**Extending Kubernetes**](./deep-dive/10-extending-kubernetes.md) | CRDs, operators, webhooks, CEL admission policies, Kyverno/Gatekeeper |
| 20 | ⭐ [**Advanced Workloads & Multi-tenancy**](./deep-dive/14-advanced-workloads-and-multitenancy.md) | StatefulSets, Jobs, native sidecars, quotas, GPUs/DRA, Velero, Windows, multi-cluster, cost |

### Ecosystem (separate sections of this repo)
- **Packaging:** [Helm series](../Helm/README.md) (9 parts), with Kustomize covered in [Helm vs Kustomize](../Helm/helm-vs-kustomize.md)
- **GitOps / CD:** [GitOps](../GitOps.md), [Continuous Delivery](../Continuous%20Delivery/)
- **Service mesh:** [Service Mesh notes](../Service%20Mesh/service-mesh-overview.md)
- **Policy:** [Kyverno](../IaC%20Testing%20and%20Policy%20as%20Code/kyverno.md), [OPA/Conftest](../IaC%20Testing%20and%20Policy%20as%20Code/policy-as-code-with-opa-and-conftest.md)
- **Monitoring:** [Monitoring and Logging](../Monitoring%20and%20Loggin/)
- **CNCF projects:** [CNCF notes](../CNCF/Readme.md) · [Knative](../Knative/knative.md)
- **Certification:** [CKA 40-day series](../CKA/README.md)
- **Infrastructure:** [Terraform series](../Terraform%20and%20CF/terraform.md) (for provisioning EKS/GKE/AKS)
- **Interview prep:** [Kubernetes Q&A](../Interview%20Questions/04-kubernetes-qna.md), [Jenkins/K8s/Helm rounds](../Interview%20Questions/29-jenkins-k8s-helm-interview-rounds-qna.md), [How it works internally](../Interview%20Questions/23-how-it-works-internals-qna.md)

## Build your own lab (what the deep dives used)

```bash
# isolated throwaway cluster — never touches your real contexts if you always pass --context
minikube start -p k8slab --nodes 2 --memory 2800 --cpus 2 --addons metrics-server
minikube start -p netlab --nodes 2 --cni calico          # for NetworkPolicy experiments
alias kl='kubectl --context k8slab'
kl get nodes
minikube delete -p k8slab                                 # when finished
```

## How to know you've mastered it

Answer these without notes, and then check against the pages:
1. Trace `kubectl apply` of a Deployment through every component until a container runs ([07](./deep-dive/07-architecture-and-api-internals.md#2-life-of-a-request-kubectl-apply--running-container)).
2. A Pod is Pending with `0/6 nodes are available: 3 Insufficient cpu, 3 node(s) had untolerated taint`. What exactly do you change ([08](./deep-dive/08-scheduling-in-depth.md))?
3. Why can't you ping a ClusterIP, and why does `curl` to it work ([networking §6](./kubernetes-networking-deep-dive.md#6-services-how-a-virtual-ip-actually-works))?
4. Your HPA is stuck at `<unknown>/60%`. Give three causes ([09](./deep-dive/09-autoscaling.md)).
5. A namespace has been `Terminating` for an hour. Find the cause without stripping finalizers ([07 §7](./deep-dive/07-architecture-and-api-internals.md#7-controllers-ownership-garbage-collection-and-finalizers), [10 §7](./deep-dive/10-extending-kubernetes.md#7-api-aggregation-extension-api-servers)).
6. Restore etcd from a snapshot on a 3-member cluster ([11 §3](./deep-dive/11-cluster-operations.md#3-etcd-backup-and-restore)).
7. Why is `create pods` RBAC effectively admin-equivalent within a namespace ([12 §3](./deep-dive/12-security-hardening.md#3-rbac-the-escalation-paths-people-miss))?
8. A container shows `Last State: Terminated, Exit Code: 137` but not `OOMKilled`. What happened ([13 §5](./deep-dive/13-observability-and-troubleshooting.md#oomkilled-exit-137))?
9. Why did a Job with a sidecar take 30 s longer than its main container ([14 §4](./deep-dive/14-advanced-workloads-and-multitenancy.md#4-native-sidecars-initcontainers-with-restartpolicy-always))?
10. Your ValidatingAdmissionPolicy limits replicas to 5, yet someone has 8 running. How ([10 §4](./deep-dive/10-extending-kubernetes.md#4-validatingadmissionpolicy-cel-ga-in-130-policy-without-a-webhook))?
