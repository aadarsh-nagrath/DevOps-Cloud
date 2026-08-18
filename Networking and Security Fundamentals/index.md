# Networking & Security Fundamentals — Master Notes

The foundational networking/security knowledge that every other topic in this repo assumes: how packets actually move, how names resolve, how encryption is established, and how the perimeter is controlled and hardened. Structured beginner → intermediate → advanced. Each topic has its own deep-dive file; this is the map + the concepts that tie them together.

## Folder Map
- [networking-fundamentals.md](networking-fundamentals.md) — OSI/TCP-IP model, TCP vs UDP, ports & well-known protocols, subnetting, NAT
- [dns-deep-dive.md](dns-deep-dive.md) — record types, resolution flow, authoritative vs recursive, DNSSEC, troubleshooting
- [tls-and-certificates.md](tls-and-certificates.md) — TLS handshake, PKI/cert chains, cipher suites, mTLS, ACME/Let's Encrypt
- [firewalls.md](firewalls.md) — stateless vs stateful, iptables/nftables, cloud security groups/NACLs, WAF, segmentation
- [vpns.md](vpns.md) — IPsec, OpenVPN, WireGuard, site-to-site vs remote access, zero-trust mesh (Tailscale/ZTNA)
- [hardening-practices.md](hardening-practices.md) — CIS benchmarks, SSH/OS hardening, patching, least privilege, checklists

---

## 1. Beginner — How This All Fits Together

### The Request Path (Mental Model)
A single `https://api.example.com/users` request touches nearly every topic in this folder:
```
1. DNS      → resolve api.example.com to an IP           (dns-deep-dive.md)
2. Routing  → packets traverse networks to reach that IP  (networking-fundamentals.md)
3. Firewall → each hop's firewall/security group permits the port  (firewalls.md)
4. TLS      → client and server negotiate encryption, verify identity  (tls-and-certificates.md)
5. (If remote/internal) VPN → private network access without public exposure  (vpns.md)
6. Server   → OS/service was hardened to reduce attack surface before any of this mattered  (hardening-practices.md)
```

### Why This Belongs in a DevOps Repo
- [Load Balancing](../Load%20Balancing/load-balancing-overview.md), [Service Mesh](../Service%20Mesh/service-mesh-overview.md), and [Cloud Networking](../Cloud/Cloud-Networking-for-DevOps.md) notes all assume the reader already knows TCP/UDP, DNS, TLS, and firewall concepts — this folder is the prerequisite layer underneath them.
- [Security in DevOps](../Security%20in%20DevOps/devsecops-overview.md) covers pipeline/supply-chain/IAM security; this folder covers **network and host** security specifically — they're complementary, not overlapping.

### Layered Defense — The Big Picture
Security here is never one control — it's layers, each assuming the one before it can fail:
1. **Network perimeter**: firewalls/security groups/NACLs limit what can even reach a host or port.
2. **Transport encryption**: TLS/mTLS ensures traffic that does get through can't be read or tampered with in transit.
3. **Private connectivity**: VPNs/zero-trust mesh keep internal services off the public internet entirely.
4. **Host hardening**: even if network controls are bypassed, a hardened host limits blast radius (least privilege, minimal attack surface, patched software).
This is **defense in depth** — the same principle covered at the pipeline level in [DevSecOps Overview](../Security%20in%20DevOps/devsecops-overview.md).

---

## 2. Intermediate — Cross-Cutting Concepts

### Trust Boundaries
Every architecture diagram should mark where trust changes: public internet → edge/WAF → DMZ/load balancer → app tier → data tier. Each boundary is where a firewall rule, a TLS termination point, or a VPN gateway typically lives. Mapping trust boundaries first makes the rest of the design (which ports, which certs, which VPN) fall out naturally.

### East-West vs North-South Traffic
- **North-south**: traffic entering/leaving the network (client → edge). Governed by edge firewalls, WAFs, ingress TLS termination.
- **East-west**: traffic between internal services (service A → service B). Governed by internal firewall rules/NetworkPolicies, and increasingly by [service mesh mTLS](../Service%20Mesh/security-and-mtls.md) rather than perimeter firewalls alone — see **zero trust** below.

### Zero Trust (the thread connecting all six files)
Traditional model: "inside the firewall = trusted." Zero trust model: **never trust, always verify** — every request is authenticated and encrypted regardless of network location.
- DNS: split-horizon/private DNS scopes what's even resolvable internally.
- TLS: mTLS authenticates *both* sides of every connection, not just the server.
- Firewalls: micro-segmentation (deny-by-default between every workload pair, not just at the edge).
- VPNs: increasingly replaced/augmented by ZTNA (Zero Trust Network Access) — per-application access instead of full network access.
- Hardening: least-privilege host/service accounts so a compromised node can't pivot freely even after getting network access.

---

## 3. Advanced — Where This Shows Up in Production

### Incident Scenarios That Require All Six
- **Cert expiry outage**: TLS cert silently expired → sudden 100% error rate → root cause is in `tls-and-certificates.md`, but detection ties to [monitoring/alerting](../Monitoring%20and%20Loggin/index.md) and the fix ties to automated renewal (ACME).
- **DNS TTL propagation delay during failover**: a region fails over but clients keep hitting the dead IP for minutes — ties `dns-deep-dive.md` to [DR planning](../Backup%20and%20Disaster%20Recovery/disaster-recovery-strategies.md).
- **Overly-permissive security group found in audit**: `0.0.0.0/0` on port 22 — ties `firewalls.md` to [IaC policy-as-code](../IaC%20Testing%20and%20Policy%20as%20Code/policy-as-code-with-opa-and-conftest.md) that should have blocked it before merge.
- **Lateral movement after a single pod compromise**: no NetworkPolicy + no mTLS = attacker moves freely — ties `firewalls.md` + [service mesh security](../Service%20Mesh/security-and-mtls.md) together.

### Quick Comparison — Where Each Control Lives
| Layer | Cloud-native control | Traditional/on-prem control |
|---|---|---|
| DNS | Route 53 / Cloud DNS / Azure DNS | BIND, Windows DNS |
| Firewall (edge) | Security Groups, NACLs, Cloud Armor/WAF | Perimeter firewall appliance |
| Firewall (host) | — | iptables/nftables, Windows Firewall |
| Firewall (pod/service) | Kubernetes NetworkPolicy, Cilium | — |
| TLS termination | ALB/NLB, Cloud Load Balancer, Ingress | Nginx/HAProxy/F5 |
| VPN | AWS Client VPN/Site-to-Site VPN, Azure VPN Gateway | IPsec appliance, OpenVPN server |
| Zero-trust mesh | Tailscale, Cloudflare Access, service mesh mTLS | — |

---

## 4. Interview / Revision Quick-Fire
- Walk through what happens between typing a URL and the page rendering (DNS → TCP handshake → TLS handshake → HTTP request).
- TCP vs UDP — which for a video call, which for a bank transfer, and why?
- What's the difference between a stateful and a stateless firewall?
- Explain the TLS handshake and where certificate validation happens.
- What's the difference between a Security Group and a NACL in AWS?
- IPsec vs WireGuard — why is WireGuard's codebase so much smaller?
- What is DNSSEC protecting against, and what does it NOT protect against?
- What does "zero trust" mean, and how does mTLS support it?
- Name three CIS-benchmark-style hardening steps for a fresh Linux server.
