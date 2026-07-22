# Blue-Green Deployment

Run two complete, identical production environments ("Blue" = current live version, "Green" = new version). Deploy and fully test the new version in Green while Blue keeps serving all real traffic, then switch all traffic to Green in one atomic step. Rollback is just switching back.

---

## 1. How It Works

```
Before cutover:
  Users ---> [Load Balancer] ---> Blue (v1.0) [100% traffic]
                                  Green (v1.1) [0% traffic, fully deployed & tested]

Cutover (instant):
  Users ---> [Load Balancer] ---> Blue (v1.0) [0% traffic, kept warm as rollback target]
                                  Green (v1.1) [100% traffic]

Rollback (if needed, also instant):
  Users ---> [Load Balancer] ---> Blue (v1.0) [100% traffic again]
                                  Green (v1.1) [0% traffic, investigate the failure]
```

1. Blue is the current live environment, serving 100% of traffic.
2. Deploy the new version to Green — a full, separate environment (its own instances/pods, but typically sharing the same database, see §5).
3. Run smoke tests, integration tests, or even real internal traffic against Green *before* it sees any real users.
4. Flip the router/load balancer so all traffic goes to Green. This is typically instant (DNS change, load balancer target group swap, or ingress config change).
5. Keep Blue running and unchanged for a period after cutover — it is your rollback target.
6. Once confident, Blue is decommissioned (or becomes the target for the *next* release, and the colors swap).

---

## 2. Why Use It

| Benefit | Why it matters |
|---|---|
| **Zero downtime** | The switch is a routing change, not a restart — no gap where nothing is serving. |
| **Instant rollback** | Rollback = flip the router back to Blue. No redeploying, no waiting for a build. This is the single biggest advantage over Rolling or Recreate. |
| **Full pre-production validation with prod-identical infra** | Green is deployed to the exact same infrastructure shape as production, so you catch environment-specific bugs (config drift, resource limits, networking) that staging often misses. |
| **No mixed-version window for the app tier** | Unlike Rolling, at any given moment 100% of user traffic hits exactly one version — simplifies reasoning about behavior, though the *database* can still be read/written by both during validation if Green does any writes pre-cutover. |

## 3. Costs & Trade-offs

- **2x infrastructure cost** (at least temporarily) — you need enough capacity to run two full environments simultaneously. This is the main reason teams choose Canary or Rolling instead when cost is a constraint.
- **Database/schema is still the hard part**: both Blue and Green usually point at the *same* database (running two full database copies and keeping them in sync is rarely practical). This means the expand/contract migration pattern is still required — see [deployment-strategies.md](../deployment-strategies.md) — Blue-Green does not remove that constraint, it only removes app-tier coexistence.
- **Stateful connections**: long-lived connections (WebSockets, SSE, gRPC streams) open against Blue at cutover time need a graceful drain strategy — either let them finish naturally with a drain timeout, or force-close and let clients reconnect (acceptable for most apps, not for all).
- **Cache warm-up**: Green starts with cold in-memory caches. If Blue has been warm for weeks, an instant 100% cutover to Green can cause a latency/load spike until caches rebuild. Consider a brief canary-style ramp (small % first) even within a blue-green cutover for cache-sensitive apps.

---

## 4. Example: AWS (ALB + Target Groups)

```bash
# Blue and Green are separate target groups behind the same Application Load Balancer.
# Cutover = change which target group the listener rule forwards to.

# 1. Deploy Green: register new instances/tasks to the "green" target group
aws elbv2 register-targets \
  --target-group-arn arn:aws:elasticloadbalancing:...:targetgroup/green-tg \
  --targets Id=i-0123456789abcdef0

# 2. Verify Green target group is healthy before cutover
aws elbv2 describe-target-health --target-group-arn arn:aws:elasticloadbalancing:...:targetgroup/green-tg

# 3. Cutover: repoint the listener rule from blue-tg to green-tg
aws elbv2 modify-listener \
  --listener-arn arn:aws:elasticloadbalancing:...:listener/app/my-alb/... \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:...:targetgroup/green-tg

# 4. Rollback if needed: point the listener back to blue-tg (instant)
aws elbv2 modify-listener \
  --listener-arn arn:aws:elasticloadbalancing:...:listener/app/my-alb/... \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:...:targetgroup/blue-tg
```

## 5. Example: Kubernetes (label-based service selector swap)

Kubernetes has no native "Blue-Green" primitive — it's implemented via label selectors on a Service, or via a dedicated controller (Argo Rollouts, Flagger).

```yaml
# Two Deployments exist simultaneously with different labels
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app-blue
spec:
  replicas: 5
  selector:
    matchLabels: { app: web-app, version: blue }
  template:
    metadata:
      labels: { app: web-app, version: blue }
    spec:
      containers: [{ name: web-app, image: myorg/web-app:1.0.0 }]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app-green
spec:
  replicas: 5
  selector:
    matchLabels: { app: web-app, version: green }
  template:
    metadata:
      labels: { app: web-app, version: green }
    spec:
      containers: [{ name: web-app, image: myorg/web-app:2.0.0 }]
---
# The Service selector is the single source of truth for "which color is live"
apiVersion: v1
kind: Service
metadata:
  name: web-app
spec:
  selector:
    app: web-app
    version: blue   # <-- change this single line to "green" to cut over
  ports:
    - port: 80
      targetPort: 8080
```
```bash
# Cutover: patch the Service selector — instant, atomic from the cluster's perspective
kubectl patch service web-app -p '{"spec":{"selector":{"version":"green"}}}'

# Rollback: patch it back
kubectl patch service web-app -p '{"spec":{"selector":{"version":"blue"}}}'
```
In practice, most teams use **Argo Rollouts** (`kind: Rollout` with `strategy.blueGreen`) instead of hand-rolling this, because it automates the health-check gating, the "preview" service for testing Green before cutover, and the scale-down of Blue after a configurable delay.

```yaml
# Argo Rollouts blue-green strategy (abbreviated)
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: web-app
spec:
  replicas: 5
  strategy:
    blueGreen:
      activeService: web-app-active     # what real users hit
      previewService: web-app-preview   # point test traffic here before promoting
      autoPromotionEnabled: false        # require manual/automated gate before cutover
      scaleDownDelaySeconds: 300         # keep old version warm for 5 min after cutover, for fast rollback
```

---

## 6. When to Use Blue-Green

- You need **instant rollback** as the top priority (e.g., high-stakes releases, compliance-sensitive systems).
- You can afford (even temporarily) **double infrastructure cost**.
- Your release cadence is not so frequent that spinning up a full parallel environment every time is wasteful — Canary or Rolling scale better to very frequent (many-per-day) deploys.
- You want **full-scale, prod-identical pre-release validation**, not just a small sample of traffic.

## 7. When to Prefer Something Else

- Frequent deploys (many times a day) — standing up a full duplicate environment per deploy is expensive and slow; Rolling or Canary suit high-frequency pipelines better.
- Very large/stateful fleets where doubling capacity isn't feasible.
- You want **fine-grained, percentage-based risk control** rather than an all-or-nothing cutover — that's [Canary](../Canary%20Deployment/canary-deployment.md)'s job.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
