# System Design, SRE Metrics & Staff/Principal SRE — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. System-design rounds as SRE/DevOps interviews run them (capacity numbers, failure modes, operations), reliability metrics, and the Staff/Principal "how do you change an organisation" questions. Each answer is structured the way you'd speak it.

Already answered elsewhere, not repeated here:
| Topic | Where |
|---|---|
| CAP theorem, eventual consistency, replication vs sharding | [17 Q8, Q9, Q11, Q12](./17-messaging-caching-distributed-systems-qna.md) |
| Circuit breakers, cascading failures | [13 Q15](./13-sre-incident-loadbalancing-servicemesh-qna.md), [Resilience patterns](../Service%20Mesh/resilience-patterns.md) |
| SLIs/SLOs/error budgets · toil · MTTD/MTTA/MTTR | [28 Q17](./28-production-scenarios-rapid-round-qna.md), [11 Q15, Q25](./11-monitoring-logging-observability-qna.md) · [13 Q11](./13-sre-incident-loadbalancing-servicemesh-qna.md) · [13 Q10](./13-sre-incident-loadbalancing-servicemesh-qna.md) |
| P1/SEV1 incident handling, blameless postmortems, on-call | [13 Q12, Q19](./13-sre-incident-loadbalancing-servicemesh-qna.md), [Incident Response notes](../Incident%20Response%20and%20On-Call/incident-response-overview.md) |
| Blast radius (K8s), influencing without authority | [04 Q48](./04-kubernetes-qna.md) · [14 Q21](./14-deployment-systemdesign-behavioral-qna.md) |

---

