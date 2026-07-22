# Prometheus — Complete Notes

## 1. Beginner

### What is Prometheus?
- Open-source **metrics-based monitoring and alerting** system, originally built at SoundCloud, now a CNCF graduated project.
- Pulls (scrapes) metrics from targets over HTTP at regular intervals and stores them in a local time-series database (TSDB).

### Core Architecture
```
[Targets/Exporters] <--scrape-- [Prometheus Server] --> [TSDB storage]
                                        |
                                        v
                                 [Alertmanager] --> Slack/Email/PagerDuty
                                        |
                                        v
                                  [Grafana] (visualization)
```
Components:
- **Prometheus server**: scrapes + stores + evaluates rules.
- **Exporters**: translate a system's native metrics into Prometheus format (`node_exporter` for host metrics, `mysqld_exporter`, `blackbox_exporter` for probing endpoints).
- **Pushgateway**: for short-lived/batch jobs that can't be scraped — they push metrics here, Prometheus scrapes the gateway.
- **Alertmanager**: separate process handling alert routing, grouping, deduplication, silencing.
- **Client libraries**: instrument your own app code (Go, Java, Python, etc.) to expose a `/metrics` endpoint.

### The Four Metric Types
1. **Counter** — monotonically increasing value (only goes up, resets on restart). E.g., `http_requests_total`.
2. **Gauge** — value that can go up or down. E.g., `memory_usage_bytes`, `queue_length`.
3. **Histogram** — samples observations into configurable buckets, exposes `_bucket`, `_sum`, `_count`. E.g., request duration.
4. **Summary** — like histogram but computes quantiles client-side (e.g., p50, p99); less flexible for aggregation across instances than histograms.

### Basic Config Example
```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'node_exporter'
    static_configs:
      - targets: ['localhost:9100']

  - job_name: 'my-app'
    metrics_path: /metrics
    static_configs:
      - targets: ['app:8080']
```

### The Data Model
- Every time series is uniquely identified by a metric name + a set of key-value **labels**:
  `http_requests_total{method="GET", status="200", job="api"}`
- Labels are what make Prometheus powerful for filtering/aggregation — but also the source of cardinality explosions if misused.

---

## 2. Intermediate

### PromQL Basics
```promql
# Instant vector — current value of a series
http_requests_total

# Range vector — values over last 5 minutes
http_requests_total[5m]

# Rate of increase per second (for counters) — always use with counters
rate(http_requests_total[5m])

# Aggregate across all instances, grouped by status code
sum(rate(http_requests_total[5m])) by (status)

# Error rate percentage
sum(rate(http_requests_total{status=~"5.."}[5m]))
  / sum(rate(http_requests_total[5m])) * 100

# p99 latency from a histogram
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# Alert-style: predict disk full in 4 hours
predict_linear(node_filesystem_avail_bytes[1h], 4*3600) < 0
```

