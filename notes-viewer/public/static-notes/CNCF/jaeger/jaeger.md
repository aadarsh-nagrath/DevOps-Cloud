# Jaeger — Complete Notes

## 1. Beginner

### What is Jaeger?
- Open-source **distributed tracing** system, originally built at Uber, donated to CNCF in 2017, **graduated** in 2019.
- Solves one specific problem: in a microservices system, a single user request fans out across dozens of services — when something is slow or broken, which hop caused it? Jaeger answers that by tracing the request end-to-end.
- Inspired by Google's [Dapper paper](https://research.google/pubs/pub36356/) — same lineage as Zipkin (Jaeger and Zipkin are largely interoperable at the data-model level; Jaeger can ingest Zipkin-format spans via a compatibility receiver).
- Name meaning: "Jaeger" is German for "hunter" — chosen because it "hunts" for problems across a system, and because Uber wanted something short and easy to say across a globally distributed engineering org.

### The Core Problem It Solves
```
User request -> API Gateway -> Auth Service -> Order Service -> Payment Service -> Inventory Service -> DB
                                                        |
                                                        v
                                              (this call took 4.2s — why?)
```
Without tracing, you'd have to correlate timestamps across 6 different services' logs by hand. With tracing, you get one **trace** showing every **span** (unit of work) in the request, with exact timing, nesting, and metadata — in one waterfall view.

### Core Concepts
| Term | Meaning |
|---|---|
| **Trace** | The full journey of one request across all services — a tree (strictly, a directed acyclic graph via span links) of spans, identified by a single 128-bit trace ID |
| **Span** | A single unit of work (e.g., one HTTP call, one DB query) with a start time, duration, and metadata (tags, logs) |
| **Span Context** | The propagated identifiers (trace ID, span ID, sampling flag) that let a downstream service attach its span to the same trace |
| **Tags** | Key-value metadata on a span, e.g. `http.status_code=500`, `db.statement=...` — searchable in the UI |
| **Logs (span logs)** | Timestamped events within a span's lifetime (e.g., "cache miss", "retrying") — called "Span Events" in OpenTelemetry terminology, same concept |
| **Baggage** | Key-value data propagated across the *entire* trace, available to every span (used sparingly — adds overhead to every hop since it rides on every outbound request header) |
| **Process** | The service/host identity attached to every span from that service — `service.name`, plus arbitrary process-level tags (hostname, version, SDK info) |
| **Operation Name** | The human-readable name of what a span represents, e.g. `HTTP GET /checkout`, `SELECT orders` — this is what you search by in the UI alongside service name |

### Architecture
```
[Your App + Jaeger Client/SDK]
         |
         | spans (UDP/gRPC, via OTLP or Jaeger protocol)
         v
[Jaeger Agent] --(optional, batches + forwards)--> [Jaeger Collector]
                                                            |
                                                            v
                                                   [Storage Backend]
                                                (Cassandra / Elasticsearch /
                                                 Kafka (buffer) / in-memory for dev)
                                                            |
                                                            v
                                                    [Jaeger Query Service]
                                                            |
                                                            v
                                                      [Jaeger UI]
```
- **Client/SDK**: instruments your app (increasingly this is now the **OpenTelemetry SDK** exporting in OTLP format — Jaeger deprecated its own native client libraries in favor of OTel; see [OpenTelemetry notes](../open-telemetry/opentelemetry.md)).
- **Agent**: a small daemon (sidecar or host daemonset) that receives spans over UDP and batches/forwards them to the Collector — reduces the number of things talking directly to the Collector. Increasingly optional/legacy now that OTLP-over-gRPC lets apps talk to the Collector directly.
- **Collector**: receives spans, validates, indexes, and writes them to storage. Stateless — scales horizontally.
- **Storage**: pluggable — Cassandra or Elasticsearch for production, Kafka as an optional buffer between Collector and storage, in-memory/Badger for local dev (no external dependency).
- **Query Service + UI**: reads from storage, serves the web UI for searching/viewing traces, and exposes a JSON HTTP API (and gRPC API) that the UI itself consumes — the same API is usable directly for programmatic trace retrieval.

### All-in-One (Dev Mode)
For local development, Jaeger ships an `all-in-one` binary/image that bundles Agent + Collector + Query + UI + in-memory storage into a single process — this is what you'll run locally (see [tutorial/local-setup.md](tutorial/local-setup.md)).

