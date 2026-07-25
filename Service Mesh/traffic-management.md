# Traffic Management in a Service Mesh

This is the feature most teams adopt a service mesh for first: fine-grained, declarative control over how requests flow between services — routing, splitting, retries, timeouts, and load balancing, all as configuration rather than application code. Examples use Istio's CRDs (the most widely deployed mesh), but the underlying concepts apply to any mesh implementation.

> This file covers **east-west** (service-to-service) routing. For how external traffic *enters* the mesh in the first place — and how the same `VirtualService` resource shown below also handles that — see [Istio Gateway & Ingress](istio-gateway-and-ingress.md). For plain Kubernetes Ingress (no mesh involved), see [Kubernetes Ingress Deep Dive](kubernetes-ingress-deep-dive.md).

---

## 1. The Two Core Building Blocks: VirtualService and DestinationRule

Istio splits traffic management into two complementary resources — this split confuses people early on, so get it clear from the start:

| Resource | Answers the question | Example |
|---|---|---|
| **VirtualService** | *"Where should this request go?"* — routing decision | "Send requests with header `X-Canary: true` to the v2 subset" |
| **DestinationRule** | *"Once it's going to a destination, how should it be treated?"* — policy applied at the destination | "Define what 'v1' and 'v2' subsets actually mean (which pods), and use least-connection load balancing among them" |

```yaml
# DestinationRule: defines the subsets (v1, v2) based on Pod labels, and policy for reaching them
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: payment-service
spec:
  host: payment-service
  trafficPolicy:
    loadBalancer:
      simple: LEAST_REQUEST      # same concept as load-balancing-algorithms.md, applied mesh-internally
  subsets:
    - name: v1
      labels:
        version: v1               # matches Pods labeled version=v1
    - name: v2
      labels:
        version: v2               # matches Pods labeled version=v2
---
# VirtualService: defines the actual ROUTING rule using the subsets defined above
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: payment-service
spec:
  hosts:
    - payment-service
  http:
    - match:
        - headers:
            x-canary:
              exact: "true"
      route:
        - destination:
            host: payment-service
            subset: v2             # canary requests go to v2
    - route:
        - destination:
            host: payment-service
            subset: v1             # everyone else goes to v1 (the default)
```
**Mental model**: `DestinationRule` is the dictionary defining what your labels/subsets mean and how to treat traffic once it arrives; `VirtualService` is the actual decision tree for which subset a given request should be routed to.

---

## 2. Traffic Splitting (Weighted Routing)

This is the exact mechanism behind [Canary Deployments](../Deployment/Canary%20Deployment/canary-deployment.md) at the infrastructure level.

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: payment-service
spec:
  hosts: [payment-service]
  http:
    - route:
        - destination: { host: payment-service, subset: v1 }
          weight: 90          # 90% of traffic to the stable version
        - destination: { host: payment-service, subset: v2 }
          weight: 10          # 10% to the canary
```
**Example scenario**: you've deployed a new version of `payment-service` that fixes a bug, but you're not 100% sure it doesn't introduce a new one. Instead of a full cutover, you route 10% of real traffic to it, watch error rates/latency, and gradually increase the weight (10% → 25% → 50% → 100%) as confidence grows — exactly the canary analysis workflow, just implemented via this weight field instead of a full deploy each time.

---

## 3. Path & Header-Based Routing

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: api-gateway-routes
spec:
  hosts: ["api.example.com"]
  http:
    - match:
        - uri:
            prefix: /v2/
      route:
        - destination: { host: api-service-v2 }
    - match:
        - uri:
            prefix: /v1/
      route:
        - destination: { host: api-service-v1 }
    - match:
        - headers:
            user-agent:
              regex: ".*Mobile.*"
      route:
        - destination: { host: mobile-optimized-backend }
    - route:                              # default/fallback rule if nothing above matched
        - destination: { host: api-service-v1 }
```
**Example scenario**: you're migrating clients from a v1 to a v2 API gradually, or you want mobile clients routed to a backend that returns smaller/optimized payloads — all without the client needing to know anything about it, and without deploying a separate load balancer config outside the mesh.

---

## 4. Retries

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: payment-service
spec:
  hosts: [payment-service]
  http:
    - route:
        - destination: { host: payment-service }
      retries:
        attempts: 3
        perTryTimeout: 2s
        retryOn: 5xx,reset,connect-failure   # only retry on these specific conditions
