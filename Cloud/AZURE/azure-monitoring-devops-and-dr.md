# Azure Monitoring, DevOps & Disaster Recovery — Complete Notes

> Part of the [Azure overview](./azure.md).

---

## 1. Azure Monitor (the umbrella)
| Component | What |
|---|---|
| **Metrics** | Numeric time series (platform metrics free, 93-day retention), near real-time, metric alerts, autoscale input |
| **Logs** → **Log Analytics workspace** | Central log store queried with **KQL**; tables (Heartbeat, Perf, Syslog, AzureDiagnostics, ContainerLogV2, AppRequests…); retention & archive; table plans (Analytics / Basic / Auxiliary) for cost |
| **Activity Log** | Subscription-level control-plane events (who created/deleted what) — 90 days, export via diagnostic settings |
| **Diagnostic settings** | Route resource logs/metrics → Log Analytics / Storage / Event Hubs (enforce with Policy `DeployIfNotExists`) |
| **Azure Monitor Agent (AMA)** + **Data Collection Rules (DCR)** | Collect VM/Arc guest logs & perf (replaces legacy MMA/Log Analytics agent) |
| **Application Insights** | APM: requests, dependencies, exceptions, traces, availability tests, live metrics, application map, distributed tracing; **workspace-based**; OpenTelemetry distro (auto-instrumentation for App Service/Functions/AKS) |
| **Alerts** | Metric, log search, activity log, smart detection, Prometheus alerts → **action groups** (email/SMS/push/voice, webhook, Logic App, Function, ITSM, Event Hub) + alert processing rules (suppress during maintenance) |
| **Workbooks / Dashboards / Managed Grafana** | Visualization |
| **Insights** | VM insights, **Container insights** (AKS), Network insights, Storage insights |
| **Managed Prometheus** | Prometheus-compatible metrics for AKS/Arc, with Managed Grafana |

```kql
// Top failing requests in the last hour (App Insights)
AppRequests
| where TimeGenerated > ago(1h) and Success == false
| summarize failures = count() by Name, ResultCode
| top 10 by failures
// VM CPU > 80% (VM insights)
InsightsMetrics
| where Namespace == "Processor" and Name == "UtilizationPercentage"
| summarize avg(Val) by Computer, bin(TimeGenerated, 5m)
| where avg_Val > 80
```
Related: **Azure Advisor**, **Service Health** (+ alerts for incidents/maintenance in your regions), **Resource Health**, **Network Watcher**, **Change Analysis**.

## 2. Azure DevOps
| Service | What |
|---|---|
| **Azure Boards** | Agile planning: work items (epics, features, user stories, bugs, tasks), Kanban, sprints, queries, dashboards |
| **Azure Repos** | Private Git repos, branch policies (required reviewers, build validation, linked work items) |
| **Azure Pipelines** | CI/CD (YAML or classic), Microsoft-hosted or **self-hosted agents**, multi-stage, **environments** with approvals & checks, deployment strategies (runOnce, rolling, canary), templates, variable groups (linked to Key Vault), **service connections** (use **workload identity federation** — no secrets) |
| **Azure Test Plans** | Manual/exploratory testing |
| **Azure Artifacts** | Package feeds (NuGet, npm, Maven, Python, Universal), upstream sources |
**Azure DevOps vs GitHub**: both Microsoft; GitHub (Actions, Advanced Security, Copilot) is the strategic direction for code + CI/CD; Azure DevOps remains strong for enterprise boards/test plans and existing estates. Hybrid common: GitHub repos + Azure Boards/Pipelines.

```yaml
# azure-pipelines.yml - build, then deploy to AKS with approval on prod environment
trigger: [main]
stages:
- stage: Build
  jobs:
  - job: build
    pool: { vmImage: ubuntu-latest }
    steps:
    - task: Docker@2
      inputs: { containerRegistry: acr-conn, repository: web, command: buildAndPush, tags: $(Build.BuildId) }
- stage: Prod
  dependsOn: Build
  jobs:
  - deployment: deploy
    environment: prod            # approvals & checks configured on the environment
    strategy:
      runOnce:
        deploy:
          steps:
          - task: KubernetesManifest@1
            inputs: { action: deploy, connectionType: azureResourceManager, azureSubscriptionConnection: arm-wif,
                      azureResourceGroup: rg-aks, kubernetesCluster: aks-prod, manifests: k8s/*.yaml,
                      containers: myacr.azurecr.io/web:$(Build.BuildId) }
```
GitHub Actions → Azure: `azure/login@v2` with OIDC (federated credential on an app registration / user-assigned managed identity), then `az`/Bicep/Terraform deploys.

## 3. Backup & disaster recovery
| Service | What |
|---|---|
| **Azure Backup** | Backup-as-a-service for VMs, disks, Azure Files, blobs, SQL/SAP HANA in VMs, PostgreSQL, AKS, on-prem (MARS agent/MABS). Vaults: **Recovery Services vault** & **Backup vault**; soft delete, **immutable vaults**, multi-user authorization, cross-region restore, backup policies (daily/weekly/monthly/yearly retention) |
| **Azure Site Recovery (ASR)** | **DRaaS**: continuous replication of Azure VMs (region → region), on-prem VMware/Hyper-V/physical → Azure; recovery plans (ordered failover groups, scripts/runbooks), **test failover** (isolated network, no impact), planned/unplanned failover, failback; RPO ~seconds–minutes |
| **Storage redundancy** | GRS/RA-GRS/GZRS + customer-managed failover |
| **Azure SQL** | Auto-failover groups, active geo-replication, geo-restore |
| **Cosmos DB** | Multi-region replication, service-managed failover |
| **Front Door / Traffic Manager** | Route users to healthy region |

### Implementing DR with Site Recovery + geo-redundant storage (scenario)
1. Classify workloads, set RTO/RPO; choose target region (often the **paired region**).
2. Enable **ASR replication** for VMs into a DR resource group/VNet in the target region (pre-create VNet with non-overlapping or identical address space; NSGs; capacity).
3. Build **recovery plans**: order tiers (DB → app → web), add Automation runbooks (update DNS, attach LB, start services).
4. Data: Azure SQL **auto-failover group** (read-write listener endpoint stays the same), storage **GZRS/RA-GZRS** for blobs (or object replication), Key Vault (geo-replicated automatically within geography), configs in Git/IaC.
5. Traffic: Front Door/Traffic Manager priority routing with health probes for automatic redirection.
6. **Test failover** regularly (non-disruptive), document actual RTO, failback procedure.
7. Protect backups separately with **Azure Backup** (immutable, soft delete) — replication ≠ backup (ransomware/corruption replicates).
8. Monitor replication health & RPO in ASR; alert via Azure Monitor.

## 4. Operations best practices
Diagnostic settings everywhere (via Policy) → one Log Analytics workspace per environment/region strategy; alerts as code (Bicep/Terraform); action groups to on-call; Update Manager for patching; autoscale; Advisor reviews; Service Health alerts; cost budgets; Azure Chaos Studio experiments; runbooks in Automation/Logic Apps.
