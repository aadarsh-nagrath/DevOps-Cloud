# VPNs — Complete Notes

## 1. Beginner

### What is a VPN?
A **Virtual Private Network** creates an encrypted, authenticated tunnel over an untrusted network (typically the public internet), making remote traffic behave as if it were on a private, trusted network. Two big use-case families:
1. **Remote access VPN**: an individual device connects into a private network (e.g., an engineer's laptop connecting to a company's internal network/VPC).
2. **Site-to-site VPN**: two networks (e.g., an on-prem data center and a cloud VPC, or two VPCs) are permanently connected as if they were one network.

### Why VPNs Matter for DevOps
- Reaching private cloud resources (databases, internal admin panels, Kubernetes API servers) that are deliberately **not** exposed to the public internet — the correct default posture per [Firewalls](firewalls.md#default-deny-vs-default-allow).
- Hybrid cloud connectivity — linking on-prem infrastructure to AWS/Azure/GCP VPCs.
- Multi-region/multi-cloud private connectivity between VPCs that don't otherwise share a network.

### Tunneling — The Core Concept
A VPN **encapsulates** one packet inside another: your original private-network packet becomes the *payload* of a new packet that travels across the public internet, then gets unwrapped at the other end. This is what makes a private `10.x` address reachable across a public network without ever actually routing that private address on the public internet.

### VPN Protocols at a Glance
| Protocol | Layer | Notes |
|---|---|---|
| **IPsec** | L3 | Industry-standard, works at the IP layer, transparent to applications, the default for most site-to-site cloud VPNs |
| **OpenVPN** | L4 (over TCP/UDP) | Mature, widely supported, SSL/TLS-based, flexible but heavier and more complex config |
| **WireGuard** | L3 | Modern, minimal codebase (~4,000 lines vs OpenVPN's ~100,000), state-of-the-art crypto only, very fast |
| **L2TP/PPTP** | L2/L2 | Legacy, PPTP is cryptographically broken — **do not use PPTP today** |
| **SSL VPN (e.g., via a portal)** | L7-ish | Application-level access through a browser, no full network tunnel — closer to ZTNA in spirit |

---

## 2. Intermediate

### IPsec Deep Dive
IPsec is actually a suite of protocols, not one thing:
- **IKE (Internet Key Exchange, UDP 500/4500)**: negotiates and establishes the security association (SA) — the shared keys and algorithms both ends will use. IKEv2 is the modern standard (faster reconnection, built-in NAT traversal, mobility support — a laptop switching WiFi-to-cellular can keep the tunnel alive).
- **ESP (Encapsulating Security Payload, IP protocol 50)**: the actual data-carrying protocol — encrypts and authenticates the payload. Almost always used over AH (Authentication Header, protocol 51) in practice, since AH provides no encryption, only integrity.
- **Two modes**:
  - **Transport mode**: encrypts only the payload, keeps the original IP header — used for host-to-host.
  - **Tunnel mode**: encrypts the entire original packet (including its IP header) and wraps it in a new one — used for site-to-site/gateway VPNs, which is what almost all cloud VPN products use.

### Cloud Site-to-Site VPN (AWS Example, Generalizes to Azure/GCP)
```
On-prem router/firewall  <--IPsec tunnel-->  AWS Virtual Private Gateway (VGW) or Transit Gateway
                                                      |
                                                 attached to VPC route tables
```
- AWS Site-to-Site VPN provisions **two tunnels** (to two different AWS endpoints) for redundancy — always configure your on-prem side to use both, not just one, or you lose the HA benefit.
- Static routing (manually specify remote CIDRs) or **BGP dynamic routing** (routes exchanged automatically, supports automatic failover between the two tunnels) — BGP is the recommended production pattern.
- Alternative for very high bandwidth/low-latency needs: **Direct Connect** (AWS) / **ExpressRoute** (Azure) — a dedicated physical/private circuit, not internet-tunneled at all; often paired *with* IPsec on top for encryption-in-transit even over the private circuit.

### OpenVPN
- Runs over TLS for the control channel (key exchange, auth) and encrypts the data channel — flexible (can run over TCP for firewall-traversal-friendliness or UDP for performance), supports certificate-based or username/password auth, widely supported across every OS and consumer router.
- Config complexity and larger attack surface (a much bigger codebase than WireGuard) are its main downsides at this point — still extremely common but increasingly being replaced by WireGuard for new deployments.

### WireGuard
- Designed for simplicity and auditability — a tiny, modern codebase using only current best-practice cryptography (Curve25519, ChaCha20, Poly1305, BLAKE2), no cipher negotiation/agility (deliberately — fewer options means fewer misconfiguration/downgrade-attack possibilities).
- Configuration is refreshingly minimal — each peer just needs the other's public key and endpoint:
```ini
# /etc/wireguard/wg0.conf
[Interface]
PrivateKey = <server-private-key>
Address = 10.100.0.1/24
ListenPort = 51820

[Peer]
PublicKey = <client-public-key>
AllowedIPs = 10.100.0.2/32
```
```bash
wg-quick up wg0
wg show          # inspect active peers/handshakes
```
- Runs as an in-kernel module on Linux (extremely fast) with userspace implementations elsewhere — this is why it consistently outperforms IPsec/OpenVPN in throughput/latency benchmarks.
- Increasingly the default choice for new remote-access and even site-to-site setups, and the underlying tunnel technology inside consumer-friendly zero-trust products like Tailscale/Netbird (see Advanced section).

### Split Tunneling vs Full Tunneling
| | Split Tunneling | Full Tunneling |
|---|---|---|
| Behavior | Only traffic destined for the private network goes through the VPN; everything else (general internet browsing) goes direct | ALL traffic, including general internet browsing, routes through the VPN |
| Pros | Lower latency for non-VPN traffic, less load on the VPN gateway | Centralized security policy enforcement/monitoring, single egress IP |
| Cons | Weaker security posture (VPN gateway can't see/control all client traffic) | Higher latency, higher bandwidth cost at the gateway, single point of congestion |
| Typical use | Most modern remote-access VPNs (engineer just needs internal resource access) | Regulated/high-security environments requiring full traffic inspection |

---

## 3. Advanced

### VPN Gateway High Availability
- Cloud VPN gateways are typically deployed in active/passive or active/active pairs across separate infrastructure — always provision **both tunnels** a provider offers and let BGP handle failover rather than relying on a single tunnel.
- On-prem side needs equivalent redundancy (dual firewalls/routers) or the cloud side's redundancy is wasted — HA has to be symmetric on both ends of the tunnel to actually deliver HA.

### Zero Trust Network Access (ZTNA) — The Evolution Beyond Traditional VPN
Traditional remote-access VPN grants broad network-level access once connected ("you're on the VPN, you can reach anything on that subnet"). ZTNA instead grants **per-application, identity-verified access** — closer to the [zero trust](index.md#zero-trust-the-thread-connecting-all-six-files) model:
- **Tailscale / Netbird**: build a mesh overlay network on top of WireGuard, with identity-based (SSO-integrated) access control per-device/per-service instead of one flat private subnet — dramatically simpler to operate than traditional hub-and-spoke VPN infrastructure, no central VPN concentrator bottleneck.
- **Cloudflare Access / Google BeyondCorp / similar ZTNA products**: broker access to individual internal applications through an identity-aware proxy — the user often never gets a routable IP on the internal network at all, just a proxied, authenticated connection to the one app they're authorized for.
- **Why this matters operationally**: a compromised traditional-VPN credential/device can pivot to anything reachable on that subnet; a compromised ZTNA session is scoped to only the specific app(s) it was authorized for — directly limits blast radius, same principle as [micro-segmentation](firewalls.md#network-segmentation--micro-segmentation).

### VPN vs Service Mesh mTLS (Where Do They Overlap?)
- VPN: network-level tunnel, typically for **human → private network** or **network → network** connectivity.
- Service mesh mTLS: **service → service** authenticated encryption *within* an already-private network (see [Service Mesh Security](../Service%20Mesh/security-and-mtls.md)).
- They're complementary layers, not substitutes — a VPN might get an engineer or an on-prem system into the VPC, while mTLS secures the service-to-service traffic once inside it.

### Performance Considerations
- **MTU overhead**: every tunneling protocol adds encapsulation headers, shrinking effective MTU — misconfigured MTU on a VPN interface is a classic cause of mysteriously failing large transfers/TLS handshakes while small pings succeed (see [MTU & Fragmentation](networking-fundamentals.md#mtu--fragmentation)).
- **Encryption CPU cost**: IPsec/OpenVPN can be CPU-bound at high throughput without hardware AES-NI acceleration; WireGuard's lighter modern ciphers and in-kernel implementation generally need less CPU per Mbps.
- **NAT traversal**: IKEv2/IPsec and WireGuard both handle NAT traversal (UDP encapsulation) reasonably well for remote clients behind home routers/CGNAT; older protocols can require manual NAT-T configuration.

### Common Pitfalls
- Only configuring one of the two redundant tunnels a cloud VPN offers, silently losing HA.
- Using static routing when BGP dynamic routing was available — manual route management doesn't scale and doesn't auto-failover.
- Full-tunneling all traffic "for security" without provisioning enough gateway bandwidth/egress capacity — becomes a self-inflicted bottleneck.
- Treating "connected to the VPN" as equivalent to "authorized for everything on that subnet" — the exact anti-pattern ZTNA exists to fix.
- Forgetting that a VPN tunnel is only as secure as the weakest client endpoint — an engineer's compromised laptop with an active VPN session is a direct bridge into the private network; endpoint hardening (see [hardening-practices.md](hardening-practices.md)) matters as much as the tunnel crypto itself.

---

## Quick Revision — VPNs
- Tunneling = encapsulating a private packet inside a public one; the core mechanism behind every VPN protocol.
- IPsec = IKE (key exchange) + ESP (data encryption), transport mode (host-to-host) vs tunnel mode (gateway-to-gateway, what cloud VPNs use).
- WireGuard: minimal codebase, modern fixed cipher set, in-kernel performance — the modern default for new deployments.
- OpenVPN: mature, flexible, TLS-based, larger attack surface than WireGuard.
- Site-to-site cloud VPNs provision two redundant tunnels — always use both; prefer BGP dynamic routing over static routes.
- Split tunneling = only private traffic through the VPN (lower latency, weaker central control); full tunneling = everything through it.
- ZTNA (Tailscale, BeyondCorp, Cloudflare Access) replaces broad network-level VPN access with per-application, identity-verified access — smaller blast radius if compromised.
- VPN gets you *into* a private network; mTLS/service mesh secures traffic *within* it — complementary, not competing, layers.

## Related Notes
- [Networking & Security Fundamentals — Index](index.md)
- [Firewalls](firewalls.md)
- [Service Mesh Security & mTLS](../Service%20Mesh/security-and-mtls.md)
- [Cloud Networking for DevOps](../Cloud/Cloud-Networking-for-DevOps.md)
- [Networking Fundamentals](networking-fundamentals.md) — MTU/fragmentation background referenced above