## Table of Contents
**System design**
1. [Design a URL shortener](#01-design-a-url-shortener)
2. [Design a distributed rate limiter](#02-design-a-distributed-rate-limiter)
3. [Backpressure, and preventing cascading failures](#03-what-is-backpressure-and-how-do-you-prevent-cascading-failures)
4. [Design a system for millions of users](#04-how-would-you-evolve-a-system-to-serve-millions-of-users)

**SRE metrics**

5. [MTTR, MTTD, MTBF (and availability math)](#05-explain-mttd-mttr-mttf-and-mtbf-and-how-they-relate-to-availability)

**Staff / Principal SRE**

6. [Establish reliability standards across teams](#06-how-would-you-establish-reliability-standards-across-many-teams)
7. [Drive organisation-wide SLO adoption](#07-how-do-you-drive-slo-adoption-across-an-organisation)
8. [Reduce infrastructure costs (as a programme)](#08-youre-asked-to-cut-infrastructure-cost-by-30-how-do-you-run-that)
9. [Minimise production blast radius](#09-how-do-you-minimise-production-blast-radius-across-the-platform)
10. [Influence teams without direct authority](#10-how-do-you-influence-teams-you-have-no-authority-over)
11. [Balance reliability and feature delivery](#11-how-do-you-balance-reliability-work-against-feature-delivery)

---

## 🔹 System Design

### 01. Design a URL shortener.
**1. Requirements.**
- Functional: shorten a long URL to a short code, redirect, optional custom alias and expiry, click analytics.
- Non-functional: very read-heavy (around 100:1), redirects under 50 ms p99, high availability, and codes must not be guessable when links are private.

**2. Estimates** (state your assumptions):
- 100M new URLs a month ≈ **40 writes/s** (peak ~400).
- 100:1 reads ≈ **4k redirects/s** (peak ~40k).
- Storage: 100M × 12 months × 5 years × ~500 B ≈ **3 TB**, which is fine for a partitioned key-value store.
- Code length: base62 with 7 characters = 62⁷ ≈ **3.5 trillion** codes, plenty.

**3. API.**
- `POST /api/v1/urls {long_url, alias?, ttl?}` → `{code}`
- `GET /{code}` → **301** (permanent, cached by the browser, which takes load off you but means you lose click analytics) or **302** (temporary, every click reaches you, analytics work). Most shorteners use 302.

**4. Generating codes** (the core of the question):
| Approach | Notes |
|---|---|
| **Counter → base62** | Unique with no collisions. Avoid a single global counter (a bottleneck and SPOF): each app instance **leases ID ranges** (e.g. 1M at a time from ZooKeeper/etcd or a DB sequence), or use **Snowflake-style IDs** (timestamp + worker + sequence). Sequential codes are guessable, so shuffle with a reversible bijection or add random bits if that matters |
| Hash(long URL), take 7 characters | The same URL gets the same code (dedupe), but you must **check for collisions** and retry with a salt |
| Random 7 characters | Simple and unguessable. Insert with a conditional write (`attribute_not_exists`) and retry on collision |

**5. Storage.** `code → {long_url, owner, created, expires}` in a key-value store partitioned by `code` (DynamoDB, Cassandra; or Postgres sharded by code). Access is by key only, with no joins.

**6. Read path.** CDN/edge → LB → stateless redirect service → **Redis cache** (hot links follow a power law, so expect 90%+ hit rate; LRU eviction) → DB on a miss. **Negative-cache** unknown codes with a short TTL so scanners can't hammer the DB ([17 Q22](./17-messaging-caching-distributed-systems-qna.md)).

**7. Analytics.** Don't write to the DB synchronously on every redirect. Publish click events to **Kafka/Kinesis**, aggregate with stream processing into an OLAP store (ClickHouse, BigQuery).

**8. Reliability and operations.**
- Multi-AZ stateless tier on an ASG/HPA; global tables or cross-region replicas for DR.
- Rate-limit `POST` per user/IP (Q02); scan for malware and phishing URLs (abuse is the biggest real-world problem).
- A TTL cleanup job for expired links.
- SLOs on redirect latency and availability.

**Diagram:**
```
Client → CDN → ALB → redirect-svc (N pods) → Redis → DynamoDB
                         └─► Kafka → stream agg → ClickHouse (analytics)
         ALB → create-svc → ID-range allocator → DynamoDB
```

### 02. Design a distributed rate limiter.
**Goal:** limit each client (API key, user, IP, or tenant + endpoint) to N requests per period **across all instances**, with very little added latency.

**Where it runs:**
- **At the edge or gateway** (API Gateway, Envoy global rate limit service, Kong, NGINX, Cloudflare): stops abuse before it costs anything.
- **In a shared library or sidecar** for service-to-service quotas.
- Often in layers: coarse per-IP limits at the CDN, then per-API-key limits at the gateway.

**Algorithm:** token bucket (allows bursts) or sliding-window counter (smooth). Single-node code is in [41 Q14](./41-linux-programming-dsa-gap-fill-qna.md#14-implement-a-rate-limiter-token-bucket-and-sliding-window).

**Shared state in Redis:** the check-and-decrement must be **atomic**, so use a Lua script (or `INCR` + `EXPIRE` for fixed windows):
```lua
-- KEYS[1]=bucket key  ARGV: rate (tokens/s), capacity, cost
local t = redis.call('TIME')                                  -- use Redis's clock, not each client's
local now = tonumber(t[1]) + tonumber(t[2]) / 1e6
local rate, cap, cost = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(b[1]) or cap
local ts = tonumber(b[2]) or now
tokens = math.min(cap, tokens + (now - ts) * rate)
local allowed = 0
if tokens >= cost then tokens = tokens - cost; allowed = 1 end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', KEYS[1], math.ceil(cap / rate) + 1)     -- idle keys clean themselves up
return allowed
```

**Design decisions to talk through:**
- **Latency:** a Redis round trip (~1 ms) on every request. Options:
  - **Local token buckets** that sync with Redis in batches (take 100 tokens at a time), giving approximate global accuracy at much lower cost.
  - A **two-tier** setup: a strict local limit plus a looser global one.
- **Redis down:** decide **fail-open** (keep serving, protect availability; usual for user-facing APIs) or **fail-closed** (protect a fragile backend). Either way, put a tight timeout on the limiter call.
- **Scaling Redis:** use Redis Cluster sharded by key. Watch **hot keys** (one huge tenant); split their bucket across N sub-keys.
- **Multi-region:** per-region limits (limit ÷ regions), or asynchronous counter replication with temporary overshoot. Strict global consistency costs a cross-region round trip, which is rarely worth it.
- **Client contract:** **429** plus `Retry-After` and `RateLimit-Limit/Remaining/Reset` headers. Clients back off with jitter.
- **Configuration:** limits per plan or tenant stored in config, hot-reloadable. Run new limits in **shadow mode** first, logging "would have blocked".
- **Observability:** count allowed and blocked per rule, alert on a sudden spike in 429s (a bad limit, or an attack).

### 03. What is backpressure, and how do you prevent cascading failures?
**Backpressure** means a component that can't keep up **signals upstream to slow down**, instead of quietly buffering until it runs out of memory. Examples: TCP flow control (receive window), a full bounded queue blocking producers, HTTP **429/503 with `Retry-After`**, Kafka consumers pulling at their own pace (lag grows while the brokers stay fine), gRPC/Reactive Streams flow control. The anti-pattern is **unbounded queues**: latency grows without limit, memory runs out, and by the time requests are processed the callers have already timed out, so all that work is wasted.

**How cascading failures happen:**
1. A dependency gets slow.
2. Callers wait, holding threads and connections.
3. Their pools fill up, so *they* get slow.
4. Their callers' pools fill up, and so on until the whole graph is down.

Retries amplify it (retry storms, 3 layers × 3 retries = 27×). So do health checks that test dependencies (every instance marked unhealthy at once), cache failures that send everything to the DB, and autoscaling that adds instances which then all hit the already-struggling DB.

**Defences, layered:**
| Defence | What it does |
|---|---|
| **Timeouts + deadline propagation** | Every call has a timeout shorter than its caller's. Pass the remaining budget downstream (gRPC deadlines) so no one works on requests that are already dead |
| **Bounded queues + load shedding** | Reject early (429/503) when the queue or concurrency is full. Prioritise critical traffic (checkout over recommendations). Adaptive concurrency limits (Envoy, Netflix `concurrency-limits`) |
| **Retries with budget + jitter** | Retry only idempotent requests on transient errors, cap retries at about 10% of traffic, retry in one layer only |
| **Circuit breakers** | Stop calling a failing dependency and fail fast or use a fallback, then probe with half-open requests ([13 Q15](./13-sre-incident-loadbalancing-servicemesh-qna.md)) |
| **Bulkheads** | Separate thread/connection pools per dependency, so a slow `search` can't use up the threads that `payments` needs |
| **Graceful degradation** | Serve stale cache, default values, or hide the feature ("recommendations unavailable") instead of failing the page |
| **Shallow health checks** | Liveness and readiness check *this* process, not the whole dependency chain |
| **Capacity headroom + rate limits** | Leave N+1 / AZ-failure headroom, rate-limit per client (Q02), protect cold caches with request coalescing |
| **Test it** | Load tests up to the breaking point, chaos experiments (inject latency, not just kill pods), game days |

### 04. How would you evolve a system to serve millions of users?
Describe it as an **evolution driven by measured bottlenecks**, not as the final architecture on day one. Numbers to anchor it: 1M DAU × ~20 requests/day ≈ 20M requests/day ≈ **230 rps average, about 1–2k rps peak**. That's modest per server; the hard parts are state, data, and failure handling.

1. **Single server → separate the DB.** The app and DB are scaled independently; use a managed DB (RDS) with backups.
2. **Stateless app tier behind a load balancer.**
   - Sessions go to Redis or JWTs, uploads to S3.
   - Use an ASG/HPA across **multiple AZs** and health checks.
   - Now you can deploy with no downtime and lose an instance or an AZ.
3. **Caching.**
   - A **CDN** for static assets and cacheable API responses.
   - **Redis** for hot reads (cache-aside with TTLs, stampede protection).
   - The result is usually a large cut in DB reads.
4. **Scale the database.**
   - Read path: read replicas, connection pooling (PgBouncer/RDS Proxy), indexes and query fixes (often the biggest single win).
   - Then vertical scaling.
   - **Write path last:** partition or shard by tenant or user ID, or move suitable data to a key-value store (DynamoDB).
5. **Async everything that doesn't need to be synchronous.**
   - Queues or streams (SQS/Kafka) for emails, image processing, analytics, fan-out.
   - Smooths traffic spikes, gives backpressure, and isolates failures.
6. **Split services where team or scaling boundaries require it.** Don't split by default. Add service discovery, an API gateway, and per-service SLOs.
7. **Multi-region** when latency or DR needs it.
   - Users routed by geo/latency DNS; active-passive first, active-active only for data that tolerates it.
   - Global tables or CRDTs for data that can be eventually consistent; single-writer for money.
8. **Throughout:**
   - **Observability** (RED/USE dashboards, tracing), **SLOs**, load testing before launches, capacity planning.
   - **IaC + CI/CD** with canaries, rate limiting and abuse protection.
   - **Cost visibility** per service.

Close by naming the bottleneck you'd expect at each stage (DB connections, then write throughput, then cross-region consistency) and how you'd detect it (connection-pool saturation, replica lag, p99).

---

## 🔹 SRE Metrics

### 05. Explain MTTD, MTTR, MTTF and MTBF, and how they relate to availability.
| Metric | Meaning | Improve by |
|---|---|---|
| **MTTD**: mean time to detect | Failure start → someone or something notices | SLO/burn-rate alerts on user symptoms, synthetics, good coverage |
| **MTTA**: mean time to acknowledge | Alert → a human acknowledges | Sensible paging, on-call health, fewer noisy alerts |
| **MTTR**: mean time to *recover/restore* (sometimes "repair" or "resolve"; **define which**) | Failure start → service restored | Fast rollback, feature flags, runbooks, automation, good observability |
| **MTTF**: mean time to failure | Average uptime before failure, for non-repairable parts (disks) | Better components, redundancy |
| **MTBF**: mean time between failures | Average time between one failure and the next, for repairable systems. MTBF ≈ MTTF + MTTR | Fix root causes, testing, safer changes, chaos engineering |

**Availability ≈ MTBF / (MTBF + MTTR)** (using MTBF as the mean uptime between failures). Example: a failure every 30 days (720 h) with a 1-hour MTTR gives 720/721 = **99.86%**. Cut MTTR to 6 minutes and it becomes **99.986%**. That's why SRE teams focus on **MTTR**: failures will happen, but recovery speed is within your control. Caveats:
- Means hide distributions. One 8-hour outage and nine 1-minute blips average out deceptively, so look at percentiles and individual incidents.
- Small incident counts make these numbers noisy. Use them for trends, not targets for individuals, or people will start gaming incident classification.
- DORA's equivalent is "failed deployment recovery time".

---

## 🔹 Staff / Principal SRE

### 06. How would you establish reliability standards across many teams?
1. **Start from data, not a framework.** Review the last 6–12 months of incidents. What actually caused the customer-facing pain? (Usually changes/deploys, missing timeouts, capacity, config, single points of failure.) The standards should target those causes.
2. **Tier services by criticality** (Tier 0 = revenue/login/payments, Tier 1 = core features, Tier 2 = internal). Requirements scale with tier, so internal tools don't carry payments-level overhead.
3. **Write a short, concrete production-readiness standard (PRR checklist)** per tier, for example:
   - SLOs defined and alerting on burn rate.
   - Runbooks, and an on-call rotation with at least 2 people.
   - Dashboards (RED).
   - Timeouts, retries and circuit breakers on all dependencies.
   - Multi-AZ, with at least 2 replicas and PDBs.
   - Progressive rollout with automated rollback.
   - Backups with a *tested* restore; a DR runbook tested yearly for Tier 0.
   - Load-tested to 2× peak.
   - Dependencies documented.

   Each item says **why**, and how to meet it with the platform.
4. **Make the right way the easy way** (the most important point). Build the standards into the **golden path**: service templates, Helm charts and Terraform modules with probes, PDBs, HPA, dashboards and alerts **by default**; a CI/CD pipeline with canary and rollback built in. Compliance becomes a side effect of using the platform.
5. **Automate checks instead of auditing by hand.**
   - Policy as code (Kyverno/OPA: no `:latest`, resources set, PDB present).
   - A service catalog (Backstage) with **scorecards** per service, visible to everyone.
   - New Tier-0 launches go through a PRR review.
6. **Roll out gradually.** Start with Tier 0, get early-adopter teams to co-own it, publish wins ("checkout incidents down 40%"), and allow time-boxed exceptions with a named owner.
7. **Keep it alive.** Feed postmortem action items back into the standard, and review it yearly. Track: incidents per tier, change failure rate, MTTR, % of services meeting the standard.

### 07. How do you drive SLO adoption across an organisation?
- **Get sponsorship and agree what SLOs are for.** An engineering leader has to agree that error budgets **change decisions** (slow down releases when the budget is spent). Otherwise SLOs become decorative dashboards.
- **Start small with eager teams.** Pick 2–3 critical, user-facing services with willing owners. Choose 1–3 SLIs each from **the user's point of view** (availability = good requests / valid requests at the load balancer; latency = % under X ms), with targets based on **current performance and real user tolerance**, not 99.999% by default.
- **Make it close to zero effort.** Provide **SLO-as-code** (OpenSLO/Sloth/Pyrra specs → generated Prometheus recording rules, multi-window burn-rate alerts and Grafana dashboards), templates in the golden path, and office hours. If defining an SLO takes a week of PromQL, adoption stops.
- **Replace alerts, don't add more.** Move paging from cause-based alerts (CPU > 80%) to **burn-rate alerts**. Teams adopt SLOs when it means **fewer pages**. That's the best selling point.
- **Agree an error-budget policy in advance**, signed off by product and engineering: what happens at 50% / 100% budget burn (freeze risky deploys, reliability sprint, postmortem required). Keep it lightweight and humane.
- **Make it visible.** A weekly SLO review in ops/product meetings, a shared org dashboard, budgets included in quarterly planning.
- **Iterate.** Review targets quarterly. An SLO that never burns is too loose (or measures the wrong thing); one that always burns is too tight, or a real investment signal.
- **Measure adoption:** % of Tier-0/1 services with SLOs, % of pages that are SLO-based, budget-policy actions actually taken.

### 08. You're asked to cut infrastructure cost by 30%. How do you run that?
1. **Visibility first.**
   - Tagging and allocation per team, service and environment (enforced in IaC and policy).
   - Cost and Usage Reports → dashboards; Kubecost/OpenCost for K8s.
   - **Unit economics** (cost per request, per customer, per transaction), so growth doesn't look like waste.
2. **Find where the money goes** with a Pareto view. Typically compute (EC2/EKS), databases, data transfer (NAT gateway, cross-AZ, egress), storage and snapshots, observability (logs!).
3. **Quick wins** (weeks):
   - Delete idle and orphaned resources: unattached EBS volumes, old snapshots, idle LBs, unused EIPs, forgotten dev environments.
   - Schedule non-prod to shut down overnight.
   - Move gp2 → gp3, and storage lifecycle to IA/Glacier.
   - Reduce log retention and verbosity.
   - Add VPC endpoints to cut NAT data-processing charges.
4. **Structural** (months):
   - **Rightsize** using p95 utilisation; K8s requests based on actual usage (VPA recommendations).
   - Bin-pack with Karpenter consolidation; **Spot** for stateless and batch work (with interruption handling).
   - Graviton/ARM (often 20%+ better price-performance).
   - Autoscale to zero where possible.
   - Then commit to **Savings Plans/RIs** for the remaining steady baseline (commit *after* rightsizing, not before).
5. **Architecture:** cut cross-AZ chattiness, add caching or a CDN, change data tiering, use managed services where they're cheaper all-in, set observability sampling and cardinality budgets.
6. **Make it stick:**
   - Showback/chargeback so each team sees its own bill.
   - Budgets and anomaly alerts.
   - Cost checks in PR review (Infracost on Terraform plans).
   - Cost as a non-functional requirement in design reviews.
   - A monthly FinOps review.
7. **Guardrails:** never trade away SLOs silently. Every change goes through the same change process, with a rollback plan. Report savings against the baseline with unit cost, and track reliability alongside.

Notes: [FinOps](../FinOps%20and%20Cost%20Optimization/finops-overview.md).

### 09. How do you minimise production blast radius across the platform?
**Assume every change and every component will fail eventually, and limit how much breaks when it does.**
- **Changes** cause most incidents:
  - Progressive delivery: canary → 1 AZ → 1 region → global, with automated analysis and rollback (Argo Rollouts/Flagger).
  - Feature flags with kill switches.
  - Staged config rollouts (config is code: the same pipeline, validation and canary).
  - Deploy freezes driven by error budgets.
  - Limits on how much IaC can destroy (`prevent_destroy`, plan review, policy on deletes).
- **Isolation boundaries:**
  - **Cell-based architecture**: independent copies of the stack, each serving a subset of customers, so a bad deploy or poison request affects only one cell.
  - **Shuffle sharding**: each customer maps to a random small set of nodes, so one noisy or malicious tenant only hurts tenants with the exact same combination.
  - Separate AWS accounts and clusters per environment/team/tier (SCPs, account-level limits).
  - Separate control plane and data plane, with data planes that keep working with "static stability" when the control plane is down.
- **Runtime containment:** bulkheads, circuit breakers, timeouts, load shedding (Q03), per-tenant quotas, K8s namespaces with ResourceQuota/LimitRange, PDBs and topology spread across AZs.
- **Permissions:** least privilege, break-glass access, scoped CI credentials (OIDC per repo/environment). The blast radius of a leaked credential is also blast radius.
- **Dependencies:** know them (service catalog, tracing). Avoid hidden global single points of failure (one Redis for everything, one DNS provider, one IAM/SSO path). Make sure the systems you need **during an outage** (deploy tooling, observability, access) don't depend on what's broken.
- **Verify:** chaos and game days, regional evacuation drills, and asking in every postmortem: "why did this affect *everyone*, and what boundary would have contained it?"

### 10. How do you influence teams you have no authority over?
- **Earn credibility first.** Help teams with *their* problems: pair on an incident, fix their noisy alert, speed up their pipeline. People listen to the person who helped them.
- **Lead with data and their goals.** "Your service caused 4 of the last 6 SEV2s and 30% of your on-call pages" lands better than "you must adopt standard X". Connect the change to what they care about: fewer pages, faster deploys, less toil, their OKRs.
- **Write it down.** A short RFC/design doc with the problem, options and trade-offs, opened for comment early. Incorporate feedback visibly so people co-own the decision.
- **Make it easy.** A working prototype, a migration script, a PR to their repo. Adoption follows lower effort more than it follows mandates.
- **Find champions** in each team, start with early adopters, publish results, and let peer pressure and success stories carry it.
- **Align with leadership** on priorities so the work gets staffed, but use escalation sparingly (it spends trust).
- **Disagree and commit.** Accept good counter-arguments, change your proposal, and give credit to others.
- STAR example to prepare: "standardised timeouts/retries via a shared library across 12 teams with no mandate: started with the 2 teams with the most incidents, showed MTTR and page reduction, then it became the default in the service template." See also [14 Q21](./14-deployment-systemdesign-behavioral-qna.md).

### 11. How do you balance reliability work against feature delivery?
- **Make it data-driven, not opinion-driven.** **SLOs and error budgets** are the mechanism. While a service is within budget, ship features and take risks. When the budget is burnt, the agreed policy shifts effort to reliability until it recovers. This ends the "ops says no, product says yes" argument because both sides agreed the rule in advance.
- **Treat reliability as a feature.** Put reliability work in the same backlog, with cost-of-downtime numbers (revenue per minute, SLA penalties, churn), so product managers can prioritise it rather than see it as overhead.
- **Reserve capacity** (e.g. 20% for reliability, toil reduction and tech debt), with more after bad quarters and less when things are stable. Track toil (target < 50% of SRE time).
- **Reduce the cost of being reliable** so it isn't a trade-off: a paved road with safe defaults, progressive delivery, automated rollback and good tests make shipping fast *and* safe. DORA research shows speed and stability go together, they aren't opposites.
- **Right-size the target.** 99.99% on an internal tool wastes feature capacity. Over-reliability costs as much as under-reliability. Tie targets to the service tier.
- **Close the loop.** Postmortem actions get owners and due dates and are tracked to completion; repeated incidents of the same class raise the priority of the fix.
- Example: "Checkout burned 140% of its monthly budget from deploy-related incidents. Per policy we paused feature launches for 2 weeks, added canary analysis and automated rollback, and change-failure rate dropped from 18% to 6%, which then let us *increase* deploy frequency." See also [11 Q25](./11-monitoring-logging-observability-qna.md), [14 Q20](./14-deployment-systemdesign-behavioral-qna.md).

---

*Part of the [Interview Questions](./README.md) hub. See [`../Index.md`](../Index.md) for the full repository index.*
