# Production Simulation: Service Mesh in Action

A hands-on walkthrough using Istio on a local Kubernetes cluster (Minikube or kind), so you can actually observe mesh behavior rather than just read about it — mTLS encrypting traffic automatically, a canary rollout by weight, a service failing and retries/circuit breaking kicking in, and fault injection. Builds on the install steps in [istio.md](../istio.md) — start there if you haven't installed Istio yet. Mirrors the style of the [Kubernetes Pods](../Kubernetes/K-pods.md#production-simulation-how-pods-actually-behave-in-the-real-world) and [Load Balancing](../Load%20Balancing/load-balancing-production-simulation.md) production simulations.

---

## 1. The Setup: Two Services, Meshed

```yaml
# echo-v1.yaml — our "backend" service, version 1
apiVersion: apps/v1
kind: Deployment
metadata:
  name: echo-v1
spec:
  replicas: 2
  selector:
    matchLabels: { app: echo, version: v1 }
  template:
    metadata:
      labels: { app: echo, version: v1 }
    spec:
      containers:
        - name: echo
          image: ealen/echo-server
          env:
            - { name: PORT, value: "80" }
            - { name: RESPONSE, value: "Hello from v1" }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: echo-v2
spec:
  replicas: 2
  selector:
    matchLabels: { app: echo, version: v2 }
  template:
    metadata:
      labels: { app: echo, version: v2 }
    spec:
      containers:
        - name: echo
          image: ealen/echo-server
          env:
            - { name: PORT, value: "80" }
            - { name: RESPONSE, value: "Hello from v2" }
---
apiVersion: v1
kind: Service
metadata:
  name: echo
spec:
  selector: { app: echo }   # matches BOTH v1 and v2 pods — the DestinationRule below defines the subsets
  ports:
    - { port: 80, targetPort: 80 }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: curl-client       # our "caller" service, used to generate traffic from inside the mesh
spec:
  replicas: 1
  selector:
    matchLabels: { app: curl-client }
  template:
    metadata:
      labels: { app: curl-client }
    spec:
      containers:
        - name: curl
          image: curlimages/curl
          command: ["sleep", "infinity"]
```
```bash
kubectl label namespace default istio-injection=enabled
kubectl apply -f echo-v1.yaml
kubectl get pods
```
```
NAME                            READY   STATUS    RESTARTS   AGE
echo-v1-7d9f8b6c5d-2xk9p        2/2     Running   0          10s   <- 2/2: app container + Envoy sidecar
echo-v1-7d9f8b6c5d-8mzql        2/2     Running   0          10s
echo-v2-6c8d9f7b4e-vn4rt        2/2     Running   0          10s
echo-v2-6c8d9f7b4e-f7k2n        2/2     Running   0          10s
curl-client-5f6d8c9b7a-3jk8m    2/2     Running   0          10s
```
Notice `READY 2/2`, not `1/1` — confirming the sidecar was actually injected into every pod, exactly as described in [service-mesh-architecture-and-sidecar-pattern.md](service-mesh-architecture-and-sidecar-pattern.md).

---

## 2. Simulation: mTLS Is Already Encrypting Your Traffic (Without You Doing Anything)

```bash
CLIENT_POD=$(kubectl get pod -l app=curl-client -o jsonpath='{.items[0].metadata.name}')
kubectl exec -it $CLIENT_POD -c curl -- curl -s echo.default.svc.cluster.local
```
```
Hello from v1
```
That worked over what your application code thinks is plain HTTP — but it wasn't. Check the actual encryption status:
```bash
istioctl proxy-config secret $CLIENT_POD
```
```
RESOURCE NAME     TYPE           STATUS     VALID CERT     SERIAL NUMBER
default           Cert Chain     ACTIVE     true           1a2b3c4d...
ROOTCA             CA             ACTIVE     true           5e6f7g8h...
```
A real, active, valid certificate — issued automatically by `istiod`, with zero manual certificate configuration. **This is the exact mechanism described in [security-and-mtls.md](security-and-mtls.md)**: your `curl-client` container made a plain HTTP call, its sidecar intercepted it via `iptables`, encrypted it with mTLS, and the receiving `echo` pod's sidecar decrypted it before handing off a plain HTTP request to the actual `echo` container — neither container's code ever touched TLS.

```bash
# Try enforcing STRICT mTLS mesh-wide and confirm plaintext gets rejected
kubectl apply -f - <<EOF
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system
spec:
  mtls:
    mode: STRICT
EOF
```

---

## 3. Simulation: Canary Traffic Split by Weight

```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: echo
spec:
  host: echo
  subsets:
    - name: v1
      labels: { version: v1 }
    - name: v2
      labels: { version: v2 }
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: echo
spec:
  hosts: [echo]
  http:
    - route:
        - destination: { host: echo, subset: v1 }
          weight: 80
        - destination: { host: echo, subset: v2 }
          weight: 20
```
```bash
kubectl apply -f echo-canary-routing.yaml
for i in {1..20}; do
  kubectl exec $CLIENT_POD -c curl -- curl -s echo.default.svc.cluster.local
done | sort | uniq -c
```
```
     16 Hello from v1
      4 Hello from v2
```
Roughly 80/20, matching the configured weights — live, with zero redeploys of either `echo-v1` or `echo-v2`, and no changes to `curl-client` either. This is precisely the mechanism behind [Canary Deployment](../Deployment/Canary%20Deployment/canary-deployment.md), demonstrated directly at the `VirtualService` level. Try bumping `v2`'s weight to 100 and `v1`'s to 0, reapply, and rerun the loop — full promotion, no pod restarts required.

