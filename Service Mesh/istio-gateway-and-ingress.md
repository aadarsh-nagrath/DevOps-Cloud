# Istio Gateway & Ingress in a Service Mesh

How traffic actually *enters* an Istio mesh from outside the cluster, and how that relates to (and differs from) plain Kubernetes Ingress covered in [Kubernetes Ingress Deep Dive](kubernetes-ingress-deep-dive.md). This is one of the most commonly confused boundaries when learning Istio — this file exists specifically to clear it up.

---

## 1. North-South vs East-West Traffic — the Distinction That Explains Everything Here

| | North-South | East-West |
|---|---|---|
| Direction | External client → cluster | Service → service, inside the cluster |
| Example | A browser hitting `https://shop.example.com` | `checkout-service` calling `payment-service` |
| Covered by | Ingress / Istio Gateway (this file) | Mesh-internal routing — see [Traffic Management](traffic-management.md) |

[Traffic Management](traffic-management.md)'s `VirtualService`/`DestinationRule` examples are almost all **east-west** — traffic already inside the mesh, between sidecars. This file is specifically about the **north-south** boundary: how a request from the public internet gets into the mesh in the first place, at which point the same `VirtualService`/`DestinationRule` machinery takes over.

---

## 2. Istio's Own Gateway Resource — Not Kubernetes Ingress

Istio predates the Kubernetes `Ingress` resource's maturity and has its own, more expressive resource for this: `Gateway`. It is deliberately **not** the same thing as a Kubernetes `Ingress`, even though they solve an overlapping problem.

```yaml
# Gateway: defines the actual listening ports/protocols/TLS at the mesh's edge —
# this is infrastructure config, "what ports are open and how," analogous to nginx's `listen` directive
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: shop-gateway
spec:
  selector:
    istio: ingressgateway        # targets Istio's own pre-deployed ingress gateway Pods (Envoy instances)
  servers:
    - port:
        number: 443
        name: https
        protocol: HTTPS
      tls:
        mode: SIMPLE
        credentialName: shop-tls-cert   # a Kubernetes TLS Secret, same shape as Ingress TLS
      hosts:
        - "shop.example.com"
---
# VirtualService: SAME resource type used for mesh-internal routing in traffic-management.md —
# this is the key unifying idea. It's just now attached to the Gateway instead of implicit mesh-internal routing.
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: shop-route
spec:
  hosts: ["shop.example.com"]
  gateways: ["shop-gateway"]     # <-- this line is what makes it apply to EXTERNAL traffic via the Gateway,
                                   #     rather than mesh-internal traffic (omitting this defaults to internal-only)
  http:
    - match:
        - uri: { prefix: /api }
      route:
        - destination: { host: shop-api, port: { number: 80 } }
    - route:
        - destination: { host: shop-frontend, port: { number: 80 } }
```

**The core mental model to walk away with**: `Gateway` is *only* about what ports/protocols/TLS are exposed at the mesh edge — it does not contain any routing logic itself. All actual routing (host/path matching, weighted splits, retries, fault injection — everything in [Traffic Management](traffic-management.md)) is expressed through the *exact same* `VirtualService` resource used for internal traffic, just with a `gateways` field attached. This is genuinely elegant once it clicks: **you learn one routing API (VirtualService) and it works identically whether the traffic originated outside the cluster or from another internal service** — plain Kubernetes Ingress has no equivalent unification; its routing rules are a completely separate, more limited spec from anything mesh-internal.

---

## 3. The Istio Ingress Gateway — Just Another Envoy, Deployed Differently

The `istio-ingressgateway` referenced by `selector: istio: ingressgateway` above isn't special magic — it's a **regular Envoy proxy**, the same proxy technology used as every service's sidecar (see [Service Mesh Architecture & Sidecar Pattern](service-mesh-architecture-and-sidecar-pattern.md)), just deployed as its own standalone Deployment at the edge of the mesh instead of injected alongside application containers.

