# OpenTelemetry — Learn It Locally

Goal: run the OTel Collector locally, send it real traces and metrics from an instrumented app, and watch both signals land in two different backends (Jaeger for traces, Prometheus for metrics) simultaneously — in about 20 minutes.

## Prerequisites
- Docker and Docker Compose installed and running.
- Python 3.9+ (for the sample app in Step 3) — or adapt the same pattern to any language.

---

## Step 1 — Stand Up the Collector + Backends with Docker Compose

Create a working folder and a Collector config.

```bash
mkdir -p ~/otel-lab && cd ~/otel-lab
```

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 5s
  memory_limiter:
    check_interval: 1s
    limit_mib: 400

exporters:
  otlp/jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true
  prometheus:
    endpoint: 0.0.0.0:8889
  debug:
    verbosity: detailed

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp/jaeger, debug]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus, debug]
```

```yaml
# docker-compose.yaml
version: "3.8"
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    environment:
      - COLLECTOR_OTLP_ENABLED=true
    ports:
      - "16686:16686"   # Jaeger UI

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yaml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"     # Prometheus UI

  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports:
      - "4317:4317"     # OTLP gRPC
      - "4318:4318"     # OTLP HTTP
      - "8889:8889"     # Prometheus scrape endpoint (Collector's own metrics output)
    depends_on:
      - jaeger
```

```yaml
# prometheus.yaml — tells Prometheus to scrape the Collector's exported metrics
global:
  scrape_interval: 5s
scrape_configs:
  - job_name: "otel-collector"
    static_configs:
      - targets: ["otel-collector:8889"]
```

```bash
docker compose up -d
docker compose ps
```

Open http://localhost:16686 (Jaeger UI — empty for now) and http://localhost:9090 (Prometheus UI — empty for now).

---

## Step 2 — Instrument a Sample App (Python, Auto-Instrumentation)

```bash
python3 -m venv venv && source venv/bin/activate
pip install flask requests \
  opentelemetry-distro \
  opentelemetry-exporter-otlp
opentelemetry-bootstrap -a install
```

```python
# app.py
from flask import Flask
import time, random

app = Flask(__name__)

@app.route("/checkout")
def checkout():
    time.sleep(random.uniform(0.05, 0.3))   # simulate work
    if random.random() < 0.1:
        return "payment failed", 500
    return "order confirmed", 200

if __name__ == "__main__":
    app.run(port=5000)
```

Run it with auto-instrumentation wired to the Collector's OTLP endpoint:
```bash
OTEL_SERVICE_NAME=checkout-service \
OTEL_TRACES_EXPORTER=otlp \
OTEL_METRICS_EXPORTER=otlp \
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 \
OTEL_EXPORTER_OTLP_PROTOCOL=grpc \
opentelemetry-instrument python app.py
```

No code changes were needed — `opentelemetry-instrument` patched Flask automatically.

---

## Step 3 — Generate Traffic

In another terminal:
```bash
for i in $(seq 1 50); do curl -s localhost:5000/checkout > /dev/null; sleep 0.2; done
```

---

## Step 4 — Watch Traces Land in Jaeger

1. Open http://localhost:16686.
2. Select **Service** = `checkout-service`, click **Find Traces**.
3. Click into a trace — you'll see a span for the `GET /checkout` request with timing and status. Any 500-status requests will be visibly flagged as errors.

This confirms the path: Flask app → OTel auto-instrumentation → OTLP gRPC (`:4317`) → Collector `otlp` receiver → `batch` processor → `otlp/jaeger` exporter → Jaeger.

---

## Step 5 — Watch Metrics Land in Prometheus

1. Open http://localhost:9090.
2. Query `target_info` or search for metric names starting with `http_server_` (auto-instrumentation emits request duration/count histograms by default).
3. Try: `rate(http_server_request_duration_seconds_count[1m])`.

This confirms the second half of the fan-out: the **same Collector**, receiving the same OTLP stream, is simultaneously exporting to Jaeger (traces) and Prometheus (metrics) — one pipeline, two backends, zero app awareness of either.

---

## Step 6 — Add Manual Spans to See the Hybrid Pattern

Edit `app.py` to add a business-meaningful span inside the auto-instrumented route:
```python
from opentelemetry import trace
tracer = trace.get_tracer("checkout-service")

