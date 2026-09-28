# SPIRE — Learn It Locally

Goal: deploy SPIRE Server + Agent on a local Kubernetes cluster, register a workload identity tied to a ServiceAccount, and fetch a real SVID from inside a running pod — in about 25 minutes.

## Prerequisites
- Docker installed and running.
- `kind` and `kubectl` installed.
- `helm` installed (we'll use the official SPIRE Helm charts — this is the least error-prone path for a first run).

---

## Step 1 — Create the Cluster

```bash
kind create cluster --name spire-lab
kubectl cluster-info --context kind-spire-lab
```

---

## Step 2 — Install SPIRE via the Official Helm Chart

SPIRE publishes a Helm chart that installs Server + Agent + the CRDs used to manage registration entries declaratively (`ClusterSPIFFEID`), via the `spire-controller-manager`.

```bash
helm repo add spiffe https://spiffe.github.io/helm-charts-hardened/
helm repo update

kubectl create namespace spire-server
kubectl create namespace spire-system

helm install spire-crds spiffe/spire-crds -n spire-server
helm install spire spiffe/spire -n spire-server \
  --set global.spire.trustDomain=example.org \
  --set global.spire.clusterName=spire-lab
```

Watch it come up:
```bash
kubectl get pods -n spire-server -w
```
You should see `spire-server-0` (a StatefulSet — SPIRE Server is stateful, it holds registration entries) and `spire-agent-<hash>` DaemonSet pods, one per node. On a single-node `kind` cluster that's one agent pod.

Confirm the server is healthy:
```bash
kubectl exec -n spire-server spire-server-0 -c spire-server -- \
  /opt/spire/bin/spire-server healthcheck
```

---

## Step 3 — Look at What Got Registered Automatically

The chart's `spire-controller-manager` ships a default `ClusterSPIFFEID` that auto-registers every pod in the cluster with an identity derived from its namespace/ServiceAccount. Check it:

```bash
kubectl get clusterspiffeid
kubectl describe clusterspiffeid default
```

List the actual registration entries SPIRE Server holds:
```bash
kubectl exec -n spire-server spire-server-0 -c spire-server -- \
  /opt/spire/bin/spire-server entry show
```
You'll see one entry per pod currently running in the cluster (including SPIRE's own components) — this is the declarative, Kubernetes-native way to manage entries instead of running `spire-server entry create` by hand for everything.

---

## Step 4 — Deploy a Workload and Register It Explicitly

Create a namespace and a minimal workload with its own ServiceAccount:

```bash
kubectl create namespace prod
kubectl create serviceaccount payment-service -n prod
```

```yaml
# payment-service.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
  namespace: prod
spec:
  replicas: 1
  selector:
    matchLabels:
      app: payment-service
  template:
    metadata:
      labels:
        app: payment-service
    spec:
      serviceAccountName: payment-service
      containers:
        - name: payment-service
          image: busybox:1.36
          command: ["sleep", "infinity"]
          volumeMounts:
            - name: spire-agent-socket
              mountPath: /run/spire/sockets
              readOnly: true
      volumes:
        - name: spire-agent-socket
          hostPath:
            path: /run/spire/sockets
            type: Directory
```
```bash
kubectl apply -f payment-service.yaml
kubectl get pods -n prod
```

The `hostPath` mount is what gives the pod access to the SPIRE Agent's Workload API Unix socket on its node — this is the actual mechanic that lets the Agent identify the caller at the OS level (see the notes file for why this must stay local-only).

Now register an explicit identity for it with a custom `ClusterSPIFFEID`, instead of relying on the default catch-all:
```yaml
# payment-service-spiffeid.yaml
apiVersion: spire.spiffe.io/v1alpha1
kind: ClusterSPIFFEID
metadata:
  name: payment-service
spec:
  spiffeIDTemplate: "spiffe://example.org/ns/{{ .PodMeta.Namespace }}/sa/{{ .PodSpec.ServiceAccountName }}"
  podSelector:
    matchLabels:
      app: payment-service
```
```bash
kubectl apply -f payment-service-spiffeid.yaml
kubectl exec -n spire-server spire-server-0 -c spire-server -- \
  /opt/spire/bin/spire-server entry show -spiffeID spiffe://example.org/ns/prod/sa/payment-service
```
You should see one entry matching, with selectors tied to the pod's namespace/ServiceAccount/labels — exactly the independently-observed facts SPIRE Agent uses for workload attestation.

---

## Step 5 — Fetch a Real SVID from Inside the Workload

Exec into the pod and query the Workload API directly with the `spire-agent` CLI (present in the agent image; we'll copy the binary in via a debug container for simplicity):

```bash
kubectl debug -n prod -it deploy/payment-service \
  --image=ghcr.io/spiffe/spire-agent:1.9.6 \
  --target=payment-service -- \
  /opt/spire/bin/spire-agent api fetch x509 \
  -socketPath /run/spire/sockets/agent.sock
```

Expected output includes something like:
```
Received 1 svid after 15ms

SPIFFE ID:              spiffe://example.org/ns/prod/sa/payment-service
SVID Valid After:       2026-09-28 10:00:00 +0000 UTC
SVID Valid Until:       2026-09-28 11:00:00 +0000 UTC
CA #1 Valid After:      2026-09-28 09:00:00 +0000 UTC
CA #1 Valid Until:      2026-10-28 09:00:00 +0000 UTC
```

To actually see the certificate and confirm the SPIFFE ID is embedded in the URI SAN:
```bash
kubectl debug -n prod -it deploy/payment-service \
  --image=ghcr.io/spiffe/spire-agent:1.9.6 \
  --target=payment-service -- \
  /opt/spire/bin/spire-agent api fetch x509 \
  -socketPath /run/spire/sockets/agent.sock \
  -write /tmp/svid

# then, from another shell/container with openssl:
openssl x509 -in /tmp/svid/svid.0.pem -noout -text | grep -A1 "Subject Alternative Name"
# URI:spiffe://example.org/ns/prod/sa/payment-service
```

This is the whole loop: no static credential was ever handed to `payment-service` — the Agent attested the running process against the cluster's ground truth (namespace + ServiceAccount) and minted a short-lived, cryptographically verifiable identity on demand.

---

## Step 6 — Watch Rotation Happen

SVID TTLs default to about 1 hour. To see rotation without waiting, lower the TTL on the registration entry:
```bash
kubectl exec -n spire-server spire-server-0 -c spire-server -- \
  /opt/spire/bin/spire-server entry update \
  -entryID <entry-id-from-entry-show> \
  -ttl 60
```
Fetch the SVID twice, a couple of minutes apart, and diff the `SVID Valid After` timestamps — you'll see a new cert each time, with zero coordination required by the workload itself.

---

## Cleanup
```bash
kubectl delete namespace prod
kind delete cluster --name spire-lab
```

## What to Explore Next
- Register a second workload (`inventory-service`) and write a tiny Go or Python program using the [go-spiffe](https://github.com/spiffe/go-spiffe) or [py-spiffe](https://github.com/spiffe/py-spiffe) library to establish real mTLS between two workloads using their SVIDs directly, instead of using the CLI.
- Change a pod's ServiceAccount and watch its SPIFFE ID change accordingly on the next `entry show` — confirms identity is derived from ground truth, not configuration you control from inside the pod.
- Look at `spire-server entry show` after scaling `payment-service` to 3 replicas — one registration entry (selector-based) serves all matching pods, it isn't per-pod.
- If you have a second `kind` cluster available, try federating two trust domains and verifying a workload in cluster A can validate an SVID issued in cluster B.