### Key PromQL Functions to Know
- `rate()` / `irate()` — per-second average rate over a range (use `rate` for alerts, `irate` for fast-moving dashboards).
- `increase()` — total increase over a time range.
- `sum()`, `avg()`, `max()`, `min()`, `count()` with `by ()` / `without ()`.
- `histogram_quantile()` — compute percentiles from histogram buckets.
- `delta()` — difference between first/last value in a range (for gauges).
- `absent()` — detect when a metric stops reporting entirely (great for dead-man's-switch alerts).

### Service Discovery (Kubernetes)
Instead of static targets, Prometheus can auto-discover:
```yaml
scrape_configs:
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
```
- Common `role` values: `node`, `service`, `pod`, `endpoints`, `ingress`.
- `relabel_configs` filter/rewrite labels before scraping (e.g., only scrape pods with a specific annotation).

### Alerting Rules
```yaml
groups:
  - name: example
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m]))
          / sum(rate(http_requests_total[5m])) > 0.05
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Error rate above 5% for 10 minutes"
```
- `for:` requires the condition to be true continuously before firing — avoids flapping/noise.

### Alertmanager Routing
```yaml
route:
  receiver: default
  group_by: ['alertname', 'cluster']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: pagerduty
receivers:
  - name: default
    slack_configs:
      - channel: '#alerts'
  - name: pagerduty
    pagerduty_configs:
      - service_key: '<key>'
```
- Handles **grouping** (batch related alerts), **inhibition** (suppress lower-severity alert if a related critical one is firing), and **silencing** (temporary mute during maintenance).

### Recording Rules
- Precompute expensive/frequent queries into new time series to speed up dashboards and reduce load:
```yaml
groups:
  - name: precompute
    rules:
      - record: job:http_requests:rate5m
        expr: sum(rate(http_requests_total[5m])) by (job)
```

---

## 3. Advanced

### Storage Internals
- Prometheus TSDB stores data in 2-hour blocks on local disk, compacted over time.
- Default retention: 15 days (configurable via `--storage.tsdb.retention.time`).
- Not designed for long-term/durable storage by default — local disk only, no built-in replication.

### Long-Term Storage & HA: Thanos / Cortex / Mimir
- **Problem**: vanilla Prometheus is single-node, limited retention, no global query view across multiple clusters.
- **Thanos**: sidecar uploads TSDB blocks to object storage (S3/GCS), a Querier provides a unified query across many Prometheus instances + historical data, a Compactor downsamples old data.
- **Cortex / Grafana Mimir**: horizontally scalable, multi-tenant Prometheus-compatible TSDB, remote-write target.
- **Pattern**: apps → local Prometheus → `remote_write` → Mimir/Cortex/Thanos receive → durable long-term storage + global queries.

### Federation
- One Prometheus scrapes aggregated metrics from other Prometheus servers' `/federate` endpoint — simpler than Thanos but less powerful (no true global query, no HA storage).

### High Cardinality Problems (Advanced Debugging)
- Symptoms: Prometheus OOMing, slow queries, huge `.tsdb` disk usage.
- Diagnose: `prometheus_tsdb_symbol_table_size_bytes`, `topk(10, count by (__name__)({__name__=~".+"}))`, or use `promtool tsdb analyze`.
- Fix: drop high-cardinality labels via `metric_relabel_configs`, avoid labels like `user_id`, `request_id`, raw URLs (use path templates instead).

### Exporters — Writing Your Own
- Implement `/metrics` returning Prometheus text exposition format, or use client libraries (`prometheus_client` for Python, etc.).
- For apps you can't instrument directly, write a small exporter that polls the app's native metrics/API and re-exposes them in Prometheus format.

### PromQL Advanced Patterns
```promql
# Multi-window, multi-burn-rate SLO alert (simplified)
(
  sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > (14.4 * 0.001)
)
and
(
  sum(rate(http_requests_total{status=~"5.."}[1h])) / sum(rate(http_requests_total[1h])) > (14.4 * 0.001)
)
```
- Multi-window catches both fast burns (short window) and slow burns (long window) while reducing false positives.

### Remote Write / Read
- `remote_write`: stream samples to an external system (Mimir, Cortex, Datadog, InfluxDB) in real time.
- `remote_read`: query external long-term storage transparently through Prometheus's own query API.

### Performance Tuning Checklist
- Scrape interval: don't go below what you actually need (15s–60s typical); shorter = more storage + CPU.
- Use recording rules for dashboards hit frequently.
- Limit label cardinality per metric.
- Shard scraping across multiple Prometheus instances by job/team if a single instance can't keep up.
- Use `--storage.tsdb.retention.size` alongside time-based retention to cap disk usage.

---

## Quick Revision — Prometheus
- Pull-based scraping, own TSDB, PromQL, Alertmanager for routing.
- 4 metric types: Counter, Gauge, Histogram, Summary.
- `rate()` for counters, never use raw counter values in dashboards.
- Use `for:` in alert rules to avoid flapping.
- High cardinality is the #1 operational risk.
- Thanos/Cortex/Mimir solve HA + long-term retention + multi-cluster queries.
- `histogram_quantile()` for percentile latency from histogram buckets.
