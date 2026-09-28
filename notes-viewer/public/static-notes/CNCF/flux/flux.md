# Flux — Complete Notes

## 1. Beginner

### What is Flux?
- **Flux CD (v2)** is a **GitOps continuous delivery** tool for Kubernetes — CNCF **graduated** project.
- Same core idea as Argo CD (see [Argo CD notes](../../Continuous%20Delivery/ArgoCD/Argo-cd.md)): Git is the source of truth for what should be running in the cluster, and a controller running *inside* the cluster continuously pulls and reconciles the live state to match Git — the GitOps "pull model," the opposite of a CI pipeline pushing `kubectl apply` from outside.
- Built by Weaveworks, now a CNCF project maintained by a broad set of vendors (including a deep integration partnership with GitHub for Flux-based deployment workflows).

### The Core Problem It Solves
```
Without GitOps:
  CI pipeline --kubectl apply/helm upgrade--> Cluster
  (pipeline needs cluster credentials, no continuous drift detection,
   "what's actually running" can silently diverge from Git)

With Flux:
  Git repo (desired state) <--pull-- [Flux controllers, running in-cluster]
                                              |
                                              v
                                         Cluster (actual state)
  Controllers continuously reconcile actual -> desired, self-healing any drift.
```
No CI system needs cluster credentials. The cluster pulls its own configuration and keeps re-applying it — if someone manually edits a Deployment with `kubectl edit`, Flux reverts it back to what Git says on the next reconcile loop.

### Core Architecture — The GitOps Toolkit
Flux is not one monolithic binary — it's a set of small, composable Kubernetes controllers, each with its own CRDs, collectively called the **GitOps Toolkit**:
```
 [Git repo] --+
 [Helm repo] -+--> [source-controller]  --produces--> Artifact (tarball, tracked by CRD status)
 [OCI repo] --+                                              |
                                                               v
                                        +----------------------+----------------------+
                                        |                                             |
                              [kustomize-controller]                          [helm-controller]
                              reconciles plain YAML /                          reconciles HelmRelease
                              Kustomize overlays into                          CRDs (installs/upgrades
                              the cluster                                      Helm charts)
                                        |                                             |
                                        +----------------------+----------------------+
                                                               v
                                                          [Kubernetes API]

        [image-reflector-controller] --scans registries--> [image-automation-controller]
                    (finds new tags)                          (commits new tags back to Git)
```
- **source-controller**: the only controller that talks to external sources (Git, Helm repos, OCI registries, S3-compatible buckets). Produces a versioned `Artifact` that other controllers consume — decouples "fetching" from "applying."
- **kustomize-controller**: reconciles plain Kubernetes manifests / Kustomize overlays from a `Source` into the cluster.
- **helm-controller**: reconciles `HelmRelease` objects — installs/upgrades Helm charts declaratively.
- **image-reflector-controller** + **image-automation-controller**: scan container registries for new image tags matching a policy, then automatically commit an updated tag back to Git — closing the loop for automated image updates.
- **notification-controller**: sends events (Slack, Teams, webhooks) and can receive webhooks to trigger faster reconciliation.

### Core Concepts
| Term | Meaning |
|---|---|
| **Source** | A `GitRepository`, `HelmRepository`, `OCIRepository`, or `Bucket` CRD — declares *where* to pull config from |
| **Kustomization** (Flux CRD, not the plain `kustomization.yaml`) | Declares *what* to reconcile from a Source into the cluster, and how often |
| **HelmRelease** | Declares a Helm chart + values to install/upgrade, sourced from a `HelmRepository`/`OCIRepository` |
| **Reconciliation** | The continuous loop: fetch latest from Source, diff against cluster, apply changes, repeat on an interval |
| **Drift detection / self-healing** | If live cluster state diverges from Git (manual edit, another controller), the next reconcile reverts it |
| **Bootstrap** | The one-time process of installing Flux controllers into a cluster and pointing them at a Git repo, itself done via GitOps (Flux commits its own manifests into the repo it manages) |

### Basic Kustomization Example
```yaml
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
  interval: 5m
  sourceRef:
    kind: GitRepository
    name: podinfo
  path: "./kustomize"
  prune: true
  targetNamespace: default
```
`prune: true` means Flux deletes resources from the cluster that were removed from the Git path — keeps the cluster exactly matching Git, not just a superset.

