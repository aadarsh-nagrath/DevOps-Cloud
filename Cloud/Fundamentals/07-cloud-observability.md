# Cloud Monitoring, Logging, Tracing & Alerting — Complete Notes

> Part of the [Cloud hub](../README.md). Deep dives: [`Monitoring and Loggin/`](../../Monitoring%20and%20Loggin), [Observability Q&A](../../Interview%20Questions/11-monitoring-logging-observability-qna.md).

---

## 1. Native tooling map
| Capability | AWS | Azure | GCP |
|---|---|---|---|
| Metrics + dashboards + alarms | **CloudWatch** Metrics/Dashboards/Alarms | **Azure Monitor** Metrics + Alerts (action groups) | **Cloud Monitoring** (alerting policies, uptime checks) |
| Logs | **CloudWatch Logs** (Logs Insights) | **Log Analytics** workspace (**KQL**) | **Cloud Logging** (Log Router, sinks, log buckets, Log Analytics) |
| APM / distributed tracing | **X-Ray** / CloudWatch Application Signals, ADOT (OpenTelemetry) | **Application Insights** (OpenTelemetry-based) | **Cloud Trace**, Cloud Profiler, Error Reporting |
| Managed Prometheus/Grafana | Amazon Managed Service for Prometheus / Managed Grafana | Azure Monitor managed Prometheus / Azure Managed Grafana | **Google Cloud Managed Service for Prometheus** |
| Audit of API calls | **CloudTrail** | **Activity Log** | **Cloud Audit Logs** |
| Network flow logs | VPC Flow Logs | VNet flow logs / Network Watcher | VPC Flow Logs, Firewall Rules Logging |
| Synthetic monitoring | CloudWatch Synthetics canaries | App Insights availability tests | Uptime checks / synthetic monitors |
| Platform health | AWS Health Dashboard | **Azure Service Health** / Resource Health | Personalized Service Health |
| Recommendations | Trusted Advisor, Compute Optimizer | **Azure Advisor** | Recommender / Active Assist |

Third-party/open: Prometheus + Grafana, Datadog, New Relic, Dynatrace, Elastic, Splunk, OpenTelemetry (vendor-neutral instrumentation — recommended default).

## 2. What to monitor (key metrics)
- **User-facing (RED / golden signals)**: request rate, error rate (5xx), latency p50/p95/p99, saturation.
- **Infrastructure (USE)**: CPU, memory, disk IOPS/throughput/queue, network, connection counts.
- **Platform**: LB healthy host count, 5xx from LB vs target, ASG desired vs in-service, DB connections/replica lag/deadlocks/free storage, queue depth/age of oldest message, Lambda errors/throttles/duration/concurrency, K8s pod restarts/pending pods.
- **Business**: orders/min, sign-ups, payment success.
- **Cost & security**: spend anomalies, root logins, IAM changes, SG opened to 0.0.0.0/0.

## 3. Alerting design
Alert on **symptoms** (SLO burn rate, error ratio) not every cause; page only for user impact, ticket for the rest; route via SNS / action groups / notification channels to PagerDuty/Opsgenie/Slack; include runbook links; avoid flapping with evaluation windows; dead-man's switch for missing data.

## 4. Logging practices
Structured JSON logs with correlation/trace IDs; centralize (one account/workspace/project for logs); retention tiers; log-based metrics; protect audit logs (separate account, immutable storage); control cost (drop debug logs, sampling, exclusion filters, cheaper log classes — CloudWatch Infrequent Access, Log Analytics Basic/Auxiliary logs, Cloud Logging exclusions).

## 5. Troubleshooting a performance/latency issue (method)
1. Confirm & scope: which endpoints/regions/users, since when, what changed (deploys, config, traffic)?
2. Golden-signal dashboards → isolate the tier (LB, app, DB, external dependency).
3. Distributed traces → find the slow span (DB query, downstream API, cold start).
4. Resource saturation → CPU/memory/IOPS/connection pool/thread pool/throttling (API limits, Lambda concurrency, DynamoDB throttles).
5. Network → cross-region calls, DNS, NAT gateway limits, packet loss.
6. Mitigate (scale out, roll back, cache, failover) → root cause → prevent (alert, test, capacity).
