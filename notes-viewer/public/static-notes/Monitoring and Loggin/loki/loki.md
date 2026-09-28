# Loki — Complete Notes

## 1. Beginner

### What is Loki?
- **Grafana Loki** is a horizontally-scalable, highly-available **log aggregation system** built by Grafana Labs, inspired by Prometheus's architecture and cost model.
- Core idea: **"like Prometheus, but for logs"** — instead of indexing the full text of every log line (like Elasticsearch), Loki only indexes a small set of **labels** (metadata) and stores the raw log content compressed in chunks. This makes it dramatically cheaper to run at scale.
- CNCF-adjacent, open-source, ships as part of the **"PLG stack"** (Promtail + Loki + Grafana) — the logging counterpart to Prometheus + Grafana for metrics.

### Why Loki Exists — The Core Trade-off
| | Elasticsearch (ELK) | Loki |
|---|---|---|
| Indexing | Full-text index of every field/word in every log line | Only indexes **labels** (e.g., `app`, `namespace`, `pod`), not log content |
| Storage cost | High (inverted index is large) | Low (chunks are just compressed text in object storage) |
| Query power | Rich full-text search, complex aggregations | Label-filtered search + regex/line-filter on the (smaller) matched set |
| Best for | Deep ad-hoc full-text search, security/SIEM use cases | High-volume Kubernetes/cloud-native logs where you mostly filter by service/pod/namespace, then grep |
| Operational complexity | Higher (shards, replicas, JVM tuning) | Lower (stateless components, cheap object storage backend) |

**Rule of thumb**: if you can identify "which service/pod/time range" first and then eyeball the logs, Loki is cheaper and simpler. If you need to search arbitrary free text across your entire log corpus without knowing the source first, Elasticsearch/OpenSearch wins.

### Core Architecture (Conceptual)
```
[App/Container logs] --> [Promtail / Fluent Bit / Grafana Alloy] --push--> [Loki] --> [Grafana] (LogQL queries)
```
- **Agent** (Promtail, Fluent Bit, Grafana Alloy, or the Docker/Vector output): tails log files or receives log streams, attaches labels, pushes to Loki over HTTP.
- **Loki server**: receives, indexes labels, compresses log content into chunks, stores them.
- **Grafana**: the query/visualization layer — same tool used for Prometheus dashboards, using **Explore** or dashboard panels with **LogQL**.

### Labels — The Central Concept
Every log stream in Loki is identified by a unique set of labels, exactly like a Prometheus metric series:
```
{app="checkout", namespace="prod", pod="checkout-7f9c-abcd", level="error"}
```
- All log lines sharing the exact same label set belong to the same **stream** and get appended to the same chunk.
- **Keep label cardinality low** — this is the single most important operational rule in Loki (see Advanced section). Never use `pod` name, `request_id`, `trace_id`, `user_id`, or raw URLs as an indexed label.

### Installing / Running Loki (Quick Start)
```bash
# Docker Compose style quick start
docker run -d --name=loki -p 3100:3100 grafana/loki:latest

# Promtail (log shipper) minimal config
# promtail-config.yaml
server:
  http_listen_port: 9080
positions:
  filename: /tmp/positions.yaml
clients:
  - url: http://localhost:3100/loki/api/v1/push
scrape_configs:
  - job_name: system
    static_configs:
      - targets: [localhost]
        labels:
          job: varlogs
          __path__: /var/log/*.log
```
```bash
docker run -v $(pwd)/promtail-config.yaml:/etc/promtail/config.yaml grafana/promtail:latest -config.file=/etc/promtail/config.yaml
```

### LogQL Basics
LogQL is Loki's query language — modeled after PromQL, split into a **log query** part and an optional **metric query** part.
```logql
# Select a stream by label (mandatory first step — always start with a label selector)
{app="checkout", namespace="prod"}

# Add a line filter (simple substring/regex grep on the matched stream)
{app="checkout"} |= "error"
{app="checkout"} != "healthcheck"
{app="checkout"} |~ "timeout|5\\d\\d"

# Parse structured logs on the fly
{app="checkout"} | json
{app="checkout"} | logfmt
{app="checkout"} | json | status_code >= 500
```

---

## 2. Intermediate

### Deployment Modes
1. **Monolithic mode**: single binary, single process runs all components — great for dev/small setups (< a few hundred GB/day).
2. **Simple Scalable mode**: splits into three targets — `read`, `write`, `backend` — each scaled independently behind a load balancer. Recommended default for most production setups.
3. **Microservices mode**: every component (distributor, ingester, querier, query-frontend, compactor, ruler, index-gateway) runs as its own independently-scaled deployment — for very large, high-throughput installs (Grafana Cloud-scale).

