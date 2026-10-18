# ⎈ Helm

The package manager for Kubernetes: charts, templating, releases, and how to run it in production. These notes go from zero to production-grade. Each chart example was checked with `helm lint` and `helm template` on Helm v4.2, and Helm 3 differences are called out where they matter.

## Learning path

| # | Note | What you'll learn |
|---|---|---|
| 1 | [Fundamentals & Architecture](./helm.md) | What Helm is, charts/values/releases/revisions, client-only architecture, where release state lives, the install/upgrade flow, 3-way merge vs server-side apply, Helm 2 vs 3 vs 4, installing Helm, chart sources (repos, OCI) |
| 2 | [Chart Structure](./chart-structure.md) | Every file in a chart: `Chart.yaml` fields, `values.yaml`, value precedence, `values.schema.json`, `templates/`, `_helpers.tpl`, `NOTES.txt`, tests, `charts/`, `crds/`, `.helmignore`, `Chart.lock`, built-in objects |
| 3 | [Templating](./templating.md) | Go templates + Sprig: pipelines, functions, whitespace control, `if`/`with`/`range`, `$` scope, variables, `define`/`include`, `toYaml`/`nindent`, `required`/`fail`, `tpl`, `.Files`, checksum restarts, `.Capabilities`, `lookup`, common mistakes, an exercise |
| 4 | [Commands](./helm-commands.md) | The full CLI: repos, OCI registries, search/show/pull, install/upgrade flags and `--set` gotchas, inspecting releases, history/rollback, uninstall, lint/template/package, dependencies, tests, plugins, env vars, Helm 4 flag changes |
| 5 | [Creating a Chart (hands-on)](./creating-helm-chart.md) | Build a production-style chart step by step: helpers, ConfigMap, Deployment, Service, Ingress, HPA, PDB, migration hook, test, schema, env values, unit tests, packaging to OCI, CI pipeline, checklist |
| 6 | [Advanced Helm](./advanced-helm.md) | Dependencies and value scoping (`global`, `condition`, `alias`, `import-values`), library charts, hooks in depth, CRD strategies, `resource-policy: keep`, adopting resources, post-renderers, plugins, secrets, signing (PGP/cosign), starters, Helmfile, release storage limits |
| 7 | [Helm in Production](./helm-in-production.md) | Repo layouts, push-based CI/CD, GitOps with Argo CD and Flux, security, a troubleshooting table of real errors, Helm 3 → 4 migration, best practices |
| 8 | [Real-World Examples](./helm-eg.md) | podinfo, cert-manager, kube-prometheus-stack, Argo CD, multi-environment apps, blue/green, mirroring charts for air-gapped clusters, debugging a failed upgrade, decoding release records |
| 9 | [Helm vs Kustomize](./helm-vs-kustomize.md) | Templating vs overlays, the same change both ways, Kustomize features, pros and cons, combining them, a decision guide |

## Related notes

- [Argo CD + Helm Integration](../argo-cd-integration-helm.md)
- [CKA Helm resources](../CKA/Resources/Helm/readme.md)
- Interview questions: [Platform Engineering Deep Dive Q37–42 (Helm)](../Interview%20Questions/33-platform-engineering-deep-dive-qna.md#helm-advanced), [Jenkins, K8s & Helm rounds Q9](../Interview%20Questions/29-jenkins-k8s-helm-interview-rounds-qna.md), [Production scenarios Q07](../Interview%20Questions/28-production-scenarios-rapid-round-qna.md)

## One-page cheat sheet

```bash
# find & inspect
helm repo add NAME URL && helm repo update
helm search repo KEYWORD --versions
helm show values REPO/CHART --version X > defaults.yaml

# deploy (idempotent, CI-safe)
helm upgrade --install REL CHART --version X -n NS --create-namespace \
  -f values.yaml -f values-prod.yaml --set-string image.tag=$SHA \
  --wait --rollback-on-failure --timeout 10m        # Helm 3: --atomic

# inspect
helm list -A
helm status REL -n NS
helm get values REL -n NS --all
helm get manifest REL -n NS

# history & rollback
helm history REL -n NS
helm rollback REL REVISION -n NS --wait

# develop
helm create CHART
helm lint ./CHART --strict
helm template REL ./CHART -f values.yaml --debug
helm package ./CHART && helm push CHART-X.tgz oci://REGISTRY/charts
helm dependency update ./CHART

# remove
helm uninstall REL -n NS
```
