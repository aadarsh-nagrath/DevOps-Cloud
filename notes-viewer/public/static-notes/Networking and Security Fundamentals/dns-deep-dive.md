# DNS Deep Dive — Complete Notes

## 1. Beginner

### What is DNS?
The **Domain Name System** translates human-readable names (`api.example.com`) into IP addresses (`203.0.113.10`) that computers actually route traffic to. It's a globally distributed, hierarchical, heavily-cached key-value lookup system — one of the internet's oldest and most load-bearing pieces of infrastructure.

### The DNS Hierarchy
```
.                          (root)
└── com                    (TLD — top-level domain)
    └── example.com        (second-level domain, the registered domain)
        └── api.example.com   (subdomain/hostname)
```
- **Root servers** (13 logical root server clusters, `a.root-servers.net`–`m.root-servers.net`, all Anycast) know where the TLD servers are.
- **TLD servers** (`.com`, `.org`, `.io`, country-code TLDs like `.uk`) know where each domain's authoritative nameservers are.
- **Authoritative nameservers** hold the actual records for a domain — this is what you configure in Route 53, Cloudflare, Azure DNS, etc.

### Common DNS Record Types
| Record | Purpose | Example |
|---|---|---|
| **A** | Hostname → IPv4 address | `api.example.com → 203.0.113.10` |
| **AAAA** | Hostname → IPv6 address | `api.example.com → 2606:...` |
| **CNAME** | Alias — hostname → another hostname | `www.example.com → example.com` |
| **MX** | Mail exchange — where email for the domain should go | `example.com → 10 mail.example.com` |
| **TXT** | Free-form text — SPF/DKIM/DMARC, domain verification | `"v=spf1 include:_spf.google.com ~all"` |
| **NS** | Delegates a subdomain/zone to specific nameservers | `example.com → ns1.provider.com` |
| **SOA** | Start of Authority — zone metadata (serial, refresh, TTL defaults) | one per zone |
| **PTR** | Reverse lookup — IP → hostname | `10.113.0.203.in-addr.arpa → api.example.com` |
| **SRV** | Service location — port + host for a specific service | used by SIP, XMPP, some service discovery |
| **CAA** | Restricts which Certificate Authorities may issue TLS certs for the domain | `example.com CAA 0 issue "letsencrypt.org"` |
| **ALIAS/ANAME** | CNAME-like behavior at the zone apex (not standard DNS, provider-specific — e.g. Route 53 "Alias" records) | `example.com → alb-1234.elb.amazonaws.com` |

### The Resolution Flow (Recursive Query)
```
Client → Recursive resolver (ISP/8.8.8.8/1.1.1.1)
              |
              ├── asks Root server → "go ask .com TLD server"
              ├── asks TLD server  → "go ask example.com's nameservers"
              └── asks Authoritative NS → "here's the A record"
              ↓
         Answer cached & returned to client
```
- **Recursive resolver**: does the legwork on the client's behalf (e.g., `8.8.8.8`, `1.1.1.1`, your ISP's resolver, or a corporate DNS server) — this is what your OS actually talks to.
- **Iterative queries**: what the resolver does against root/TLD/authoritative servers — each just says "I don't know, ask them" until it bottoms out at the answer.
- In practice, almost every step is cached (browser cache → OS cache → resolver cache) so a full root→TLD→authoritative walk is rare; most lookups hit a cache within milliseconds.

### TTL (Time To Live)
- Every DNS record has a TTL (seconds) telling resolvers how long to cache it before re-querying.
- **Low TTL** (e.g., 60s): faster propagation of changes (good before a migration/failover), more query load on authoritative servers.
- **High TTL** (e.g., 24h): less query load, cheaper, but slow to propagate changes — bad if you need to fail over quickly. **Lower your TTL in advance of any planned cutover.**

---

## 2. Intermediate