### Key Components (Microservices View)
- **Distributor**: receives push requests, validates, hashes streams, forwards to ingesters.
- **Ingester**: buffers/batches incoming log data into chunks in memory, periodically flushes to long-term storage.
- **Querier**: executes LogQL queries, pulling from ingesters (recent, in-memory data) and storage (historical, flushed chunks).
- **Query Frontend**: splits/parallelizes large queries, caches results, provides queueing/fair-scheduling for multi-tenant fairness.
- **Compactor**: merges/deduplicates index files and enforces retention (deletes old chunks per configured policy).
- **Index Gateway**: serves index lookups from the shared index without every querier needing local index copies.
- **Ruler**: evaluates alerting/recording rules directly on log data (LogQL metric queries), like Prometheus's rule evaluator.

### Storage Backends
- **Chunks**: compressed blocks of raw log lines — the bulk of the data. Stored in object storage: S3, GCS, Azure Blob, MinIO, or local filesystem for dev.
- **Index**: maps label sets → chunk locations. Modern Loki uses **TSDB index format** (replacing older BoltDB-shipper) stored alongside chunks in object storage — no separate database (Cassandra/BigTable) needed anymore, simplifying ops significantly vs older Loki versions.
- Because both index and chunks live in cheap object storage, Loki's storage cost profile is close to "S3 pricing," which is its main cost advantage over Elasticsearch's replicated-disk model.

### Log Shippers / Agents Compared
| Agent | Notes |
|---|---|
| **Promtail** | Loki's original purpose-built agent; being phased in favor of Alloy but still widely deployed and fully supported |
| **Grafana Alloy** | Grafana's unified OpenTelemetry-based collector — successor to Promtail, also handles metrics/traces |
| **Fluent Bit / Fluentd** | Has a native Loki output plugin — useful if already standardized on Fluent* for the rest of the pipeline |
| **Vector** | Rust-based, high-performance alternative with a Loki sink |
| **Docker/Kubernetes Loki logging driver** | Ships container stdout directly to Loki without an agent, for simple setups |

### LogQL — Parsing & Filtering (Deeper)
```logql
# Extract labels dynamically from JSON logs and filter on them
{app="checkout"} | json | status_code = `500`

# logfmt (key=value style logs, common in Go apps)
{app="checkout"} | logfmt | duration > 1s

# Regex extraction into new labels
{app="checkout"} | regexp `(?P<method>\w+) (?P<path>\S+) (?P<status>\d+)`

# Unwrap a numeric field for metric-style aggregation
{app="checkout"} | json | unwrap duration_ms
```

### Metric Queries (Turning Logs into Numbers)
LogQL can aggregate log streams into time series, just like PromQL over metrics:
```logql
# Log lines per second matching "error"
sum(rate({app="checkout"} |= "error" [5m]))

# Error rate by pod
sum by (pod) (rate({app="checkout"} | json | status_code >= 500 [5m]))

# p99 request duration extracted from unwrapped field
quantile_over_time(0.99, {app="checkout"} | json | unwrap duration_ms [5m])
```
This is what lets Loki dashboards and **alerting rules** (via the Ruler) look and feel exactly like Prometheus alerting, just sourced from logs instead of metrics.

### Multi-Tenancy
- Native multi-tenant: every request carries an `X-Scope-OrgID` header; Loki isolates data per tenant at the storage and query level.
- Used heavily by Grafana Cloud and by platform teams offering "logging as a service" to multiple internal teams from one Loki cluster.

### Retention
```yaml
limits_config:
  retention_period: 744h   # 31 days
table_manager:
  retention_deletes_enabled: true
  retention_period: 744h
```
- Enforced by the **Compactor** in modern Loki (table-manager approach is legacy).
- Per-tenant retention overrides are supported — useful when different teams have different compliance requirements.

---

## 3. Advanced

### Cardinality — Loki's #1 Operational Risk (Same Lesson as Prometheus)
- Every unique label combination creates a new **stream**, and every stream gets its own chunk file being written concurrently in the ingester.
- Too many streams (from high-cardinality labels like `pod`, `request_id`, `trace_id`, `session_id`, or raw file paths) causes:
  - Ingester memory pressure (each open stream chunk consumes memory).
  - "Too many outstanding requests" / OOM errors.
  - Poor compression (small, fragmented chunks instead of large, well-packed ones).
- **Fix**: keep labels to bounded, low-cardinality dimensions (`app`, `namespace`, `env`, `level`, `container`). Put high-cardinality data (request IDs, user IDs) in the **log line content** instead, and filter/extract it at query time with `| json` / `| regexp` / line filters rather than as an indexed label.

