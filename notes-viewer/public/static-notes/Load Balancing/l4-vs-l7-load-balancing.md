# L4 vs L7 Load Balancing

The OSI layer a load balancer operates at determines what information it can see and act on. This is one of the most important distinctions to actually understand deeply — it determines which features are even possible, not just which are configured.

---

## 1. Layer 4 (Transport Layer — TCP/UDP)

An L4 load balancer only sees IP addresses, ports, and TCP/UDP-level information. It does **not** parse or understand the actual application data (HTTP headers, URLs, cookies) — it just forwards packets/connections to a backend based on connection-level rules.

```
Client ---[TCP connection]---> L4 Load Balancer ---[same TCP connection forwarded]---> Backend
                                (sees: source IP, dest IP, port — nothing about HTTP paths/headers)
```

### What L4 can do
- Route based on destination port (e.g., all traffic on port 443 goes to the web fleet, port 5432 to the database fleet).
- Perform simple algorithms (round robin, least connections, IP hash) purely on connection metadata.
- Extremely low latency and high throughput — no need to parse/buffer application-layer data.
- Load balance **any TCP/UDP protocol**, not just HTTP — databases, message queues, custom binary protocols, gRPC (as raw HTTP/2 frames, without understanding gRPC semantics specifically), game servers (UDP).

### What L4 cannot do
- Route based on URL path (`/api/` vs `/static/`) — it has no idea what a URL is.
- Route based on HTTP headers, cookies, or hostnames (can't do virtual hosting for multiple domains behind one IP without SNI-based routing, which is a limited middle ground — see below).
- Terminate TLS and inspect the decrypted content (though it *can* do "TLS passthrough" using SNI to route encrypted traffic without decrypting it).

### Example: AWS Network Load Balancer (NLB) — an L4 load balancer
```
NLB Listener: TCP port 443
   -> Target Group: EC2 instances on port 443 (TLS handled by the backend itself, not the NLB)
```
The NLB just forwards TCP connections/packets — it never decrypts or inspects them. This is why NLBs handle millions of requests per second with extremely low, consistent latency: there's very little work happening at the load balancer itself.

---

## 2. Layer 7 (Application Layer — HTTP/HTTPS/gRPC)

An L7 load balancer terminates the connection, actually parses the HTTP request, and can make routing decisions based on its content.

```
Client ---[HTTPS]---> L7 Load Balancer ---[decrypts, reads request]---> routes based on:
                                              - Host header (api.example.com vs www.example.com)
                                              - URL path (/api/v2/* vs /static/*)
                                              - Headers/cookies (session affinity, A/B test bucketing)
                                          ---[new HTTP connection, often re-encrypted]---> Backend
```

### What L7 can do
- **Path-based routing**: `/api/*` → API service, `/images/*` → image service, all behind one domain and one load balancer.
- **Host-based routing (virtual hosting)**: `api.example.com` and `www.example.com` on the same load balancer IP, routed to entirely different backend pools.
- **TLS termination**: decrypt HTTPS once at the load balancer, forward plain HTTP internally (or re-encrypt for a "TLS bridging" setup) — offloads expensive crypto work from every backend instance.
- **Header/cookie-based routing**: canary releases, A/B tests, and blue-green cutovers (see [Deployment Strategies](../Deployment/deployment-strategies.md)) are commonly implemented via L7 rules.
- **Request/response manipulation**: add/strip headers, rewrite URLs, compress responses, cache static content.
- **Web Application Firewall (WAF) integration**: since it can actually read the request content, it can inspect for SQL injection patterns, rate-limit by URL, block by user-agent, etc.
- **Retries and circuit breaking** based on actual HTTP response codes (a 503 vs a 200), which an L4 balancer has no visibility into.

### What L7 costs you
- **More CPU/latency overhead** — parsing HTTP, terminating TLS, and making content-based decisions is more expensive than blind packet forwarding.
- **Only understands protocols it's built to parse** — an L7 HTTP load balancer can't usefully load balance a raw TCP database protocol; that needs an L4 (or protocol-aware L7, e.g. a gRPC-aware or Redis-aware proxy).

### Example: AWS Application Load Balancer (ALB) — an L7 load balancer
```
ALB Listener: HTTPS 443 (TLS terminated here)
   Rule 1: Host = "api.example.com"        -> Target Group: api-service
   Rule 2: Path = "/static/*"               -> Target Group: static-assets-service
   Rule 3: Header "X-Canary: true"          -> Target Group: canary-version
   Default:                                  -> Target Group: main-web-service
```

---

## 3. Side-by-Side Comparison

| | L4 (Transport) | L7 (Application) |
|---|---|---|
| Sees | IP, port, TCP/UDP flags | Full HTTP request: path, headers, cookies, body |
| Can route by URL path / hostname | No | Yes |
| Can terminate TLS | Not typically (passthrough only) | Yes |
| Protocol support | Any TCP/UDP protocol | Protocols it understands (HTTP/1.1, HTTP/2, gRPC, WebSocket) |
| Performance | Very high throughput, very low latency | Higher overhead due to parsing/termination |
| WAF / content inspection | No | Yes |
| Example products | AWS NLB, plain `iptables`/IPVS, most L4 hardware load balancers | AWS ALB, NGINX, HAProxy (in HTTP mode), Envoy, most API Gateways |
| Typical position in stack | In front of databases, non-HTTP services, or as the outer layer before an L7 balancer | In front of web/API traffic, microservices, anywhere routing logic matters |

---

## 4. TLS Passthrough — the Middle Ground

Sometimes you want L4-level performance/simplicity but still need to route different HTTPS domains to different backends. **SNI (Server Name Indication)** — part of the TLS handshake, sent *before* encryption completes — lets an L4 load balancer peek at the requested hostname without fully decrypting the connection, and route accordingly, then pass the still-encrypted connection straight through to a backend that terminates TLS itself.

```
Client TLS handshake includes SNI: "api.example.com" (visible even though the rest is encrypted)
L4 LB reads SNI -> routes the still-encrypted connection to the api-service backend
Backend terminates TLS itself
```
This trades away L7 features (no header/path routing, no WAF inspection — the LB never sees the decrypted content) but keeps L4-level performance and avoids doing TLS termination work at the load balancer twice.

---

## 5. Choosing Between Them

- **Use L4** when: raw performance is critical, you're load balancing a non-HTTP protocol (database, custom TCP service, UDP-based service like DNS or gaming), or you want TLS passthrough for end-to-end encryption without an intermediary decrypting.
- **Use L7** when: you need content-based routing (multiple services/domains behind one balancer), TLS termination to simplify backend certificate management, WAF/security inspection, or any of the traffic-shaping features that [deployment strategies](../Deployment/deployment-strategies.md) like canary/blue-green depend on.
- **Use both together** (very common in real architectures): an L4 load balancer (or the cloud provider's edge network) in front for raw scale and DDoS absorption, handing off to an L7 load balancer that does the actual smart routing — see the layered diagram in [load-balancing-overview.md](load-balancing-overview.md).

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