```
**Why `retryOn` matters**: retrying blindly on every failure (including 4xx client errors, which retrying won't fix) wastes resources and can make an overload situation worse — see the "retrying into a cascading failure" failure mode in [Health Checks & Failover](../Load%20Balancing/health-checks-and-failover.md). Only retry on conditions a retry can plausibly fix: transient network resets, connection failures, or 5xx server errors — never on 4xx (the request itself was invalid, retrying sends the exact same invalid request again).

**Example scenario**: `payment-service` occasionally times out under load for a fraction of a second during a GC pause. Rather than every calling service needing its own retry logic (the duplicated-code problem from [service-mesh-overview.md](service-mesh-overview.md)), this one config applies retries consistently to every caller.

---

## 5. Timeouts

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
      timeout: 3s
```
**Why explicit timeouts matter**: without one, a slow/hung downstream service can hold connections open indefinitely, exhausting connection pools upstream and cascading the slowness backward through the whole call chain — a single stuck dependency can take down services that don't even directly depend on it, several hops away. An explicit timeout bounds the damage: the caller gets a clean, fast failure instead of hanging.

---

## 6. Combining Retries + Timeouts Correctly

A subtle but important interaction: `perTryTimeout` (per retry attempt) should be shorter than the *overall* `timeout`, and you need to account for the fact that `attempts × perTryTimeout` could exceed what the caller upstream of *this* service is willing to wait.

```yaml
http:
  - route:
      - destination: { host: payment-service }
    timeout: 10s                 # overall deadline for the whole request, including all retries
    retries:
      attempts: 3
      perTryTimeout: 3s          # each individual attempt gets up to 3s
      retryOn: 5xx,reset
# Worst case: 3 attempts * 3s = 9s, safely under the 10s overall timeout
```
Getting this wrong (e.g., `perTryTimeout` too close to `timeout`, or too many `attempts`) means retries can silently get cut off mid-attempt by the overall timeout, or a caller waiting 5s total ends up waiting 15s because retries weren't bounded against the caller's own patience.

---

## 7. Traffic Mirroring (Shadow Traffic)

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
          weight: 100
      mirror:
        host: checkout-service
        subset: v2
      mirrorPercentage:
        value: 100.0
```
This is the exact same technique covered in [Shadow Deployment](../Deployment/shadow-deployment.md) — real traffic is duplicated to `v2` for validation, but `v2`'s response is discarded and never affects the real user. Useful for validating a rewrite/migration against real production traffic patterns with zero user-facing risk.

---

## 8. Fault Injection (Chaos Testing Through the Mesh)

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: payment-service
spec:
  hosts: [payment-service]
  http:
    - fault:
        delay:
          percentage: { value: 10 }     # inject a delay on 10% of requests
          fixedDelay: 5s
        abort:
          percentage: { value: 5 }      # inject an outright failure on 5% of requests
          httpStatus: 503
      route:
        - destination: { host: payment-service }
```
**Why this is genuinely useful, not just a novelty**: this lets you test how `checkout-service` (the caller) behaves when `payment-service` is slow or failing, **without actually breaking `payment-service`** — a much safer and more controlled way to chaos-test resilience (does the caller's timeout/retry/circuit-breaker config actually work as intended?) than literally taking a production dependency down.

---

## 9. Load Balancing Policy (Mesh-Internal)

```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: payment-service
spec:
  host: payment-service
  trafficPolicy:
    loadBalancer:
      simple: LEAST_REQUEST       # options: ROUND_ROBIN, LEAST_REQUEST, RANDOM, PASSTHROUGH
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        http1MaxPendingRequests: 50
        maxRequestsPerConnection: 10
```
Same algorithm concepts as [Load Balancing Algorithms](../Load%20Balancing/load-balancing-algorithms.md), but this is happening for **service-to-service (east-west) traffic inside the mesh** — a layer below/behind the north-south load balancing an Ingress Gateway or cloud load balancer does for external traffic entering the cluster (see [Kubernetes Load Balancing](../Load%20Balancing/kubernetes-load-balancing.md) for how these layers stack).

---

## 10. Putting It Together: A Realistic Combined Example

```yaml
# DestinationRule: subsets + connection pool + LB policy
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: recommendation-service
spec:
  host: recommendation-service
  trafficPolicy:
    loadBalancer:
      simple: LEAST_REQUEST
    connectionPool:
      tcp: { maxConnections: 100 }
  subsets:
    - name: stable
      labels: { version: stable }
    - name: canary
      labels: { version: canary }
---
# VirtualService: canary traffic split + retries + timeout, all in one realistic production rule
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: recommendation-service
spec:
  hosts: [recommendation-service]
  http:
    - route:
        - destination: { host: recommendation-service, subset: stable }
          weight: 95
        - destination: { host: recommendation-service, subset: canary }
          weight: 5
      timeout: 2s
      retries:
        attempts: 2
        perTryTimeout: 800ms
        retryOn: 5xx,connect-failure
```
This single pair of resources gives you: a 5% canary rollout, a 2-second overall deadline, and up to 2 retries on genuine transient failures — all declaratively, all changeable without touching or redeploying `recommendation-service`'s actual code.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
