# Load Balancing — Overview

A load balancer distributes incoming traffic across multiple backend servers so no single server is overwhelmed, so failed servers are automatically avoided, and so the system as a whole can scale horizontally. This is the entry point and index for all load balancing notes in this folder.

---

## 1. Why Load Balancing Exists

Without a load balancer, clients talk directly to one server. That single server:
- Has a hard ceiling on throughput (vertical scaling only — bigger box, same single point of failure).
- Is a **single point of failure** — if it goes down, the whole service goes down.
- Can't be updated/deployed without an outage (see [Deployment Strategies](../Deployment/deployment-strategies.md) — nearly all zero-downtime deployment strategies *require* a load balancer to work at all).

A load balancer sits between clients and a pool of backend servers ("upstreams," "targets," "backends" — same concept, different vocabulary per vendor) and:
- Distributes requests across the pool using some algorithm (see [load-balancing-algorithms.md](load-balancing-algorithms.md)).
- Continuously health-checks backends and stops routing to unhealthy ones (see [health-checks-and-failover.md](health-checks-and-failover.md)).
- Gives you one stable entry point (a VIP — virtual IP, or a DNS name) while the actual backend fleet scales up/down/gets replaced underneath it.

```
                     +----------------+
                     |  Load Balancer  |
   Clients  ------>  |  (single VIP /  |  ------>  Backend 1 (healthy)
                     |   DNS name)      |  ------>  Backend 2 (healthy)
                     +----------------+  ------>  Backend 3 (UNHEALTHY — skipped)
```

---

## 2. Core Concepts Glossary

| Term | Meaning |
|---|---|
| **Backend / Upstream / Target** | A server the load balancer can route traffic to. |
| **Backend pool / Upstream group / Target group** | The set of backends behind one load balancer configuration. |
| **VIP (Virtual IP)** | A single IP address clients connect to, which the load balancer owns — it doesn't belong to any one backend. |
| **Health check** | A periodic probe (TCP connect, HTTP GET, custom script) used to decide if a backend should receive traffic. |
| **Session affinity / Sticky sessions** | Routing a given client consistently to the same backend (see [sticky-sessions-and-session-affinity.md](sticky-sessions-and-session-affinity.md)). |
| **L4 (Layer 4) load balancing** | Operates at the transport layer (TCP/UDP) — routes based on IP/port, doesn't inspect the request content. |
| **L7 (Layer 7) load balancing** | Operates at the application layer (HTTP/HTTPS/gRPC) — can route based on URL path, headers, cookies, etc. |
| **Reverse proxy** | A server that sits in front of backends and forwards client requests to them — load balancers are a specific kind of reverse proxy that also distributes across multiple backends. |
| **SSL/TLS termination** | The load balancer decrypts HTTPS traffic and forwards plain HTTP to backends, offloading crypto work from the app servers. |
| **Connection draining / deregistration delay** | Giving in-flight requests time to finish before a backend is fully removed from the pool (critical during deploys/scale-down). |
| **Global Server Load Balancing (GSLB)** | Load balancing across multiple *regions/data centers*, usually via DNS, rather than across servers within one location. |

---

## 3. Where Load Balancers Sit in a Real Architecture

```
Internet
   |
   v
[DNS / GSLB]                      <- routes users to the nearest/healthiest region
   |
   v
[CDN / Edge]                       <- optional: caches static content, absorbs some load before it reaches origin
   |
   v
[L7 Load Balancer / API Gateway]   <- TLS termination, routing by path/host, WAF, rate limiting
   |
   v
[L4 Load Balancer]  (sometimes)    <- e.g. in front of a database cluster, or internal service-to-service traffic
   |
   v
[Backend service instances / Pods] <- the actual application code
   |
   v
[Internal Load Balancer]           <- routes to a downstream service (service mesh sidecar, internal ALB, k8s Service)
   |
   v
[Database / Cache tier]            <- often has its own load balancing (read replicas, connection poolers)
```
Real production systems usually have **load balancing at multiple layers simultaneously** — DNS-level (multi-region), edge/CDN, the main ingress L7 load balancer, and then again internally between microservices (via a service mesh or internal load balancers). This is normal, not redundant.

---

## 4. Reverse Proxy vs Load Balancer

A **reverse proxy** sits in front of servers and forwards client requests to them. The client only ever talks to the proxy. A **load balancer** spreads requests across *several* backends. Every L7 load balancer is a reverse proxy; a reverse proxy only becomes a load balancer once it has more than one backend to choose from. They aren't alternatives. NGINX, HAProxy, Envoy and AWS ALB all do both.