```bash
kubectl get pods -n istio-system -l istio=ingressgateway
kubectl get svc -n istio-system istio-ingressgateway   # this Service is usually type: LoadBalancer,
                                                          # provisioning a real cloud LB — see cloud-load-balancers.md
```
```
NAME                     TYPE           EXTERNAL-IP     PORT(S)
istio-ingressgateway     LoadBalancer   34.123.45.6      15021:.../TCP,80:.../TCP,443:.../TCP
```
This means the full traffic path for external requests looks like:
```
Internet
   |
   v
[Cloud Load Balancer]                      <- provisioned by the istio-ingressgateway Service (type: LoadBalancer)
   |
   v
[istio-ingressgateway Pods (Envoy)]        <- reads Gateway + VirtualService resources, terminates TLS, routes
   |
   v
[Sidecar Envoy on the destination Pod]     <- receives the now-in-mesh request, can apply mTLS, more routing
   |
   v
[Application container]
```
Compare this to the general layered diagram in [Kubernetes Load Balancing §6](../Load%20Balancing/kubernetes-load-balancing.md#6-the-full-picture-all-layers-together) — the Istio ingress gateway occupies the same conceptual slot an Ingress Controller (ingress-nginx, etc.) would, it's simply Envoy-powered and configured via `Gateway`/`VirtualService` instead of `Ingress`/annotations.

---

## 4. Can You Use Plain Kubernetes Ingress *With* Istio?

Yes — Istio can also watch and implement plain `Ingress` resources (a compatibility mode), but this is generally discouraged for anything beyond the simplest cases, because you lose access to the richer `Gateway`/`VirtualService` feature set (weighted splits, fault injection, mirroring, retries — all the features detailed in [Traffic Management](traffic-management.md)) for that traffic. If you're running Istio, using its native `Gateway` + `VirtualService` for ingress is the standard, recommended approach — reserve plain `Ingress` for clusters *without* a mesh, or for a genuinely simple passthrough case where you don't need any mesh-level routing sophistication at the edge.

---

## 5. Istio and the Gateway API

Istio has increasingly adopted the [Gateway API](kubernetes-ingress-deep-dive.md#7-the-gateway-api--ingresss-modern-successor) as an alternative, more standardized configuration surface — recent Istio versions support configuring the exact same ingress gateway behavior using `Gateway`/`HTTPRoute` (the Kubernetes-standard Gateway API resources) instead of Istio's own `Gateway`/`VirtualService` CRDs.

```yaml
# The Gateway API equivalent of the Istio-native example in §2
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: shop-gateway
spec:
  gatewayClassName: istio
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        certificateRefs:
          - name: shop-tls-cert
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: shop-route
spec:
  parentRefs:
    - name: shop-gateway
  hostnames: ["shop.example.com"]
  rules:
    - matches:
        - path: { type: PathPrefix, value: /api }
      backendRefs:
        - name: shop-api
          port: 80
    - backendRefs:
        - name: shop-frontend
          port: 80
```
Both configuration styles (Istio-native CRDs, and Gateway API) ultimately configure the same underlying Envoy ingress gateway — which one you pick is mostly a question of whether you want vendor-neutral, Kubernetes-standard config (Gateway API — portable if you ever migrate mesh implementations) or Istio's full native feature surface (some advanced Istio-specific features may lag behind or exceed what Gateway API currently standardizes).

---

## 6. Ingress-nginx vs Istio Gateway — When You'd Choose Which

| | Ingress-nginx (or similar controller) | Istio Gateway |
|---|---|---|
| Requires a full service mesh installed? | No | Yes — meaningless without Istio already running |
| Routing capability | Host/path routing + controller-specific annotations | Full `VirtualService` feature set: weighted splits, header matching, retries, fault injection, mirroring — natively |
| mTLS to backend Pods | Not inherent — would need to be separately configured | Automatic, if the destination Pods have sidecars — see [Security & mTLS](security-and-mtls.md) |
| Operational overhead | Lower — one focused component | Higher — you're running (and must understand) an entire mesh |
| Right choice when | You don't need/want a service mesh, just need external routing into the cluster | You already have Istio for east-west traffic management, and want the SAME routing primitives (VirtualService) to also handle north-south, rather than maintaining two separate routing configuration systems |

**Practical guidance**: don't adopt Istio *just* to replace an Ingress Controller — that's a lot of operational complexity (see the honest adoption trade-offs in [Service Mesh Overview](service-mesh-overview.md)) for a problem plain Ingress already solves well. Istio's Gateway becomes the natural, low-friction choice specifically once you're *already* running Istio for its east-west traffic management, security, and observability benefits — at that point, using the same `VirtualService` model for ingress too (instead of a second, separate Ingress Controller with its own annotation-based config) is a net simplification, not an added complexity.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
