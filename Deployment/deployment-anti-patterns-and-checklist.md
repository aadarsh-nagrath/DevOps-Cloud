# Deployment Anti-Patterns & Pre-Deploy Checklist

Common mistakes that undermine an otherwise well-chosen deployment strategy, plus a practical checklist for picking the right strategy and shipping safely.

---

## 1. Anti-Patterns

### Deploying on Fridays (or right before you're unavailable)
If something goes wrong, you want maximum people and attention available to respond, not a weekend with a skeleton on-call crew. This isn't superstition — it's about incident response capacity when things break.

### Treating the deployment strategy as a substitute for testing
Canary/blue-green/rolling all reduce the **blast radius** of a bad release — none of them make a fundamentally broken change safe. A bug that corrupts data will corrupt data whether it's rolled out to 5% or 100% of traffic; canary just means you find out with 5% of the damage instead of 100%. Strategy is risk *mitigation*, not a replacement for tests, code review, and staging validation.

### No rollback plan until something breaks
Deciding how to roll back *during* an incident is slower and more error-prone than deciding it in advance. Before every deploy, know: what's the rollback command, how long does it take, and does it require a database rollback too (the hard case — see the expand/contract pattern in [deployment-strategies.md](deployment-strategies.md)).

### Ignoring database/schema coupling
The single most common cause of "the deployment strategy worked but the release still broke prod": a schema change that isn't backward-compatible with the old app version during a rolling/canary/blue-green window where both versions run simultaneously. Always ask: *can the OLD code run against the NEW schema, and can the NEW code run against the OLD schema, for however long both are live?*

### Shallow health checks
A health check that only verifies "the process is running" (or worse, just "the port is open") will happily route traffic to an instance that can't reach its database, has an exhausted connection pool, or is stuck in a degraded state. Health checks should exercise the actual critical dependencies the app needs to serve a real request.

### No automated rollback trigger
Manual rollback decisions are slower than automated ones, and humans get paged at 3am and make worse decisions under pressure than a pre-agreed automated threshold would. Where possible (canary analysis, progressive delivery), define the rollback condition (error rate, latency threshold) *before* the deploy, and automate the response.

### Flag/branch accumulation (feature-flag specific)
See [feature-flags-and-progressive-delivery.md](feature-flags-and-progressive-delivery.md) §5 — flags without an owner and expiry plan become permanent complexity.

### Mixing up "canary" and "A/B test" goals
Using canary infrastructure to answer a product question (or vice versa) leads to decisions made on the wrong kind of evidence — a canary's 20-minute technical health window is not enough data to conclude a feature "doesn't work," and a multi-week A/B test is a wasteful way to just check "does this crash." See the comparison in [ab-testing-deployment.md](ab-testing-deployment.md).

### Not draining connections before terminating instances
Killing an instance the instant it's marked "old" cuts off in-flight requests mid-response. Always drain (stop routing new traffic, let existing requests finish, *then* terminate) — this applies to rolling updates, blue-green cutover, and canary rollback alike.

---

## 2. Choosing a Strategy — Decision Guide

```
Can you tolerate a short outage window (dev/staging/batch jobs)?
├── Yes --> Recreate is fine, keep it simple.
└── No, need zero downtime for real users:
    │
    Do you need INSTANT full rollback more than gradual risk reduction?
    ├── Yes, and can afford 2x infra cost --> Blue-Green
    └── No / can't afford 2x infra:
        │
        Do you need metric-gated, percentage-based risk control?
        ├── Yes, and you have strong observability to gate on --> Canary
        └── No, just want simple zero-downtime rollout --> Rolling Update
    │
    Is the risk about USER/PRODUCT behavior, not technical health?
    └── Yes --> A/B Testing (often layered ON TOP of a canary/rolling release, not instead of it)
    │
    Is this a rewrite/migration where you need real-traffic validation
    with absolutely zero user-facing risk before ANY cutover decision?
    └── Yes --> Shadow Deployment first, then pick a cutover strategy above
    │
    Do you want to decouple the deploy from the release entirely,
    and control rollout by user segment rather than infrastructure?
    └── Yes --> Feature Flags / Progressive Delivery
```

In practice, mature pipelines **combine** several of these: e.g., shadow-test a rewritten service, then canary it with automated analysis, while a related user-facing feature on top of it is separately controlled by a feature flag for progressive product rollout.

---

## 3. Pre-Deploy Checklist

- [ ] **Rollback plan is written down and tested**, not improvised during an incident.
- [ ] **Database migrations are backward-compatible** for the duration both app versions might coexist (expand/contract pattern applied if there's a schema change).
- [ ] **Health checks exercise real dependencies** (DB, cache, downstream services), not just "process is alive."
- [ ] **Graceful shutdown / connection draining** is configured (`preStop` hooks, deregistration delay, `terminationGracePeriodSeconds`, or platform equivalent).
- [ ] **Alerting/dashboards are ready before the deploy starts**, not added after something looks wrong — you want a baseline to compare against in real time.
- [ ] **The rollback trigger condition is defined in advance**: what specific metric/threshold triggers a rollback, and is it automated or does a specific person own the manual call?
- [ ] **Blast radius matches your confidence level**: low confidence in a change → smaller initial canary percentage / longer bake time / shadow-test first, not "ship it and see."
- [ ] **Stakeholders know the deploy is happening**, especially for anything customer-visible or during business-critical hours.
- [ ] **Feature flags (if used) have an owner and a planned removal date**, tracked somewhere durable, not just tribal knowledge.
- [ ] **You are not deploying immediately before a period of reduced on-call capacity** (end of day Friday, holidays) unless the change is trivial and low-risk.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
