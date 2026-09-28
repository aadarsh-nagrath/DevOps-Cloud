# Cilium — Complete Notes

## 1. Beginner

### What is Cilium?
- Open-source **networking, observability, and security** layer for Kubernetes (and beyond), built on **eBPF**. Originally created by Isovalent, donated to CNCF, **graduated** in 2023.
- Functions as a **CNI plugin** (pod networking), a **kube-proxy replacement** (service load balancing), a **network policy engine** (L3-L7 aware), and — increasingly — a **service mesh** (sidecar-free, using eBPF instead of proxies).
- One project covering four layers that used to require four separate tools (CNI + kube-proxy + NetworkPolicy controller + service mesh sidecars).

### The Core Problem It Solves
```
Traditional Kubernetes networking stack:
  Pod --> CNI (bridge/veth + iptables rules) --> kube-proxy (more iptables chains,
          O(n) rule evaluation per packet, grows with every Service/Endpoint) --> destination

  Every packet walks a long, linearly-growing chain of iptables rules.
  At a few thousand Services, iptables rule evaluation becomes a measurable
  source of latency and CPU — this is a well-known ceiling, not a rumor.

With Cilium (eBPF):
  Pod --> eBPF program attached to the network interface / socket layer
          (hash-table lookups, O(1) regardless of Service count) --> destination
```
eBPF lets Cilium run custom logic **inside the Linux kernel**, safely and without writing a kernel module — the kernel verifies the eBPF bytecode before loading it, so a buggy program can't crash the kernel. This is the single biggest architectural shift: packet processing, load balancing, and policy enforcement all move from user-space daemons rewriting iptables rules to compiled-in-kernel programs reacting to events directly.

### Core Concepts
| Term | Meaning |
|---|---|
| **eBPF** | Extended Berkeley Packet Filter — a sandboxed VM inside the Linux kernel that runs verified programs attached to hooks (network, syscall, etc.) without kernel modules or recompiling |
| **CNI** | Container Network Interface — the plugin contract Kubernetes uses to set up pod networking; Cilium implements this to assign pod IPs and wire up connectivity |
| **kube-proxy replacement** | Cilium's eBPF-based implementation of Kubernetes Service load balancing, replacing the iptables/IPVS-based kube-proxy entirely |
| **CiliumNetworkPolicy (CNP)** | Cilium's CRD for network policy — superset of Kubernetes `NetworkPolicy`, adds L7 (HTTP/gRPC/Kafka) awareness and DNS-based rules |
| **Identity** | Cilium assigns a security identity to groups of pods (based on labels), not just IPs — policy is enforced on identity, which survives pod restarts/IP churn |
| **Hubble** | Cilium's built-in observability layer — flow visibility, service maps, metrics, all derived from the same eBPF data path |
| **XDP** | eXpress Data Path — an even earlier eBPF hook, at the NIC driver level, used for extremely fast drop/forward decisions (e.g. DDoS mitigation) before packets even reach the normal kernel network stack |

### Architecture
```
                     +----------------------------------+
                     |          Kubernetes Node          |
                     |                                    |
  kube-apiserver <---+---- cilium-agent (DaemonSet, 1/node)
                     |         |         |
                     |         |         +--> manages eBPF programs via bpf syscalls
                     |         |         +--> watches K8s API for Pods/Services/Policies
                     |         |         +--> assigns pod identities, IPAM
                     |         v
                     |   [eBPF programs attached to veth/socket/XDP hooks]
                     |         |
                     |   Pod A <---> Pod B   (same node: direct eBPF-accelerated path)
                     |         |
                     +---------+--------------------------+
                               |
                     [Cilium-managed overlay/native routing to other nodes]
                               |
                     +----------------------------------+
                     |     Other Node (same setup)       |
                     +----------------------------------+

  cilium-operator (Deployment, cluster-wide) — IPAM coordination, CRD management, GC
  Hubble Relay + Hubble UI (optional) — aggregates flow data across all agents
```
- **cilium-agent**: runs as a DaemonSet, one per node — compiles/loads eBPF programs, talks to the kernel, watches the Kubernetes API for Pods, Services, Endpoints, NetworkPolicies, and CiliumNetworkPolicies.
- **cilium-operator**: cluster-wide singleton (or small HA set) handling things that shouldn't run per-node — IP address management coordination, garbage collection, CRD status updates.
- **Hubble**: observability daemon co-located with the agent, streams flow data; **Hubble Relay** aggregates across nodes; **Hubble UI** visualizes it as a live service map.

### Basic Usage — Checking Cilium Status
```bash
cilium status
cilium status --verbose
```

---

## 2. Intermediate

