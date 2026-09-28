# ArgoCD — Learn It Locally

This is the hands-on lab companion to [Argo-cd.md](../Argo-cd.md) — that file covers the GitOps concepts and a basic install walkthrough; this file gets you a real `kind` cluster running a real sample app synced from a real Git repo, then deliberately breaks things to prove self-heal and pruning actually work, not just read about them. About 30-40 minutes.

## Prerequisites
- `kind`, `kubectl`, and Docker installed and running.
- A GitHub account (to fork the sample repo — needed for the pruning exercise later, since you need push access to remove a file).

---

## Step 1 — Create a Local Cluster and Install ArgoCD

```bash
kind create cluster --name argocd-lab

kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

kubectl -n argocd get pods -w
```
Wait until `argocd-server`, `argocd-repo-server`, `argocd-application-controller`, `argocd-redis`, and `argocd-dex-server` are all `Running`.

---

## Step 2 — Access the UI and CLI

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443 &
```

Get the initial admin password:
```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d; echo
```

Install the `argocd` CLI (optional but makes the rest of this much faster):
```bash
brew install argocd   # macOS
```

Log in via CLI:
```bash
argocd login localhost:8080 --username admin --password '<password-from-above>' --insecure
```
Also open https://localhost:8080 in a browser and log in with the same credentials — you'll want both the UI and CLI open side by side for the exercises below.

---

## Step 3 — Fork the Sample Apps Repo

The `argocd-example-apps` repo is Argo's own canonical demo repo, containing a `guestbook` app — a tiny two-tier app (a Redis-backed guestbook web UI) with plain Kubernetes manifests, purpose-built for exactly this kind of exercise.

Fork it on GitHub:
```
https://github.com/argoproj/argocd-example-apps -> Fork
```
Clone your fork locally:
```bash
git clone https://github.com/<your-username>/argocd-example-apps.git
cd argocd-example-apps/guestbook
ls
# deployment.yaml  service.yaml  (this is the whole app — deliberately minimal)
```

---

## Step 4 — Deploy the Guestbook via a Real Application Manifest

Create the `Application` resource pointing at your fork:
```yaml
# guestbook-app.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/<your-username>/argocd-example-apps.git
    targetRevision: master
    path: guestbook
  destination:
    server: https://kubernetes.default.svc
    namespace: guestbook
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```
```bash
kubectl apply -f guestbook-app.yaml
```

Watch it sync:
```bash
argocd app get guestbook
argocd app sync guestbook   # or just wait — automated sync kicks in on its own
kubectl -n guestbook get pods,svc
```
You should see a `guestbook-ui` Deployment and Service come up in the `guestbook` namespace. Confirm it's reachable:
```bash
kubectl -n guestbook port-forward svc/guestbook-ui 8081:80 &
open http://localhost:8081
```
You now have a real GitOps-deployed app: the `guestbook` namespace's actual state was never `kubectl apply`'d by you directly — ArgoCD read the manifests from your fork and applied them on your behalf. This is the whole point.

---

## Step 5 — Prove Self-Heal: Manually Edit a Live Resource

The `syncPolicy.automated.selfHeal: true` you set means ArgoCD won't just sync when Git changes — it will actively revert any manual drift in the cluster back to match Git.

Watch the Application's status in one terminal:
```bash
watch -n 2 argocd app get guestbook
```

In another terminal, manually edit the live Deployment directly, bypassing Git entirely:
```bash
kubectl -n guestbook scale deployment guestbook-ui --replicas=5
kubectl -n guestbook get deployment guestbook-ui
```
You'll briefly see 5 replicas. Within roughly the next reconciliation pass (self-heal reacts fast, typically within seconds once it detects the drift via its watch on the resource, not waiting for the default 3-minute polling interval), watch it get reverted:
```bash
kubectl -n guestbook get deployment guestbook-ui -w
```
It drops back to whatever replica count is defined in `deployment.yaml` in Git (1, in the stock guestbook manifest). Check the Application's UI page too — you'll see a sync event logged with a message indicating it corrected out-of-band drift. This is self-heal working: the live cluster state tried to diverge from Git, and ArgoCD pulled it back without you doing anything.

Try it again with something more visible — edit an env var or image tag directly with `kubectl edit deployment guestbook-ui -n guestbook` and watch that get reverted too.

---

## Step 6 — Prove Pruning: Remove a Resource from Git

Pruning is the opposite direction from self-heal: instead of the *live cluster* drifting from Git, here *Git itself* changes (a resource is removed from the tracked manifests), and ArgoCD must delete the corresponding live resource to match.

In your local fork, remove the Service manifest entirely:
```bash
cd argocd-example-apps/guestbook
rm service.yaml
git add -A
git commit -m "Remove guestbook-ui service to test ArgoCD pruning"
git push
```

Watch ArgoCD detect and act on it:
```bash
watch -n 2 argocd app get guestbook
```
Within the next sync (automated sync polls Git roughly every 3 minutes by default, or trigger it immediately):
```bash
argocd app sync guestbook
kubectl -n guestbook get svc
```
The `guestbook-ui` Service is gone from the live cluster — because `prune: true` was set, ArgoCD didn't just leave the orphaned resource alone (which is what would happen with `prune: false`), it actively deleted it to match the new (smaller) desired state in Git. Confirm the Deployment/Pods are still there, untouched — only the resource that was actually removed from Git got pruned.

Restore it to leave your fork in a clean state if you want to reuse it later:
```bash
git revert HEAD
git push
argocd app sync guestbook
kubectl -n guestbook get svc   # back
```

---

## Step 7 — Compare: What `prune: false` Would Have Done

Worth seeing the contrast directly. Edit the Application to disable pruning:
```bash
kubectl -n argocd patch application guestbook --type merge \
  -p '{"spec":{"syncPolicy":{"automated":{"prune":false,"selfHeal":true}}}}'
```
Repeat the `rm service.yaml` / commit / push from Step 6, then sync:
```bash
argocd app sync guestbook
argocd app get guestbook
```
Notice the Application now shows as **OutOfSync** with the Service flagged for deletion, but the UI/CLI stops short of actually deleting it — pruning has to be explicitly opted into, a deliberate safety default so a bad manifest deletion in Git doesn't silently nuke production resources. Restore `prune: true` and the file when done experimenting.

---

## Cleanup
```bash
kubectl delete -f guestbook-app.yaml
kind delete cluster --name argocd-lab
```

## What to Explore Next
- Change `guestbook-ui`'s image tag in your fork's `deployment.yaml`, push, and time how long the automated (non-manual) sync takes to pick it up versus running `argocd app sync` immediately.
- Add a second `Application` pointing at a different path/app in the same repo and view both in the ArgoCD UI's app-of-apps-style dashboard.
- Break the manifest on purpose (invalid YAML) and observe how ArgoCD surfaces the sync failure in both the CLI (`argocd app get`) and UI, without touching the previously-synced live resources.
- Try `syncOptions: [ApplyOutOfSyncOnly=true]` or a `PreSync` hook (e.g., a Job that runs a migration) to see ArgoCD's sync phases/hooks in action beyond plain apply.
