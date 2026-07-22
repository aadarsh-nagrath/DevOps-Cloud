# Recreate Deployment

The simplest deployment strategy: stop all instances of the old version, then start all instances of the new version. There is a gap where nothing is running.

---

## 1. How It Works

```
Time -->
Old version:  [running][running][running][STOPPED]
New version:                              [starting][running][running]
                                           ^
                                    outage window here
```

1. Traffic to the app is stopped (or the app is taken out of the load balancer pool).
2. All old-version instances are terminated.
3. New-version instances are started.
4. Once new instances pass health checks, traffic resumes.

There is no coexistence between old and new versions — this is the key property that makes Recreate both the simplest and the riskiest strategy.

---

## 2. When to Use It

- **Non-production environments** (dev, staging, CI ephemeral environments) — downtime doesn't matter, and simplicity/speed to deploy matters more.
- **Apps that cannot run two versions simultaneously** — e.g., a singleton batch processor, a legacy app with in-memory shared state that would conflict across versions, or an app where the schema change is a hard breaking change with no expand/contract path.
- **Scheduled maintenance windows** — internal tools, batch systems, or apps with an accepted maintenance window (e.g., "deploys happen Tuesday 2am, 5 min downtime").
- **Cost-constrained environments** — no budget/capacity for a second full environment (contrast with Blue-Green).

## 3. When to Avoid It

- Any customer-facing production service with an uptime SLA.
- Anything with active user sessions that would be disrupted (unless sessions are externalized to Redis/DB and can survive instance restarts — but the *app being unavailable* during the swap is still downtime regardless).

---

## 4. Example: Kubernetes

Kubernetes Deployments support this explicitly via `strategy.type: Recreate`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: batch-worker
spec:
  replicas: 3
  strategy:
    type: Recreate   # all old pods are terminated before any new pod is created
  selector:
    matchLabels:
      app: batch-worker
  template:
    metadata:
      labels:
        app: batch-worker
    spec:
      containers:
        - name: batch-worker
          image: myorg/batch-worker:2.0.0
```
Kubernetes' default strategy is actually `RollingUpdate` (see [rolling-deployment.md](rolling-deployment.md)) — you must opt into `Recreate` explicitly. Common reason to do so: the workload can't tolerate two versions running concurrently, e.g. it holds an exclusive lock on a shared resource, or old/new schema versions are mutually incompatible.

## 5. Example: Docker Compose

```bash
# Compose's default `up` behavior recreates changed services this way
docker compose stop myapp
docker compose rm -f myapp
docker compose up -d myapp
```

## 6. Example: Plain systemd service on a VM

```bash
#!/usr/bin/env bash
set -euo pipefail

systemctl stop myapp                 # outage begins
cp /tmp/myapp-new-binary /opt/myapp/bin/myapp
systemctl start myapp                # outage ends once app passes healthcheck
systemctl status myapp --no-pager
```

---

## 7. Minimizing the Damage

If you must use Recreate in front of real users:
- **Maintenance page**: serve a static "we'll be back" page from the load balancer/CDN during the outage window rather than connection errors.
- **Schedule it**: pick genuinely low-traffic windows and communicate them (status page, in-app banner).
- **Keep the outage window short**: pre-pull images, pre-warm caches where possible so the new version starts fast once it launches.
- **Automate the whole sequence** so the outage duration is deterministic and short, not "however long it takes someone to manually run five commands."

---

## 8. Comparison Note

Recreate is the baseline every other strategy is measured against — every other strategy in this folder exists specifically to eliminate the outage window shown in the diagram above. See [deployment-strategies.md](deployment-strategies.md) for the full comparison table.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