---

## 4. Simulation: A Service Fails, Retries Kick In

```yaml
# flaky-echo.yaml — simulates a backend that fails ~50% of the time (like a real intermittent bug)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: flaky-echo
spec:
  replicas: 1
  selector:
    matchLabels: { app: flaky-echo }
  template:
    metadata:
      labels: { app: flaky-echo }
    spec:
      containers:
        - name: flaky
          image: ealen/echo-server
          env:
            - { name: PORT, value: "80" }
            - { name: HTTP_ROUTING_MOCK_ROUTE_ENABLED, value: "true" }
---
apiVersion: v1
kind: Service
metadata:
  name: flaky-echo
spec:
  selector: { app: flaky-echo }
  ports: [{ port: 80, targetPort: 80 }]
```
```bash
kubectl apply -f flaky-echo.yaml
```
Without retries, watch a chunk of requests fail:
```bash
for i in {1..10}; do
  kubectl exec $CLIENT_POD -c curl -- curl -s -o /dev/null -w "%{http_code}\n" flaky-echo.default.svc.cluster.local/mock/status/500\?probability=0.5
done
```
```
200
500
200
500
500
200
200
500
200
500
```
Now add mesh-level retries — exactly the `VirtualService` pattern from [traffic-management.md](traffic-management.md):
```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: flaky-echo
spec:
  hosts: [flaky-echo]
  http:
    - route:
        - destination: { host: flaky-echo }
      retries:
        attempts: 3
        perTryTimeout: 2s
        retryOn: 5xx
```
```bash
kubectl apply -f flaky-echo-retry.yaml
for i in {1..10}; do
  kubectl exec $CLIENT_POD -c curl -- curl -s -o /dev/null -w "%{http_code}\n" flaky-echo.default.svc.cluster.local/mock/status/500\?probability=0.5
done
```
```
200
200
200
200
200
200
200
200
200
200
```
With a 50% single-attempt failure rate and up to 3 attempts, the probability of *all three* attempts failing is `0.5³ = 12.5%` — most requests that would have failed outright now succeed on a retry, entirely transparently to `curl-client`. This is the exact resilience improvement [resilience-patterns.md](resilience-patterns.md) describes, made concrete.

---

## 5. Simulation: Fault Injection (Testing Resilience Safely)

Rather than waiting for a real failure, inject one deliberately to verify your timeout configuration actually works:

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: echo
spec:
  hosts: [echo]
  http:
    - fault:
        delay:
          percentage: { value: 100 }
          fixedDelay: 5s          # force every request to take 5 seconds
      route:
        - destination: { host: echo, subset: v1 }
      timeout: 2s                  # but we only allow 2 seconds
```
```bash
kubectl apply -f echo-fault-injection.yaml
time kubectl exec $CLIENT_POD -c curl -- curl -s -o /dev/null -w "%{http_code}\n" echo.default.svc.cluster.local
```
```
504
real    0m2.1s
```
The client correctly received a clean `504` timeout at ~2 seconds — not a 5-second hang. This proves the `timeout: 2s` policy actually works, **without needing to wait for `echo-v1` to genuinely become slow in production first**. This is exactly the safe chaos-testing value described in [traffic-management.md](traffic-management.md) — you've now verified real resilience behavior under controlled conditions.

```bash
# Clean up the fault injection
kubectl delete -f echo-fault-injection.yaml
```

---

## 6. Simulation: Watching It All in Kiali

```bash
istioctl dashboard kiali
```
Generate some traffic and watch the graph update live:
```bash
for i in {1..50}; do kubectl exec $CLIENT_POD -c curl -- curl -s echo.default.svc.cluster.local > /dev/null; sleep 0.2; done
```
You'll see the `curl-client -> echo` edge appear with a live request rate, the padlock icon confirming mTLS (from §2), and — if you re-apply the canary split from §3 — two separate weighted edges to the `v1` and `v2` subsets, matching the observed 80/20 split. This is the [observability-in-service-mesh.md](observability-in-service-mesh.md) service graph concept made concrete and visible, generated entirely from what you've already deployed above — no separate instrumentation step required.

---

## 7. Key Takeaways From Running This Yourself

| What you observed | Why it matters in real production |
|---|---|
| Pods show `2/2 Ready`, confirming automatic sidecar injection | Verifies the mesh is actually intercepting traffic, not just installed |
| A plain `curl` call was transparently mTLS-encrypted | Zero-trust security applied with zero application code changes — see [security-and-mtls.md](security-and-mtls.md) |
| Traffic split roughly matched the configured weight, live, with no redeploys | The exact mechanism behind canary rollouts — see [Canary Deployment](../Deployment/Canary%20Deployment/canary-deployment.md) |
| Retries turned a 50%-failing backend into a near-100%-succeeding one, transparently | Resilience applied uniformly at the mesh layer, not duplicated in every caller's code |
| Fault injection proved a timeout policy works without waiting for a real incident | Safe, repeatable resilience testing — verify your safety nets before you need them |
| Kiali's graph updated live to reflect real observed traffic | Mesh observability requires zero app instrumentation — see [observability-in-service-mesh.md](observability-in-service-mesh.md) |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