---

## 2. Intermediate

### The `flux bootstrap` Workflow
Bootstrapping installs Flux's controllers and wires them to a Git repo in one command — and the resulting Flux manifests are themselves committed to that repo, so Flux manages its own installation via GitOps from day one:
```bash
flux bootstrap github \
  --owner=aadarsh-nagrath \
  --repository=fleet-infra \
  --branch=main \
  --path=clusters/my-cluster \
  --personal
```
This creates `clusters/my-cluster/flux-system/` in the repo containing the controller manifests, a deploy key is registered with GitHub automatically, and Flux starts reconciling from that path immediately.

### HelmRelease Example
```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: podinfo
  namespace: flux-system
spec:
  interval: 1h
  url: https://stefanprodan.github.io/podinfo
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: podinfo
  namespace: default
spec:
  interval: 10m
  chart:
    spec:
      chart: podinfo
      version: '6.x'
      sourceRef:
        kind: HelmRepository
        name: podinfo
        namespace: flux-system
  values:
    replicaCount: 2
```

### Image Automation (First-Class in Flux)
```yaml
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImageRepository
metadata:
  name: podinfo
spec:
  image: ghcr.io/stefanprodan/podinfo
  interval: 5m
---
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImagePolicy
metadata:
  name: podinfo
spec:
  imageRepositoryRef:
    name: podinfo
  policy:
    semver:
      range: '>=6.0.0'
---
apiVersion: image.toolkit.fluxcd.io/v1beta1
kind: ImageUpdateAutomation
metadata:
  name: flux-system
spec:
  interval: 1m
  sourceRef:
    kind: GitRepository
    name: flux-system
  git:
    checkout:
      ref:
        branch: main
    commit:
      author:
        email: fluxcdbot@users.noreply.github.com
        name: fluxcdbot
    push:
      branch: main
  update:
    path: "./clusters/my-cluster"
    strategy: Setters
```
This is Flux automatically committing a bumped image tag back into Git when a new image matching the policy is pushed to the registry — Git stays the single source of truth even for automated changes, unlike a system that would update the cluster directly.

### Multi-Tenancy Approach
- Flux favors **many small `Kustomization`/`GitRepository` objects**, one set per team/tenant, each scoped with `spec.serviceAccountName` to restrict what that reconciliation is allowed to touch (via RBAC on that ServiceAccount).
- Tenants can own their own Git repos; a platform team's root `Kustomization` references each tenant repo as its own `Source`, keeping reconciliation boundaries clean without one shared giant manifest tree.

### CLI-Centric Operations
```bash
flux get sources git
flux get kustomizations
flux get helmreleases -A
flux logs --follow --level=error
flux reconcile kustomization podinfo --with-source
flux suspend kustomization podinfo    # pause reconciliation
flux resume kustomization podinfo
```

---

## 3. Advanced

### Flux vs Argo CD
| Dimension | Flux CD | Argo CD |
|---|---|---|
| **Architecture philosophy** | Composable controllers (GitOps Toolkit) — source, kustomize, helm, image automation are separate CRDs/controllers you wire together | More monolithic single `Application` CRD/controller handling source + sync + health in one object |
| **UI** | No built-in UI by default — CLI-first (`flux get`, `flux logs`); Weave GitOps or third-party dashboards can be layered on | Built-in web UI out of the box, showing app tree, diffs, sync status visually |
| **Image automation** | First-class, built into the toolkit (`image-reflector-controller`, `image-automation-controller`) | Not built in — needs a separate tool (e.g., Argo CD Image Updater) |
| **Multi-tenancy** | Many small scoped CRDs (`Kustomization` per tenant) + ServiceAccount-based RBAC | `AppProject` CRD provides tenancy boundaries within a more centralized model |
| **Extensibility model** | Toolkit controllers are individually composable/replaceable | Ecosystem of plugins (Argo CD, Rollouts, Workflows, Events) integrated but each is its own install |
| **Learning curve** | More CRDs to learn up front (`GitRepository`, `Kustomization`, `HelmRelease`, `ImagePolicy`...) | Fewer core concepts to start (`Application`), UI helps discoverability |
| **Underlying model** | Same GitOps pull model | Same GitOps pull model |

