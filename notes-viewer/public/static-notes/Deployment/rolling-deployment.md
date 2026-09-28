# Rolling Deployment (Rolling Update)

Gradually replace old-version instances with new-version instances, a few at a time, so the application never goes fully offline. This is the default deployment strategy in Kubernetes and most modern orchestrators.

---

## 1. How It Works

```
Time -->
Step 1: [old][old][old][old]                 (4 old instances, 0 new)
Step 2: [new][old][old][old]                 (1 replaced)
Step 3: [new][new][old][old]                 (2 replaced)
Step 4: [new][new][new][old]                 (3 replaced)
Step 5: [new][new][new][new]                 (rollout complete)
```

At every step, both old and new versions are serving live traffic simultaneously. This is the defining trade-off of rolling deployments: **zero downtime, but a window where two versions coexist** — which means your API/schema must be backward-compatible during the rollout (see the expand/contract pattern in [deployment-strategies.md](deployment-strategies.md)).

The orchestrator replaces instances in small batches, waiting for each new instance to pass its readiness probe before continuing to the next batch (or before terminating the next old instance).

---

## 2. Key Tuning Parameters

| Parameter | Meaning |
|---|---|
| `maxUnavailable` | How many instances can be down/not-ready at once during the rollout. Higher = faster rollout, but less capacity while it's in progress. |
| `maxSurge` | How many *extra* instances above the desired replica count can be created temporarily during the rollout. Higher = faster rollout, but needs more headroom capacity. |
| Readiness probe delay/threshold | How long the orchestrator waits before trusting a new instance is healthy. Too short = broken instances get traffic; too long = slow rollout. |
| Rollout pause/step interval | How long to wait between batches — gives you time to watch metrics before continuing (some tools support "bake time" per step). |

## 3. Example: Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 10
  strategy:
    type: RollingUpdate    # this is actually the default; shown explicitly here
    rollingUpdate:
      maxUnavailable: 1    # at most 1 of 10 pods down at a time (conservative)
      maxSurge: 2          # up to 2 extra pods (12 total) can exist mid-rollout
  selector:
    matchLabels:
      app: web-app
  template:
    metadata:
      labels:
        app: web-app
    spec:
      containers:
        - name: web-app
          image: myorg/web-app:1.4.0
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
            periodSeconds: 5
            failureThreshold: 2
```

```bash
# Trigger a rolling update by changing the image
kubectl set image deployment/web-app web-app=myorg/web-app:1.5.0

# Watch the rollout progress live
kubectl rollout status deployment/web-app

# If it's going badly, undo immediately — Kubernetes rolls the OLD replicaset
# back in using the same rolling strategy (also zero-downtime)
kubectl rollout undo deployment/web-app

# Inspect rollout history
kubectl rollout history deployment/web-app
```

### Why `maxUnavailable: 0` isn't automatically "safer"
Setting `maxUnavailable: 0` forces Kubernetes to only use `maxSurge` (always spin up new pods before removing old ones), which guarantees full capacity throughout — but requires headroom (extra CPU/memory quota) to schedule the surge pods. If your cluster is already at capacity, `maxSurge` pods can get stuck `Pending`, stalling the rollout. Size `maxSurge` based on real spare capacity, not just "0 is safest."

## 4. Example: AWS ECS

ECS's default deployment is also a rolling update, controlled by `minimumHealthyPercent` / `maximumPercent`:
```json
{
  "deploymentConfiguration": {
    "minimumHealthyPercent": 100,
    "maximumPercent": 200
  }
}
```
- `minimumHealthyPercent: 100` — never drop below the desired task count (equivalent to `maxUnavailable: 0`).
- `maximumPercent: 200` — allow doubling task count temporarily (equivalent to a large `maxSurge`).

---

## 5. Failure Handling

- **Automatic rollback on failed health checks**: most orchestrators (Kubernetes, ECS) will halt or reverse a rollout if new instances keep failing readiness checks, rather than continuing to replace healthy old instances with broken new ones. Confirm this behavior is actually configured — it's not always the default.
- **Partial rollout is a real state, not an edge case**: monitoring/alerting must handle "10% of instances are on version N+1" as a normal, expected condition, or you'll get noisy false alarms every single deploy.
- **In-flight requests during instance termination**: use a graceful shutdown (SIGTERM handling, connection draining / `preStop` hook + load balancer deregistration delay) so requests being served by an instance about to be killed have time to finish.

```yaml
# Kubernetes graceful shutdown example
spec:
  terminationGracePeriodSeconds: 30
  containers:
    - name: web-app
      lifecycle:
        preStop:
          exec:
            command: ["sh", "-c", "sleep 5"]  # give the load balancer time to stop routing here before SIGTERM
```

---

## 6. Rolling vs Blue-Green vs Canary — Quick Distinction

- **Rolling**: replaces instances gradually *in place*, within one environment/fleet. No separate environment, no traffic-splitting rules — the orchestrator itself is doing the gradual replacement.
- **Blue-Green**: two *entirely separate* environments; traffic moves all-at-once via a switch, not gradually per-instance. See [Blue-Green Deployment/blue-green-deployment.md](Blue-Green%20Deployment/blue-green-deployment.md).
- **Canary**: traffic is deliberately and controllably split by *percentage* (not just "however many instances have been swapped so far"), usually with automated metric analysis gating each traffic-percentage increase. See [Canary Deployment/canary-deployment.md](Canary%20Deployment/canary-deployment.md).

Rolling updates are "good enough" risk mitigation for most services; reach for Canary when you need tighter, metrics-gated control over exactly how much traffic sees the new version at each step.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
