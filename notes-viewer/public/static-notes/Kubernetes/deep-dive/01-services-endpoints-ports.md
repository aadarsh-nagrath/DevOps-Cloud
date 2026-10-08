# Services, Endpoints, Pod IPs & Ports — In Depth

> Companion to [k8s-learning-path §4 & §30](../k8s-learning-path.md), [Networking.md](../Networking.md) and the [Ingress deep dive](../../Service%20Mesh/kubernetes-ingress-deep-dive.md). This file answers: *"when a request arrives, which IP and which port does it actually hit at each hop?"*

---

## 1. The full request path (memorise this)

```
Client
  │  https://api.example.com/v1/users
  ▼
Cloud LB / Node IP            (public IP; created by the Ingress controller's Service of type LoadBalancer)
  ▼
Ingress Controller Pod        (nginx/traefik/envoy; terminates TLS, matches host + path)
  │  looks up Ingress rule → backend.service.name: api, port.number: 80
  ▼
Service "api"  (ClusterIP 10.96.12.7 : port 80)       ← virtual IP, no process listens on it
  │  kube-proxy (iptables/IPVS/nftables) or eBPF CNI rewrites destination
  ▼
EndpointSlice "api-xxxxx"     (list of ready  PodIP:targetPort  pairs)
  │  picks one, e.g. 10.244.1.15:8080
  ▼
Pod IP 10.244.1.15  →  container listening on containerPort 8080
```

Key idea: **a Service is not a process.** It is (a) a stable virtual IP + DNS name, and (b) a selector. Controllers turn the selector into a list of real pod IPs; node-level rules turn "connect to ClusterIP" into "connect to one of those pod IPs".

Most ingress controllers (ingress-nginx, Traefik, Contour) **skip the Service's ClusterIP** and route straight to the pod IPs from the endpoints list (so they can do their own load balancing, keep-alive, sticky sessions). The Service is still needed — it's what the Ingress references and what populates the endpoints.

---

## 2. Pod IP

- Every pod gets **one IP** (per IP family) from the node's pod CIDR, assigned by the **CNI plugin** (Calico, Cilium, Flannel, AWS VPC CNI…).
- All containers in a pod **share** that IP and network namespace → they talk over `localhost`, and must not clash on ports.
- **Flat network model** (Kubernetes requirement): every pod can reach every other pod's IP directly, without NAT, across nodes.
- Pod IPs are **ephemeral**. Pod recreated (rollout, crash that recreates the pod, node drain) ⇒ **new IP**. That's the whole reason Services exist. (A container restart *inside* the same pod keeps the IP.)
- See it: `kubectl get pod -o wide`, or `kubectl get pod <p> -o jsonpath='{.status.podIP}'`.
- `hostNetwork: true` makes the pod use the node's IP/network namespace instead — used by CNI/monitoring agents; the pod then can clash with node ports.

---

## 3. The four "port" fields — what each really means

| Field | Where | Meaning |
|---|---|---|
| `containerPort` | Pod spec → `containers[].ports[]` | Port the **app inside the container** listens on. Mostly **documentation** — it does *not* open or restrict anything (the container is reachable on any port it listens on). Its real use: giving the port a **name** and letting tools read it. |
| `targetPort` | Service spec → `ports[]` | Port on the **pod** that traffic is forwarded **to**. Number, or the **name** of a `containerPort`. Defaults to `port` if omitted. |
| `port` | Service spec → `ports[]` | Port the **Service itself** exposes on its ClusterIP (and DNS name). What *clients* use. |
| `nodePort` | Service spec → `ports[]` (type NodePort/LoadBalancer) | Port opened on **every node's IP** (default range **30000–32767**). Traffic to `NodeIP:nodePort` is forwarded to the Service. |

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  type: NodePort
  selector:
    app: api            # ← matches pod LABELS (not names)
  ports:
    - name: http        # required when there is more than one port
      protocol: TCP     # TCP (default) | UDP | SCTP
      port: 80          # clients call  api:80  (ClusterIP:80)
      targetPort: 8080  # forwarded to  PodIP:8080
      nodePort: 30080   # also reachable at  <any-node-ip>:30080  (omit to auto-assign)