### Authoritative vs Recursive vs Caching Resolvers
| Type | Role |
|---|---|
| Authoritative | Holds the actual zone data for a domain; the "source of truth." (Route 53, Cloudflare, BIND primary) |
| Recursive resolver | Does the full lookup chain on behalf of clients, caches results | (8.8.8.8, 1.1.1.1, ISP resolver) |
| Stub resolver | The tiny client-side resolver in your OS that just forwards queries to a configured recursive resolver | `/etc/resolv.conf`, Windows DNS client |
| Forwarding resolver | Doesn't resolve itself — forwards to another resolver (common in corporate/split-horizon setups) | internal DNS server forwarding external queries upstream |

### Split-Horizon (Split-Brain) DNS
Serving **different answers** for the same domain name depending on who's asking — e.g., `internal-api.example.com` resolves to a private `10.x` IP inside the VPC, but is unresolvable (or resolves differently) from the public internet. Used heavily in cloud setups (AWS Route 53 Private Hosted Zones, Azure Private DNS Zones) to keep internal service names off the public internet without a VPN.

### Common `dig` Usage
```bash
dig example.com                 # basic A record lookup
dig example.com MX               # specific record type
dig +short example.com           # just the answer, no verbose output
dig @8.8.8.8 example.com         # query a specific resolver directly
dig +trace example.com           # show the full root → TLD → authoritative walk
dig -x 203.0.113.10              # reverse lookup (PTR)
```

### DNS Round Robin & Health-Checked Records
- **Round robin**: return multiple A records for one name; clients typically try them in order or randomly — crude load distribution, no health awareness.
- **Health-checked / weighted / latency-based routing** (Route 53 routing policies, Cloudflare Load Balancing): DNS answers change based on backend health checks or geography — see [DNS & Global Load Balancing](../Load%20Balancing/dns-and-global-load-balancing.md) for the full pattern including GeoDNS and Anycast.

### Kubernetes DNS (CoreDNS)
- Every Service gets a DNS name automatically: `<service>.<namespace>.svc.cluster.local`.
- **CoreDNS** runs as a cluster addon, watches the Kubernetes API for Services/Endpoints, and serves records dynamically — no manual record management.
- Pods' `/etc/resolv.conf` points at the CoreDNS ClusterIP with a search-domain list (`<namespace>.svc.cluster.local`, `svc.cluster.local`, `cluster.local`), which is why a short name like `my-service` resolves from within the same namespace.
- See [Kubernetes Networking](../Kubernetes/Networking.md) and [Kubernetes Doubts](../Kubernetes/k8-doubts.md) for the practical Service/DNS interaction.

### DNS-Based Service Discovery vs SRV Records
Some ecosystems (Consul, older SIP/XMPP systems) encode both host *and port* in DNS via **SRV records**, enabling dynamic service discovery without a separate registry — largely superseded in cloud-native stacks by Kubernetes Services + a control plane, but still relevant when integrating with legacy or VM-based service discovery.

---

## 3. Advanced

