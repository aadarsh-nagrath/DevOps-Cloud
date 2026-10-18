# Helm Examples: Real-World Installs

> Part of the [Helm notes](./README.md). Practical, copy-paste examples of installing and running common platform components with Helm. Every example pins a chart version: check the latest with `helm search repo <chart> --versions` before you use it.

---

## 0. The pattern every install follows

```bash
helm repo add <repo> <url> && helm repo update            # or use an oci:// URL directly
helm show values <repo>/<chart> --version X > defaults.yaml   # read the knobs first
vim values-<env>.yaml                                     # override only what you need
helm upgrade --install <release> <repo>/<chart> --version X \
  -n <namespace> --create-namespace -f values-<env>.yaml --wait --timeout 10m
helm status <release> -n <namespace>
```
Keep `values-<env>.yaml` in Git. That file *is* your configuration.

---

## 1. Demo app: podinfo (OCI chart)

A small, well-maintained demo app with a good chart, ideal for practising.

```bash
helm install demo oci://ghcr.io/stefanprodan/charts/podinfo --version 6.7.1 \
  -n demo --create-namespace \
  --set replicaCount=2 \
  --set ingress.enabled=false

helm list -n demo
kubectl -n demo port-forward svc/demo-podinfo 9898:9898 &
curl -s localhost:9898 | head

# change config: revision 2
helm upgrade demo oci://ghcr.io/stefanprodan/charts/podinfo --version 6.7.1 -n demo \
  --set replicaCount=3 --set ui.message="hello from helm"
helm history demo -n demo
helm rollback demo 1 -n demo
helm uninstall demo -n demo
```

---

## 2. cert-manager (CRDs + controller)

```bash
helm repo add jetstack https://charts.jetstack.io && helm repo update
helm upgrade --install cert-manager jetstack/cert-manager --version v1.16.1 \
  -n cert-manager --create-namespace \
  --set crds.enabled=true \
  --wait
kubectl get pods -n cert-manager
```
`crds.enabled=true` installs the CRDs as normal templates, so **they're upgraded with the chart** (older chart versions used `installCRDs=true`). Many teams prefer to install CRDs separately, see [Advanced Helm → CRDs](./advanced-helm.md#crds).

A ClusterIssuer that uses it (plain manifest, applied after the chart):
```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata: { name: letsencrypt-prod }
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: platform@corp.com
    privateKeySecretRef: { name: letsencrypt-prod }
    solvers:
      - http01: { ingress: { ingressClassName: nginx } }
```

---

## 3. Monitoring stack: kube-prometheus-stack

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts && helm repo update
helm show values prometheus-community/kube-prometheus-stack > kps-defaults.yaml   # ~5,000 lines: search, don't read
```
```yaml
# values-monitoring-prod.yaml
grafana:
  adminPassword: ""                    # don't set here; use an existing secret
  admin:
    existingSecret: grafana-admin
  ingress:
    enabled: true
    ingressClassName: nginx
    hosts: [grafana.corp.com]
prometheus:
  prometheusSpec:
    retention: 15d
    resources:
      requests: { cpu: "1", memory: 4Gi }
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: gp3
          resources: { requests: { storage: 100Gi } }
    serviceMonitorSelectorNilUsesHelmValues: false   # pick up ServiceMonitors from all releases
alertmanager:
  config:
    route: { receiver: slack, group_by: [alertname, namespace] }
    receivers:
      - name: slack
        slack_configs: [{ api_url_file: /etc/alertmanager/secrets/slack/url, channel: "#alerts" }]
```
```bash
helm upgrade --install mon prometheus-community/kube-prometheus-stack --version 65.1.0 \
  -n monitoring --create-namespace -f values-monitoring-prod.yaml --wait --timeout 15m
```
This chart ships many CRDs (Prometheus, ServiceMonitor, PrometheusRule). On major version upgrades, read its upgrade notes, which often say to apply new CRDs first with `kubectl apply --server-side`.

---

## 4. Argo CD

```bash
helm repo add argo https://argoproj.github.io/argo-helm && helm repo update
helm upgrade --install argocd argo/argo-cd --version 7.6.12 \
  -n argocd --create-namespace \
  --set configs.params."server\.insecure"=true \
  --set server.ingress.enabled=true \
  --set server.ingress.ingressClassName=nginx \
  --set server.ingress.hostname=argocd.corp.com \
  --wait
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo
```
Note the escaped dot in `server\.insecure`: the key itself contains a dot. After this, Argo CD can manage its own Helm chart (app-of-apps), so later upgrades go through Git.

---

## 5. Your own app: one chart, three environments

```plaintext
deploy/
├── values.yaml
├── values-dev.yaml
├── values-uat.yaml
└── values-prod.yaml
```
```yaml
# values.yaml: shared defaults
image: { repository: registry.corp/payments }
service: { port: 80 }
resources:
  requests: { cpu: 100m, memory: 128Mi }
  limits:   { memory: 256Mi }
