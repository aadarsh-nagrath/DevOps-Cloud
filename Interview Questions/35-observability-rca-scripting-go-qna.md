# Observability, RCA & Automation (OpenTelemetry, Alerting, Production Troubleshooting, Shell, Python, Go) — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Gap-fill for the "monitoring, troubleshooting and automation" round. Basics are in [11 Monitoring](./11-monitoring-logging-observability-qna.md), [13 SRE/Incidents](./13-sre-incident-loadbalancing-servicemesh-qna.md), [18 Scripting Challenges](./18-practical-scripting-challenges-qna.md), [15 Python](./15-python-for-devops-qna.md) and [28 Production Scenarios](./28-production-scenarios-rapid-round-qna.md). This file covers OpenTelemetry internals, Alertmanager, how to run an RCA, and Go, which the rest of the hub barely touches.

---

## Table of Contents
- [OpenTelemetry](#opentelemetry)
- [Alerting & Alertmanager](#alerting--alertmanager)
- [Production Troubleshooting](#production-troubleshooting)
- [RCA & Postmortems](#rca--postmortems)
- [Shell Scripting: Advanced](#shell-scripting-advanced)
- [Python Automation: Extra](#python-automation-extra)
- [Go for DevOps](#go-for-devops)

---

## OpenTelemetry

### 1. What is OpenTelemetry, and what are its components?
OpenTelemetry (OTel) is the CNCF's vendor-neutral standard for producing and shipping **traces, metrics and logs** (profiles are being added). You instrument once and send the data to any backend: Jaeger or Tempo, Prometheus or Mimir, Loki or Elastic, Datadog, New Relic, and so on, without re-instrumenting when you switch vendors. Components:
- **API**: what application code calls (create a span, record a metric).
- **SDK**: the implementation per language (sampling, batching, exporters).
- **Instrumentation libraries and auto-instrumentation**: ready-made instrumentation for HTTP servers and clients, gRPC, DB drivers, Kafka, and more. Java, .NET, Python and Node can be instrumented with **zero code changes** (the Java agent, or the OTel Operator injecting it into pods).
- **OTLP**: the wire protocol (gRPC on 4317, HTTP on 4318).
- **Collector**: a separate process that receives, processes and exports telemetry.
- **Semantic conventions**: standard attribute names (`http.request.method`, `http.response.status_code`, `service.name`, `k8s.pod.name`) so data from different services and languages correlates.

### 2. Walk through an OTel Collector pipeline config.
A collector is built from **receivers** (inputs), **processors** (transform, filter, batch) and **exporters** (outputs), connected in **pipelines** per signal type.

```yaml
receivers:
  otlp:
    protocols: { grpc: { endpoint: 0.0.0.0:4317 }, http: { endpoint: 0.0.0.0:4318 } }
  prometheus:                      # can also scrape Prometheus targets
    config: { scrape_configs: [{ job_name: node, static_configs: [{ targets: ["node-exporter:9100"] }] }] }

processors:
  memory_limiter: { check_interval: 1s, limit_percentage: 80, spike_limit_percentage: 20 }  # FIRST: protects the collector
  k8sattributes: {}                # adds pod, namespace, deployment to every signal
  resource:
    attributes: [{ key: deployment.environment, value: prod, action: upsert }]
  attributes/scrub:
    actions: [{ key: http.request.header.authorization, action: delete }]   # drop secrets/PII
  batch: {}                        # LAST before export: fewer, bigger requests

exporters:
  otlp/tempo:  { endpoint: tempo:4317, tls: { insecure: true } }
  prometheusremotewrite: { endpoint: http://mimir/api/v1/push }
  otlphttp/loki: { endpoint: http://loki:3100/otlp }

service:
  pipelines:
    traces:  { receivers: [otlp], processors: [memory_limiter, k8sattributes, resource, attributes/scrub, batch], exporters: [otlp/tempo] }
    metrics: { receivers: [otlp, prometheus], processors: [memory_limiter, k8sattributes, resource, batch], exporters: [prometheusremotewrite] }
    logs:    { receivers: [otlp], processors: [memory_limiter, k8sattributes, resource, batch], exporters: [otlphttp/loki] }
```
Processor order matters: `memory_limiter` first, `batch` last.

### 3. Agent vs gateway: how do you deploy collectors?
- **Agent**: a collector as a **DaemonSet** (one per node) or a sidecar. Apps send to the local node (cheap, low latency). The agent adds host and Kubernetes metadata, collects node logs (`filelog` receiver) and host metrics.
- **Gateway**: a central, horizontally scaled **Deployment** behind a load balancer. Agents forward to it. It handles cross-cutting work: tail sampling, PII scrubbing, routing to several backends, holding the backend credentials, and controlling egress to SaaS vendors.
The common production setup is **both**: agents on every node, then a gateway pool, then the backends. That way the vendor or backend config lives in one place.

### 4. Head-based vs tail-based sampling?
Tracing every request at high volume is expensive, so you sample:
- **Head sampling**: decided at the *start* of the trace (e.g. `parentbased_traceidratio` at 10%), and the decision travels with the context. It's cheap and simple, but blind: it drops 90% of **errors and slow requests** too.
- **Tail sampling**: decided *after* the trace completes, in the collector's `tail_sampling` processor. Example policy: keep 100% of traces with errors, 100% of traces slower than 2s, and 5% of everything else. You keep the interesting traces at much lower cost.
- The catch with tail sampling: **all spans of a trace must reach the same collector instance**. Put a **`loadbalancing` exporter** (routing by trace ID) in front of the tail-sampling tier. It also needs memory to buffer traces while waiting (`decision_wait`).

```yaml
processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - { name: errors, type: status_code, status_code: { status_codes: [ERROR] } }
      - { name: slow,   type: latency,     latency: { threshold_ms: 2000 } }
      - { name: rest,   type: probabilistic, probabilistic: { sampling_percentage: 5 } }
```

### 5. How does context propagation work, and why do traces sometimes break into pieces?
Each service passes the trace context to the next in a header, by default the **W3C `traceparent`** (`00-<trace-id>-<parent-span-id>-<flags>`), plus `tracestate` and optional **baggage** (key-value pairs that travel with the request, like `tenant_id`). The receiving service continues the same trace with its own span. Traces break, showing up as separate root spans, when:
- A hop isn't instrumented, or a proxy, gateway or legacy service **drops unknown headers**.
- Services use different propagators (B3 vs W3C). Configure the composite `tracecontext,baggage,b3`.
- **Async boundaries**: messages through Kafka or MQ need the context injected into message headers and extracted by the consumer (span links for batch consumers).
- Thread pools or async code lose the context in-process (use the SDK's context-aware executors).

### 6. How do you correlate metrics, logs and traces during an incident?
- **Same resource attributes** on all three signals (`service.name`, `deployment.environment`, `k8s.pod.name`), which the k8sattributes and resource processors guarantee.
- **Trace ID in every log line**: OTel log bridges or the logging MDC add `trace_id` and `span_id`. Grafana can then link a Loki log line to the Tempo trace.
- **Exemplars**: histogram metrics carry sample trace IDs, so on a latency graph you click a slow point and jump straight to a trace from that moment.
- The incident flow is then: an alert on an SLO metric → the dashboard shows which endpoint is slow → an exemplar opens a slow trace → the trace shows which downstream span is slow → the trace ID filters logs for that exact request.

### 7. How would you roll out OpenTelemetry to an existing estate of 100 services?
1. Deploy the **collector infrastructure** first (agent DaemonSet plus gateway), exporting to the current backends, so nothing changes for the teams.
2. Use the **OTel Operator** with auto-instrumentation (`Instrumentation` CR plus a pod annotation such as `instrumentation.opentelemetry.io/inject-java: "true"`) to get traces from most services with no code changes.
3. Standardize `service.name`, environment and version through the operator or resource detectors.
4. Have teams add **manual spans and business attributes** to critical paths (payment ID, customer tier, never PII).
5. Turn on tail sampling at the gateway once volume is known, and put cost and cardinality guardrails in place.
6. Move metrics gradually. Prometheus scraping can continue through the collector's prometheus receiver.
See also [20 Q16](./20-devops-roadmap-gap-fill-qna.md) and [28 Q16](./28-production-scenarios-rapid-round-qna.md).

---

## Alerting & Alertmanager

### 8. How does Prometheus alerting work end to end?
**Prometheus** evaluates alert rules (PromQL) on an interval. A rule whose condition stays true for the `for:` duration goes from `pending` to `firing`, and Prometheus sends it to **Alertmanager**. Alertmanager **deduplicates** (across HA Prometheus pairs), **groups**, **routes** to receivers (PagerDuty, Opsgenie, Slack, email, webhook), and applies **inhibitions** and **silences**.

```yaml
# Prometheus rule
groups:
- name: payments
  rules:
  - alert: PaymentsHighErrorRate
    expr: |
      sum(rate(http_server_request_duration_seconds_count{service="payments",http_response_status_code=~"5.."}[5m]))
        / sum(rate(http_server_request_duration_seconds_count{service="payments"}[5m])) > 0.02
    for: 5m
    labels: { severity: critical, team: payments }
    annotations:
      summary: "Payments 5xx above 2% for 5m (now {{ $value | humanizePercentage }})"
      runbook_url: https://wiki.corp/runbooks/payments-5xx
      dashboard: https://grafana.corp/d/payments
```

### 9. Explain Alertmanager routing, grouping, inhibition and silences.
```yaml
route:
  receiver: default-slack
  group_by: [alertname, cluster, service]   # one notification per group, not per pod
  group_wait: 30s        # wait to batch the first alerts of a new group
  group_interval: 5m     # wait before sending new alerts added to an existing group
  repeat_interval: 4h    # re-notify if still firing
  routes:
  - matchers: [severity="critical"]
    receiver: pagerduty-oncall
    continue: true       # also keep evaluating sibling routes
  - matchers: [team="payments"]
    receiver: payments-slack

inhibit_rules:
- source_matchers: [alertname="ClusterDown"]
  target_matchers: [severity=~"warning|critical"]
  equal: [cluster]       # if the cluster is down, mute every other alert from that cluster
```
- **Routing**: a tree. The first matching child route wins unless `continue: true` is set.
- **Grouping**: collapses 200 "pod down" alerts into one page.
- **Inhibition**: suppresses symptom alerts while a root-cause alert is firing (a node down mutes its pods' alerts).
- **Silences**: time-boxed muting for maintenance windows (`amtool silence add ...`), always with a comment and an owner.
Run Alertmanager as a cluster of 3 for HA. It gossips so a notification isn't sent twice.

### 10. What makes a good alert?
- **Alert on symptoms users feel** (error rate, latency, SLO burn rate, no successful transactions), not on causes (CPU at 80%). Causes go on dashboards or become low-priority tickets.
- **Every page is actionable and urgent.** If nobody needs to act now, it's a ticket or nothing.
- Every alert has a **runbook link**, an owner (team label) and a dashboard link.
- Use `for:` and burn-rate windows to avoid flapping. Use multi-window, multi-burn-rate SLO alerts (see [20 Q17](./20-devops-roadmap-gap-fill-qna.md)).
- Severity levels map to response: critical means page any time, warning means business hours, info means no notification.
- **Review alerts regularly.** Delete or fix any alert that fired without anyone taking action. Track pages per on-call shift.
- Add a **Watchdog / dead man's switch**: an always-firing alert sent to an external service that pages if it *stops* arriving, which catches the monitoring system itself being broken.
See [11 Q21](./11-monitoring-logging-observability-qna.md).

### 11. How do you test alert rules before they reach production?
`promtool check rules rules.yaml` in CI for syntax, and **`promtool test rules`** with unit tests that feed synthetic series and assert which alerts fire at which time:

```yaml
# tests.yaml
rule_files: [rules.yaml]
tests:
- interval: 1m
  input_series:
  - series: 'up{job="payments"}'
    values: '1 1 0 0 0 0 0 0'
  alert_rule_test:
  - eval_time: 7m
    alertname: PaymentsDown
    exp_alerts: [{ exp_labels: { job: payments, severity: critical } }]
```
Also run `amtool check-config` for Alertmanager, and occasionally do a real end-to-end test: fire a test alert in staging and confirm the page arrives.

### 12. What are the RED and USE methods?
- **RED** (for request-driven *services*): **R**ate (requests/sec), **E**rrors (failed requests/sec), **D**uration (latency distribution, p50/p95/p99). Every service dashboard starts with these three.
- **USE** (for *resources*: CPU, memory, disk, network, connection pools): **U**tilization (% busy), **S**aturation (queued work, such as run queue, swap or connection-pool waits), **E**rrors.
- Google SRE's **four golden signals** are latency, traffic, errors and saturation: RED plus saturation.
RED tells you *that* users are hurting. USE tells you *which resource* is the bottleneck.

---

## Production Troubleshooting

### 13. What's your general approach to a production issue?
1. **Assess impact first**: who's affected, how badly and since when. That decides severity and whether to open an incident (an IC, a comms channel, status page).
2. **Mitigate before you diagnose**: if a deploy went out just before, **roll back**. Fail over, scale up, or toggle a feature flag. Restore service first, find the root cause later.
3. **Ask what changed**: deploys, config, infrastructure, certificates, traffic patterns, dependencies, cron jobs. Most incidents come from a change.
4. **Narrow down from the symptom**: RED on the user-facing service → traces to find the slow or failing hop → USE on that component's resources → logs for the specific error.
5. **Form a hypothesis and test it**, one change at a time, and record every action with a timestamp in the incident channel.
6. **Confirm the fix** with the same metrics that showed the problem, then hand over to the RCA.

### 14. Latency p99 jumped from 200 ms to 3 s after a deploy, but averages look fine. How do you investigate?
A p99 jump with a flat average means **a subset** of requests is slow: a specific endpoint, a tenant, a pod or a code path.
- **Roll back** if the timing clearly matches the deploy, then investigate calmly.
- Split p99 by **endpoint, pod, node and AZ**. One bad pod or node (noisy neighbour, CPU throttling) is common: check `container_cpu_cfs_throttled_periods_total`, because CPU limits throttle even at low average CPU.
- Open **exemplars or slow traces** to find which span got slow: a new DB query without an index, an N+1 query pattern, an added synchronous call to another service, or a retry storm.
- **Connection pools**: the DB or HTTP client pool is exhausted, so requests wait for a connection. Look at pool wait-time metrics.
- **GC pauses** (JVM): a new memory pattern causing long GC. Check GC logs and the heap.
- **DNS**: Kubernetes `ndots:5` causes several lookups per external hostname. A slow upstream resolver or a CoreDNS overload adds latency to every external call.

### 15. Pods keep getting OOMKilled. How do you debug and fix it?
```bash
kubectl describe pod <pod> | grep -A5 "Last State"   # Reason: OOMKilled, Exit Code 137
kubectl top pod <pod> --containers
```
- **Exit code 137 with OOMKilled** means the container passed its **memory limit** and the kernel cgroup OOM killer killed it. If the node itself ran out of memory, you'll see evictions instead.
- Is it a **leak** (memory climbs steadily until it's killed, a sawtooth over hours) or an **undersized limit** (spikes on certain requests or batch jobs)? Check `container_memory_working_set_bytes` over time.
- **JVM**: the heap must fit inside the limit with room for metaspace, threads and off-heap memory. Use `-XX:MaxRAMPercentage=75` instead of a fixed `-Xmx` that ignores the container limit.
- Fix: set memory request equal to limit for critical services, based on real usage plus headroom; take heap dumps or profiles for leaks (`-XX:+HeapDumpOnOutOfMemoryError` to a volume); and rely on a VPA in recommendation mode for sizing.

### 16. An application intermittently can't connect to the database. How do you approach it?
Intermittent failures usually mean a limit or a single bad member, not a broken config:
- **Errors are the clue**: "connection refused" vs "timeout" vs "too many connections" vs DNS failures point in different directions.
- **DB max connections reached**: app replicas × pool size can exceed the DB limit after scaling out. Use a pooler (PgBouncer, RDS Proxy) and right-size the pools.
- **One bad target**: a single DB replica, one DNS answer or one AZ failing. Correlate errors with which host was resolved.
- **Firewall or NAT idle timeouts** drop long-idle pooled connections silently, and the next query on that connection hangs. Configure TCP keepalive and pool `maxLifetime`/idle validation shorter than the firewall timeout. This is very common in banks with stateful firewalls between zones.
- **NAT gateway port exhaustion** or **conntrack table full** on nodes (`dmesg`: `nf_conntrack: table full`).
- **Credential rotation**: some pods still have the old password.

### 17. A cron or batch job that runs fine in UAT fails in production at month-end. What do you check?
Data volume (memory or time limits hit, `activeDeadlineSeconds`), DB locks against daytime OLTP traffic, missed or overlapping schedules (`concurrencyPolicy: Forbid`, `startingDeadlineSeconds` in a Kubernetes CronJob), timezone differences (the CronJob `timeZone` field; servers on UTC vs IST), dependency availability at that time (a partner SFTP host, a file not delivered yet), and a disk filling with intermediate files. Make batch jobs **idempotent and restartable** (checkpointing), monitor completion with a "job did not succeed by 06:00" alert (an absence alert), and keep logs after the pod is gone.

---

## RCA & Postmortems

### 18. What is an RCA, and what does a good one contain?
A **Root Cause Analysis** (often written up as a **postmortem**) explains why an incident happened and what will stop it happening again. It's **blameless**: it focuses on systems and processes, not on who made the mistake. Typical sections:
1. **Summary**: what happened, in 3–4 lines.
2. **Impact**: duration, users and transactions affected, SLO budget used, financial or regulatory impact.
3. **Timeline** (with timestamps): first trigger, detection (and *how*: an alert or a customer call?), escalation, mitigation, resolution.
4. **Root cause and contributing factors**: there's rarely just one cause.
5. **Detection and response analysis**: what went well, what went badly, where we got lucky.
6. **Action items**: specific, each with an **owner and a due date**, ranked by priority, and split into *prevent*, *detect faster* and *mitigate faster*.
7. Supporting graphs and log excerpts.
Action items get tracked to closure. An RCA whose actions never close is wasted.

### 19. Walk through the "5 Whys" with an example.
Keep asking *why* until you reach a process or system cause you can fix:
- Payments failed for 40 minutes. **Why?** The payments service couldn't connect to the database.
- **Why?** The DB's TLS certificate expired.
- **Why wasn't it renewed?** It was renewed by hand every year by an engineer who has since left.
- **Why didn't monitoring catch it?** Certificate-expiry monitoring only covered public endpoints, not internal ones.
- **Why?** There's no inventory of internal certificates, so nobody knew this one existed.
**Root causes**: manual renewal with no inventory, and a gap in monitoring. **Actions**: put the cert on cert-manager or Vault PKI with auto-renewal (owner, date); add blackbox expiry probes for every internal TLS endpoint with alerts at 30/14/7 days; build a certificate inventory; add a cert-rotation check to the offboarding runbook.
Note that "the engineer forgot" is **never** a root cause. Ask why the system relied on someone remembering. For complex incidents, a fishbone (Ishikawa) diagram helps capture several contributing factors (people, process, tooling, environment).

### 20. Tell me about an RCA you led. (Sample STAR answer)
> **Situation:** After a routine release, our internet-banking API had intermittent 504s for about 25 minutes during peak hours. Roughly 8% of login requests failed.
>
> **Task:** I was the on-call DevOps engineer, so I ran the incident and then led the RCA.
>
> **Action:** I rolled back the release first. Errors dropped immediately, which confirmed the change was involved. Traces then showed the new version called the customer-profile service synchronously on every login, and that service's connection pool to Oracle was saturated, so requests queued until the gateway timed out at 30s. Two contributing factors: load tests ran with 10% of production data, so the extra query looked cheap; and our alerting only fired on the gateway's 5xx rate, about 9 minutes after the impact began. I wrote a blameless postmortem with a timeline built from Grafana, Tempo and the Argo CD sync history.
>
> **Result:** Actions: made the profile call asynchronous and cached; added a pool-saturation alert and a login-success SLO burn-rate alert, which cut detection time to under 2 minutes in a later drill; ran load tests on a production-sized data snapshot; and made canary analysis on login latency a release gate. There were no repeat incidents of that class in the following two quarters.

Adapt it to a real incident of your own, and keep the numbers (impact, detection time, results).

---

## Shell Scripting: Advanced

### 21. What does `set -euo pipefail` do, and what are its gotchas?
- `-e`: exit when a command fails.
- `-u`: an undefined variable is an error, so `rm -rf "$DIR/"` with `DIR` unset can't turn into `rm -rf /`.
- `-o pipefail`: a pipeline fails if *any* command in it fails, not just the last one (`curl ... | jq` otherwise hides a curl failure).
Gotchas: `-e` is **ignored** in `if` conditions, `&&`/`||` chains and inside functions called from them. `cmd || true` is the explicit way to allow a failure. `grep` returns 1 when nothing matches, which kills the script under `-e`. Use `${VAR:-default}` with `-u` for optional variables. Always add a `trap` so you get context on failure and clean up.

### 22. Write a robust script template with argument parsing, logging, cleanup and locking.
```bash
#!/usr/bin/env bash
# Usage: ./backup_db.sh -d <database> [-r <retention_days>] [-n]   (-n = dry run)
set -euo pipefail

log()  { printf '%s [%s] %s\n' "$(date '+%F %T')" "$1" "${*:2}" >&2; }
die()  { log ERROR "$*"; exit 1; }

DB="" RETENTION=7 DRY_RUN=false
while getopts ":d:r:nh" opt; do
  case $opt in
    d) DB=$OPTARG ;;
    r) RETENTION=$OPTARG ;;
    n) DRY_RUN=true ;;
    h) sed -n '2p' "$0"; exit 0 ;;
    *) die "invalid option -$OPTARG" ;;
  esac
done
[[ -n $DB ]] || die "-d <database> is required"
[[ $RETENTION =~ ^[0-9]+$ ]] || die "retention must be a number"

# Single instance: a second run exits instead of overlapping (cron safety)
exec 9>"/var/lock/backup_${DB}.lock"
flock -n 9 || die "another backup of $DB is running"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
trap 'die "failed at line $LINENO"' ERR

BACKUP_DIR=/backups/$DB
OUT="$BACKUP_DIR/${DB}_$(date +%F_%H%M).sql.gz"
mkdir -p "$BACKUP_DIR"

log INFO "dumping $DB"
if ! $DRY_RUN; then
  pg_dump "$DB" | gzip > "$TMP/dump.sql.gz"
  gzip -t "$TMP/dump.sql.gz"                     # verify before keeping it
  mv "$TMP/dump.sql.gz" "$OUT"
fi
log INFO "pruning backups older than $RETENTION days"
if $DRY_RUN; then
  find "$BACKUP_DIR" -name "${DB}_*.sql.gz" -mtime +"$RETENTION" -print
else
  find "$BACKUP_DIR" -name "${DB}_*.sql.gz" -mtime +"$RETENTION" -print -delete
fi
log INFO "done: $OUT"
```
Point out in the interview: input validation, `flock` against overlapping cron runs, `mktemp` plus `trap` for cleanup, verifying the backup before rotating old ones, a dry-run mode, and logging to stderr with timestamps. Run `shellcheck` in CI on every script.

### 23. Write a retry-with-backoff function.
```bash
retry() {  # retry <attempts> <cmd...>
  local n=$1 delay=2 i; shift
  for ((i=1; i<=n; i++)); do
    "$@" && return 0
    (( i < n )) && { echo "attempt $i/$n failed, retrying in ${delay}s" >&2; sleep "$delay"; delay=$((delay*2)); }
  done
  echo "command failed after $n attempts: $*" >&2; return 1
}
retry 5 curl -fsS --max-time 10 https://api.corp.local/healthz
```

### 24. Parse an nginx access log: top 10 client IPs, 5xx count per endpoint, and requests per minute.
```bash
LOG=/var/log/nginx/access.log   # combined format: $1=IP, $4=[time, $7=path, $9=status

awk '{print $1}' "$LOG" | sort | uniq -c | sort -rn | head -10              # top IPs

awk '$9 ~ /^5/ {split($7,p,"?"); print p[1]}' "$LOG" | sort | uniq -c | sort -rn | head   # 5xx per path (query string stripped)

awk '{print substr($4,2,17)}' "$LOG" | uniq -c | tail -15                  # requests per minute (dd/Mon/yyyy:HH:MM)

# Only the last 10 minutes of a live log, without reading the whole file:
tail -n 200000 "$LOG" | awk -v since="$(date -d '10 min ago' '+%d/%b/%Y:%H:%M')" 'substr($4,2,17) >= since && $9 ~ /^5/' | wc -l
```

### 25. Run a command across many servers in parallel, safely.
```bash
# hosts.txt: one host per line. 10 at a time, 5s connect timeout, results tagged by host.
xargs -a hosts.txt -P 10 -I{} sh -c \
  'ssh -o BatchMode=yes -o ConnectTimeout=5 {} "uptime; df -h / | tail -1" 2>&1 | sed "s/^/{}: /"' > results.txt
grep -i -E "denied|timed out|refused" results.txt   # find failures
```
For anything that changes state across a fleet, use **Ansible** (idempotent, `serial`, `--check` mode, inventory, logs) rather than SSH loops. Use the loop for read-only checks.

---

## Python Automation: Extra

### 26. Write a Python script that finds unencrypted EBS volumes and untagged EC2 instances across all regions.
```python
#!/usr/bin/env python3
"""Report unencrypted EBS volumes and EC2 instances missing an 'owner' tag in every region."""
import boto3

def regions():
    return [r["RegionName"] for r in boto3.client("ec2").describe_regions()["Regions"]]

def audit(region):
    ec2 = boto3.client("ec2", region_name=region)
    findings = []
    for page in ec2.get_paginator("describe_volumes").paginate(
            Filters=[{"Name": "encrypted", "Values": ["false"]}]):
        findings += [f"{region} unencrypted-volume {v['VolumeId']}" for v in page["Volumes"]]
    for page in ec2.get_paginator("describe_instances").paginate():
        for res in page["Reservations"]:
            for i in res["Instances"]:
                tags = {t["Key"]: t["Value"] for t in i.get("Tags", [])}
                if "owner" not in tags:
                    findings.append(f"{region} untagged-instance {i['InstanceId']}")
    return findings

if __name__ == "__main__":
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=8) as pool:      # API calls are I/O-bound, so threads help
        for findings in pool.map(audit, regions()):
            for line in findings:
                print(line)
```
Points to mention: **paginators** (calls without them silently return only the first page), threads for I/O-bound API calls across regions, credentials from the environment or role (never hardcoded), and reporting only. Remediation goes in a separate, reviewed step, or better, an AWS Config rule.

### 27. Use the Kubernetes Python client to find pods restarting too often.
```python
import os
from kubernetes import client, config

if os.getenv("KUBERNETES_SERVICE_HOST"):
    config.load_incluster_config()   # running as a pod
else:
    config.load_kube_config()        # running from a laptop
v1 = client.CoreV1Api()

for pod in v1.list_pod_for_all_namespaces(watch=False).items:
    for cs in pod.status.container_statuses or []:
        if cs.restart_count >= 5:
            reason = cs.last_state.terminated.reason if cs.last_state and cs.last_state.terminated else "-"
            print(f"{pod.metadata.namespace}/{pod.metadata.name} {cs.name} restarts={cs.restart_count} last={reason}")
```
Run in-cluster as a CronJob with a ServiceAccount whose RBAC only allows `list` on `pods`.

---

## Go for DevOps

### 28. Why is Go so common in DevOps and cloud-native tooling?
Kubernetes, Docker/containerd, Terraform, Prometheus, Helm, Argo CD, Vault, etcd and most operators are written in Go, because:
- **One static binary** with no runtime or dependencies to install. Copy it into a `FROM scratch` or distroless image and run it. Cross-compiling is trivial: `GOOS=linux GOARCH=arm64 go build`.
- **Concurrency built into the language** (goroutines and channels) suits tools that talk to many APIs and hosts at once.
- **Fast compilation and fast execution**, a small memory footprint, garbage collection, and static typing that catches errors at compile time.
- A strong standard library (`net/http`, `encoding/json`, `crypto/tls`, `os/exec`) and **client-go** for Kubernetes.
Rule of thumb: Bash for glue under about 50 lines, Python for scripts and automation with lots of libraries, Go for long-running services, CLIs you distribute to others, Kubernetes controllers, and anything that needs high concurrency.

### 29. Explain goroutines, channels and `sync.WaitGroup`.
- A **goroutine** is a lightweight thread managed by the Go runtime, started with `go f()`. It costs a few KB of stack, so thousands are fine.
- A **channel** is a typed pipe between goroutines (`ch := make(chan string)`). Sending and receiving synchronize them: "share memory by communicating".
- A **`sync.WaitGroup`** waits for a set of goroutines to finish (`Add`, `Done`, `Wait`). A **`sync.Mutex`** protects shared state when you need it.
- **`context.Context`** carries cancellation and deadlines, so a timeout or Ctrl-C stops all in-flight work cleanly.

### 30. Write a concurrent HTTP health checker in Go.
```go
// healthcheck.go — check many URLs concurrently with a timeout; exit 1 if any are unhealthy.
// Usage: go run healthcheck.go https://a.corp/healthz https://b.corp/healthz
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"
)

type result struct {
	url     string
	status  int
	latency time.Duration
	err     error
}

func check(ctx context.Context, client *http.Client, url string) result {
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return result{url: url, err: err}
	}
	resp, err := client.Do(req)
	if err != nil {
		return result{url: url, err: err, latency: time.Since(start)}
	}
	defer resp.Body.Close()
	return result{url: url, status: resp.StatusCode, latency: time.Since(start)}
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second) // overall deadline
	defer cancel()
	client := &http.Client{Timeout: 5 * time.Second}                          // per-request timeout

	results := make(chan result)
	var wg sync.WaitGroup
	for _, url := range os.Args[1:] {
		wg.Add(1)
		go func(u string) {
			defer wg.Done()
			results <- check(ctx, client, u)
		}(url)
	}
	go func() { wg.Wait(); close(results) }() // close once all checks finish

	failed := 0
	for r := range results {
		switch {
		case r.err != nil:
			failed++
			fmt.Printf("DOWN %s error=%v\n", r.url, r.err)
		case r.status >= 400:
			failed++
			fmt.Printf("DOWN %s status=%d latency=%s\n", r.url, r.status, r.latency)
		default:
			fmt.Printf("UP   %s status=%d latency=%s\n", r.url, r.status, r.latency)
		}
	}
	if failed > 0 {
		os.Exit(1)
	}
}
```
Points to mention: goroutine fan-out with results collected over a channel, the WaitGroup closing the channel so the `range` loop ends, both per-request and overall timeouts, `defer resp.Body.Close()` (forgetting it leaks connections), and a non-zero exit code so cron or CI can act on it. Build a static binary with `CGO_ENABLED=0 go build -o healthcheck`.

### 31. How does error handling work in Go, compared with exceptions?
Go has no exceptions for normal failures. Functions return an `error` as the last value, and the caller checks it right away:
```go
cfg, err := os.ReadFile(path)
if err != nil {
    return fmt.Errorf("reading config %s: %w", path, err)   // %w wraps the error, keeping the cause
}
// later: errors.Is(err, fs.ErrNotExist), errors.As(err, &target)
```
It's verbose, but every failure path is visible in the code. That's one reason Go tools are predictable in production. `panic` is only for truly unrecoverable programmer errors. Also worth knowing: `defer` for cleanup (runs when the function returns, in LIFO order), **interfaces** (implemented implicitly, so you can swap in a fake AWS client for tests), and **modules** (`go.mod`, `go mod tidy`, versions pinned in `go.sum`).

### 32. What is a Kubernetes operator or controller, and how would you write one in Go?
A **controller** runs a **reconcile loop**: it watches resources, compares the *desired* state (spec) with the *actual* state, and acts to close the gap, over and over. An **operator** is a controller plus a **CRD** that encodes operational knowledge for an application (e.g. a `PostgresCluster` kind that handles provisioning, failover, backups and upgrades).
To write one: scaffold with **Kubebuilder** or Operator SDK (built on **controller-runtime** and **client-go**), define the CRD types in Go, and implement `Reconcile(ctx, req)`:
1. Fetch the custom resource. If it's gone, return (owned objects get garbage-collected through owner references).
2. Build the desired child objects (Deployment, Service, Secret) and create or update them, with owner references.
3. Update `.status` with conditions.
4. Return `ctrl.Result{RequeueAfter: ...}` for periodic checks. Return an error to retry with backoff.
Rules: reconcile must be **idempotent** (it can run any number of times for the same state), level-based rather than edge-based (don't assume you saw every event), and use **finalizers** for external cleanup (delete the cloud resource before the CR disappears). Informers and caches keep it from hammering the API server.

### 33. Bash vs Python vs Go: how do you choose for an automation task?
- **Bash**: gluing CLI tools together, short and mostly linear, running where only a shell exists (bootstrap scripts, init containers, CI steps). Once it needs data structures, JSON handling beyond `jq`, or error handling with more than a few branches, move to Python.
- **Python**: most automation. Cloud SDKs (boto3, azure-sdk), API integrations, data parsing and reports, Ansible modules, Lambda functions. Fast to write, with a huge library ecosystem. Distribution is the weak point (virtualenvs, dependencies).
- **Go**: long-running daemons, CLIs you hand to 200 engineers (one binary), Kubernetes controllers and operators, high-concurrency tools (scanning 10,000 endpoints), and anything performance-sensitive.
The interview answer: "I choose based on lifetime, who has to maintain it, and how it's distributed, not personal preference. And I'd look for an existing tool or Terraform provider before writing anything." See [15 Q21](./15-python-for-devops-qna.md).
