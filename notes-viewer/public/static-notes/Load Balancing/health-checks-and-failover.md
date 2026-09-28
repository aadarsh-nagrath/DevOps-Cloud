# Health Checks & Failover

A load balancer is only as good as its ability to detect an unhealthy backend and stop sending it traffic. This file covers health check types, tuning trade-offs, and the failure modes that come from getting this wrong.

---

## 1. Active vs Passive Health Checks

### Active Health Checks
The load balancer proactively sends its own probe requests to each backend on a schedule, independent of real client traffic.

```haproxy
server web1 10.0.0.1:8080 check inter 5s fall 3 rise 2
```
- **Pros**: detects a failing backend even during low-traffic periods (doesn't need a real user request to fail first), gives a consistent, predictable detection time.
- **Cons**: adds a small amount of extra load to backends, and the probe itself needs to genuinely reflect real request health (see §3) or it's a false signal either way.

### Passive Health Checks
The load balancer observes the outcome of *real* client requests and marks a backend unhealthy after too many real failures.

```nginx
upstream backend {
    server 10.0.0.1:8080 max_fails=3 fail_timeout=30s;   # NGINX OSS: passive-only
}
```
- **Pros**: no extra synthetic load on backends; reflects real-world failure conditions exactly.
- **Cons**: detection depends on real traffic volume — a low-traffic backend might take a long time to accumulate enough failures to be marked down, and real users experience the failures used to detect the problem in the first place.

**Most production setups use both**: active checks for fast, traffic-independent detection, passive checks as a backstop that also catches failure modes the active probe's specific path/method didn't happen to exercise.

---

## 2. Health Check Parameters and Their Trade-offs

| Parameter | What it controls | Too aggressive (short/strict) | Too lenient (long/loose) |
|---|---|---|---|
| **Interval** | How often to probe | Extra load on backends, noisy flapping on transient blips | Slow to detect real failures |
| **Timeout** | How long to wait for a probe response | False positives if the backend is just briefly slow, not actually down | Slow to detect a genuinely hung backend |
| **Fall threshold** (consecutive failures to mark down) | How many failed probes before removing from rotation | One bad blip takes a healthy backend out of rotation | A truly broken backend keeps receiving traffic for longer |
| **Rise threshold** (consecutive successes to mark healthy again) | How many successful probes before adding back | A backend that's still warming up gets traffic too soon | Slow to restore capacity after a transient issue clears |

There is a real trade-off here, not a single correct answer: aggressive settings (short interval, low fall threshold) detect failures fast but are more prone to **flapping** — repeatedly marking a backend up/down due to transient blips (a brief GC pause, momentary network jitter), which itself causes instability (constant capacity changes, uneven load redistribution). Conservative settings are more stable but slower to react to a real outage.

A reasonable starting point for most HTTP services: `interval=5-10s`, `timeout=2-5s`, `fall=3`, `rise=2` — asymmetric on purpose, since you want to be cautious removing a backend (avoid overreacting to one blip) but a bit quicker to trust it's genuinely healthy again isn't necessary to be as conservative.

---

## 3. What Makes a *Good* Health Check Endpoint

This is where most real production incidents around health checking actually happen — the mechanism (active/passive, interval tuning) is usually fine; the **health check endpoint itself is often too shallow or too strict**.

### Too shallow (false positives — reports healthy when it isn't)
```python
@app.route("/healthz")
def health():
    return "OK", 200   # always returns OK regardless of whether the app can actually do its job
```
This tells the load balancer nothing useful — the process being alive and able to respond to one specific tiny route says nothing about whether it can serve real requests (database connection pool exhausted, downstream dependency unreachable, disk full).

### Better: verify actual critical dependencies
```python
@app.route("/healthz")
def health():
    try:
        db.execute("SELECT 1")           # verify the DB connection actually works
        cache.ping()                      # verify the cache is reachable
        return "OK", 200
    except Exception as e:
        return f"UNHEALTHY: {e}", 503
```

### Too strict (false negatives — reports unhealthy when it's actually fine)
Checking *every* downstream dependency, including non-critical/optional ones, means a single non-essential dependency having a bad day takes the whole backend out of rotation unnecessarily. Distinguish between:
- **Liveness-critical dependencies**: if this is down, the instance genuinely cannot serve any request correctly (primary database).
- **Non-critical/optional dependencies**: a nice-to-have that degrades gracefully if unavailable (a recommendation service, an analytics sink) — a failure here shouldn't remove the instance from the load balancer entirely, just degrade that one feature.

### Readiness vs Liveness — don't conflate them
Same distinction as covered for Kubernetes Pods in [K-pods.md](../Kubernetes/K-pods.md) — a load balancer's health check is functionally a **readiness** check ("should I route traffic here right now"), not a liveness check ("should this process be restarted"). Mixing these concerns (e.g., having the LB health check trigger a process restart on failure, rather than just removing it from rotation) is a design smell — routing decisions and process lifecycle decisions should be handled independently.

---

## 4. Failover Mechanics

### Automatic failover within a load balancer's pool
The scenario covered above — a backend fails its health check, the load balancer stops routing to it, traffic redistributes across the remaining healthy backends. This works cleanly as long as remaining capacity can absorb the load (see the thundering herd risk in §5).

### Failover across load balancers / regions (higher level)
When an entire load balancer, availability zone, or region fails (not just one backend), failover happens at a layer above the load balancer itself — typically DNS-based (see [dns-and-global-load-balancing.md](dns-and-global-load-balancing.md)) or via a global anycast/GSLB product (AWS Global Accelerator, Azure Front Door, GCP's native global load balancer — see [cloud-load-balancers.md](cloud-load-balancers.md)).

```
Normal operation:
  DNS/GSLB -> Region A Load Balancer -> Region A backends (primary)

Region A goes down entirely:
  DNS/GSLB detects Region A's load balancer failing its own health checks
  -> reroutes traffic to Region B Load Balancer -> Region B backends (failover target)
```

### Active-Active vs Active-Passive Failover
| | Active-Active | Active-Passive |
|---|---|---|
| Both regions serving traffic normally? | Yes, simultaneously | No — passive region is idle/standby until failover |
| Resource utilization | Efficient (both regions doing useful work) | Wasteful (passive capacity sits unused most of the time) |
| Failover speed | Fast (already warm, already receiving some traffic) | Slower (passive region may need to scale up / warm caches on failover) |
| Complexity | Higher (data consistency across two active regions is harder) | Lower (one clear source of truth at a time) |
| Typical use | Mature, high-scale systems that can handle multi-region writes/consistency | Simpler systems, or ones where cross-region data consistency is hard to solve |

---

## 5. Failure Modes to Design Around

### Thundering Herd on Failover
When a backend (or an entire region) goes down, its traffic doesn't disappear — it gets redistributed to the remaining healthy capacity, all at once. If the remaining backends weren't provisioned with headroom for this, the sudden load spike can cascade: remaining backends get overwhelmed, start failing their own health checks, get removed too, making the problem worse in a feedback loop.
- **Mitigation**: provision genuine headroom (not just enough capacity for steady-state load), and consider load shedding / rate limiting at the load balancer or application layer so an overload event degrades gracefully (reject some requests cleanly) rather than cascading into a total outage.

### Split-Brain (relevant mainly for load-balancer-pair HA setups, e.g., HAProxy/keepalived pairs)
If a primary/backup pair of load balancers both believe they're the active one simultaneously (e.g., due to a network partition between them), you can get inconsistent routing or, worse, both instances trying to bind the same VIP.
- **Mitigation**: use a proven HA mechanism (VRRP/keepalived with proper fencing, or a cloud-managed LB which sidesteps this entirely by not requiring you to run your own HA pair).

### Health Check Endpoint Becoming a Bottleneck Itself
If the health check endpoint does expensive work (e.g., a full database query under load) and is probed frequently across many load balancer instances, it can itself become a source of load/contention on the very dependency it's checking.
- **Mitigation**: keep health checks lightweight and fast; if you need to verify an expensive dependency, consider caching the last-known-good status for a few seconds rather than checking it on every single probe.

### Retrying Into a Cascading Failure
A load balancer configured to aggressively retry failed requests against other backends can amplify an overload situation — every failed request becomes multiple requests, multiplying load right when the system can least afford it.
- **Mitigation**: bound retries (max attempts, exponential backoff), and pair retries with circuit breaking (Envoy's outlier detection, shown in [kubernetes-load-balancing.md](kubernetes-load-balancing.md), is designed exactly for this).

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
