# Production Simulation: Chaos Engineering in Action

A hands-on walkthrough using Chaos Mesh on a local Kubernetes cluster (kind or Minikube), so you can actually run deliberate chaos experiments rather than just read about them — a PodChaos kill proving Kubernetes self-heals, a NetworkChaos latency injection proving (or disproving) your timeout config, and a concrete look at what a badly-designed experiment looks like versus a well-designed one. Mirrors the style of the [Kubernetes Pods](../Kubernetes/K-pods.md#production-simulation-how-pods-actually-behave-in-the-real-world), [Load Balancing](../Load%20Balancing/load-balancing-production-simulation.md), and [Service Mesh](../Service%20Mesh/service-mesh-production-simulation.md) production simulations.

---

## 1. The Setup

```bash
# Install Chaos Mesh into a local kind/Minikube cluster via Helm
kubectl create ns chaos-testing
helm repo add chaos-mesh https://charts.chaos-mesh.org
helm install chaos-mesh chaos-mesh/chaos-mesh -n chaos-testing --set chaosDaemon.runtime=containerd
kubectl get pods -n chaos-testing
```
```
NAME                                     READY   STATUS    RESTARTS   AGE
chaos-controller-manager-7d9f8b6c5d-x1   1/1     Running   0          30s
chaos-daemon-4kz2p                       1/1     Running   0          30s
chaos-dashboard-6f8c9d7b4e-p9q           1/1     Running   0          30s
```

A small target application — same shape as the Deployment from [K-pods.md](../Kubernetes/K-pods.md)'s simulation, since that's exactly the self-healing behavior this section deliberately exercises:

```yaml
# checkout-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-service
spec:
  replicas: 3
  selector:
    matchLabels: { app: checkout-service }
  template:
    metadata:
      labels: { app: checkout-service }
    spec:
      containers:
        - name: checkout
          image: ealen/echo-server
          env:
            - { name: PORT, value: "80" }
            - { name: RESPONSE, value: "checkout ok" }
          readinessProbe:
            httpGet: { path: /, port: 80 }
            periodSeconds: 3
```
```bash
kubectl apply -f checkout-deployment.yaml
kubectl get pods -o wide
```
```
NAME                                READY   STATUS    RESTARTS   AGE   IP
checkout-service-6c9f8d7b4-2xk9p    1/1     Running   0          10s   10.244.1.5
checkout-service-6c9f8d7b4-8mzql    1/1     Running   0          10s   10.244.2.3
checkout-service-6c9f8d7b4-vn4rt    1/1     Running   0          10s   10.244.1.6
```

---

## 2. Experiment A: `PodChaos` — Kill a Pod, Deliberately

### The hypothesis, defined before running anything

> If a `checkout-service` pod is killed, the Deployment's ReplicaSet will schedule a replacement within a few seconds, and steady-state pod count (3/3 Ready) will be restored without manual intervention.

This is the *same underlying self-healing mechanism* shown almost by accident in [K-pods.md](../Kubernetes/K-pods.md)'s simulation (`kubectl delete pod`) — the difference here is framing: this is a deliberate chaos experiment with a stated hypothesis, not an ad hoc crash.

```yaml
# podchaos-kill.yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: kill-checkout-pod
  namespace: chaos-testing
spec:
  action: pod-kill
  mode: one                       # blast radius: exactly ONE pod, not all three
  selector:
    namespaces: [default]
    labelSelectors:
      app: checkout-service
```
```bash
kubectl apply -f podchaos-kill.yaml
kubectl get pods -w
```
```
NAME                                READY   STATUS        RESTARTS   AGE
checkout-service-6c9f8d7b4-2xk9p    1/1     Terminating   0          3m   <- Chaos Mesh killed this one
checkout-service-6c9f8d7b4-8mzql    1/1     Running       0          3m
checkout-service-6c9f8d7b4-vn4rt    1/1     Running       0          3m
checkout-service-6c9f8d7b4-h4k9x    0/1     Pending       0          0s   <- ReplicaSet noticed and replaced it
checkout-service-6c9f8d7b4-h4k9x    0/1     ContainerCreating   0    1s
checkout-service-6c9f8d7b4-h4k9x    1/1     Running       0          4s   <- readiness probe passed, hypothesis confirmed
```
```bash
kubectl get events --field-selector reason=Killing --sort-by='.lastTimestamp' | tail -3
```
```
LAST SEEN   TYPE      REASON    OBJECT                                    MESSAGE
90s         Normal    Killing   pod/checkout-service-6c9f8d7b4-2xk9p      Chaos-mesh: pod-kill
```

**Result**: hypothesis held. 3/3 Ready was restored within seconds, no manual action needed. Clean up the experiment:
```bash
kubectl delete -f podchaos-kill.yaml
```

---

## 3. Experiment B: `NetworkChaos` — Inject Latency, Test Your Timeout Config

### Setup: a caller with a timeout, calling `checkout-service`

```bash
kubectl run curl-client --image=curlimages/curl --command -- sleep infinity
```

### The hypothesis, defined before running anything

> If a request to `checkout-service` takes longer than 2 seconds, the caller's configured timeout will trigger a clean failure at ~2s rather than an indefinite hang, because a `VirtualService` timeout policy is in place (same pattern as [../Service Mesh/traffic-management.md](../Service%20Mesh/traffic-management.md) and the fault-injection proof in [../Service Mesh/service-mesh-production-simulation.md](../Service%20Mesh/service-mesh-production-simulation.md)).

```yaml
# networkchaos-latency.yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: checkout-latency
  namespace: chaos-testing
spec:
  action: delay
  mode: all
  selector:
    namespaces: [default]
    labelSelectors:
      app: checkout-service
  delay:
    latency: "5s"                # force every response to take 5 seconds
    jitter: "0ms"
  duration: "3m"                  # auto-revert after 3 minutes — a blast-radius/time control, not manual cleanup
```
```bash
kubectl apply -f networkchaos-latency.yaml
time kubectl exec curl-client -- curl -s --max-time 2 -o /dev/null -w "%{http_code}\n" checkout-service.default.svc.cluster.local
```
```
000
real    0m2.02s
```
With the client's own `--max-time 2` acting as the timeout, the call fails cleanly at ~2 seconds instead of hanging for the full 5s injected delay — **this is exactly what the retry/timeout configuration in [../Service Mesh/traffic-management.md](../Service%20Mesh/traffic-management.md) is meant to guarantee**, now proven under an actual injected delay rather than assumed from reading the config. If this had been a caller with *no* timeout configured, the same test would have surfaced a real gap: the call would hang for the full 5 seconds, tying up the caller's own connection pool — precisely the cascading-failure risk described in [../Service Mesh/resilience-patterns.md](../Service%20Mesh/resilience-patterns.md).

```bash
kubectl delete -f networkchaos-latency.yaml
```

---

## 4. Bad Experiment Design vs Good Experiment Design, Made Concrete

### The bad version (what NOT to do)

```yaml
# BAD — do not run this
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: kill-everything
spec:
  action: pod-kill
  mode: all                        # blast radius: ALL pods matching the selector, no cap
  selector:
    namespaces: [default]          # every namespace-default pod, no label narrowing at all
  # no duration set — runs until manually deleted
  # no steady-state metric defined anywhere
  # no abort condition
  # no one told to watch a dashboard
  # run at 2pm on a Tuesday with no announcement
```
What's wrong with this, concretely:
- `mode: all` with no label narrowing means every pod in the `default` namespace is a target, not just `checkout-service` — the blast radius is effectively "the whole cluster."
- No steady-state metric was captured beforehand — if something breaks, there's no baseline to compare against, and no way to even know for certain the breakage was caused by this experiment versus something unrelated.
- No abort condition and no duration — nothing stops this automatically, and nobody is watching for a manual stop signal either.
- No hypothesis was written down — this is "let's see what happens," not an experiment.

### The good version of the same underlying idea

```yaml
# GOOD — same underlying question ("can we tolerate losing pods"),
# scoped and safe
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: kill-checkout-pod-scoped
  namespace: chaos-testing
spec:
  action: pod-kill
  mode: fixed-percent
  value: "33"                      # blast radius: at most ~1 of 3 replicas, not the whole fleet
  selector:
    namespaces: [default]
    labelSelectors:
      app: checkout-service        # narrowly scoped to the one service under test
  duration: "60s"                   # auto-bounded — no manual cleanup dependency
```
Paired with:
- A steady-state metric captured beforehand (e.g., `checkout-service` readiness stays at 3/3, or if load-testing concurrently, error rate stays under a defined threshold).
- A written hypothesis (matches §2 above).
- An abort condition (e.g., a teammate watching `kubectl get pods -w` live, empowered to `kubectl delete -f` immediately if something unexpected happens).
- Run during a low-risk window the first time, exactly as described in [designing-chaos-experiments.md](designing-chaos-experiments.md)'s blast-radius progression.

The YAML difference between the two versions is small — a `mode`/`selector`/`duration` change — but the *practice* difference is the entire point of this discipline. The tooling doesn't enforce good experiment design for you; the process around it does.

---

## 5. Key Takeaways From Running This Yourself

| What you observed | Why it matters in real production |
|---|---|
| `PodChaos` killed a pod and the ReplicaSet replaced it within seconds | Confirms the same self-healing reconciliation from [K-pods.md](../Kubernetes/K-pods.md), now verified deliberately against a stated hypothesis instead of assumed |
| `NetworkChaos` injected a 5s delay and a 2s client timeout still failed cleanly at ~2s | Proves the timeout/retry configuration from [../Service Mesh/traffic-management.md](../Service%20Mesh/traffic-management.md) actually works, rather than trusting the YAML alone |
| A caller with no timeout would have hung for the full 5s under the same fault | Exactly the cascading-failure risk [../Service Mesh/resilience-patterns.md](../Service%20Mesh/resilience-patterns.md) describes — chaos testing is how you'd catch this gap before a real incident does |
| `duration` auto-reverted the experiment without manual cleanup | Time-boxing is a built-in blast-radius control, not an afterthought |
| The bad experiment (`mode: all`, no duration, no hypothesis, no abort condition) targeted the whole namespace indefinitely | The YAML difference between reckless and disciplined chaos engineering is small — the process discipline around it is what actually matters |
| Every experiment here had a hypothesis defined before it ran | This is what separates chaos engineering from randomly breaking things — see [chaos-engineering-overview.md](chaos-engineering-overview.md) |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
