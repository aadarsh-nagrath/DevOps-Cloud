# Software Load Balancers: NGINX, HAProxy, Envoy

The three load balancers/reverse proxies you'll encounter constantly in DevOps work, self-hosted or embedded inside other tools (Kubernetes Ingress controllers, service meshes). This file covers configuration examples and how to decide between them.

---

## 1. NGINX

Originally a web server, NGINX's reverse-proxy/load-balancing capability is now one of its most common uses. Extremely widely deployed, well documented, and often already present in a stack for serving static content or as an API gateway.

### Basic HTTP load balancing
```nginx
upstream backend {
    least_conn;                     # algorithm — see load-balancing-algorithms.md
    server 10.0.0.1:8080 weight=2;
    server 10.0.0.2:8080;
    server 10.0.0.3:8080 backup;    # only used if all non-backup servers are down
}

server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate     /etc/nginx/ssl/example.com.crt;
    ssl_certificate_key /etc/nginx/ssl/example.com.key;

    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
The `X-Forwarded-*` headers are essential — without them, every backend request appears to originate from the load balancer's IP, breaking anything that depends on the real client IP (rate limiting, geolocation, audit logs).

### Active health checks (NGINX Plus — the free/open-source build only supports passive checks)
```nginx
upstream backend {
    zone backend 64k;
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
    health_check interval=5s fails=3 passes=2 uri=/healthz;
}
```

### Path-based routing (L7)
```nginx
location /api/ {
    proxy_pass http://api_backend;
}
location /static/ {
    proxy_pass http://static_backend;
}
```

**Strengths**: extremely mature, huge ecosystem/documentation, doubles as a web server/cache/static file server, low resource footprint.
**Limitations**: the free/open-source build's health checking is passive-only (it only learns a backend is down after a real request fails against it, rather than proactively probing) — active health checks require NGINX Plus (paid) or a sidecar approach.

---

## 2. HAProxy

Purpose-built specifically for load balancing and proxying (not a general web server) — often the choice when load balancing is the primary job, not a secondary feature bolted onto a web server.

### Basic configuration
```haproxy
global
    maxconn 50000

defaults
    mode http
    timeout connect 5s
    timeout client  30s
    timeout server  30s

frontend web_frontend
    bind *:443 ssl crt /etc/haproxy/certs/example.com.pem
    default_backend web_servers

backend web_servers
    balance leastconn
    option httpchk GET /healthz          # active health check, built in by default
    http-check expect status 200
    server web1 10.0.0.1:8080 check inter 5s fall 3 rise 2
    server web2 10.0.0.2:8080 check inter 5s fall 3 rise 2
    server web3 10.0.0.3:8080 check inter 5s fall 3 rise 2 backup
```
- `check inter 5s` — probe every 5 seconds.
- `fall 3` — mark down after 3 consecutive failures.
- `rise 2` — mark healthy again after 2 consecutive successes.

### Layer 4 (TCP) mode
```haproxy
frontend postgres_frontend
    bind *:5432
    mode tcp
    default_backend postgres_servers

backend postgres_servers
    mode tcp
    balance leastconn
    server pg1 10.0.1.1:5432 check
    server pg2 10.0.1.2:5432 check
