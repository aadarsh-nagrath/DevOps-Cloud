# Observability in a Service Mesh

Because every request already passes through a sidecar proxy, a service mesh can generate rich, consistent observability data — metrics, distributed traces, and service-to-service traffic maps — for every service automatically, without any application code instrumentation. This is one of the most immediately valuable, lowest-effort benefits of adopting a mesh.

---

## 1. The Three Pillars, Automatically

| Pillar | What it answers | Provided by |
|---|---|---|
| **Metrics** | "How much traffic, how fast, how many errors?" (aggregate, numeric) | Envoy emits Prometheus-format metrics for every request automatically |
| **Distributed Tracing** | "For this ONE specific request, exactly which services did it pass through, and how long did each hop take?" | Envoy propagates trace headers and reports spans to a tracing backend (Jaeger/Zipkin) |
| **Service Graph / Topology** | "What does my whole system's traffic pattern actually look like right now?" | Visualization tools (Kiali) built on top of the metrics/traces above |

The critical point: **none of this requires the application to do anything**. A service written in Go, one in Python, and one in Java all get identical metrics, traces, and graph visibility, because the instrumentation lives in the sidecar (the same binary — Envoy — everywhere), not in each application's own code.

---

## 2. Metrics

Every Envoy sidecar exposes metrics like these automatically for every request it handles:

```
# Example Prometheus metrics Envoy emits (simplified)
istio_requests_total{
  source_app="checkout-service",
  destination_app="payment-service",
  response_code="200",
  connection_security_policy="mutual_tls"
} 15420

istio_request_duration_milliseconds_bucket{
  source_app="checkout-service",
  destination_app="payment-service",
  le="100"
} 14890
```

### Golden Signals — the metrics you actually care about
- **Request rate**: `istio_requests_total` — traffic volume between any two services.
- **Error rate**: the same metric, filtered/aggregated by `response_code` (5xx, 4xx).
- **Latency**: `istio_request_duration_milliseconds` — and critically, look at **percentiles (p50/p95/p99)**, not just averages, since averages hide tail latency problems (a few very slow requests can be invisible in an average but very visible in p99).
- **Saturation**: connection pool usage, active connections — signals you're approaching a capacity limit before it becomes an outage.

### Example PromQL query: error rate between two specific services
```promql
sum(rate(istio_requests_total{
  source_app="checkout-service",
  destination_app="payment-service",
  response_code=~"5.."
}[5m]))
/
sum(rate(istio_requests_total{
  source_app="checkout-service",
  destination_app="payment-service"
}[5m]))
```
This exact query pattern is what powers automated canary analysis — recall the `AnalysisTemplate` example in [Canary Deployment](../Deployment/Canary%20Deployment/canary-deployment.md), which used a nearly identical success-rate query to automatically decide whether to promote or roll back a canary release. The mesh's automatic metrics are what make that kind of automated, metrics-gated deployment pipeline possible without custom instrumentation work.

---

## 3. Distributed Tracing

A single user-facing request often triggers a chain of calls across many services — distributed tracing lets you see the entire chain as one coherent timeline, not just isolated logs from each service.

```
User request: "Complete checkout"
   |
   +-- checkout-service            [0ms   -> 450ms]  total request duration
         |
         +-- payment-service        [50ms  -> 280ms]  (230ms)
               |
               +-- fraud-detection-service   [80ms -> 200ms]  (120ms)
               |     |
               |     +-- external-bank-api    [90ms -> 190ms]  (100ms)  <- this is where most of the time went
               |
               +-- inventory-service          [285ms -> 440ms] (155ms)
```
This kind of waterfall view (what tools like Jaeger visualize) instantly answers questions that would otherwise require manually correlating timestamps across five different services' logs: *which specific hop in the chain is actually slow?* In the example above, it's clearly the external bank API call, not anything internal — without tracing, you might waste time investigating `checkout-service` or `payment-service` when the real bottleneck is a third-party dependency.

### How trace propagation actually works
Envoy automatically generates and forwards **trace context headers** (`x-request-id`, `x-b3-traceid`, `x-b3-spanid`, or the newer W3C `traceparent` standard) as a request flows through the mesh — this is what lets a tracing backend stitch together spans from completely different services into one coherent trace.

**Important caveat — the one place app code still has to participate**: if your application makes its own *additional* outbound calls (e.g., `payment-service` calling `fraud-detection-service` using its own HTTP client, not through a passthrough), it needs to **forward the incoming trace headers onto its outbound calls** for the trace to stay connected end-to-end. This is a small amount of required application code (usually a few lines using a tracing SDK/middleware), and it's the one gap in the "zero app code needed" claim — the sidecar can't invent context it never received an explicit link for beyond the request/response it directly sees.

```python
# The one bit of app code typically needed: propagate trace headers on any outbound call your service makes
@app.route("/charge")
def charge(request):
    trace_headers = {
        "x-request-id": request.headers.get("x-request-id"),
        "traceparent": request.headers.get("traceparent"),
    }
    # forward these when calling fraud-detection-service, so the trace stays connected
    requests.post(FRAUD_SERVICE_URL, headers=trace_headers, json=payload)
```

---

## 4. Kiali — the Service Mesh Dashboard

Kiali visualizes the metrics and topology data above as an actual live graph of your mesh:

```
[checkout-service] ---(95% success, 45ms p50)---> [payment-service] ---(99% success, 12ms p50)---> [fraud-detection-service]
        |
        +------(100% success, 8ms p50)---> [inventory-service]
```
- Nodes are services; edges are the actual observed traffic between them, with real-time success rate and latency annotated.
- **This is genuinely useful for onboarding and incident response**: a new engineer can see the real topology of a system (which is often subtly different from what's documented, since documentation drifts and traffic patterns evolve) at a glance, and during an incident, a red/degraded edge in the graph immediately shows *where* in the call chain the problem is.
- Also surfaces mTLS status per-connection (a small padlock icon on encrypted edges) — a quick visual sanity check that [security-and-mtls.md](security-and-mtls.md)'s enforcement is actually working as configured, not just configured.

---

## 5. The Full Observability Stack (as referenced in istio.md)

| Tool | Role |
|---|---|
| **Prometheus** | Scrapes and stores the metrics Envoy emits |
| **Grafana** | Dashboards/visualization on top of Prometheus data |
| **Jaeger** (or Zipkin) | Collects and visualizes distributed traces |
| **Kiali** | Service graph visualization, combining metrics + topology + mTLS status |

See [istio.md](../istio.md) at the repo root for the hands-on installation steps for this add-on stack (`kubectl apply -f` against the Istio samples' addon manifests) — this file focuses on *what* each piece gives you and *why*, that one covers the *how* of getting it running.

---

## 6. What Observability From the Mesh Does NOT Give You

Important to be clear-eyed about the boundary here:
- **Application-level/business logic errors**: if `payment-service` charges the wrong amount but still returns `HTTP 200`, the mesh sees a perfectly healthy, successful request — it has no idea anything is wrong. Mesh observability is about *network-level* health (did the request succeed, how long did it take), not business correctness.
- **Structured application logs**: the mesh gives you metrics and traces, not your application's actual log lines (`"processing order #4521"`) — that's still a separate logging pipeline (see [Monitoring and Logging](../Monitoring%20and%20Loggin/) notes elsewhere in this repo).
- **Database/cache-internal performance**: the mesh sees the network call *to* a database, but not what's happening inside the database engine itself (slow queries, lock contention) — that needs database-specific monitoring.

Mesh observability is a powerful, broad, low-effort layer — but it complements application-level logging/APM, it doesn't replace it.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
