# Resilience Patterns in a Service Mesh

Distributed systems fail in partial, messy ways — one slow dependency shouldn't be allowed to cascade into a total outage. This file covers the resilience engineering patterns a service mesh applies uniformly at the network layer: circuit breaking, outlier detection, and how they combine with the retries/timeouts already covered in [traffic-management.md](traffic-management.md).

---

## 1. The Cascading Failure Problem

```
checkout-service --calls--> payment-service --calls--> fraud-detection-service (SLOW/HUNG)

Without any protection:
  fraud-detection-service becomes slow (e.g., a downstream dependency of ITS OWN is struggling)
       |
       v
  payment-service's requests to it pile up, exhausting payment-service's connection pool/threads
       |
       v
  payment-service itself becomes slow/unresponsive (even though ITS code is fine — it's just stuck waiting)
       |
       v
  checkout-service's requests to payment-service now pile up too
       |
       v
  checkout-service becomes slow/unresponsive
       |
       v
  The ENTIRE user-facing system is now degraded, because of ONE slow dependency three hops away
```
This is a genuinely common real-world incident pattern — a single struggling service causing a cascading, system-wide outage. The patterns below exist specifically to stop this propagation at each hop.

---

## 2. Circuit Breaking

Modeled directly on electrical circuit breakers: if a dependency keeps failing, **stop calling it entirely for a while** (fail fast instead of piling up waiting requests), then periodically test if it's recovered before fully resuming traffic.

```
                  Normal traffic flows
                        |
                        v
              [ CLOSED state — calls go through normally ]
                        |
          too many failures/timeouts observed
                        v
              [ OPEN state — calls FAIL IMMEDIATELY, ]
              [ without even attempting the network call ]
                        |
                 after a cooldown period
                        v
              [ HALF-OPEN — allow a small number of test calls through ]
                    |                    |
              they succeed          they fail again
                    v                    v
              back to CLOSED        back to OPEN (retry cooldown)
```

### Why "fail immediately" is actually the resilient choice
It seems counterintuitive — isn't giving up on a dependency worse than trying? But the key insight is: **a request that's going to fail anyway is better failed fast than failed slow**. Failing fast means:
- The calling service (`payment-service` in the example above) doesn't waste its own limited connection pool/threads waiting on a doomed call.
- The caller can fail gracefully and quickly (return a clear error, use a fallback/cached response) rather than hanging and dragging its own health down with it.
- This is precisely what stops the cascading failure pattern in §1 from propagating further up the chain.

### Istio's Circuit Breaking Configuration (`DestinationRule`)
```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: fraud-detection-service
spec:
  host: fraud-detection-service
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 50            # cap concurrent TCP connections to this service
      http:
        http1MaxPendingRequests: 20    # cap requests queued waiting for a connection
        maxRequestsPerConnection: 10
    outlierDetection:                  # this is Istio's actual circuit-breaking mechanism — see below
      consecutive5xxErrors: 5
      interval: 30s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
```
Istio's `connectionPool` settings act as a basic circuit breaker in themselves — once `maxConnections`/`http1MaxPendingRequests` limits are hit, additional requests fail immediately (an "open circuit" for new load) rather than queueing indefinitely and making the pileup worse. `outlierDetection` (below) is the more sophisticated, per-instance version.

---

## 3. Outlier Detection (Per-Instance Circuit Breaking)

While the basic circuit breaking above protects against a *whole service* being overwhelmed, **outlier detection** is more precise: it ejects *individual unhealthy instances* from the load-balancing pool, while continuing to route to the other healthy instances of that same service.

```
fraud-detection-service has 5 replicas:
  Pod 1: healthy
  Pod 2: healthy
  Pod 3: returning 5xx errors repeatedly    <- outlier detection notices THIS ONE specifically
  Pod 4: healthy
  Pod 5: healthy

Outlier detection ejects ONLY Pod 3 from the load-balancing pool temporarily,
while Pods 1, 2, 4, 5 continue serving traffic normally.
```

