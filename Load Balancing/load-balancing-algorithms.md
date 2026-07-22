# Load Balancing Algorithms

The algorithm determines *which* backend gets the next request. Picking the wrong one for your workload causes uneven load, wasted capacity, or broken user experience (e.g., losing session state). This file covers every algorithm you'll actually encounter in production load balancers.

---

## 1. Round Robin

Requests are distributed to backends in strict rotating order: 1, 2, 3, 1, 2, 3, ...

```
Request 1 -> Backend A
Request 2 -> Backend B
Request 3 -> Backend C
Request 4 -> Backend A   (cycle repeats)
```

- **Pros**: simplest to understand and implement, works well when all backends have equal capacity and requests are roughly uniform in cost.
- **Cons**: ignores actual backend load — if Backend A is still processing a slow request, it still gets the next new one anyway. Ignores backend capacity differences (a small and a large server get equal shares).
- **Use when**: backends are homogeneous (identical specs) and requests are roughly equal in processing cost (e.g., stateless API calls of similar complexity).

```nginx
# NGINX: round robin is the default — no directive needed
upstream backend {
    server 10.0.0.1;
    server 10.0.0.2;
    server 10.0.0.3;
}
```

## 2. Weighted Round Robin

Same rotation, but backends with a higher weight get proportionally more requests — useful for heterogeneous hardware or gradual canary traffic shifting.

```
Backend A (weight=3), Backend B (weight=1)
Sequence: A, A, A, B, A, A, A, B, ...
```

```nginx
upstream backend {
    server 10.0.0.1 weight=3;   # gets ~75% of traffic — bigger/more capable server
    server 10.0.0.2 weight=1;   # gets ~25% of traffic
}
```
This same mechanism (weighted routing) is exactly how [canary deployments](../Deployment/Canary%20Deployment/canary-deployment.md) implement gradual traffic shifting — start the new version's weight at a small value and increase it as confidence grows.

## 3. Least Connections

Route each new request to whichever backend currently has the *fewest active connections*.

```
Backend A: 12 active connections
Backend B: 3 active connections   <- next request goes here
Backend C: 8 active connections
```

- **Pros**: accounts for actual real-time load, not just a blind rotation — much better than round robin when request processing time varies significantly (some requests are fast, some are slow/expensive).
- **Cons**: requires the load balancer to track connection state per backend (more overhead than stateless round robin); "connections" isn't a perfect proxy for "load" (a connection could be idle, or one connection could be doing far more work than another).
- **Use when**: request durations vary a lot (e.g., some API calls are quick reads, others are expensive report generation), or backends have noticeably different current load for any reason.

```nginx
upstream backend {
    least_conn;
    server 10.0.0.1;
    server 10.0.0.2;
    server 10.0.0.3;
}
```

## 4. Weighted Least Connections

Combines the above two — factors in both current connection count *and* a configured capacity weight, so a more powerful server can correctly hold proportionally more concurrent connections before being deprioritized.

```haproxy
backend web_servers
    balance leastconn
    server web1 10.0.0.1:80 weight 3 check
    server web2 10.0.0.2:80 weight 1 check
```

## 5. IP Hash

The client's IP address is hashed to consistently determine which backend they're routed to — the same client IP always lands on the same backend (as long as the backend pool doesn't change).

```nginx
upstream backend {
    ip_hash;
    server 10.0.0.1;
    server 10.0.0.2;
    server 10.0.0.3;
}
```
- **Pros**: cheap way to get session affinity without needing cookies (see [sticky-sessions-and-session-affinity.md](sticky-sessions-and-session-affinity.md)) — useful when the app keeps session state in local memory rather than a shared store.
- **Cons**: **breaks badly whenever the backend pool changes** — adding or removing even one server reshuffles the hash-to-backend mapping for most clients (unless the LB uses consistent hashing specifically, see below), causing a mass session-affinity break exactly during scaling events or deploys. Also unreliable behind NAT/corporate proxies, where many distinct users can share one apparent IP, causing uneven load.
- **Use when**: you need cheap session stickiness and can't/won't move session state to a shared cache — but prefer proper cookie-based stickiness or a shared session store where possible.

## 6. Consistent Hashing

A more sophisticated hashing scheme (backends and keys are placed on a hash ring) designed specifically to minimize redistribution when the backend pool changes — adding/removing one backend only reshuffles a small fraction of the mapping, not most of it.

```
Hash ring (conceptual):
   Backend A at position 15
   Backend B at position 130
   Backend C at position 220
A request's key hashes to position 100 -> routed to the next backend clockwise on the ring -> Backend B
```
- **Use when**: you need hash-based routing (session affinity, or routing to a specific cache shard) *and* the backend pool changes somewhat frequently (autoscaling, rolling deploys) — this is what most modern L7 proxies (Envoy) and cache client libraries (e.g., memcached client-side sharding) use instead of naive IP hash.
- This is also the underlying technique behind sharding strategies for distributed caches and databases, not just load balancers — same problem (minimize reshuffling when the pool changes), same solution.

```yaml
# Envoy: ring hash load balancing policy
lb_policy: RING_HASH
ring_hash_lb_config:
  hash_function: XX_HASH
```

## 7. Random / Power of Two Choices

Pure random selection is rarely used alone (it can produce uneven load by chance), but **"Power of Two Choices"** (pick two backends at random, then route to whichever of the two has fewer active connections) is a clever, low-overhead middle ground between full least-connections tracking and pure randomness — it gets nearly the load-balancing quality of least-connections with much less bookkeeping, and is popular in high-throughput service meshes.

## 8. Latency-Based / Response-Time-Based

Routes to whichever backend has been responding fastest recently — directly optimizes for what users actually experience, adapting automatically to backends that are slow due to GC pauses, noisy neighbors, or partial degradation, even if their connection count looks fine.

- **Use when**: backend performance can vary for reasons that "active connections" doesn't capture (e.g., one instance is on degraded hardware, or experiencing a slow memory leak) — common in cloud environments with heterogeneous underlying hardware, or global load balancing across regions with different network latency to the client.

## 9. Algorithm Comparison Table

| Algorithm | Accounts for real-time load? | Session affinity? | Resilient to pool changes? | Typical use case |
|---|---|---|---|---|
| Round Robin | No | No | Yes | Simple, homogeneous, stateless backends |
| Weighted Round Robin | No | No | Yes | Heterogeneous backend capacity, canary traffic shifting |
| Least Connections | Yes (connection count) | No | Yes | Variable request durations |
| Weighted Least Connections | Yes | No | Yes | Variable durations + heterogeneous capacity |
| IP Hash | No | Yes (per-IP) | **No** — breaks on pool change | Cheap stickiness, small/stable pools |
| Consistent Hashing | No | Yes | Yes (minimal reshuffling) | Stickiness/sharding with frequent scaling |
| Power of Two Choices | Approximately | No | Yes | High-throughput systems wanting cheap load-awareness |
| Latency-Based | Yes (response time) | No | Yes | Heterogeneous hardware, multi-region routing |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
