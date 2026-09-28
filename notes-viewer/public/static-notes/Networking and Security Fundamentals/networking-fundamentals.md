# Networking Fundamentals — Complete Notes

## 1. Beginner

### The OSI Model (7 Layers)
| Layer | Name | Examples | DevOps-relevant tools |
|---|---|---|---|
| 7 | Application | HTTP, DNS, SMTP, gRPC | Nginx, app code |
| 6 | Presentation | TLS/SSL, encoding | cert managers |
| 5 | Session | sessions, sockets | connection pools |
| 4 | Transport | TCP, UDP | load balancers (L4) |
| 3 | Network | IP, ICMP, routing | routers, VPCs, NACLs |
| 2 | Data Link | Ethernet, MAC, switches | VLANs, CNI plugins |
| 1 | Physical | cables, radio, NICs | (rarely touched in cloud) |

- Mnemonic: **"Please Do Not Throw Sausage Pizza Away"** (Physical, Data Link, Network, Transport, Session, Presentation, Application).
- In practice, DevOps work mostly lives at **L3 (IP/routing)**, **L4 (TCP/UDP, load balancing)**, and **L7 (HTTP, application protocols)** — see [L4 vs L7 Load Balancing](../Load%20Balancing/l4-vs-l7-load-balancing.md) for the L4/L7 split in detail.

### TCP/IP Model (What Actually Gets Implemented)
The 4-layer practical model that maps onto OSI:
```
Application  (HTTP, DNS, TLS)         ~ OSI 5-7
Transport    (TCP, UDP)               ~ OSI 4
Internet     (IP, ICMP, routing)      ~ OSI 3
Link         (Ethernet, ARP)          ~ OSI 1-2
```

### IP Addressing Basics
- **IPv4**: 32-bit, e.g. `192.168.1.10`. Written as 4 octets (0-255).
- **IPv6**: 128-bit, e.g. `2001:0db8::1`, designed to solve IPv4 exhaustion; growing but not universal in internal cloud networking yet.
- **Private IP ranges (RFC 1918)** — never routable on the public internet:
  - `10.0.0.0/8`
  - `172.16.0.0/12`
  - `192.168.0.0/16`
- **CIDR notation**: `/24` = 256 addresses (255 usable-ish), `/16` = 65,536 addresses. The number = how many leading bits are the fixed network prefix.

### TCP vs UDP
| | TCP | UDP |
|---|---|---|
| Connection | Connection-oriented (3-way handshake: SYN, SYN-ACK, ACK) | Connectionless |
| Reliability | Guaranteed delivery, ordering, retransmission | Best-effort, no guarantees |
| Overhead | Higher (headers, ACKs, flow control) | Lower, minimal header |
| Use cases | HTTP/HTTPS, databases, SSH, file transfer — anything needing correctness | DNS queries, video/voice calls, gaming, metrics (StatsD) — anything favoring speed over perfect delivery |
| Ordering | In-order delivery guaranteed | Packets can arrive out of order or not at all |

- **QUIC/HTTP-3**: builds reliability *on top of* UDP (in userspace) to get TCP-like guarantees without TCP's head-of-line blocking — increasingly used by CDNs and browsers.

### Ports — The Basics
- A port is a 16-bit number (0–65535) that lets a single IP address host multiple independent services.
- **Well-known ports (0–1023)**: reserved for standard services, require root/admin privilege to bind on Linux.
- **Registered ports (1024–49151)**: assigned to specific applications by IANA but not privileged.
- **Ephemeral/dynamic ports (49152–65535)**: temporary, assigned by the OS for the *client* side of an outgoing connection.

