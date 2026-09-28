# Flux — Learn It Locally

Goal: bootstrap Flux onto a local `kind` cluster pointing at a real Git repo, watch it reconcile manifests automatically, make a change and see it sync, and observe it with `flux get`/`flux logs` — in about 30 minutes.

## Prerequisites
- Docker installed and running.
- `kind` and `kubectl` installed.
- `flux` CLI installed: `brew install fluxcd/tap/flux` (macOS) or see [fluxcd.io/flux/installation](https://fluxcd.io/flux/installation/).
- A GitHub account and a **personal access token** with repo scope (for bootstrapping against your own repo) — or use the no-account path in Step 2b against a public demo repo.

---

## Step 1 — Create a Local Cluster

```bash
kind create cluster --name flux-lab
kubectl cluster-info --context kind-flux-lab
```

Run Flux's built-in pre-flight check:
```bash
flux check --pre
```

---

## Step 2a — Bootstrap Against Your Own GitHub Repo (Recommended Path)

```bash
export GITHUB_TOKEN=<your-personal-access-token>
export GITHUB_USER=<your-github-username>

flux bootstrap github \
  --owner=$GITHUB_USER \
  --repository=flux-lab \
  --branch=main \
  --path=clusters/flux-lab \
  --personal
```

This creates the `flux-lab` repo if it doesn't exist, installs Flux's controllers into the `flux-system` namespace, and commits Flux's own manifests to `clusters/flux-lab/flux-system/` in that repo — Flux is now managing itself via GitOps.

Verify:
```bash
kubectl get pods -n flux-system
flux get all
```

---

## Step 2b — No-Account Alternative: Point at a Public Demo Repo

If you'd rather not create a token/repo, install Flux directly and manually apply a `GitRepository` + `Kustomization` against a public example repo (`stefanprodan/podinfo`, the canonical Flux demo app):
```bash
flux install
```
```yaml
# podinfo-source.yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: podinfo
  namespace: flux-system
spec:
  interval: 1m
  url: https://github.com/stefanprodan/podinfo
  ref:
    branch: master
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: podinfo
  namespace: flux-system
spec:
  interval: 1m
  sourceRef:
    kind: GitRepository
    name: podinfo
  path: "./kustomize"
  prune: true
  targetNamespace: default
```
```bash
kubectl apply -f podinfo-source.yaml
```
This path skips self-management but demonstrates the reconcile loop identically — use this if you just want to see Flux work without wiring your own repo.

---

## Step 3 — Watch Flux Reconcile

```bash
flux get sources git
flux get kustomizations
```
You should see `podinfo` (or your bootstrapped repo) with `READY: True` and a recent revision hash. Confirm the workload actually landed:
```bash
kubectl get deployments -n default
kubectl get pods -n default
```
`podinfo` pods should be running — Flux pulled the manifests from Git and applied them without anyone running `kubectl apply` manually.

Tail live reconciliation activity:
```bash
flux logs --follow
```

---

## Step 4 — Make a Git Change and Watch It Sync Automatically

If you're on the self-bootstrapped path (2a), edit something in your own repo — e.g., add a new `Kustomization` for podinfo pointing at its `kustomize` path (mirror the YAML from Step 2b, committed into `clusters/flux-lab/` in your repo), then:
```bash
git add .
git commit -m "add podinfo kustomization"
git push
```
Within the `GitRepository`'s `interval` (default poll, or immediately if you configured a webhook), Flux picks up the change:
```bash
flux get kustomizations --watch
```
Watch the `REVISION` field update to your new commit hash, and the resource appear in the cluster — no manual apply, no CI pipeline touching the cluster directly.

Force an immediate reconcile instead of waiting for the poll interval:
```bash
flux reconcile kustomization podinfo --with-source
```

---

## Step 5 — Observe Drift Correction

```bash
kubectl scale deployment podinfo -n default --replicas=5
kubectl get deployment podinfo -n default
```
Watch it get reverted back to the replica count defined in Git on the next reconcile (or force it: `flux reconcile kustomization podinfo`). This is Flux's continuous drift-correction in action — the cluster is not allowed to silently diverge from Git.

---

## Step 6 — Try Image Automation (Optional)

```yaml
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImageRepository
metadata:
  name: podinfo
  namespace: flux-system
spec:
  image: ghcr.io/stefanprodan/podinfo
  interval: 5m
---
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImagePolicy
metadata:
  name: podinfo
  namespace: flux-system
spec:
  imageRepositoryRef:
    name: podinfo
  policy:
    semver:
      range: '>=6.0.0'
```
```bash
kubectl apply -f image-repo-and-policy.yaml
flux get image repository podinfo
flux get image policy podinfo
```
`flux get image policy podinfo` shows the latest tag matching the semver range that Flux has detected in the registry — this is the mechanism that would, with an `ImageUpdateAutomation` configured against a writable repo, auto-commit that tag back to Git.

---

## Step 7 — Explore the CLI Surface

```bash
flux get all -A
flux events
flux suspend kustomization podinfo
flux resume kustomization podinfo
flux diff kustomization podinfo --path ./kustomize
```
`flux diff` is particularly useful — it shows what would change in the cluster if the current Git state were reconciled right now, without actually applying it.

---

## Cleanup
```bash
kind delete cluster --name flux-lab
```
If you bootstrapped against a real GitHub repo, also delete the repo (or the deploy key Flux registered) from your GitHub account settings if you don't intend to reuse it.

## What to Explore Next
- Configure a GitHub webhook + `notification-controller`'s receiver so pushes trigger instant reconciliation instead of waiting for the poll interval.
- Add a second tenant: a separate `GitRepository`/`Kustomization` pair scoped to its own namespace via `spec.serviceAccountName`, and confirm via RBAC that it can't touch resources outside its scope.
- Install Flagger alongside Flux and wire up a canary `HelmRelease` deployment to see progressive delivery layered on top of GitOps.
- Compare this whole flow side-by-side against the Argo CD tutorial path (see [Argo CD notes](../../../Continuous%20Delivery/ArgoCD/Argo-cd.md)) — bootstrap both against the same demo app and note where the operational experience actually differs (mainly: CLI-first vs UI-first).
