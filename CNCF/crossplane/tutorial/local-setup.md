# Crossplane — Learn It Locally

Goal: install Crossplane on a local Kubernetes cluster, install a provider, and apply a Composition + Claim to see the reconciliation model working end-to-end — in about 25 minutes. This tutorial uses `provider-kubernetes` (manages resources on a Kubernetes cluster, including the same local cluster) so the whole thing runs with **no real cloud account needed**. A dedicated section at the end shows exactly what changes if you want to point Crossplane at real AWS instead.

## Prerequisites
- Docker installed and running.
- `kind` and `kubectl` installed.
- `helm` installed (Crossplane is installed via its Helm chart).

---

## Step 1 — Create a kind Cluster

```bash
kind create cluster --name crossplane-lab
kubectl cluster-info --context kind-crossplane-lab
```

---

## Step 2 — Install Crossplane via Helm

```bash
helm repo add crossplane-stable https://charts.crossplane.io/stable
helm repo update

kubectl create namespace crossplane-system

helm install crossplane crossplane-stable/crossplane \
  --namespace crossplane-system
```

Verify:
```bash
kubectl get pods -n crossplane-system
# expect: crossplane-*, crossplane-rbac-manager-*
```

---

## Step 3 — Install a Provider

`provider-kubernetes` lets Crossplane manage arbitrary Kubernetes objects (on this same cluster or a remote one) as Managed Resources — a good no-cloud-account way to see the exact same MR/reconciliation model that `provider-aws`/`provider-gcp` use for real cloud resources.

```bash
cat <<EOF | kubectl apply -f -
apiVersion: pkg.crossplane.io/v1
kind: Provider
metadata:
  name: provider-kubernetes
spec:
  package: xpkg.upbound.io/crossplane-contrib/provider-kubernetes:v0.13.0
EOF

kubectl get providers
kubectl get pods -n crossplane-system -w
```
Wait until `INSTALLED: True` and `HEALTHY: True`:
```bash
kubectl get providers
```

---

## Step 4 — Configure the Provider (In-Cluster Credentials)

`provider-kubernetes` can use the cluster's own in-cluster ServiceAccount to manage resources on itself — no external secret needed for this local exercise.

```bash
cat <<EOF | kubectl apply -f -
apiVersion: kubernetes.crossplane.io/v1alpha1
kind: ProviderConfig
metadata:
  name: kubernetes-provider
spec:
  credentials:
    source: InjectedIdentity
EOF
```

---

## Step 5 — Apply a Managed Resource Directly

Before building the platform-team abstraction, see the lowest-level building block: a Managed Resource that creates a plain Kubernetes `ConfigMap` (standing in for "a cloud resource" — the mechanics are identical to `Bucket` or `Instance` from a real cloud provider).

```bash
cat <<EOF | kubectl apply -f -
apiVersion: kubernetes.crossplane.io/v1alpha2
kind: Object
metadata:
  name: demo-configmap
spec:
  forProvider:
    manifest:
      apiVersion: v1
      kind: ConfigMap
      metadata:
        name: crossplane-demo
        namespace: default
      data:
        hello: world
  providerConfigRef:
    name: kubernetes-provider
EOF

kubectl get managed
kubectl get configmap crossplane-demo -n default -o yaml
```
Now edit the ConfigMap out-of-band to see reconciliation/drift correction in action:
```bash
kubectl patch configmap crossplane-demo -n default --type merge -p '{"data":{"hello":"tampered"}}'
kubectl get configmap crossplane-demo -n default -o jsonpath='{.data.hello}'
# briefly shows "tampered"

sleep 15
kubectl get configmap crossplane-demo -n default -o jsonpath='{.data.hello}'
# back to "world" — Crossplane's controller reconciled it back to the declared spec
```

---

## Step 6 — Build a Self-Service Abstraction (XRD + Composition + Claim)

This is Crossplane's core platform-engineering value: define a simple `AppConfig` API that expands into underlying `Object` managed resources, so a "developer" never writes raw `kubernetes.crossplane.io` YAML.

