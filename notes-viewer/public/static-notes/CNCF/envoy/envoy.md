# Envoy — Complete Notes

## 1. Beginner

### What is Envoy?
- A high-performance **L4/L7 proxy** written in C++, originally built at Lyft (2016), donated to CNCF, **graduated** in 2018.
- Designed from the start to be **application-agnostic infrastructure**: not a language-specific library your app links against, but a separate process that sits next to (or in front of) your services and handles networking concerns for them.
- It is the most widely used **data plane** in the service mesh world — it's the proxy underneath Istio, and also powers Gloo Edge, Contour, AWS App Mesh, and is usable entirely standalone as an API gateway or edge load balancer.

### The Core Problem It Solves
Before Envoy-style proxies, networking behavior (retries, load balancing, TLS termination, circuit breaking, observability) was either hardcoded per-language in client libraries, or handled by a hardware/software load balancer that had no per-request intelligence. Envoy centralizes all of this into one well-tested, language-independent component:
```
Without a proxy layer:
  [Service A code, incl. retry/LB/TLS logic] --> network --> [Service B code, incl. retry/LB/TLS logic]

With Envoy:
  [Service A] -> [Envoy] --> network --> [Envoy] -> [Service B]
                    ^ retries, LB, TLS,               ^ retries, LB, TLS,
                      circuit breaking,                  circuit breaking,
                      stats, tracing                     stats, tracing
                      -- ALL outside app code --
```
See [service-mesh-overview.md](../../Service%20Mesh/service-mesh-overview.md) for the full data-plane/control-plane framing this sits inside — Envoy is almost always the concrete answer to "what runs as the data plane."

### Core Concepts
| Term | Meaning |
|---|---|
| **Listener** | A named network address (IP + port) Envoy binds to and accepts connections on |
| **Filter / Filter Chain** | A chain of processing units attached to a listener that inspects/transforms traffic (e.g., HTTP connection manager, TCP proxy, RBAC, rate limiting) |
| **Route** | Rule mapping an incoming request (by path/host/header) to a destination cluster |
| **Cluster** | A logical group of upstream backend instances (like a Kubernetes Service) that Envoy load-balances across |
| **Endpoint** | One concrete backend instance (IP:port) belonging to a cluster |
| **xDS** | The family of discovery APIs (Listener/Route/Cluster/Endpoint/Secret Discovery Service) a control plane uses to push config to Envoy dynamically |

### Architecture
```
                     ┌─────────────────────────────┐
 client request ---> │ Listener (0.0.0.0:10000)    │
                     │   -> Filter Chain            │
                     │        -> HTTP Conn Manager  │
                     │             -> Router filter │
                     │                  -> Route    │  match by path/host/header
                     │                       -> Cluster (backend-service)
                     │                            -> Endpoint 10.0.0.5:8080
                     │                            -> Endpoint 10.0.0.6:8080
                     └─────────────────────────────┘
                                  |
                                  v
                          [Admin interface :9901]
                        (stats, config dump, health)
```
- A single Envoy process can have many listeners, each with its own filter chain, routing to many clusters.
- The **admin interface** (default port 9901) exposes live stats, active config, and health — invaluable for debugging (see the tutorial).

### Basic Static Config Example
```yaml
# envoy.yaml — static config, no control plane
static_resources:
  listeners:
    - name: listener_0
      address:
        socket_address: { address: 0.0.0.0, port_value: 10000 }
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: ingress_http
                route_config:
                  name: local_route
                  virtual_hosts:
                    - name: backend
                      domains: ["*"]
                      routes:
                        - match: { prefix: "/" }
                          route: { cluster: backend_service }
                http_filters:
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router

  clusters:
    - name: backend_service
      connect_timeout: 2s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: backend_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address: { address: backend, port_value: 8080 }

admin:
  address:
    socket_address: { address: 0.0.0.0, port_value: 9901 }
```
This is a minimal reverse proxy: any request to `:10000` is routed to the `backend_service` cluster, resolved via DNS, load-balanced round-robin.

---

## 2. Intermediate

### Static vs Dynamic Configuration
| Mode | How it works | Use case |
|---|---|---|
| **Static** | Entire config (listeners, routes, clusters) is one YAML file, loaded at startup, immutable without a restart | Standalone proxy, simple edge gateway, learning/testing |
| **Dynamic (xDS)** | A control plane pushes config over gRPC streams; Envoy updates its internal state live, no restart | Service mesh (Istio), any environment where backends/routes change constantly |

