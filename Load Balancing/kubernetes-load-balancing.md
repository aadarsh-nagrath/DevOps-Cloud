# Load Balancing in Kubernetes

Kubernetes has load balancing happening at multiple distinct layers, and conflating them is a common source of confusion. This file walks through each layer: Services, kube-proxy, Ingress, and service mesh load balancing. Assumes familiarity with basic Pod concepts — see [K-pods.md](../Kubernetes/K-pods.md) if you haven't reviewed pod behavior yet.

---

## 1. The Problem Services Solve

Pods are ephemeral — they get created, destroyed, and rescheduled with new IPs constantly (see the production simulation in [K-pods.md](../Kubernetes/K-pods.md#production-simulation-how-pods-actually-behave-in-the-real-world)). You cannot point a client at a Pod's IP directly and expect it to keep working. A **Service** provides a stable virtual IP and DNS name that load balances across whichever Pods currently match its label selector — regardless of how many times those Pods get replaced underneath it.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: webapp
spec:
  selector:
    app: webapp          # routes to any Pod with this label, however many there are, whichever ones are Ready
  ports:
    - port: 80
      targetPort: 8080
```

---

## 2. Service Types

### ClusterIP (default) — internal load balancing only
```yaml
apiVersion: v1
kind: Service
metadata:
  name: internal-api
spec:
  type: ClusterIP        # default if `type` is omitted
  selector:
    app: internal-api
  ports:
    - port: 80
      targetPort: 8080
```
Gets a stable internal-only IP, reachable from inside the cluster (other Pods, other Services) but not from outside. This is the right choice for the vast majority of service-to-service traffic inside a cluster — most services should never be directly internet-reachable in the first place.

### NodePort — expose on every node's IP
```yaml
apiVersion: v1
kind: Service
metadata:
  name: webapp-nodeport
spec:
  type: NodePort
  selector:
    app: webapp
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080     # accessible at <any-node-ip>:30080 from outside the cluster
```
Opens a specific port (30000-32767 range) on *every* node in the cluster; traffic to that port on any node gets forwarded to a matching Pod (which might live on a different node — kube-proxy handles that redirection). Rarely used directly in production as the final exposure mechanism — usually it's what a `LoadBalancer` type or an Ingress controller sits in front of under the hood.

### LoadBalancer — provision a cloud load balancer automatically
```yaml
apiVersion: v1
kind: Service
metadata:
  name: webapp-lb
spec:
  type: LoadBalancer
  selector:
    app: webapp
  ports:
    - port: 80
      targetPort: 8080
```
When applied on a cloud-managed cluster (EKS, AKS, GKE), this triggers the cloud provider's controller to actually provision a real external load balancer (an AWS NLB/ALB, Azure Load Balancer, GCP Load Balancer — see [cloud-load-balancers.md](cloud-load-balancers.md)) and wire it to point at this Service. On bare-metal/self-hosted clusters, this type does nothing useful without an add-on like MetalLB to implement it.
```bash
kubectl get svc webapp-lb
# NAME        TYPE           CLUSTER-IP     EXTERNAL-IP      PORT(S)
# webapp-lb   LoadBalancer   10.96.10.20    34.123.45.6      80:31234/TCP
#                                            ^ the real cloud LB's public IP, provisioned automatically
```
Cost note: every `LoadBalancer`-type Service typically provisions a **separate** cloud load balancer, which has real cost implications at scale (dozens of services = dozens of cloud LBs). This is one of the main reasons Ingress exists (see below) — to share a single load balancer across many services.

### ExternalName — DNS alias, not really load balancing
```yaml
apiVersion: v1
kind: Service
metadata:
  name: external-db
spec:
  type: ExternalName
  externalName: mydb.example-rds-instance.us-east-1.rds.amazonaws.com
```
Just a DNS CNAME — no actual proxying or load balancing happens. Useful for giving an external dependency (a managed database, a legacy system) a clean in-cluster DNS name.

---

## 3. How Service Load Balancing Actually Works: kube-proxy

`kube-proxy` runs on every node and is what actually implements the Service abstraction at the networking level — this is the piece doing the real load balancing work when a Pod talks to a Service's ClusterIP.

Two implementation modes:
- **iptables mode** (older default): kube-proxy writes iptables rules that randomly select a backend Pod for each new connection. Simple, works everywhere, but rule evaluation is roughly O(n) with the number of Services/Pods — can become a bottleneck at very large scale.
- **IPVS mode** (newer, recommended at scale): uses the Linux kernel's IPVS (IP Virtual Server) subsystem, purpose-built for load balancing, with real algorithm choices (round robin, least connections, and others — same concepts as [load-balancing-algorithms.md](load-balancing-algorithms.md)) and better performance at high Service/Pod counts.

```bash
# Check which mode kube-proxy is running in
kubectl get configmap kube-proxy -n kube-system -o yaml | grep mode
```

Neither mode is "smart" the way an L7 load balancer is — kube-proxy operates at L4, has no concept of HTTP paths or headers, and (critically) has **no application-level health awareness beyond whether a Pod is marked `Ready`** (see the Readiness vs Liveness discussion in [K-pods.md](../Kubernetes/K-pods.md)). It only ever routes to Pods currently in the `Ready` state for that Service's selector — this is the exact mechanism that makes rolling updates and self-healing work correctly without external load balancer reconfiguration.

---

## 4. Ingress: Sharing One Load Balancer Across Many Services

An Ingress is a set of L7 routing rules (host/path-based, same concept as [l4-vs-l7-load-balancing.md](l4-vs-l7-load-balancing.md)) that an **Ingress Controller** (a separately deployed piece of software — NGINX Ingress Controller, Envoy-based Contour, cloud-native controllers like AWS Load Balancer Controller) reads and implements.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: main-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-service
                port: { number: 80 }
    - host: www.example.com
      http:
        paths:
          - path: /static
            pathType: Prefix
            backend:
              service:
                name: static-service
                port: { number: 80 }
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-service
                port: { number: 80 }
```
One Ingress Controller (usually backed by exactly one `LoadBalancer`-type Service, hence one real cloud load balancer) can route to dozens of internal `ClusterIP` Services based on host/path — this is the standard way to avoid provisioning a separate expensive cloud load balancer per microservice.

```
Internet -> [1 Cloud Load Balancer] -> [Ingress Controller Pods] -> routes by host/path -> [ClusterIP Service A]
                                                                                          -> [ClusterIP Service B]
                                                                                          -> [ClusterIP Service C]
```

### Popular Ingress Controllers
| Controller | Underlying proxy | Notes |
|---|---|---|
| ingress-nginx | NGINX | The most widely deployed, well-documented default choice |
| Contour | Envoy | Good choice if you want Envoy's traffic management features without a full service mesh |
| AWS Load Balancer Controller | Native AWS ALB | Provisions and configures a real ALB directly from Ingress resources |
| Traefik | Traefik (its own proxy) | Popular for its automatic service discovery and clean dashboard |
| Istio Gateway | Envoy | If you're already running Istio as a service mesh, its Gateway resource can replace a separate Ingress controller |

---

## 5. Service Mesh Load Balancing (the internal layer)

Everything above handles load balancing traffic *into* the cluster or between a client and one Service. A **service mesh** (Istio, Linkerd) adds load balancing *between* internal services, at a much finer grain than kube-proxy provides — via a sidecar proxy (usually Envoy) injected into every Pod.

Why this matters beyond what kube-proxy already does:
- **L7-aware internal load balancing**: retries, timeouts, circuit breaking per-service — kube-proxy has none of this, it's purely L4 round-robin-ish.
- **Fine-grained traffic splitting** for canary/blue-green *between internal services*, not just at the cluster's edge — see [Canary Deployment](../Deployment/Canary%20Deployment/canary-deployment.md) for the Istio `VirtualService` weight-based example.
- **mTLS between services** as a byproduct of the sidecar architecture (each sidecar proxy handles the encryption transparently).
- **Rich per-service observability** (latency, error rate, request volume between every pair of services) without instrumenting application code.

```yaml
# Istio DestinationRule — configuring load balancing policy for traffic to a specific service, mesh-internal
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: recommendation-service
spec:
  host: recommendation-service
  trafficPolicy:
    loadBalancer:
      simple: LEAST_REQUEST   # Envoy-level load balancing algorithm, applied to mesh-internal calls
    connectionPool:
      tcp:
        maxConnections: 100
    outlierDetection:          # automatically eject a misbehaving instance from the pool temporarily
      consecutive5xxErrors: 5
      interval: 30s
      baseEjectionTime: 30s
```

---

## 6. The Full Picture: All Layers Together

```
Internet
   |
   v
[Cloud Load Balancer]  <- provisioned by a Kubernetes `LoadBalancer`-type Service, fronting the Ingress Controller
   |
   v
[Ingress Controller Pods]  <- L7 routing by host/path (NGINX/Envoy-based)
   |
   v
[ClusterIP Service A]  <- kube-proxy: L4 load balancing across matching, Ready Pods
   |
   v
[Pod, with a sidecar proxy if a service mesh is installed]
   |
   v (mesh-internal call to another service)
[Sidecar proxy applies mesh-level LB policy: retries, circuit breaking, weighted routing]
   |
   v
[ClusterIP Service B] -> kube-proxy -> [Pod]
```
Each layer solves a different problem: the cloud LB gets traffic into the cluster at all; the Ingress Controller does smart host/path routing at the edge; kube-proxy does basic L4 balancing to reach any given Service; the service mesh (if present) adds sophisticated L7 traffic management for calls *between* internal services. None of these layers are redundant with each other — they compose.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
