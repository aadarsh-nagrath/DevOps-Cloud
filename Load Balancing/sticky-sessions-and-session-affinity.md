# Sticky Sessions & Session Affinity

Routing a given client consistently to the same backend server, instead of load balancing every request independently. This file covers why it's needed, how it's implemented, and — just as important — how to avoid needing it at all.

---

## 1. Why Stickiness Is Needed At All

Load balancing works best when every backend is interchangeable — any request can go to any backend and get an identical result. Stickiness becomes necessary specifically when that assumption breaks, most commonly because of **server-side session state stored locally**:

```
Without stickiness:
  Request 1 (login)        -> Backend A -> stores session data IN LOCAL MEMORY on Backend A
  Request 2 (view profile) -> Backend B -> has no idea who this user is! Session data isn't here.
                                             User appears logged out, or gets an error.
```

Common local-state scenarios that create this problem:
- In-memory session stores (the default in many web frameworks unless explicitly configured otherwise).
- WebSocket / long-lived connections — the connection itself is inherently tied to one backend for its entire duration.
- File uploads processed in multiple steps against local disk on a specific instance.
- In-memory caches/rate limiters that are per-instance rather than shared.

---

## 2. The Better Fix: Externalize State (avoid needing stickiness)

Before reaching for session affinity, the architecturally cleaner fix is usually to **remove the need for it entirely** by making backends genuinely stateless:

```
With externalized session state:
  Request 1 (login)        -> Backend A -> stores session in Redis/shared cache
  Request 2 (view profile) -> Backend B -> reads session from the SAME Redis/shared cache -> works correctly
```
- Move session data to a shared store (Redis, Memcached, a database) that every backend can read.
- Use stateless, signed tokens (JWTs) that carry the necessary session data in the request itself, so no server-side session lookup is needed at all.
- This makes every backend genuinely interchangeable again — the ideal state for horizontal scaling, and it also means a backend can be replaced/restarted (see the Pod replacement behavior in [K-pods.md](../Kubernetes/K-pods.md)) without losing any session data, since nothing important lived only on that one instance.

**When you can't avoid it** (legitimately long-lived stateful connections like WebSockets, or a legacy app you can't easily refactor), stickiness is the pragmatic fallback — covered below.

---

## 3. Cookie-Based Affinity (the standard, recommended mechanism)

The load balancer sets a cookie identifying which backend served the first request; subsequent requests with that cookie are routed back to the same backend.

### NGINX
```nginx
upstream backend {
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
    server 10.0.0.3:8080;
    sticky cookie srv_id expires=1h domain=.example.com path=/;   # NGINX Plus feature
}
```

### HAProxy
```haproxy
backend web_servers
    balance roundrobin
    cookie SERVERID insert indirect nocache
    server web1 10.0.0.1:8080 check cookie web1
    server web2 10.0.0.2:8080 check cookie web2
```
`insert` means HAProxy adds the cookie itself (the backend application doesn't need to know anything about it) — the cookie's value is opaque to the client and just identifies which backend to return to.

### AWS ALB (Application Load Balancer)
```bash
aws elbv2 modify-target-group-attributes \
  --target-group-arn arn:aws:elasticloadbalancing:...:targetgroup/my-targets \
  --attributes Key=stickiness.enabled,Value=true \
               Key=stickiness.type,Value=lb_cookie \
               Key=stickiness.lb_cookie.duration_seconds,Value=3600
```

### Kubernetes Service (ClientIP-based, a coarser mechanism — see §4)
```yaml
apiVersion: v1
kind: Service
metadata:
  name: webapp
spec:
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 3600
  selector:
    app: webapp
  ports:
    - port: 80
```
Note Kubernetes Services don't support cookie-based affinity natively (kube-proxy operates at L4 — see [kubernetes-load-balancing.md](kubernetes-load-balancing.md)) — only `ClientIP`-based, which has the same limitations as IP hash below. Cookie-based stickiness in a Kubernetes context requires an Ingress controller or service mesh operating at L7.

---

## 4. IP-Based Affinity (simpler, but weaker)

Same mechanism as the "IP Hash" load balancing algorithm from [load-balancing-algorithms.md](load-balancing-algorithms.md) — the client's source IP determines which backend they consistently land on.

**Problems specific to using this for session affinity**:
- **NAT/corporate proxies**: many distinct real users can share one apparent source IP, all getting pinned to the same backend — breaks the "one user, one backend" assumption stickiness is meant to provide, and can cause uneven load.
- **Mobile clients switching networks** (WiFi to cellular): the client's IP changes mid-session, breaking affinity exactly when the user didn't do anything wrong.
- **Breaks on backend pool changes**: same issue as IP Hash generally — scaling the backend pool up or down reshuffles the IP-to-backend mapping for most clients, all at once.

Use cookie-based affinity instead whenever the client is a web browser (which can accept cookies) — reserve IP-based affinity for non-HTTP protocols where there's no cookie mechanism available at all.

---

## 5. Stickiness and Deployments — a Real Interaction to Watch For

Session affinity interacts with [deployment strategies](../Deployment/deployment-strategies.md) in ways worth planning for:
- **Rolling updates**: if a user is stuck to a backend that gets terminated during a rolling update, their affinity naturally breaks (they get reassigned to a new backend) — if session state wasn't externalized, this is exactly the moment data loss/logout occurs. Another reason to externalize state rather than relying on stickiness long-term.
- **Canary deployments**: sticky sessions actually *help* canary testing be more coherent — you generally want a given user to consistently see either the canary or the stable version for the duration of the test, not flip-flop between them request to request (which would make their experience — and any bugs — confusing and hard to reproduce).
- **Blue-Green cutover**: a full traffic cutover overrides any prior stickiness by definition (every client is now routed to the new environment) — plan for in-flight sticky sessions on the old environment to either drain gracefully or be explicitly migrated/invalidated.

---

## 6. Summary: When to Use Which

| Scenario | Recommended approach |
|---|---|
| New application, in control of the architecture | Externalize session state (shared cache/DB, or stateless tokens) — avoid needing stickiness at all |
| Legacy app with in-memory sessions, can't refactor immediately | Cookie-based affinity as a pragmatic stopgap |
| WebSocket / long-lived stateful connections | Affinity is inherent to the connection lifetime anyway — cookie-based affinity for the initial handshake routing if load balancing across multiple WS backends |
| Non-HTTP protocol, no cookie mechanism available | IP-based affinity (accept its limitations), or consistent hashing at the LB/proxy layer |
| Canary/A-B testing needing consistent per-user experience | Cookie-based affinity (or a dedicated feature-flag/experimentation platform — see [feature-flags-and-progressive-delivery.md](../Deployment/feature-flags-and-progressive-delivery.md)) |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