### Well-Known Ports Reference Table
| Port | Protocol | Service |
|---|---|---|
| 20/21 | TCP | FTP (data/control) |
| 22 | TCP | SSH |
| 23 | TCP | Telnet (insecure, avoid) |
| 25 | TCP | SMTP (mail relay) |
| 53 | TCP/UDP | DNS |
| 67/68 | UDP | DHCP |
| 80 | TCP | HTTP |
| 110 | TCP | POP3 |
| 123 | UDP | NTP |
| 143 | TCP | IMAP |
| 161/162 | UDP | SNMP |
| 179 | TCP | BGP |
| 389 | TCP | LDAP |
| 443 | TCP | HTTPS |
| 445 | TCP | SMB |
| 465/587 | TCP | SMTPS / SMTP submission (TLS) |
| 500 | UDP | IKE (IPsec key exchange) |
| 514 | UDP | Syslog |
| 636 | TCP | LDAPS |
| 993 | TCP | IMAPS |
| 995 | TCP | POP3S |
| 1433 | TCP | MS SQL Server |
| 1521 | TCP | Oracle DB |
| 2049 | TCP/UDP | NFS |
| 2379/2380 | TCP | etcd client/peer |
| 3000 | TCP | (common dev default — Grafana, Node apps) |
| 3306 | TCP | MySQL/MariaDB |
| 3389 | TCP | RDP |
| 4789 | UDP | VXLAN |
| 5432 | TCP | PostgreSQL |
| 5672 | TCP | AMQP (RabbitMQ) |
| 6379 | TCP | Redis |
| 6443 | TCP | Kubernetes API server |
| 8080 | TCP | (common alt-HTTP dev default) |
| 9090 | TCP | Prometheus |
| 9100 | TCP | node_exporter |
| 9200 | TCP | Elasticsearch |
| 27017 | TCP | MongoDB |
| 51820 | UDP | WireGuard |

---

## 2. Intermediate

### The Three-Way Handshake (TCP Connection Setup)
```
Client                     Server
  |----------- SYN -------->|      "I want to connect, my seq = X"
  |<-------- SYN-ACK -------|      "OK, ack X+1, my seq = Y"
  |----------- ACK -------->|      "ack Y+1, connection established"
```
- Connection teardown uses a similar `FIN`/`ACK` exchange (4-way) — a socket that finishes but lingers in `TIME_WAIT` is normal, not a leak.

### Subnetting in Practice
- A VPC `10.0.0.0/16` (65,536 IPs) is commonly split into subnets like `10.0.1.0/24` (public), `10.0.2.0/24` (private-app), `10.0.3.0/24` (private-data) — see [VPC Fundamentals](../Cloud/Cloud-Networking-for-DevOps.md) for the full cloud picture.
- **Broadcast address**: last address in a subnet (`10.0.1.255` for a `/24`), reserved.
- **Network address**: first address (`10.0.1.0`), reserved — identifies the subnet itself, not a host.
- Cloud providers additionally reserve a handful of addresses per subnet (AWS reserves 5) for the gateway, DNS, and future use.

### NAT (Network Address Translation)
- **SNAT (Source NAT)**: rewrites the *source* IP of outbound packets — how private instances reach the internet through a NAT Gateway while keeping no public IP themselves.
- **DNAT (Destination NAT)**: rewrites the *destination* IP — how a load balancer/firewall forwards an inbound public request to a private backend IP. Also called **port forwarding** at the host level.
- **PAT (Port Address Translation)**: many private IPs share one public IP by also remapping source ports — this is what most home routers and cloud NAT Gateways do.

### Routing Basics
- A **routing table** maps destination CIDR ranges to a "next hop" (an interface, gateway, or another router).
- **Default route** (`0.0.0.0/0`): the catch-all — "if no more specific route matches, send it here" (typically the internet gateway or NAT gateway).
- **Longest prefix match**: routers always pick the *most specific* matching route, not just the first one.

### Common Diagnostic Tools
```bash
ping <host>              # ICMP reachability + round-trip time
traceroute <host>        # path (hop-by-hop) to a destination
mtr <host>                # continuous traceroute + ping stats combined
dig <domain>              # DNS query tool (see dns-deep-dive.md)
curl -v https://host      # inspect the full HTTP/TLS request-response cycle
nc -zv host port          # quick TCP port reachability check
ss -tulnp                 # list listening sockets (modern replacement for netstat)
tcpdump -i eth0 port 443  # raw packet capture for deep debugging
nmap -p 1-65535 host      # port scan (only against systems you're authorized to test)
```

---

## 3. Advanced

