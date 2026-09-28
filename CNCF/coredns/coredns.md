# CoreDNS — Complete Notes

## 1. Beginner

### What is CoreDNS?
- A flexible, **plugin-based DNS server** written in Go, CNCF **graduated** project.
- The **default DNS server for Kubernetes** since v1.13 (2018), replacing `kube-dns`. Every service name lookup inside a cluster (`my-svc.my-namespace.svc.cluster.local`) resolves through CoreDNS.
- Also usable completely standalone, outside Kubernetes, as a general-purpose authoritative/forwarding DNS server — its plugin architecture makes it useful well beyond cluster DNS.

### The Core Problem It Solves
Before CoreDNS, `kube-dns` used a rigid multi-container architecture (`kubedns` + `dnsmasq` + `sidecar`) that was hard to extend or debug. CoreDNS replaced it with a single Go binary whose entire behavior is defined by a **chain of composable plugins** — want caching, add the `cache` plugin; want logging, add `log`; want a custom rewrite rule, add `rewrite`. No forking, no sidecar containers, one config file.

```
kube-dns (legacy):                         CoreDNS:
  kubedns container                          single binary
  + dnsmasq container (caching)              + Corefile defines a plugin chain
  + sidecar container (health/metrics)        (kubernetes, cache, forward, health,
  = 3 containers per pod, harder to extend      metrics, log, ... all in-process)
```

### Core Architecture — The Plugin Chain
This is the single most important concept in CoreDNS. A **Corefile** defines one or more DNS **zones**, and for each zone, an ordered chain of plugins. Every incoming query passes down the chain; each plugin can inspect it, answer it, rewrite it, or pass it to the next plugin.

```
DNS Query
   |
   v
[errors]  -- logs errors, passes through
   |
   v
[health]  -- exposes /health endpoint, passes through (doesn't touch queries)
   |
   v
[kubernetes]  -- if query matches cluster.local, answer from Service/Endpoints watch
   |                   |
   |                (if matched: return answer, chain stops here)
   v (if not matched)
[forward]  -- forward to upstream DNS (e.g., 8.8.8.8, or host's /etc/resolv.conf)
   |
   v
[cache]  -- cache the response for subsequent queries
```
Plugin order in the Corefile **matters** — it's literally the order of execution.

### Core Concepts
| Term | Meaning |
|---|---|
| **Corefile** | CoreDNS's config file — defines zones and their plugin chains, analogous to nginx.conf |
| **Plugin** | A self-contained unit of DNS behavior (resolve, cache, log, forward, rewrite, block...) compiled into the binary and activated per zone |
| **Zone** | A DNS domain block in the Corefile, e.g. `cluster.local:53 { ... }` — each zone gets its own plugin chain |
| **`kubernetes` plugin** | Resolves in-cluster Service/Pod DNS by watching the Kubernetes API for Services and Endpoints |
| **`forward` plugin** | Forwards any query the current zone's plugins didn't answer to an upstream resolver |
| **`cache` plugin** | Caches responses (positive and negative) for a configurable TTL, cutting repeated upstream/API load |
| **ndots** | A resolv.conf setting controlling how many dots in a name trigger search-domain expansion before trying it as-is — a classic Kubernetes DNS gotcha (see Advanced) |

### A Basic Corefile
```
# Corefile — minimal example
.:53 {
    forward . 8.8.8.8 1.1.1.1
    cache 30
    log
    errors
}
```
This defines one zone (`.` — everything), forwards all queries to Google/Cloudflare DNS, caches responses for 30 seconds, logs every query, and logs errors. This is CoreDNS running as a plain recursive-forwarding resolver — no Kubernetes involved at all.

---

## 2. Intermediate