```
```yaml
# values-dev.yaml
replicaCount: 1
config: { LOG_LEVEL: debug }
ingress: { enabled: true, host: payments.dev.corp.com }
```
```yaml
# values-prod.yaml
replicaCount: 4
autoscaling: { enabled: true, minReplicas: 4, maxReplicas: 20 }
config: { LOG_LEVEL: warn }
ingress: { enabled: true, host: payments.corp.com, tls: true }
resources:
  requests: { cpu: 500m, memory: 512Mi }
  limits:   { memory: 1Gi }
```
```bash
for env in dev uat prod; do
  helm template payments ./chart -f deploy/values.yaml -f deploy/values-$env.yaml > /tmp/$env.yaml
done
diff /tmp/dev.yaml /tmp/prod.yaml | less          # see exactly how environments differ

helm upgrade --install payments ./chart -n payments-dev  --create-namespace -f deploy/values.yaml -f deploy/values-dev.yaml  --set-string image.tag=$SHA --wait
helm upgrade --install payments ./chart -n payments-prod --create-namespace -f deploy/values.yaml -f deploy/values-prod.yaml --set-string image.tag=$SHA --wait --rollback-on-failure
```
Same release name in different namespaces is fine: release names are unique **per namespace**.

---

## 6. Blue/green with two releases

```bash
helm upgrade --install web-green ./chart -n web -f values-prod.yaml --set-string image.tag=2.0.0 --wait
# test web-green through its own Service / preview hostname, then switch traffic:
kubectl -n web patch svc web --type merge -p '{"spec":{"selector":{"app.kubernetes.io/instance":"web-green"}}}'
# keep web-blue for a quick rollback, then remove it later:
helm uninstall web-blue -n web
```
(For canaries, use Argo Rollouts or Gateway API weights rather than Helm. Helm releases are all-or-nothing.)

---

## 7. Mirror a third-party chart into your private registry

Banks and air-gapped environments shouldn't pull charts from the internet at deploy time:
```bash
helm pull jetstack/cert-manager --version v1.16.1                     # → cert-manager-v1.16.1.tgz
helm push cert-manager-v1.16.1.tgz oci://registry.corp/charts-mirror  # into Harbor/ECR/Artifactory
# images referenced by the chart must be mirrored too:
helm template cm cert-manager-v1.16.1.tgz --set crds.enabled=true | grep -oE 'image: "?[^" ]+' | sort -u
# then install only from your registry, with image overrides:
helm upgrade --install cert-manager oci://registry.corp/charts-mirror/cert-manager --version v1.16.1 \
  -n cert-manager --create-namespace --set crds.enabled=true \
  --set image.repository=registry.corp/jetstack/cert-manager-controller
```

---

## 8. Debug a failed upgrade end to end

```bash
$ helm upgrade payments ./chart -n prod -f values-prod.yaml --set-string image.tag=bad --wait --timeout 2m
Error: UPGRADE FAILED: ...      # after 2m: the new pods never became ready (exact wording varies by Helm version)

$ helm history payments -n prod | tail -2
5   ...  deployed   payments-1.4.2  ...  Upgrade complete
6   ...  failed     payments-1.4.2  ...  Upgrade "payments" failed: ...

$ kubectl -n prod get pods -l app.kubernetes.io/instance=payments
payments-7c9f...   0/1   ImagePullBackOff   ...

$ helm rollback payments 5 -n prod --wait      # creates revision 7 = revision 5
$ helm history payments -n prod | tail -1
7   ...  deployed   payments-1.4.2  ...  Rollback to 5
```
With `--rollback-on-failure` (Helm 3: `--atomic`) on the upgrade, the rollback would have happened automatically.

---

## 9. Inspect what a release actually is

```bash
helm get values payments -n prod             # what was overridden
helm get values payments -n prod --all       # everything, merged
helm get manifest payments -n prod | less    # rendered YAML that Helm applied
helm get manifest payments -n prod | kubectl diff -f -   # drift: live vs Helm (empty = no drift)
kubectl get secret -n prod -l owner=helm,name=payments   # the release records
# decode a release record (it's base64(gzip(json))) — for curiosity / deep debugging:
kubectl get secret sh.helm.release.v1.payments.v7 -n prod -o jsonpath='{.data.release}' \
  | base64 -d | base64 -d | gunzip | jq '.info, .chart.metadata.version, .config'
```