**Reverse proxy, one backend:** NGINX on port 80 handles TLS and headers, and the app on port 3000 never faces the internet.
```nginx
server {
    listen 80;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Load balancer, several backends:** same `proxy_pass`, but pointing at an `upstream` pool. Round robin is the default.
```nginx
upstream backend_servers {
    # least_conn;                       # or ip_hash; / hash $request_uri consistent;
    server 10.0.1.10:8080 weight=3;     # weighted: gets ~3x the requests
    server 10.0.1.11:8080;
    server 10.0.1.12:8080 max_fails=3 fail_timeout=30s;   # passive health check
    server 10.0.1.13:8080 backup;       # only used when the others are down
}
server {
    listen 80;
    location / { proxy_pass http://backend_servers; }
}
```
Algorithms in depth: [load-balancing-algorithms.md](load-balancing-algorithms.md).

| | Reverse proxy | Load balancer |
|---|---|---|
| Main job | Single front door: forward, hide, protect backends | Spread traffic for scale and availability |
| Backends | Works with just one | Needs two or more to mean anything |
| Typical extras | TLS termination, caching, compression, auth, path/host routing, rate limiting | Health checks, failover, session affinity, connection draining |
| Layer | L7 (HTTP) | L4 (TCP/UDP, e.g. AWS NLB) or L7 (HTTP, e.g. AWS ALB) |
| Examples | NGINX, Apache `mod_proxy`, Traefik, Envoy, API gateways | AWS ALB/NLB, GCP LB, Azure LB/App Gateway, HAProxy, F5, NGINX `upstream` |

**Forward proxy vs reverse proxy:** a forward proxy works for *clients* when they go out (Squid, corporate egress), and the server sees the proxy's IP. A reverse proxy works for *servers* when requests come in. See [proxy-servers.md](../Networking%20and%20Security%20Fundamentals/proxy-servers.md).

### Real example: request path into AWS EKS
```
User / Browser
   │  HTTPS
   ▼
AWS ALB                 ← L7 LB + TLS termination (ACM cert), WAF
   │                      with AWS Load Balancer Controller the ALB *is* the Ingress:
   │                      it routes by host/path straight to Pod IPs (target-type: ip)
   ▼
[Ingress controller]    ← only when you run NGINX/Traefik ingress behind an NLB instead
   │                      (another reverse proxy layer, routes by host/path)
   ▼
Kubernetes Service      ← stable virtual IP / DNS name; kube-proxy (iptables/IPVS) balances at L4
   │
   ├──► Pod 1
   ├──► Pod 2
   └──► Pod 3
```
Load balancing happens at more than one layer here: the ALB across Pods or nodes, then kube-proxy across Pod endpoints. More in [kubernetes-load-balancing.md](kubernetes-load-balancing.md).

### Interview follow-ups
- **502 from the ALB/NGINX:** the proxy is up but got no valid response from the backend. Check that the app is listening on the right port, that health checks pass, that security groups or NetworkPolicy allow the traffic, and that `kubectl get endpoints <svc>` isn't empty. **503** means there are no healthy targets at all. **504** means the backend was too slow, so compare the proxy's timeout with the app's response time.
- **L4 vs L7:** L4 sees only IP and port (fast, any TCP/UDP protocol, can pass TLS through). L7 reads HTTP, so it can route by path, header or cookie, terminate TLS and retry. See [l4-vs-l7-load-balancing.md](l4-vs-l7-load-balancing.md).
- **Backend sees the proxy's IP instead of the client's:** read `X-Forwarded-For` (L7) or turn on PROXY protocol (L4/NLB).

---

## 5. Files in This Folder

| File | Covers |
|---|---|
| [load-balancing-algorithms.md](load-balancing-algorithms.md) | Round robin, least connections, weighted, IP hash, consistent hashing, latency-based — when to use each |
| [l4-vs-l7-load-balancing.md](l4-vs-l7-load-balancing.md) | Transport vs application layer load balancing in depth, with concrete examples of what each can and can't do |
| [software-load-balancers.md](software-load-balancers.md) | NGINX, HAProxy, Envoy — configuration examples and when to pick which |
| [cloud-load-balancers.md](cloud-load-balancers.md) | AWS (ALB/NLB/CLB/GLB), Azure (Load Balancer/App Gateway/Front Door), GCP (Cloud Load Balancing) compared |
| [kubernetes-load-balancing.md](kubernetes-load-balancing.md) | Service types (ClusterIP/NodePort/LoadBalancer), kube-proxy, Ingress controllers, service mesh load balancing |
| [health-checks-and-failover.md](health-checks-and-failover.md) | Active vs passive health checks, failover mechanics, avoiding split-brain and thundering herd |
| [sticky-sessions-and-session-affinity.md](sticky-sessions-and-session-affinity.md) | Why/when you need session stickiness, cookie-based vs IP-based affinity, trade-offs |
| [dns-and-global-load-balancing.md](dns-and-global-load-balancing.md) | DNS round robin, GeoDNS, anycast, multi-region failover, GSLB |
| [load-balancing-production-simulation.md](load-balancing-production-simulation.md) | Hands-on simulation: HAProxy in front of real backends, killing a backend, rolling deploy behind a LB, connection draining |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
