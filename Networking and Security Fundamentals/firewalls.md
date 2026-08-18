# Firewalls — Complete Notes

## 1. Beginner

### What is a Firewall?
A firewall is a control point that permits or denies network traffic based on a rule set — the fundamental building block of network segmentation and perimeter defense. Firewalls exist at multiple layers: network edge, host OS, and (in cloud-native environments) the pod/service level.

### Stateless vs Stateful
| | Stateless | Stateful |
|---|---|---|
| How it decides | Evaluates each packet independently against static rules | Tracks connection state (a "connection table") and allows return traffic automatically |
| Rule complexity | Must explicitly allow both directions (request AND response) | Only need to allow the *initiating* direction; return traffic is auto-permitted |
| Example | AWS Network ACLs (NACLs), old packet-filter routers | iptables/nftables (in default mode), AWS Security Groups, most modern firewalls |
| Performance | Faster (no state tracking overhead) | Slightly more overhead, but standard on all modern hardware |

**Rule of thumb**: almost everything you configure today is stateful by default. NACLs (explicitly stateless) are the one common exception DevOps engineers actually hit, which is exactly why they trip people up (see Cloud section below).

### Default-Deny vs Default-Allow
- **Default-deny (whitelist model)**: block everything, explicitly allow only what's needed. **This is the correct default posture** — minimizes attack surface, forces intentional exposure.
- **Default-allow (blacklist model)**: allow everything, explicitly block known-bad. Rare/discouraged in modern setups except for very specific outbound-traffic edge cases.

### Firewall Types by Layer
| Type | Operates at | Examples |
|---|---|---|
| Packet filter | L3/L4 (IP, port) | iptables, Security Groups, NACLs |
| Stateful inspection | L3/L4 + connection state | iptables/nftables conntrack, most cloud SGs |
| Proxy/Application (L7) | L7, understands HTTP/app protocols | WAF, API Gateway, reverse proxy ACLs |
| Next-Gen Firewall (NGFW) | L3-L7 combined + deep packet inspection, IDS/IPS | Palo Alto, Fortinet (mostly enterprise/on-prem) |

---

## 2. Intermediate

### iptables (Linux, Legacy but Still Everywhere)
- Rules organized into **tables** (`filter`, `nat`, `mangle`, `raw`) and **chains** (`INPUT`, `OUTPUT`, `FORWARD` for the filter table; `PREROUTING`/`POSTROUTING` for NAT).
- `INPUT`: traffic destined for this host. `OUTPUT`: traffic originating from this host. `FORWARD`: traffic passing through this host (acting as a router).
```bash
# Default-deny inbound, allow established/related return traffic, allow SSH + HTTPS
iptables -P INPUT DROP
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Persist rules (Debian/Ubuntu)
apt install iptables-persistent && netfilter-persistent save
```
- Rules are evaluated **top to bottom, first match wins** — rule ordering matters enormously; a broad `ACCEPT` early can silently defeat later, more specific `DROP` rules.

### nftables (Modern Replacement for iptables)
- Successor framework, unifies IPv4/IPv6/ARP/bridge filtering into one syntax, better performance at scale, native set/map data structures (efficient IP-list matching without one rule per IP).
```bash
nft add table inet filter
nft add chain inet filter input { type filter hook input priority 0 \; policy drop \; }
nft add rule inet filter input ct state established,related accept
nft add rule inet filter input tcp dport { 22, 443 } accept
```
- Most modern Linux distros ship nftables as the backend even when you still type `iptables` commands (via an `iptables-nft` compatibility shim) — worth knowing which one you're actually running (`iptables --version`).

