# Helm Fundamentals — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. The standard 20-question Helm screening set. 11 of the questions already have full answers elsewhere in the hub, so they're linked below. The 9 fundamentals that weren't covered are answered here. Long-form notes: [Helm](../Helm/README.md).

## Already answered elsewhere
| # | Question | Where |
|---|---|---|
| 3 | What is a Helm chart? | [29 Q9](./29-jenkins-k8s-helm-interview-rounds-qna.md) (chart layout and every file's role) |
| 5 | What is a Helm release? | [28 Q07](./28-production-scenarios-rapid-round-qna.md), [33 Q38](./33-platform-engineering-deep-dive-qna.md) (how revisions are stored as Secrets) |
| 6 | Purpose of `Chart.yaml` | [29 Q9](./29-jenkins-k8s-helm-interview-rounds-qna.md) (annotated `Chart.yaml`: `version` vs `appVersion`, dependencies) |
| 7 | Purpose of `values.yaml` | [29 Q9](./29-jenkins-k8s-helm-interview-rounds-qna.md), [28 Q07](./28-production-scenarios-rapid-round-qna.md) |
| 8 | The `templates/` directory | [29 Q9](./29-jenkins-k8s-helm-interview-rounds-qna.md) (`_helpers.tpl`, `NOTES.txt`, `tests/`), [33 Q40](./33-platform-engineering-deep-dive-qna.md) |
| 12 | Purpose of `helm rollback` | [28 Q07](./28-production-scenarios-rapid-round-qna.md) (rollback creates a new revision; what it doesn't undo), [33 Q38](./33-platform-engineering-deep-dive-qna.md) |
| 15 | Helm dependencies | [33 Q42](./33-platform-engineering-deep-dive-qna.md) (dependencies, umbrella and library charts) |
| 16 | Helm hooks | [33 Q39](./33-platform-engineering-deep-dive-qna.md) |
| 17 | Template functions | [33 Q40](./33-platform-engineering-deep-dive-qna.md) (`include`, `toYaml`, `required`, `default`, `tpl`, `lookup`, checksum annotation) |
| 19 | Overriding values during install | [33 Q37](./33-platform-engineering-deep-dive-qna.md) (precedence order), [Q10](#10-what-are-helm-values) below (`--set` syntax) |
| 20 | Managing different environments | [28 Q07](./28-production-scenarios-rapid-round-qna.md), [38 R-2](./38-vpc-terraform-grafana-linux-scenarios-qna.md), [44 Q04](./44-senior-platform-design-scenarios-qna.md) (GitOps at scale) |

Deeper Helm topics: chart testing in CI [33 Q41](./33-platform-engineering-deep-dive-qna.md), stuck `pending-upgrade` releases [33 Q38](./33-platform-engineering-deep-dive-qna.md), Helm with Argo CD [33 Q29–Q36](./33-platform-engineering-deep-dive-qna.md).

---

## Table of Contents
- Q01: [What is Helm in Kubernetes?](#01-what-is-helm-in-kubernetes)
- Q02: [Why is Helm used?](#02-why-is-helm-used)
- Q04: [What is a Helm repository?](#04-what-is-a-helm-repository)
- Q09: [What are Helm built-in objects?](#09-what-are-helm-built-in-objects)
- Q10: [What are Helm values?](#10-what-are-helm-values)
- Q11: [`helm install` vs `helm upgrade`](#11-what-is-the-difference-between-helm-install-and-helm-upgrade)
- Q13: [How do you list Helm releases?](#13-how-do-you-list-helm-releases)
- Q14: [How do you uninstall a Helm release?](#14-how-do-you-uninstall-a-helm-release)
- Q18: [What is the purpose of `helm lint`?](#18-what-is-the-purpose-of-helm-lint)

(Numbers follow the original question list; the gaps are the questions linked above.)

---

### 01. What is Helm in Kubernetes?
Helm is the **package manager for Kubernetes**, comparable to `apt`/`yum` for Linux or `npm` for Node. It's a CNCF graduated project and a client-side CLI (no in-cluster server since Helm 3 removed Tiller).

Three core ideas:
- **Chart**: a package of templated Kubernetes manifests plus default configuration.
- **Values**: the configuration you pass in to customise the chart for a given install.
- **Release**: one installed instance of a chart in a cluster, with a numbered revision history.

`helm install` renders the chart's templates with your values into plain Kubernetes YAML, sends it to the API server, and records the release (as a Secret in the release namespace) so it can later be upgraded, rolled back or uninstalled as one unit.

---

### 02. Why is Helm used?
Without Helm, an application is a pile of YAML files (Deployment, Service, Ingress, ConfigMap, HPA, ServiceAccount…) copied and hand-edited per environment. Helm fixes that:
| Problem | What Helm gives you |
|---|---|
| Same app, different config per environment | **Templating**: one chart, different values files for dev/staging/prod |
| Many related objects to apply in the right way | **Packaging**: the whole app is installed, upgraded and removed as one release |
| "What's deployed, and what was before?" | **Release history and rollback**: `helm history`, `helm rollback` |
| Installing third-party software (ingress-nginx, cert-manager, Prometheus, databases) | **Sharing**: public charts from repositories / Artifact Hub, installed with one command |
| An app needs other components | **Dependencies**: subcharts declared in `Chart.yaml` |
| Lifecycle tasks (DB migration before upgrade) | **Hooks** |
| Versioning | Charts are versioned with SemVer and published to registries |

**When it's not the best fit:** simple apps where Kustomize overlays are enough, or teams that find Go templating hard to review. Many teams combine them: Helm for third-party software, Kustomize or plain manifests for their own apps, and GitOps (Argo CD/Flux) running either.

---

### 04. What is a Helm repository?
A place where packaged charts (`.tgz`) are stored and shared. Two kinds:

**1. Classic HTTP repository**: any web server hosting the chart packages plus an `index.yaml` that lists every chart and version (ChartMuseum, Harbor, Nexus, Artifactory, GitHub Pages, S3).
```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update                       # refresh the local copy of each repo's index.yaml
helm repo list
helm search repo nginx                 # search added repos
helm search hub prometheus             # search Artifact Hub (public catalogue)
helm install web bitnami/nginx --version 18.1.0
```

**2. OCI registry** (now the recommended way): charts are stored as OCI artifacts in a container registry, next to your images (ECR, ACR, Artifact Registry, GHCR, Docker Hub, Harbor). No `repo add` and no `index.yaml`:
```bash
helm package ./orders                                   # -> orders-1.4.0.tgz
helm registry login 123456789012.dkr.ecr.ap-south-1.amazonaws.com
helm push orders-1.4.0.tgz oci://123456789012.dkr.ecr.ap-south-1.amazonaws.com/charts
helm install orders oci://123456789012.dkr.ecr.ap-south-1.amazonaws.com/charts/orders --version 1.4.0
```
OCI benefits: one registry and one set of credentials and permissions for images and charts, and signing with cosign.

Good practice: **always pin `--version`** (otherwise you get whatever the latest is), mirror third-party charts into your own registry, and treat charts like any other dependency (review upgrades, scan rendered output).

---

### 09. What are Helm built-in objects?
Objects Helm passes into every template, accessed from the top-level context `.`:
| Object | Common fields | Example use |
|---|---|---|
| `.Values` | Everything from `values.yaml`, `-f` files and `--set` | `{{ .Values.image.tag }}` |
| `.Release` | `.Name`, `.Namespace`, `.Revision`, `.IsInstall`, `.IsUpgrade`, `.Service` (`"Helm"`) | Resource names: `{{ .Release.Name }}-api`; label `app.kubernetes.io/instance` |
| `.Chart` | Contents of `Chart.yaml`: `.Name`, `.Version`, `.AppVersion` (note the capitals) | `helm.sh/chart` label; default image tag `{{ .Values.image.tag \| default .Chart.AppVersion }}` |
| `.Capabilities` | `.KubeVersion` (`.Version`, `.Minor`), `.APIVersions.Has "..."`, `.HelmVersion` | Pick an API version depending on the cluster: `{{ if .Capabilities.APIVersions.Has "autoscaling/v2" }}` |
| `.Template` | `.Name` (current file path), `.BasePath` | Checksum annotation: `include (print $.Template.BasePath "/configmap.yaml") .` |
| `.Files` | `.Get`, `.Glob`, `.Lines`, `.AsConfig`, `.AsSecrets` | Load non-template files from the chart into a ConfigMap: `{{ (.Files.Glob "config/*").AsConfig \| nindent 2 }}` |
| `.Subcharts` | Access subcharts' scope | Rarely needed |

**Scope gotcha:** inside `range` or `with`, `.` changes to the current item. Use **`$`** for the root context, e.g. `{{ $.Release.Name }}` inside a loop.

---

### 10. What are Helm values?
Values are the **configuration inputs** of a chart, a YAML tree the templates read through `.Values`. The chart's `values.yaml` holds defaults; users override what they need at install/upgrade time.

```yaml
# values.yaml (defaults)
replicaCount: 2
image:
  repository: ghcr.io/acme/orders
  tag: ""                # empty -> template falls back to .Chart.AppVersion
resources:
  requests: { cpu: 100m, memory: 256Mi }
ingress:
  enabled: false
```
```yaml
# templates/deployment.yaml (excerpt)
replicas: {{ .Values.replicaCount }}
image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
resources:
  {{- toYaml .Values.resources | nindent 2 }}
```

**Ways to set them** (later wins; full precedence in [33 Q37](./33-platform-engineering-deep-dive-qna.md)):
```bash
helm install orders ./orders \
  -f values-prod.yaml \
  --set replicaCount=5 \
  --set image.tag=2.7.1 \
  --set 'ingress.hosts[0].host=orders.acme.io' \
  --set-string build.id=0123 \
  --set-file 'config\.json=./config.json' \
  --set-json 'tolerations=[{"key":"spot","operator":"Exists"}]'
```
- `-f`: values file(s); several are allowed, and the last one wins.
- `--set a.b=c`: single values; dots for nested keys, `[0]` for list items (quote it so the shell doesn't glob).
- `--set-string`: forces a string (otherwise `0123`, `true`, `5` are converted to numbers/booleans).
- `--set-file`: the value is a file's contents (escape dots that are part of the key name with `\.`).
- `--set-json`: a JSON value, handy for lists of objects.

**Things worth knowing:**
- **Subchart values** go under the subchart's name (`postgresql.auth.database: orders`); **`global:`** values are visible to the parent and all subcharts.
- Setting a key to `null` removes a default (e.g. drop a default `nodeSelector`).
- **`values.schema.json`** validates types and required fields at install, upgrade, lint and template time, so typos fail fast instead of being silently ignored.
- Check what a release is actually using: `helm get values orders` (user-supplied) or `helm get values orders --all` (computed, including defaults).
- **Never put secrets in values files committed to Git**; use External Secrets, Sealed Secrets or SOPS + `helm-secrets`.

---

### 11. What is the difference between `helm install` and `helm upgrade`?
| | `helm install` | `helm upgrade` |
|---|---|---|
| Purpose | Create a **new** release | Change an **existing** release (new chart version, new values, or both) |
| Release must… | Not exist (error: `cannot re-use a name that is still in use`) | Exist (error: `has no deployed releases`), unless `--install` |
| Revision | Starts at 1 | Increments (2, 3, …); each revision is kept for rollback |
| How it applies | Creates all objects | **Three-way merge** of old manifest, new manifest and live state, so only what changed is patched; resources removed from the chart are deleted |
| Hooks | `pre-install` / `post-install` | `pre-upgrade` / `post-upgrade` |

**In CI/CD, use one idempotent command for both:**
```bash
helm upgrade --install orders ./orders -n prod --create-namespace \
  -f values-prod.yaml --set image.tag=$GIT_SHA \
  --atomic --wait --timeout 10m        # Helm 4: --rollback-on-failure instead of --atomic
```
- `--wait` waits until Deployments are rolled out and Pods Ready before marking the release successful.
- `--atomic` (Helm 3) / `--rollback-on-failure` (Helm 4) rolls back automatically if it doesn't become healthy in time.

**Values gotcha on upgrade:** if you pass **no** values, Helm reuses the previous release's values. If you pass **any** `-f`/`--set`, it starts from the chart's defaults plus only what you passed now, so earlier `--set` overrides are silently dropped. `--reuse-values` merges with the previous values (but can miss new defaults added in a chart upgrade); `--reset-then-reuse-values` resets to the new chart defaults then applies the previous overrides. The safest habit: always pass the full set of values files explicitly, from Git.

---

### 13. How do you list Helm releases?
```bash
helm list                          # releases in the current namespace (alias: helm ls)
helm list -n prod                  # a specific namespace
helm list -A                       # all namespaces
helm list -a                       # all statuses (by default only deployed and failed are shown)
helm list --pending                # stuck in pending-install / pending-upgrade / pending-rollback
helm list --failed
helm list --uninstalled            # uninstalled with --keep-history
helm list -A -o json | jq '.[] | {name, namespace, chart, app_version, status}'
```
Output columns: NAME, NAMESPACE, REVISION, UPDATED, STATUS, CHART (name-version), APP VERSION.

Then drill into one release:
```bash
helm status orders -n prod         # status, last deployment time, NOTES
helm history orders -n prod        # every revision: status, chart, description
helm get values orders -n prod     # user-supplied values (--all for computed)
helm get manifest orders -n prod   # the exact rendered YAML that was applied
```
Behind the scenes these read the release Secrets, so you can also see them with `kubectl get secrets -n prod -l owner=helm`.

---

### 14. How do you uninstall a Helm release?
```bash
helm uninstall orders -n prod                  # remove all resources and the release history
helm uninstall orders -n prod --keep-history   # keep release records (status: uninstalled), so `helm rollback` can restore it
helm uninstall orders -n prod --dry-run        # show what would happen
helm uninstall orders -n prod --wait           # wait until resources are actually deleted
```
`pre-delete` and `post-delete` hooks run (skip with `--no-hooks`).

**What is not removed** (common interview follow-up):
- **CRDs** installed from the chart's `crds/` directory, deliberately, because deleting a CRD deletes every custom resource of that type cluster-wide.
- **PVCs created by StatefulSet `volumeClaimTemplates`**: they aren't part of the release manifest, so the data stays. Delete them manually if you mean to.
- Resources annotated **`helm.sh/resource-policy: keep`**.
- The **namespace**, even if created with `--create-namespace`.
- Resources created at runtime by operators or controllers (e.g. cloud load balancers usually go when their Service is deleted, but anything an operator created outside the release may remain).

In GitOps setups, remove the app from Git (or delete the Argo CD Application with cascading deletion) instead of running `helm uninstall` by hand, otherwise the GitOps controller reinstalls it.

---

### 18. What is the purpose of `helm lint`?
`helm lint` is a **static check of a chart** before you package or deploy it. It:
- Validates `Chart.yaml` (required fields, valid SemVer `version`, valid `apiVersion`).
- **Renders the templates** with the chart's values (plus any `-f`/`--set` you pass) and reports template errors: unknown functions, bad syntax, missing required values (`required`), nil pointer errors on missing keys.
- Checks the rendered output is **valid YAML**.
- Validates values against **`values.schema.json`**, if present.
- Reports by severity: `[ERROR]` (fails), `[WARNING]`, `[INFO]` (e.g. "icon is recommended").

```bash
helm lint ./orders
helm lint ./orders -f values-prod.yaml --strict      # lint with prod values; warnings become errors
helm lint ./orders --with-subcharts
```

**What it doesn't do:** it doesn't check the output against the **Kubernetes API schema** (a misspelled field such as `replica:` passes) and doesn't talk to a cluster. In CI, pair it with:
```bash
helm template orders ./orders -f values-prod.yaml | kubeconform -strict -summary   # K8s schema validation
helm template orders ./orders -f values-prod.yaml | conftest test -                # policy (OPA)
helm diff upgrade orders ./orders -f values-prod.yaml -n prod                      # plugin: exact change to live
```
Lint each environment's values file, not just the defaults, since most template bugs only show up with a particular combination of values. (More on chart CI: [33 Q41](./33-platform-engineering-deep-dive-qna.md).)