### Cilium as a CNI (Pod Networking)
- On pod creation, the kubelet calls the CNI plugin (Cilium) to set up networking: allocate an IP (via Cilium's IPAM — cluster-scoped, node-scoped, or cloud-provider-integrated like AWS ENI), create the veth pair, attach eBPF programs to it.
- Two datapath modes:

| Mode | How it works | When to use |
|---|---|---|
| **Encapsulation (VXLAN/Geneve)** | Overlay network — pod traffic between nodes is tunneled | Simplest, works on any underlying network, no cloud routing config needed |
| **Native routing** | Pod CIDRs are routed directly via the underlying network's routing tables (BGP or cloud-native routing) | Lower overhead, requires the underlying network/cloud to route pod CIDRs — common on cloud VPCs with native pod networking support |

### Cilium as kube-proxy Replacement
```bash
# Typical Helm install flag
--set kubeProxyReplacement=true
```
- Cilium implements Kubernetes Service load balancing entirely in eBPF, attached at the socket layer for pod-originated traffic (so a Service ClusterIP is resolved to a backend Pod IP **before** the packet even hits the network stack — zero NAT/iptables overhead) and at the network layer for external traffic.
- Eliminates the iptables/IPVS rule chains kube-proxy maintains — no more O(n) rule evaluation growing with Service count, no more periodic full iptables reprogramming on every Service/Endpoint change.
- This is one of Cilium's most cited production wins: clusters with thousands of Services see measurably lower and more consistent latency.

### Network Policy — L3/L4 and L7-Aware
Standard Kubernetes `NetworkPolicy` only understands IP/port (L3/L4). `CiliumNetworkPolicy` adds identity-based rules and **L7 awareness** — it can allow/deny based on the actual HTTP method and path, not just "can talk to port 80."

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: allow-get-only
  namespace: default
spec:
  endpointSelector:
    matchLabels:
      app: backend
  ingress:
    - fromEndpoints:
        - matchLabels:
            app: frontend
      toPorts:
        - ports:
            - port: "8080"
              protocol: TCP
          rules:
            http:
              - method: "GET"
                path: "/api/.*"
```
This rule allows pods labeled `app: frontend` to make **only GET requests matching `/api/.*`** to pods labeled `app: backend` on port 8080 — anything else (POST, DELETE, a different path) is dropped at the eBPF layer, with Cilium transparently injecting an in-kernel L7 proxy (Envoy, under the hood, only for the L7-filtered subset of traffic) to parse HTTP.

Cilium also supports **DNS-based egress policy** — allow egress only to `*.example.com`, resolved and enforced dynamically as DNS responses come back, which is very hard to express in plain iptables/NetworkPolicy.

### Identity-Based Security
- Instead of writing rules against ever-changing pod IPs, Cilium assigns a **security identity** derived from a pod's labels. Policy is written against identities (via label selectors), and the identity-to-IP mapping is maintained by the agents — so a pod restart or IP change doesn't require any policy rewrite.
- Identities are propagated cluster-wide (and cluster-to-cluster in Cluster Mesh) so enforcement stays consistent regardless of which node a pod lands on.

### Hubble — Observability
```bash
cilium hubble enable --ui
cilium hubble port-forward &
hubble observe --namespace default
hubble observe --verdict DROPPED   # see exactly what's being blocked and why
```
Hubble gives you, for free (no app instrumentation needed, since it reads the same eBPF data path Cilium already uses for forwarding):
- A live **service dependency map** in the Hubble UI.
- Per-flow visibility: source/destination identity, verdict (forwarded/dropped), L7 details (HTTP status codes, DNS queries) when L7 visibility/policy is enabled.
- Prometheus metrics export for dashboards and alerting.

---

## 3. Advanced

### Cilium as a Service Mesh
- Traditional service meshes (Istio, Linkerd — see [Service Mesh overview](../../Service%20Mesh/service-mesh-overview.md)) inject a **sidecar proxy** into every pod to get mTLS, L7 routing, and observability — this adds a proxy hop, memory/CPU overhead per pod, and operational complexity (sidecar injection webhooks, proxy upgrades).
- Cilium's **sidecar-free mesh** model does the same job largely in eBPF at the node level, using a **shared per-node Envoy** (not per-pod) only for the L7 features that genuinely need a full proxy (like HTTP routing). mTLS and L3/L4 policy enforcement happen in eBPF without any proxy at all.
- Tradeoff: less mature/feature-complete for very advanced L7 traffic-shaping (canary weights, complex retries) compared to Istio, but meaningfully lower resource overhead and operational surface — a good fit when the primary needs are policy + mTLS + observability rather than fine-grained traffic engineering.

| Aspect | Sidecar mesh (Istio/Linkerd) | Cilium (eBPF, sidecar-free) |
|---|---|---|
| Proxy placement | One proxy container per pod | Shared per-node, only invoked for L7 |
| Resource overhead | Per-pod memory/CPU tax | Lower — no per-pod proxy |
| mTLS | Proxy-terminated | Can be done at the eBPF/kernel layer (with SPIFFE identities) |
| L7 traffic shaping maturity | Very mature (Istio especially) | Improving, less mature for complex routing |
| Operational surface | Sidecar injection, proxy lifecycle, per-pod resource tuning | Node-level agent + operator, no per-pod injection |

### Cluster Mesh
- Cilium **Cluster Mesh** connects the eBPF data planes of multiple Kubernetes clusters, allowing pod-to-pod connectivity, shared service discovery, and consistent identity-based policy **across clusters** — used for multi-region/multi-cluster HA topologies without a separate cross-cluster gateway layer.

### Performance and Scale
- eBPF hash-table-based service lookups are **O(1)**, independent of the number of Services/Endpoints — the primary reason large clusters (thousands of Services) move off iptables-based kube-proxy.
- **XDP mode** attaches eBPF programs at the earliest possible point (NIC driver, before `sk_buff` allocation) for extremely high-throughput drop/forward decisions — useful for DDoS mitigation and very high packet-rate load balancing (Cilium can act as a high-performance L4 load balancer this way).
- BPF map sizes (for connection tracking, service backends, identities) are pre-sized and tunable — undersized maps under heavy churn is a real production failure mode (symptom: intermittent connection drops under load; fix: `cilium config` map-size flags or upgrading to newer Cilium versions with better defaults).

### Security Hardening
- **Encryption**: Cilium supports transparent encryption between nodes via **WireGuard** or **IPsec**, without touching application code — encryption happens in-kernel at the eBPF/datapath layer.
- **eBPF-based mTLS with SPIFFE/SPIRE identities**: emerging pattern for cryptographic workload identity without a sidecar (see [SPIRE](../spire/) if present in this repo for the identity side of this).
- Least-privilege default posture: once any `CiliumNetworkPolicy` selects a pod, all traffic not explicitly allowed is denied — same default-deny model as standard Kubernetes `NetworkPolicy`.

### Common Failure Modes / Debugging
| Symptom | Likely cause | Where to look |
|---|---|---|
| Pods stuck `ContainerCreating` | cilium-agent not ready / CNI conflict with a previously installed CNI | `kubectl -n kube-system logs -l k8s-app=cilium`, check `/etc/cni/net.d` for leftover conflicting configs |
| Intermittent connection drops under load | BPF map exhaustion (conntrack/service map full) | `cilium bpf {ct,nat,lb} list`, `cilium status --verbose` for map pressure |
| Policy not enforcing as expected | Identity not yet propagated, or wrong label selector | `hubble observe --verdict DROPPED`, `cilium identity list`, `cilium endpoint list` |
| Cross-node pod traffic fails, same-node works | Datapath mode mismatch (native routing without proper route propagation) or MTU mismatch with encapsulation | `cilium-dbg` connectivity test, check tunnel/encapsulation config vs actual node routing |
- **`cilium connectivity test`** is the standard first move for any "networking seems broken" investigation — it runs a matrix of pod-to-pod, pod-to-service, and policy-enforcement tests and reports exactly which path is broken.

---

## Quick Revision — Cilium

- eBPF-based CNI + kube-proxy replacement + network policy engine + sidecar-free service mesh, all from one project.
- eBPF = verified programs running inside the kernel, attached to network/socket hooks — no kernel modules, no recompiling.
- Replaces iptables-based kube-proxy with O(1) eBPF hash-table service lookups — the core performance argument at scale.
- `CiliumNetworkPolicy` (CRD) extends Kubernetes `NetworkPolicy` with L7-aware rules (HTTP method/path, DNS-based egress) and identity-based (not IP-based) enforcement.
- **Identity** = derived from pod labels, survives IP/pod churn — this is what makes policy stable in a dynamic cluster.
- **Hubble** = free observability (service map, flow logs, drop reasons) from the same eBPF data path, no app instrumentation.
- As a service mesh: shared per-node Envoy for L7 only, eBPF for L3/L4/mTLS — lighter than sidecar meshes like Istio, less mature for complex L7 traffic shaping.
- **Cluster Mesh** extends identity/policy/connectivity across multiple clusters.
- `cilium connectivity test` and `hubble observe --verdict DROPPED` are the first two debugging moves for any networking issue.
- Encryption (WireGuard/IPsec) is transparent, in-kernel, no app changes needed.

See also: [Service Mesh overview](../../Service%20Mesh/service-mesh-overview.md) for how Cilium's sidecar-free approach compares to Istio/Linkerd, and [Kubernetes notes](../../Kubernetes/kubernetes.md) for the broader control-plane context Cilium plugs into.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
