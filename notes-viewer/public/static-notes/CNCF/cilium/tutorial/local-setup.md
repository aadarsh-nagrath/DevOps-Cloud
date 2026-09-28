# Cilium — Learn It Locally

Goal: build a kind cluster with no default CNI, install Cilium as the sole networking layer, prove L7-aware network policy actually blocks/allows traffic, and watch the live service map in Hubble UI — in about 25 minutes.

## Prerequisites
- Docker installed and running.
- `kind` and `kubectl` installed.
- `helm` installed (or the `cilium` CLI — both paths shown below).
- At least 4GB free RAM for the kind cluster + Cilium + Hubble.

---

## Step 1 — Create a kind Cluster Without a Default CNI

Cilium needs to be the only thing managing pod networking, so kind's default `kindnet` CNI must be disabled.

```yaml
# kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  disableDefaultCNI: true
  podSubnet: "10.244.0.0/16"
nodes:
  - role: control-plane
  - role: worker
```

```bash
kind create cluster --name cilium-lab --config kind-config.yaml
kubectl get nodes
```
Nodes will show `NotReady` — expected, there's no CNI yet, so pods (including CoreDNS) can't get networking.

```bash
kubectl get pods -n kube-system
# coredns pods will be stuck Pending/ContainerCreating
```

---

## Step 2 — Install Cilium

### Option A — Cilium CLI (recommended, does version/compat checks for you)
```bash
# macOS
brew install cilium-cli

cilium install --version 1.15.6
cilium status --wait
```

### Option B — Helm
```bash
helm repo add cilium https://helm.cilium.io/
helm repo update

helm install cilium cilium/cilium --version 1.15.6 \
  --namespace kube-system \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost=cilium-lab-control-plane \
  --set k8sServicePort=6443
```

Either way, wait for it to come up and verify:
```bash
kubectl get nodes
# Should now show Ready

kubectl get pods -n kube-system -l k8s-app=cilium
cilium status
```
`cilium status` should show all checks green: DaemonSet ready, kube-proxy replacement (if enabled) active, no failing controllers.

---

## Step 3 — Deploy Test Workloads

```bash
kubectl create namespace demo

kubectl -n demo run backend --image=nginx:alpine --labels="app=backend" --port=80
kubectl -n demo expose pod backend --port=80 --target-port=80

kubectl -n demo run frontend --image=curlimages/curl:latest --labels="app=frontend" \
  --command -- sleep infinity

kubectl -n demo run other --image=curlimages/curl:latest --labels="app=other" \
  --command -- sleep infinity

kubectl -n demo wait --for=condition=Ready pod --all --timeout=90s
```

Confirm both curl pods can currently reach `backend` — no policy applied yet, everything is open:
```bash
kubectl -n demo exec frontend -- curl -s -o /dev/null -w "%{http_code}\n" http://backend
kubectl -n demo exec other -- curl -s -o /dev/null -w "%{http_code}\n" http://backend
```
Both should print `200`.

---

## Step 4 — Apply a CiliumNetworkPolicy and Prove Enforcement

```yaml
# allow-frontend-get.yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: allow-frontend-get
  namespace: demo
spec:
  endpointSelector:
    matchLabels:
      app: backend
  ingress:
    - fromEndpoints:
        - matchLabels:
            app: frontend
      toPorts:
        - ports:
            - port: "80"
              protocol: TCP
          rules:
            http:
              - method: "GET"
                path: "/"
```

```bash
kubectl apply -f allow-frontend-get.yaml
```

Test again:
```bash
# frontend -> backend: still allowed (matches the policy)
kubectl -n demo exec frontend -- curl -s -o /dev/null -w "%{http_code}\n" http://backend

# other -> backend: now blocked, other isn't in the allowed fromEndpoints
kubectl -n demo exec other -- curl -s -o /dev/null -w "%{http_code}\n" --max-time 3 http://backend
```
`frontend` gets `200`. `other` hangs and times out — the eBPF datapath is dropping the packet before it reaches nginx at all, based purely on the pod's security identity (its `app` label), not its IP.

Now prove the L7 layer works, not just L3/L4 — try a method the policy doesn't allow:
```bash
kubectl -n demo exec frontend -- curl -s -o /dev/null -w "%{http_code}\n" -X POST http://backend
```
This returns `403` (or connection reset, depending on Cilium version) — `frontend` is allowed to reach `backend` on port 80, but the L7 rule only permits `GET`, so a `POST` from the very same, otherwise-trusted pod is rejected. This is the concrete difference between plain `NetworkPolicy` (which can only see "port 80 allowed") and `CiliumNetworkPolicy` (which parses the actual HTTP request).

---

## Step 5 — Install Hubble UI and Watch the Live Service Map

```bash
cilium hubble enable --ui
cilium status --wait

cilium hubble port-forward &
# or, without the CLI:
# kubectl -n kube-system port-forward svc/hubble-ui 12000:80
```

Open Hubble UI:
```bash
cilium hubble ui
# opens http://localhost:12000
```
Select the `demo` namespace. Generate a bit of traffic to see it live:
```bash
for i in $(seq 1 20); do
  kubectl -n demo exec frontend -- curl -s -o /dev/null http://backend
  kubectl -n demo exec other -- curl -s -o /dev/null --max-time 1 http://backend
  sleep 1
done
```
Watch the UI: `frontend -> backend` flows show green (forwarded), `other -> backend` flows show red (dropped) — a live, real-time picture of exactly the policy decision you just tested from the CLI.

You can get the same data as text at any time:
```bash
hubble observe -n demo --verdict DROPPED
hubble observe -n demo --verdict FORWARDED --protocol http
```

---

## Step 6 — Run the Built-In Connectivity Test (Optional but Useful)

```bash
cilium connectivity test
```
This deploys a matrix of test pods and runs dozens of pod-to-pod, pod-to-service, and policy-enforcement checks automatically — the standard first diagnostic to run any time Cilium networking looks broken, and a good way to see everything Cilium can enforce in one pass.

---

## Cleanup

```bash
kubectl delete namespace demo
kind delete cluster --name cilium-lab
```

## What to Explore Next
- Add a DNS-based egress `CiliumNetworkPolicy` (`toFQDNs: matchName: "example.com"`) and watch Hubble show DNS resolution + the resulting allow/deny on the actual IP that DNS returned.
- Turn on `hostFirewall` and write a `CiliumClusterwideNetworkPolicy` to restrict traffic to the nodes themselves, not just pods.
- Benchmark: apply the same policy intent as a plain Kubernetes `NetworkPolicy` vs a `CiliumNetworkPolicy` with L7 rules, and use `hubble observe` to see the extra visibility L7 mode gives you that plain L3/L4 policy cannot.
- Try `cilium encrypt` with WireGuard mode and confirm node-to-node traffic is encrypted with zero application changes.
