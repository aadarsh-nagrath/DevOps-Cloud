# Canary Deployment

Release a new version to a small subset of traffic (or users) first, watch key metrics, and gradually increase the traffic percentage if the canary looks healthy — automatically rolling back if it doesn't. Named after the "canary in a coal mine": a small, contained, early warning signal before the whole fleet is exposed.

---

## 1. How It Works

```
Step 1:  [ v1: 95% traffic ]  [ v2 canary: 5% traffic  ]   <- watch error rate, latency, etc.
Step 2:  [ v1: 75% traffic ]  [ v2 canary: 25% traffic ]   <- still healthy, continue
Step 3:  [ v1: 50% traffic ]  [ v2 canary: 50% traffic ]
Step 4:  [ v1: 0%  traffic ]  [ v2: 100% traffic        ]  <- fully promoted, v1 decommissioned

If at ANY step metrics degrade:
Step N:  [ v1: 100% traffic ] [ v2 canary: 0% traffic ]    <- automatic rollback, v1 restored fully
```

1. Deploy the new version alongside the old version, but route only a small percentage of traffic to it (e.g., 5%).
2. Monitor a defined set of metrics (error rate, p95/p99 latency, CPU/memory, business metrics like checkout completion rate) for both versions side by side.
3. If metrics stay within acceptable bounds for a defined "bake time," increase the canary's traffic percentage.
4. Repeat until the canary reaches 100% (fully promoted) or fails a check at any step (automatic rollback to 0%).

The critical difference from Rolling: canary progression is gated by **metric analysis at each step**, not just "did the health check pass." A canary can pass a basic HTTP health check while still being subtly broken (e.g., elevated error rate on one specific endpoint, memory leak that takes 20 minutes to show up) — this is exactly what canary analysis is designed to catch before 100% of users are affected.

---

## 2. Traffic Splitting Mechanisms

| Mechanism | How it decides who gets the canary | Where it lives |
|---|---|---|
| **Percentage-based (random)** | Router randomly assigns X% of *requests* to the canary | Load balancer, service mesh, ingress controller |
| **Sticky by user/session** | A given user consistently hits the same version across requests (better UX — no mid-session version flip) | Cookie- or header-based routing rules |
| **Header/attribute-based** | Route based on a specific header, user segment, or feature flag (e.g., internal employees first, then beta users, then everyone) | API gateway, service mesh, feature-flag platform |
| **Geography/region-based** | Roll out to one region/data center first | DNS, global load balancer, multi-region deploy pipeline |

## 3. What to Measure During a Canary

A canary is only useful if you're watching the right signals:
- **Error rate** (HTTP 5xx, exceptions, gRPC error codes) — compare canary vs baseline, not just an absolute threshold, since baseline itself fluctuates.
- **Latency percentiles** (p50/p95/p99) — averages hide tail latency regressions.
- **Resource usage** (CPU, memory, GC pause time) — catches leaks/regressions that don't show up as errors immediately.
- **Business/domain metrics** — e.g., conversion rate, cart abandonment, login success rate. A canary can be technically "healthy" (no errors, fast) while still shipping a bug that breaks a business flow (like a payment form silently failing client-side).
- **Log-based anomaly signals** — new/unusual error signatures appearing only on the canary version.

## 4. Example: Kubernetes with Argo Rollouts

Argo Rollouts is the standard way to do real canary analysis on Kubernetes (a plain Kubernetes `Deployment` has no native canary/traffic-splitting concept).

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: web-app
spec:
  replicas: 10
  strategy:
    canary:
      steps:
        - setWeight: 5      # 5% of traffic to canary
        - pause: { duration: 5m }
        - setWeight: 25
        - pause: { duration: 10m }
        - setWeight: 50
        - pause: { duration: 10m }
        - setWeight: 100    # full promotion
      analysis:
        templates:
          - templateName: success-rate-check
        startingStep: 1     # begin automated analysis from the first traffic step
  selector:
    matchLabels: { app: web-app }
  template:
    metadata:
      labels: { app: web-app }
    spec:
      containers: [{ name: web-app, image: myorg/web-app:2.0.0 }]
---
# Defines the automated pass/fail criteria checked at each step
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate-check
spec:
  metrics:
    - name: success-rate
      interval: 1m
      successCondition: result[0] >= 0.95     # abort/rollback if success rate drops below 95%
      provider:
        prometheus:
          address: http://prometheus.monitoring:9090
          query: |
            sum(rate(http_requests_total{job="web-app",status!~"5.."}[2m]))
            /
            sum(rate(http_requests_total{job="web-app"}[2m]))
```
```bash
kubectl argo rollouts get rollout web-app --watch   # live canary progress dashboard in the terminal
kubectl argo rollouts promote web-app                # manually advance to the next step
kubectl argo rollouts abort web-app                  # abort and roll back immediately
```

## 5. Example: Service Mesh Traffic Splitting (Istio)

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: web-app
spec:
  hosts: [web-app]
  http:
    - route:
        - destination: { host: web-app, subset: v1 }
          weight: 90        # 90% to stable version
        - destination: { host: web-app, subset: v2 }
          weight: 10        # 10% to canary
---
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: web-app
spec:
  host: web-app
  subsets:
    - name: v1
      labels: { version: v1 }
    - name: v2
      labels: { version: v2 }
```
Adjusting the `weight` values and reapplying is the manual version of what Argo Rollouts / Flagger automate with metric-gated steps.

## 6. Example: Managed Cloud Canary (AWS CodeDeploy / Lambda)

```json
{
  "deploymentConfigName": "CodeDeployDefault.LambdaCanary10Percent5Minutes",
  "description": "Shift 10% of traffic immediately, monitor for 5 minutes, then shift the rest"
}
```
AWS Lambda and API Gateway support weighted alias routing natively — useful when you don't want to run your own service mesh/ingress controller for traffic splitting.

---

## 7. Canary vs Blue-Green vs A/B Testing

| | Canary | Blue-Green | A/B Testing |
|---|---|---|---|
| Primary goal | De-risk a technical release | Instant, safe cutover + rollback | Measure user/business behavior difference |
| Traffic split basis | Gradual %, metric-gated | All-or-nothing | Fixed % split, often for a long duration |
| Duration | Minutes to hours (until fully promoted or rolled back) | Minutes (cutover is quick) | Days to weeks (needs statistical significance) |
| Decision made by | Automated health/error metrics | Manual go/no-go, or automated health check | Product/analytics team, statistical test |
| Who's watching | SRE/on-call, automated analysis | SRE/on-call | Product managers, data scientists |

See [ab-testing-deployment.md](../ab-testing-deployment.md) for the full distinction — the mechanisms (traffic splitting) overlap heavily, but the *purpose* and success criteria are fundamentally different.

## 8. When to Use Canary

- Frequent production releases where you want an automated safety net rather than a fully manual blue-green cutover.
- Services with strong existing observability (metrics, tracing) — canary analysis is only as good as the signals feeding it.
- Large-scale services where even a small percentage of traffic is a statistically meaningful sample.

## 9. When to Avoid / Be Careful

- **Low-traffic services**: 5% of a service that gets 100 requests/day is 5 requests — not enough signal to detect a regression reliably. Consider a longer bake time or a higher initial percentage.
- **Non-idempotent or stateful operations** (e.g., payment processing, one-time signup flows): a "small blast radius" is still real users affected by a real bug — canary reduces risk, it doesn't eliminate the need for careful testing beforehand.
- **Session-sensitive apps** without sticky routing: a user could bounce between old and new versions mid-session, causing confusing/inconsistent behavior — use sticky routing if the app has any session-affinity requirements.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