### The Real Kubernetes Default Corefile
This is (approximately) what ships in the `coredns` ConfigMap in `kube-system` on a stock cluster:
```
.:53 {
    errors
    health {
       lameduck 5s
    }
    ready
    kubernetes cluster.local in-addr.arpa ip6.arpa {
       pods insecure
       fallthrough in-addr.arpa ip6.arpa
       ttl 30
    }
    prometheus :9153
    forward . /etc/resolv.conf {
       max_concurrent 1000
    }
    cache 30
    loop
    reload
    loadbalance
}
```
Plugin-by-plugin:
| Plugin | Role |
|---|---|
| `errors` | Log any errors to stdout |
| `health` | Serves `/health` on `:8080` for the kubelet liveness probe; `lameduck` delays shutdown so in-flight queries drain |
| `ready` | Serves `/ready` — readiness endpoint |
| `kubernetes` | The core plugin — resolves `cluster.local` and reverse-lookup zones from live Service/Endpoints data via the Kubernetes API watch |
| `pods insecure` | Controls whether/how pod IP-based DNS names (`1-2-3-4.namespace.pod.cluster.local`) resolve |
| `fallthrough` | If the `kubernetes` plugin can't answer a reverse-lookup query, pass it to the next plugin instead of returning NXDOMAIN immediately |
| `ttl 30` | TTL on records returned by the `kubernetes` plugin |
| `prometheus :9153` | Exposes Prometheus metrics |
| `forward . /etc/resolv.conf` | Anything not resolved by `kubernetes` (i.e., external names) gets forwarded to the node's upstream resolvers |
| `cache 30` | Cache responses for 30s |
| `loop` | Detects forwarding loops (CoreDNS forwarding to itself) and halts CoreDNS if found — a real safety net |
| `reload` | Auto-reloads the Corefile if the ConfigMap changes, without a pod restart |
| `loadbalance` | Randomizes the order of A/AAAA records returned — a cheap round-robin-style load spreading across endpoint IPs |

### How Kubernetes Service DNS Resolution Actually Works
```
Pod does: curl http://my-svc.my-namespace.svc.cluster.local
                          |
                          v
        Pod's /etc/resolv.conf points nameserver at the CoreDNS
        Service ClusterIP (typically 10.96.0.10 or similar)
                          |
                          v
              CoreDNS `kubernetes` plugin receives query,
              checks its in-memory cache of Service/Endpoints
              objects (populated via a watch on the K8s API)
                          |
                          v
        ClusterIP Service -> returns the Service's stable ClusterIP
        Headless Service (clusterIP: None) -> returns the Pod IPs directly
              (one A record per ready Pod backing the Service)
```
- **ClusterIP Service**: `my-svc.my-namespace.svc.cluster.local` -> single stable VIP, kube-proxy handles the actual load-balancing to Pods.
- **Headless Service** (`clusterIP: None`): DNS itself returns every backing Pod's IP directly — used when the client needs to know about individual pod identities (StatefulSets, peer discovery, client-side load balancing).
- The **search domain list** in a Pod's `/etc/resolv.conf` (`my-namespace.svc.cluster.local`, `svc.cluster.local`, `cluster.local`, plus the node's own search domains) is why a Pod can resolve a same-namespace service by short name alone (`my-svc`) instead of the full FQDN.

### Comparison: Cluster DNS vs Standalone Authoritative DNS
| Use case | Typical Corefile shape |
|---|---|
| Kubernetes cluster DNS | `kubernetes` plugin + `forward` for everything external |
| Standalone authoritative DNS for a real zone | `file` plugin pointing at a zone file, or `hosts` plugin for static entries |
| Ad-hoc DNS-based service discovery outside k8s | `etcd` plugin (CoreDNS can read service records from etcd directly) |
| Simple forwarding resolver / DNS firewall | `forward` + `cache` + a blocklist plugin (e.g., community `k8s_external`, or a hosts-file-based blocklist) |

### Scaling and HA in a Cluster
- CoreDNS runs as a normal Kubernetes **Deployment** in `kube-system`, default **2 replicas**, fronted by a Service (the `kube-dns` Service, kept named that way for legacy compatibility even though it runs CoreDNS).
- On larger clusters, a fixed replica count doesn't keep up with node/pod count growth — the **`cluster-proportional-autoscaler`** is deployed alongside CoreDNS to scale replica count based on the number of nodes/cores in the cluster automatically.
- Because each replica independently watches the API server for Services/Endpoints and answers from its own in-memory cache, CoreDNS pods are stateless and trivially horizontally scalable — no coordination needed between replicas.

---

## 3. Advanced

### The ndots Gotcha
- `ndots:5` is the Kubernetes default in every Pod's `/etc/resolv.conf` — meaning any name with **fewer than 5 dots** gets the search-domain list applied *before* being tried as an absolute name.
- For a Pod looking up an **external** FQDN like `api.example.com` (2 dots, under the threshold of 5), the resolver tries, in order:
  ```
  api.example.com.my-namespace.svc.cluster.local  -> NXDOMAIN
  api.example.com.svc.cluster.local                -> NXDOMAIN
  api.example.com.cluster.local                    -> NXDOMAIN
  api.example.com.<node search domain, if any>      -> NXDOMAIN (maybe)
  api.example.com.                                  -> finally succeeds
  ```
  That's up to 5 DNS round-trips (4 wasted) for every single external lookup — a real, measurable latency and CoreDNS-load cost at scale, and a classic source of "why is my app's first request always slow" bug reports.