### Cloud Firewalls: Security Groups vs NACLs (AWS Model, Generalizes to Azure NSGs/GCP Firewall Rules)
| | Security Group | NACL |
|---|---|---|
| Applies to | Instance/ENI level | Subnet level |
| State | Stateful (return traffic auto-allowed) | **Stateless** (must explicitly allow both directions) |
| Rule evaluation | All rules evaluated, most-permissive wins (only "allow" rules exist) | Rules evaluated **in numbered order**, first match wins (supports explicit "deny") |
| Default | Default-deny inbound, default-allow outbound | Default varies (default NACL allows all; custom NACLs default-deny) |
| Typical use | Primary, fine-grained per-instance control | Coarse subnet-level backstop / explicit deny rules SGs can't express |

**Classic NACL gotcha**: allowing inbound port 443 but forgetting the **ephemeral port range** (1024-65535) outbound — since NACLs are stateless, the *response* to an inbound request needs its own explicit outbound rule, unlike Security Groups where it's automatic.

### Host-Based Firewalls (Simplified Frontends)
- **ufw** (Ubuntu): `ufw allow 443/tcp`, `ufw enable` — friendly wrapper over iptables.
- **firewalld** (RHEL/CentOS/Fedora): zone-based model (`public`, `internal`, `trusted`), `firewall-cmd --add-service=https --permanent`.
- **Windows Firewall**: GUI/PowerShell (`New-NetFirewallRule`), profile-based (Domain/Private/Public).

### Kubernetes NetworkPolicy
- The Kubernetes-native firewall — default is **allow-all** between pods until a NetworkPolicy selects them, at which point it becomes default-deny for the traffic types the policy covers.
- Requires a CNI plugin that actually implements NetworkPolicy enforcement (Calico, Cilium; the default `kubenet`/some overlay CNIs do NOT enforce it silently — a common false sense of security).
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all-default
  namespace: prod
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: prod
spec:
  podSelector:
    matchLabels: { app: backend }
  ingress:
    - from:
        - podSelector: { matchLabels: { app: frontend } }
      ports:
        - protocol: TCP
          port: 8080
