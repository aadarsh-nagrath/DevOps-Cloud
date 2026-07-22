# Deployment Strategies

Overview and index of software deployment strategies — how to ship a new version of an application to production with minimal risk and downtime. This file covers the shared concepts; each strategy has its own deep-dive file linked below.

---

## 1. What "Deployment Strategy" Means

A deployment strategy is the *procedure* by which a new version of an application replaces (or runs alongside) the old version in a live environment. The strategy you pick determines:

- **Downtime**: does the app go offline during the switch?
- **Blast radius**: if the new version is broken, how many real users hit it before you notice?
- **Rollback speed**: how fast can you undo a bad release, and how do in-flight requests behave during rollback?
- **Infrastructure cost**: do you need double the capacity temporarily (or permanently)?
- **Complexity**: how much tooling/automation does the strategy require to do safely?

There is no single "best" strategy — the right choice depends on the app's statefulness, your risk tolerance, your infrastructure's capabilities (load balancer features, orchestrator support), and how confident you are in your testing/observability before code reaches production.

---

## 2. Core Concepts (apply to every strategy below)

### Readiness vs Liveness
- **Readiness**: is this instance ready to receive traffic *right now*? Used by load balancers/orchestrators to decide whether to route requests to an instance.
- **Liveness**: is this instance still running correctly, or should it be restarted? Used to detect and recover from deadlocks/crashes.
- Every strategy below depends on accurate readiness checks — a version that reports "ready" before it actually is will fail its rollout regardless of which strategy you use.

### Health Checks
```yaml
# Example: Kubernetes-style readiness + liveness probes (conceptually identical in ECS, Nomad, etc.)
readinessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 3
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 15
  periodSeconds: 10
```
A shallow health check (just "process is running") is not enough — a good readiness check verifies the app can actually serve a request (DB connection alive, caches warmed, dependencies reachable).

### Rollback
Every strategy needs a rollback plan *before* you roll forward. Key questions to answer in advance:
- Is rollback just "redeploy the previous image/artifact" (stateless apps), or does it also require a database migration rollback (stateful apps — the harder case)?
- How long does rollback take compared to roll-forward? (Often rollback is faster since the old image is already known-good and may still be cached.)
- Can rollback happen automatically based on error-rate/latency metrics (automated rollback), or is it always a human decision?

### Database Migrations — the strategy that breaks all the others
Nearly every deployment strategy assumes the app version can change instantly, but the database schema usually can't (or you don't want it to, for zero downtime). The standard solution is the **expand/contract pattern**:
1. **Expand**: deploy a schema change that is backward-compatible with both old and new app code (e.g., add a new nullable column, don't drop the old one yet).
2. **Migrate**: deploy the new app version, which uses the new schema.
3. **Contract**: once all instances run the new version and you're confident, deploy a follow-up schema change that removes the old column/constraint.

This is what makes blue-green/canary/rolling deployments safe with a shared database: at any point during the rollout, both old and new app versions must be able to read/write the same schema.

---

## 3. Strategy Comparison

| Strategy | Downtime | Rollback speed | Infra cost during deploy | Blast radius if broken | Complexity |
|---|---|---|---|---|---|
| [Recreate](recreate-deployment.md) | Yes (full outage) | Fast (redeploy old) | 1x (no extra capacity) | 100% of users | Lowest |
| [Rolling Update](rolling-deployment.md) | None (if done right) | Medium (must roll back instance by instance) | ~1x–1.25x (a few extra instances mid-rollout) | Partial, grows during rollout | Low |
| [Blue-Green](Blue-Green%20Deployment/blue-green-deployment.md) | None | Instant (flip traffic back) | 2x (full duplicate environment) | 0% until cutover, then 100% | Medium |
| [Canary](Canary%20Deployment/canary-deployment.md) | None | Fast (shift traffic back to 0%) | ~1x–1.1x (small canary fleet) | Small % of users, controlled | Medium-High |
| [A/B Testing](ab-testing-deployment.md) | None | Fast | ~1x–1.1x | Small % of users, but running for a long time | High (needs analytics, not just ops) |
| [Shadow / Dark Launch](shadow-deployment.md) | None | N/A (shadow traffic isn't user-facing) | ~2x compute (duplicate processing, no duplicate response path) | 0% (users never see shadow responses) | High |
| [Feature Flags / Progressive Delivery](feature-flags-and-progressive-delivery.md) | None | Instant (flip flag off) | 1x (single deployed version, flag-gated) | Configurable per flag/segment | Medium (needs flag infra) |

---

## 4. Files in This Folder

| File | Covers |
|---|---|
| [recreate-deployment.md](recreate-deployment.md) | Simplest strategy — stop everything, deploy new version, start everything. When downtime is acceptable. |
| [rolling-deployment.md](rolling-deployment.md) | Gradually replace old instances with new ones. Kubernetes' default Deployment strategy. maxSurge/maxUnavailable tuning. |
| [Blue-Green Deployment/blue-green-deployment.md](Blue-Green%20Deployment/blue-green-deployment.md) | Two full identical environments, instant traffic cutover, instant rollback. |
| [Canary Deployment/canary-deployment.md](Canary%20Deployment/canary-deployment.md) | Gradual traffic shifting to a new version with automated metric-based promotion/rollback. |
| [ab-testing-deployment.md](ab-testing-deployment.md) | Deployment strategy vs product experimentation — running two versions to measure user behavior, not just verify technical health. |
| [shadow-deployment.md](shadow-deployment.md) | Mirroring real production traffic to a new version without affecting real responses — the safest way to test at real scale. |
| [feature-flags-and-progressive-delivery.md](feature-flags-and-progressive-delivery.md) | Decoupling deployment from release; ring-based/percentage rollouts controlled by flags rather than infrastructure. |
| [deployment-anti-patterns-and-checklist.md](deployment-anti-patterns-and-checklist.md) | Common mistakes, a pre-deploy checklist, and how to choose the right strategy for your situation. |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