```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: fraud-detection-service
spec:
  host: fraud-detection-service
  trafficPolicy:
    outlierDetection:
      consecutive5xxErrors: 5      # eject after 5 consecutive 5xx responses from ONE instance
      interval: 30s                 # how often to check
      baseEjectionTime: 30s         # how long to eject for, the first time
      maxEjectionPercent: 50        # never eject more than 50% of instances at once (safety limit)
```

### Why `maxEjectionPercent` is a critical safety valve
Without this cap, imagine a bad deploy makes *all* instances of a service start failing simultaneously — outlier detection would eject 100% of them, leaving **zero** capacity to serve any traffic, which is strictly worse than leaving some (even degraded) capacity available. `maxEjectionPercent: 50` guarantees at least half the pool stays available even in a worst-case scenario — a deliberate trade-off between "eject bad instances" and "don't eject yourself into a total outage."

This is conceptually the same self-healing behavior as [Health Checks & Failover](../Load%20Balancing/health-checks-and-failover.md) covers for traditional load balancers — outlier detection is essentially the mesh's own active health checking mechanism, applied per-request based on observed response codes rather than (or in addition to) a separate synthetic probe.

---

## 4. How These Patterns Compose

Retries, timeouts, circuit breaking, and outlier detection are not alternatives to each other — they're complementary layers that work together:

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: fraud-detection-service
spec:
  hosts: [fraud-detection-service]
  http:
    - route:
        - destination: { host: fraud-detection-service }
      timeout: 3s                    # 1. bound how long ANY single attempt can take
      retries:
        attempts: 2                  # 2. retry transient failures a bounded number of times
        perTryTimeout: 1s
        retryOn: 5xx,connect-failure
---
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: fraud-detection-service
spec:
  host: fraud-detection-service
  trafficPolicy:
    connectionPool:
      http:
        http1MaxPendingRequests: 20  # 3. cap queued requests — a basic circuit breaker
    outlierDetection:
      consecutive5xxErrors: 5        # 4. eject specifically bad instances from the pool
      interval: 30s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
```

**How this plays out during a real partial outage** (imagine 2 of 5 `fraud-detection-service` instances start failing):
1. Requests to the 2 bad instances start timing out/erroring — retries (bounded to 2 attempts, 1s each) kick in and often succeed by hitting a *different*, healthy instance on the retry.
2. After 5 consecutive failures against a specific bad instance, outlier detection ejects just that instance — future requests don't even get routed to it anymore, so retries stop being needed for that instance specifically.
3. `http1MaxPendingRequests` caps how many requests can queue up waiting even during the worst of it, so `payment-service` (the caller) never has unboundedly many requests stuck waiting — protecting it from being dragged down in turn, breaking the cascading failure chain from §1.
4. `maxEjectionPercent: 50` guarantees at least some capacity remains even if things get much worse than expected.

None of this required a single line of code change in `payment-service` or `fraud-detection-service` — it's entirely mesh configuration, applied uniformly, and (crucially) **testable via fault injection** (see the `fault` example in [traffic-management.md](traffic-management.md)) before you ever need it during a real incident.

---

## 5. Key Takeaways

- **Fail fast is a resilience strategy, not a shortcut** — bounding how long a request can hang protects the *caller's* own health, which is what actually stops cascading failures.
- **Circuit breaking and outlier detection operate at different granularities**: connection pool limits protect against overload of a whole destination; outlier detection specifically isolates individual bad instances while keeping the rest of the pool serving traffic.
- **Always cap the blast radius of automated remediation** (`maxEjectionPercent`, bounded retry `attempts`) — an automated system that can eject/retry unboundedly can itself become the cause of an outage in a bad-enough scenario.
- **Test these configurations with fault injection before you need them for real** — a circuit breaker you've never actually seen trip is a circuit breaker you don't actually know works correctly.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