### Jaeger's Data Model
A span, in full, is roughly:
```json
{
  "traceID": "5e8f...c1a2",
  "spanID": "3b7d...9f01",
  "parentSpanID": "1a2b...ffee",
  "operationName": "HTTP GET /checkout",
  "startTime": 1717000000000000,
  "duration": 142300,
  "tags": [
    {"key": "http.status_code", "type": "int64", "value": 200},
    {"key": "http.method", "type": "string", "value": "GET"}
  ],
  "logs": [
    {"timestamp": 1717000000050000, "fields": [{"key": "event", "value": "cache_miss"}]}
  ],
  "process": {
    "serviceName": "checkout-service",
    "tags": [{"key": "hostname", "value": "pod-7f9c"}]
  },
  "references": [
    {"refType": "CHILD_OF", "traceID": "5e8f...c1a2", "spanID": "1a2b...ffee"}
  ]
}
```
`references` (`CHILD_OF`, `FOLLOWS_FROM`) is how Jaeger encodes both strict parent-child relationships and the looser "related but async" relationship (equivalent to OTel's Span Links) — this predates OTel's own vocabulary and is one of the concepts OTel's Span Links generalized.

---

## 2. Intermediate

### Instrumenting an Application
Modern Jaeger deployments are instrumented via **OpenTelemetry**, not Jaeger's own (deprecated) client libraries. The flow:
```
App code (OTel SDK) --auto or manual instrumentation--> OTLP exporter --> Jaeger Collector (OTLP endpoint, port 4317/4318)
```
Example — manual span creation in Go using the OTel SDK, exporting to Jaeger:
```go
tp := trace.NewTracerProvider(
    trace.WithBatcher(otlptracegrpc.NewClient()), // exports to Jaeger's OTLP gRPC endpoint
    trace.WithResource(resource.NewWithAttributes(
        semconv.SchemaURL,
        semconv.ServiceNameKey.String("order-service"),
    )),
)
otel.SetTracerProvider(tp)

tracer := otel.Tracer("order-service")
ctx, span := tracer.Start(ctx, "processOrder")
defer span.End()
span.SetAttributes(attribute.String("order.id", orderID))
```
Example — Node.js/JavaScript, exporting to Jaeger via OTLP HTTP:
```javascript
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

const sdk = new NodeSDK({
  resource: new Resource({ [SemanticResourceAttributes.SERVICE_NAME]: 'frontend' }),
  traceExporter: new OTLPTraceExporter({ url: 'http://localhost:4318/v1/traces' }),
});
sdk.start();
```

### Why Jaeger's Own Client Libraries Were Deprecated
- Jaeger originally shipped its own instrumentation client libraries (`jaeger-client-go`, `jaeger-client-java`, `jaeger-client-python`, etc.) implementing the OpenTracing API, predating OpenTelemetry's existence.
- Once OpenTelemetry became the CNCF-standard instrumentation layer and Jaeger's own maintainers were also core OTel contributors, maintaining two separate, largely-overlapping client library ecosystems stopped making sense — all Jaeger native clients were formally deprecated (final release ~2021-2022) in favor of instrumenting with OTel SDKs and exporting via OTLP.
- Practical implication: any tutorial or codebase still importing `jaeger-client-*` packages is working against an unmaintained, EOL library — new instrumentation should always go through an OTel SDK regardless of the eventual backend.

### Context Propagation
- Trace context (trace ID + span ID) must travel with the request across service boundaries — typically via the **W3C Trace Context** HTTP headers (`traceparent`, `tracestate`), which OTel sets automatically.
- Jaeger also historically used its own propagation header format (`uber-trace-id: {trace-id}:{span-id}:{parent-id}:{flags}`) from its pre-OTel days — still supported for backward compatibility/interop with legacy instrumented services during a migration, but W3C Trace Context is the default and recommended format for anything instrumented today.
- Without correct propagation, each service starts a *new* disconnected trace instead of continuing the existing one — the #1 cause of "broken" traces in practice (see [OpenTelemetry notes — Context Propagation](../open-telemetry/opentelemetry.md) for the mechanics of `inject()`/`extract()` at async boundaries like message queues).

### Sampling
Tracing every single request in a high-traffic system is expensive (storage + performance overhead). Sampling strategies:
| Strategy | How it works | Use case |
|---|---|---|
| **Constant** | Sample 100% or 0% — all or nothing | Local dev/debugging |
| **Probabilistic** | Sample a fixed % of traces (e.g., 1%) | Simple, predictable overhead — most common default |
| **Rate limiting** | Cap to N traces/second regardless of volume | Protect storage from traffic spikes |
| **Remote/Adaptive** | Collector tells clients what sampling rate to use per-service, adjusted dynamically | Production systems with variable traffic per service |
| **Tail-based sampling** | Decide *after* the trace completes — e.g., always keep traces with errors or high latency, drop boring fast ones | Best signal-to-noise, but needs a buffering collector (e.g., OTel Collector's tail-sampling processor) since the decision needs the *whole* trace first |

**Remote sampling in depth**: Jaeger's Collector can serve a `sampling.json`-style strategy file over an API that supports OTel/Jaeger clients' *remote sampling* extension — instead of hardcoding a sample rate in every service's startup config, services periodically poll the Collector for their current strategy, and the Collector can assign **per-service, per-operation** rates:
```json
{
  "default_strategy": {
    "type": "probabilistic",
    "param": 0.1
  },
  "per_service_strategies": [
    {
      "service": "checkout-service",
      "type": "probabilistic",
      "param": 1.0
    },
    {
      "service": "high-volume-batch-job",
      "type": "ratelimiting",
      "param": 5
    }
  ]
}
```
This is what "adaptive sampling" means in practice for Jaeger — a central policy, hot-reloadable without redeploying every service, and tunable per service based on its actual traffic volume/criticality (a checkout flow might warrant 100% sampling while a noisy internal health-check endpoint warrants near-zero).

### Searching Traces in the UI
- Search by service name, operation name, tags (key=value exact match, or `min duration`/`max duration`, or a free-text tag search like `error=true`), duration range, time range, and result limit.
- **Trace comparison**: overlay two traces to spot structural/timing differences — useful for "why is this request slower than a similar one."
- **Service dependency graph**: auto-derived from span parent-child relationships — a live map of which services call which, with edge thickness/labels often reflecting call volume.
- **Trace timeline / waterfall view**: the canonical view — a Gantt-chart-style rendering of every span, nested by parent-child relationship, colored by service, letting you visually spot the longest/most sequential chain of calls (the "critical path") at a glance.
- **Trace JSON download**: any trace can be exported as raw JSON from the UI — useful for filing a bug report, diffing two trace structures programmatically, or feeding into custom tooling outside Jaeger's own UI.

### The Jaeger Query API
The Query Service exposes a documented HTTP API the UI itself uses, which you can hit directly (e.g., from a script, or another internal tool):
```bash
# Find traces
curl "http://localhost:16686/api/traces?service=checkout-service&operation=HTTP+GET&limit=20&lookback=1h"

# Get a specific trace by ID
curl "http://localhost:16686/api/traces/5e8fabc1a2"

# List known services
curl "http://localhost:16686/api/services"

# List operations for a service
curl "http://localhost:16686/api/services/checkout-service/operations"

# Service dependency graph data
curl "http://localhost:16686/api/dependencies?endTs=$(date +%s000)&lookback=86400000"
```
This API is how third-party tools (custom dashboards, chatops bots that fetch "the slowest trace for X in the last hour," CI pipelines that assert on trace shape after a load test) integrate with Jaeger without going through the UI.

### Deployment Topologies
| Topology | When to use |
|---|---|
| **All-in-one** | Local dev, demos — everything in one process, in-memory storage |
| **Agent (daemonset) + Collector + separate storage** | Classic production Kubernetes setup — one agent per node |
| **Direct-to-collector (no agent)** | Simpler, common now that apps export OTLP directly; skips a hop |
| **Collector behind Kafka** | High-throughput production — Kafka absorbs bursts so the Collector/storage don't fall over during traffic spikes |

---

## 3. Advanced

### Storage Backend Tradeoffs
| Backend | Pros | Cons |
|---|---|---|
| **Elasticsearch** | Good query flexibility, widely operated already in most orgs, supports Index Lifecycle Management (ILM) for automated retention/rollover | Heavier to run/tune well at scale, mapping/shard sizing needs real tuning for high span volume |
| **Cassandra** | Very high write throughput, horizontally scalable, predictable performance under sustained write load | Ops complexity, less flexible ad-hoc querying, tag-based search requires careful schema/index design |
| **Badger (embedded, all-in-one)** | Zero external dependency, fast for a single node | Single-node only — dev/small-scale only, not horizontally scalable |
| **Kafka (as buffer, not final storage)** | Decouples ingestion spikes from storage write capacity, lets you replay/reprocess spans, enables the "streaming" deployment strategy | Extra moving part, not a storage backend itself, adds operational surface (topic management, consumer lag monitoring) |
| **Grafana Tempo (alternative backend, OTLP/Jaeger-protocol compatible)** | Object-storage-backed (S3/GCS), much cheaper at scale than Cassandra/ES since it doesn't index every tag — trades ad-hoc tag search for trace-ID/TraceQL-based lookup | Different query model — not a drop-in for teams relying heavily on free-form tag search in the Jaeger UI |

### Cassandra Schema Essentials
For teams running Cassandra as the storage backend, worth knowing the core tables Jaeger creates (via its schema migration scripts):
- `traces` — the actual span data, partitioned by trace ID.
- `service_names` / `operation_names` — indexes powering the UI's service/operation dropdowns.
- `service_name_index`, `service_operation_index`, `tag_index`, `duration_index` — secondary indexes that make "find traces by service+tag+duration" queries fast without a full scan; these are what make Cassandra's schema design matter so much for query performance at scale — a poorly tuned TTL or overly broad tag indexing strategy can balloon these tables disproportionately to the actual trace data.
- TTL (time-to-live) is set per-table at schema creation time (`--span-storage.cassandra.trace-ttl` at Collector startup) — this is Cassandra's native mechanism for automatic data expiry, avoiding manual cleanup jobs.

### Jaeger + OpenTelemetry Collector
- The **OTel Collector** (see [opentelemetry.md](../open-telemetry/opentelemetry.md)) is increasingly placed *in front of* Jaeger: apps → OTel Collector (does batching, tail-sampling, filtering, PII scrubbing, fan-out to multiple backends) → Jaeger Collector (OTLP-native since Jaeger 1.35+).
- This means Jaeger today functions primarily as a **backend/storage+UI layer**, while OTel handles instrumentation and collection — this is the direction the whole CNCF tracing ecosystem has moved (Jaeger's own client libraries are deprecated/EOL in favor of OTel SDKs).
- As of Jaeger v2 (a rewrite released as a distribution of the OpenTelemetry Collector itself), the Jaeger backend *is* an OTel Collector binary with Jaeger-specific storage exporters/UI baked in — the two projects have effectively converged architecturally, not just at the protocol level. Jaeger v2 config files use the same receivers/processors/exporters pipeline YAML shape as a normal OTel Collector config, with Jaeger's storage and query service wired in as additional components.

### Jaeger Operator (Kubernetes)
- The **Jaeger Operator** manages Jaeger deployments via a `Jaeger` CRD, handling the Collector/Query/Agent/storage wiring declaratively:
```yaml
apiVersion: jaegertracing.io/v1
kind: Jaeger
metadata:
  name: simple-prod
spec:
  strategy: production
  collector:
    replicas: 3
    maxReplicas: 10
    resources:
      limits:
        cpu: "1"
        memory: 1Gi
  storage:
    type: elasticsearch
    options:
      es:
        server-urls: https://elasticsearch:9200
    esIndexCleaner:
      enabled: true
      numberOfDays: 7            # retention — deletes indices older than N days
  ingress:
    enabled: true
```
- `strategy: allInOne | production | streaming` — `production` deploys separate Collector/Query with external storage; `streaming` adds Kafka in between for high-throughput resilience.
- The Operator also manages **sidecar injection**: annotating a pod with `sidecar.jaegertracing.io/inject: "true"` (legacy Agent-sidecar pattern) automatically adds a Jaeger Agent container to that pod — largely superseded now by pods exporting OTLP directly to a Collector Service, but still seen in older clusters.

### Correlating Traces with Metrics and Logs (The "Three Pillars")
- Traces alone don't tell you *system-wide* health (that's metrics' job) or give arbitrary free-text detail (that's logs' job) — the three are complementary, not substitutes.
- Common pattern: **exemplars** — a Prometheus histogram metric (e.g., request duration) carries a linked trace ID for a sample that fell in a given bucket, letting you jump from "this latency spike in Grafana" directly to "the exact trace that caused it." See [prometheus.md](../../Monitoring%20and%20Loggin/prometheous/prometheus.md).
- Logs correlated via trace ID injected into structured log lines (`trace_id=abc123`) so you can pivot from a log line to the full trace in Jaeger — this is exactly what OTel's Log Bridge API automates (see [opentelemetry.md](../open-telemetry/opentelemetry.md)).
- **Jaeger's Monitor tab**: when Jaeger is configured with a Prometheus/metrics-storage backend for span-derived RED metrics (Rate/Errors/Duration — computed by the `spanmetrics` connector in an OTel Collector pipeline sitting in front of Jaeger), the Jaeger UI itself can render latency/error-rate graphs per service directly, without leaving the tracing UI — bridging metrics into the tracing tool's own interface rather than only the other direction (traces linked from Grafana).

### Performance/Scale Considerations
- **Span size matters**: excessive tags/logs per span bloat storage — instrument meaningfully, not exhaustively. A span with a full HTTP response body dumped as a tag is a common storage-cost mistake.
- **Sampling is the main lever** for cost control at scale — tail-based sampling gives the best signal but requires buffering full traces in the collector before deciding, which costs memory.
- **Collector horizontal scaling**: stateless, scale by replica count behind a load balancer/Kubernetes Service. Watch `jaeger_collector_spans_dropped_total` and `jaeger_collector_queue_length` — a growing queue length under steady load means the Collector can't keep up with ingest and needs more replicas or a larger internal queue.
- **Retention**: traces are typically retained far shorter than metrics (days, not months) — configure TTL/index rollover on the storage backend (ILM policies for Elasticsearch via the `esIndexCleaner` job, TTL for Cassandra set at schema creation).
- **Query performance**: `find traces` queries against Cassandra/ES get slower as the tag-search surface grows — teams at real scale often limit which tags are indexed for search (rather than indexing everything) to keep query latency bounded.

### Common Failure Modes / Debugging
| Symptom | Likely cause |
|---|---|
| No traces appear in UI at all | App SDK never wired to an exporter, Collector unreachable (wrong OTLP endpoint/port), or Collector's storage backend connection is down (check Collector logs/health endpoint) |
| Trace exists but is missing spans from one service | That service's context propagation is broken (async boundary, missing header forward), or its spans are being sampled out independently rather than following the parent's sampling decision |
| Traces appear late / with a delay | Batch export interval too long client-side, or Collector's queue backing up under load |
| Cassandra/ES storage growing unexpectedly fast | TTL/retention not configured, high-cardinality tags being indexed, or sampling rate effectively at or near 100% |
| Service dependency graph missing an edge | That call's spans aren't both `CLIENT` and `SERVER` kind (or `CHILD_OF` reference) as expected — Jaeger derives the graph from span kind/reference structure, so a miscategorized span kind breaks graph inference even though the trace itself looks fine |
| `esIndexCleaner`/retention job not deleting old data | Job misconfigured or lacking permissions against the Elasticsearch cluster — worth explicitly verifying since silent retention failures are how storage clusters unexpectedly run out of disk |

---

## Quick Revision — Jaeger
- Distributed tracing system: trace = full request journey (128-bit trace ID), span = one unit of work. Originally built at Uber, CNCF graduated 2019.
- Architecture: Client/SDK → (Agent, optional/legacy) → Collector → Storage (Cassandra/ES/in-memory/Badger) → Query → UI. Query Service also exposes a documented HTTP API used directly by the UI.
- Modern instrumentation goes through **OpenTelemetry SDKs**, not Jaeger's own deprecated (EOL) clients — Jaeger is now mainly the backend/UI; as of Jaeger v2 it's literally built as an OTel Collector distribution.
- Context propagation (W3C Trace Context headers by default; legacy `uber-trace-id` header still supported for interop) is what stitches spans into one trace across services — broken propagation = broken/disconnected traces, the most common real-world issue.
- Sampling: probabilistic (simple, static), rate-limiting, remote/adaptive (central per-service/per-operation strategy served from the Collector), tail-based (best signal, most expensive, needs an OTel Collector in front doing the buffering).
- References: `CHILD_OF` (strict parent-child) and `FOLLOWS_FROM` (loose/async) — the pre-OTel equivalent of OTel's Span Links.
- Jaeger Operator + `Jaeger` CRD manages production deployments (`allInOne` / `production` / `streaming` strategies), including retention via `esIndexCleaner` and legacy sidecar injection.
- Pairs with metrics (exemplars, `spanmetrics`-derived RED metrics feeding Jaeger's own Monitor tab) and logs (trace ID correlation) as the third pillar of observability.
- At scale: watch Collector queue length/dropped-spans metrics, keep tag indexing scoped (don't index everything), and set explicit retention — silent storage growth is the most common operational surprise.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
