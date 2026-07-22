# Kibana — Complete Notes

## 1. Beginner

### What is Kibana?
- The **visualization and management UI** for Elasticsearch — the "K" in ELK.
- Lets you search logs, build dashboards/visualizations, and manage cluster/index settings, all through a web UI.

### Core Concepts
- **Index Pattern / Data View**: tells Kibana which Elasticsearch indices to query (e.g., `logs-*`) and which field is the time field (`@timestamp`).
- **Discover**: the primary log-search screen — free-text/KQL search + time range picker + field list, similar to `grep` with a UI.
- **Visualize**: build individual charts (bar, line, pie, data table, metric) from aggregations.
- **Dashboard**: arrange multiple visualizations together, with a shared time range and filters.

### KQL (Kibana Query Language) Basics
```
level: "error"
service: "checkout" and level: "error"
message: *timeout*
response_time > 500
not status: 200
```
- Simpler than raw Elasticsearch DSL; used in Discover's search bar and most panels.

### Time Range Picker
- Every Discover/Dashboard view is scoped by a global time range (e.g., "Last 15 minutes", "Last 24 hours") — this is why the `date` filter mapping to `@timestamp` in Logstash/ingestion matters so much.

---

## 2. Intermediate

### Building Visualizations
- **Lens** (modern drag-and-drop visualization builder) — recommended over legacy Visualize editor for most new dashboards.
- Common chart types tied to Elasticsearch aggregations:
  - Bar/line chart = `date_histogram` + `terms` aggregation.
  - Metric = single `avg`/`sum`/`count`/`cardinality`.
  - Data table = multiple bucket aggregations combined.
  - Heat map = two-dimensional bucket aggregation (e.g., hour of day x day of week).

### Dashboard Filters & Controls
- Pinned filters apply across all panels on a dashboard.
- **Controls** (dropdown/range sliders) let dashboard viewers interactively filter without editing the underlying query — similar to Grafana template variables.

### Saved Searches & Sharing
- Discover searches can be saved and embedded into dashboards as a panel, or shared via a generated (optionally shortened) URL that encodes the query + time range + filters.

### Alerting (Kibana Alerting / SIEM detections)
- Kibana has its own alerting framework (rules based on ES queries, thresholds, or Elasticsearch anomaly detection jobs) — separate from, but conceptually similar to, Grafana Alerting/Prometheus Alertmanager.
- Connectors: Slack, email, PagerDuty, webhook, index (write alert as a document).

### Kibana Dev Tools Console
- Built-in raw Elasticsearch API console (`Dev Tools → Console`) for running queries/mappings directly — the fastest way to prototype an Elasticsearch query before wiring it into a visualization.

---

## 3. Advanced

### Index Management UI
- Stack Management → Index Management: view shard/replica health, manually roll over indices, trigger force-merge, and manage ILM policies (see elasticsearch.md) without the raw API.

### Kibana Spaces
- Partition dashboards/saved objects/index patterns into isolated **Spaces** (e.g., per team) within a single Kibana instance — combined with role-based access control for multi-tenant setups.

### Saved Objects & Migration
- Dashboards, visualizations, index patterns, and alerts are all **saved objects** stored in a hidden Elasticsearch index.
- Export/import saved objects as NDJSON for moving dashboards between environments (dev → staging → prod) — the Kibana equivalent of "dashboards as code" (pair with version control of the exported NDJSON files, or use Terraform's Elastic Stack provider for stricter IaC).

### Machine Learning Jobs (X-Pack)
- Anomaly detection jobs learn a baseline for a metric (e.g., request count) and flag deviations automatically — useful where static thresholds don't fit (seasonal/cyclical traffic).
- Population analysis: detect unusual behavior of one entity (e.g., one user, one host) relative to its peer group.

### Kibana + SIEM / Security
- Elastic Security app (built into Kibana) provides detection rules, timeline investigation, and case management on top of security-relevant log data — common in SOC/blue-team workflows.

### Performance & Scaling Considerations
- Kibana itself is mostly stateless (except saved objects in ES) — scale horizontally behind a load balancer for high user concurrency.
- Expensive dashboards (many panels, wide time ranges, high-cardinality terms aggregations) push load onto Elasticsearch, not Kibana — the same ES sizing/ILM/shard concerns from elasticsearch.md apply directly to keeping dashboards fast.
- Use `Data Views` field limits and avoid `*` wildcard field selection at scale — mapping explosions ("field count exceeded") happen when many differently-shaped documents land in the same dynamically-mapped index.

---

## Quick Revision — Kibana
- UI layer on Elasticsearch: Discover (search), Visualize/Lens (charts), Dashboard (compose).
- Data View defines which indices + which time field Kibana queries.
- KQL for quick search syntax; Dev Tools Console for raw ES DSL prototyping.
- Kibana Alerting = rule-based alerting on ES queries/ML jobs, with connectors to Slack/PagerDuty/etc.
- Spaces + saved-object export/import for multi-tenant and promote-across-environments workflows.
- ML jobs give anomaly detection without hand-tuned static thresholds.
