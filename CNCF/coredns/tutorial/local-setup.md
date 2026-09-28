# CoreDNS — Learn It Locally

Goal: inspect and modify the real CoreDNS config running in a local Kubernetes cluster, watch live query logs, prove out service-name resolution between pods, then run CoreDNS completely standalone in Docker with a custom Corefile — in about 20 minutes.

## Prerequisites
- `kind` and `kubectl` installed.
- Docker installed and running.

---

## Step 1 — Spin Up a Cluster and Inspect the Live Corefile

```bash
kind create cluster --name coredns-lab
kubectl -n kube-system get pods -l k8s-app=kube-dns
```

Now look at the actual ConfigMap driving CoreDNS in this cluster:
```bash
kubectl -n kube-system get configmap coredns -o yaml
```
You'll see the Corefile embedded under `data.Corefile` — this is the real default chain covered in the notes (`errors`, `health`, `kubernetes`, `forward`, `cache`, `loop`, `reload`, `loadbalance`). Confirm it matches what you expect from the notes file before moving on.

---

## Step 2 — Add the `log` Plugin and Watch Live Queries

Edit the ConfigMap to add `log` into the chain:
```bash
kubectl -n kube-system edit configmap coredns
```
Add a `log` line inside the `.:53 { ... }` block, so it looks like:
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
    log
    loop
    reload
    loadbalance
}
```
Save and exit. Because the `reload` plugin is active, CoreDNS will pick up the change automatically within ~45 seconds — no pod restart needed. Confirm:
```bash
kubectl -n kube-system logs -l k8s-app=kube-dns -f
```
Leave this tailing in a separate terminal — you'll watch queries land here in the next step.

---

## Step 3 — Deploy Two Test Pods and Resolve Service Names

```bash
kubectl create namespace dns-lab

kubectl -n dns-lab run web --image=nginx:1.25 --port=80
kubectl -n dns-lab expose pod web --port=80 --name=web-svc

kubectl -n dns-lab run client --image=busybox:1.36 --command -- sleep 3600
```

Wait for both to be `Running`:
```bash
kubectl -n dns-lab get pods -w
```

Now resolve the service by short name and by FQDN from inside the client pod:
```bash
kubectl -n dns-lab exec -it client -- nslookup web-svc
kubectl -n dns-lab exec -it client -- nslookup web-svc.dns-lab.svc.cluster.local
kubectl -n dns-lab exec -it client -- cat /etc/resolv.conf
```
Check the terminal tailing CoreDNS logs from Step 2 — you should see these exact queries logged in real time, including the search-domain expansion attempts if you look closely at repeated queries for partial names.

Now try a real HTTP call through the resolved name to confirm it's not just DNS but actually routable:
```bash
kubectl -n dns-lab exec -it client -- wget -qO- http://web-svc
```

---

## Step 4 — Try a Headless Service and Compare

```bash
kubectl -n dns-lab expose pod web --port=80 --name=web-headless --cluster-ip=None
kubectl -n dns-lab exec -it client -- nslookup web-headless
```
Compare the output to `nslookup web-svc` from Step 3 — the ClusterIP service returns one stable virtual IP, while the headless service returns the pod's actual IP directly. With multiple pods behind a headless service you'd see multiple A records, one per pod.

---

## Step 5 — Run CoreDNS Standalone in Docker (No Kubernetes)

This demonstrates the plugin chain completely outside a cluster context.

```bash
mkdir -p ~/coredns-lab && cd ~/coredns-lab
```

```
# Corefile
.:53 {
    forward . 8.8.8.8 1.1.1.1
    cache 30
    log
    errors
}
```
Save that as `~/coredns-lab/Corefile`, then run:
```bash
docker run -d --name coredns-standalone \
  -p 5353:53/udp -p 5353:53/tcp \
  -v ~/coredns-lab/Corefile:/Corefile \
  coredns/coredns:latest -conf /Corefile
```

Query it directly:
```bash
dig @127.0.0.1 -p 5353 example.com
```

Watch it log the query:
```bash
docker logs -f coredns-standalone
```

Now edit the Corefile to add a static entry via the `hosts` plugin — a second concrete example of the plugin chain doing something other than forwarding:
```
# Corefile
.:53 {
    hosts {
        127.0.0.1 myapp.local
        fallthrough
    }
    forward . 8.8.8.8 1.1.1.1
    cache 30
    log
    errors
}
```
```bash
docker restart coredns-standalone
dig @127.0.0.1 -p 5353 myapp.local
dig @127.0.0.1 -p 5353 example.com   # still forwards, thanks to `fallthrough`
```

---

## Cleanup
```bash
docker rm -f coredns-standalone
rm -rf ~/coredns-lab
kind delete cluster --name coredns-lab
```

## What to Explore Next
- Set an artificially low `ndots` on the `client` pod's `dnsConfig` and compare query counts in the CoreDNS logs for an external lookup versus the default `ndots:5`.
- Deploy `cluster-proportional-autoscaler` and watch it change CoreDNS replica count as you scale the number of nodes (`kind` supports multi-node clusters via its config file).
- Add the `rewrite` plugin to the standalone Corefile to rewrite one domain to another before forwarding, and watch the rewritten query in the logs.
- Break DNS on purpose — scale CoreDNS to 0 replicas in the `dns-lab` cluster and watch `nslookup` from the client pod time out, then scale back up and confirm recovery.
