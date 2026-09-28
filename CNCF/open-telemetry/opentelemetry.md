# OpenTelemetry — Complete Notes

## 1. Beginner

### What is OpenTelemetry?
- A CNCF project (currently **incubating**, the second-most active CNCF project by contributor count after Kubernetes) providing a **vendor-neutral standard** for generating, collecting, and exporting telemetry data: traces, metrics, and logs.
- Formed in 2019 by merging two competing projects: **OpenTracing** (a tracing API standard backed by CNCF) and **OpenCensus** (Google's combined metrics+tracing library). Before the merge, instrumentation libraries had to pick one or the other, or vendors shipped their own proprietary agents — OTel ended that fragmentation.
- OpenTelemetry is **not a backend**. It doesn't store or visualize data. It standardizes how telemetry is *produced* and *shipped*; you still bring your own backend (Jaeger, Prometheus, Datadog, Grafana, Honeycomb, ...).
- Governed by the OpenTelemetry Specification — a language-agnostic document defining the API, SDK, and OTLP protocol contracts — with per-language implementations (Go, Java, Python, JS/Node, .NET, Ruby, PHP, Rust, C++, Swift, Erlang/Elixir) built against that spec, so behavior is consistent across languages even though each SDK is a separate codebase.

### The Core Problem It Solves
```
Before OTel:
  App A (Datadog agent)  --> Datadog only
  App B (New Relic SDK)  --> New Relic only
  App C (Zipkin client)  --> Zipkin only
  Switching vendors = re-instrumenting every app, in every language.

After OTel:
  App A, B, C (OTel SDK) --> OTLP --> [OTel Collector] --> Jaeger + Prometheus + Datadog (simultaneously)
  Switching/adding a backend = a config change in the Collector. Zero app code changes.
```
This "instrument once, export anywhere" property is the entire value proposition. It decouples **instrumentation** (owned by app developers) from **backend choice** (owned by whoever operates observability infra, and which can change over time).

### The Three Signals
| Signal | What it captures | Analogous to |
|---|---|---|
| **Traces** | The path of a single request across services, as a tree of spans | Jaeger/Zipkin's domain — see [jaeger.md](../jaeger/jaeger.md) |
| **Metrics** | Aggregated numeric measurements over time (counters, gauges, histograms) | Prometheus's domain |
| **Logs** | Timestamped, structured or unstructured event records | Loki/ELK's domain |

OTel's goal is to unify all three under one API/SDK/wire-protocol so they can be correlated (e.g., a log line and a metric spike both linking to the same `trace_id`). Traces reached GA/stable first (2021), metrics stabilized next (2022), logs are the newest and only fully stabilized more recently — this maturity ordering matters when picking what to lean on today in a given language SDK.

### Core Concepts
| Term | Meaning |
|---|---|
| **API** | Language-specific interfaces for creating spans/metrics/logs — what instrumentation *code* calls. No-op by default until an SDK is wired in |
| **SDK** | The actual implementation behind the API — processors, samplers, exporters. What you configure in your app's startup code |
| **Instrumentation** | Code that uses the API to generate telemetry — either auto (agent/library hooks) or manual (hand-written spans) |
| **Exporter** | Component that ships telemetry out in a given wire format (OTLP, Jaeger, Prometheus, ...) |
| **Resource** | Metadata identifying *what* produced the telemetry (`service.name`, `service.version`, `host.name`) — attached once per process |
| **Context Propagation** | Carrying trace/span identity across process boundaries, typically via HTTP headers |
| **Collector** | A standalone, language-agnostic process that receives, processes, and re-exports telemetry — the pipeline hub of an OTel deployment |
| **Baggage** | Key-value pairs propagated alongside trace context across the whole call chain, readable by every downstream service (not just attached to spans) |

### API vs SDK — Why the Split Matters
- A library author (say, a Redis client) instruments against the **API only**. If the end application never installs an SDK, those API calls are harmless no-ops — zero overhead, zero dependency bloat for users who don't care about tracing.
- The **application** (not the library) chooses and configures the **SDK** — samplers, exporters, batching. This means libraries never dictate telemetry backend choice; only the final app does.
- This split is why OTel could get adopted inside library ecosystems without every library needing an opinion on Jaeger vs Datadog vs whatever.
- Concretely in code: `opentelemetry-api` (or the equivalent package per language) has no real implementation — calling `tracer.start_span()` before an SDK is registered returns a `NoOpSpan`. Only after `TracerProvider`/`MeterProvider`/`LoggerProvider` are constructed and globally registered (usually once, at process startup) do calls actually produce telemetry.

### Basic Manual Instrumentation (Python)
```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.sdk.resources import Resource

resource = Resource(attributes={"service.name": "checkout-service"})
provider = TracerProvider(resource=resource)
provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))  # prints spans to stdout
trace.set_tracer_provider(provider)

tracer = trace.get_tracer("checkout")
with tracer.start_as_current_span("process_order") as span:
    span.set_attribute("order.id", "12345")
    # business logic here
```
This is the pattern in every language: build a `TracerProvider` (or `MeterProvider`/`LoggerProvider`), attach exporters via processors, register it globally, then get a `tracer`/`meter`/`logger` from it.

---

## 2. Intermediate

### Auto-Instrumentation vs Manual Instrumentation
| Approach | How it works | Tradeoff |
|---|---|---|
| **Auto-instrumentation** | An agent (e.g., `opentelemetry-instrument` Python wrapper, Java `-javaagent`) monkey-patches known libraries (Flask, requests, JDBC, gRPC) at startup — zero code changes | Fast to adopt, covers framework/library boundaries well, but misses custom business logic spans |
| **Manual instrumentation** | Developer writes `tracer.start_as_current_span(...)` calls explicitly around code of interest | Precise, captures business-meaningful spans, but requires ongoing developer effort |
| **Hybrid (most common in practice)** | Auto-instrumentation for framework/library boundaries + manual spans for business-critical logic | Best signal-to-effort ratio — this is what real production systems do |

Auto-instrumentation example (Python, zero code changes):
```bash
pip install opentelemetry-distro opentelemetry-exporter-otlp
opentelemetry-bootstrap -a install   # installs instrumentation for detected libraries (flask, requests, etc.)

OTEL_SERVICE_NAME=checkout-service \
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 \
opentelemetry-instrument python app.py
```

Auto-instrumentation example (Java, zero code changes — the most mature auto-instrumentation ecosystem of any language, covering 100+ libraries/frameworks out of the box):
```bash
curl -L -O https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar

java -javaagent:opentelemetry-javaagent.jar \
     -Dotel.service.name=checkout-service \
     -Dotel.exporter.otlp.endpoint=http://localhost:4317 \
     -jar checkout-service.jar
```
The Java agent works by bytecode instrumentation at class-load time — it injects tracing hooks into known library classes (Spring, JDBC drivers, Kafka clients, gRPC) without touching your source, which is why it's the fastest onboarding path for existing JVM services with zero code review needed.

### All Configuration Is Env-Var Driven by Convention
Every OTel SDK recognizes a common set of `OTEL_*` environment variables so ops teams can configure instrumentation without touching app code — critical for auto-instrumentation and for consistent rollout across many services:
```bash
OTEL_SERVICE_NAME=checkout-service
OTEL_RESOURCE_ATTRIBUTES=service.version=1.4.2,deployment.environment=production
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
OTEL_EXPORTER_OTLP_PROTOCOL=grpc              # or http/protobuf
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1                    # sample 10%
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_PROPAGATORS=tracecontext,baggage
OTEL_METRIC_EXPORT_INTERVAL=15000              # ms
```
This is the single biggest practical lever for standardizing telemetry config across a whole fleet — a platform team ships default env vars via a Kubernetes admission webhook/Helm chart, and individual services rarely need SDK-level code to override them.

### Tracing API In Depth
| Concept | Meaning |
|---|---|
| **Span** | A single operation with a name, start/end time, status (`Unset`/`Ok`/`Error`), attributes, events, and links |
| **Span Kind** | `INTERNAL` (default), `SERVER` (handling an incoming request), `CLIENT` (making an outgoing request), `PRODUCER`/`CONSUMER` (async messaging) — used by backends to render correct waterfalls and compute RED metrics |
| **Span Events** | Timestamped annotations within a span's lifetime (replaces the older "logs on a span" concept from OpenTracing) — e.g. `span.add_event("cache_miss", {"cache.key": "user:42"})` |
| **Span Links** | Connects a span to another *unrelated* trace — the key use case is batch processing: one span representing "process batch of 50 messages" links to all 50 individual producer spans, since it's not a strict parent-child relationship |
| **Status** | `Ok`, `Error`, or `Unset` (default) — set explicitly via `span.set_status()`; distinct from HTTP status codes, though semantic conventions map common failure codes to `Error` |
| **Recording vs Non-Recording Span** | A sampled-out span is still created (so context propagation still works) but is a lightweight non-recording span that drops all attribute/event calls — this is why sampling decisions don't break trace continuity even when a hop is dropped |

```python
with tracer.start_as_current_span("charge_payment", kind=trace.SpanKind.CLIENT) as span:
    span.set_attribute("payment.provider", "stripe")
    span.set_attribute("payment.amount_usd", 42.50)
    try:
        result = call_payment_api()
        span.add_event("payment_confirmed", {"transaction.id": result.id})
    except PaymentError as e:
        span.record_exception(e)                      # attaches stack trace as a span event
        span.set_status(trace.Status(trace.StatusCode.ERROR, str(e)))
        raise
```

### Metrics API In Depth
| Instrument | Semantics | Example |
|---|---|---|
| **Counter** | Monotonically increasing value, synchronous (recorded inline with code execution) | `requests_total.add(1, {"route": "/checkout"})` |
| **UpDownCounter** | Like a counter but can go up or down, synchronous | Active connections, queue depth |
| **Histogram** | Records a distribution of values (synchronous), backend computes buckets/percentiles | Request duration, payload size |
| **Asynchronous (Observable) Counter/UpDownCounter/Gauge** | Registered with a callback function invoked at collection time, rather than recorded inline | CPU usage, memory usage, queue length polled from an external system |

```python
from opentelemetry import metrics

meter = metrics.get_meter("checkout")
request_counter = meter.create_counter("checkout.requests", unit="1", description="Total checkout requests")
latency_histogram = meter.create_histogram("checkout.duration", unit="ms")

request_counter.add(1, {"http.route": "/checkout", "http.status_code": 200})
latency_histogram.record(142.3, {"http.route": "/checkout"})

# Asynchronous gauge example — callback invoked on each collection cycle
def get_queue_depth(options):
    yield metrics.Observation(queue.qsize(), {"queue.name": "orders"})

meter.create_observable_gauge("orders.queue_depth", callbacks=[get_queue_depth])
```
OTel metrics use a **push model with a pull-compatible bridge**: the SDK aggregates in-process and pushes via OTLP on an interval (`OTEL_METRIC_EXPORT_INTERVAL`, default 60s) — but the Collector's `prometheus` receiver/exporter can bridge this to Prometheus's native pull model on either side, so OTel metrics interoperate cleanly with an existing Prometheus/Grafana stack. See [prometheus.md](../../Monitoring%20and%20Loggin/prometheous/prometheus.md) for the pull-model/PromQL side of that bridge.

### Logs API In Depth
- The newest signal, and unlike traces/metrics, OTel deliberately does **not** try to replace existing logging libraries (`logging` in Python, `slf4j`/`logback` in Java, `winston` in Node). Instead, it provides a **Log Bridge API**: an appender/handler that plugs into your existing logger and forwards records through the OTel Logs SDK, automatically attaching the active trace/span ID to every log line.
```python
import logging
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter

logger_provider = LoggerProvider()
logger_provider.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter(endpoint="localhost:4317", insecure=True)))

handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
logging.getLogger().addHandler(handler)   # bolts onto Python's stdlib logging — no rewrite needed

logging.info("order processed", extra={"order.id": "12345"})
# emitted log record automatically carries trace_id/span_id of whatever span is active
```
This trace-log correlation (every log line tagged with `trace_id`/`span_id`) is what lets you pivot from a log line in Loki/ELK straight to the full trace in Jaeger, and is arguably logs' single most valuable contribution to the "three pillars" story.

### Context Propagation — Deep Dive
- OTel defaults to the **W3C Trace Context** standard: an HTTP header `traceparent: 00-<trace-id>-<span-id>-<flags>` (plus optional `tracestate` for vendor-specific extensions) carried on every outbound request.
- **Baggage** propagates via a separate `baggage` header (`key1=value1,key2=value2`) and is distinct from trace context — baggage is arbitrary key-value data any downstream service can read (e.g., `user.tier=premium` set once at the edge, read by a billing decision three hops later), whereas trace context is purely the trace/span identifiers.
- Propagators are pluggable — `OTEL_PROPAGATORS` can list `tracecontext,baggage,b3,jaeger` to support interop with legacy Zipkin (B3 headers) or legacy Jaeger clients during a migration, since W3C wasn't always the default.
- Async/non-HTTP boundaries (message queues, background job schedulers, event buses) require **manual** propagation: `inject()` the current context into message headers/attributes on publish, `extract()` it on consume before starting the consumer span. This is the single most common place production tracing silently breaks — a Kafka producer that doesn't inject `traceparent` into message headers means every consumer starts a brand-new, disconnected trace.
```python
from opentelemetry.propagate import inject, extract

# Producer side
headers = {}
inject(headers)  # writes traceparent (+ baggage) into the dict
kafka_producer.send("orders", value=payload, headers=list(headers.items()))

# Consumer side
ctx = extract(dict(message.headers))
with tracer.start_as_current_span("process_order_message", context=ctx):
    ...
```

### The OTel Collector — Pipeline Architecture
This is the most important piece of production OTel deployments. The Collector is a standalone binary that sits between your apps and your backends, and its pipelines are built from three stage types, plus a fourth non-pipeline category:
```
[Receivers] --> [Processors] --> [Exporters]
                (Extensions run alongside, not in the data path: health_check, pprof, zpages, file_storage)
```
| Stage | Role | Examples |
|---|---|---|
| **Receivers** | Ingest telemetry, in any supported format | `otlp` (gRPC/HTTP), `jaeger`, `zipkin`, `prometheus` (scrape), `filelog`, `hostmetrics`, `k8s_cluster` |
| **Processors** | Transform, filter, batch, sample data in-flight | `batch`, `memory_limiter`, `attributes`, `filter`, `tail_sampling`, `resourcedetection`, `transform` (OTTL-based), `probabilistic_sampler` |
| **Exporters** | Ship data out, to one or many destinations | `otlp`, `jaeger`, `prometheus`, `debug`, vendor exporters (`datadog`, `honeycomb`, `splunk_hec`) |
| **Extensions** | Cross-cutting capabilities not part of a data pipeline | `health_check` (liveness endpoint), `pprof` (profiling), `zpages` (live debug pages), `file_storage` (persistent queue for exporters), `basicauth`/`oauth2client` |

**Collector distributions**: there is no single "the Collector" binary — the **Core** distribution ships only vendor-neutral components; the **Contrib** distribution adds hundreds of community components (most vendor exporters, most receivers like `hostmetrics`/`k8s_cluster`); the **OpenTelemetry Collector Builder (`ocb`)** lets you compile a custom minimal distribution with only the components you need, which matters for image size and CVE surface in production.

A real Collector config (`otel-collector-config.yaml`):
```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
  prometheus:
    config:
      scrape_configs:
        - job_name: 'self'
          scrape_interval: 15s
          static_configs:
            - targets: ['0.0.0.0:8888']

processors:
  batch:
    timeout: 5s
    send_batch_size: 1024
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128
  attributes:
    actions:
      - key: environment
        value: production
        action: insert
  resourcedetection:
    detectors: [env, system, gcp, ec2, eks]   # auto-populates host/cloud resource attributes
  transform:                                   # OTTL — OpenTelemetry Transformation Language
    trace_statements:
      - context: span
        statements:
          - set(attributes["http.route"], "REDACTED") where attributes["http.route"] == "/admin/secret"

exporters:
  otlp/jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true
  prometheus:
    endpoint: 0.0.0.0:8889
  debug:
    verbosity: detailed

extensions:
  health_check:
    endpoint: 0.0.0.0:13133
  zpages:
    endpoint: 0.0.0.0:55679

service:
  extensions: [health_check, zpages]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, resourcedetection, batch, attributes, transform]
      exporters: [otlp/jaeger, debug]
    metrics:
      receivers: [otlp, prometheus]
      processors: [memory_limiter, batch]
      exporters: [prometheus, debug]
```
Notice: **one traces pipeline exporting to both Jaeger and stdout simultaneously** — this is the vendor fan-out that makes the Collector so valuable. Add a `datadog` exporter to the same pipeline and you're now dual-shipping to Jaeger and Datadog with zero app changes.

**OTTL (OpenTelemetry Transformation Language)**: the `transform` processor's query language for filtering/mutating telemetry declaratively in the Collector — redacting sensitive attributes, renaming fields, dropping noisy spans, deriving new attributes from existing ones — without writing a custom processor plugin in Go.

### OTLP — The Wire Protocol
- **OTLP (OpenTelemetry Protocol)** is the native transport for all three signals — gRPC (port 4317) or HTTP/protobuf (port 4318, also supports JSON for debugging/curl-friendliness).
- Before OTLP existed, exporters had to speak each backend's native protocol (Jaeger Thrift, Zipkin JSON, Prometheus exposition format). OTLP is now the common denominator that receivers/exporters translate to/from.
- OTLP messages are Protobuf-defined (`opentelemetry-proto` repo) and identical on the wire regardless of source SDK language — a Go service's OTLP export and a Python service's OTLP export are byte-for-byte compatible in structure.
- Nearly every observability vendor now accepts OTLP directly, which is why "just point your OTLP exporter at X" is the standard integration story in 2026 — OTLP has effectively become the DataDog-agent-protocol-killer as the industry default ingestion format.
- Delivery semantics: OTLP export is retried on transient failure by the SDK's `BatchSpanProcessor`/`PeriodicExportingMetricReader`, but is fundamentally **at-most-once** past that — an app crash between recording a span and the next export cycle loses that data (this is why batch/export intervals and graceful-shutdown flushing matter for signal completeness).

### Semantic Conventions
- A shared vocabulary of attribute names so telemetry is queryable/joinable across tools and vendors: `http.request.method`, `http.response.status_code`, `db.system`, `db.statement`, `k8s.pod.name`, `service.name`.
- Without this, one team's `http_status` and another's `status_code` and another's `httpStatusCode` all mean the same thing but can't be correlated in dashboards. Semantic conventions are versioned and gradually stabilized (some attributes are still "experimental" and can change between minor spec versions — check `schema_url` on the Resource to know which convention version a given telemetry payload was produced under).
- Major convention groups: HTTP (`http.*`), database (`db.*`), messaging (`messaging.*`), RPC (`rpc.*`), Kubernetes/cloud resource (`k8s.*`, `cloud.*`), exceptions (`exception.*`). Auto-instrumentation libraries populate these automatically; manual instrumentation should use them rather than inventing custom attribute names, specifically so dashboards built against one service work unmodified against any OTel-instrumented service.

### Deployment Topologies for the Collector
| Topology | Description | When to use |
|---|---|---|
| **No collector (SDK exports directly to backend)** | App's OTLP exporter points straight at Jaeger/Prometheus | Simplest, fine for small setups or local dev |
| **Agent (sidecar/daemonset)** | One Collector instance per node/pod, close to the app | Local batching, reduces cross-network chatter, can enrich with node-local metadata (`resourcedetection`), absorbs the app-facing OTLP port so app restarts don't matter to the network path |
| **Gateway (centralized Collector tier)** | A separate, horizontally-scaled Collector deployment all apps send to | Centralized processing (tail sampling, PII scrubbing, routing to multiple backends), easier to operate than per-node agents |
| **Agent + Gateway (both)** | Node-local agent forwards to a central gateway tier | Most common in large production Kubernetes environments — combines both benefits; agent handles local enrichment/batching, gateway handles tail sampling (which needs cross-node trace-ID affinity) and multi-backend fan-out |

---

## 3. Advanced

### Sampling — All Strategies, In Depth
| Sampler | Where it runs | Decision basis |
|---|---|---|
| `AlwaysOn` / `AlwaysOff` | SDK | Constant — 100% or 0%, dev/debug only |
| `TraceIdRatioBased` | SDK (head sampling) | Deterministic hash of trace ID against a ratio — same trace ID always yields the same decision across services, which is what keeps a sampled trace's spans consistent even though each service decides independently |
| `ParentBased` | SDK (head sampling) | Wraps another sampler but **respects the parent's sampling decision** if the incoming context is already sampled/not-sampled — this is the default (`parentbased_traceidratio`) and is what prevents a downstream service from "un-sampling" a trace the root service decided to keep |
| Collector `tail_sampling` processor | Collector (tail sampling) | Full-trace-aware policies (error status, latency threshold, attribute match) evaluated after the whole trace completes |
| Collector `probabilistic_sampler` processor | Collector (head-adjacent) | Same ratio-based idea as `TraceIdRatioBased`, but centrally configured at the Collector instead of per-SDK — useful when you can't/won't redeploy every service to change the sample rate |

Head-based sampling (decide at trace start, e.g., "keep 10% of traces") is cheap but blind — it can't know a trace will end up containing an error until after the fact. **Tail sampling** decides *after* the full trace completes: always keep traces with errors or high latency, drop uninteresting fast/successful ones. Requires a Collector configured with the `tail_sampling` processor, which must buffer all spans of a trace until it's complete (or a timeout), and — critically — **all spans of a given trace must land on the same Collector instance**, which usually means load-balancing by trace ID upstream (the `loadbalancing` exporter, which hashes on trace ID to a consistent downstream Collector) rather than plain round-robin.
```yaml
processors:
  tail_sampling:
    decision_wait: 10s
    num_traces: 100000            # in-memory trace buffer size — sized to traffic x decision_wait
    expected_new_traces_per_sec: 500
    policies:
      - name: errors-policy
        type: status_code
        status_code: {status_codes: [ERROR]}
      - name: slow-traces-policy
        type: latency
        latency: {threshold_ms: 500}
      - name: important-customer-policy
        type: string_attribute
        string_attribute: {key: customer.tier, values: [enterprise]}
      - name: default-sample-5pct
        type: probabilistic
        probabilistic: {sampling_percentage: 5}
```
Policies are OR'd together by default (a trace matching *any* policy is kept) — this is how you combine "always keep errors" with "always keep slow traces" with "sample the boring rest at 5%" in one pipeline.

### Collector Scaling and Reliability
- The Collector is stateless per-pipeline (except tail sampling, which needs trace-affinity routing) — scale horizontally behind a load balancer/Kubernetes Service.
- `memory_limiter` processor is not optional in production — without it, a traffic spike can OOM-kill the Collector and drop everything in flight. Always place it first in the processor chain, before `batch` and anything else.
- For durability against Collector restarts/backend outages, use the `file_storage` extension with a persistent queue on exporters (`sending_queue: {storage: file_storage}`), or front the Collector with Kafka as a buffer (mirrors Jaeger's own Kafka-buffer pattern — see [jaeger.md](../jaeger/jaeger.md)).
- The Collector exposes its own internal telemetry (`otelcol_*` metrics on port 8888 by default) — critical to actually monitor: `otelcol_processor_dropped_spans`, `otelcol_exporter_send_failed_spans`, `otelcol_receiver_refused_spans` are the signals that tell you the pipeline itself is losing data, which is invisible from the application side.

### Security
- OTLP receivers should run with TLS in any environment beyond local dev (`tls:` block on the receiver), and the Collector supports `basicauth`/`oauth2client`/`bearertokenauth` extensions for authenticated ingress from apps and authenticated egress to SaaS backends.
- The `attributes`/`redaction` processors (or the more general `transform`/OTTL processor) can strip PII (e.g., `credit_card`, `email`) centrally in the Collector before it ever reaches a third-party backend — enforcing this at the Collector is far more reliable than trusting every app team to redact correctly at the SDK level, since it's one policy point instead of N.
- Multi-tenant Collector deployments (one Collector serving many teams/namespaces) typically use the `k8sattributes` processor to auto-tag telemetry with namespace/pod/deployment metadata, then a `routing` processor or connector to split pipelines per tenant before export, keeping tenants' data isolated downstream.

### Kubernetes: the OpenTelemetry Operator
- The **OpenTelemetry Operator** manages Collector deployments via an `OpenTelemetryCollector` CRD, and can also **auto-inject language SDK auto-instrumentation** into pods via annotations — no image rebuild needed:
```yaml
apiVersion: opentelemetry.io/v1beta1
kind: OpenTelemetryCollector
metadata:
  name: otel-gateway
spec:
  mode: deployment            # deployment | daemonset | statefulset | sidecar
  replicas: 3
  config:
    receivers:
      otlp:
        protocols: {grpc: {}, http: {}}
    exporters:
      otlp/jaeger: {endpoint: "jaeger-collector:4317", tls: {insecure: true}}
    service:
      pipelines:
        traces:
          receivers: [otlp]
          exporters: [otlp/jaeger]
```
```yaml
apiVersion: opentelemetry.io/v1alpha1
kind: Instrumentation
metadata:
  name: python-instrumentation
spec:
  exporter:
    endpoint: http://otel-gateway-collector:4317
  propagators: [tracecontext, baggage]
  sampler:
    type: parentbased_traceidratio
    argument: "0.1"
```
```yaml
# On a Deployment's pod template, to auto-instrument without touching the app image:
metadata:
  annotations:
    instrumentation.opentelemetry.io/inject-python: "true"     # or inject-java, inject-nodejs, inject-dotnet, inject-go
```
The Operator's injection mechanism works by adding an init container that copies the language-specific auto-instrumentation agent into a shared volume, then mutating the pod's env vars/entrypoint to load it — genuinely zero application image changes, just a namespace/deployment-level annotation.

### Migration History and Ecosystem Context
- **OpenTracing** (CNCF, tracing-only API spec) and **OpenCensus** (Google, combined stats+tracing library with its own agent) were separate, competing efforts through 2018 — many libraries had OpenTracing *or* OpenCensus instrumentation but rarely both, fragmenting the ecosystem exactly the way OTel's origin story describes.
- The two projects' maintainers agreed to merge into OpenTelemetry in mid-2019; OpenTracing and OpenCensus are both now in maintenance-only/deprecated mode, with official migration shims (`opentelemetry-opentracing-shim`) to bridge legacy instrumented libraries during a transition rather than requiring a big-bang rewrite.
- This history explains a few present-day quirks worth knowing: some very old libraries still carry OpenTracing-only instrumentation and need the shim; Jaeger's own client libraries predate OTel and are now deprecated in favor of it (see [jaeger.md](../jaeger/jaeger.md)); and W3C Trace Context (not the OpenTracing or OpenCensus wire formats) won out as OTel's default propagation format because it became a browser/HTTP standard independently, giving OTel a vendor-neutral, already-standardized format to adopt rather than invent its own.

### Integration with the Wider CNCF Observability Stack
- **Traces** → export to [Jaeger](../jaeger/jaeger.md), which as of Jaeger 1.35+ speaks OTLP natively and has deprecated its own client libraries in favor of OTel SDKs — Jaeger is now effectively an OTel-native tracing backend.
- **Metrics** → the `prometheus` exporter/receiver lets the Collector act as either a scrape target or a scraper, bridging OTel metrics into a Prometheus/Grafana stack — see [prometheus.md](../../Monitoring%20and%20Loggin/prometheous/prometheus.md) for the PromQL/alerting side.
- **Logs** → the `filelog` receiver tails log files and can attach trace context for correlation, exporting to Loki or an ELK stack; the Log Bridge API pattern above is the app-side complement to this Collector-side tailing approach.
- In a service mesh, Envoy-generated access logs and stats can also be piped through an OTel Collector alongside app-level telemetry for a single unified pipeline — see [envoy.md](../envoy/envoy.md) and [observability-in-service-mesh.md](../../Service%20Mesh/observability-in-service-mesh.md).
- **Exemplars**: OTel metrics can attach a linked `trace_id` to individual histogram data points, so a Grafana panel showing a latency spike can jump straight to the exact trace responsible — this is the mechanical link between the metrics and traces pillars, implemented at the SDK/Collector level, not bolted on after the fact in the backend.

### Common Failure Modes
| Symptom | Likely cause |
|---|---|
| Traces show disconnected single-span "traces" instead of one connected trace | Broken context propagation — a hop isn't forwarding `traceparent`, often a message queue or async boundary missing manual `inject()`/`extract()` |
| Collector OOMs under load | Missing/misconfigured `memory_limiter`, or `batch` processor batch size too large, or `tail_sampling`'s `num_traces` buffer sized too large for available memory |
| Spans exported but never appear in backend | Exporter endpoint/TLS mismatch, backend-side ingestion sampling silently dropping them, or a Collector pipeline missing the exporter in its `service.pipelines.traces.exporters` list (a very common copy-paste config mistake) |
| High cardinality blowup in metrics pipeline | Auto-instrumentation attaching high-cardinality attributes (raw URLs, user IDs) as metric labels — use the `transform`/`attributes` processor to strip them before the `prometheus` exporter |
| Traces exist but logs never correlate | App logger not wired to the OTel Log Bridge Handler, or logging happening outside the span's context (e.g., in a different thread/goroutine that lost the active context) |
| SDK silently doing nothing | Only the API package was installed/imported, no SDK was ever constructed and registered — the classic "why are there no spans at all" beginner mistake |
| Tail sampling drops spans that should've been kept | Spans of one trace landing on different Collector instances because the `loadbalancing` exporter/trace-ID-affinity routing wasn't set up upstream of the tail-sampling tier |

---

## Quick Revision — OpenTelemetry
- Vendor-neutral standard for traces, metrics, logs — born from the OpenTracing + OpenCensus merger (2019). Not a backend itself.
- API vs SDK split: libraries instrument against the no-op API; the application supplies the SDK (samplers, processors, exporters) — calling API methods with no SDK registered is a harmless no-op.
- Auto-instrumentation (fast, framework-level, e.g. Java `-javaagent`) + manual instrumentation (precise, business-level) — most real systems use both.
- Traces: Span, SpanKind (`SERVER`/`CLIENT`/`PRODUCER`/`CONSUMER`/`INTERNAL`), Events, Links (for batch/fan-in), Status. Metrics: Counter, UpDownCounter, Histogram, Observable/async instruments. Logs: a Bridge API that plugs into existing loggers rather than replacing them, auto-attaching trace/span IDs.
- OTel Collector pipeline = Receivers → Processors → Exporters (+ Extensions outside the data path); can fan out one signal to multiple backends simultaneously. Core vs Contrib vs custom-built (`ocb`) distributions.
- OTLP (gRPC 4317 / HTTP 4318) is the native wire protocol; nearly all vendors accept it directly now. At-most-once delivery — crashes between recording and export cycle lose data.
- W3C Trace Context (`traceparent` header) is the default propagation mechanism; Baggage propagates separately via its own header. Async boundaries (queues) need manual `inject()`/`extract()` — the #1 cause of broken traces.
- Sampling: `ParentBased`+`TraceIdRatioBased` at the SDK (head sampling, cheap, consistent per trace ID) vs Collector `tail_sampling` (best signal — error/latency-aware — but needs trace-ID-affinity routing across Collectors).
- OpenTelemetry Operator on Kubernetes: `OpenTelemetryCollector` CRD + `Instrumentation` CRD + pod annotation-based auto-instrumentation injection via init containers.
- `memory_limiter` first in every processor chain is not optional in production; watch the Collector's own `otelcol_*` internal metrics for pipeline health.
- Jaeger is increasingly just the trace storage/UI backend behind OTel — see [jaeger.md](../jaeger/jaeger.md).

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
