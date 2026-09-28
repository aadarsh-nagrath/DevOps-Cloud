# Service Mesh Architecture & the Sidecar Pattern

How a service mesh actually intercepts traffic without application code changes — the sidecar injection mechanism, `iptables` redirection, and the full data plane / control plane architecture.

---

## 1. The Sidecar Pattern

A "sidecar" is a second container that runs **in the same Pod** as your application container, sharing the same network namespace (same localhost, same IP — this is the same Pod networking model covered in [K-pods.md](../Kubernetes/K-pods.md)).

```
                    Pod
        +---------------------------+
        |  App Container             |
        |  (your actual service)     |
        |  listens on :8080           |
        |                              |
        |  Envoy Sidecar Container    |
        |  (injected automatically)   |
        |  listens on :15001 (out)     |
        |  listens on :15006 (in)      |
        |  shares network namespace   |
        |  with the app container      |
        +---------------------------+
```

Because they share a network namespace, the sidecar can transparently intercept **every** packet entering or leaving the Pod — the app container has no way to bypass it even if it wanted to (barring specific exclusion rules).

---

## 2. How Sidecar Injection Works (Istio Example)

### Step 1: Enable injection on a namespace
```bash
kubectl label namespace default istio-injection=enabled
```
This label is what triggers Istio's control plane (`istiod`) to automatically add the sidecar to any Pod created in this namespace going forward — existing Pods aren't retroactively modified until they're recreated.

### Step 2: A Pod is created — the Mutating Webhook fires
Istio registers a Kubernetes **Mutating Admission Webhook**. When the Kubernetes API server receives a request to create a Pod in a labeled namespace, it calls out to this webhook *before* actually creating the Pod, and the webhook rewrites the Pod spec to add the sidecar container.

```yaml
# What you write:
apiVersion: v1
kind: Pod
metadata:
  name: checkout-service
spec:
  containers:
    - name: checkout-service
      image: myorg/checkout-service:1.0

# What actually gets created (after the mutating webhook modifies it):
apiVersion: v1
kind: Pod
metadata:
  name: checkout-service
spec:
  initContainers:
    - name: istio-init                    # sets up the iptables rules (see below), then exits
      image: istio/proxyv2
  containers:
    - name: checkout-service               # your original container, unchanged
      image: myorg/checkout-service:1.0
    - name: istio-proxy                     # the injected Envoy sidecar — added automatically
      image: istio/proxyv2
```
This is exactly what the `istio.md` install walkthrough refers to when it says "Init Containers" show up when you `kubectl describe pod` — the `istio-init` container is what configures the traffic interception rules described next, then exits before your app container even starts.

### Step 3: Manual/explicit injection (alternative to namespace labeling)
```bash
# Inject the sidecar into a manifest before applying it, rather than relying on the webhook
istioctl kube-inject -f my-app.yaml | kubectl apply -f -
```
Useful for CI pipelines that want deterministic, explicit control over what gets deployed, rather than relying on a cluster-side webhook that could theoretically be misconfigured or disabled.

---

## 3. How Traffic Interception Actually Works: `iptables`

This is the part most tutorials skip, and it's the key to understanding why the sidecar pattern is "transparent" — the application genuinely does not know the sidecar exists.

The `istio-init` container configures `iptables` rules inside the Pod's network namespace:

```bash
# Simplified version of what istio-init actually sets up (illustrative, not exact syntax)
iptables -t nat -A OUTPUT -p tcp -j REDIRECT --to-port 15001   # redirect ALL outbound app traffic to the sidecar
iptables -t nat -A PREROUTING -p tcp -j REDIRECT --to-port 15006  # redirect ALL inbound traffic to the sidecar first
```

```
Outbound request from app container (e.g., checkout-service calling payment-service):
  App code calls http://payment-service:8080/charge
       |
       v (iptables silently redirects this — app code has NO idea)
  Envoy sidecar (port 15001) intercepts it
       |
       v (Envoy applies mTLS, retries, routing rules, THEN sends it out for real)
  Actual network call to payment-service's sidecar

Inbound request arriving at this Pod:
  Network packet arrives at the Pod's IP
       |
       v (iptables silently redirects this too)
  Envoy sidecar (port 15006) intercepts it first
       |
       v (Envoy decrypts mTLS, applies inbound policy, THEN hands off to the real app)
  App container receives the plain, already-decrypted request on its normal port
```

