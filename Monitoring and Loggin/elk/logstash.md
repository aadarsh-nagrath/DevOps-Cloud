# ELK Stack & Logstash — Complete Notes

## 1. Beginner

### What is "ELK"?
- **E**lasticsearch — storage + search/analytics engine.
- **L**ogstash — data collection/ingestion + transformation pipeline.
- **K**ibana — visualization UI on top of Elasticsearch.
- Often extended with **Beats** (lightweight shippers) → called the **Elastic Stack**.

### Why Logstash?
- A **server-side data processing pipeline** that ingests data from multiple sources, transforms it, and ships it to one or more destinations ("stashes"), most commonly Elasticsearch.
- Heavier-weight than Beats/Fluentd, but far more powerful for complex parsing/enrichment.

### Logstash Pipeline Anatomy
Every Logstash config has 3 stages:
```
INPUT → FILTER → OUTPUT
```
```conf
# logstash.conf
input {
  beats {
    port => 5044
  }
}

filter {
  grok {
    match => { "message" => "%{COMBINEDAPACHELOG}" }
  }
  date {
    match => [ "timestamp", "dd/MMM/yyyy:HH:mm:ss Z" ]
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "weblogs-%{+YYYY.MM.dd}"
  }
}
```

### Common Inputs
- `beats` (receive from Filebeat/Metricbeat), `file` (tail local files), `tcp`/`udp`, `kafka`, `http`, `stdin` (testing).

### Common Outputs
- `elasticsearch`, `stdout` (debugging, use `codec => rubydebug`), `kafka`, `s3`, `file`.

---

## 2. Intermediate

### The `grok` Filter — Parsing Unstructured Logs
- Grok uses named regex patterns to extract structured fields from raw text lines — the single most important Logstash filter for legacy/unstructured logs.
```conf
filter {
  grok {
    match => { "message" => "%{TIMESTAMP_ISO8601:ts} %{LOGLEVEL:level} %{GREEDYDATA:msg}" }
  }
}
```
- Built-in patterns: `%{IP}`, `%{NUMBER}`, `%{WORD}`, `%{DATA}`, `%{GREEDYDATA}`, `%{COMBINEDAPACHELOG}`, etc.
- Grok is CPU-expensive (regex-based) — prefer structured (JSON) logging at the source when possible to skip grok entirely.

### Other Key Filters
- `json` — parse a JSON string field into structured fields (much cheaper than grok — prefer this if app logs JSON).
- `mutate` — rename/remove/convert field types, gsub string replace.
- `date` — parse a timestamp field into `@timestamp` (critical so Kibana time-filters work correctly, otherwise it uses ingest time).
- `geoip` — enrich an IP field with geographic location.
- `useragent` — parse browser/OS from a User-Agent string.
- `drop` — discard events matching a condition (e.g., filter out health-check noise before it hits Elasticsearch).

### Conditional Logic
```conf
filter {
  if [type] == "nginx" {
    grok { match => { "message" => "%{COMBINEDAPACHELOG}" } }
  } else if [type] == "app" {
    json { source => "message" }
  }
}
```

### Multiple Pipelines
- `pipelines.yml` lets one Logstash instance run several independent input→filter→output pipelines (isolating e.g. app logs from infra logs) instead of one giant conditional-laden config.

### Beats — Lightweight Shippers (companion to Logstash)
- **Filebeat**: tails log files, ships to Logstash or directly to Elasticsearch.
- **Metricbeat**: collects host/service metrics.
- **Packetbeat**, **Winlogbeat**, **Auditbeat**: specialized shippers.
- Beats are written in Go, low resource footprint — typically deployed as a DaemonSet in Kubernetes, whereas Logstash runs centrally (fewer, heavier instances) to do the actual transformation.

---

## 3. Advanced

### Logstash Performance Tuning
- **Pipeline workers** (`pipeline.workers`) — parallel filter+output threads, default = number of CPU cores.
- **Batch size/delay** (`pipeline.batch.size`, `pipeline.batch.delay`) — larger batches = better throughput, more latency.
- Grok is often the bottleneck — profile with the `X-Pack monitoring` / pipeline viewer, replace poorly-anchored regex patterns, anchor patterns (`^...$`) where possible.
- Persistent queues (`queue.type: persisted`) buffer events to disk between input and filter stages — protects against data loss if Logstash crashes or downstream (Elasticsearch) is unavailable, at the cost of throughput.

### Dead Letter Queue (DLQ)
- Events that fail to be written to Elasticsearch (e.g., mapping conflicts) can be routed to a DLQ instead of being silently dropped — reprocess later with the `dead_letter_queue` input.

### Scaling Logstash
- Run multiple Logstash instances behind Kafka (as a durable buffer) instead of Beats → Logstash directly — decouples ingestion spikes from processing capacity and adds replay-ability:
```
Beats/App → Kafka topic → Logstash (consumer group, scaled horizontally) → Elasticsearch
```

### ELK vs Modern Alternatives
| Concern | Classic ELK | Modern lightweight alt |
|---|---|---|
| Log shipping | Logstash (heavy) | Fluent Bit / Vector (lightweight) |
| Log storage/search | Elasticsearch (full-text index, $$) | Grafana Loki (label-indexed, cheap) |
| Transform/parse | Logstash filters | Vector transforms, or parse at source (structured logging) |
- Trend: push structured JSON logging at the app level, use lightweight shippers (Fluent Bit/Vector), reserve Logstash for complex enrichment use cases, and consider Loki when full-text search isn't a hard requirement.

### Security & Multi-tenancy
- Logstash itself has no built-in auth — secure the Beats input (TLS + mutual auth) and the Elasticsearch output (API key/user credentials), don't expose Logstash ports publicly.

### Common Production Pitfalls
- Missing `date` filter → Kibana shows ingest time instead of actual event time, breaking time-based investigation.
- No index lifecycle policy → unbounded Elasticsearch storage growth (pair with ILM, see elasticsearch notes).
- Grok patterns that don't match → `_grokparsefailure` tag added to event; monitor for these to catch silently broken parsing.
- Running Logstash directly on high-cardinality label-generating filters → cardinality problems downstream in Elasticsearch aggregations.

---

## Quick Revision — ELK / Logstash
- ELK = Elasticsearch (store) + Logstash (ingest/transform) + Kibana (visualize); Beats = lightweight shippers feeding Logstash or ES directly.
- Logstash pipeline = input → filter → output.
- `grok` parses unstructured text (expensive); `json` filter is cheap if logs are already structured — prefer structured logging at the source.
- Always set the `date` filter to correct `@timestamp`.
- Persistent queues + DLQ protect against data loss.
- Kafka in front of Logstash decouples spikes and adds replay capability.
- Modern trend: Fluent Bit/Vector + Loki as a cheaper, lighter alternative to full Logstash + Elasticsearch for pure logging.
