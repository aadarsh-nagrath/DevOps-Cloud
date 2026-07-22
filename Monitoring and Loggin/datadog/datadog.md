# Datadog — Complete Notes

## 1. Beginner

### What is Datadog?
- Commercial, SaaS, **all-in-one observability platform**: metrics, logs, traces (APM), RUM (real user monitoring), synthetics, security monitoring — one agent, one UI, one billing relationship.
- Trade-off vs self-hosted stacks (Prometheus/ELK/Grafana): faster setup and unified correlation out of the box, but ongoing cost that scales with hosts/data volume, and vendor lock-in.

### The Datadog Agent
- A single lightweight process installed per host/container/pod that collects metrics, logs, and traces and forwards them to Datadog's backend.
```bash
# Docker
docker run -d --name dd-agent \
  -e DD_API_KEY=<key> \
  -e DD_SITE="datadoghq.com" \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /proc/:/host/proc/:ro \
  -v /sys/fs/cgroup/:/host/sys/fs/cgroup:ro \
  gcr.io/datadoghq/agent:7
```
- In Kubernetes: deployed as a **DaemonSet** (node-level metrics/logs) plus a **Cluster Agent** (cluster-level metadata, reduces load on the Kubernetes API server from many node agents).

### Core Product Areas
- **Infrastructure Monitoring**: host/container/process-level metrics out of the box.
- **APM (Application Performance Monitoring)**: distributed tracing, auto-instrumentation for many languages.
- **Log Management**: centralized log ingestion, search, and processing (competes directly with ELK).
- **Dashboards**: similar concept to Grafana, built on Datadog's own metrics/log/trace data.
- **Monitors**: Datadog's term for alerts.
- **Synthetics**: scripted uptime/browser checks from external locations.
- **RUM**: real user monitoring — frontend performance/errors from actual browser sessions.

### Tags — Datadog's Core Organizing Principle
- Every metric, log, trace, and host can carry key:value **tags** (`env:prod`, `service:checkout`, `team:payments`).
- Tags are what let you pivot between metrics → logs → traces for the same `service`/`env` — the Datadog equivalent of Prometheus labels, but shared across all telemetry types by design.

---

## 2. Intermediate

### Metrics in Datadog
- Similar types to Prometheus: **gauge**, **count**, **rate**, **histogram**, **distribution**.
- Submitted via: DogStatsD (StatsD-compatible, push-based, embedded in the Agent), the Datadog API, or auto-collected by integrations (200+ built-in integrations for AWS, K8s, databases, etc.).
- **Custom metrics** cost extra at scale — a key cost lever to watch (unlike Prometheus, where cardinality costs compute/storage but not a literal per-metric bill).