```

### The HAProxy Stats Page (built-in observability)
```haproxy
listen stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 10s
```
Gives a live dashboard of every backend's status, connection counts, and error rates — genuinely useful during an incident, no extra tooling required.

**Strengths**: purpose-built for load balancing (very mature algorithm/health-check support), excellent performance, works at both L4 and L7, detailed built-in stats/observability, precise fine-grained tuning (timeouts, queueing, connection limits).
**Limitations**: configuration syntax is its own DSL (steeper learning curve than NGINX for people already familiar with NGINX's web-server-style config), no native dynamic service discovery (needs external tooling like Consul-Template to reconfigure backends automatically as they scale).

---

## 3. Envoy

A modern L4/L7 proxy built for dynamic, cloud-native/microservices environments — designed from the ground up for configuration via API (not just static config files), which is why it's the default data plane for most service meshes (Istio, and originally built at Lyft for exactly this purpose).

### Key differentiators from NGINX/HAProxy
- **xDS APIs**: Envoy's configuration (which backends exist, which routes apply) can be pushed to it dynamically over gRPC/REST APIs, rather than requiring a config file reload — essential for environments where backends scale up/down constantly (Kubernetes, autoscaling groups).
- **Advanced traffic management out of the box**: retries with backoff, circuit breaking, outlier detection (automatically ejecting a backend that's returning errors, without a human writing failure-threshold rules), fault injection for chaos testing.
- **First-class observability**: rich built-in metrics (Prometheus format), distributed tracing integration (OpenTelemetry/Zipkin/Jaeger) — this is a primary reason it became the default service mesh sidecar.
- **gRPC/HTTP2-native**: strong first-class support for gRPC load balancing specifically (load balancing individual gRPC streams correctly is harder than plain HTTP/1.1 request load balancing, since a single long-lived HTTP/2 connection can carry many concurrent gRPC calls).

### Basic static configuration
```yaml
static_resources:
  listeners:
    - name: listener_0
      address:
        socket_address: { address: 0.0.0.0, port_value: 443 }
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                route_config:
                  virtual_hosts:
                    - name: backend
                      domains: ["*"]
                      routes:
                        - match: { prefix: "/" }
                          route: { cluster: web_service }
                http_filters:
                  - name: envoy.filters.http.router

  clusters:
    - name: web_service
      connect_timeout: 5s
      type: STRICT_DNS
      lb_policy: LEAST_REQUEST          # Envoy's equivalent of least connections, request-count based
      load_assignment:
        cluster_name: web_service
        endpoints:
          - lb_endpoints:
              - endpoint: { address: { socket_address: { address: web1.internal, port_value: 8080 } } }
              - endpoint: { address: { socket_address: { address: web2.internal, port_value: 8080 } } }
      health_checks:
        - timeout: 2s
          interval: 5s
          unhealthy_threshold: 3
          healthy_threshold: 2
          http_health_check: { path: "/healthz" }
```

**Strengths**: best-in-class for dynamic/cloud-native environments, sophisticated traffic management (circuit breaking, outlier detection, retries), the de facto standard data plane for service meshes, excellent observability.
**Limitations**: more complex configuration surface than NGINX/HAProxy for simple static use cases — genuinely overkill if you just need "load balance across 3 static servers with round robin" (HAProxy/NGINX are simpler and sufficient there).

---

## 4. Comparison Table

| | NGINX | HAProxy | Envoy |
|---|---|---|---|
| Primary design purpose | Web server + reverse proxy | Dedicated load balancer | Cloud-native L4/L7 proxy, service mesh data plane |
| L4 support | Yes (stream module) | Yes (native, mature) | Yes |
| L7 support | Yes (mature) | Yes | Yes (most advanced) |
| Active health checks (OSS) | No (passive only in OSS) | Yes | Yes |
| Dynamic reconfiguration via API | Limited (needs reload, or NGINX Plus API) | Limited (needs external tooling like Consul-Template) | Yes, native (xDS APIs) — designed for this |
| Circuit breaking / outlier detection | No (OSS) | Basic | Yes, sophisticated |
| Built-in observability | Basic (access logs, some status module) | Good (stats page) | Excellent (Prometheus metrics, tracing) |
| Typical use case | General-purpose web serving + LB, static content, simple API gateway | Dedicated high-performance LB, precise tuning needs | Kubernetes ingress, service mesh, dynamic microservices |
| Config style | Web-server-style directives | Custom DSL, very LB-focused | Structured YAML/JSON, often generated by control planes rather than hand-written |

---

## 5. Choosing One

- **NGINX**: you're already using it as a web server/static content server, need a simple reverse proxy/LB, or want the most widely documented option for a straightforward setup.
- **HAProxy**: load balancing is the primary job (not bundled with anything else), you need precise control over timeouts/queueing/health-check behavior, or you're fronting non-HTTP TCP services.
- **Envoy**: you're in a dynamic/cloud-native environment (Kubernetes, frequent autoscaling), you need a service mesh, or you need sophisticated traffic management (circuit breaking, retries, outlier detection) beyond what NGINX/HAProxy offer out of the box. See [kubernetes-load-balancing.md](kubernetes-load-balancing.md) for how Envoy shows up as the default data plane in Istio.

In practice, many organizations run more than one of these at different layers — e.g., a cloud L7 load balancer at the edge, Envoy as the service mesh sidecar internally, and HAProxy in front of a legacy TCP service that predates the mesh migration.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
