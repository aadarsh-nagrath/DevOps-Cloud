# Kubernetes Ingress — Deep Dive

Ingress is how external (north-south) HTTP/HTTPS traffic gets into a Kubernetes cluster and reaches the right internal Service, based on hostname and URL path. This file goes beyond the basic [Ingress Example](../Kubernetes/examples/ingress-eg.md) to cover the full resource spec, controllers, TLS, and production patterns. See [Kubernetes Load Balancing](../Load%20Balancing/kubernetes-load-balancing.md) for how Ingress fits alongside Services and kube-proxy in the full traffic-flow picture.

---

## 1. The Problem Ingress Solves

A `LoadBalancer`-type Service gives you one cloud load balancer per Service — fine for one app, expensive and unwieldy for dozens of microservices each needing their own public endpoint (see the cost note in [Kubernetes Load Balancing §2](../Load%20Balancing/kubernetes-load-balancing.md#2-service-types)). Ingress solves this by letting **one** entry point (one load balancer, one public IP) fan out to many internal Services based on L7 rules — the same host/path-based routing concept covered generally in [L4 vs L7 Load Balancing](../Load%20Balancing/l4-vs-l7-load-balancing.md), specifically for Kubernetes.

```
Internet
   |
   v
[1 Cloud Load Balancer / public IP]
   |
   v
[Ingress Controller Pods]  <- reads Ingress resources, implements the routing rules
   |
   +--> host: shop.example.com          -> Service: shop-frontend
   +--> host: api.example.com, /v1/*    -> Service: api-v1
   +--> host: api.example.com, /v2/*    -> Service: api-v2
   +--> host: admin.example.com          -> Service: admin-panel
```

**Ingress is just a declarative spec (a set of routing rules) — it does nothing on its own.** You must separately deploy an **Ingress Controller** (real running Pods, e.g. ingress-nginx, that watch Ingress resources and actually implement the routing) or the rules simply sit inert in the API server. This trips up nearly everyone the first time: `kubectl apply -f my-ingress.yaml` succeeds with no error even if zero controllers exist to act on it.

---

## 2. The Full Ingress Resource Spec

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2   # controller-specific behavior — see §5
spec:
  ingressClassName: nginx        # WHICH controller should handle this Ingress (see §3)
  tls:                            # TLS termination — see §4
    - hosts: ["shop.example.com"]
      secretName: shop-tls-cert
  rules:
    - host: shop.example.com      # host-based routing
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: shop-frontend
                port: { number: 80 }
    - host: api.example.com
      http:
        paths:
          - path: /v1(/|$)(.*)     # path-based routing, with regex capture groups (nginx-specific)
            pathType: ImplementationSpecific
            backend:
              service:
                name: api-v1
                port: { number: 80 }
          - path: /v2(/|$)(.*)
            pathType: ImplementationSpecific
            backend:
              service:
                name: api-v2
                port: { number: 80 }
```

### `pathType` — a subtlety worth knowing precisely
| Value | Behavior |
|---|---|
| `Exact` | Matches the URL path exactly, case-sensitive |
| `Prefix` | Matches based on a `/`-separated path prefix — `/foo` matches `/foo`, `/foo/`, `/foo/bar`, but NOT `/foobar` |
| `ImplementationSpecific` | Matching behavior is entirely up to the Ingress Controller (e.g., ingress-nginx allows regex here) — **not portable across controllers**, avoid unless you specifically need controller-specific regex features |

### `defaultBackend` — catch-all for unmatched requests
```yaml
spec:
  defaultBackend:
    service:
      name: fallback-404-page
      port: { number: 80 }
  rules:
    # ... specific rules above take priority; anything that matches nothing falls through to here
```

---

## 3. IngressClass — Supporting Multiple Controllers in One Cluster

A cluster can run more than one Ingress Controller simultaneously (e.g., ingress-nginx for public traffic, a separate internal-only controller for private services). `IngressClass` is how an Ingress resource declares which controller should handle it.

```yaml
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: nginx
  annotations:
    ingressclass.kubernetes.io/is-default-class: "true"   # used when an Ingress omits ingressClassName
spec:
  controller: k8s.io/ingress-nginx
```
```yaml
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: nginx-internal
spec:
  controller: k8s.io/ingress-nginx
```
```yaml
# This Ingress explicitly targets the internal-only controller instance
spec:
  ingressClassName: nginx-internal
```
This is the modern replacement for the older `kubernetes.io/ingress.class` annotation — always prefer `ingressClassName` in new manifests.

---

## 4. TLS Termination

```yaml
spec:
  tls:
    - hosts:
        - shop.example.com
        - api.example.com
      secretName: multi-domain-tls-cert   # a standard `kubernetes.io/tls` Secret, containing tls.crt + tls.key
```
```bash
# Creating the TLS secret manually from existing cert files
kubectl create secret tls shop-tls-cert --cert=shop.crt --key=shop.key
```

### The production-standard pattern: cert-manager + Let's Encrypt
Manually managing and rotating certificates doesn't scale. **cert-manager** is the near-universal solution — it watches Ingress resources (or a dedicated `Certificate` resource) and automatically requests, renews, and stores TLS certificates from an ACME provider like Let's Encrypt.
```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx
---
# Ingress just needs one annotation to trigger automatic cert issuance
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts: ["shop.example.com"]
      secretName: shop-tls-cert   # cert-manager creates and keeps this Secret updated automatically
  rules:
    - host: shop.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service: { name: shop-frontend, port: { number: 80 } }
```

---

## 5. Controller-Specific Annotations — the Escape Hatch (and its cost)

The core `Ingress` spec (host/path/TLS) is intentionally minimal and portable across controllers. Anything beyond that — rate limiting, URL rewriting, custom headers, auth, canary routing — is implemented via **annotations**, which are entirely controller-specific and not portable.

```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/limit-rps: "50"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    nginx.ingress.kubernetes.io/auth-type: basic
    nginx.ingress.kubernetes.io/auth-secret: basic-auth-secret
    nginx.ingress.kubernetes.io/canary: "true"                # ingress-nginx's own basic canary support
    nginx.ingress.kubernetes.io/canary-weight: "10"
```
**Trade-off to understand clearly**: this annotation-based extensibility is exactly what plain Ingress lacks and full-featured L7 tooling (a service mesh's `VirtualService`, or a dedicated API Gateway) provides as first-class, structured configuration instead of stringly-typed annotations. Ingress-nginx's `canary-weight` annotation, for instance, does the same *concept* as Istio's `VirtualService` weighted routing in [Traffic Management](traffic-management.md#2-traffic-splitting-weighted-routing) — but as a bolted-on feature via annotation, not a native, composable API. This is one of the real reasons teams adopt a service mesh or a dedicated Gateway API implementation once their routing needs grow past what annotations comfortably express — see §7.

---

## 6. Popular Ingress Controllers (recap and expansion)

| Controller | Underlying proxy | Distinguishing strengths |
|---|---|---|
| **ingress-nginx** | NGINX | Most widely deployed, huge annotation ecosystem, extensive community docs |
| **Contour** | Envoy | Cleaner CRD-based config (`HTTPProxy`) instead of annotations, good if you want Envoy without a full mesh |
| **AWS Load Balancer Controller** | Native AWS ALB | Provisions a *real* ALB directly (see [Cloud Load Balancers](../Load%20Balancing/cloud-load-balancers.md)) rather than running proxy Pods in-cluster |
| **Traefik** | Traefik | Automatic service discovery, clean dashboard, popular in Docker/Kubernetes hybrid shops |
| **Istio Gateway** | Envoy | Only relevant if you're already running Istio — see [Istio Gateway & Ingress in a Service Mesh](istio-gateway-and-ingress.md) for why this is a genuinely different model, not just another controller |
| **Kong Ingress Controller** | Kong (built on NGINX/OpenResty) | Adds full API Gateway features (auth plugins, rate limiting, transformations) as native CRDs instead of annotations |

```bash
# Installing ingress-nginx via Helm — the standard install path
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace
```

---

## 7. The Gateway API — Ingress's Modern Successor

`networking.k8s.io/v1` Ingress has known, fundamental limitations: no native support for multiple protocols beyond HTTP(S), no first-class traffic splitting/weighting, no clean way to express which team/namespace owns which routing rules, and heavy reliance on non-portable annotations (§5). The **Gateway API** (a separate, newer Kubernetes API group, `gateway.networking.k8s.io`) was built to replace it long-term, with a deliberately more expressive and portable design.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: shop-gateway
spec:
  gatewayClassName: nginx
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
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - name: shop-frontend
          port: 80
    - matches:
        - path: { type: PathPrefix, value: /api }
      backendRefs:
        - name: shop-api
          port: 80
          weight: 90               # native, portable weighted routing — no annotation needed
        - name: shop-api-canary
          port: 80
          weight: 10
```
Key improvements over plain Ingress:
- **Role-oriented design**: `GatewayClass`/`Gateway` are typically managed by platform/infra teams, while `HTTPRoute` (and `TCPRoute`, `GRPCRoute`, etc.) can be delegated to individual application teams within their own namespaces — a much cleaner permission boundary than one big Ingress-per-team.
- **Native weighted routing, header matching, and traffic splitting** — no more controller-specific annotations for what should be standard behavior.
- **Multi-protocol** — TCP, UDP, gRPC, TLS routes are first-class alongside HTTP, not bolted on.
- Both Istio and most Ingress controllers now support the Gateway API as an alternative (and eventual replacement) configuration surface — see [Istio Gateway & Ingress in a Service Mesh](istio-gateway-and-ingress.md) for how Istio specifically relates to this.

**Practical guidance**: Ingress (`networking.k8s.io/v1`) is still extremely common and perfectly fine for straightforward host/path routing today — it's not deprecated or going away imminently. Reach for the Gateway API on new projects where you specifically need native traffic splitting/weighting, multi-team namespace delegation, or non-HTTP protocol routing without vendor-specific annotations.

---

## 8. Common Production Gotchas

- **No Ingress Controller installed**: applying an `Ingress` resource with no matching controller running is a silent no-op — always verify a controller is actually deployed and watching the right `IngressClass` (`kubectl get pods -n ingress-nginx` or equivalent).
- **`ImplementationSpecific` regex isn't portable**: an Ingress using ingress-nginx-specific regex capture groups will silently misbehave (or fail entirely) if you ever switch controllers — a good reason to keep routing rules simple where possible, or migrate to Gateway API for complex needs.
- **Path prefix matching surprises**: `Prefix` matching `/foo` does **not** match `/foobar` (there's an implicit path-segment boundary) — a very common source of "why isn't this route matching" confusion, always double check with the exact `pathType` semantics table in §2.
- **TLS secret must be in the same namespace as the Ingress** — a very common early mistake, especially when the app and its cert were created in different namespaces.
- **Default backend surprises**: forgetting a `defaultBackend` means unmatched requests get the Ingress Controller's own default (often a generic 404), which can be confusing to debug if you expected a specific fallback service.
- **Body size / timeout limits are controller-specific defaults**, not part of the portable Ingress spec — large file uploads or slow endpoints often fail silently against a controller's default `proxy-body-size`/timeout until explicitly overridden via annotation.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