- Fixes: append a trailing dot to fully-qualified external hostnames in app config (`api.example.com.`) to skip search expansion entirely, or set `dnsConfig.options` with a lower `ndots` value on performance-sensitive Pods, or use the `autopath` plugin (deprecated/less common now) which had CoreDNS itself short-circuit the search chain server-side.

### Debugging DNS Issues in Kubernetes
```bash
# Spin up a throwaway debug pod with DNS tools
kubectl run -it --rm dnsutils --image=registry.k8s.io/e2e-test-images/agnhost:2.39 -- sh

# Inside it:
nslookup kubernetes.default
nslookup my-svc.my-namespace.svc.cluster.local
cat /etc/resolv.conf   # confirm nameserver + search domains + ndots

# From outside, tail CoreDNS logs (needs the `log` plugin enabled)
kubectl -n kube-system logs -l k8s-app=kube-dns -f

# Check CoreDNS's own health/readiness
kubectl -n kube-system get pods -l k8s-app=kube-dns
kubectl -n kube-system top pods -l k8s-app=kube-dns   # CPU/mem pressure?
```
| Symptom | Likely cause |
|---|---|
| `NXDOMAIN` for a Service that clearly exists | Wrong namespace in the query, or Service/Endpoints not yet propagated (check `kubectl get endpoints`) |
| Intermittent resolution failures under load | CoreDNS pods CPU-throttled or too few replicas for cluster size — check `cluster-proportional-autoscaler` config |
| Slow first request to external domains | The `ndots:5` search-domain expansion tax described above |
| `SERVFAIL` on external lookups | `forward` plugin's upstream (node's `/etc/resolv.conf` or a hardcoded IP) is unreachable — check node-level DNS/network policy |
| CoreDNS crash-looping after a ConfigMap edit | Syntax error in the Corefile — `reload` plugin will refuse to apply broken config, but a full restart from a bad ConfigMap will crash-loop |

### Performance Tuning
- **`cache`**: increasing TTL reduces load on both the `kubernetes` plugin and any `forward` upstream, at the cost of staleness on rapid Service/Endpoints changes.
- **`autopath`** (where still used) or lowering `ndots` cuts the search-domain multiplication described above.
- **Resource requests/limits**: CoreDNS is CPU-bound under query load, not memory-bound — undersized CPU requests are the most common cause of latency spikes at scale.
- **NodeLocal DNSCache**: a `DaemonSet` running a CoreDNS instance on every node, so Pods query `localhost` instead of crossing the network to a cluster-wide CoreDNS Service — cuts latency and CoreDNS Service load significantly on large/high-QPS clusters, while still falling back to the cluster CoreDNS Deployment for cache misses.

### Integration with the Broader CNCF Ecosystem
- **cert-manager / external-dns**: `external-dns` can be paired with CoreDNS's `etcd` plugin to publish public-facing DNS records driven by Kubernetes Ingress/Service objects.
- **Istio / service mesh**: mesh sidecars still resolve service names through CoreDNS as the first hop before mesh-level routing takes over.
- **Prometheus**: the `prometheus` plugin exposes query counts, cache hit ratio, and forward latency — standard scrape target in any cluster's monitoring stack.

---

## Quick Revision — CoreDNS
- Default Kubernetes DNS server since 1.13, replacing kube-dns's multi-container design with one Go binary and a plugin chain.
- Corefile = zones + ordered plugin chains; plugin order determines execution order.
- Key plugins: `kubernetes` (resolves in-cluster DNS from Service/Endpoints watch), `forward` (upstream for everything else), `cache`, `loop` (forwarding-loop detection), `reload` (live Corefile reload from ConfigMap).
- ClusterIP Service -> one stable VIP; headless Service (`clusterIP: None`) -> DNS returns individual Pod IPs directly.
- `ndots:5` default causes up to 4 wasted lookups before resolving external FQDNs — append a trailing dot or tune `ndots` to fix.
- Runs as a Deployment, default 2 replicas, scaled via `cluster-proportional-autoscaler` on larger clusters; NodeLocal DNSCache reduces latency further via a per-node DaemonSet cache.
- Debug via a throwaway pod (`nslookup`/`dig`), CoreDNS logs (needs `log` plugin), and `kubectl get endpoints` to confirm the backing data is even correct.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