### MTU & Fragmentation
- **MTU (Maximum Transmission Unit)**: largest packet size a link can carry without fragmentation — Ethernet default is 1500 bytes.
- Overlay networks (VXLAN, WireGuard, service mesh sidecars) add encapsulation headers, effectively *shrinking* usable MTU — a classic cause of mysterious "large requests fail, small ones work" bugs in Kubernetes CNI setups.
- **Path MTU Discovery (PMTUD)**: hosts probe to find the smallest MTU along a path; broken when intermediate firewalls block the ICMP "fragmentation needed" messages PMTUD relies on.

### BGP (Border Gateway Protocol)
- The protocol that makes the internet's inter-network routing work — autonomous systems (ASes) advertise reachable IP prefixes to each other.
- Relevant to DevOps mainly via: cloud **Direct Connect/ExpressRoute** setups (BGP peering for hybrid connectivity), and **Anycast** (same IP announced from multiple locations via BGP, used by DNS root servers and CDNs/global load balancers) — see [DNS & Global Load Balancing](../Load%20Balancing/dns-and-global-load-balancing.md).

### Overlay Networking (Kubernetes/Container Context)
- **VXLAN**: encapsulates L2 Ethernet frames inside UDP packets (port 4789) to create virtual L2 networks across L3 infrastructure — how many Kubernetes CNI plugins (Flannel, Calico in overlay mode) connect pods across nodes.
- **BGP-mode CNI** (Calico): instead of encapsulating, advertises pod CIDRs via BGP between nodes — lower overhead, no encapsulation MTU tax, but requires L3 network cooperation.
- See [Kubernetes Networking](../Kubernetes/Networking.md) for the full CNI/Service/Ingress picture built on top of these primitives.

### Connection Scaling Concepts
- **Ephemeral port exhaustion**: a server or NAT gateway making huge numbers of outbound connections can run out of source ports (~28K-64K usable range per IP) — mitigated via connection pooling, keep-alive reuse, or multiple NAT IPs.
- **SYN flood**: exhausting a server's half-open connection table — mitigated with **SYN cookies** (stateless handshake validation) at the OS/firewall level.
- **TIME_WAIT accumulation**: high-throughput short-lived-connection services can exhaust ephemeral ports/socket table entries — mitigated with `SO_REUSEADDR`, tuned `net.ipv4.tcp_fin_timeout`, or connection reuse patterns (HTTP keep-alive, connection pools).

### Performance Tuning Checklist (Linux Networking Sysctls)
```bash
net.core.somaxconn = 4096              # max pending connection backlog
net.ipv4.tcp_max_syn_backlog = 4096    # half-open connection queue size
net.ipv4.tcp_tw_reuse = 1              # allow reusing TIME_WAIT sockets for new outgoing connections
net.ipv4.ip_local_port_range = 1024 65535   # widen ephemeral port range
net.core.rmem_max / wmem_max           # socket buffer size ceilings for high-throughput links
```

---

## Quick Revision — Networking Fundamentals
- OSI is the teaching model (7 layers); TCP/IP is what's actually implemented (4 layers).
- TCP = reliable/ordered/connection-oriented; UDP = fast/best-effort/connectionless. QUIC builds TCP-like guarantees over UDP.
- CIDR `/n` = `n` fixed prefix bits; smaller `/n` number = bigger network.
- NAT: SNAT (outbound, hide source), DNAT (inbound, redirect destination), PAT (many-to-one via port remapping).
- Routing always picks the longest/most-specific prefix match; `0.0.0.0/0` is the default catch-all route.
- Overlay networks (VXLAN) trade simplicity for MTU overhead; BGP-mode CNI avoids encapsulation but needs L3 cooperation.
- Know your diagnostic toolkit: `ping`, `traceroute`/`mtr`, `dig`, `curl -v`, `nc -zv`, `ss`, `tcpdump`.

## Related Notes
- [Networking & Security Fundamentals — Index](index.md)
- [L4 vs L7 Load Balancing](../Load%20Balancing/l4-vs-l7-load-balancing.md)
- [Kubernetes Networking](../Kubernetes/Networking.md)
- [Cloud Networking for DevOps](../Cloud/Cloud-Networking-for-DevOps.md)
- [DNS Deep Dive](dns-deep-dive.md)
- [Firewalls](firewalls.md)