### Query Performance Tuning
- Always start a LogQL query with the most selective label matcher possible — Loki cannot do a "full scan" cheaply the way it can filter labels.
- Line filters (`|=`, `!=`, `|~`) are applied **after** label selection and are relatively cheap (simple grep), but avoid overly broad regex on huge time ranges.
- Use the **Query Frontend** with results caching and query splitting (by time) for large-range queries — critical at production scale.
- `parallelise_shardable_queries` and sharding by time/tenant lets large aggregation queries fan out across queriers.

### Chunk & Ingester Tuning
- `chunk_target_size` / `chunk_idle_period` / `max_chunk_age`: control when in-memory chunks flush to storage — larger chunks compress better but increase memory use and recovery time on ingester crash.
- Write-Ahead Log (WAL) on ingesters protects buffered-but-unflushed data from loss on restart/crash.
- Replication factor (typically 3) across ingesters for durability before flush.

### Comparison to the Rest of the Logging Ecosystem
| Need | Best Fit |
|---|---|
| Cheapest logs at high Kubernetes/cloud-native volume, label-first querying | **Loki** |
| Deep full-text search, security/SIEM, complex ad-hoc queries | Elasticsearch / OpenSearch ([ELK](../elk/logstash.md)) |
| Unified metrics + logs + traces in one open-source, Prometheus-shaped stack | Loki + Prometheus + Tempo + Grafana ("LGTM stack") |
| Commercial all-in-one, minimal ops overhead | [Datadog](../datadog/datadog.md) |
| Log/metric routing and transformation before storage | [Fluentd](../fluentid/fluentd.md) / Fluent Bit / Vector feeding into Loki |

### The "LGTM" Stack
- **L**oki (logs) + **G**rafana (visualization) + **T**empo (traces) + **M**imir (metrics, Prometheus-compatible long-term storage).
- All four share the same object-storage-backed, horizontally-scalable architectural pattern and are designed to be queried/correlated together in Grafana (e.g., jump from a trace span straight into the exact log lines for that request via shared labels/trace IDs).

### High Availability & Scaling Checklist
- Run in **Simple Scalable** or **Microservices** mode in production — monolithic mode is single point of failure.
- Object storage (S3/GCS/Azure Blob) for chunks/index — never local disk in production beyond a dev sandbox.
- Set replication factor ≥ 3 on ingesters.
- Put a query-frontend + result cache (Memcached/Redis) in front of queriers for dashboard-heavy workloads.
- Separate `read` and `write` scaling paths — write path (ingestion) and read path (queries) have very different resource profiles and scale independently.

### Common Pitfalls
- Using high-cardinality labels (`pod`, `container_id`, `trace_id`) — the most common production incident cause.
- Expecting Elasticsearch-style free-text search across the whole cluster without a label filter first — LogQL requires a stream selector; there's no "search everything" query.
- Running monolithic mode at production log volume and being surprised by ingester OOMs.
- Forgetting to configure retention — unbounded retention on object storage silently grows the bill.
- Mixing structured log parsing (`| json`) into hot-path dashboards without considering the CPU cost of parsing at query time on large result sets — extract only the fields you need.

---

## Quick Revision — Loki
- "Prometheus, but for logs" — indexes only labels, not full text; log content lives compressed in object-storage chunks.
- Labels define **streams**; keep them low-cardinality (never `pod`, `request_id`, `user_id` as labels).
- LogQL = label selector → line filters (`|=`, `!=`, `|~`) → parsers (`| json`, `| logfmt`, `| regexp`) → optional metric aggregation (`rate()`, `sum by()`, `quantile_over_time()`).
- Deployment modes: monolithic (dev) → simple scalable (most prod) → microservices (very large scale).
- Storage = chunks + TSDB index, both in cheap object storage — no separate index database needed in modern Loki.
- Ruler evaluates LogQL-based alerting/recording rules, same pattern as Prometheus Alertmanager rules.
- Part of the "LGTM stack" (Loki, Grafana, Tempo, Mimir) for a unified open-source observability platform.
- Choose Loki over ELK when you filter by known metadata first; choose ELK when you need arbitrary full-text search.

## Related Notes
- [Monitoring & Logging Master Notes](../index.md) — concepts tying metrics/logs/traces together
- [Prometheus](../prometheous/prometheus.md) — the metrics counterpart Loki's architecture is modeled on
- [Grafana](../grafana/grafana.md) — the query/visualization layer used for LogQL
- [ELK / Logstash](../elk/logstash.md) — the full-text-search alternative to Loki
- [Fluentd](../fluentid/fluentd.md) — agent alternative to Promtail for shipping logs into Loki