```
See [Kubernetes Networking](../Kubernetes/Networking.md) and [Good Practice Networking](../Kubernetes/good-practice-networking.md) for the broader pod networking model this sits inside.

### WAF (Web Application Firewall)
An L7 firewall specifically for HTTP(S) traffic — inspects request content (not just IP/port) to block SQLi, XSS, known bad bot patterns, OWASP Top 10-style attacks. Cloud-native options: AWS WAF, Cloudflare, Azure Front Door WAF, GCP Cloud Armor — typically attached directly to a load balancer/CDN/API Gateway. Complements, doesn't replace, network-layer firewalls — see [SAST, DAST & Code Scanning](../Security%20in%20DevOps/sast-dast-and-code-scanning.md) for the application-security side WAF backstops.

---

## 3. Advanced

### Network Segmentation & Micro-Segmentation
- **Traditional segmentation**: VLANs/subnets + firewall rules between them (DMZ, app tier, data tier) — coarse-grained, perimeter-focused.
- **Micro-segmentation**: deny-by-default between *every individual workload pair*, not just network zones — the practical implementation of [zero trust](index.md#zero-trust-the-thread-connecting-all-six-files). In Kubernetes this is NetworkPolicy (or Cilium's richer L7-aware policies); in a service mesh it's paired with mTLS identity so segmentation is based on cryptographic workload identity, not just IP (which is unstable/reused constantly in dynamic environments).

### Egress Filtering (The Commonly-Skipped Half)
Most firewall effort goes into inbound rules; egress is often left wide open. This is a mistake:
- A compromised workload with unrestricted egress can exfiltrate data or call out to a C2 (command & control) server freely.
- **Egress allowlisting** (only permit outbound to known package registries, APIs, cloud metadata endpoints) meaningfully limits blast radius after a compromise — increasingly standard in hardened Kubernetes clusters (Cilium `FQDN` egress policies) and hardened CI runners (see [Supply Chain Security](../Security%20in%20DevOps/supply-chain-security.md)).

### DDoS Mitigation Layers
1. **Anycast absorption** at the edge (CDN/cloud provider spreads attack traffic across many global PoPs).
2. **Rate limiting** at L4/L7 (per-IP connection/request caps).
3. **SYN cookies** (stateless handshake validation, see [Networking Fundamentals](networking-fundamentals.md#connection-scaling-concepts)) to survive SYN floods without exhausting connection tables.
4. **WAF/behavioral filtering** for application-layer floods that look like legitimate traffic volume-wise but aren't.
- Cloud-managed DDoS protection (AWS Shield, Cloudflare, Azure DDoS Protection) handles most of this transparently — worth knowing what layer each one operates at when diagnosing an actual incident.

### IDS/IPS (Intrusion Detection/Prevention Systems)
- **IDS**: passively monitors traffic, alerts on suspicious patterns (signature-based or anomaly-based) — doesn't block.
- **IPS**: inline, actively blocks matched traffic in real time — a firewall with deep packet inspection and a threat signature database.
- Open-source examples: Suricata, Snort. In cloud-native stacks, this role is increasingly absorbed by eBPF-based tools (Cilium Tetragon, Falco) doing runtime behavioral detection at the kernel level rather than classic network-level signature matching.

### eBPF-Based Firewalling (Cilium)
Modern approach: instead of iptables' linear rule-list evaluation (which degrades at scale with thousands of rules), Cilium uses eBPF programs attached at the kernel network hooks — evaluates policy via efficient hash-map lookups, supports L3/L4/L7-aware policies (e.g., "allow GET but not DELETE on this HTTP path") natively as Kubernetes NetworkPolicy/CiliumNetworkPolicy, and scales far better in large clusters.

### Firewall Rule Hygiene & Audit
- **Rule sprawl**: firewalls accumulate stale "temporary" rules that never get removed — periodic audits (manual or automated via [IaC policy-as-code](../IaC%20Testing%20and%20Policy%20as%20Code/policy-as-code-with-opa-and-conftest.md)) are necessary.
- **Automated guardrails**: block `0.0.0.0/0` on sensitive ports (22, 3389, database ports) at the CI/PR stage via Checkov/tfsec/OPA before merge — cheaper than finding it in a security audit after the fact. See [Linting & Static Analysis](../IaC%20Testing%20and%20Policy%20as%20Code/linting-and-static-analysis.md).
- **Least privilege**: scope rules to the narrowest CIDR/security-group-reference possible — prefer "allow from this specific security group" over "allow from this CIDR" wherever the traffic source is another managed resource, since it self-updates as that resource's IPs change.

---

## Quick Revision — Firewalls
- Stateful (auto-allows return traffic) is the default everywhere except AWS NACLs, which are explicitly stateless — the classic gotcha is forgetting ephemeral-port outbound rules on a NACL.
- Default-deny inbound is the correct baseline posture; scope every rule to the narrowest source/port needed.
- iptables/nftables = host/Linux packet filtering; Security Groups/NACLs = cloud equivalents; NetworkPolicy = Kubernetes equivalent.
- NetworkPolicy is default-allow until *something* selects a pod — and only enforced if your CNI actually implements it (Calico/Cilium do; some don't).
- WAF operates at L7 for HTTP-specific threats (SQLi/XSS) — complements, not replaces, network-layer firewalls.
- Egress filtering is the commonly-neglected half of firewall design — critical for limiting blast radius after a compromise.
- eBPF (Cilium) is the modern, scalable alternative to linear iptables rule evaluation, with native L7-aware policy support.

## Related Notes
- [Networking & Security Fundamentals — Index](index.md)
- [Kubernetes Networking](../Kubernetes/Networking.md)
- [Service Mesh Security & mTLS](../Service%20Mesh/security-and-mtls.md)
- [Supply Chain Security](../Security%20in%20DevOps/supply-chain-security.md)
- [Policy as Code with OPA & Conftest](../IaC%20Testing%20and%20Policy%20as%20Code/policy-as-code-with-opa-and-conftest.md)
- [VPNs](vpns.md)