**XRD:**
```bash
cat <<EOF | kubectl apply -f -
apiVersion: apiextensions.crossplane.io/v1
kind: CompositeResourceDefinition
metadata:
  name: xappconfigs.platform.example.org
spec:
  group: platform.example.org
  names:
    kind: XAppConfig
    plural: xappconfigs
  claimNames:
    kind: AppConfig
    plural: appconfigs
  versions:
    - name: v1alpha1
      served: true
      referenceable: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                parameters:
                  type: object
                  properties:
                    message:
                      type: string
                  required: ["message"]
              required: ["parameters"]
EOF

kubectl get xrd
```

**Composition:**
```bash
cat <<EOF | kubectl apply -f -
apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: xappconfigs-configmap
spec:
  compositeTypeRef:
    apiVersion: platform.example.org/v1alpha1
    kind: XAppConfig
  resources:
    - name: config-object
      base:
        apiVersion: kubernetes.crossplane.io/v1alpha2
        kind: Object
        spec:
          providerConfigRef:
            name: kubernetes-provider
          forProvider:
            manifest:
              apiVersion: v1
              kind: ConfigMap
              metadata:
                name: app-generated-config
                namespace: default
              data:
                message: placeholder
      patches:
        - fromFieldPath: "spec.parameters.message"
          toFieldPath: "spec.forProvider.manifest.data.message"
EOF

kubectl get compositions
```

**Claim — this is the "developer-facing" request:**
```bash
kubectl create namespace team-app

cat <<EOF | kubectl apply -n team-app -f -
apiVersion: platform.example.org/v1alpha1
kind: AppConfig
metadata:
  name: my-app-config
spec:
  parameters:
    message: "hello from a crossplane claim"
EOF

kubectl -n team-app get appconfigs
kubectl -n team-app get appconfig my-app-config -o yaml
```

Inspect the full reconciliation chain:
```bash
kubectl get managed
kubectl get configmap app-generated-config -n default -o jsonpath='{.data.message}'
```
You should see `hello from a crossplane claim` — the claim triggered the XR, the Composition expanded it into an `Object` managed resource, and the provider controller reconciled that into a real ConfigMap. This exact chain is what happens with `provider-aws` and a real `Database` claim expanding into an `RDSInstance` — only the resource types differ.

---

## Step 7 — What Changes for a Real Cloud Provider (AWS Example, Not Runnable Without Credentials)

To point this at real AWS instead of `provider-kubernetes`, the steps are structurally identical, with two differences:

1. Install the AWS provider instead:
```yaml
apiVersion: pkg.crossplane.io/v1
kind: Provider
metadata:
  name: provider-aws-s3
spec:
  package: xpkg.upbound.io/upbound/provider-aws-s3:v1
```

2. Create a `ProviderConfig` backed by a real AWS credentials Secret (this step requires an actual AWS account and IAM access key — cannot be completed without one):
```bash
kubectl create secret generic aws-creds \
  -n crossplane-system \
  --from-literal=creds='[default]
aws_access_key_id = YOUR_ACCESS_KEY
aws_secret_access_key = YOUR_SECRET_KEY'
```
```yaml
apiVersion: aws.upbound.io/v1beta1
kind: ProviderConfig
metadata:
  name: default
spec:
  credentials:
    source: Secret
    secretRef:
      namespace: crossplane-system
      name: aws-creds
      key: creds
```
Everything from Step 6 onward (XRD, Composition, Claim, `kubectl get managed`) works identically — only `apiVersion`/`kind` in the Composition's `base` change from `kubernetes.crossplane.io/Object` to something like `s3.aws.upbound.io/Bucket` or `rds.aws.upbound.io/Instance`.

---

## Cleanup
```bash
kind delete cluster --name crossplane-lab
```

## What to Explore Next
- Add a second Composition for the same XRD (e.g., targeting a `Secret` instead of a `ConfigMap`) and use `compositionSelector` labels on the Claim to choose between them — this is how multi-cloud Compositions work for the same API.
- Delete the Claim and watch `kubectl get managed` show the underlying Object being deleted too (default `deletionPolicy: Delete`), then try `spec.deletionPolicy: Orphan` on a Composition resource and see the difference.
- Try a Composition Function (`mode: Pipeline`) instead of patch-and-transform, to see the programmatic-logic approach to composing resources.
- If you have an AWS/GCP sandbox account, swap in the real cloud provider from Step 7 and provision an actual S3 bucket or GCS bucket end-to-end.
