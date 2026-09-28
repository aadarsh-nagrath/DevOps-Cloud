<img width="1680" height="702" alt="Screenshot 2026-09-17 at 10 45 56 AM" src="https://github.com/user-attachments/assets/a39e20f1-ca91-469e-bc2b-3dee2def2e43" />
<img width="1680" height="498" alt="Screenshot 2026-09-17 at 10 46 11 AM" src="https://github.com/user-attachments/assets/b7c0cbce-6937-42df-a321-dd017a172d74" />
<img width="1681" height="347" alt="Screenshot 2026-09-17 at 10 46 37 AM" src="https://github.com/user-attachments/assets/fa696213-8142-44f9-8304-ecc0a824e281" />
<img width="1677" height="648" alt="Screenshot 2026-09-17 at 10 47 18 AM" src="https://github.com/user-attachments/assets/3acdf8b9-7753-42ed-8309-13e5e6938c45" />
<img width="1679" height="601" alt="Screenshot 2026-09-17 at 10 47 40 AM" src="https://github.com/user-attachments/assets/72497b6c-0fa7-42a7-8804-c2fd93812703" />

---

# CNCF Landscape Notes

Deep-dive notes for CNCF (Cloud Native Computing Foundation) projects not already covered elsewhere in this repo (Istio/Linkerd live in [Service Mesh/](../Service%20Mesh/), Helm/ArgoCD in their own folders, Fluentd in [Monitoring and Loggin/](../Monitoring%20and%20Loggin/), Kyverno/OPA in [IaC Testing and Policy as Code/](../IaC%20Testing%20and%20Policy%20as%20Code/)).

Every tool folder has the same two-file layout:
- **`<tool>.md`** — full notes (Beginner / Intermediate / Advanced / Quick Revision), same format as [prometheus.md](../Monitoring%20and%20Loggin/prometheous/prometheus.md).
- **`tutorial/local-setup.md`** — a hands-on, copy-pasteable walkthrough to run the tool locally (Docker and/or `kind`) and actually see it work.

| Tool | Category | Notes | Tutorial |
|---|---|---|---|
| **Jaeger** | Observability — distributed tracing | [jaeger.md](jaeger/jaeger.md) | [local-setup.md](jaeger/tutorial/local-setup.md) |
| **OpenTelemetry** | Observability — instrumentation & collection | [opentelemetry.md](open-telemetry/opentelemetry.md) | [local-setup.md](open-telemetry/tutorial/local-setup.md) |
| **Envoy** | Networking — L4/L7 proxy, service mesh data plane | [envoy.md](envoy/envoy.md) | [local-setup.md](envoy/tutorial/local-setup.md) |
| **containerd** | Runtime — container runtime (CRI) | [containerd.md](containerd/containerd.md) | [local-setup.md](containerd/tutorial/local-setup.md) |
| **etcd** | Runtime — distributed key-value store, Kubernetes' data store | [etcd.md](etcd/etcd.md) | [local-setup.md](etcd/tutorial/local-setup.md) |
| **Cilium** | Networking — eBPF-based CNI, network policy, observability | [cilium.md](cilium/cilium.md) | [local-setup.md](cilium/tutorial/local-setup.md) |
| **Falco** | Security — runtime threat detection | [falco.md](falco/falco.md) | [local-setup.md](falco/tutorial/local-setup.md) |
| **Vitess** | Database — horizontal MySQL sharding | [vitess.md](vitess/vitess.md) | [local-setup.md](vitess/tutorial/local-setup.md) |
| **Flux** | GitOps — continuous delivery (composable controllers) | [flux.md](flux/flux.md) | [local-setup.md](flux/tutorial/local-setup.md) |
| **Argo Workflows** | Orchestration — Kubernetes-native workflow/pipeline engine | [argo-workflows.md](argo-workflows/argo-workflows.md) | [local-setup.md](argo-workflows/tutorial/local-setup.md) |
| **KEDA** | Autoscaling — event-driven autoscaling on top of HPA | [keda.md](keda/keda.md) | [local-setup.md](keda/tutorial/local-setup.md) |
| **Crossplane** | Provisioning — Kubernetes control plane for cloud infra | [crossplane.md](crossplane/crossplane.md) | [local-setup.md](crossplane/tutorial/local-setup.md) |
| **Backstage** | Platform engineering — internal developer portal | [backstage.md](backstage/backstage.md) | [local-setup.md](backstage/tutorial/local-setup.md) |
| **SPIRE** | Security — SPIFFE workload identity | [spire.md](spire/spire.md) | [local-setup.md](spire/tutorial/local-setup.md) |
| **Rook** | Storage — Kubernetes storage orchestrator (Ceph) | [rook.md](rook/rook.md) | [local-setup.md](rook/tutorial/local-setup.md) |
| **Longhorn** | Storage — distributed block storage | [longhorn.md](longhorn/longhorn.md) | [local-setup.md](longhorn/tutorial/local-setup.md) |
| **Harbor** | Runtime — container image registry with scanning | [harbor.md](harbor/harbor.md) | [local-setup.md](harbor/tutorial/local-setup.md) |
| **CoreDNS** | Networking — DNS server, Kubernetes' default DNS | [coredns.md](coredns/coredns.md) | [local-setup.md](coredns/tutorial/local-setup.md) |
| **NATS** | Messaging — lightweight pub/sub and streaming | [nats.md](nats/nats.md) | [local-setup.md](nats/tutorial/local-setup.md) |

See also: [Argo CD](../Continuous%20Delivery/ArgoCD/Argo-cd.md) (GitOps continuous delivery) in [Continuous Delivery/](../Continuous%20Delivery/), which now also has a hands-on [tutorial/local-setup.md](../Continuous%20Delivery/ArgoCD/tutorial/local-setup.md).