```

Chain for NodePort: `NodeIP:30080 → ClusterIP:80 → PodIP:8080`. Each type **builds on the previous one** — a LoadBalancer Service also gets a NodePort and a ClusterIP.

### Named ports (the pattern that avoids mistakes)

```yaml
# Pod
ports:
  - name: http
    containerPort: 8080
# Service
ports:
  - port: 80
    targetPort: http     # resolved per-pod → pods may use different numbers during a migration
```

### Classic mistakes
- `targetPort` ≠ the port the app really listens on → connection refused / `502` from ingress, but pods look `Running`.
- App binds to `127.0.0.1` instead of `0.0.0.0` → works via `kubectl exec`, not via Service.
- Ingress `backend.service.port.number` must match the Service's **`port`** (or use `port.name`), **not** the targetPort.
- `port: 443` on the Service and `targetPort: 8080` is fine — the Service can translate ports.

---

## 4. Endpoints & EndpointSlices

**What they are:** the live list of `PodIP:port` pairs behind a Service.

- Service has a **selector** → the **EndpointSlice controller** watches pods matching the labels and writes `EndpointSlice` objects (label `kubernetes.io/service-name: <svc>`).
- Only **Ready** pods are listed as `ready: true`. Readiness probe fails → pod stays out of rotation (not restarted). This is how zero-downtime rollouts work.
- Pods being terminated get `terminating: true` and are dropped from new traffic.
- **Endpoints** (v1 core) is the legacy object — a single object per Service, capped at 1000 addresses, rewritten wholesale on any change. **EndpointSlice** (discovery.k8s.io/v1) shards ~100 endpoints per slice; kube-proxy uses slices. `kubectl get endpoints` still works but is deprecated since v1.33.

```bash
kubectl get svc api -o wide
kubectl get endpointslices -l kubernetes.io/service-name=api
kubectl get endpoints api                       # legacy, quick glance
kubectl describe svc api                        # shows Endpoints: 10.244.1.15:8080,10.244.2.9:8080
```

```
Endpoints:  <none>        ← the #1 cause of 503/502 from Ingress
```
**If endpoints are empty:** (1) selector doesn't match pod labels, (2) pods not Ready (readiness failing), (3) pods in a different namespace than the Service, (4) no pods at all.

### Services without a selector
No automatic endpoints → you create the EndpointSlice yourself. Use for pointing at an external DB/IP, or a service in another cluster:
```yaml
apiVersion: v1
kind: Service
metadata: { name: legacy-db }
spec:
  ports: [{ port: 5432 }]
---
apiVersion: discovery.k8s.io/v1
kind: EndpointSlice
metadata:
  name: legacy-db-1
  labels: { kubernetes.io/service-name: legacy-db }
