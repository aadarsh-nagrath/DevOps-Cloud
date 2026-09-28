# Envoy — Learn It Locally

Goal: run Envoy standalone in Docker with a static config proxying to two real backend containers, send it traffic with `curl`, and inspect live stats/health on the admin interface — in about 15 minutes.

## Prerequisites
- Docker installed and running.
- `curl`.

---

## Step 1 — Set Up the Working Folder and Backend Containers

```bash
mkdir -p ~/envoy-lab && cd ~/envoy-lab
docker network create envoy-lab
```

Run two simple backend containers so we have something real to load-balance across:
```bash
docker run -d --name backend1 --network envoy-lab \
  -e PORT=8080 hashicorp/http-echo -listen=:8080 -text="response from backend1"

docker run -d --name backend2 --network envoy-lab \
  -e PORT=8080 hashicorp/http-echo -listen=:8080 -text="response from backend2"
```

---

## Step 2 — Write the Static Envoy Config

```yaml
# envoy.yaml
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
                access_log:
                  - name: envoy.access_loggers.stdout
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.access_loggers.stream.v3.StdoutAccessLog
                route_config:
                  name: local_route
                  virtual_hosts:
                    - name: backend
                      domains: ["*"]
                      routes:
                        - match: { prefix: "/" }
                          route:
                            cluster: backend_service
                            retry_policy:
                              retry_on: "5xx,connect-failure"
                              num_retries: 2
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
                  address: { socket_address: { address: backend1, port_value: 8080 } }
              - endpoint:
                  address: { socket_address: { address: backend2, port_value: 8080 } }

admin:
  address:
    socket_address: { address: 0.0.0.0, port_value: 9901 }
```

This defines a listener on `:10000` that round-robins every request across `backend1` and `backend2`, plus an admin interface on `:9901`.

---

## Step 3 — Run Envoy

```bash
docker run -d --name envoy --network envoy-lab \
  -p 10000:10000 -p 9901:9901 \
  -v $(pwd)/envoy.yaml:/etc/envoy/envoy.yaml:ro \
  envoyproxy/envoy:v1.31-latest
```

```bash
docker logs envoy --tail 20
```
You should see Envoy start up cleanly with the listener bound on `10000`.

---

## Step 4 — Send Traffic and Watch Load Balancing

```bash
for i in $(seq 1 6); do curl -s localhost:10000; echo; done
```
Expect alternating output:
```
response from backend1
response from backend2
response from backend1
response from backend2
...
```
That's `ROUND_ROBIN` load balancing working across the two endpoints in the `backend_service` cluster.

Watch the access log stream live in another terminal:
```bash
docker logs -f envoy
```
Each request will print a structured access log line (method, path, response code, timing) — this is the built-in observability from the notes, with zero instrumentation in the backend containers themselves.

---

## Step 5 — Explore the Admin Interface

```bash
# Overall Envoy state / version / uptime
curl -s localhost:9901/server_info | head -20

# Per-cluster/endpoint health and request stats
curl -s localhost:9901/clusters

# All stats (hundreds of counters/gauges) — filter to something readable
curl -s localhost:9901/stats | grep backend_service

# Prometheus-format stats (what a real Prometheus scrape config would pull)
curl -s localhost:9901/stats/prometheus | grep envoy_cluster_upstream_rq

# The full effective config Envoy is running with right now
curl -s localhost:9901/config_dump | head -50
```
`/clusters` is the single most useful endpoint for debugging real outages — it shows each endpoint's health status (`healthy`/`unhealthy`), current connection counts, and request/failure counters per endpoint.

---

## Step 6 — Break a Backend and Watch Outlier Detection-Adjacent Behavior

Stop one backend to simulate a failure:
```bash
docker stop backend1
```
```bash
for i in $(seq 1 6); do curl -s -o /dev/null -w "%{http_code}\n" localhost:10000; done
```
Because the route has `retry_policy` with `retry_on: 5xx,connect-failure`, requests that would have hit the dead `backend1` transparently retry against `backend2` — you should see mostly `200`s, not `503`s, even though half the cluster is down. Check `/clusters` again to see `backend1`'s endpoint marked unhealthy.

Bring it back:
```bash
docker start backend1
```

---

## Step 7 — Try Header-Based Routing

Edit `envoy.yaml`'s `route_config` to add a header match before the catch-all route (Envoy evaluates routes top to bottom, first match wins):
```yaml
routes:
  - match:
      prefix: "/"
      headers:
        - name: "x-canary"
          string_match: { exact: "true" }
    route:
      cluster: backend_service
      # in a real setup this would point to a separate "canary" cluster
  - match: { prefix: "/" }
    route: { cluster: backend_service }
```
Restart Envoy to pick up the static config change (static config only reloads on restart — this is exactly the limitation dynamic xDS config solves in production):
```bash
docker restart envoy
curl -s -H "x-canary: true" localhost:10000
```

---

## Cleanup
```bash
docker rm -f envoy backend1 backend2
docker network rm envoy-lab
```

## What to Explore Next
- Add an `outlier_detection` block to the cluster config, then make `backend1` return 500s (swap the `http-echo` image for one that fails) instead of dying outright, and watch Envoy passively eject it from the pool after `consecutive_5xx` failures.
- Add circuit breaker limits (`max_connections`, `max_pending_requests`) to the cluster and hammer it with concurrent requests (`hey` or `ab`) to see Envoy start rejecting before the backend falls over.
- Point Envoy's `tracing` config at a local Jaeger/OTel Collector instance (see [../../open-telemetry/tutorial/local-setup.md](../../open-telemetry/tutorial/local-setup.md)) and watch Envoy generate spans for proxied requests with zero backend instrumentation.
- Spin up a `kind` cluster, install Istio, and run `istioctl proxy-config clusters <pod>` / `routes` / `listeners` on a real sidecar to see this exact xDS structure generated dynamically instead of hand-written.
