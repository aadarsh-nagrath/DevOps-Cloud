# Shadow Deployment (Dark Launch / Traffic Mirroring)

Duplicate real production traffic to a new version, but the new version's responses are discarded (never sent back to real users). This lets you validate a new version's behavior against real-world traffic patterns and scale with zero user-facing risk — because users only ever see responses from the stable, unchanged version.

---

## 1. How It Works

```
                        +----------------------------+
                        |  Production (stable, v1)   |
Real user request --->  |  processes request         | ---> response sent to user
                        +----------------------------+
                                   |
                                   | request is MIRRORED (copied), not routed
                                   v
                        +----------------------------+
                        |  Shadow (new version, v2)  |
                        |  processes the same request | ---> response DISCARDED
                        +----------------------------+       (or only logged/compared)
```

1. Every incoming request (or a sampled subset) is duplicated: the original goes to the current production version as normal, and a copy is sent to the shadow (new) version.
2. The shadow version processes the request exactly as it would in real production — same code path, same load pattern.
3. The shadow's response is **never returned to the real user** — it's either discarded, or logged/diffed against the production response for comparison.
4. The user experience is entirely unaffected: they only ever interact with the stable version.

This is the only strategy in this folder with **zero user-facing blast radius even during a bug** — a broken shadow version can error, crash, or return garbage, and no real user is ever affected, because its output never reaches them.

---

## 2. Why Use It

| Benefit | Detail |
|---|---|
| **Zero user risk** | Shadow responses are never returned to users — even a completely broken new version causes no user-visible impact. |
| **Real production traffic patterns** | Unlike synthetic load tests, shadow traffic has the actual shape, volume, and edge cases of real usage — including the weird requests synthetic tests never think to generate. |
| **Real production scale** | Validates the new version under actual peak load, not an estimate of it. |
| **Response diffing** | Comparing shadow output to production output for the same request is a powerful way to catch behavioral regressions before they ever reach users (e.g., migrating a service to a new implementation/language and verifying byte-for-byte or semantically-equivalent output). |

## 3. Costs & Trade-offs

- **Compute cost**: you are running (roughly) double the compute for the duration of the shadow test — every request is now processed twice.
- **Side-effect risk**: if the new version does anything beyond read-only processing (writes to a database, sends emails, charges a payment, calls a third-party API), mirroring that traffic can cause **real, duplicated side effects** — this is the single biggest danger of shadow deployments. You must either:
  - Ensure the shadow version's writes are routed to an isolated/sandboxed dependency set (shadow database, sandboxed payment provider, mocked third-party APIs), or
  - Only shadow-test genuinely read-only/idempotent code paths.
- **Infrastructure complexity**: requires a mirroring mechanism at the proxy/mesh/load-balancer layer — not all infrastructure supports this out of the box.
- **Latency measurement can be misleading**: if shadow traffic runs asynchronously (fire-and-forget, common to avoid slowing down the real response), you can validate correctness but the latency numbers you observe may not perfectly reflect what production latency would be once the shadow becomes the real path (contention/resource sharing differs).

---

## 4. Example: Istio Traffic Mirroring

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: checkout-service
spec:
  hosts: [checkout-service]
  http:
    - route:
        - destination: { host: checkout-service, subset: v1 }
          weight: 100          # 100% of REAL responses still come from v1
      mirror:
        host: checkout-service
        subset: v2              # shadow copy of every request also sent to v2
      mirrorPercentage:
        value: 100.0             # mirror all traffic (tune down for high-volume services)
```
Istio's mirrored requests are fire-and-forget: the response from `v2` (the shadow) is discarded by the mesh automatically. The client/user never even knows shadowing is happening — from their perspective, only `v1`'s response exists.

## 5. Example: NGINX `mirror` Directive

```nginx
location /api/ {
    mirror /shadow-mirror;
    mirror_request_body on;
    proxy_pass http://production-v1-upstream;
}

location = /shadow-mirror {
    internal;                              # not reachable directly by clients
    proxy_pass http://shadow-v2-upstream$request_uri;
}
```

## 6. Example: Application-Level Shadowing (no mesh required)

For teams without a service mesh, shadowing can be implemented in application code — useful for shadowing at a finer granularity than "the whole request" (e.g., shadow just one internal function call, common when migrating a critical algorithm):

```python
def get_recommendations(user_id):
    result = legacy_recommendation_engine(user_id)   # real result, returned to caller

    try:
        shadow_result = new_recommendation_engine(user_id)  # shadow call
        if shadow_result != result:
            metrics.increment("recommendation.shadow_mismatch")
            log.info(f"Shadow mismatch for user={user_id}: legacy={result} new={shadow_result}")
    except Exception:
        # Shadow failures must NEVER affect the real request path
        metrics.increment("recommendation.shadow_error")

    return result   # always the legacy/production result, never the shadow's
```
The critical invariant in this pattern: **the shadow call's success or failure must never affect the real response** — wrap it in error handling that fully isolates it, and never `await`/block the real response path on the shadow call finishing (run it asynchronously, or at minimum with a strict timeout that can't slow down the user-facing request).

---

## 7. When to Use Shadow Deployment

- **Rewrites/migrations**: replacing a critical service's implementation (new language, new algorithm, new database) where correctness under real traffic is the primary concern.
- **Performance validation at true production scale**, before committing to a canary or blue-green cutover.
- **High-stakes services** where even a small percentage of real user impact (as canary would cause) is unacceptable — e.g., payment authorization logic, fraud detection, pricing engines.

## 8. When to Avoid / Be Careful

- Services where the new version's side effects (writes, external calls, emails, charges) can't be safely isolated from the real ones.
- As a *complete substitute* for canary/blue-green: shadowing validates correctness and load behavior, but it doesn't validate the actual user-facing cutover process itself (routing changes, DNS propagation, client-visible behavior) — most teams shadow-test first, then still do a canary or blue-green rollout for the real cutover.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
