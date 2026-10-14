# Azure Compute — VMs, VMSS, App Service, Functions, AKS, Container Apps — Complete Notes

> Part of the [Azure overview](./azure.md).

---

## 1. Virtual Machines
- **Resources required for a VM**: VM (size), **OS disk** (+ data disks, managed), **NIC**, **VNet/subnet**, **NSG**, optional **public IP**, image (Marketplace / custom / **Azure Compute Gallery**), availability option, diagnostics/boot diagnostics, identity.
- **Sizes**: B (burstable), D/Ds (general), F (compute), E/M (memory), L (storage), N-series (GPU), H (HPC); `v5/v6`, `p` = Arm (Cobalt).
- **Availability options**:
| Option | Protects against | SLA (single region) |
|---|---|---|
| Single VM with Premium SSD | — | 99.9% |
| **Availability set** | Rack/host failure & planned maintenance within one DC: **fault domains** (up to 3, separate power/network) + **update domains** (up to 20, rebooted one at a time) | 99.95% |
| **Availability zones** | Entire datacenter failure | **99.99%** (2+ VMs across zones) |
- **Virtual Machine Scale Sets (VMSS)**: identical (Uniform) or mixed (**Flexible** orchestration — recommended) VMs with autoscale (metric-based, scheduled, predictive), rolling upgrades, automatic OS image upgrades, application health extension, spot mix, zone spreading. Equivalent to AWS ASG / GCP MIG.
- **Spot VMs**: deep discount, evicted with 30-s notice (eviction policy deallocate/delete).
- Extensions (Custom Script, Azure Monitor Agent), **cloud-init**, **Azure Bastion** for RDP/SSH without public IPs, **Just-In-Time VM access** (Defender for Cloud), **Update Manager** for patching, **Azure Automanage**.
- **Azure Virtual Desktop (AVD)**: managed VDI — multi-session Windows 11/10, host pools, FSLogix profiles, pay for session hosts.
- **Dedicated Hosts**, **Azure VMware Solution**, **Azure Batch** (large-scale parallel/HPC jobs).

## 2. Application hosting options
| Service | Model | Best for |
|---|---|---|
| **App Service** (Web Apps) | PaaS for web apps/APIs (.NET, Java, Node, Python, PHP, containers) | Standard web apps with minimal ops |
| **Azure Functions** | Serverless functions (event-driven) | Event processing, glue, scheduled jobs |
| **Azure Container Apps** | Serverless containers on managed K8s (KEDA scaling, Dapr, revisions, scale to zero, jobs) | Microservices without managing K8s |
| **AKS** | Managed Kubernetes | Full K8s control, complex platforms |
| **Azure Container Instances (ACI)** | Single containers/groups on demand, per-second billing | Simple tasks, burst from AKS (virtual nodes) |
| **Virtual Machines / VMSS** | IaaS | Full control, legacy |
| **Static Web Apps** | Static front end + Functions API, global | SPAs/JAMstack |
| **Spring Apps** | (retiring) — use Container Apps | — |

### App Service details
- Runs in an **App Service plan** (the compute: tier + instance count). Tiers: Free/Shared (dev), **Basic** (manual scale), **Standard** (autoscale, slots, backups), **Premium v3/v4** (more slots, zone redundancy, VNet integration perf), **Isolated v2** (App Service Environment — single-tenant in your VNet).
- **Deployment slots** (staging → swap with warm-up = zero-downtime, instant rollback by swapping back; slot-sticky settings).
- Features: custom domains + free managed certs, **VNet integration** (outbound) & **private endpoints** (inbound), managed identity, Key Vault references in app settings, autoscale, health check, Easy Auth (Entra/social login), deployment from GitHub Actions/Azure Pipelines/ZIP/containers.