### The xDS API Family
| API | Full name | Discovers |
|---|---|---|
| **LDS** | Listener Discovery Service | Listeners and their filter chains |
| **RDS** | Route Discovery Service | Routing rules for an HTTP connection manager |
| **CDS** | Cluster Discovery Service | Upstream cluster definitions |
| **EDS** | Endpoint Discovery Service | Concrete backend IPs within a cluster |
| **SDS** | Secret Discovery Service | TLS certificates/keys, rotated without restart |

- In a service mesh, `istiod` (Istio's control plane) acts as the xDS server: it watches Kubernetes Services/Endpoints/VirtualServices and continuously pushes updated LDS/RDS/CDS/EDS config to every Envoy sidecar — this is precisely the control-plane/data-plane split described in [service-mesh-architecture-and-sidecar-pattern.md](../../Service%20Mesh/service-mesh-architecture-and-sidecar-pattern.md).
- Update order matters to avoid black-holing traffic during a change: Envoy applies **CDS → EDS → LDS → RDS** ("make before break" — new clusters/endpoints exist before routes/listeners referencing them go live).

### Filters and Filter Chains
Envoy's power comes from composable filters at both the network (L4) and HTTP (L7) layer:
- **Network filters**: `tcp_proxy`, `http_connection_manager`, `mongo_proxy`, `rbac` — operate on raw connections/bytes.
- **HTTP filters**: chained inside the HTTP connection manager — `router` (terminal, does the actual routing), `cors`, `jwt_authn`, `rate_limit`, `ext_authz` (delegate authz to an external service), `fault` (inject fake errors/delays for chaos testing).
- Filters execute in order; each can short-circuit the chain (e.g., `jwt_authn` rejecting an unauthenticated request before it ever reaches `router`).

### Load Balancing Policies
| Policy | Behavior |
|---|---|
| `ROUND_ROBIN` | Cycle through endpoints evenly |
| `LEAST_REQUEST` | Pick the endpoint with fewest active requests (good default under uneven latency) |
| `RANDOM` | Uniform random pick |
| `RING_HASH` / `MAGLEV` | Consistent hashing — same request key (e.g., a header) always lands on the same endpoint, useful for session affinity/caching |

### Retries, Timeouts, and Outlier Detection (Route/Cluster-level Resilience)
```yaml
routes:
  - match: { prefix: "/" }
    route:
      cluster: backend_service
      timeout: 2s
      retry_policy:
        retry_on: "5xx,reset,connect-failure"
        num_retries: 3
        per_try_timeout: 0.5s
```
```yaml
clusters:
  - name: backend_service
    outlier_detection:
      consecutive_5xx: 5
      interval: 10s
      base_ejection_time: 30s
      max_ejection_percent: 50
```
- **Retries** happen at the route level, with a `per_try_timeout` distinct from the overall request `timeout` — without this distinction, N retries could each wait the full timeout and multiply latency badly under failure.
- **Outlier detection** is Envoy's circuit-breaker-adjacent feature: it passively watches endpoint error rates and temporarily ejects misbehaving endpoints from the load-balancing pool, self-healing after `base_ejection_time`. This is what "circuit breaking" means concretely in an Envoy/Istio context — see [resilience-patterns.md](../../Service%20Mesh/resilience-patterns.md) for the broader pattern catalog.
- **Circuit breakers** (a separate, distinct config block) cap concurrent connections/requests/pending-requests per cluster to protect both Envoy and the backend from being overwhelmed, rather than reacting to error rates.

---

## 3. Advanced

### Observability Built Into the Proxy
Because every request passes through Envoy, it can emit rich telemetry with **zero app instrumentation**:
- **Stats**: hundreds of counters/gauges/histograms per listener/cluster/endpoint, exposed at `/stats` and `/stats/prometheus` on the admin interface — request counts, upstream latency histograms, connection pool state, circuit breaker trips.
- **Access logs**: structured per-request logs, fully configurable format, can include upstream/downstream timing, response codes, trace IDs.
- **Distributed tracing**: Envoy can generate spans for every proxied request and propagate/inject trace headers, exporting via the `tracing` config to a Zipkin/Jaeger/OTLP collector — see [opentelemetry.md](../open-telemetry/opentelemetry.md) and [jaeger.md](../jaeger/jaeger.md). In a mesh, this is *in addition to* app-level tracing, and is why service meshes give "free" service-to-service trace visibility even for unmodified legacy apps.

### Envoy as a Service Mesh Data Plane
- Istio injects an Envoy sidecar into every pod; `iptables` rules (or, increasingly, an ambient/ztunnel model) transparently redirect pod traffic through it.
- Each sidecar receives its config from `istiod` via xDS, based on Istio CRDs (`VirtualService`, `DestinationRule`, `Gateway`) which `istiod` translates into raw Envoy `RDS`/`CDS`/route config under the hood.
- Understanding raw Envoy config is directly useful for debugging Istio: `istioctl proxy-config routes/clusters/listeners <pod>` dumps the actual Envoy xDS state a sidecar received, and `istioctl proxy-config` output is literally the same LDS/RDS/CDS/EDS structures covered above.

### Envoy as an Edge/Ingress Proxy (Not Just a Sidecar)
- **Contour**, **Gloo Edge**, and the **Istio Ingress Gateway** are all "Envoy behind a Kubernetes-native control plane" for north-south (external-to-cluster) traffic, as opposed to the sidecar's east-west (service-to-service) role — see [kubernetes-ingress-deep-dive.md](../../Service%20Mesh/kubernetes-ingress-deep-dive.md) and [istio-gateway-and-ingress.md](../../Service%20Mesh/istio-gateway-and-ingress.md) for the north-south/east-west distinction in depth.
- Envoy Gateway (a newer CNCF-adjacent project) implements the Kubernetes **Gateway API** directly on top of Envoy, positioning it as a direct alternative to nginx-ingress/Contour.

### Performance and Resource Tuning
- Envoy is built for high throughput with low tail latency — C++, event-driven (non-blocking I/O via `libevent`), multi-threaded worker model where each worker owns its own connections (no shared-lock contention on the hot path).
- Connection pooling to upstreams is per-worker-thread by default; `HTTP/2` and `HTTP/3` (QUIC) upstream/downstream support reduces connection overhead versus HTTP/1.1.
- `concurrency` (number of worker threads) should generally match available CPU cores; oversubscribing wastes context-switch overhead.
- Circuit breaker limits (`max_connections`, `max_pending_requests`, `max_requests`, `max_retries` per cluster) must be tuned deliberately — defaults are conservative and will silently start rejecting traffic under load if left unchanged in a high-throughput service.

### Security
- **mTLS**: Envoy terminates/originates mutual TLS between sidecars using certs delivered dynamically via SDS — this is the mechanism underpinning Istio's mesh-wide mTLS (see [security-and-mtls.md](../../Service%20Mesh/security-and-mtls.md)).
- **RBAC filter**: L4/L7 authorization rules evaluated in-proxy, before a request reaches the application — e.g., "only `service-account: checkout` may call `POST /charge`."
- **ext_authz filter**: delegates the authorization decision to an external service per-request, useful for centralized policy engines (OPA, custom auth services).

### Common Failure Modes / Debugging
| Symptom | Likely cause | Where to look |
|---|---|---|
| 503 `UC` (upstream connection failure) in access logs | Backend unreachable, cluster misconfigured, or all endpoints ejected by outlier detection | `/clusters` on admin interface — check health status per endpoint |
| 503 `UF` | Upstream connection failure before request sent | Check upstream TLS/cert mismatch, connect_timeout too low |
| Requests hang until timeout | Missing/misconfigured `per_try_timeout` combined with retries | Route config's `retry_policy` and `timeout` |
| New route/cluster change doesn't take effect | xDS push not received/ACKed, or control plane pushed in wrong order | `/config_dump` on admin interface — confirm what Envoy actually has, not what you think you sent |
| Elevated p99 latency after adding a filter | Filter chain doing synchronous/blocking work (e.g., `ext_authz` calling a slow external service) | Stats histograms per filter, admin interface `/stats` |

---

## Quick Revision — Envoy
- L4/L7 proxy, C++, from Lyft, CNCF graduated (2018) — the de facto data plane for service meshes (Istio, App Mesh) and a standalone edge proxy (Contour, Gloo, Envoy Gateway).
- Core objects: Listener → Filter Chain → Route → Cluster → Endpoint.
- Static config = one YAML file, no runtime updates. Dynamic config = xDS (LDS/RDS/CDS/EDS/SDS) pushed live by a control plane over gRPC.
- Update order for xDS changes: CDS → EDS → LDS → RDS ("make before break").
- Resilience is proxy-level, not app-level: retries + per-try timeout, circuit breakers (concurrency caps), outlier detection (passive ejection on error rate).
- Rich built-in observability with zero app changes: `/stats`, `/stats/prometheus`, access logs, and native tracing span generation.
- Admin interface (port 9901) is the primary debugging tool: `/clusters`, `/config_dump`, `/stats`.
- In Istio, `istiod` is the xDS control plane; `istioctl proxy-config` dumps the raw Envoy config a sidecar actually received.
- See [service-mesh-overview.md](../../Service%20Mesh/service-mesh-overview.md) for the broader data-plane/control-plane architecture Envoy fits into.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