addressType: IPv4
ports: [{ port: 5432 }]
endpoints: [{ addresses: ["192.168.10.5"] }]
```

---

## 5. Service types — recap with what really happens

| Type | What's created | Reachable from |
|---|---|---|
| **ClusterIP** | Virtual IP from the service CIDR + DNS A record | inside the cluster only |
| **NodePort** | ClusterIP + a port on every node | anything that can reach node IPs |
| **LoadBalancer** | NodePort + cloud LB (via cloud-controller-manager) pointing at node ports (or pod IPs with some CNIs) | internet / VPC |
| **ExternalName** | DNS `CNAME` only; no IP, no proxy | inside the cluster |
| **Headless** (`clusterIP: None`) | no VIP; DNS returns pod IPs directly | inside the cluster |

### Headless
DNS for `db-headless` returns **A records for every ready pod**; with a StatefulSet each pod also gets `db-0.db-headless.<ns>.svc.cluster.local`. Needed when clients must reach a specific replica (databases, Kafka, etcd) or do client-side load balancing (gRPC).

---

## 6. How the virtual IP actually works (kube-proxy)

- `kube-proxy` runs on every node, watches Services + EndpointSlices, and programs the kernel:
  - **iptables mode** (default): chains of DNAT rules with random probabilities; O(n) rule matching; no health-checking of backends.
  - **IPVS mode**: kernel L4 load balancer, hash tables, more algorithms (rr, lc, sh…), scales better.
  - **nftables mode**: newer replacement for iptables (GA in 1.33).
  - **eBPF (Cilium)**: can replace kube-proxy entirely.
- Result: a packet to `ClusterIP:port` is **DNAT-ed** to `PodIP:targetPort` on the sending node. That's why you can't `ping` a ClusterIP (ICMP isn't a port) and why no process owns that IP.
- `externalTrafficPolicy: Local` keeps the client source IP and avoids a second hop; nodes with no local pod fail the LB health check. `internalTrafficPolicy: Local` does the same for in-cluster traffic.
- `sessionAffinity: ClientIP` pins a client to one pod (timeout default 10800s).

---

## 7. DNS for Services

CoreDNS gives every Service: `<svc>.<ns>.svc.cluster.local`.
- Same namespace: `curl api` works. Other namespace: `curl api.prod` (or the longer form).
- Pod's `/etc/resolv.conf` has `search <ns>.svc.cluster.local svc.cluster.local cluster.local` and `options ndots:5` → any name with fewer than 5 dots is tried against the search list first. External names like `api.example.com` (2 dots) cause **several wasted lookups** → add a trailing dot (`api.example.com.`) or lower `ndots` via `dnsConfig` for chatty external clients.
- SRV records exist for named ports: `_http._tcp.api.default.svc.cluster.local`.
- Env vars `API_SERVICE_HOST` / `API_SERVICE_PORT` are injected only for Services that existed **before** the pod started — prefer DNS.

---

## 8. Debugging "can't reach my app" — in this order

```bash
kubectl get pods -l app=api -o wide                 # 1. pods exist, Running, READY 1/1? note IPs
kubectl get svc api -o yaml | grep -A3 selector      # 2. selector…
kubectl get pods --show-labels                       #    …matches labels exactly?
kubectl get endpointslices -l kubernetes.io/service-name=api   # 3. endpoints populated?
kubectl run t --rm -it --image=curlimages/curl -- sh
  curl -v http://<podIP>:8080/                       # 4. pod directly (app + targetPort OK?)
  curl -v http://api.<ns>.svc:80/                    # 5. via Service DNS (kube-proxy/DNS OK?)
kubectl get ingress,describe ingress api             # 6. ingress backend + "default backend" errors
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller   # 7. controller errors (502/503/504)
```
- `connection refused` on podIP → app not listening on that port/interface.
- Works on podIP, fails on Service → selector/targetPort/endpoint problem.
- Works in-cluster, fails externally → Ingress/LB/NetworkPolicy/security group.
- `502` = controller reached upstream but got a bad reply; `503` = no healthy endpoints; `504` = upstream timeout.

---

## 9. Quick Q&A
- **Is `containerPort` required?** No. Service `targetPort` works with any listening port. It's just metadata (and enables named ports).
- **Can one Service expose multiple ports?** Yes — each must have a unique `name`.
- **Can a Service select pods in another namespace?** No. Use ExternalName or a selector-less Service + EndpointSlice.
- **Why does the Service IP not change but pod IPs do?** The ClusterIP is allocated once by the API server for the Service's life; endpoints are re-computed continuously.
- **Does a Service load-balance?** L4 only (connection-level, random/round-robin). Long-lived HTTP/2 or gRPC connections stick to one pod → use headless + client-side LB, or an L7 proxy/mesh.