### Log Management
- Logs ingested via the Agent, sent to Datadog, parsed with **Grok-based pipelines** (conceptually the same idea as Logstash's grok filters) into structured attributes.
- **Log-based metrics**: generate a metric from log volume/patterns without paying to index every log line — useful for high-volume logs where you only need aggregate counts, not full-text search.
- **Indexing exclusion filters / Flex logs**: control which logs get expensively indexed (searchable) vs. cheaply archived — the SaaS equivalent of ELK's ILM hot/warm/cold tiering, but billing-driven.

### APM / Distributed Tracing
- Auto-instrumentation libraries (`dd-trace-py`, `dd-trace-java`, `dd-trace-js`, etc.) capture spans with minimal code changes.
- **Trace → Log correlation**: inject `dd.trace_id`/`dd.span_id` into log lines so a trace view can pull the exact log lines for that request.
- **Service Map**: auto-generated dependency graph between services based on observed trace traffic — very useful for understanding an unfamiliar microservice architecture.
- Datadog also supports ingesting **OpenTelemetry (OTLP)** data directly, so you're not locked into Datadog's own tracing libraries.

### Monitors (Alerting)
- Types: metric threshold, anomaly, outlier, forecast, log-based (alert on log query volume/pattern), APM (latency/error-rate), composite (combine multiple monitors with AND/OR).
- **Notification**: integrates with Slack, PagerDuty, Opsgenie, webhooks — similar routing concepts to Alertmanager/Grafana, configured per-monitor rather than via a separate routing tree by default (though Datadog also supports notification rules for more central routing).

### Dashboards
- Widget-based, similar to Grafana panels, pulling from metrics/logs/traces/RUM in one place — the main selling point vs a self-hosted stack is not needing to wire up separate Grafana + Elasticsearch + Prometheus data sources to get this correlation.

---

## 3. Advanced

### Cost Management (the single biggest operational concern with Datadog)
- Billing dimensions: hosts (infra monitoring), custom metrics count, indexed log volume/retention, APM host count and trace ingestion/retention, synthetic test runs.
- Common cost levers:
  - Use **log-based metrics** + exclusion filters instead of indexing 100% of logs.
  - Control **custom metric cardinality** — same underlying issue as Prometheus cardinality, but shows up as a literal invoice line item instead of just an OOM risk.
  - Use **APM trace retention filters** / ingestion sampling instead of retaining every trace at full detail.
  - Set host-based monitors to auto-mute for ephemeral autoscaled/spot infrastructure to avoid noisy flapping alerts.

### Datadog Cluster Agent (Kubernetes at scale)
- Reduces Kubernetes API server load: node Agents talk to the Cluster Agent instead of hitting the API server directly for cluster-level metadata (like pod/node/service metadata, HPA custom-metrics).
- Supports the **Kubernetes Metrics Server / External Metrics Provider** pattern — Datadog metrics can drive Horizontal Pod Autoscaler decisions directly.

### Autodiscovery
- The Agent auto-detects containers via labels/annotations and applies the right integration config automatically (e.g., a Redis container gets Redis-specific checks without manual per-host config) — critical in dynamic container environments where hosts/pods churn constantly.

### Security Monitoring / CSM (Cloud Security Management)
- Datadog extends beyond pure observability into detection rules over logs/traces (similar space to Elastic Security/SIEM), Cloud Security Posture Management, and infrastructure vulnerability scanning — positioning itself as a single pane of glass across ops and security.

### Datadog vs Self-Hosted Stack — Decision Framework
| Factor | Datadog | Prometheus+Grafana+ELK |
|---|---|---|
| Setup speed | Fast (agent + integrations) | Slower (build/operate each piece) |
| Ongoing ops burden | Low (SaaS) | High (you run/scale/patch it all) |
| Cost model | Predictable-ish but scales with volume/hosts, can get expensive at scale | Infra cost + engineering time, but no per-metric/per-log billing |
| Cross-signal correlation | Built-in (metrics/logs/traces/RUM in one tag model) | Requires deliberate wiring (exemplars, trace-log correlation) |
| Data ownership/residency | Vendor-hosted | Self-hosted, full control |
| Best fit | Teams that want to move fast and outsource ops | Teams with strong platform engineering capacity, cost-sensitive at scale, or strict data residency needs |

### Migrating Between Datadog and OSS Stacks
- OpenTelemetry is the strategic hedge: instrument with OTel SDKs/Collector, and you can send the same data to Datadog OR Prometheus/Tempo/Elasticsearch by swapping exporters — avoids hard vendor lock-in on the instrumentation layer even if the backend choice changes later.

---

## Quick Revision — Datadog
- All-in-one SaaS: Agent (per host/pod) ships metrics + logs + traces to one backend.
- Tags are the universal correlation key across all telemetry types (like Prometheus labels, but stack-wide).
- DogStatsD = push-based custom metrics submission.
- Log-based metrics + indexing exclusion filters = cost control lever (like ELK's ILM tiering, but billing-driven).
- APM auto-instrumentation + Service Map + trace-log correlation is the big differentiator vs assembling OSS tools yourself.
- Cluster Agent reduces K8s API server load at scale; Autodiscovery auto-configures integrations for ephemeral containers.
- Biggest operational risk: cost creep from custom metric cardinality, log indexing volume, and trace retention — same root cause as Prometheus cardinality/ELK storage growth, just billed directly.
- OpenTelemetry lets you hedge against vendor lock-in on the instrumentation layer.