### Azure Functions details
- Triggers (HTTP, Timer, Blob, Queue, Service Bus, Event Grid, Event Hubs, Cosmos DB change feed) and **bindings** (declarative input/output).
- **Hosting plans**: **Flex Consumption** (recommended serverless: fast scale, VNet, always-ready instances, per-execution billing), Consumption (legacy serverless, 10-min max), **Premium** (pre-warmed, VNet, no cold start, longer runs), Dedicated (App Service plan), Container Apps hosting.
- **Durable Functions**: stateful orchestrations (function chaining, fan-out/fan-in, human interaction, async HTTP).

### Container Apps details
Environment (shared VNet/Log Analytics) → apps → **revisions** (traffic splitting for blue/green/canary); scale rules via **KEDA** (HTTP, queue length, CPU, custom) incl. **scale to zero**; Dapr sidecars (pub/sub, state, service invocation); ingress with custom domains/certs; jobs (scheduled/event); workload profiles (consumption + dedicated, GPU).

## 3. Azure Kubernetes Service (AKS)
- Free control plane (Free tier) or **Standard tier** (financially backed 99.95% uptime SLA with AZs) / Premium (LTS).
- **Node pools**: system (CoreDNS, metrics) vs user pools; VMSS-based; Spot pools; Windows pools; Arm; GPU. **AKS Automatic** = opinionated, Autopilot-like managed mode.
- **Networking**: kubenet (legacy) / **Azure CNI** (pods get VNet IPs) / **Azure CNI Overlay** (pod CIDR overlay, saves IPs) / **Azure CNI powered by Cilium**; Network policies (Azure/Calico/Cilium); ingress via **Application Gateway for Containers**/AGIC, NGINX (managed app routing add-on), Istio add-on.
- **Identity**: Entra ID integration + Kubernetes RBAC or **Azure RBAC for K8s**; **Workload Identity** (federated credentials) for pods → Azure resources; kubelet managed identity to pull from **ACR** (`az aks update --attach-acr`).
- Scaling: Cluster Autoscaler, **Node Auto Provisioning (Karpenter-based)**, HPA, **KEDA add-on**, VPA.
- Ops: auto-upgrade channels, planned maintenance windows, node image upgrades, Azure Monitor Container Insights + **managed Prometheus/Grafana**, Defender for Containers, Azure Policy for AKS (Gatekeeper), **GitOps (Flux v2) extension**, Key Vault CSI driver.
```bash
az aks create -g rg -n aks-prod --tier standard --zones 1 2 3 --network-plugin azure --network-plugin-mode overlay \
  --enable-managed-identity --enable-oidc-issuer --enable-workload-identity --attach-acr myacr --node-count 3
az aks get-credentials -g rg -n aks-prod
```

## 4. Compute choice (classic question: VMs vs App Service vs Functions vs AKS vs Container Apps)
- Need OS control / legacy / special software → **VMs/VMSS**.
- Web app/API, want least ops, code or single container → **App Service**.
- Event-driven, short-lived, pay-per-execution → **Functions**.
- Containerized microservices, want serverless containers with K8s-like features but no cluster ops → **Container Apps**.
- Need full Kubernetes API, operators, service mesh, platform team → **AKS**.
- One-off container task → **ACI**.

## 5. Deploying a containerized SaaS app on Azure with CI/CD & custom domains (scenario)
1. Code in GitHub → **GitHub Actions** with **OIDC federated credential** to an Entra app/managed identity (no secrets) → build & scan image → push to **ACR**.
2. Deploy to **Container Apps** (or AKS via Helm/Flux) — new **revision**, traffic split 10% → 100% after health checks; IaC via Bicep/Terraform in the same pipeline.
3. Front with **Azure Front Door** (global anycast, WAF, caching, **custom domains with managed TLS certs** — CNAME/TXT validation; apex via alias in Azure DNS) → origin Container Apps with private link or restricted ingress.
4. Data: Azure Database for PostgreSQL Flexible (zone-redundant HA) / Cosmos DB; secrets in **Key Vault**, accessed by **managed identity**.
5. Observability: Application Insights + Log Analytics; alerts → action groups.
6. Multi-tenancy: tenant claim from Entra External ID; per-tenant data isolation; custom domains per tenant via Front Door.