**This is why zero application code changes are needed.** The app makes what looks like a completely normal HTTP call; the kernel-level `iptables` rules silently reroute it through the sidecar first, in both directions, and the app never sees the difference.

### Excluding traffic from interception (when you need to)
```yaml
# Pod annotation: exclude specific ports from Istio's traffic interception
# Common for things like health check ports where mTLS would break a kubelet probe,
# or third-party traffic you deliberately don't want meshed
metadata:
  annotations:
    traffic.sidecar.istio.io/excludeInboundPorts: "15020"
```

---

## 4. Control Plane: What `istiod` Actually Does

The control plane is the "brain" — it never touches actual application traffic itself (that's 100% the data plane's job), it only configures the data plane proxies.

```
                        +------------------+
                        |     istiod        |     <- Control Plane
                        |  (Control Plane)   |
                        +------------------+
                          |       |       |
              (config)    |       |       |   (config)
                          v       v       v
                    +--------+ +--------+ +--------+
                    | Envoy  | | Envoy  | | Envoy  |    <- Data Plane
                    | sidecar| | sidecar| | sidecar|
                    +--------+ +--------+ +--------+
                    checkout   payment    fraud-detect
                    -service   -service   -service
```

`istiod` (in modern Istio versions, this replaced the older split of Pilot/Citadel/Galley into one binary) handles:

| Responsibility | Detail |
|---|---|
| **Service discovery** | Watches the Kubernetes API for Services/Endpoints and tells every Envoy proxy what other services exist and where they are |
| **Configuration distribution** | Translates your `VirtualService`/`DestinationRule` YAML (Kubernetes Custom Resources) into Envoy's native configuration format (`xDS` APIs) and pushes it to every relevant sidecar |
| **Certificate Authority (CA)** | Issues and rotates the TLS certificates every sidecar uses for mutual TLS — see [security-and-mtls.md](security-and-mtls.md) |
| **Sidecar injection** | Runs the mutating webhook described above |

The proxies communicate with `istiod` over the **xDS protocol** (a gRPC-based streaming API — "x" stands in for Listener/Cluster/Route/Endpoint Discovery Service, the different config types Envoy can be told about dynamically). This is what allows configuration changes to propagate to running proxies **without restarting any Pods** — you apply a new `VirtualService`, and within seconds every relevant Envoy proxy updates its routing behavior live.

---

## 5. Data Plane: What Envoy Actually Does Per-Request

For every single request passing through it, an Envoy sidecar can:
1. **Route** it based on `VirtualService` rules (path/header-based routing, traffic splitting — see [traffic-management.md](traffic-management.md)).
2. **Load balance** across the destination service's healthy instances (same concepts as [Load Balancing Algorithms](../Load%20Balancing/load-balancing-algorithms.md), just applied mesh-internally).
3. **Encrypt** it with mTLS if talking to another meshed service (see [security-and-mtls.md](security-and-mtls.md)).
4. **Apply resilience policies**: retries, timeouts, circuit breaking (see [resilience-patterns.md](resilience-patterns.md)).
5. **Emit telemetry**: request count, latency, response codes — automatically, for every single request, without the app doing anything (see [observability-in-service-mesh.md](observability-in-service-mesh.md)).

---

## 6. Sidecar-Based vs "Sidecar-less" (Ambient) Mesh — a Newer Alternative

Recent versions of Istio (and other projects) introduced an alternative called **Ambient Mesh** that removes the per-Pod sidecar requirement, addressing the resource-overhead concern raised in [service-mesh-overview.md](service-mesh-overview.md):

| | Sidecar Mode (traditional) | Ambient Mode (newer) |
|---|---|---|
| Proxy placement | One Envoy sidecar per Pod | A shared per-node proxy (`ztunnel`) handles L4/mTLS; an optional per-namespace `waypoint` proxy handles L7 features |
| Resource overhead | Higher — every Pod carries an extra container | Lower — proxies are shared infrastructure, not per-Pod |
| Onboarding | Requires Pod restart to inject sidecar | Can be added to a namespace without restarting workloads |
| Maturity | Very mature, battle-tested, default for years | Newer, growing adoption, fewer L7 features by default (L7 requires opting into a waypoint proxy) |

This is worth knowing exists, but sidecar mode remains the default and most widely deployed pattern as of now — the rest of this folder's examples use the traditional sidecar model, since that's what you'll encounter in the vast majority of real-world Istio deployments today.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
