# Monitoring & Logging — Master Notes

Complete notes on the Monitoring & Logging pillar of DevOps/SRE. Structured beginner → intermediate → advanced. Each tool has its own deep-dive file; this is the map + the concepts that tie them together.

## Folder Map
- [prometheous/prometheus.md](prometheous/prometheus.md) — metrics collection, PromQL, alerting
- [grafana/grafana.md](grafana/grafana.md) — visualization, dashboards, alerting
- [elasticsearch/elasticsearch.md](elasticsearch/elasticsearch.md) — search & analytics engine (storage layer of ELK)
- [elk/logstash.md](elk/logstash.md) — ELK stack overview + Logstash (ingest/transform)
- [kibana/kibana.md](kibana/kibana.md) — visualization layer for Elasticsearch
- [fluentid/fluentd.md](fluentid/fluentd.md) — unified logging layer / log forwarder
- [datadog/datadog.md](datadog/datadog.md) — commercial all-in-one observability SaaS
- [ELK.md](ELK.md) — (legacy stub, superseded by elk/logstash.md)

---

## 1. Beginner — Core Concepts

### Why Monitoring & Logging?
- **Monitoring** = numeric, aggregated view of system health over time (metrics). Answers "is it broken / how broken?"
- **Logging** = discrete, timestamped event records. Answers "what exactly happened?"
- **Tracing** = follows a single request across services. Answers "where did it go and where was it slow?"
- Together these three are called the **Three Pillars of Observability**.

### Metrics vs Logs vs Traces

| Aspect | Metrics | Logs | Traces |
|---|---|---|---|
| Shape | Numeric time series | Text/structured events | Spans with parent/child relationships |
| Volume | Low (aggregated) | High | Medium–High |
| Cost to store | Cheap | Expensive at scale | Medium |
| Best for | Alerting, trends, dashboards | Debugging root cause | Latency/bottleneck analysis in distributed systems |
| Example tool | Prometheus, Datadog | ELK, Loki, Fluentd | Jaeger, Zipkin, Tempo |

### Observability vs Monitoring
- **Monitoring**: watching known failure modes with predefined dashboards/alerts (known-unknowns).
- **Observability**: ability to ask arbitrary new questions of your system without shipping new code (unknown-unknowns) — achieved via rich, high-cardinality telemetry.

### The Four Golden Signals (Google SRE)
1. **Latency** — time to service a request (split success vs error latency).
2. **Traffic** — demand on the system (requests/sec).
3. **Errors** — rate of failed requests.
4. **Saturation** — how "full" the service is (CPU, memory, queue depth).

### RED and USE Methods
- **RED** (for services): **R**ate, **E**rrors, **D**uration.
- **USE** (for resources): **U**tilization, **S**aturation, **E**rrors.

### Push vs Pull Metrics Collection
- **Pull**: monitoring system scrapes targets on an interval (Prometheus default). Simpler service discovery, natural health-check (missed scrape = target down).
- **Push**: application/agent sends metrics to a collector (StatsD, Datadog agent, Prometheus Pushgateway for batch jobs). Needed when targets are short-lived or behind NAT/firewalls.

### Log Levels (standard)
`TRACE < DEBUG < INFO < WARN < ERROR < FATAL`
- Production default is usually `INFO` or `WARN`; toggle `DEBUG` temporarily when investigating.

### Structured vs Unstructured Logging
- Unstructured: `"User 123 logged in at 10:02"` — free text, hard to query.
- Structured (JSON): `{"event":"login","user_id":123,"ts":"2026-07-22T10:02:00Z"}` — queryable, machine-parseable. **Always prefer structured logging in new systems.**

---

## 2. Intermediate — Architecture Patterns

### Typical Logging Pipeline
```
App/Container logs → Log shipper/agent (Fluentd/Filebeat/Logstash)
   → Buffer/Queue (Kafka/Redis, optional)
   → Central store (Elasticsearch/Loki/S3)
   → Visualization (Kibana/Grafana)
   → Alerting (ElastAlert/Grafana Alerting)
```

### Typical Metrics Pipeline
```
App exposes /metrics (Prometheus client lib)
   → Prometheus server scrapes on interval
   → TSDB stores time series
   → PromQL queries
   → Grafana dashboards / Alertmanager for alerts
```

