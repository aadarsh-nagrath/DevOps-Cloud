# Jaeger — Learn It Locally

Goal: get Jaeger running on your machine, generate real traces from a sample app, and explore the UI — in under 15 minutes. No Kubernetes required for the first pass; a Kubernetes version is included at the end.

## Prerequisites
- Docker installed and running.
- (Optional, for the Kubernetes section) a local cluster — `kind` or `minikube` — and `kubectl`.

---

## Step 1 — Run Jaeger All-in-One

The `all-in-one` image bundles Agent + Collector + Query + UI + in-memory storage — perfect for learning, not for production.

```bash
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 16686:16686 \
  -p 4317:4317 \
  -p 4318:4318 \
  -p 6831:6831/udp \
  jaegertracing/all-in-one:latest
```

Port map:
| Port | What it's for |
|---|---|
| `16686` | Jaeger UI (open http://localhost:16686) |
| `4317` | OTLP gRPC receiver (send traces here from OTel SDKs) |
| `4318` | OTLP HTTP receiver |
| `6831/udp` | Legacy Jaeger agent protocol (thrift/compact) |

Verify it's up:
```bash
docker ps --filter name=jaeger
open http://localhost:16686   # macOS; use xdg-open on Linux
```
You'll see an empty UI — no traces yet. Let's generate some.

---

## Step 2 — Generate Real Traces with a Sample App

Easiest path: run Jaeger's own **HotROD** demo app — a small microservices sample (frontend → customer → driver → route services) purpose-built to demonstrate tracing.

```bash
docker run --rm -it \
  --link jaeger \
  -p 8080:8080 \
  -e JAEGER_AGENT_HOST=jaeger \
  -e JAEGER_AGENT_PORT=6831 \
  jaegertracing/example-hotrod:latest all
```

Open http://localhost:8080, click any of the customer buttons ("Rachel's Floral Designs", etc.) to simulate a ride request. Each click fires a request that fans out across HotROD's internal services and gets fully traced.

Now go back to http://localhost:16686:
1. Select **Service** = `frontend` in the dropdown.
2. Click **Find Traces**.
3. Click into a trace — you'll see the waterfall view: `frontend` → `customer` → `driver` → `route`, each as a nested span with exact timing.
4. Click into individual spans to see tags (e.g., `http.url`, `customer.id`) and logs.
5. Try the **System Architecture** tab (or "DAG") to see the auto-derived service dependency graph.

This is the fastest way to *see* what a trace actually looks like before instrumenting your own code.

---

## Step 3 — Instrument Your Own App (Python example)

```bash
pip install opentelemetry-sdk opentelemetry-exporter-otlp opentelemetry-instrumentation-flask flask requests
```

```python
# app.py
from flask import Flask
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.flask import FlaskInstrumentor

resource = Resource(attributes={"service.name": "my-python-service"})
provider = TracerProvider(resource=resource)
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint="localhost:4317", insecure=True)))
trace.set_tracer_provider(provider)

app = Flask(__name__)
FlaskInstrumentor().instrument_app(app)  # auto-instruments every route

tracer = trace.get_tracer(__name__)

@app.route("/checkout")
def checkout():
    with tracer.start_as_current_span("validate-cart"):
        pass  # simulate work
    with tracer.start_as_current_span("charge-payment") as span:
        span.set_attribute("payment.amount", 42.50)
    return "ok"

if __name__ == "__main__":
    app.run(port=5000)
```

Run it, hit `curl localhost:5000/checkout` a few times, then check the Jaeger UI — `my-python-service` will appear in the service dropdown with the `validate-cart` and `charge-payment` spans nested under the `/checkout` span.

This is the pattern for every language: create a `TracerProvider`, point its exporter at Jaeger's OTLP endpoint (`localhost:4317`), auto-instrument the framework, add manual spans where you want extra detail.

---

## Step 4 — Try Sampling

Kill and restart the container with a probabilistic sampling default (only relevant once you have a real SDK sending spans — the collector can push sampling config to clients that support remote sampling):
```bash
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -e SAMPLING_STRATEGIES_FILE=/etc/jaeger/sampling.json \
  -v $(pwd)/sampling.json:/etc/jaeger/sampling.json \
  -p 16686:16686 -p 4317:4317 -p 4318:4318 \
  jaegertracing/all-in-one:latest
```
```json
// sampling.json
{
  "default_strategy": { "type": "probabilistic", "param": 0.5 }
}
```
This tells any OTel SDK using remote sampling to keep ~50% of traces — a taste of how sampling is centrally controlled rather than hardcoded per service.

---

## Step 5 — Query Traces Programmatically via the Query API

Instead of the UI, hit the Query Service's HTTP API directly — this is what the UI itself calls under the hood, and it's how you'd wire a chatops bot or a CI assertion:
```bash
# List known services
curl -s "http://localhost:16686/api/services" | jq

# List operations for a service
curl -s "http://localhost:16686/api/services/frontend/operations" | jq

# Find traces for a service in the last hour, limit 5
curl -s "http://localhost:16686/api/traces?service=frontend&limit=5&lookback=1h" | jq '.data | length'

# Fetch one specific trace by ID (grab a traceID from the previous call's output)
curl -s "http://localhost:16686/api/traces/<traceID>" | jq '.data[0].spans | length'
```
This confirms the UI is just a client of a documented API — useful when you want trace data inside a script rather than clicking through a browser.

---

## Step 6 — Break Context Propagation on Purpose

The single most common real-world tracing bug is a broken propagation hop. Simulate it: write a tiny proxy that forwards HTTP requests to HotROD's frontend *without* forwarding the `uber-trace-id`/`traceparent` header.
```bash
# A minimal broken proxy using socat, dropping all headers
# (any reverse proxy that strips headers demonstrates the same thing)
python3 -c "
import http.server, urllib.request
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        # deliberately does NOT forward incoming headers to the upstream call
        resp = urllib.request.urlopen('http://localhost:8080' + self.path)
        self.send_response(resp.status)
        self.end_headers()
        self.wfile.write(resp.read())
http.server.HTTPServer(('localhost', 9999), Handler).serve_forever()
"
```
Hit `http://localhost:9999/` instead of `:8080` directly a few times, then check Jaeger: instead of one clean end-to-end trace, you'll see the request start a trace that stops at the proxy hop, with HotROD's own internal services forming a **separate, disconnected trace** — exactly the "broken propagation" failure mode described in the notes. This is the fastest way to build real intuition for why `inject()`/`extract()` at every hop (especially non-HTTP ones like queues) matters.

---

## Step 7 — Run It on Kubernetes (Optional)

Using `kind`:
```bash
kind create cluster --name jaeger-lab

# Install the Jaeger Operator (manages Jaeger via a CRD)
kubectl create namespace observability
kubectl apply -f https://github.com/jaegertracing/jaeger-operator/releases/latest/download/jaeger-operator.yaml -n observability

# Deploy a simple all-in-one Jaeger instance via the CRD
cat <<EOF | kubectl apply -f -
apiVersion: jaegertracing.io/v1
kind: Jaeger
metadata:
  name: simplest
  namespace: observability
EOF

kubectl get pods -n observability
kubectl port-forward -n observability svc/simplest-query 16686:16686
```
Open http://localhost:16686 — same UI, now running in-cluster. Point any in-cluster app's OTLP exporter at `simplest-collector.observability.svc:4317`.

Clean up:
```bash
kind delete cluster --name jaeger-lab
```

---

## Cleanup (Docker path)
```bash
docker rm -f jaeger
```

## What to Explore Next
- Break HotROD on purpose (kill the `driver` container mid-request) and watch what an error/failed span looks like in the UI.
- Compare two traces of the same endpoint (one fast, one slow) using the UI's trace comparison view.
- Swap in-memory storage for Elasticsearch (`docker run` the `elasticsearch:7.17.0` image, then set `SPAN_STORAGE_TYPE=elasticsearch` + `ES_SERVER_URLS` on the Jaeger container) to see the production-shaped storage path.
- Put an OTel Collector with a `tail_sampling` processor (see the [OpenTelemetry tutorial](../../open-telemetry/tutorial/local-setup.md)) in front of this Jaeger instance instead of sending OTLP directly — confirm only error/slow HotROD traces survive into Jaeger once tail sampling is active.
- Try the remote-sampling `sampling.json` from Step 4 with `per_service_strategies` set differently for `frontend` vs `driver`, and confirm via the Query API (`/api/traces?service=driver`) that the actual trace volume differs between services.
