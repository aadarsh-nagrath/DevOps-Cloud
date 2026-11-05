# Splunk — Complete Notes (Beginner → Advanced)

> The enterprise "search everything" platform for machine data: log management, SIEM (Enterprise Security), IT operations (ITSI) and observability. Schema-on-read: ingest raw data now, extract fields at search time with **SPL**. Owned by **Cisco** since 2024.

## Table of Contents
1. [Beginner — What & Why](#1-beginner--what--why)
2. [Architecture & Components](#2-architecture--components)
3. [Getting Data In (GDI)](#3-getting-data-in-gdi)
4. [The Indexing Pipeline & Buckets](#4-the-indexing-pipeline--buckets)
5. [Configuration Files (the .conf world)](#5-configuration-files-the-conf-world)
6. [SPL — Search Processing Language](#6-spl--search-processing-language)
7. [Knowledge Objects, Data Models & CIM](#7-knowledge-objects-data-models--cim)
8. [Alerts, Reports & Dashboards](#8-alerts-reports--dashboards)
9. [Clustering, Scaling & SmartStore](#9-clustering-scaling--smartstore)
10. [Splunk with Kubernetes & Cloud](#10-splunk-with-kubernetes--cloud)
11. [Security, Licensing & Cost](#11-security-licensing--cost)
12. [Performance & Troubleshooting](#12-performance--troubleshooting)
13. [Splunk vs ELK vs Loki vs Datadog](#13-splunk-vs-elk-vs-loki-vs-datadog)
14. [Interview Q&A](#14-interview-qa)
15. [Cheat Sheet](#15-cheat-sheet)

---

## 1. Beginner — What & Why

### What is Splunk?
- A platform to **collect, index, search, analyze, alert on and visualize machine data**: logs, events, metrics, config, audit trails. Any text with a timestamp works.
- Core idea: **"Google for your logs."** Data is stored as raw events plus an index of terms, and you query it with **SPL** (Search Processing Language), a Unix-pipe style language.
- **Schema-on-read**: you don't define a schema before ingesting. Fields are mostly extracted **at search time**, so new log formats are searchable immediately. (ELK traditionally needs mappings at ingest; Loki indexes only labels.)

### Product family
| Product | What it is |
|---|---|
| **Splunk Enterprise** | Self-hosted core platform (indexers, search heads, forwarders) |
| **Splunk Cloud Platform** | SaaS version of Enterprise, run by Splunk |
| **Universal Forwarder (UF)** | Free, lightweight agent that ships data |
| **Splunk Enterprise Security (ES)** | **SIEM** app: correlation searches, notable events, risk-based alerting, MITRE ATT&CK mapping |
| **Splunk SOAR** (ex-Phantom) | Security orchestration & automated response playbooks |
| **Splunk ITSI** | IT Service Intelligence: service health scores, KPIs, ML-based adaptive thresholds, event correlation |
| **Splunk Observability Cloud** | Metrics/APM/RUM/synthetics (SignalFx-based), OpenTelemetry-native, competes with Datadog |
| **Splunkbase** | App store: add-ons (TAs) for AWS, Palo Alto, Windows, Linux, Kubernetes… |

### Core vocabulary
| Term | Meaning |
|---|---|
| **Event** | One record (usually one log line or a multi-line stack trace) with a timestamp |
| **Index** | A named data store on disk (`main`, `web`, `security`…). The unit of retention and access control |
| **Sourcetype** | The **format** of the data (`access_combined`, `syslog`, `aws:cloudtrail`). It drives parsing and field extraction |
| **Source** | Where it came from (file path, `http:my_token`, `udp:514`) |
| **Host** | The machine that produced it |
| **Default fields** | `_time`, `_raw`, `host`, `source`, `sourcetype`, `index`, `splunk_server`, `linecount`, `punct`, `_indextime` |
| **Fields** | Key/value pairs pulled out of `_raw`, mostly at search time |
| **App / Add-on (TA)** | A packaged bundle of configs/dashboards/searches. TA = Technology Add-on (inputs + parsing, no UI) |
| **Knowledge objects** | Saved searches, field extractions, lookups, event types, tags, macros, data models |

### Default ports (memorize these)
| Port | Purpose |
|---|---|
| **8000** | Splunk Web (UI) |
| **8089** | splunkd management/REST API (also deployment server ↔ clients, cluster communication) |
| **9997** | Forwarder → indexer data (S2S, "Splunk-to-Splunk") — convention |
| **8088** | HTTP Event Collector (HEC) |
| **8080** | Indexer cluster replication — convention |
| **8191** | KV Store (MongoDB under the hood) |
| **514** | Syslog (UDP/TCP) if you configure a network input (better: syslog-ng/SC4S in front) |

---

## 2. Architecture & Components

### Three tiers
```
   DATA TIER                 INDEXING TIER                  SEARCH TIER
┌───────────────┐        ┌──────────────────┐         ┌──────────────────┐
│ Universal Fwd │─9997──►│  Indexer peer 1  │◄────────│  Search Head(s)  │◄── users / API (8000/8089)
│ Universal Fwd │─9997──►│  Indexer peer 2  │◄────────│  (SH Cluster)    │
│ Heavy Fwd     │─9997──►│  Indexer peer 3  │         └──────────────────┘
│ HEC clients   │─8088──►│   (replicate)    │
│ syslog → SC4S │        └──────────────────┘
└───────────────┘                ▲
                                 │ manages
   MANAGEMENT:  Deployment Server (forwarder configs) · Cluster Manager (indexers)
                SHC Deployer (search head apps) · License Manager · Monitoring Console
```

### Components explained
| Component | Role |
|---|---|
| **Universal Forwarder (UF)** | Tiny agent (~no UI, no Python). Tails files, Windows event logs, scripts, then **forwards** in 64 KB blocks. Doesn't parse (except `INDEXED_EXTRACTIONS` for structured CSV/JSON/W3C). Load-balances across indexers (`autoLB`) |
| **Heavy Forwarder (HF)** | A full Splunk Enterprise instance in forwarding mode. **Parses** data before sending, so it can **filter (send to nullQueue), route, mask/anonymize**, and run modular inputs (API pollers like DB Connect, AWS TA). Heavier, so use it only when needed |
| **Indexer** | Receives data, **parses** it (if not already parsed by an HF), writes it to **buckets** on disk, and executes the distributed part of searches (map phase) |
| **Search Head (SH)** | UI + search coordinator. Sends searches out to indexers, merges results (reduce phase), and holds knowledge objects, dashboards, alerts |
| **Deployment Server (DS)** | Pushes apps/configs to **forwarders** (`serverclass.conf` decides which clients get which apps). Clients poll it on 8089 |
| **Cluster Manager (CM)** (formerly "Master node") | Manages the **indexer cluster**: replication, bucket fix-ups, pushes the config bundle to peers |
| **SHC Deployer** | Pushes apps/config to a **search head cluster** |
| **SHC Captain** | Elected member (Raft) of the SH cluster that coordinates scheduled searches and replicates knowledge objects |
| **License Manager** | Tracks daily ingest volume against the license |
| **Monitoring Console (MC)** | Built-in health/perf dashboards for the whole deployment |

### Distributed search (map-reduce)
1. The user runs SPL on the search head.
2. The SH splits the search: **streaming** commands (`search`, `eval`, `rex`, `where`, `fields`) are pushed to **all indexers** in parallel (map).
3. Each indexer scans only the buckets in the time range, uses tsidx + bloom filters to skip irrelevant ones, and pre-aggregates (e.g. `stats` becomes a partial `prestats`).
4. The SH merges partial results (reduce) and runs **centralized** commands (`sort`, `head`, `transaction`, `dedup` final pass, `join`).

→ That's why **filtering early** matters: the more work done on indexers before the first transforming command, the faster the search.

### Reference topologies
- **Single instance**: indexer + SH on one box. Labs, < ~20 GB/day.
- **Distributed, non-clustered**: N indexers + 1 SH. No data redundancy.
- **Indexer cluster + SH cluster** (production): ≥3 indexers (RF=3, SF=2), ≥3 SHs in an SHC, a CM, a deployer, a DS, and an LM/MC node.
- **Multisite cluster**: indexers in 2+ data centres/AZs with site-aware replication for DR.
- **Splunk Cloud**: Splunk runs indexers/SHs. You run forwarders (often UF → HF/intermediate forwarder → Cloud), or send via HEC/OTel.

Rough sizing rule of thumb: **one indexer per ~100–300 GB/day** depending on search load (premium apps like ES need more indexers, so lower GB/day per indexer).

---

## 3. Getting Data In (GDI)

### Input types
| Input | Example |
|---|---|
| **Files & directories** (`monitor`) | `/var/log/nginx/access.log`. Remembers position in the **fishbucket** (CRC of the first 256 bytes + seek pointer), so restarts don't re-index |
| **Windows** | Event Log (`WinEventLog://Security`), perfmon, registry, AD |
| **Network** | TCP/UDP ports (syslog). Prefer **SC4S** (Splunk Connect for Syslog, syslog-ng in a container → HEC) for production syslog |
| **Scripted / modular inputs** | Run a script or API poller on an interval (AWS, DB Connect, REST APIs) |
| **HTTP Event Collector (HEC)** | Apps/agents POST JSON over HTTPS with a token. Agentless; used by K8s, Lambda, Kinesis Firehose, OTel |
| **OpenTelemetry Collector** | Splunk distribution of the OTel Collector: logs → HEC, metrics/traces → Observability Cloud |

### Universal Forwarder setup (Linux)
```bash
# install
tar -xzf splunkforwarder-*.tgz -C /opt
/opt/splunkforwarder/bin/splunk start --accept-license --answer-yes --no-prompt \
  --seed-passwd 'ChangeMe!'
/opt/splunkforwarder/bin/splunk enable boot-start -systemd-managed 1 -user splunkfwd

# where to send data
/opt/splunkforwarder/bin/splunk add forward-server idx1.corp:9997
# what to collect
/opt/splunkforwarder/bin/splunk add monitor /var/log/nginx/access.log -index web -sourcetype nginx:access
# or make it a deployment client (preferred at scale)
/opt/splunkforwarder/bin/splunk set deploy-poll ds.corp:8089
/opt/splunkforwarder/bin/splunk list forward-server
```

Same thing as config files (what the DS pushes):
```ini
# $SPLUNK_HOME/etc/apps/org_all_forwarder_outputs/local/outputs.conf
[tcpout]
defaultGroup = primary_indexers

[tcpout:primary_indexers]
server = idx1.corp:9997, idx2.corp:9997, idx3.corp:9997
useACK = true                 # indexer acknowledgment, so no data loss if an indexer dies mid-send
autoLBFrequency = 30

# $SPLUNK_HOME/etc/apps/org_nginx_inputs/local/inputs.conf
[monitor:///var/log/nginx/access.log]
index = web
sourcetype = nginx:access
disabled = false

[monitor:///var/log/app/*.log]
index = app
sourcetype = myapp:json
whitelist = \.log$
ignoreOlderThan = 7d
```
On the indexer: `[splunktcp://9997]` in `inputs.conf` (or `splunk enable listen 9997`).

### Deployment Server
```ini
# serverclass.conf on the DS
[serverClass:linux_web]
whitelist.0 = web-*.corp
machineTypesFilter = linux-x86_64

[serverClass:linux_web:app:org_nginx_inputs]
restartSplunkd = true
```
Apps live in `$SPLUNK_HOME/etc/deployment-apps/`. Run `splunk reload deploy-server` after changes.

### HTTP Event Collector (HEC)
```bash
# enable HEC + create token: Settings → Data inputs → HTTP Event Collector
curl -k https://splunk.corp:8088/services/collector/event \
  -H "Authorization: Splunk 11111111-2222-3333-4444-555555555555" \
  -d '{"time": 1760000000, "host":"web-01", "sourcetype":"myapp:json", "index":"app",
       "event": {"level":"ERROR","msg":"payment failed","order_id":42}}'

# raw endpoint (Splunk line-breaks it like a file)
curl -k https://splunk.corp:8088/services/collector/raw?sourcetype=nginx:access \
  -H "Authorization: Splunk <token>" -d '10.0.0.1 - - [13/Oct/2026:10:00:00 +0000] "GET / HTTP/1.1" 200 512'

# health check
curl -k https://splunk.corp:8088/services/collector/health
```
- Tokens are scoped to allowed indexes plus a default index/sourcetype.
- **Indexer acknowledgment** (`useACK`) needs an `X-Splunk-Request-Channel` header plus polling `/services/collector/ack`. Use it when you can't afford loss (Firehose uses it).
- Put HEC behind a load balancer across indexers or HFs. Batch events (multiple JSON objects in one POST).
- `/services/collector/event` also accepts a `fields` object for **indexed fields**, which are fast to `tstats`.

---

## 4. The Indexing Pipeline & Buckets

### Pipeline phases
```
INPUT ──► PARSING ──► MERGING ──► TYPING ──► INDEXING
(UF/HF)   parsingQueue aggQueue    typingQueue indexQueue
          • charset     • line      • regex        • segmentation (terms → tsidx)
          • line break    merging     TRANSFORMS-   • write raw journal (compressed)
          • header       • timestamp  (route,mask,  • write tsidx + bloom filter
            extraction    extraction  nullQueue,
                                      index-time
                                      fields)
```
- Parsing happens on the **first full Splunk instance** the data passes through (HF or indexer), **never twice**. So if an HF parses, props/transforms on the indexer for index-time settings are ignored. This is a classic gotcha.
- **Blocked queues** (`blocked=true` in `metrics.log`) = back-pressure. Usually caused by slow disk, a heavy regex in TRANSFORMS, or the indexer being overloaded.

### Event breaking & timestamps — the "Great 8" props.conf settings
Always set these explicitly for every custom sourcetype. Relying on auto-detection is slow and error-prone.
```ini
# props.conf (on HF/indexer for parsing; EVENT_BREAKER on UF)
[myapp:log]
SHOULD_LINEMERGE = false                 # don't re-merge lines (slow); use LINE_BREAKER instead
LINE_BREAKER = ([\r\n]+)\d{4}-\d{2}-\d{2}  # new event only when a line starts with a date → stack traces stay together
TRUNCATE = 10000                         # max bytes per event (default 10000)
TIME_PREFIX = ^                          # where the timestamp starts
TIME_FORMAT = %Y-%m-%d %H:%M:%S.%3N%z    # strptime format
MAX_TIMESTAMP_LOOKAHEAD = 30             # chars to scan after TIME_PREFIX
EVENT_BREAKER_ENABLE = true              # UF: split stream on event boundaries → safe load balancing
EVENT_BREAKER = ([\r\n]+)\d{4}-\d{2}-\d{2}
# plus usually
TZ = UTC
CHARSET = UTF-8
```
Why it matters: bad timestamps put events in the wrong time (or in the future), so they "disappear" from searches. Bad line breaking splits stack traces into garbage events.

### Index-time transformations (HF/indexer)
```ini
# props.conf
[myapp:log]
TRANSFORMS-drop_debug = drop_debug
TRANSFORMS-route = route_errors_to_errindex
SEDCMD-mask_cc = s/\d{4}-\d{4}-\d{4}-(\d{4})/XXXX-XXXX-XXXX-\1/g   # mask PII before it's written

# transforms.conf
[drop_debug]
REGEX = \sDEBUG\s
DEST_KEY = queue
FORMAT = nullQueue              # discard → saves license!

[route_errors_to_errindex]
REGEX = \sERROR\s
DEST_KEY = _MetaData:Index
FORMAT = app_errors
```
Other DEST_KEYs: `MetaData:Sourcetype`, `MetaData:Host`, `_TCP_ROUTING` (send to a different output group, e.g. a SIEM copy), `_raw` (rewrite). Note that data dropped to nullQueue **doesn't count against the license**, because licensing is measured at the indexing step.

> **Ingest Actions** (UI-driven) and **Edge Processor / Ingest Processor** (SPL2 pipelines) are newer ways to filter/mask/route without hand-editing transforms.

### Index buckets (data lifecycle)
| Stage | State | Location (`indexes.conf`) |
|---|---|---|
| **Hot** | Being written, searchable | `homePath` (fast SSD) |
| **Warm** | Rolled from hot, read-only | `homePath` |
| **Cold** | Older, read-only | `coldPath` (cheaper disk) |
| **Frozen** | **Deleted by default**, or archived via `coldToFrozenDir`/script. Not searchable | your archive (S3/NAS) |
| **Thawed** | Archived data manually restored to make it searchable again | `thawedPath` |

Each bucket = directory `db_<newestTime>_<oldestTime>_<id>` (`rb_` for replicated copies in a cluster) containing:
- `rawdata/journal.zst|gz`: the compressed raw events (~15% of original size).
- `*.tsidx`: time-series index files (lexicon of terms → event positions) (~35% of original size).
- `bloomfilter`: quick "is this term definitely NOT in this bucket?" check.
- Metadata files (`Hosts.data`, `Sources.data`, `SourceTypes.data`).
- **Disk rule of thumb**: indexed data ≈ **50% of raw ingest** (15% raw + 35% index) × replication.

```ini
# indexes.conf
[web]
homePath   = $SPLUNK_DB/web/db
coldPath   = $SPLUNK_DB/web/colddb
thawedPath = $SPLUNK_DB/web/thaweddb
frozenTimePeriodInSecs = 7776000      # 90 days → freeze (default ~6 years)
maxTotalDataSizeMB = 500000           # size cap: whichever limit hits first freezes oldest buckets
maxDataSize = auto_high_volume        # 10 GB hot buckets for >10 GB/day indexes (auto = 750 MB)
maxHotBuckets = 10
repFactor = auto                      # replicate in an indexer cluster (MUST set, default 0!)
coldToFrozenDir = /archive/web
```
Retention gotcha: a bucket freezes only when its **newest** event is older than `frozenTimePeriodInSecs`. So one wrong future timestamp can keep a whole bucket around for too long.

### Metrics indexes
- `datatype = metric` indexes store numeric measurements (much smaller and faster than event logs).
- Query with `| mstats avg(cpu.util) WHERE index=metrics span=1m BY host`. Convert logs to metrics with `mcollect` or log-to-metrics sourcetypes.

---

## 5. Configuration Files (the .conf world)

### Key files
| File | Purpose |
|---|---|
| `inputs.conf` | What data to collect / which ports to listen on |
| `outputs.conf` | Where forwarders send data |
| `props.conf` | Per-sourcetype/source/host parsing + search-time extraction rules |
| `transforms.conf` | Regex rules referenced from props (routing, masking, lookups, REPORT extractions) |
| `indexes.conf` | Index definitions, paths, retention |
| `server.conf` | Instance settings, clustering, SHC, KV store |
| `serverclass.conf` | Deployment server mapping |
| `authentication.conf` / `authorize.conf` | LDAP/SAML auth, roles and capabilities |
| `savedsearches.conf` | Reports and alerts |
| `limits.conf` | Search limits (memory, concurrency, result counts) |
| `distsearch.conf` | Search peers |
| `web.conf` | Splunk Web (SSL, port) |

### Directory layout & precedence
```
$SPLUNK_HOME/etc/
├── system/default/   ← NEVER edit (overwritten on upgrade)
├── system/local/
├── apps/<app>/default/   ← shipped by the app author
├── apps/<app>/local/     ← your overrides
├── users/<user>/<app>/local/
├── deployment-apps/      (DS only)
├── manager-apps/         (CM only, pushed to peers → peer-apps/ on indexers)
└── shcluster/apps/       (deployer only)
```
- **Index-time / global context** precedence (high → low): `system/local` → `apps/*/local` → `apps/*/default` (apps in ASCII order) → `system/default`.
- **Search-time / app-user context**: current user → current app `local` → current app `default` → other apps (exported) → `system`.
- **Golden rule**: put all config in **apps** (`org_<purpose>`), never `system/local`, so it's portable and deployable.
- **`btool`** shows the merged effective config and **which file each line came from**:
```bash
splunk btool props list myapp:log --debug
splunk btool inputs list --debug | grep -i nginx
splunk btool check            # syntax/typo check
```

---

## 6. SPL — Search Processing Language

### Anatomy
```spl
index=web sourcetype=nginx:access status>=500 earliest=-4h      ← base search (filter as much as possible here)
| eval is_slow = if(request_time > 1, 1, 0)                      ← streaming
| stats count AS errors, avg(request_time) AS avg_rt, sum(is_slow) AS slow BY uri_path   ← transforming
| where errors > 10
| sort - errors
| head 10
```
The pipe `|` passes results left to right, like Unix.

### Command categories (important for performance)
| Type | Runs where | Examples |
|---|---|---|
| **Distributable streaming** | On indexers, event by event | `search`, `where`, `eval`, `rex`, `fields`, `rename`, `spath`, `lookup` (most) |
| **Centralized streaming** | On the SH, order-dependent | `head`, `streamstats`, `transaction`, `dedup` (partly) |
| **Transforming** | Produce a table | `stats`, `chart`, `timechart`, `top`, `rare` |
| **Generating** | Start a search with a leading pipe | `\| tstats`, `\| inputlookup`, `\| makeresults`, `\| rest`, `\| metadata`, `\| mstats` |
| **Dataset processing** | Need all results | `sort`, `eventstats`, `join`, `append` |

### Time
```spl
earliest=-24h@h latest=now          ← relative, snapped to the hour
earliest=-7d@w1                     ← snapped to Monday
earliest="10/13/2026:00:00:00"
| bin _time span=5m
| eval lag = _indextime - _time     ← ingestion latency
```
Search modes: **Fast** (no field discovery), **Smart** (default), **Verbose** (all fields, slowest).

### Must-know commands with examples
```spl
# --- searching & filtering ---
index=app (level=ERROR OR level=FATAL) NOT "healthcheck" host=web-*
index=app | where response_time > 2 AND like(uri, "/api/%")
index=fw | search action=blocked dest_port IN (22, 3389)

# --- field extraction on the fly ---
index=app | rex field=_raw "user=(?<user>\w+)\s+ip=(?<ip>\d+\.\d+\.\d+\.\d+)"
index=app | rex mode=sed field=email "s/(.).*@/\1***@/"          # mask in results
index=app sourcetype=myapp:json | spath input=_raw path=payload.order.id output=order_id
index=app | extract kvdelim="=" pairdelim=" "

# --- eval functions ---
| eval status_class = case(status<300,"2xx", status<400,"3xx", status<500,"4xx", true(),"5xx")
| eval mb = round(bytes/1024/1024, 2)
| eval day = strftime(_time, "%Y-%m-%d"), epoch = strptime(ts, "%Y-%m-%dT%H:%M:%S")
| eval user = coalesce(user, src_user, "unknown")
| eval is_internal = if(cidrmatch("10.0.0.0/8", src_ip), "yes", "no")
| eval domain = mvindex(split(email, "@"), 1)
| eval t = tostring(duration, "duration")

# --- aggregation ---
| stats count, dc(user) AS unique_users, avg(rt), perc95(rt), max(rt), values(host), latest(status) BY service
| timechart span=5m count BY status limit=10 useother=f
| chart count OVER uri BY status
| top limit=10 src_ip
| rare useragent
| eventstats avg(rt) AS svc_avg BY service | where rt > 3*svc_avg       # outliers vs own service
| streamstats count AS n BY session_id                                   # running counters
| streamstats time_window=5m count BY user | where count > 20            # brute-force-ish detection

# --- shaping ---
| table _time host status uri | rename uri AS "Endpoint"
| fields - _raw | fields host, status
| sort - count | dedup user | head 20
| fillnull value=0 | mvexpand recipients | makemv delim="," tags

# --- lookups (enrichment) ---
| lookup assets.csv ip AS src_ip OUTPUT owner, criticality
| inputlookup blocked_ips.csv
| ... | outputlookup new_iocs.csv
| iplocation src_ip | geostats count BY Country

# --- combining ---
| join type=left user [search index=hr | fields user dept]   # avoid if possible (subsearch limits: 50k rows, 60s)
| append [search index=b ...]
| stats values(*) AS * BY session_id                           # the "stats instead of join" trick

# --- transactions / sessions ---
| transaction session_id maxspan=30m maxpause=5m              # expensive; prefer stats:
| stats min(_time) AS start, max(_time) AS end, count BY session_id | eval duration=end-start

# --- fast searches over indexed fields / data models ---
| tstats count WHERE index=* BY index, sourcetype                    # what data do I have? (seconds, not minutes)
| tstats count WHERE index=web BY _time span=1h, host
| tstats summariesonly=t count FROM datamodel=Authentication WHERE Authentication.action=failure BY Authentication.src
| metadata type=hosts index=app | eval age=now()-lastTime | where age > 3600   # silent hosts

# --- testing / generating ---
| makeresults count=5 | eval x=random()%100
| rest /services/server/info | table serverName version
```

### Classic DevOps searches
```spl
# HTTP error rate % per service, 5 min buckets
index=web sourcetype=nginx:access
| eval err = if(status>=500,1,0)
| timechart span=5m sum(err) AS errors count AS total BY service
# (or with stats then eval rate = round(errors/total*100, 2))

# p95/p99 latency
index=web | timechart span=1m perc95(request_time) AS p95 perc99(request_time) AS p99

# Top exceptions in the last hour
index=app level=ERROR earliest=-1h
| rex "(?<exception>\w+(\.\w+)*Exception)"
| stats count BY exception | sort - count

# Failed SSH logins → brute-force candidates
index=os sourcetype=linux_secure "Failed password"
| rex "from (?<src_ip>\d+\.\d+\.\d+\.\d+)"
| stats count BY src_ip | where count > 20

# Kubernetes pod restarts / OOMKilled (OTel logs or k8s events)
index=k8s_events reason IN ("OOMKilling","BackOff") | stats count BY namespace, involvedObject.name

# Hosts that stopped sending logs (forwarder down)
| tstats latest(_time) AS last WHERE index=* BY host
| eval mins_ago = round((now()-last)/60) | where mins_ago > 15

# Deployment correlation: errors before vs after a deploy marker
index=app level=ERROR | timechart span=1m count
| appendcols [search index=cicd event=deploy | timechart span=1m count AS deploys]
```

### SPL2 (newer)
A SQL-friendlier evolution (`FROM main WHERE status=500 | stats count() BY host`), used in Edge/Ingest Processor pipelines and newer Cloud features. Classic SPL is still what most interviews and jobs use.

---

## 7. Knowledge Objects, Data Models & CIM

| Object | What it does |
|---|---|
| **Field extraction** | `EXTRACT-<name> = regex` (inline) or `REPORT-<name> = transform` in props.conf (search time) |
| **Field alias** | `FIELDALIAS-x = src_ip AS src`: normalizes names |
| **Calculated field** | `EVAL-is_error = if(status>=500,1,0)`: always-on eval |
| **Lookup** | CSV, KV Store, external script or geo. Automatic lookups via `LOOKUP-` in props |
| **Event type** | A saved search string naming a category of events (`eventtype=failed_login`) |
| **Tag** | Label applied to field values/event types (`tag=authentication`). The CIM relies on tags |
| **Macro** | Reusable SPL snippet: `` `web_errors(5m)` `` |
| **Workflow action** | Right-click link from a field to a URL/another search |
| **Data model** | Hierarchical, normalized schema over events (datasets with constraints + fields). Powers Pivot and `tstats` |

### Index-time vs search-time extraction
| | Search-time (default, preferred) | Index-time |
|---|---|---|
| When | At query | At ingest, written into tsidx |
| Flexibility | Change any time, applies to old data | Only affects newly indexed data |
| Cost | CPU at search | More disk, slower indexing |
| Use for | Almost everything | Fields you `tstats` on constantly; structured data via `INDEXED_EXTRACTIONS=json` |

### CIM — Common Information Model
- A Splunk-provided set of **data models with standard field names** (`Authentication`, `Network_Traffic`, `Web`, `Endpoint`, `Malware`, `Change`…).
- Every vendor names fields differently (`srcip`, `src_addr`, `client_ip`). **TAs map them to CIM** (`src`, `dest`, `user`, `action`), so one search or one ES correlation rule works across all vendors.
- **Data model acceleration (DMA)** builds tsidx summaries in the background, so `tstats ... FROM datamodel=...` is 10–100× faster. Enterprise Security depends on it.

### Other acceleration options
- **Report acceleration**: auto summaries for one saved report.
- **Summary indexing**: a scheduled search writes aggregates into a summary index via `| collect index=summary` or `si*` commands. Cheap long-term trending (and summary data doesn't count against the license).

---

## 8. Alerts, Reports & Dashboards

### Alerts
- **Scheduled alert**: runs on cron (`*/5 * * * *`) over a time window and fires when the condition is met (results > 0, custom `where`, etc.). This is the **default choice**.
- **Real-time alert**: continuous. Expensive (it holds a search slot permanently), so avoid it in most cases.
- **Trigger**: once per search, or **per result** (one alert per host).
- **Throttling**: suppress repeats for X minutes, optionally per field (`host`). This is the main tool against alert fatigue.
- **Actions**: email, webhook, Slack/Teams apps, PagerDuty/Opsgenie/ServiceNow add-ons, run a SOAR playbook, log event, output to lookup, ES notable event.
- Make windows **overlap the schedule plus ingest lag**: e.g. run every 5 min over `earliest=-10m@m latest=-5m@m` so late-arriving events aren't missed.

```ini
# savedsearches.conf (what the UI writes)
[High 5xx rate - checkout]
search = index=web service=checkout status>=500 | stats count | where count > 50
cron_schedule = */5 * * * *
dispatch.earliest_time = -10m@m
dispatch.latest_time = -5m@m
enableSched = 1
alert.track = 1
alert.suppress = 1
alert.suppress.period = 30m
action.webhook = 1
action.webhook.param.url = https://hooks.slack.com/services/XXX
```

### Dashboards
- **Classic (Simple XML)**: older, huge ecosystem, tokens/drilldowns.
- **Dashboard Studio** (JSON): modern, pixel-precise layout, recommended for new work.
- Best practice: use a **base search + post-process** (chain searches) so 10 panels don't run 10 full searches. Use `tstats`/accelerated data models. Add time pickers and tokens. Avoid real-time panels.

### Search scheduling & concurrency
- Max concurrent searches ≈ `max_searches_per_cpu × CPUs + base_max_searches`. Scheduled searches can use ~50% of that by default.
- **Skipped searches** (Monitoring Console → Scheduler Activity) = too many alerts scheduled at the same minute. Spread cron times (`3-59/5`) and use `schedule_window`.

---

## 9. Clustering, Scaling & SmartStore

### Indexer clustering
- **Replication Factor (RF)**: number of copies of raw data across peers (default **3**). The cluster can lose RF−1 peers without losing data.
- **Search Factor (SF)**: number of **searchable** copies (with tsidx) (default **2**). SF ≤ RF. Non-searchable copies are raw only, so they're smaller but need rebuilding to become searchable.
- **Cluster Manager** tracks bucket copies and orchestrates **bucket fix-up** when a peer dies (re-replicating to restore RF/SF). It is NOT in the data path, so indexing and search continue if it's briefly down.
- Peers get config via `splunk apply cluster-bundle` from `$SPLUNK_HOME/etc/manager-apps` → `peer-apps` on each peer (rolling restart if needed).
- Forwarders can use **indexer discovery** (they ask the CM for the peer list) instead of hardcoded servers.
- **Maintenance mode** (`splunk enable maintenance-mode`) pauses fix-ups during upgrades/restarts so the cluster doesn't start re-replicating terabytes unnecessarily.
- **Multisite**: `site_replication_factor = origin:2,total:3`, `site_search_factor = origin:1,total:2`. Search affinity makes SHs prefer local-site peers. This gives you DR across data centres.

```ini
# server.conf on the manager
[clustering]
mode = manager
replication_factor = 3
search_factor = 2
pass4SymmKey = <secret>

# server.conf on each peer
[replication_port://8080]
[clustering]
mode = peer
manager_uri = https://cm.corp:8089
pass4SymmKey = <secret>
```
```bash
splunk show cluster-status --verbose
splunk apply cluster-bundle --answer-yes
splunk rolling-restart cluster-peers
```

### Search head clustering (SHC)
- Minimum **3 members** (Raft quorum). A **captain** is elected dynamically and schedules searches, replicating knowledge objects and search artifacts.
- Apps are pushed from the **deployer**: `splunk apply shcluster-bundle -target https://sh1:8089`.
- Put a load balancer (sticky sessions) in front for users.
```bash
splunk show shcluster-status
splunk transfer shcluster-captain -mgmt_uri https://sh2:8089
```

### SmartStore (S2)
- Moves **warm/cold buckets to object storage** (S3, GCS, Azure Blob). Indexers keep only hot buckets plus a **local cache** of recently-searched data.
- Compute and storage scale independently. Indexers become close to stateless, so replacing one is quick, and storage cost drops a lot.
- Replication only applies to hot buckets (object storage handles durability).
- Trade-off: searches over old, uncached data must fetch from S3 first, so **size the cache for the typical search window** (e.g. 7–30 days of data locally).
```ini
[volume:remote_store]
storageType = remote
path = s3://my-splunk-smartstore/indexes

[default]
remotePath = volume:remote_store/$_index_name
```

---

## 10. Splunk with Kubernetes & Cloud

### Kubernetes log collection
- **Splunk OpenTelemetry Collector for Kubernetes** (Helm chart `splunk-otel-collector`) is the current method. (**Splunk Connect for Kubernetes (SCK)**, which was Fluentd-based, reached end-of-support in 2024.)
- It runs a DaemonSet agent tailing `/var/log/pods/*`, enriches events with K8s metadata (namespace, pod, container, labels), and sends logs to **HEC**. It can also send metrics/traces to Observability Cloud.
```bash
helm repo add splunk-otel-collector-chart https://signalfx.github.io/splunk-otel-collector-chart
helm install splunk-otel splunk-otel-collector-chart/splunk-otel-collector \
  --set clusterName=prod-eks \
  --set splunkPlatform.endpoint=https://splunk.corp:8088/services/collector \
  --set splunkPlatform.token=$HEC_TOKEN \
  --set splunkPlatform.index=k8s_logs \
  --set splunkPlatform.insecureSkipVerify=false
```
- Route per namespace to different indexes via pod/namespace annotation `splunk.com/index: team-a`.
- Exclude noisy namespaces/containers with the chart's filters, or use annotation `splunk.com/exclude: "true"`.
- **Splunk Operator for Kubernetes** lets you *run Splunk Enterprise itself* on K8s (CRDs: `Standalone`, `IndexerCluster`, `SearchHeadCluster`, `ClusterManager`), typically with SmartStore.

### AWS
- **Splunk Add-on for AWS** (TA on an HF / IDM in Cloud): CloudTrail, CloudWatch logs/metrics, Config, VPC Flow Logs, S3 via SQS-based S3 input.
- **Kinesis Data Firehose → HEC** (with indexer ack) is the push alternative that needs no HF.
- Lambda/containers: log drivers or the OTel Collector → HEC.

### CI/CD & DevOps uses
- Ship pipeline events (Jenkins/GitHub Actions plugins → HEC) and correlate deploys with error spikes.
- Audit trail: `index=_audit` shows who searched what. Cloud audit logs show who changed what.
- Manage Splunk config as code: apps in Git → CI (`splunk btool check`, AppInspect for Cloud) → DS/CM/deployer push or the Ansible role (`splunk-ansible`) / Terraform provider (`splunk/splunk`) for HEC tokens, indexes, saved searches.

---

## 11. Security, Licensing & Cost

### Access control
- **Roles** (`admin`, `power`, `user`, `can_delete` + custom) grant **capabilities** and **allowed indexes** (`srchIndexesAllowed`, `srchIndexesDefault`) plus search filters (row-level restriction).
- **Index-level separation** is the main data-isolation tool. Put sensitive data in its own index and restrict that index by role.
- Auth: native, LDAP, **SAML SSO** (Okta/Azure AD), MFA.
- TLS on S2S (9997), HEC, web, and management. Change the default `pass4SymmKey`s. Ship config with no plaintext secrets (Splunk encrypts them using `splunk.secret`).
- `delete` command (requires the `can_delete` role) only **hides** events from search. It doesn't free disk or license.

### Licensing models
- **Ingest-based** (classic): licensed in **GB/day of raw data indexed**. Measured once at indexing. Data dropped to nullQueue before that isn't counted. Summary indexes and the internal `_*` indexes don't count.
  - Exceeding it creates a **license warning**. Too many warnings in a rolling 30-day window = **violation**. On smaller licenses search is blocked until the window clears (indexing continues, so data isn't lost).
- **Workload / SVC-based** (Splunk Cloud, Enterprise workload pricing): pay for compute (vCPU / Splunk Virtual Compute), not ingest volume. Better if you ingest lots but search lightly.
- Check usage: `index=_internal source=*license_usage.log type=Usage | stats sum(b) AS bytes BY idx, st | eval GB=round(bytes/1024/1024/1024,2)`

### Cost-control playbook (a common senior question)
1. **Drop noise before indexing**: DEBUG logs, health checks, duplicate events via nullQueue / Ingest Actions / Edge Processor.
2. **Trim events**: remove giant useless fields/payloads with SEDCMD. Prefer JSON over verbose text.
3. **Route** low-value, high-volume data (VPC flow, CDN logs) to cheaper storage: S3 + **Federated Search for Amazon S3**, or a data lake.
4. **Logs → metrics** for things you only chart (much cheaper in metrics indexes).
5. **Retention per index** sized to real need (90d hot/searchable, archive frozen to S3/Glacier for compliance).
6. **SmartStore** for storage cost.
7. **Showback**: license usage per index/sourcetype per team, with alerts on sudden ingest spikes (e.g. a debug flag left on).

---

## 12. Performance & Troubleshooting

### Search performance rules
1. **Always specify `index=`** (and `sourcetype=`). Never `index=*` in saved searches.
2. **Narrow the time range**. Time is the #1 filter, because buckets are organized by time.
3. **Filter in the base search** with literal terms before the first pipe. Indexers use tsidx and bloom filters to skip buckets.
4. **Avoid leading wildcards** (`*error`) because they can't use the lexicon. Trailing ones are fine.
5. **`fields`** early to drop what you don't need (less data shipped from indexers).
6. Prefer **`stats` over `transaction`/`join`**. Subsearches cap at 10k–50k results and 60s by default, and silently truncate.
7. Use **`tstats`** on indexed fields and accelerated data models.
8. Put **transforming commands as early as possible**. Streaming before transforming, dataset processing (sort) last.
9. Use the **Job Inspector** (Job → Inspect) to see time per command, `scanCount` vs `resultCount`, and the `normalizedSearch`. A large scan with small results means your base search filters too little.

### "My data isn't showing up" — checklist
```spl
# 1. Is the forwarder even connected / sending?
index=_internal host=<fwd_host> source=*splunkd.log* (ERROR OR WARN) component=TcpOutputProc
index=_internal source=*metrics.log* group=tcpin_connections hostname=<fwd_host>

# 2. Did data land somewhere unexpected (wrong index / time)?
| tstats count WHERE index=* host=<host> BY index, sourcetype
index=* host=<host> earliest=-1y latest=+10y | stats min(_time) max(_time) BY index   # timestamp parsed wrong?

# 3. Ingestion lag
index=app | eval lag=_indextime-_time | stats avg(lag) max(lag) BY host

# 4. Blocked queues / pipeline back-pressure
index=_internal source=*metrics.log* group=queue blocked=true | stats count BY host, name

# 5. Parsing issues (line breaking / timestamps)
index=_internal source=*splunkd.log* (component=LineBreakingProcessor OR component=DateParserVerbose OR component=AggregatorMiningProcessor)
```
Then on the forwarder:
```bash
splunk list forward-server            # active vs configured
splunk list monitor                   # what it's tailing
splunk btool inputs list --debug      # effective config
tail -f $SPLUNK_HOME/var/log/splunk/splunkd.log
# file not indexed because "already seen"? → fishbucket / crcSalt = <SOURCE> (careful: re-indexes on rename)
```
Common causes: wrong index name (it doesn't exist, so the event is dropped / goes to lastChanceIndex), the user's role can't see that index, timestamp parsed into the past/future, firewall on 9997, TLS/cert mismatch, the file owned by root while the UF runs as `splunkfwd`, `ignoreOlderThan`, or the files being identical in their first 256 bytes (CRC collision, so set `crcSalt`/`initCrcLength`).

### Internal indexes
| Index | What's in it |
|---|---|
| `_internal` | Splunk's own logs (`splunkd.log`, `metrics.log`, `license_usage.log`, `scheduler.log`) |
| `_audit` | Who logged in, searched, changed config |
| `_introspection` | Resource usage (CPU, memory, disk) per process/search |
| `_telemetry` | Usage telemetry |
| `_configtracker` | Config file change history (newer versions) |

---

## 13. Splunk vs ELK vs Loki vs Datadog

| | **Splunk** | **ELK / OpenSearch** | **Grafana Loki** | **Datadog Logs** |
|---|---|---|---|---|
| Model | Commercial, self-host or Cloud | OSS/Elastic license, self-host or Elastic Cloud | OSS (AGPL), self-host or Grafana Cloud | SaaS only |
| Indexing | Raw journal + term index (tsidx), **schema on read** | Full inverted index per field, mapping at ingest | Labels only, grep content | Indexed per pipeline, pay per indexed GB + retention |
| Query | **SPL** (very powerful pipelines) | KQL/Lucene, ES\|QL | LogQL | Datadog query syntax |
| Strength | SIEM/security (ES), compliance, any data format, huge app ecosystem, mature enterprise RBAC | Full-text search, flexible, large community | Cheapest at scale for K8s logs, Grafana-native | Unified metrics/APM/logs, zero ops |
| Weakness | **Expensive** (ingest licensing), heavy to operate on-prem | Ops-heavy (JVM, shards, mappings) | Weak for arbitrary full-text/analytics over everything | Cost at volume, vendor lock-in |
| Typical buyer | Enterprises, banks, telcos, SOC teams | Engineering teams, search use cases | Cloud-native teams already on Prometheus/Grafana | Cloud-native SaaS companies |

**Interview soundbite**: "Splunk wins on security/compliance and ad-hoc analysis of any data format with SPL. Loki wins on cost for K8s logs. ELK sits in between. Many companies run Splunk for security/audit and Loki or Datadog for app logs, with an OTel Collector routing each stream to the right backend."

---

## 14. Interview Q&A

**Q1. Explain the Splunk architecture.**
Forwarders (UF/HF) collect and send data on 9997. Indexers parse, index into buckets and serve distributed searches. Search heads provide the UI and coordinate searches (map-reduce across indexers). The management layer has the deployment server (forwarder config), cluster manager (indexer cluster), deployer (SHC), license manager and monitoring console.

**Q2. Universal vs Heavy Forwarder?**
The UF is a lightweight agent that collects and forwards without parsing (except indexed extractions for structured data). It uses little CPU and RAM. The HF is a full Splunk instance that parses, so it can filter, mask, route and run modular/API inputs. Use UFs everywhere, and HFs only where you need parsing-tier logic or API pulls.

**Q3. What happens to data from input to search?**
Input → parsing (line breaking, timestamps, host/source/sourcetype) → merging → typing (regex transforms, routing, masking) → indexing (segmentation into tsidx + compressed raw journal in hot buckets). At search time: bucket selection by time → bloom filter → tsidx lookup → read raw → search-time field extraction → SPL pipeline.

**Q4. Describe the bucket lifecycle.**
Hot (writing) → warm (read-only, same disk) → cold (cheaper disk) → frozen (deleted or archived, not searchable) → thawed (restored manually). Rolling is triggered by size, count, age (`frozenTimePeriodInSecs`) and total index size (`maxTotalDataSizeMB`).

**Q5. RF vs SF?**
RF = total copies of the raw data (data durability). SF = how many of those copies are searchable, with index files (search availability). With RF=3/SF=2 you can lose 2 peers without data loss and 1 without losing immediate searchability.

**Q6. Index-time vs search-time field extraction — which and why?**
Prefer search-time: it's flexible, applies retroactively and uses no extra disk. Use index-time only for fields you aggregate constantly with `tstats`, or for structured data with `INDEXED_EXTRACTIONS`. Index-time choices are permanent for data already indexed.

**Q7. How would you stop DEBUG logs from consuming license?**
On the HF/indexer (the parsing tier), use a `props.conf` TRANSFORMS that matches DEBUG with `DEST_KEY=queue` and `FORMAT=nullQueue`. Or use Ingest Actions/Edge Processor. Even better, fix the log level at the source. Licensing is measured at indexing, so nullQueued data isn't counted.

**Q8. How do you mask PII/credit-card data?**
`SEDCMD` in props.conf or a `TRANSFORMS` rewriting `_raw` on the parsing tier, before data is written to disk. `rex mode=sed` at search time only hides it in results, and the data is still on disk.

**Q9. stats vs eventstats vs streamstats?**
`stats` aggregates and replaces events with a summary table. `eventstats` computes the aggregate and **adds it to every event** (keeps events, e.g. compare each event with its group average). `streamstats` computes a **running** aggregate in event order (running counts, moving windows, sessions).

**Q10. Why avoid join and transaction?**
They're centralized on the search head, memory-heavy, and subsearches are limited (default 50k rows/60s) and truncate silently. Use `stats ... BY common_field` with `values()`/`min(_time)`/`max(_time)` instead, which is distributed and scales.

**Q11. What is tstats and why is it fast?**
A generating command that queries **tsidx files directly** (indexed fields like index/sourcetype/host/source/_time, or accelerated data model summaries) without reading raw events. So it's orders of magnitude faster. Example: `| tstats count where index=* by index, sourcetype`.

**Q12. What is the CIM and why does it matter?**
The Common Information Model is a set of standard data models and field names. TAs map vendor-specific fields to CIM names, so the same searches, dashboards and ES correlation rules work across all vendors. With data model acceleration it makes security searches fast.

**Q13. Logs aren't showing up from a server. Troubleshoot.**
Check the forwarder's splunkd.log and `list forward-server` (connectivity/TLS/9997). Check `_internal` metrics for tcpin from that host. Search `index=*` over a wide time range for timestamp misparsing. Verify the index exists and the role can see it. Check file permissions for the splunkfwd user, `ignoreOlderThan`, CRC/fishbucket issues, and blocked queues on indexers.

**Q14. What is the fishbucket?**
An internal index on the forwarder that tracks, for each monitored file, a CRC of its head and the read offset. That lets the forwarder resume after restarts without re-indexing. Files with identical headers can be mistaken for the same file, which is what `crcSalt` fixes.

**Q15. Deployment Server vs Cluster Manager vs Deployer?**
The DS pushes apps to **forwarders** (and standalone instances). The CM pushes the config bundle to **indexer cluster peers** and manages replication. The Deployer pushes apps to **search head cluster** members. Don't use the DS to manage cluster members.

**Q16. What is SmartStore and the trade-offs?**
It moves warm buckets to S3-compatible object storage with a local cache on indexers. Compute and storage scale separately, it's cheaper, and indexers recover fast. The cost is latency when searching old data that isn't in the cache, and a dependency on object store availability and performance.

**Q17. How do you design a good alert?**
Base it on a user-impacting symptom. Schedule it rather than run it real-time, with the window lagged to account for ingestion delay. Set clear thresholds, throttle per entity, route to the right on-call tool with a runbook link, and review noisy alerts regularly. Spread cron schedules to avoid skipped searches.

**Q18. How does HEC work and how do you make it reliable?**
Clients POST JSON/raw events over HTTPS with a token (`Authorization: Splunk <token>`) to port 8088. For reliability: use a load balancer across HEC endpoints, indexer acknowledgment with channels, batching, and retries in the client/OTel Collector with a persistent queue.

**Q19. How do you get Kubernetes logs into Splunk?**
Deploy the Splunk OTel Collector Helm chart as a DaemonSet. It tails container logs, enriches them with K8s metadata, and sends them to HEC, with index routing via annotations. (Splunk Connect for Kubernetes is deprecated.)

**Q20. Splunk is too expensive. What do you do?**
Measure license usage per index/sourcetype, drop/trim noise at ingest, convert chart-only logs to metrics, tier retention, use SmartStore, move bulk low-value data (flow logs, CDN) to S3 with federated search or a cheaper backend like Loki, and consider workload-based pricing if ingest is high but search is light.

**Q21. What's the difference between Splunk Enterprise Security and core Splunk?**
Core is the data platform. ES is a premium SIEM app on top: CIM-based correlation searches generate **notable events** / **risk-based alerts** in an incident review queue, with asset/identity enrichment, threat intel, MITRE mapping and investigation workflows. SOAR adds automated response playbooks.

**Q22. Config precedence — you set a value and it's not taking effect. Why?**
Another app or `system/local` overrides it, or it's in the wrong context (index-time settings on a UF instead of the parsing tier, or on the indexer while an HF already parsed the data). Use `splunk btool <file> list --debug` to see the winning value and its source file, and remember that some changes need a restart.

---

## 15. Cheat Sheet

```bash
# service
splunk start | stop | restart | status
splunk enable boot-start -systemd-managed 1 -user splunk
splunk version

# forwarder
splunk add forward-server idx:9997 ; splunk list forward-server
splunk add monitor /var/log/x.log -index app -sourcetype x ; splunk list monitor
splunk set deploy-poll ds:8089
splunk enable listen 9997                     # on indexer

# config debugging
splunk btool <conf> list [stanza] --debug
splunk btool check
splunk reload deploy-server

# clustering
splunk show cluster-status --verbose
splunk apply cluster-bundle --answer-yes
splunk enable maintenance-mode / disable maintenance-mode
splunk show shcluster-status
splunk apply shcluster-bundle -target https://sh1:8089

# REST API (8089)
curl -k -u admin:pass https://splunk:8089/services/search/jobs -d search="search index=_internal | head 5" -d exec_mode=oneshot -d output_mode=json
```

```spl
| tstats count WHERE index=* BY index, sourcetype                 ← inventory
index=_internal source=*license_usage.log type=Usage | stats sum(b) BY idx   ← license by index
index=_internal source=*metrics.log group=queue blocked=true       ← pipeline pressure
index=_internal sourcetype=scheduler status=skipped | stats count BY savedsearch_name   ← skipped searches
index=_audit action=search info=completed | stats count BY user    ← who searches
| rest /services/data/indexes | table title currentDBSizeMB frozenTimePeriodInSecs
```

| Number to remember | Value |
|---|---|
| Web / mgmt / S2S / HEC / KV ports | 8000 / 8089 / 9997 / 8088 / 8191 |
| Default RF / SF | 3 / 2 |
| Raw → disk ratio | ~15% journal + ~35% tsidx ≈ 50% |
| Default `frozenTimePeriodInSecs` | 188697600 (~6 years) |
| Default `maxTotalDataSizeMB` | 500000 |
| Hot bucket size | auto = 750 MB, auto_high_volume = 10 GB |
| Default TRUNCATE | 10000 bytes |
| Subsearch limits | 10k results (subsearch) / 50k (join), 60s |
| SHC minimum members | 3 |
