# Grafana — Complete Notes

## 1. Beginner

### What is Grafana?
- Open-source **visualization and dashboarding** platform. Grafana itself stores no metrics/logs — it queries external **data sources** and renders panels.
- Supports Prometheus, Elasticsearch, Loki, InfluxDB, CloudWatch, MySQL/Postgres, Datadog, and dozens more via plugins.

### Core Concepts
- **Data Source**: connection config to a backend (e.g., a Prometheus server URL).
- **Dashboard**: a collection of panels arranged on a grid.
- **Panel**: single visualization (graph, table, gauge, stat, heatmap, logs panel).
- **Query**: data-source-specific query embedded in a panel (PromQL, Lucene/DSL, SQL, LogQL...).
- **Variable/Template**: dashboard-level dropdown (e.g., `$environment`, `$pod`) that dynamically filters queries — makes one dashboard reusable across many services.

### Installing / Running (quick)
```bash
# Docker
docker run -d -p 3000:3000 --name=grafana grafana/grafana-oss

# Default login: admin / admin (forced change on first login)
```

### Adding a Data Source (Prometheus example)
Configuration → Data Sources → Add → Prometheus → URL: `http://prometheus:9090` → Save & Test.

### Basic Panel Types
- **Time series** — the default graph panel.
- **Stat** — single big number (e.g., current error rate).
- **Gauge** — value against thresholds (green/yellow/red).
- **Table** — raw tabular query results.
- **Logs** — for Loki/Elasticsearch log data.
- **Heatmap** — good for histogram/latency-bucket data.

---

## 2. Intermediate

### Dashboard Variables
```
Name: instance
Type: Query
Data source: Prometheus
Query: label_values(up, instance)
```
Used in a panel query as `up{instance="$instance"}`. Supports multi-select and "All" option.

### Templating with Regex/Chained Variables
- Variables can depend on each other: `$environment` filters which `$service` values are shown, which filters `$instance`.

### Alerting in Grafana (Unified Alerting)
- Grafana has its own alerting engine (separate from Prometheus Alertmanager, though it can also route through Alertmanager).
- Define an alert rule directly on a panel's query with a threshold condition, evaluation interval, and `for` duration (like Prometheus).
- **Contact points**: Slack, PagerDuty, email, webhook, Opsgenie.
- **Notification policies**: routing tree similar to Alertmanager (route by label matchers).
- **Silences & mute timings**: temporarily suppress alerts (maintenance windows).

### Annotations
- Mark events on graphs (deployments, incidents) either manually, via API, or automatically (e.g., annotate every CI/CD deploy) — critical for correlating "did this deploy cause that spike?"

### Dashboard as Code
- Dashboards can be exported/imported as JSON.
- **Grafonnet** (Jsonnet library) or **Grafana's Terraform provider** let you version-control dashboards instead of clicking in the UI — recommended for production.
```hcl
resource "grafana_dashboard" "example" {
  config_json = file("dashboards/api-overview.json")
}
```

### Folders & Permissions
- Dashboards organized into folders; RBAC applied per-folder or per-dashboard (viewer/editor/admin).
- **Organizations**: top-level tenant isolation within a single Grafana instance.

### Explore Mode
- Ad-hoc query builder for any data source, outside of a saved dashboard — used for live debugging/log tailing.

---

## 3. Advanced

### Grafana + Loki (Log Aggregation)
- Loki indexes only metadata **labels** (not full log text), keeping storage cheap; actual log lines are compressed in object storage.
- **LogQL** (Loki's query language) resembles PromQL:
```logql
{app="checkout", env="prod"} |= "error" | json | duration > 500ms
```
- Grafana can correlate a metric spike directly with logs from the same time window ("Explore" split view) and even derive metrics from logs (`count_over_time`).

### Grafana Tempo (Tracing)
- Trace storage backend, also queried via Grafana. Correlate trace → logs → metrics ("TraceQL", exemplars linking a Prometheus histogram bucket to a specific trace).

### Exemplars
- Prometheus histograms can attach a trace ID as an "exemplar" to a data point — Grafana renders this as a clickable dot on the graph, jumping straight into the trace in Tempo/Jaeger. This is the glue that ties the three pillars together.

### Mixed Data Source Queries
- A single panel can pull from multiple data sources simultaneously (e.g., overlay a deployment annotation from a SQL DB on top of a Prometheus graph).

### Provisioning (Infra-as-Code for Grafana itself)
```yaml
# provisioning/datasources/prometheus.yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    access: proxy
    isDefault: true
```
- Data sources, dashboards, alert rules, and notification policies can all be provisioned via config files mounted into the container — essential for reproducible GitOps-managed observability stacks.

### Performance at Scale
- Large dashboards with many panels/variables can hammer data sources — use query caching, limit default time ranges, and avoid `$__all` variable expansion against high-cardinality label sets.
- Grafana Enterprise / Grafana Cloud adds reporting, advanced RBAC, and SSO/LDAP at scale.

### High Availability
- Grafana OSS supports HA via a shared database backend (Postgres/MySQL) for multiple Grafana instances behind a load balancer; unified alerting requires additional HA config (`ha_peers`) to avoid duplicate alert notifications.

---

## Quick Revision — Grafana
- Grafana = visualization only; data lives in external data sources.
- Variables make dashboards reusable/dynamic.
- Unified Alerting = Grafana-native alert engine (rules, contact points, notification policies).
- Annotations correlate deploys/events with metric changes.
- Dashboards-as-code via JSON + Terraform provider for GitOps.
- Loki (logs, label-indexed) + Tempo (traces) + Prometheus (metrics), all queried and correlated through Grafana — exemplars link metrics to traces.