@app.route("/checkout")
def checkout():
    with tracer.start_as_current_span("validate-cart"):
        time.sleep(0.05)
    with tracer.start_as_current_span("charge-payment") as span:
        span.set_attribute("payment.amount", 42.50)
        time.sleep(random.uniform(0.05, 0.2))
    return "order confirmed", 200
```
Restart the app, hit `/checkout` a few more times, and refresh a trace in Jaeger — you'll now see `validate-cart` and `charge-payment` nested inside the auto-instrumented HTTP span. This is the hybrid instrumentation pattern from the notes: auto-instrumentation for the framework boundary, manual spans for the business logic you actually care about.

---

## Step 7 — Correlate Logs with Traces (the Logs Signal)

Add the Log Bridge Handler so Python's stdlib `logging` module automatically tags every log line with the active `trace_id`/`span_id`:
```bash
pip install opentelemetry-sdk opentelemetry-exporter-otlp
```
```python
# add near the top of app.py, after the tracer is set up
import logging
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter

logger_provider = LoggerProvider()
logger_provider.add_log_record_processor(
    BatchLogRecordProcessor(OTLPLogExporter(endpoint="localhost:4317", insecure=True))
)
handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
logging.getLogger().addHandler(handler)
logging.getLogger().setLevel(logging.INFO)
```
```python
@app.route("/checkout")
def checkout():
    logging.info("checkout started")
    with tracer.start_as_current_span("validate-cart"):
        time.sleep(0.05)
    logging.info("checkout completed")
    return "order confirmed", 200
```
Add a `logs` pipeline to `otel-collector-config.yaml` so the Collector actually has somewhere to send them:
```yaml
service:
  pipelines:
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [debug]
```
Restart the Collector (`docker compose up -d otel-collector`) and the app, hit `/checkout` again, then check the Collector's debug output (`docker compose logs otel-collector --tail=30`) — each log record printed will carry the same `trace_id`/`span_id` as the span created moments earlier in the same request. This is the mechanical basis for "click a log line, jump to its trace" in any real observability UI.

---

## Step 8 — Add Tail-Based Sampling

Replace the traces pipeline's processor chain to only keep error/slow traces, sampling the rest lightly:
```yaml
processors:
  tail_sampling:
    decision_wait: 5s
    num_traces: 1000
    policies:
      - name: errors
        type: status_code
        status_code: {status_codes: [ERROR]}
      - name: slow
        type: latency
        latency: {threshold_ms: 200}
      - name: baseline-5pct
        type: probabilistic
        probabilistic: {sampling_percentage: 5}

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, tail_sampling, batch]
      exporters: [otlp/jaeger, debug]
```
`tail_sampling` must come before `batch` in the chain — it needs to see individual spans, not pre-batched groups. Restart the Collector, regenerate traffic (`Step 3`), and check Jaeger: most fast, successful `/checkout` calls will now be missing (only ~5% show up), but every request that hit the app's built-in 10% failure path (`return "payment failed", 500`) will still appear — proving the tail-sampling policy is evaluating full trace outcome, not just a coin flip at the start.

---

## Step 9 — Inspect the Collector's Own Debug Output

```bash
docker compose logs otel-collector --tail=50
```
With `debug` verbosity set to `detailed` in the pipeline, you'll see the raw spans/metrics printed as they flow through — useful for debugging "why isn't my data showing up in the backend" without needing the backend UI at all.

---

## Cleanup
```bash
docker compose down -v
deactivate   # exit the Python venv
```

## What to Explore Next
- Add a second exporter (e.g., a second `otlp` exporter pointed at a different Jaeger instance, or the `datadog` exporter if you have a trial account) to the same traces pipeline and confirm both receive identical data — this is the vendor fan-out in action.
- Break context propagation on purpose: call `/checkout` through an intermediate service that doesn't forward the `traceparent` header, and observe the trace split into two disconnected traces in Jaeger instead of one — see the [Jaeger tutorial's Step 6](../../jaeger/tutorial/local-setup.md) for a ready-made version of this exercise.
- Swap the OpenTelemetry Operator into a `kind` cluster and use its pod-annotation auto-injection instead of manually running `opentelemetry-instrument`.
- Add a manual `Counter` and `Histogram` metric (from the notes' Metrics API section) alongside the auto-instrumented ones, and confirm both your custom metric and the framework's auto-generated `http_server_*` metrics show up side by side in Prometheus.
- Try the `transform` (OTTL) processor to redact or rename an attribute in-flight — e.g. strip `http.route` values matching `/admin/*` before they reach Jaeger — and confirm the redaction happened by checking the trace in the UI.