### DNSSEC (DNS Security Extensions)
- Problem it solves: plain DNS responses are **unauthenticated** — a malicious resolver or an on-path attacker (cache poisoning / spoofing) can return a forged answer, and the client has no way to detect it.
- DNSSEC adds a chain of cryptographic signatures (RRSIG records) from the root down through each delegation (DS records at each parent zone), so a validating resolver can verify a response actually came from the legitimate authoritative source and wasn't tampered with.
- **What DNSSEC does NOT do**: it does not encrypt queries (anyone on the path can still see what you're looking up) — that's a separate concern, addressed by DoT/DoH below. It only provides **authenticity/integrity**, not **confidentiality**.
- Adoption is uneven — many domains still don't sign their zones, and misconfigured DNSSEC (expired signatures) is a well-known way to cause a total, hard-to-diagnose outage.

### DoT / DoH (Encrypted DNS Transport)
- **DNS over TLS (DoT, port 853)** and **DNS over HTTPS (DoH, port 443)**: encrypt the query/response between client and resolver, preventing on-path eavesdropping/tampering of the *transport* (complementary to DNSSEC's authenticity guarantee on the *data*).
- Increasingly built into browsers (Firefox/Chrome DoH) and OSes — relevant to DevOps mainly as a troubleshooting gotcha: a browser using DoH may bypass your carefully configured internal split-horizon DNS entirely.

### Cache Poisoning & Mitigations
- Classic attack: race a forged DNS response to a resolver before the legitimate authoritative answer arrives, poisoning the resolver's cache for all its clients.
- Mitigations: **source port randomization** + **query ID randomization** (raises the guessing difficulty enormously — the original Kaminsky attack fix), DNSSEC validation, and 0x20 encoding (randomizing query name capitalization as an extra entropy source).

### Propagation & Migration Playbook
1. **Lower TTL** on the record(s) you're about to change, well before the change (at least one old-TTL-period in advance).
2. Make the change.
3. Wait out the *old* (long) TTL to guarantee all caches have expired — don't assume it's instant.
4. Verify from multiple vantage points (`dig @8.8.8.8`, `dig @1.1.1.1`, a tool like `dnschecker.org`-style multi-region check) since caches differ by resolver/region.
5. Restore TTL to normal once stable.
This is the standard procedure behind any DNS-based failover, cutover, or migration — see [DR Planning, Testing & Runbooks](../Backup%20and%20Disaster%20Recovery/dr-planning-testing-and-runbooks.md) for how this fits into a broader failover runbook.

### NXDOMAIN, SERVFAIL & Troubleshooting Decision Tree
- **NXDOMAIN**: the name genuinely doesn't exist in the zone — check for typos, missing record, or zone delegation issues.
- **SERVFAIL**: the resolver couldn't get a valid answer — often DNSSEC validation failure, authoritative server down/unreachable, or a misconfigured/broken delegation (NS records pointing at servers that don't actually serve the zone).
- **Long/variable latency, no error**: usually cache misses forcing a full resolution walk, or a slow/overloaded authoritative server, or a resolver forwarding through several hops.
- Decision tree: `dig +trace` to see exactly where resolution breaks down → confirm NS delegation matches at both parent and child → confirm authoritative servers actually answer directly (`dig @<authoritative-ns> ...`) → then suspect resolver-side caching/config last.

### DNS at Scale — Anycast
Large-scale authoritative DNS (root servers, major providers, CDNs) is served via **Anycast**: the same IP address is announced via BGP from many geographically distributed locations, and routers naturally send each client to the topologically nearest instance — giving low latency and inherent DDoS resilience (attack traffic is absorbed and spread across all Anycast sites rather than hitting one origin).

---

## Quick Revision — DNS
- Hierarchy: root → TLD → authoritative nameservers; recursive resolvers do the walking and caching on the client's behalf.
- Know the record types cold: A/AAAA, CNAME, MX, TXT, NS, SOA, PTR, SRV, CAA.
- TTL trade-off: low = fast propagation/more load, high = cheap/slow to change — lower it *before* a planned cutover.
- Split-horizon DNS serves different answers based on requester location/network — how private cloud DNS zones work.
- DNSSEC = authenticity/integrity (signed responses), NOT confidentiality — DoT/DoH covers the encryption-in-transit gap separately.
- CoreDNS in Kubernetes auto-generates `<svc>.<namespace>.svc.cluster.local` records from the API server's Service/Endpoints state.
- Migration playbook: lower TTL → change → wait out old TTL → verify from multiple resolvers → restore TTL.
- `dig +trace` is the single best tool for diagnosing where a DNS resolution chain is actually breaking.

## Related Notes
- [Networking & Security Fundamentals — Index](index.md)
- [DNS & Global Load Balancing](../Load%20Balancing/dns-and-global-load-balancing.md)
- [Kubernetes Networking](../Kubernetes/Networking.md)
- [TLS & Certificates](tls-and-certificates.md)
- [DR Planning, Testing & Runbooks](../Backup%20and%20Disaster%20Recovery/dr-planning-testing-and-runbooks.md)
