# VPC, Terraform, Grafana, Linux Scenarios & Three-Round Loop — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. A combined question bank: AWS VPC basics, Terraform basics, Grafana, Linux production scenarios, and a three-round (Technical 1 → Technical 2 → Senior) DevOps loop. Questions already answered elsewhere in the hub are linked in the tables. Everything else is answered in full below, with an ID (e.g. **G-4**) you can find in the Table of Contents.

---

## Already answered elsewhere

### AWS VPC
| Question | Where |
|---|---|
| What is a VPC in AWS and why is it used? | [36 Q1](./36-aws-networking-deep-dive-qna.md), [07 Q7, Q34](./07-aws-cloud-qna.md) |
| What are subnets and types of subnets (public/private)? | [07 Q7](./07-aws-cloud-qna.md), [36 Q4–5](./36-aws-networking-deep-dive-qna.md) |
| Difference between a public and a private subnet? | [36 Q4](./36-aws-networking-deep-dive-qna.md) (public / private / isolated) |
| What is an Internet Gateway and how does it work? | [36 Q11](./36-aws-networking-deep-dive-qna.md), [07 Q18](./07-aws-cloud-qna.md) |
| What is a NAT Gateway and why is it used? | [36 Q12](./36-aws-networking-deep-dive-qna.md), [07 Q18](./07-aws-cloud-qna.md) |
| NAT Gateway vs NAT Instance? | [36 Q13](./36-aws-networking-deep-dive-qna.md) |
| What are route tables in a VPC? | [36 Q7–9](./36-aws-networking-deep-dive-qna.md), [07 Q34](./07-aws-cloud-qna.md) |
| How does routing work in a VPC? | [36 Q7](./36-aws-networking-deep-dive-qna.md) (longest-prefix match), packet walks in [36 Q15–17](./36-aws-networking-deep-dive-qna.md) |
| What are Security Groups and how do they work? | [07 Q8](./07-aws-cloud-qna.md), [36 Q18, Q20](./36-aws-networking-deep-dive-qna.md) |
| What are NACLs and how are they different from Security Groups? | [07 Q8](./07-aws-cloud-qna.md), [36 Q18–19](./36-aws-networking-deep-dive-qna.md) |
| What is VPC peering and how does it work? | [36 Q30, Q50](./36-aws-networking-deep-dive-qna.md), [07 Q26](./07-aws-cloud-qna.md) |
| What are VPC endpoints? | [36 Q26–28](./36-aws-networking-deep-dive-qna.md) |
| Interface Endpoint vs Gateway Endpoint? | [36 Q26](./36-aws-networking-deep-dive-qna.md) |
| How do instances in a private subnet access the internet? | [36 Q12, Q16](./36-aws-networking-deep-dive-qna.md) (packet walk), [36 Q48](./36-aws-networking-deep-dive-qna.md) (when it doesn't work) |
| How do you design a highly available VPC architecture? | [36 Q5, Q8](./36-aws-networking-deep-dive-qna.md), [07 Q23](./07-aws-cloud-qna.md) |
| What is a CIDR block in a VPC? | [36 Q2–3](./36-aws-networking-deep-dive-qna.md) |
| How do you troubleshoot connectivity issues in a VPC? | [36 Q43, Q48–54](./36-aws-networking-deep-dive-qna.md) |
| What is a VPC Flow Log? | [36 Q42](./36-aws-networking-deep-dive-qna.md) |
| What is Transit Gateway? | [36 Q31–32](./36-aws-networking-deep-dive-qna.md), [07 Q26](./07-aws-cloud-qna.md) |
| Best practices for VPC design? | Answered in [V-1](#vpc) below |

### Terraform
| Question | Where |
|---|---|
| What is Terraform and why is it used? | [06 Q2](./06-terraform-and-iac-qna.md) |
| What is Infrastructure as Code (IaC)? | [06 Q1, Q3](./06-terraform-and-iac-qna.md) |
| How does Terraform work internally? | [23-how Q8–9](./23-how-it-works-internals-qna.md) (DAG, locking), [06 Q17](./06-terraform-and-iac-qna.md) |
| What are providers in Terraform? | [06 Q6](./06-terraform-and-iac-qna.md), aliases in [33](./33-platform-engineering-deep-dive-qna.md) |
| What is a state file, and why is it important? | [06 Q5](./06-terraform-and-iac-qna.md) |
| `terraform plan` vs `apply`, and what is `terraform init`? | [06 Q4](./06-terraform-and-iac-qna.md) |
| What are modules, and how do you reuse code with them? | [06 Q9, Q21](./06-terraform-and-iac-qna.md), [31 Q10](./31-core-devops-scenarios-gap-fill-qna.md) |
| What is a remote backend, and why store state remotely? | [06 Q11](./06-terraform-and-iac-qna.md), [28 Q13](./28-production-scenarios-rapid-round-qna.md) |
| What is state locking? | [06 Q12–13](./06-terraform-and-iac-qna.md), [23-how Q9](./23-how-it-works-internals-qna.md) |
| `count` vs `for_each`? | [06 Q18](./06-terraform-and-iac-qna.md) |
| Variables and outputs? | [06 Q8](./06-terraform-and-iac-qna.md) |
| How do you manage secrets in Terraform? | [06 Q19](./06-terraform-and-iac-qna.md) |
| How do you provision AWS resources with Terraform? | [36 Q56](./36-aws-networking-deep-dive-qna.md) (three-tier VPC code), [29](./29-jenkins-k8s-helm-interview-rounds-qna.md) (EKS via Terraform) |
| How do you handle drift? | [06 Q20](./06-terraform-and-iac-qna.md), [28 Q14](./28-production-scenarios-rapid-round-qna.md) |
| Common issues with Terraform in production? | Answered in [TF-1](#terraform) below |
| Best practices for Terraform in AWS? | Answered in [TF-2](#terraform) below |

### Grafana
| Question | Where |
|---|---|
| What is Grafana and why is it used? | [11 Q5](./11-monitoring-logging-observability-qna.md) |
| How do you connect Prometheus to Grafana? | [11 Q18](./11-monitoring-logging-observability-qna.md). Provisioning file in [G-3](#grafana) |
| Grafana vs Prometheus? | [11 Q5](./11-monitoring-logging-observability-qna.md). Table in [G-8](#grafana) |
| Everything else in the Grafana list | Answered in [G-1 to G-16](#grafana) below |

### Linux
| Question | Where |
|---|---|
| Disk space mystery: deleted a huge log, space not freed / `df` 100% but `du` less | [34 Q7](./34-onprem-banking-infrastructure-qna.md) (`lsof +L1`, truncate via `/proc/<pid>/fd`), [13 Q26](./13-sre-incident-loadbalancing-servicemesh-qna.md) |
| Zombie process outbreak with high load average | [01 Q12](./01-linux-and-scripting-qna.md). The load-average twist is in [S-1](#linux-production-scenarios) |
| Port 8080 intermittent slowness (backlog, TCP drops, firewall) | [S-2](#linux-production-scenarios) below |
| Java service died, no stack trace: OOM killer? | [01 Q46](./01-linux-and-scripting-qna.md), full scenario in [S-3](#linux-production-scenarios) |
| `chmod -R 777 /` on a staging server | [S-4](#linux-production-scenarios) below |
| CPU suddenly at 100% | [13 Q23](./13-sre-incident-loadbalancing-servicemesh-qna.md), [28 Q01](./28-production-scenarios-rapid-round-qna.md) |
| High memory utilization on a production server | [28 Q01](./28-production-scenarios-rapid-round-qna.md), [01 Q77](./01-linux-and-scripting-qna.md) (page cache) |
| Process vs thread | [01 Q9](./01-linux-and-scripting-qna.md) |
| How do you identify and kill a zombie process? | [01 Q12](./01-linux-and-scripting-qna.md), [S-1](#linux-production-scenarios) |
| Server is slow but CPU and memory are normal | [34 Q8](./34-onprem-banking-infrastructure-qna.md), [01 Q71](./01-linux-and-scripting-qna.md) |
| Hard link vs soft link | [01 Q3](./01-linux-and-scripting-qna.md) |
| What happens internally when you execute a command? | [01 Q41](./01-linux-and-scripting-qna.md) |
| High load average / load high but CPU low | [01 Q38, Q71](./01-linux-and-scripting-qna.md) |
| Which process is listening on a port? | [01 Q29](./01-linux-and-scripting-qna.md), script in [18 Q9](./18-practical-scripting-challenges-qna.md) |
| `iptables` vs `firewalld` vs `nftables` | [34 Q15](./34-onprem-banking-infrastructure-qna.md) |
| SSH unreachable, crashing service, `top`/`htop`/`ps`/`vmstat`, disk I/O per process, inode exhaustion, DNS failures, `systemctl`/`service`/`journalctl`, Permission Denied, unexpected reboot | Answered in [L-1 to L-9](#linux-troubleshooting) below |

### Three-round loop
| Round | Question | Where |
|---|---|---|
| 1 | Linux load is high but CPU usage is low. Why? | [01 Q71](./01-linux-and-scripting-qna.md) |
| 1 | Pipeline succeeds but production serves the old build | [R-1](#round-1--technical-1) below |
| 1 | Troubleshoot intermittent DNS and network failures | [30 Q09](./30-azure-production-scenarios-qna.md), [28 Q08](./28-production-scenarios-rapid-round-qna.md), [01 Q69](./01-linux-and-scripting-qna.md), [L-6](#linux-troubleshooting) |
| 1 | Design a secure CI/CD pipeline with automated rollback | [28 Q10](./28-production-scenarios-rapid-round-qna.md), [05 Q31](./05-cicd-jenkins-github-actions-qna.md), [14 Q15](./14-deployment-systemdesign-behavioral-qna.md), [20 Q13, Q20](./20-devops-roadmap-gap-fill-qna.md) |
| 1 | Eliminate configuration drift across environments | [R-2](#round-1--technical-1) below |
| 2 | Recover Terraform state after a failed apply | [06 Q26](./06-terraform-and-iac-qna.md) |
| 2 | Handle manual production changes without losing Terraform state | [R-3](#round-2--technical-2) below |
| 2 | Pods healthy but p99 latency spikes | [R-4](#round-2--technical-2) below ([35 Q14](./35-observability-rca-scripting-go-qna.md) covers the post-deploy case) |
| 2 | Debug recurring Kubernetes node failures | [R-5](#round-2--technical-2) below |
| 2 | Multi-AZ AWS infrastructure with disaster recovery | [07 Q23, Q28](./07-aws-cloud-qna.md), [24 Q77](./24-aws-deep-dive-qna.md), [27 Q6](./27-cloud-architecture-scenarios-qna.md) |
| 2 | AWS costs up 40% without traffic growth | [07 Q27](./07-aws-cloud-qna.md), [36 Q47](./36-aws-networking-deep-dive-qna.md). Checklist in [R-6](#round-2--technical-2) |
| 3 | Production down with thousands of alerts. What first? | [R-7](#round-3--senior-scenarios) below |
| 3 | Reduce deployment failures without slowing releases | [R-8](#round-3--senior-scenarios) below |
| 3 | Zero-downtime database migration with rollback | [30 Q14](./30-azure-production-scenarios-qna.md) (expand/contract) |
| 3 | Critical vulnerability found in a running container | [R-9](#round-3--senior-scenarios) below |
| 3 | Prevent cascading failures from a failing downstream API | [R-10](#round-3--senior-scenarios) below, [13 Q15](./13-sre-incident-loadbalancing-servicemesh-qna.md) |
| 3 | Stop recurring incidents through SRE practices | [R-11](#round-3--senior-scenarios) below |

---

## Table of Contents
- [VPC](#vpc) — V-1
- [Terraform](#terraform) — TF-1, TF-2
- [Grafana](#grafana) — G-1 to G-16
- [Linux Production Scenarios](#linux-production-scenarios) — S-1 to S-4
- [Linux Troubleshooting](#linux-troubleshooting) — L-1 to L-9
- [Round 1 — Technical 1](#round-1--technical-1) — R-1, R-2
- [Round 2 — Technical 2](#round-2--technical-2) — R-3 to R-6
- [Round 3 — Senior Scenarios](#round-3--senior-scenarios) — R-7 to R-11

---

## VPC

### V-1. What are best practices for VPC design?
| Area | Practice |
|---|---|
| **IP planning** | Pick non-overlapping RFC 1918 ranges across all VPCs, accounts and on-prem *before* you need to connect them (overlaps block peering and TGW routing). Use a /16 per VPC and track allocations in **VPC IPAM**. Leave room for EKS, which uses one VPC IP per pod by default. |
| **Subnet tiers** | Separate public (ALB, NAT), private app, and isolated data subnets. Nothing but load balancers and NAT goes in public subnets. |
| **High availability** | Every tier in at least **2, ideally 3 AZs**. One NAT Gateway **per AZ**, with each private route table pointing at its own AZ's NAT, so one AZ failing doesn't cut egress for the others. |
| **Security layers** | Security groups as the main control, referencing other SGs instead of CIDRs. NACLs only for coarse subnet-level denies. No `0.0.0.0/0` on SSH; use **SSM Session Manager** instead of bastions. |
| **Private access to AWS** | **Gateway endpoints** for S3 and DynamoDB (free), **interface endpoints** for ECR, STS, SSM, Secrets Manager, etc. Traffic stays off the internet and NAT data charges drop. |
| **Explicit routing** | Associate every subnet with an explicit route table; never rely on the main route table. |
| **Connectivity at scale** | Peering for a few VPCs, **Transit Gateway** hub-and-spoke beyond that, PrivateLink to expose a single service. |
| **Visibility** | VPC Flow Logs on (to S3 for cost, or CloudWatch), Reachability Analyzer for debugging, Route 53 Resolver query logs for DNS. |
| **Everything as code** | VPCs built from one reviewed Terraform module, never by hand, tagged with owner/env/cost-center. |
| **Cost** | Watch NAT Gateway processing, cross-AZ traffic and public IPv4 charges ([36 Q47](./36-aws-networking-deep-dive-qna.md)). |

---

## Terraform

### TF-1. What are common issues with Terraform in production?
| Issue | Why it happens | Fix |
|---|---|---|
| **State lock stuck** | A pipeline was killed mid-apply and never released the lock. | Confirm nothing is running, then `terraform force-unlock <id>` ([06 Q13](./06-terraform-and-iac-qna.md)). |
| **Drift** | Someone changed a resource in the console. | Scheduled `plan -detailed-exitcode`, then reconcile ([28 Q14](./28-production-scenarios-rapid-round-qna.md), [R-3](#r-3-how-do-you-handle-manual-production-changes-without-losing-terraform-state)). |
| **Unexpected destroy/replace** | Changing a ForceNew attribute (AMI, subnet, name), renaming a resource, reordering a `count` list. | Read every `-/+` line in the plan. Use `for_each` with stable keys, `moved {}` blocks for refactors, `prevent_destroy` and `create_before_destroy` on critical resources. |
| **Huge, slow state** | One state file for the whole company: slow plans, big blast radius, lock contention. | Split state by component and environment (network, data, app). |
| **Secrets in state** | Passwords and keys are stored in plain text in state. | Encrypted backend with tight IAM, `sensitive = true`, or let AWS generate them (`manage_master_user_password` on RDS). |
| **Provider/module version breakage** | Unpinned versions upgrade silently. | Pin versions, commit `.terraform.lock.hcl`, upgrade deliberately ([06 Q27](./06-terraform-and-iac-qna.md)). |
| **Partial apply** | An apply failed halfway; some resources exist, some don't. | Re-run `plan`; Terraform records what it created. Import orphans ([06 Q26](./06-terraform-and-iac-qna.md)). |
| **Dependency/eventual-consistency errors** | IAM role not yet visible when Lambda is created, etc. | Explicit `depends_on`, provider retries, or a second apply. |
| **API rate limits** | Large plans hit AWS throttling. | Lower `-parallelism`, split states. |
| **Applies from laptops** | Different versions, no review, no audit. | Only CI applies to production, with OIDC roles. |

### TF-2. What are best practices for Terraform in AWS?
- **Remote state** in S3 with versioning, encryption and blocked public access, locking with `use_lockfile = true` (Terraform ≥1.10) or DynamoDB. One state per component per environment.
- **Layout**: reusable, versioned modules plus thin per-environment root configs (`envs/dev`, `envs/prod`), or one account per environment. Prefer separate directories over workspaces for prod isolation ([06 Q16, Q22](./06-terraform-and-iac-qna.md)).
- **Pin everything**: `required_version`, provider versions, module versions (git tags or registry), and commit `.terraform.lock.hcl`.
- **No static keys**: CI assumes an IAM role via **OIDC**; a separate, least-privilege role per environment. `assume_role` in the provider for cross-account.
- **Pipeline**: `fmt -check` → `validate` → `tflint` → `checkov`/`tfsec`/OPA → `plan` posted on the PR → human approval → `apply` of the *saved* plan file.
- **Safety**: `prevent_destroy` on stateful resources, deletion protection on RDS, S3 versioning, `for_each` over `count` for anything keyed.
- **Tagging**: `default_tags` in the AWS provider for owner, env, cost-center.
- **Secrets**: never in `.tfvars` in git. Read from Secrets Manager/SSM, or let AWS manage them.
- **Drift detection** on a schedule; humans get read-only console access in prod.
- **Small blast radius**: small PRs, small states, and `terraform test` or Terratest for shared modules.

---

## Grafana

### G-1. What is a dashboard in Grafana?
A **dashboard** is a page of **panels** arranged in a grid, all sharing one time range, one refresh interval and a set of **variables** (dropdowns like `env`, `service`, `pod`). It's stored as a **JSON model**, so it can be exported, version-controlled in git and provisioned automatically. Panels can be grouped into collapsible **rows**, and dashboards are organized into **folders**, which is also where permissions are usually applied.

### G-2. What are panels in Grafana?
A **panel** is one visualization on a dashboard. Each panel has:
- one or more **queries** against a data source,
- optional **transformations** (join, filter, rename, calculate fields) applied to the results,
- a **visualization type** (time series, stat, gauge, table, etc.),
- **field options and overrides** (unit, decimals, thresholds, color, min/max),
- optional **links** to other dashboards or to logs/traces.

A **library panel** is a panel saved once and reused across many dashboards, so a fix updates all of them.

### G-3. What are data sources in Grafana?
A **data source** is a configured connection to a backend Grafana queries. Grafana stores no metrics itself; it reads them live. Common ones: **Prometheus/Mimir** (metrics), **Loki** and **Elasticsearch** (logs), **Tempo/Jaeger** (traces), **CloudWatch**, **Azure Monitor**, **Google Cloud Monitoring**, and SQL databases (MySQL, PostgreSQL). Each has its own query editor and language.

Data sources can be added in the UI (*Connections → Data sources*) or **provisioned** from files, which is the production way:

```yaml
# /etc/grafana/provisioning/datasources/prometheus.yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy                       # Grafana server makes the request, not the browser
    url: http://prometheus-server.monitoring.svc:9090
    isDefault: true
    jsonData:
      timeInterval: 30s                 # match the scrape interval
```

### G-4. What is a query in Grafana?
A **query** is the request a panel sends to its data source, written in that data source's language: **PromQL** for Prometheus, **LogQL** for Loki, **TraceQL** for Tempo, SQL for databases. A panel can have several queries (A, B, C) and combine them with **expressions** (math, reduce, threshold).

```promql
# p95 request latency per service
histogram_quantile(0.95, sum by (le, service) (rate(http_request_duration_seconds_bucket{env="$env"}[$__rate_interval])))
```

Grafana injects built-in variables like `$__rate_interval` (a safe rate window based on scrape interval and zoom level) and `$__interval`, so the same query works at any time range. **Explore** is the place to write and test queries before putting them on a dashboard.

### G-5. What is a visualization in Grafana?
The **visualization** is how a panel draws its data. Pick by the question being answered:

| Visualization | Use for |
|---|---|
| **Time series** | Trends over time: request rate, latency, CPU |
| **Stat** / **Gauge** | A single current number: error rate now, uptime, SLO remaining |
| **Bar chart** / **Bar gauge** | Comparing categories: requests per service |
| **Table** | Lists with many fields: top pods by memory, alert inventory |
| **Heatmap** | Distributions over time: latency histograms |
| **State timeline / Status history** | Up/down or state changes over time |
| **Logs** | Log lines from Loki/Elasticsearch |
| **Traces / Node graph** | Trace waterfalls and service maps |
| **Geomap** | Data by location |

### G-6. What are alerts in Grafana?
**Grafana Alerting** (unified alerting, the default since Grafana 9) evaluates queries on a schedule and notifies when a condition holds. Its building blocks:
- **Alert rule**: one or more queries, expressions (reduce, math, threshold), an evaluation interval, and a **pending period** ("for 5m") so short blips don't fire.
- **States**: Normal → Pending → Firing → back to Normal, plus **No Data** and **Error** states you must decide how to handle.
- **Labels and annotations**: labels (`severity=critical`, `team=payments`) drive routing; annotations hold the summary, description and **runbook URL**.
- **Contact points**: where notifications go (Slack, PagerDuty, email, Teams, webhook, Opsgenie).
- **Notification policies**: a routing tree that matches labels to contact points, with grouping, group wait/interval and repeat interval.
- **Silences** (mute now, e.g. during maintenance) and **mute timings** (recurring, e.g. nights for non-critical).

It can also manage alert rules stored in Prometheus/Mimir/Loki (data-source-managed rules) from the same UI.

### G-7. How do you create alerts in Grafana?
1. **Create the contact point** (*Alerting → Contact points*), e.g. a Slack webhook or PagerDuty integration key, and send a test.
2. **Set the notification policy**: route `severity=critical` to PagerDuty, everything else to Slack; group by `alertname, service`.
3. **Create the alert rule** (*Alerting → Alert rules → New*):
   - Query A: `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))`
   - Expression B: reduce A to *last*; expression C: threshold `B > 0.05`
   - Folder and evaluation group (evaluate every 1m), **pending period 5m**
   - Labels `severity=critical`, `team=payments`; annotations with summary and runbook link
   - No Data / Error handling (e.g. alert on No Data for an availability metric)
4. **Preview** the rule to check it would have fired on past data, then save.
5. **Keep it as code**: export rules and provision them from YAML, or manage them with the Grafana Terraform provider, so they're reviewed and versioned like everything else.

Rules of thumb: alert on **symptoms** users feel (error rate, latency, SLO burn) rather than causes like CPU, and give every alert an owner and a runbook ([11 Q21](./11-monitoring-logging-observability-qna.md)).

### G-8. How do you create dashboards in Grafana?
**In the UI:** *Dashboards → New → Add visualization*, pick the data source, write the query, choose the visualization, set unit and thresholds, then add variables (G-9), arrange panels into rows, and save into a team folder. To start fast, **import** a community dashboard by ID from grafana.com (e.g. 1860 for Node Exporter Full) and trim it.

**As code (production):** keep dashboard JSON in git and load it through **file provisioning**, the **Grafana Terraform provider**, the **Grafana Operator** / Kubernetes ConfigMaps with the sidecar (kube-prometheus-stack), or generate it with **Grafonnet** (Jsonnet) or the Grafana Foundation SDK. Changes go through PRs, and the same dashboard deploys to every environment.

A good layout puts the **RED** summary (rate, errors, duration) at the top, then saturation, then dependencies, with drill-down links to detail dashboards, logs and traces.

**Grafana vs Prometheus** in one table:

| | Prometheus | Grafana |
|---|---|---|
| Role | Collects and stores metrics (TSDB), evaluates rules | Visualizes and alerts on data from many sources |
| Stores data? | Yes | No (except its own config DB) |
| Query language | PromQL | Uses each source's language |
| Alerting | Rules + Alertmanager | Unified alerting across all sources |
| Sources | Scrapes exporters/targets | Prometheus, Loki, Tempo, CloudWatch, SQL, … |

### G-9. What are variables in Grafana dashboards?
**Variables** turn one dashboard into a template, shown as dropdowns at the top. Instead of a dashboard per service, you write queries with `$service` and the viewer picks.

| Type | Example |
|---|---|
| **Query** | Values from the data source: `label_values(up{job="api"}, namespace)` |
| **Custom** | A fixed list: `prod,staging,dev` |
| **Interval** | `1m,5m,1h` for rate windows |
| **Data source** | Switch the whole dashboard between Prometheus instances (prod/staging clusters) |
| **Constant / Text box** | Hidden constants or free-text filters |
| **Ad hoc filters** | Add any `label=value` filter to every query |

Variables can **chain** (`cluster` → `namespace` → `pod`, each query filtered by the previous one), allow **multi-value** and **All** (use `=~"$pod"` in PromQL), and **repeat** panels or rows per value. Selected values go into the URL, so a link reproduces the exact view.

### G-10. How do you share dashboards in Grafana?
- **Link**: copy the URL with time range and variables, optionally a **short URL**. Viewers still need access.
- **Snapshot**: a static copy of the data at that moment, optionally public, with sensitive queries stripped. Good for incident reports.
- **Export JSON**: to put in git or import into another Grafana.
- **Embed**: a single panel as an iframe in a wiki or portal (needs embedding enabled).
- **Public / shared dashboards**: a read-only link anyone can open without logging in (be careful with what data it exposes).
- **Reports** (Enterprise/Cloud): scheduled PDF emails.
- **Permissions**: put dashboards in **folders** and grant teams Viewer/Editor on the folder rather than sharing one by one.

### G-11. What is role-based access control in Grafana?
Grafana scopes access at three levels:
- **Organizations**: fully separate tenants with their own dashboards, data sources and users.
- **Basic roles** in each org: **Viewer** (read), **Editor** (create/edit dashboards), **Admin** (manage users, data sources, settings), plus **Grafana server admin** for the whole instance. "No basic role" is also available.
- **Folder and dashboard permissions**: grant users, **teams** or roles View/Edit/Admin on a folder; dashboards inherit it.
- **Fine-grained RBAC** (Enterprise/Cloud, and partially OSS in recent versions): custom roles with specific actions, e.g. "can query the prod data source", "can edit alert rules but not dashboards". Data source permissions stop teams querying each other's data.

In practice: log in through **SSO** (OAuth/OIDC, SAML, LDAP), map IdP groups to Grafana teams and roles automatically, keep most users as Viewers, give Editor per team folder, use **service accounts** with tokens for automation, and disable anonymous access unless intended.

### G-12. How do you troubleshoot Grafana issues, and what are the common ones?
Start with the panel itself: **Query inspector** (panel menu → Inspect → Query) shows the exact request sent, the response, the timing and any error. Then try the same query in **Explore**, and in the data source's own UI (e.g. Prometheus `/graph`) to tell a Grafana problem from a data problem. Grafana's server log (`/var/log/grafana/grafana.log` or the pod logs) and *Data source → Save & test* cover the rest.

| Symptom | Usual cause |
|---|---|
| **"No data"** | Wrong label or variable value, time range outside the data, metric renamed, the target isn't being scraped (check `up`), or the variable resolved to nothing |
| **Data source error / "Bad Gateway"** | Grafana server can't reach the URL (DNS, network policy, wrong port, TLS cert, auth token expired). Remember `access: proxy` means the *server* must reach it, not your browser |
| **Slow or timing-out dashboards** | Too many panels, high-cardinality queries, long time ranges with tiny step, short refresh (see G-15) |
| **Gaps or spiky graphs** | Rate window smaller than 2× scrape interval (use `$__rate_interval`), scrape failures, counter resets |
| **Wrong numbers** | Wrong unit, `sum` vs `avg`, `rate` over a gauge, stacking turned on by mistake |
| **Alerts not firing / not arriving** | Rule in No Data/Error state, pending period too long, notification policy routes elsewhere, contact point broken, an active silence |
| **Login / permission problems** | SSO group mapping, folder permissions, user in wrong org |
| **Dashboard changes lost** | Dashboard is provisioned from files and edits in the UI get overwritten |
| **Grafana itself slow or restarting** | SQLite under load (move to PostgreSQL/MySQL for HA), memory limits, plugin errors |

### G-13. How do you monitor applications using Grafana?
1. **Instrument** the app: expose metrics (Prometheus client library or **OpenTelemetry**), write **structured logs**, emit **traces** with trace IDs.
2. **Collect**: Prometheus or **Grafana Alloy** scrape metrics; Alloy/Promtail ship logs to **Loki**; traces go to **Tempo**. On Kubernetes, kube-prometheus-stack adds node, pod and cluster metrics.
3. **Dashboards**: a service overview with **RED** metrics (rate, errors, p50/p95/p99 duration), saturation (CPU, memory, connection pools, queue depth), and dependencies (DB, cache, downstream APIs). Infrastructure dashboards use **USE** (utilization, saturation, errors).
4. **Correlate**: link metrics to logs (same labels), logs to traces (trace ID as a derived field), and use **exemplars** to jump from a latency spike straight to a slow trace.
5. **SLOs and alerts**: availability and latency SLOs with burn-rate alerts routed to the owning team ([20 Q17](./20-devops-roadmap-gap-fill-qna.md)).
6. Optionally add **synthetic checks** (blackbox exporter or Grafana Synthetic Monitoring) for the user's-eye view, and **Faro** for frontend monitoring.

### G-14. What are best practices for Grafana dashboards?
- **Start from a question** the dashboard answers ("is checkout healthy?"), not from "all the metrics we have".
- **Most important first**: a top row of stat panels for the golden signals and SLO status, details below, drill-down links to detail dashboards.
- **Consistency**: same layout for every service (generated from one template), consistent colors (red = bad), units on every axis, thresholds that match alert thresholds.
- **Use variables** instead of copy-pasting dashboards per service or environment.
- **Few panels**: about 15–25 per dashboard; collapse rarely-used rows.
- **Describe panels**: the description field explains what the panel shows and what "bad" looks like; link to the runbook.
- **Dashboards as code** in git, organized in team folders with owners; delete stale dashboards.
- **Annotations** for deploys and incidents, so changes are visible on every graph.

### G-15. How do you optimize dashboard performance?
- **Fewer, cheaper queries**: cut panels, collapse rows (collapsed rows don't run queries until opened), and reuse one query across panels with the **Dashboard** data source.
- **Recording rules**: precompute expensive PromQL (`histogram_quantile` over many series, big aggregations) in Prometheus and query the recorded series.
- **Avoid high cardinality**: aggregate (`sum by (service)`) rather than plotting thousands of series; filter with labels early.
- **Sensible defaults**: shorter default time range (6h, not 30d), refresh 30s–1m rather than 5s, set **Max data points** / **Min interval** so long ranges don't request millions of points.
- **Efficient variables**: refresh "On dashboard load" instead of "On time range change", and use `label_values(metric, label)` rather than heavy regex queries.
- **Downsampled long-term storage** (Thanos/Mimir) for queries over weeks or months, and query caching (Grafana Enterprise query caching, or Mimir/Thanos query-frontend result cache).
- **Scale Grafana** itself: PostgreSQL/MySQL backend instead of SQLite, several replicas behind a load balancer.

### G-16. How do you integrate Grafana with other tools?
| Integration | How |
|---|---|
| **Data sources** | Prometheus/Mimir, Loki, Tempo, Elasticsearch/OpenSearch, CloudWatch, Azure Monitor, Google Cloud Monitoring, InfluxDB, SQL databases, plus plugins (Datadog, Splunk, MongoDB, GitHub, Jira) |
| **Notifications** | Contact points for Slack, Teams, PagerDuty, Opsgenie, email, webhooks; Grafana OnCall / IRM for on-call schedules and escalation |
| **Authentication** | OAuth/OIDC (Okta, Entra ID, Google, GitHub), SAML, LDAP, with group-to-team sync |
| **CI/CD and deploys** | Pipelines post **annotations** via the HTTP API (`POST /api/annotations`) at each deploy, so deploys show on every graph |
| **Provisioning as code** | Terraform provider, Grafana Operator, file provisioning, Helm (kube-prometheus-stack) |
| **Kubernetes** | kube-prometheus-stack ships Grafana with dashboards loaded from ConfigMaps |
| **Automation** | HTTP API with service account tokens for dashboards, folders, users, alert rules |
| **Embedding** | Panels embedded in internal portals or Backstage |

---

## Linux Production Scenarios

### S-1. High load average, CPU and memory normal, thousands of zombie processes. How do you trace the parent and clear them?
First, a correction worth stating in the interview: **zombies don't add to the load average.** Load counts tasks in `R` (running/runnable) and `D` (uninterruptible sleep, usually waiting on I/O). A zombie is already dead (`Z`), using only a process table slot. So the zombies and the high load are likely two symptoms of one sick parent (for example, a parent stuck in `D` state on NFS that also never calls `wait()`), and you should also check for `D` state tasks.

```bash
# count zombies and find their parents
ps -eo stat,pid,ppid,cmd | awk '$1 ~ /^Z/'
ps -eo stat,ppid | awk '$1 ~ /^Z/ {print $2}' | sort | uniq -c | sort -rn   # zombies per parent
ps -fp <ppid>                                                                # who is the parent?

# what's actually driving the load?
ps -eo stat,pid,wchan:32,cmd | awk '$1 ~ /^D/'                               # stuck in uninterruptible I/O
cat /proc/loadavg; vmstat 1 5                                                # r (runnable) and b (blocked) columns
```

You can't `kill -9` a zombie. To clear them:
1. Nudge the parent to reap: `kill -s SIGCHLD <ppid>`. A correctly written parent calls `wait()` on SIGCHLD.
2. If it doesn't, **restart or kill the parent**. Its zombie children get re-parented to PID 1 (systemd), which reaps them immediately.
3. Fix the code: handle SIGCHLD and call `waitpid()`, or set SIGCHLD to `SIG_IGN`. In containers, use an init process (`docker run --init`, `tini`, or `shareProcessNamespace`) because an app running as PID 1 often doesn't reap children.

Why it matters even though zombies are "free": each holds a PID, and once `pid_max` (or a container's `pids.max`) is used up, nothing new can fork.

### S-2. Users see intermittent slowness on a backend service on port 8080. How do you tell whether it's the backlog queue, TCP drops or a firewall?
Work from the socket outward.

**1. Is the accept backlog overflowing?** (the app isn't calling `accept()` fast enough)
```bash
ss -ltn 'sport = :8080'          # for LISTEN sockets: Recv-Q = current queue, Send-Q = max backlog
nstat -az | grep -Ei 'ListenOverflows|ListenDrops'   # increasing = connections dropped at accept
sysctl net.core.somaxconn net.ipv4.tcp_max_syn_backlog
```
If `Recv-Q` sits near `Send-Q` and overflow counters climb, the app is saturated (thread pool full, GC pauses, blocked workers). Fix the app or scale out; raise `somaxconn` *and* the app's own backlog setting (e.g. Tomcat `acceptCount`) only as a buffer.

**2. Connection states**
```bash
ss -tan 'sport = :8080' | awk '{print $1}' | sort | uniq -c
```
- Many **SYN-RECV**: the handshake isn't completing — SYN flood, SYN queue full, or the final ACK lost on the way back (asymmetric routing, firewall). Check `nstat | grep -i syncookies`.
- Many **CLOSE-WAIT**: the app isn't closing sockets (a leak in the app).
- Many **TIME-WAIT** on the *client* side: short-lived connections without keep-alive, possibly exhausting ephemeral ports (`net.ipv4.ip_local_port_range`). Use connection pooling/keep-alive.

**3. Packet-level: retransmits and drops**
```bash
nstat -az | grep -Ei 'Retrans|Timeout'      # TCP retransmissions rising?
ss -ti 'sport = :8080'                       # per-connection rtt, retrans, cwnd
tcpdump -ni any port 8080 -w /tmp/8080.pcap  # look for repeated SYNs, retransmits, RSTs
ip -s link; ethtool -S eth0 | grep -i drop   # NIC drops / ring buffer overruns
```
A SYN repeated at 1s, 3s, 7s intervals with no SYN-ACK is the classic "packet is being dropped" signature, and it also explains the "intermittent extra 1–3 seconds".

**4. Firewall and kernel limits**
```bash
dmesg -T | grep -Ei 'conntrack|table full|dropping|SYN flooding'
conntrack -S; sysctl net.netfilter.nf_conntrack_count net.netfilter.nf_conntrack_max
iptables -L -n -v | grep -i drop             # DROP counters increasing?  (or: nft list ruleset)
```
"nf_conntrack: table full, dropping packet" is a very common cause of intermittent drops on busy hosts and Kubernetes nodes. Also check cloud-side controls: security groups, NACLs (ephemeral ports), load balancer health and idle timeouts.

**5. Not the network at all?** Compare server-side request time (app logs, `$request_time` in nginx) with client-side time. If the server is fast, the delay is in the network; if not, it's the app, its GC or its database.

### S-3. A Java microservice crashed with no stack trace. How do you confirm it was the OOM killer, and how do you prevent it?
No stack trace usually means the JVM didn't get a chance to write one: it was killed with **SIGKILL** from outside. A Java `OutOfMemoryError` (heap) *would* leave a stack trace; the kernel OOM killer leaves nothing in the app log.

**Confirm:**
```bash
dmesg -T | grep -Ei 'out of memory|oom-kill|killed process'
journalctl -k --since "1 hour ago" | grep -i oom
grep -i oom /var/log/messages /var/log/syslog
systemctl status myapp       # "status=9/KILL" or "oom-kill" result
```
The log line shows the killed PID, its RSS and the cgroup (`oom-kill:constraint=CONSTRAINT_MEMCG,...` means a cgroup/container limit was hit, not the whole machine). In Kubernetes, `kubectl describe pod` shows `OOMKilled` with exit code **137** (128 + 9).

**Prevent:**
- **Size the JVM for the box or container**: heap is only part of Java memory (also metaspace, thread stacks, code cache, direct buffers, GC overhead). Use `-XX:MaxRAMPercentage=70` (container-aware) instead of a fixed `-Xmx` that's too close to the limit, and cap the rest (`-XX:MaxMetaspaceSize`, `-XX:MaxDirectMemorySize`).
- **Make heap exhaustion visible**: `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/dumps -XX:+ExitOnOutOfMemoryError`, and enable GC logs. Analyze dumps with Eclipse MAT to find a leak.
- **Find leaks**: watch RSS and heap-after-GC trend over days; a steady climb is a leak, a sawtooth is normal.
- **cgroups**: run it under systemd with `MemoryMax=`/`MemoryHigh=` (or container limits) so one service can't take the whole host, and protect critical processes with `OOMScoreAdjust=-500` (or `oom_score_adj`).
- **Swap and swappiness**: a small swap with low `vm.swappiness` (e.g. 10) gives a buffer against short spikes; for latency-sensitive JVMs many teams disable swap and rely on correct sizing instead. Either way, alert before the limit.
- **Alert** on memory usage at 80–90% and on OOM kill events (node-exporter `node_vmstat_oom_kill`, or kube-state-metrics for pods).

### S-4. A junior engineer ran `chmod -R 777 /` on a critical staging server. How do you salvage it without rebuilding?
Expect breakage straight away: `sshd` refuses keys if `~/.ssh` or host keys are world-writable, `sudo` refuses to run if `/etc/sudoers` isn't 0440 and owned by root, and **setuid bits are lost** (`chmod 777` clears the 4000 bit on `passwd`, `sudo`, `su`, `ping`). **Don't close your existing root session.**

1. **Get a root shell**: use the session you still have, the cloud serial console, or boot a rescue/live image and `chroot`.
2. **Reset package-owned files from the package database:**
   ```bash
   # RHEL / CentOS / Rocky / Fedora
   rpm -a --setperms          # restore permissions recorded in the RPM db
   rpm -a --setugids          # restore owner and group
   rpm -Va | grep '^.M'       # verify: remaining mode mismatches

   # Debian / Ubuntu (no built-in "setperms")
   dpkg --verify              # lists files whose mode/owner differs
   apt-get install --reinstall $(dpkg-query -W -f='${binary:Package}\n')   # reinstall all packages
   ```
3. **Fix what the package manager doesn't own**: `/etc/sudoers` (0440), `/etc/shadow` and `/etc/gshadow` (0640 or 0000 depending on distro), `/etc/ssh/ssh_host_*_key` (0600), users' `~/.ssh` (0700) and `authorized_keys` (0600), `/tmp` and `/var/tmp` (1777, sticky bit), `/root` (0700), app config and data directories, cron files.
4. **Compare with a healthy server** of the same build: capture its permissions and apply them.
   ```bash
   # on a healthy twin
   getfacl -R -p /etc /usr /var /opt > perms.acl        # or: find / -xdev -printf '%m %u %g %p\n'
   # on the broken host
   setfacl --restore=perms.acl
   ```
5. **Restore from backup** what's left (application data permissions, custom configs), or restore the whole volume from a snapshot if it's faster.
6. **Verify**: `rpm -Va` / `dpkg --verify` clean, `sudo -l` works, SSH key login works, services start, `find / -xdev -perm -0002 -type f` (world-writable files) is back to the expected short list.

Then be honest about it: a server with world-writable system binaries for any length of time may have been tampered with, so for production the right answer is **rebuild from the image**. For staging, salvage is acceptable.

**Prevent it next time:** least-privilege `sudo` (no blanket root for juniors), immutable infrastructure (rebuild servers from images instead of fixing them by hand), `chattr +i` on a few critical files like `/etc/sudoers` and `/etc/passwd` (note it blocks legitimate changes too), file integrity monitoring (AIDE), regular snapshots, and staging rebuilt from code so recovery is a re-deploy.

---

## Linux Troubleshooting

### L-1. How do you troubleshoot a Linux server that is unreachable via SSH?
Separate "can't reach the host" from "reach it but SSH fails".
1. **Network reachability**: `ping`, then `nc -vz host 22` (or `telnet host 22`). **Timeout** means the packet is dropped (firewall, security group, NACL, routing, host down). **Connection refused** means the host is up but nothing listens on 22 or a firewall sends RST ([01 Q69](./01-linux-and-scripting-qna.md)).
2. **Verbose client**: `ssh -vvv user@host` shows exactly where it stops: TCP connect, key exchange, or authentication (`Permission denied (publickey)`).
3. **Get in another way**: cloud serial console, EC2 Instance Connect / SSM Session Manager, or the hypervisor/iLO console.
4. **On the server**:
   - `systemctl status sshd`, `journalctl -u sshd`, `sshd -t` (config syntax error after an edit is a classic).
   - `ss -ltnp | grep :22`; `iptables -L -n` / `firewall-cmd --list-all` / `nft list ruleset`; fail2ban bans (`fail2ban-client status sshd`).
   - Disk full or inodes exhausted (`df -h`, `df -i`) can stop logins.
   - Permissions on `~/.ssh` (700) and `authorized_keys` (600), wrong owner, or SELinux contexts (`restorecon -Rv ~/.ssh`).
   - Load or memory so high that `sshd` can't fork (check console, `dmesg` for OOM).
   - `/etc/hosts.deny`, `AllowUsers`/`DenyUsers`, `MaxStartups` limits.
5. **Cloud**: security group allows 22 from your IP, NACL allows ephemeral return ports, route table has the IGW, instance has a public IP ([36 Q49](./36-aws-networking-deep-dive-qna.md)). Status checks failing points at the OS or hardware.

### L-2. How would you troubleshoot a service that keeps crashing automatically?
```bash
systemctl status myapp                          # exit code, signal, restart count
journalctl -u myapp -b --no-pager -n 200        # last logs before each crash
journalctl -u myapp -p err --since "1 hour ago"
systemctl show myapp -p NRestarts,Result,ExecMainStatus
dmesg -T | grep -Ei 'oom|segfault|killed'       # killed by the kernel?
coredumpctl list; coredumpctl info myapp        # segfault core dumps
```
Read the exit status: **code 1/2** = the app exited with an error (read its logs: bad config, missing env var, can't connect to the database, port already in use); **signal 9 / status 137** = OOM killer or something external; **signal 11 (SEGV)** = native crash, get the core dump; **signal 6 (ABRT)** = assertion/abort.

Then check what changed (recent deploy, config, package update, certificate expiry, disk full), the dependencies (DB, DNS, files it needs), resource limits (`LimitNOFILE`, `MemoryMax`), and permissions/SELinux. Run the `ExecStart` command by hand as the service user to see the error directly.

Note `Restart=always` hides crash loops; set `StartLimitIntervalSec` / `StartLimitBurst` so a broken service stops and alerts instead of restarting forever, and alert on restart count.

### L-3. What is the difference between `top`, `htop`, `ps`, and `vmstat`?
| Tool | What it is | Use it for |
|---|---|---|
| `ps` | One-off **snapshot** of processes | Scripting and precise queries: `ps -eo pid,ppid,stat,%cpu,%mem,rss,cmd --sort=-%mem \| head` |
| `top` | **Live, refreshing** process view, installed everywhere | Quick triage: load, CPU breakdown (`us`, `sy`, `wa`, `st`), memory, top consumers. `1` per-CPU, `P`/`M` sort, `H` threads |
| `htop` | Friendlier interactive `top` (extra package) | Tree view, per-core bars, scrolling, search, kill/renice with keys |
| `vmstat` | **System-wide** counters over time, not per process | `vmstat 1`: `r` (run queue), `b` (blocked on I/O), `si`/`so` (swapping), `bi`/`bo` (block I/O), `cs` (context switches), `wa` (I/O wait) |

`top` and `htop` answer "which process?", `vmstat` answers "what kind of bottleneck: CPU, memory, I/O?", and `ps` is for scripts and exact output.

### L-4. How do you identify which process is consuming the most disk I/O?
```bash
iostat -xz 1        # which device is busy: %util, await (latency), r/s, w/s
iotop -oPa          # per-process I/O, only active ones, accumulated
pidstat -d 1        # per-process kB_rd/s, kB_wr/s, iodelay (sysstat)
```
Without those tools: `cat /proc/<pid>/io` (`read_bytes`, `write_bytes`) for a suspect, or `ps -eo stat,pid,cmd | awk '$1 ~ /D/'` to see processes stuck waiting on I/O. In containers, per-cgroup `io.stat` or cAdvisor metrics show which container. Typical culprits: log flooding, backups/`rsync`, database checkpoints or full table scans, swapping (check `vmstat` `si/so`), and noisy neighbours on shared cloud volumes (check EBS burst balance and IOPS limits).

### L-5. What happens when a Linux server runs out of inodes?
Every file and directory uses one **inode**, and the number of inodes is fixed when an ext4 filesystem is created. When they run out, **nothing new can be created**: you get `No space left on device` even though `df -h` shows free space. Apps fail to write temp files, logs, sockets and PID files; logins and package installs can fail.

```bash
df -i                                                    # IUse% at 100%
find / -xdev -type f | cut -d/ -f2-3 | sort | uniq -c | sort -rn | head   # where the files are
du --inodes -x / 2>/dev/null | sort -rn | head           # GNU du
```
Usual causes: millions of tiny files (PHP session files, mail queue, cache directories, an app writing one file per request, unrotated small logs). Fix by deleting them (`find /path -type f -mtime +7 -delete`; for huge directories `rm` with a glob fails, `find -delete` works) and fixing the app or a cron cleanup. Long-term: alert on `df -i`, create the filesystem with more inodes (`mkfs.ext4 -i` / `-N`), or use **XFS**, which allocates inodes dynamically.

### L-6. How would you troubleshoot DNS resolution failures in Linux?
```bash
getent hosts api.example.com           # full system path (nsswitch + /etc/hosts + DNS) — what apps see
dig api.example.com                    # asks the resolver from /etc/resolv.conf directly
dig @8.8.8.8 api.example.com           # bypass the local resolver: is it the resolver or the record?
dig +trace api.example.com             # follow delegation from the root
cat /etc/resolv.conf; resolvectl status
grep hosts /etc/nsswitch.conf; cat /etc/hosts
```
Interpret the result: **NXDOMAIN** = the name doesn't exist (typo, wrong search domain, record missing); **SERVFAIL** = the resolver or authoritative server is broken (often DNSSEC); **timeout** = can't reach the resolver (firewall blocking UDP/TCP 53, resolver down). If `dig` works but the app fails, check `/etc/hosts`, nsswitch order, the app's own DNS cache (Java's `networkaddress.cache.ttl`), and `search`/`ndots` settings.

For **intermittent** failures: resolver overload or rate limiting (AWS VPC resolver allows 1024 packets/sec per ENI), UDP drops and conntrack races (the Kubernetes 5-second DNS delay, fixed with NodeLocal DNSCache or `single-request-reopen`), `ndots:5` in Kubernetes causing many extra lookups, one bad resolver in a list of several, and records with low TTLs during a change. Test in a loop to catch it: `for i in $(seq 100); do dig +short +time=1 api.example.com >/dev/null || echo fail; done`.

### L-7. What is the difference between `systemctl`, `service`, and `journalctl`?
| Command | What it does |
|---|---|
| `systemctl` | The **systemd** control tool: `start/stop/restart/reload/status`, `enable/disable` (start at boot), `daemon-reload` after editing units, `list-units --failed`, `mask`, `edit`, and power actions (`reboot`). |
| `service` | Older **SysV init** wrapper (`service nginx restart`) for `/etc/init.d` scripts. On systemd systems it just forwards to `systemctl`. Works, but kept for compatibility; it can't enable services or show the full status. |
| `journalctl` | Reads the **systemd journal** (logs from all units, the kernel and boot). `-u nginx`, `-f` (follow), `-b` (this boot), `-b -1` (previous boot), `-p err`, `--since "10 min ago"`, `-k` (kernel), `-o json`. |

`systemctl` controls services, `journalctl` reads their logs, `service` is the legacy way to do part of what `systemctl` does.

### L-8. A production application is getting "Permission denied" errors. How would you troubleshoot?
Find out **who** is doing **what** to **which file**, then check each layer that can say no.
1. **Exact error**: the log line or `strace -f -e trace=file,network -p <pid>` shows the syscall (`open`, `connect`, `bind`, `execve`) and path that returned `EACCES`/`EPERM`.
2. **Which user**: `ps -o user,group,pid,cmd -p <pid>`, and `id <user>` for group membership (a service started before a user was added to a group keeps the old groups until restart).
3. **Classic permissions along the whole path**: `namei -l /path/to/file` shows every directory; the user needs `x` on every directory in the path, not just `r` on the file. Check owner and mode with `ls -l`, and ACLs with `getfacl`.
4. **Mount options**: `noexec` (can't run scripts from `/tmp`), `ro` (filesystem remounted read-only after errors; check `dmesg`), `nosuid`.
5. **SELinux / AppArmor**: `getenforce`, `ausearch -m avc -ts recent`, `ls -Z`. Fix with `restorecon` or `semanage fcontext`, never by disabling SELinux ([34 Q3](./34-onprem-banking-infrastructure-qna.md)).
6. **Capabilities and privileged ports**: binding to a port below 1024 as non-root needs `CAP_NET_BIND_SERVICE` (`setcap` or systemd `AmbientCapabilities`).
7. **systemd sandboxing**: `ProtectSystem=strict`, `ProtectHome`, `ReadWritePaths`, `User=` in the unit can block paths that work when run by hand.
8. **Immutable files**: `lsattr` for `chattr +i`.
9. **Containers/Kubernetes**: running as a non-root UID that doesn't own the mounted volume (`fsGroup`, `runAsUser`), read-only root filesystem, dropped capabilities.
10. **Not the filesystem at all**: `sudo` rules, database grants, or a cloud IAM "AccessDenied" that the app logs as permission denied.

Fix with the smallest change (correct owner/group, add the user to a group, correct SELinux context). Never `chmod 777` (see [S-4](#s-4-a-junior-engineer-ran-chmod--r-777--on-a-critical-staging-server-how-do-you-salvage-it-without-rebuilding)).

### L-9. A Linux server unexpectedly rebooted during production hours. How would you investigate?
1. **Establish the timeline**:
   ```bash
   last -x reboot shutdown | head      # reboot times; a reboot with no "shutdown" before it = crash or power loss
   uptime; who -b
   journalctl --list-boots
   journalctl -b -1 -n 200             # last messages of the previous boot (needs persistent journal)
   journalctl -b -1 -p warning
   ```
2. **Clean or unclean?** A clean reboot logs the shutdown sequence (systemd stopping units). Then find **who or what** asked for it: `journalctl -b -1 | grep -Ei 'reboot|shutdown|systemd-logind'`, shell history, `/var/log/secure` / `auth.log` for sudo, cron jobs, automatic update tools (`unattended-upgrades` with `Automatic-Reboot`, `dnf-automatic`, `needs-restarting`), configuration management, or the cloud provider.
3. **Unclean** (log just stops): look for
   - **Kernel panic** or **watchdog** reset: `/var/crash` (kdump), `journalctl -k -b -1`, "soft lockup", "hung task", "Kernel panic".
   - **OOM** with `vm.panic_on_oom=1`, or the OOM killer killing something critical.
   - **Hardware**: `ras-mc-ctl --errors`, `mcelog`, `ipmitool sel list` / iLO/iDRAC logs (power supply, temperature, ECC memory errors).
   - **Cloud**: scheduled maintenance or instance retirement events, failed system status checks, the host being replaced; console output/screenshot in the cloud console; CloudTrail for a `RebootInstances`/`StopInstances` API call.
4. **Correlate** with monitoring right before the reboot: memory and swap climbing, CPU temperature, disk errors, a deploy or patch run.
5. **Make the next one diagnosable**: persistent journal (`Storage=persistent`), **kdump** configured, logs shipped off the box, and alert on reboots. Then fix the root cause and design for it: a single server rebooting shouldn't be a production outage, so put it behind a load balancer or in an autoscaling group.

---

## Round 1 — Technical 1

### R-1. The pipeline succeeds, but production still serves the old build. How do you debug it?
Follow the artifact from the pipeline to the user, one hop at a time, and find where the new version stops.
1. **Did the pipeline build and deploy what you think?** Check the logs for the image tag or artifact version. A common bug: the pipeline pushes `:latest` or a reused tag, or builds from the wrong branch/commit, or the deploy step was skipped by a condition but the job still went green.
2. **Is the new artifact in the registry?** Compare digests: `docker buildx imagetools inspect repo/app:tag`.
3. **What is actually running?**
   - Kubernetes: `kubectl get deploy app -o jsonpath='{..image}'`, `kubectl rollout status deploy/app`, `kubectl get rs` (is the new ReplicaSet stuck?), and the running pods' `imageID`. If the manifest still says `:latest`, nothing changed in the spec, so **no rollout happened**; and with `imagePullPolicy: IfNotPresent` nodes reuse the cached old image. Use immutable tags (git SHA) or digests.
   - GitOps: Argo CD/Flux may show Synced to an old commit, or the pipeline updated the wrong values file or environment.
   - VMs/ECS: did the ASG launch template or ECS task definition get a new revision, and did the service actually roll to it? Did the app restart after files were copied?
4. **Is traffic reaching the new version?** Old pods/instances still registered in the load balancer, blue/green switch never flipped, a canary stuck at 0%, or DNS/Route 53 weights pointing at the old stack.
5. **Caching**: CDN (CloudFront) serving cached `index.html` (invalidate, or use hashed asset filenames with short TTL on `index.html`), browser cache, service worker, nginx cache.
6. **Confirm the version directly**: hit a `/version` endpoint that returns the git SHA and build time, on a pod directly (`kubectl port-forward`) and through the load balancer, to see which hop is stale.

Prevention: immutable tags, a post-deploy smoke test that checks `/version` equals the commit just built (so the pipeline fails instead of going green), and fail the deploy step if the rollout doesn't complete.

### R-2. How do you eliminate configuration drift across environments?
Drift between environments ("works in staging, breaks in prod") comes from differences made by hand. The cure is to make every environment come from **the same code with a small, explicit set of differences**.
- **One codebase, parameterized**: the same Terraform modules for dev, staging and prod, with only sizes, counts and names in per-environment variable files. The same Helm chart with `values-dev.yaml` / `values-prod.yaml`, or Kustomize base + overlays. Reviewing a diff of the values files shows exactly how environments differ.
- **Promote, don't rebuild**: build one immutable artifact (container image by digest) once and promote that same artifact through environments; only config changes between them.
- **GitOps** for Kubernetes: Argo CD / Flux continuously reconciles the cluster to git and reverts manual changes (self-heal), and OutOfSync shows drift instantly.
- **Immutable infrastructure**: replace servers from a golden image (Packer) instead of patching them in place; where you do manage servers, run Ansible on a schedule in check mode to detect drift.
- **No manual changes**: read-only console access in prod, changes only through PRs and pipelines, break-glass access that's logged and followed by a code change.
- **Detect it**: scheduled `terraform plan -detailed-exitcode` per environment, AWS Config rules, Argo CD drift alerts.
- **Config and secrets centrally**: SSM Parameter Store / Secrets Manager / Vault, with the same key names in every environment, and feature flags instead of environment-specific code paths.
- **Ephemeral environments** created from the same code for each PR, which proves the code alone can build an environment.

---

## Round 2 — Technical 2

### R-3. How do you handle manual production changes without losing Terraform state?
Manual changes don't corrupt state; they make **reality differ from state and code**. The job is to bring all three back in line without destroying anything.
1. **Find the change**: `terraform plan -refresh-only` shows what changed in the real infrastructure without proposing to revert it. CloudTrail tells you who changed it and why.
2. **Decide which side wins:**
   - **Keep the manual change** (e.g. an incident hotfix): update the Terraform code to match, then run `terraform apply -refresh-only` to record it in state. The next normal `plan` should show **no changes**.
   - **Revert it**: a normal `terraform plan`/`apply` puts the resource back to what the code says. Do it in a change window if it affects traffic.
   - **A resource created by hand**: write the resource block and import it (`import { to = aws_security_group.x  id = "sg-123" }`, Terraform ≥1.5, with `terraform plan -generate-config-out=generated.tf` to draft the code), then plan until it shows no changes.
   - **A resource deleted by hand**: plan will want to recreate it. Either let it, or remove it from code and state (`removed {}` block or `terraform state rm`).
3. **Protect state while doing it**: state is in a versioned S3 bucket, so take a backup first (`terraform state pull > backup.tfstate`), work under the lock, and never hand-edit state JSON.
4. **Never blindly `apply`**: a plan full of unexpected changes is a signal to stop and investigate, not to proceed.
5. **Stop it recurring**: read-only console roles in production, break-glass access that requires a follow-up PR, `ignore_changes` only for attributes something else legitimately manages (ASG desired capacity), and scheduled drift detection that alerts.

### R-4. Kubernetes Pods are healthy, but p99 latency spikes. Why?
"Healthy" only means probes pass; probes don't measure tail latency. Common causes, roughly in the order to check:
- **CPU throttling from CPU limits**: the CFS quota lets a pod use its limit per 100 ms period; a busy multi-threaded app burns through it early and then waits for the rest of the period, adding up to tens of ms per request even when average CPU looks low. Check `container_cpu_cfs_throttled_periods_total / container_cpu_cfs_periods_total`. Fix: raise or remove CPU limits (keep requests), or tune thread counts.
- **Garbage collection pauses** (JVM, Go, .NET): spikes line up with GC logs. Fix heap sizing or the collector.
- **Noisy neighbours**: other pods on the same node saturating CPU, memory bandwidth, disk or network. Compare latency per node; use requests that reflect real usage, anti-affinity, or dedicated node pools.
- **Uneven load balancing**: long-lived HTTP/2 or gRPC connections stick to a few pods, so some are overloaded while others idle. Use L7 balancing (service mesh, client-side balancing) or limit connection age.
- **Downstream dependencies**: one slow database query, cache misses, a slow third-party API. Traces show which span grows.
- **Connection pool exhaustion**: requests queue waiting for a DB connection.
- **DNS**: `ndots:5` lookups and conntrack races give occasional 5-second delays ([L-6](#l-6-how-would-you-troubleshoot-dns-resolution-failures-in-linux)).
- **Scaling events**: HPA adds pods that aren't warm yet (JIT, caches), or readiness passes before the app can really serve. Use warm-up, `startupProbe`, slower scale-down.
- **Network**: cross-AZ hops, conntrack table full, packet drops on the node, kube-proxy iptables rule count at scale.

**How to investigate:** confirm in the metrics that p99 is up but p50 is flat (a tail problem, not general slowness); break p99 down by pod, node and endpoint; overlay deploys, HPA events and GC; pull **exemplars/traces** for slow requests; check throttling and node saturation. See also [35 Q14](./35-observability-rca-scripting-go-qna.md).

### R-5. How do you debug recurring Kubernetes node failures?
1. **Characterize the pattern first**: which nodes (same instance type, AZ, node group, AMI version?), when (time of day, after deploys, under load?), and how it fails (NotReady, rebooted, terminated, stuck).
2. **Node status and events:**
   ```bash
   kubectl get nodes -o wide
   kubectl describe node <node>        # Conditions: MemoryPressure, DiskPressure, PIDPressure, Ready; recent events
   kubectl get events -A --field-selector involvedObject.kind=Node --sort-by=.lastTimestamp
   ```
3. **On the node** (SSH/SSM, or the cloud console log if it's down):
   ```bash
   journalctl -u kubelet -u containerd --since "2 hours ago"
   dmesg -T | grep -Ei 'oom|panic|hung|xfs|ext4|nvme|nf_conntrack'
   df -h; df -i                        # image and log storage full → DiskPressure, evictions
   ```
4. **Common root causes:**
   - **Memory exhaustion**: pods without memory limits or low `kube-reserved`/`system-reserved`, so the kubelet or containerd itself gets OOM-killed and the node goes NotReady. Set reservations and eviction thresholds, and limits on pods.
   - **Disk pressure**: container logs, image layers, `emptyDir` volumes filling the root disk. Bigger disk, log rotation, image garbage collection settings.
   - **PID exhaustion**: a fork bomb or thread leak (`podPidsLimit`).
   - **Network/CNI**: IP address exhaustion (AWS VPC CNI), CNI pod crashing, conntrack table full.
   - **Kernel or AMI bugs**: failures started with a new AMI or kernel version; roll back the node image.
   - **Hardware/cloud**: instance status check failures, Spot interruptions, scheduled maintenance.
   - **Control plane connectivity**: kubelet can't reach the API server (security groups, expired certificates, API server throttling).
5. **Fix and harden**: correct the root cause; enable **Node Problem Detector** to surface kernel and hardware issues as node conditions; use automated node repair (EKS node auto-repair, GKE auto-repair) or Karpenter to replace bad nodes; alert on NotReady duration and node condition changes; use PodDisruptionBudgets and spread workloads across nodes and AZs so a node failure doesn't become an outage.

### R-6. AWS costs rose 40% without traffic growth. Find the cause.
[07 Q27](./07-aws-cloud-qna.md) covers the general approach. A fast checklist:
1. **Cost Explorer**: group by **service**, then **usage type**, then **linked account** and **tag**, daily granularity. Find the date the line bent upward and match it to a deploy, a Terraform change or a new team project. Check **Cost Anomaly Detection** alerts.
2. **Usual suspects when traffic is flat:**
   - **NAT Gateway data processing**: a new service pulling images or calling S3 through NAT instead of a VPC endpoint.
   - **Cross-AZ or cross-region data transfer**: chatty microservices across AZs, replication added.
   - **Forgotten resources**: test environments, load-test clusters, unattached EBS volumes, old snapshots, idle load balancers, unused Elastic IPs and public IPv4 addresses.
   - **Logs and observability**: CloudWatch Logs ingestion after someone turned on DEBUG logging, high-cardinality custom metrics.
   - **Autoscaling stuck high**: an ASG or Karpenter scaled up and never down; HPA min replicas raised.
   - **Storage growth**: S3 without lifecycle rules, versioning keeping every old version, EBS gp2 never moved to gp3.
   - **Expired commitments**: Savings Plans or Reserved Instances expired, so the same usage is now billed on-demand.
   - **Runaway functions/jobs**: Lambda in a retry loop, a Glue/EMR job left running.
3. **Fix** the cause, then prevent: budgets with alerts per account, anomaly detection, mandatory cost tags, lifecycle policies, scheduled shutdown of non-prod, and a weekly cost review.

---

## Round 3 — Senior Scenarios

### R-7. Production is down and you have thousands of alerts. What do you do first?
Don't start reading alerts one by one. **Establish control, find the impact, mitigate, then diagnose.**
1. **Declare an incident** and take roles: incident commander (coordinates, doesn't debug), a communications lead, and responders ([13 Q12](./13-sre-incident-loadbalancing-servicemesh-qna.md)). Open one incident channel.
2. **Confirm user impact** with the few signals that matter: the SLO / golden-signal dashboard, synthetic checks, error rate at the edge, customer reports. What's broken, for whom, since when?
3. **Find the earliest and most upstream alert.** Thousands of alerts are usually one cause fanning out. Sort by start time, and look at shared dependencies: DNS, network, database, auth, a cloud region, certificates. Silence or group the duplicate noise so responders can see.
4. **Ask "what changed?"**: deploys, config changes, feature flags, infrastructure changes, certificate expiry, provider status page. Most incidents follow a change.
5. **Mitigate first, root cause later**: roll back the last deploy, flip the feature flag off, fail over to another region/AZ, scale up, shed load. Restoring service beats understanding it.
6. **Communicate on a schedule**: status page and stakeholder updates every 15–30 minutes, even if the update is "still investigating".
7. **After recovery**: verify fully, then a blameless postmortem with action items, including fixing the alerting itself (why did one failure generate thousands of alerts? add inhibition rules and dependency-aware grouping in Alertmanager so the root alert suppresses its children).

### R-8. How do you reduce deployment failures without slowing releases?
Speed and safety go together: **smaller changes, more automation, and safer rollouts** reduce failure rate *and* raise frequency (this is what DORA research shows).
- **Small batches**: small PRs, trunk-based development, deploy often. A small change is easy to review, test and roll back.
- **Fast, trustworthy tests in the pipeline**: unit and contract tests on every commit, integration tests in an ephemeral environment, fix or quarantine flaky tests so failures mean something.
- **Same artifact everywhere**: build once, promote by digest; environments created from the same IaC (see [R-2](#r-2-how-do-you-eliminate-configuration-drift-across-environments)) so staging predicts prod.
- **Progressive delivery**: canary or blue/green with **automated analysis** (Argo Rollouts / Flagger comparing error rate and latency) and **automatic rollback**, so a bad change reaches 5% of users for minutes, not 100% for an hour ([20 Q13](./20-devops-roadmap-gap-fill-qna.md)).
- **Feature flags**: separate deploy from release; turn a feature off without a redeploy.
- **Backward-compatible changes**: expand/contract database migrations and versioned APIs, so rollback is always possible ([30 Q14](./30-azure-production-scenarios-qna.md)).
- **Automated checks instead of manual gates**: policy-as-code, security scans and approval rules in the pipeline replace slow change boards for low-risk changes; keep human approval only for high-risk ones.
- **Measure**: track change failure rate, lead time, deployment frequency and time to restore; review every failed deployment and fix the gap in the pipeline that let it through.

### R-9. A critical vulnerability is found in a running container. What next?
1. **Assess real risk, fast**: is the vulnerable package actually used and reachable? Is the service internet-facing? Is there a public exploit or is it on CISA's KEV list? What data and permissions does the workload have? This sets the urgency (hours vs the normal patch cycle).
2. **Find every affected workload**, not just the one reported: query the registry scanner / SBOMs (Trivy, Grype, ECR/Defender scanning) and the running clusters for the image digest and the package version.
3. **Contain while the fix is built** (if risk is high): tighten NetworkPolicies and security groups, put a WAF rule in front of the exploit path, drop capabilities, make the root filesystem read-only, scale down a non-critical service, or turn off the vulnerable feature.
4. **Check for compromise**: runtime security alerts (Falco, GuardDuty), unexpected processes, outbound connections, new files. If there are signs of exploitation, switch to the security incident process: preserve evidence, rotate the secrets the container could access.
5. **Fix properly**: don't patch the running container (`kubectl exec` changes vanish on restart and break immutability). Update the base image or dependency, rebuild, scan, test, and **roll out through the normal pipeline** (fast-tracked), then verify the running digest changed everywhere.
6. **Close out**: confirm the scanner shows it fixed, document it, and prevent recurrence: scan in CI with a gate on critical CVEs, rescan images in the registry continuously (new CVEs appear for old images), minimal/distroless base images, automated dependency updates (Dependabot/Renovate), and admission policies blocking unscanned or unsigned images ([12 Q23](./12-security-devsecops-qna.md)).

### R-10. How do you prevent cascading failures from a failing downstream API?
A cascading failure happens when callers wait on a slow dependency, use up their own threads and connections, and fail in turn. The defences limit how much one dependency can hurt you:
- **Timeouts on every call**: short, explicit, and smaller than the caller's own timeout. No timeout means threads wait forever.
- **Retries done carefully**: few retries, **exponential backoff with jitter**, only on idempotent operations, with a **retry budget** so retries can't multiply load on a dependency that's already struggling.
- **Circuit breaker**: after a failure threshold, stop calling the dependency for a while and fail fast, then test with a few requests before closing ([13 Q15](./13-sre-incident-loadbalancing-servicemesh-qna.md)).
- **Bulkheads**: separate thread/connection pools per dependency, so a slow payments API can't take the threads that serve search.
- **Fallbacks / graceful degradation**: serve cached or default data, hide the non-essential feature, queue the work for later.
- **Asynchronous decoupling**: put a queue (SQS, Kafka) between services where the user doesn't need an immediate answer.
- **Load shedding and rate limiting** on your own service, so overload is rejected quickly instead of everything slowing down.
- **Implement it once**: resilience libraries (Resilience4j, Polly) or a service mesh (Istio/Linkerd timeouts, retries, outlier detection), and **test it** with fault injection and chaos experiments.
- **Monitor** each dependency's latency, error rate and circuit-breaker state, with alerts.

### R-11. How do you stop recurring incidents through SRE practices?
- **Blameless postmortems for every significant incident**, focused on contributing causes in the system (process, tooling, design) rather than who made the mistake ([13 Q4](./13-sre-incident-loadbalancing-servicemesh-qna.md)).
- **Action items that actually get done**: each has an owner, a priority and a due date, tracked in the normal backlog and reviewed weekly. Recurring incidents almost always mean previous action items weren't done.
- **Look for patterns across incidents**: tag incidents by cause (bad deploy, capacity, dependency, config, certificate) and review them monthly; the top category is where to invest.
- **SLOs and error budgets**: when a service burns its error budget, reliability work takes priority over features until it's back within the SLO ([11 Q15](./11-monitoring-logging-observability-qna.md)). This gives teams an agreed rule instead of an argument.
- **Fix the class of problem, not the instance**: if a certificate expired, automate renewal and monitoring for all certificates; if a bad config broke prod, add validation to the pipeline for all configs.
- **Reduce toil**: automate repetitive manual fixes, which are often where new incidents come from ([13 Q11](./13-sre-incident-loadbalancing-servicemesh-qna.md)).
- **Better detection and runbooks**: an alert for what was missed, a runbook for the next responder, and automated remediation where the fix is always the same.
- **Proactive testing**: game days, chaos experiments, DR drills and load tests find the next incident before customers do.
- **Measure**: incident count by severity, repeat-incident rate, MTTD and MTTR, and action-item completion rate.
