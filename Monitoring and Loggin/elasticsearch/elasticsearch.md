# Elasticsearch — Complete Notes

## 1. Beginner

### What is Elasticsearch?
- Distributed, JSON-document-based **search and analytics engine**, built on Apache Lucene.
- Forms the storage/search layer of the **ELK/Elastic Stack** (Elasticsearch, Logstash, Kibana [+ Beats]).
- Used for: full-text log search, application search, metrics analytics, security/SIEM data.

### Core Concepts
| Elasticsearch term | Relational DB analogy |
|---|---|
| Index | Database/Table |
| Document | Row |
| Field | Column |
| Mapping | Schema |
| Shard | Partition |

- **Document**: a JSON object, the basic unit of data, stored with a unique `_id`.
- **Index**: a collection of documents with similar structure (e.g., `logs-2026.07.22`).
- **Mapping**: defines field types (text, keyword, date, integer, etc.) for an index — like a schema, but flexible/dynamic by default.
- **Node**: a single running Elasticsearch instance.
- **Cluster**: a group of nodes working together, identified by cluster name.

### Basic REST API
```bash
# Create/index a document
PUT /logs-2026.07.22/_doc/1
{ "message": "user login failed", "level": "error", "@timestamp": "2026-07-22T10:00:00Z" }

# Get a document
GET /logs-2026.07.22/_doc/1

# Simple search
GET /logs-2026.07.22/_search
{ "query": { "match": { "message": "login failed" } } }

# Delete an index
DELETE /logs-2026.07.22
```

### text vs keyword field types
- `text`: analyzed (tokenized, lowercased) — good for full-text search ("login" matches "user login failed").
- `keyword`: not analyzed, exact match only — good for filtering/aggregations (e.g., `status: "error"`, sorting).
- Best practice: map string fields as both (`"field": {"type": "text", "fields": {"keyword": {"type": "keyword"}}}`) so you get both full-text search and exact aggregation.

---

## 2. Intermediate

### Sharding & Replication
- Each index is split into **primary shards** (for horizontal scaling) and each primary can have **replica shards** (for HA and read throughput).
- Shard count set at index creation time and is hard to change later (reindex needed) — plan capacity up front.
- Replicas live on different nodes than their primary, so losing a node doesn't lose data.

### Query DSL — Common Query Types
```json
// Full text
{ "query": { "match": { "message": "timeout error" } } }

// Exact filter (no scoring, cached, fast)
{ "query": { "bool": { "filter": [
    { "term": { "level.keyword": "error" } },
    { "range": { "@timestamp": { "gte": "now-1h" } } }
]}}}

// Combine full-text + filters (typical log search)
{ "query": { "bool": {
    "must": [ { "match": { "message": "checkout" } } ],
    "filter": [ { "term": { "service.keyword": "payments" } } ]
}}}
```
- **`must`** affects relevance score; **`filter`** doesn't (and is cacheable) — always prefer `filter` for exact-match/date-range clauses in log searches.

### Aggregations
```json
GET /logs-*/_search
{
  "size": 0,
  "aggs": {
    "by_service": {
      "terms": { "field": "service.keyword" },
      "aggs": {
        "avg_duration": { "avg": { "field": "duration_ms" } }
      }
    }
  }
}
```
- Aggregations power Kibana visualizations: terms (group by), date_histogram (time buckets), avg/sum/percentiles, cardinality (approx unique count).

### Index Templates & Index Patterns
- **Index template**: predefined mappings/settings automatically applied to new indices matching a pattern (e.g., `logs-*`) — essential for daily/rolling log indices.
```json
PUT _index_template/logs-template
{
  "index_patterns": ["logs-*"],
  "template": {
    "settings": { "number_of_shards": 3, "number_of_replicas": 1 },
    "mappings": { "properties": { "level": { "type": "keyword" } } }
  }
}
```

### The Elastic Stack Ingest Path
```
Beats/Fluentd/Logstash → Elasticsearch (Ingest Node / pipeline) → Index → Kibana
```
- **Ingest pipelines**: lightweight ETL inside Elasticsearch itself (grok parsing, field renaming) — alternative to doing all transforms in Logstash.

---

## 3. Advanced

### Cluster Topology & Node Roles
- **Master-eligible nodes**: manage cluster state, index creation, shard allocation (keep to odd numbers, e.g., 3, for quorum).
- **Data nodes**: hold shards, do the actual indexing/search work — often split further into `data_hot`, `data_warm`, `data_cold`, `data_frozen` for tiered storage.
- **Ingest nodes**: run ingest pipelines before indexing.
- **Coordinating-only nodes**: route requests/merge results, no data storage — useful as a smart load balancer layer for large clusters.
- Production clusters dedicate node roles rather than running everything on every node.

### Index Lifecycle Management (ILM)
- Automates moving indices through phases as they age:
  `Hot` (actively written, fast storage) → `Warm` (read-only, less resourced) → `Cold` (rarely accessed, cheap storage) → `Delete`.
```json
PUT _ilm/policy/logs-policy
{
  "policy": {
    "phases": {
      "hot": { "actions": { "rollover": { "max_size": "50gb", "max_age": "1d" } } },
      "warm": { "min_age": "3d", "actions": { "shrink": { "number_of_shards": 1 } } },
      "delete": { "min_age": "30d", "actions": { "delete": {} } }
    }
  }
}
```

### Shard Sizing Best Practices
- Target shard size ~10–50GB; too many small shards = cluster overhead (each shard costs memory); too few huge shards = slow recovery and poor parallelism.
- Rule of thumb: no more than ~20 shards per GB of heap on a node.

### Search Performance
- Use `filter` context (cacheable, no scoring) wherever possible.
- Avoid deep pagination (`from`/`size` beyond ~10k) — use `search_after` or Point-in-Time (PIT) API for scrolling large result sets.
- `_source` filtering to return only needed fields reduces network/serialization cost.

### Reindexing & Zero-Downtime Migrations
- Mappings are largely immutable after creation — reindex into a new index with corrected mapping, then swap via an **alias**:
```
POST _reindex
{ "source": { "index": "logs-old" }, "dest": { "index": "logs-new" } }
```
- Applications should always read/write via an **alias**, never a raw index name, so this swap is transparent.

### Security (X-Pack / OpenSearch Security)
- TLS for transport + HTTP layer, role-based access control down to index/field/document level, API keys for service accounts, audit logging.

### Elasticsearch vs OpenSearch
- OpenSearch is the AWS-led open-source fork after Elastic changed licensing (SSPL) in 2021 — API-compatible core, diverging feature sets over time. Know this distinction for interviews.

### Monitoring Elasticsearch Itself
- Watch: heap usage (`_cat/nodes?v`), JVM GC pauses, indexing/search latency, thread pool rejections (`_cat/thread_pool`), disk watermark thresholds (cluster stops allocating shards past 85%/90%/95% disk usage by default).

---

## Quick Revision — Elasticsearch
- Document store built on Lucene; index/shard/replica model.
- `text` (analyzed, full-text) vs `keyword` (exact match) field types.
- `filter` context is cached and faster than `must` for exact matches.
- ILM automates hot→warm→cold→delete lifecycle for log retention/cost control.
- Node roles: master, data (hot/warm/cold), ingest, coordinating.
- Reindex + alias swap for zero-downtime mapping changes.
- OpenSearch = AWS fork after Elastic's SSPL license change.