Both are CNCF graduated, both solve the same fundamental problem (declarative, Git-sourced, continuously reconciled deployments) — the choice is largely about UI preference, whether you want image automation built-in, and how you want tenancy structured. See the full [Argo CD write-up](../../Continuous%20Delivery/ArgoCD/Argo-cd.md) for the Argo-side model in depth.

### Reconciliation Internals
- Every controller runs its own reconcile loop on its own `interval` — a `GitRepository` might poll every 1 minute while its `Kustomization` reconciles every 5 minutes; they're decoupled, which is part of the composability tradeoff (more moving parts, but each piece independently tunable/scalable).
- Webhooks via `notification-controller` can trigger an immediate reconcile on a Git push instead of waiting for the next poll interval — bridges the pull model back to push-triggered responsiveness without giving CI direct cluster access.

### Drift Detection and Self-Healing in Practice
- Every reconcile computes a diff between the rendered manifests and live cluster state (via server-side apply) and re-applies anything that's drifted — this is continuous, not just on Git change.
- `spec.prune: true` on a `Kustomization` means resources removed from Git are deleted from the cluster on the next reconcile — critical to actually keeping cluster state a strict mirror of Git, not just additive.

### Security
- Flux supports **Cosign/Sigstore image verification** at the `OCIRepository`/`ImagePolicy` level — refuse to deploy unsigned or improperly signed images.
- Git access uses deploy keys or app tokens scoped to read (and, for image automation, write) — no broad cluster-admin credentials handed to external CI systems, since the pull happens from inside the cluster.
- `Kustomization.spec.serviceAccountName` scopes exactly what a given reconciliation is allowed to apply via RBAC — critical for multi-tenant clusters where one team's `Kustomization` must not be able to touch another's namespace.

### Failure Modes / Debugging
| Symptom | Likely Cause |
|---|---|
| `Kustomization` stuck `Progressing` | Check `flux logs` — often a missing CRD, an unready dependency (`dependsOn`), or a manifest that fails a dry-run apply |
| Changes in Git not appearing in cluster | Check `flux get sources git` — source may be failing to fetch (bad credentials, branch renamed); check `.status.conditions` |
| Image automation not bumping tags | `ImagePolicy` regex/semver range may not match new tags, or `ImageUpdateAutomation` lacks write access to the Git repo |
| Manual `kubectl edit` keeps reverting | Working as intended — that's drift correction; make the change in Git instead |

### Integration with Other CNCF Tools
- Works alongside **Flagger** (progressive delivery/canary releases, also from the Flux ecosystem lineage) for automated canary rollouts driven by metrics.
- Commonly paired with **Kustomize** natively (not just compatible — `kustomize-controller` *is* a Kustomize-aware reconciler) and with **Helm** via `helm-controller`.
- Notification events integrate with Prometheus Alertmanager / Slack / generic webhooks via `notification-controller` for observability of the GitOps pipeline itself.

---

## Quick Revision — Flux
- GitOps CD for Kubernetes — pull model, controllers inside the cluster reconcile Git (desired) against cluster (actual). CNCF graduated, close cousin of Argo CD.
- Architecture is **composable controllers** (GitOps Toolkit), not one monolith: source-controller (fetch), kustomize-controller / helm-controller (apply), image-reflector/image-automation-controller (auto image bumps).
- Core CRDs: `GitRepository`/`HelmRepository`/`OCIRepository` (Source), `Kustomization` (apply plain manifests), `HelmRelease` (apply Helm charts).
- `flux bootstrap` installs Flux and commits its own manifests to the target repo — self-managing via GitOps from install time.
- Image automation is first-class in Flux (not in Argo CD by default) — `ImagePolicy` + `ImageUpdateAutomation` auto-commit new tags back to Git.
- No built-in UI by default (CLI-first: `flux get`, `flux logs`, `flux reconcile`) — contrast with Argo CD's built-in web UI.
- `prune: true` + continuous reconcile = drift correction/self-healing; manual `kubectl edit` gets reverted.
- Multi-tenancy via many scoped `Kustomization`/ServiceAccount + RBAC pairs rather than one centralized `AppProject`-style construct.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