### Sidecar / DaemonSet Patterns in Kubernetes
- **DaemonSet log collector** (Fluentd/Filebeat/Fluent Bit) runs one pod per node, tails container log files from `/var/log/containers`, ships centrally. Most common, low overhead.
- **Sidecar container** ships logs from a single pod (useful when app can't log to stdout, or needs custom processing per-pod).
- **Node exporter DaemonSet** (Prometheus) exposes node-level hardware/OS metrics.

### Cardinality
- The number of unique label/tag combinations for a metric.
- High cardinality (e.g., using `user_id` as a Prometheus label) explodes memory/storage — a classic beginner mistake.
- Rule of thumb: keep labels bounded (env, service, region, status_code) — not unbounded IDs.

### Alerting Concepts
- **Alert fatigue**: too many low-value alerts → real ones get ignored. Fix with proper thresholds + severity tiers.
- **Symptom-based alerting > cause-based alerting**: alert on user-facing SLO breaches, not on every internal metric wiggle.
- **SLI / SLO / SLA**:
  - SLI (Indicator): the measured metric, e.g., "% requests < 300ms".
  - SLO (Objective): the target, e.g., "99.5% of requests < 300ms over 30 days".
  - SLA (Agreement): the external contract with penalties if SLO is missed.
- **Error budget**: `1 - SLO`. If SLO = 99.9%, error budget = 0.1% of requests/time allowed to fail before you slow down feature releases.
- **Burn rate alerts**: alert when you're consuming your error budget faster than sustainable (multi-window, multi-burn-rate alerts are best practice).

### Log Retention & Cost Management
- Hot/warm/cold tiering (Elasticsearch ILM): recent data on fast/expensive storage, older data rolled to cheaper storage or deleted.
- Sampling: don't log/trace every request at high volume — sample (e.g., 10%) plus always keep errors.
- Aggregate before storing where possible (e.g., convert verbose access logs into metrics).

---

## 3. Advanced Concepts

### Distributed Tracing Fundamentals
- **Span**: single unit of work (e.g., one DB call) with start/end time.
- **Trace**: tree of spans representing one end-to-end request.
- **Context propagation**: trace ID + span ID passed via headers (`traceparent` in W3C Trace Context) across service boundaries.
- **OpenTelemetry (OTel)**: vendor-neutral standard/SDK for generating metrics, logs, and traces — now the industry default, replacing OpenTracing/OpenCensus. Exports to Prometheus, Jaeger, Datadog, etc. via OTLP.

### High Availability for Observability Stacks
- Prometheus: **federation** (hierarchical scraping) or **Thanos/Cortex/Mimir** for HA, long-term storage, and global query view across multiple Prometheus instances.
- Elasticsearch: multi-node clusters with replica shards, dedicated master/data/ingest node roles.
- Never let your monitoring stack be a single point of failure for incident response — monitor the monitors.

### Anomaly Detection & AIOps
- Static thresholds fail for seasonal/variable traffic. Use:
  - Rolling baselines / moving averages.
  - Elasticsearch ML jobs, Datadog Watchdog, Prometheus `predict_linear()` / `deriv()`.
- Correlate deployment events with metric shifts (annotate dashboards on deploy).

### Multi-Tenancy & Access Control
- Grafana: organizations, folders, RBAC per dashboard/data source.
- Elasticsearch: index-level security via roles (X-Pack security / OpenSearch security plugin).
- Prometheus: no native multi-tenancy — Thanos/Mimir/Cortex add tenant isolation.

### Cost/Scale Trade-offs at Scale
- Metrics cardinality explosions are the #1 cause of Prometheus OOM at scale.
- Log volume is the #1 driver of ELK/Datadog cost — mitigate with sampling, log level tuning, and routing verbose logs to cheap cold storage (S3 + Athena) instead of hot search indices.
- Consider **Grafana Loki** (log aggregation indexed only by labels, not full text) as a cheaper alternative to Elasticsearch when full-text search isn't required.

### Chaos & Monitoring Validation
- Regularly test that alerts actually fire (synthetic failure injection, "fire drills").
- Dead man's switch: an alert that should ALWAYS be firing (e.g., a heartbeat) — if it stops, your alerting pipeline itself is broken.

---

## 4. Quick Comparison — Which Tool for What?

| Need | Tool |
|---|---|
| Time-series metrics + alerting (self-hosted, K8s-native) | Prometheus + Alertmanager |
| Dashboards across any data source | Grafana |
| Full-text log search at scale | Elasticsearch + Kibana (ELK) |
| Cheap log aggregation, label-based | Grafana Loki |
| Log/metric shipping & routing from many sources | Fluentd / Fluent Bit / Logstash |
| All-in-one commercial SaaS (metrics+logs+traces+APM) | Datadog |
| Distributed tracing | Jaeger / Tempo / Zipkin + OpenTelemetry |

---

## 5. Interview / Revision Quick-Fire
- Explain the difference between monitoring and observability.
- What are the four golden signals?
- Push vs pull metric collection — trade-offs?
- What is cardinality and why does it matter?
- Explain SLI/SLO/SLA/error budget with an example.
- How does Prometheus discover targets in Kubernetes?
- What's the difference between Logstash and Fluentd?
- Why would you choose Loki over Elasticsearch for logs?
- What is a burn-rate alert and why is it better than a static threshold?
- What problem does OpenTelemetry solve?
