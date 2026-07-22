# Fluentd (& Fluent Bit) — Complete Notes

## 1. Beginner

### What is Fluentd?
- Open-source **unified logging layer** — collects logs from many sources, transforms them, and routes them to many destinations. CNCF graduated project.
- Positioning: like Logstash, but lighter-weight, plugin-driven, and the de facto standard log collector in Kubernetes.
- **Fluent Bit**: a sister project — a much smaller/faster C-based agent (vs Fluentd's Ruby core) designed for resource-constrained environments (edge, sidecars, DaemonSets). Fluent Bit can forward to Fluentd for heavier processing, or ship directly to a backend on its own.

### Core Concept: "Unify Logging"
```
[many inputs: files, syslog, app, docker] → Fluentd (parse/filter/route) → [many outputs: ES, S3, Kafka, Datadog, BigQuery...]
```

### Basic Config Structure
```conf
# fluent.conf
<source>
  @type tail
  path /var/log/containers/*.log
  pos_file /var/log/fluentd-containers.log.pos
  tag kubernetes.*
  <parse>
    @type json
  </parse>
</source>

<filter kubernetes.**>
  @type kubernetes_metadata
</filter>

<match kubernetes.**>
  @type elasticsearch
  host elasticsearch.logging.svc
  port 9200
  index_name fluentd-${tag}-%Y%m%d
</match>
```
- `<source>` = input plugin.
- `<filter>` = transform/enrich events matching a tag pattern.
- `<match>` = output plugin, routes events matching a tag pattern to a destination.

### Tag-Based Routing
- Every event carries a **tag** (e.g., `kubernetes.pod.nginx`). Fluentd routes events by matching tags against `<filter>`/`<match>` patterns (`*` = one segment, `**` = any depth) — this tag-routing model is Fluentd's signature design and what makes multi-destination fan-out simple.

---

## 2. Intermediate

### Common Plugins
- Inputs: `tail` (follow log files), `forward` (receive from other Fluentd/Fluent Bit nodes), `http`, `syslog`, `docker`.
- Parsers: `json`, `regexp`, `csv`, `multiline` (for stack traces spanning multiple lines).
- Filters: `record_transformer` (add/remove/modify fields), `grep` (include/exclude by pattern), `kubernetes_metadata` (enrich with pod/namespace/labels).
- Outputs: `elasticsearch`, `s3`, `kafka2`, `forward`, `stdout`, `datadog`, `cloudwatch_logs`, `loki`.
- 700+ community plugins available via RubyGems (`fluent-plugin-*`).

### Buffering & Reliability
- Fluentd buffers events in memory or on disk before flushing to output — critical for handling downstream outages without losing data.
```conf
<match **>
  @type elasticsearch
  <buffer>
    @type file
    path /var/log/fluentd-buffers
    flush_interval 5s
    retry_max_times 5
    retry_wait 1s
  </buffer>
</match>
```
- **File buffer** survives Fluentd restarts; **memory buffer** is faster but lost on crash.
- Retry with exponential backoff is built in — essential when Elasticsearch/Kafka is briefly unavailable.

### Kubernetes Deployment Pattern
- Deployed as a **DaemonSet** (one pod per node) mounting the host's `/var/log/containers` — captures stdout/stderr from every container on that node automatically, no per-app config needed (12-factor logging: apps just log to stdout).
- `kubernetes_metadata` filter enriches each log line with pod name, namespace, labels, container name — this is what lets you filter logs by `namespace: payments` in Kibana/Grafana later.

### Multiline Log Handling
- Stack traces span multiple physical lines but are logically one event — the `multiline` parser (or Fluent Bit's `multiline.parser`) stitches them back together using a start-pattern regex, preventing a single exception from becoming dozens of broken log entries.

---

## 3. Advanced

### Fluentd vs Fluent Bit — When to Use Which
| | Fluentd | Fluent Bit |
|---|---|---|
| Language | Ruby (C extensions for perf paths) | C |
| Memory footprint | ~40MB+ | ~1-3MB |
| Plugin ecosystem | Huge (700+) | Smaller but core-complete |
| Best for | Central aggregator, complex transforms | Edge/sidecar/DaemonSet, high volume, low overhead |
| Typical pattern | Fluent Bit (nodes) → Fluentd (aggregator) → backend | Fluent Bit directly → backend |
- Common production topology: **Fluent Bit as DaemonSet** (cheap, per-node tailing) forwarding to a smaller number of **Fluentd aggregator** pods that do the heavier parsing/routing/buffering before hitting Elasticsearch/Kafka.

### Fan-out / Multi-destination Routing
```conf
<match app.**>
  @type copy
  <store>
    @type elasticsearch
    host elasticsearch.logging.svc
  </store>
  <store>
    @type s3
    s3_bucket long-term-log-archive
  </store>
</match>
```
- `copy` output sends the same event to multiple destinations — e.g., hot searchable copy in Elasticsearch + cheap long-term archive in S3.

### Backpressure & At-Least-Once Delivery
- Fluentd guarantees at-least-once delivery via buffering + retries, not exactly-once — downstream systems/consumers should be idempotent or tolerate duplicates.
- `overflow_action` on the buffer controls behavior when the buffer is full (`throw_exception`, `block`, `drop_oldest_chunk`) — choose based on whether you'd rather backpressure the source or lose the oldest data under sustained overload.

### Performance Tuning
- Increase `flush_thread_count` for higher output throughput.
- Chunk sizing (`chunk_limit_size`, `total_limit_size`) balances latency vs. batching efficiency.
- Avoid regex-heavy parsers on the hot path where a `json` parser would do — same principle as avoiding `grok` in Logstash when logs are already structured.
- Monitor Fluentd's own health via its `monitor_agent` plugin (exposes an HTTP endpoint with buffer/queue stats) or Fluent Bit's built-in Prometheus metrics endpoint.

### Security
- TLS between Fluent Bit/Fluentd nodes and the aggregator (`<transport>` block, `forward` plugin supports TLS + shared-key auth).
- Redact/scrub sensitive fields (PII, secrets) in a `filter` before they ever leave the node — cheaper and safer than scrubbing after ingestion into a central store.

---

## Quick Revision — Fluentd / Fluent Bit
- Fluentd = unified logging layer; tag-based routing (`source` → `filter` → `match`).
- Fluent Bit = lightweight C agent for edge/DaemonSet; Fluentd = heavier central aggregator for complex processing.
- Buffering (memory vs file) + retries give at-least-once delivery; plan for duplicate tolerance downstream.
- Kubernetes pattern: DaemonSet tails `/var/log/containers`, `kubernetes_metadata` filter enriches with pod/namespace/labels.
- `copy` output = fan-out to multiple destinations (e.g., ES for search + S3 for archive).
- Prefer structured (JSON) logs at the source to avoid expensive regex parsing downstream.
