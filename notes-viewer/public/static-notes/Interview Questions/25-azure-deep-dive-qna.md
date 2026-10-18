# Azure Deep Dive — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Complements [10 — Azure & GCP core Q&A](./10-azure-and-gcp-qna.md) (no repeats). Notes: [`Cloud/AZURE/`](../Cloud/AZURE/azure.md). Questions follow the AZ-900 skills outline and common Azure interview topics (AZ-104/AZ-305 style), answered here. Grouped **Junior → Mid → Senior**.

---

## Table of Contents
- [Junior Level (0–2 yrs)](#junior-level-02-yrs)
- [Mid Level (2–5 yrs)](#mid-level-25-yrs)
- [Senior Level (5+ yrs)](#senior-level-5-yrs)

---

## Junior Level (0–2 yrs)

### 1. Explain Azure subscriptions, resource groups, management groups, and Azure Resource Manager.
**Management groups** organize subscriptions (up to 6 levels deep) so Azure Policy and RBAC apply at scale. A **subscription** is a billing, quota, and access boundary tied to one Entra tenant. A **resource group** is a lifecycle container for related resources (delete the RG, delete everything in it). **ARM** is the single management layer every request (portal, CLI, PowerShell, SDK, Bicep/Terraform) goes through — it authenticates via Entra ID, authorizes via RBAC, evaluates Policy, and hands off to resource providers.

### 2. What are Azure regions, region pairs, sovereign regions, and availability zones?
A **region** is a set of datacenters in a geography. **Region pairs** (e.g. Central India ↔ South India) are in the same geography for DR: sequential platform updates, prioritized recovery, GRS replication targets. **Sovereign regions** (Azure Government, Azure China) are isolated instances for compliance. **Availability zones** are ≥3 physically separate datacenters within a region; zone-redundant services spread across them automatically, zonal services are pinned to one.

### 3. What are Azure datacenters, resources, and resource groups (AZ-900 basics)?
Datacenters are the physical facilities grouped into regions. A **resource** is any manageable item — VM, storage account, VNet, database. Every resource belongs to exactly one resource group; resource groups can contain resources from different regions and can't be nested. Group resources that share a lifecycle.

### 4. What is the consumption-based model, and what are Azure's pricing options?
You pay only for what you use (per second/minute/GB/operation) with no upfront cost (OpEx). Options: pay-as-you-go, **Reservations** (1/3-year commitment for VMs, SQL, Cosmos DB, etc.), **Azure Savings Plan for compute** (hourly spend commitment), **Spot VMs** (up to ~90% off, evictable), **Azure Hybrid Benefit** (reuse Windows Server/SQL Server licenses), dev/test pricing, free tier/credits.

### 5. Compare Azure VMs, App Service, Azure Functions, AKS, and Container Apps.
**VMs**: IaaS with full OS control — legacy, special software. **App Service**: PaaS for web apps/APIs with deployment slots, autoscale, managed TLS. **Functions**: serverless event-driven code billed per execution. **AKS**: managed Kubernetes for complex container platforms. **Container Apps**: serverless containers on managed Kubernetes with KEDA autoscaling (scale to zero), Dapr, revisions — microservices without managing clusters.

### 6. What are VM availability sets, and how are they different from availability zones?
An **availability set** spreads VMs across **fault domains** (separate racks/power/network, up to 3) and **update domains** (groups rebooted separately during maintenance, up to 20) inside one datacenter — 99.95% SLA. **Availability zones** spread VMs across separate datacenters — protects against a whole datacenter failure, 99.99% SLA. Prefer zones where available.

### 7. What is a Virtual Machine Scale Set?
A group of load-balanced VMs created from the same configuration that scales automatically on metrics or schedules, spreads across zones, supports rolling upgrades and automatic OS image upgrades, and integrates with Azure Load Balancer/Application Gateway. **Flexible orchestration** (recommended) supports mixed VM sizes and Spot; Uniform is the classic identical-instance mode. Equivalent to AWS ASG / GCP MIG.

### 8. What resources does a VM need?
The VM itself (size), an OS managed disk (plus optional data disks), a network interface, a virtual network and subnet, a network security group, optionally a public IP (better: Bastion), an image, and optionally availability configuration, managed identity, extensions, and boot diagnostics storage.

### 9. What is Azure Virtual Desktop?
A managed virtual desktop infrastructure service delivering Windows 11/10 (including multi-session) desktops and RemoteApps from Azure. You manage host pools of session-host VMs; Microsoft manages the gateway, broker, and web access. FSLogix stores user profiles. Use cases: remote workers, contractors, secure access to apps, BYOD.

### 10. Explain Azure Blob Storage tiers.
**Hot** (frequent access, highest storage cost, lowest access cost), **Cool** (≥30 days, infrequent), **Cold** (≥90 days, rare but online), **Archive** (≥180 days, offline — must rehydrate to Hot/Cool, taking up to ~15 hours at standard priority). Lifecycle management policies move blobs automatically based on age or last access.

### 11. What are Azure Storage redundancy options?
**LRS** (3 copies in one datacenter), **ZRS** (3 copies across 3 AZs), **GRS** (LRS + async copy to the paired region), **RA-GRS** (GRS + read access to secondary), **GZRS** (ZRS + secondary region), **RA-GZRS** (GZRS + read secondary). Choose by durability/availability needs and whether reads must survive a regional outage.

### 12. Compare Azure Storage services.
**Blob**: object storage (block/append/page blobs). **Azure Files**: managed SMB/NFS shares. **Queue**: simple message queue. **Table**: NoSQL key-attribute store. **Data Lake Storage Gen2**: Blob with hierarchical namespace for analytics. **Managed Disks**: block storage for VMs. All live in storage accounts (except managed disks).

### 13. How do you move files and data into Azure?
**AzCopy** (CLI copy/sync), **Azure Storage Explorer** (GUI), **Azure File Sync** (sync and tier Windows file servers to Azure Files), **Azure Data Box** (offline appliances for TB–PB), **Azure Migrate** (discovery, assessment, migration of servers, databases, web apps), **Azure Database Migration Service**, and **Data Factory** for ongoing pipelines.

### 14. What are public and private endpoints?
A **public endpoint** exposes a service on a public IP reachable over the internet (restrictable with firewall rules). A **private endpoint** gives the service a private IP from your VNet via Private Link so it's reachable only over your private network (including on-prem via VPN/ExpressRoute), and public access can be disabled.

### 15. What is Azure DNS?
Hosts DNS zones on Azure's global anycast name servers: public zones for internet domains (with alias records to Azure resources, even at the apex) and private DNS zones for name resolution inside linked VNets (VM auto-registration, Private Link zones). DNS Private Resolver handles hybrid forwarding.

### 16. What's the difference between Microsoft Entra ID and Microsoft Entra Domain Services?
**Entra ID** is the cloud identity provider (OAuth2/OIDC/SAML) for Azure, Microsoft 365, and SaaS apps — no LDAP/Kerberos or Group Policy. **Entra Domain Services** provides a managed domain with LDAP, Kerberos/NTLM, domain join, and Group Policy for legacy apps in Azure, without running your own domain controllers.

### 17. What authentication methods does Azure support (SSO, MFA, passwordless)?
**SSO**: one sign-in across many apps. **MFA**: requires two or more factors (Authenticator push with number matching, OATH tokens, FIDO2 keys, SMS/voice as weakest). **Passwordless**: Windows Hello for Business, Authenticator passwordless, passkeys/FIDO2 security keys — phishing-resistant. Plus self-service password reset and security defaults for small tenants.

### 18. What are external identities in Azure?
Ways to let people outside your organization sign in: **B2B collaboration** (invite partners as guest users with their own Entra/Google/email identities), **B2B direct connect** (mutual trust, e.g. Teams shared channels), and **Entra External ID** for customer-facing apps (sign-up/sign-in, social logins) — the successor to Azure AD B2C for new projects.

### 19. What is Azure RBAC?
Authorization for Azure resources: assign a **role** (set of permissions) to a **security principal** (user, group, service principal, managed identity) at a **scope** (management group, subscription, resource group, resource); assignments inherit downward. Built-in roles include Owner, Contributor, Reader, User Access Administrator, and many service-specific roles.

### 20. What is the purpose of resource locks?
Locks prevent accidental changes: **CanNotDelete** allows modification but not deletion; **ReadOnly** blocks all changes. They apply at subscription, RG, or resource scope, are inherited, and override RBAC permissions (even an Owner must remove the lock first).

### 21. What is the purpose of tags?
Name-value metadata (`env=prod`, `costCenter=1234`, `owner=team-a`) for cost reporting, automation, governance, and organization. Tags aren't inherited by default — use Azure Policy (`Modify` effect) to require or inherit them.

### 22. What factors affect Azure costs, and which tools help manage them?
Resource type and SKU, consumption, region, bandwidth (egress, inter-region and inter-zone transfer), reservations/savings plans, licensing, marketplace items, and support plans. Tools: **Pricing Calculator** (estimate), **TCO Calculator** (compare with on-prem), **Cost Management + Billing** (analysis, budgets, alerts, exports), **Azure Advisor** cost recommendations, tags for allocation.

### 23. What are Azure Cloud Shell, Azure CLI, and Azure PowerShell?
**Azure CLI** (`az`) is a cross-platform command-line tool with Bash-friendly syntax. **Azure PowerShell** (`Az` module) provides cmdlets like `New-AzVM` for PowerShell users. **Cloud Shell** is a browser-based shell (Bash or PowerShell) in the portal with both tools, Terraform, kubectl, and git pre-installed and authenticated, with a persistent file share.

### 24. What is Azure Arc?
It extends Azure Resource Manager to resources outside Azure — on-prem and other-cloud servers, Kubernetes clusters, SQL Server instances — so you manage them with Azure Policy, RBAC, Defender for Cloud, Azure Monitor, Update Manager, and GitOps as if they were Azure resources. A single control plane for hybrid and multi-cloud.

### 25. What are ARM templates and Bicep?
ARM templates are declarative JSON IaC files describing Azure resources; deployments are idempotent and can run in incremental or complete mode. **Bicep** is a cleaner domain-specific language that compiles to ARM JSON, with modules, type safety, and day-zero support for new resources; `what-if` previews changes before deployment.

### 26. What are Azure Advisor and Azure Service Health?
**Advisor** gives personalized best-practice recommendations across reliability, security, performance, cost, and operational excellence. **Service Health** reports Azure service incidents, planned maintenance, and health advisories affecting *your* subscriptions and regions, with configurable alerts; **Resource Health** shows the health of individual resources.

### 27. What is Azure Monitor (Log Analytics, alerts, Application Insights)?
The unified monitoring platform: **metrics** (time series), **logs** in a **Log Analytics workspace** queried with KQL, **alerts** (metric, log search, activity log) that trigger **action groups** (email, SMS, webhook, Logic App, ITSM), and **Application Insights** for application performance monitoring (requests, dependencies, exceptions, distributed tracing).

---

## Mid Level (2–5 yrs)

### 28. Explain Azure Files, managed disks, and Azure Data Lake Storage.
**Azure Files**: fully managed SMB/NFS file shares mountable from Windows/Linux/macOS, with identity-based auth and Azure File Sync for hybrid caching — replaces on-prem file servers. **Managed disks**: block storage for VMs — Standard HDD, Standard SSD, Premium SSD, Premium SSD v2 (tune IOPS/throughput separately), Ultra Disk; LRS or ZRS; snapshots. **ADLS Gen2**: Blob storage with hierarchical namespace and POSIX ACLs, optimized for big-data analytics (Synapse, Databricks, Fabric).

### 29. Compare Azure SQL Database, Cosmos DB, Azure Database for PostgreSQL/MySQL, and Synapse/Fabric.
**Azure SQL Database**: PaaS SQL Server (single DB, elastic pools, serverless, Hyperscale) for relational OLTP. **Cosmos DB**: globally distributed multi-model NoSQL with single-digit-ms latency, five consistency levels, multi-region writes, RU-based throughput. **PostgreSQL/MySQL Flexible Server**: managed open-source relational engines with zone-redundant HA. **Synapse/Fabric**: analytics — data warehousing, Spark, pipelines, BI (Fabric is the strategic unified SaaS platform with OneLake).

### 30. What are Cosmos DB consistency levels?
From strongest to weakest: **Strong** (linearizable reads), **Bounded staleness** (reads lag by at most K versions or T time), **Session** (default — read-your-own-writes within a session), **Consistent prefix** (never see out-of-order writes), **Eventual** (no ordering guarantee, lowest latency/cost). Weaker consistency gives better latency, availability, and throughput.

### 31. When do you choose Azure SQL Database vs SQL Managed Instance vs SQL Server on VMs?
**SQL Database** for new cloud apps wanting the most managed option (no instance-level features). **SQL Managed Instance** for lift-and-shift of SQL Server needing instance features (SQL Agent, cross-database queries, CLR, linked servers) with near-100% compatibility in a VNet. **SQL on VMs** when you need OS-level access, unsupported features, or specific versions.

### 32. Explain VNet, subnets, NSGs, and Azure Firewall.
A **VNet** is a regional private network with address spaces divided into **subnets** (5 IPs reserved each). **NSGs** are stateful allow/deny rule sets with priorities (100–4096) applied to subnets and/or NICs, using service tags and application security groups. **Azure Firewall** is a managed, centralized stateful firewall (network, application FQDN, and DNAT rules; threat intelligence; Premium adds TLS inspection, IDPS, URL filtering), typically in a hub VNet with UDRs forcing traffic through it.

### 33. What's the difference between service endpoints and private endpoints?
**Service endpoints** extend your VNet identity to a PaaS service over the Azure backbone, but the service keeps its public IP; you restrict its firewall to your subnet; not usable from on-prem; free. **Private endpoints** place a private IP for the service inside your subnet; reachable from peered VNets and on-prem; public access can be disabled; requires private DNS zones; per-hour cost. Private endpoints are the zero-trust default.

### 34. Explain VPN Gateway vs ExpressRoute.
**VPN Gateway** creates encrypted IPsec/IKE tunnels over the public internet: site-to-site (office ↔ Azure), point-to-site (individual users), VNet-to-VNet; quick and cheap, with internet-dependent latency. **ExpressRoute** is a private dedicated connection through a connectivity provider that does **not** traverse the internet — predictable latency, higher bandwidth (up to 100 Gbps with ExpressRoute Direct), SLA, Global Reach between sites; not encrypted by default (add MACsec or IPsec). Common: ExpressRoute primary with VPN as backup.

### 35. Compare Azure Load Balancer, Application Gateway, Front Door, and Traffic Manager.
**Load Balancer**: L4 TCP/UDP, regional (plus cross-region tier), internal or public, very low latency. **Application Gateway**: L7 regional HTTP(S) load balancer with path/host routing, TLS termination, and WAF. **Front Door**: global L7 entry point with anycast, CDN caching, WAF, and fast cross-region failover. **Traffic Manager**: DNS-based global routing (priority, weighted, performance, geographic) for any protocol. Decision: global HTTP → Front Door; regional HTTP → App Gateway; non-HTTP global → Traffic Manager; non-HTTP regional → Load Balancer.

### 36. What are VNet peering and hub-and-spoke topology?
Peering connects two VNets (same or different regions) over the Microsoft backbone with low latency; it's **non-transitive** and needs non-overlapping address spaces. Hub-and-spoke puts shared services (Azure Firewall, VPN/ExpressRoute gateways, Bastion, DNS) in a hub VNet peered to workload spoke VNets; gateway transit lets spokes use the hub's gateways; spoke-to-spoke traffic routes through the hub firewall. Virtual WAN is the Microsoft-managed version at scale.

### 37. What is Microsoft Entra Conditional Access?
Policy engine evaluated at sign-in: **if** signals (user/group, app, location, device compliance, platform, sign-in/user risk) **then** decision (block, or grant requiring MFA, compliant device, authentication strength, terms of use; plus session controls). Examples: MFA for all admins, block legacy authentication, require compliant devices for M365, block risky countries. Test in report-only mode and exclude break-glass accounts.

### 38. What are managed identities, and how are they different from service principals?
A managed identity is an Entra identity that Azure creates and manages for a resource (VM, App Service, Function, AKS workload, Container App) with no credentials to store or rotate — **system-assigned** (tied to one resource's lifecycle) or **user-assigned** (standalone, shareable). A service principal is the identity of an app registration that you manage credentials for (secret/certificate) and can use anywhere, including outside Azure. Prefer managed identities inside Azure and federated credentials (no secrets) for CI/CD.

### 39. What is Azure Key Vault, and how do you use it securely?
A managed store for secrets, keys (software or HSM-backed), and certificates. Use Azure RBAC for access (e.g. `Key Vault Secrets User` granted to a managed identity), enable soft delete and purge protection, use private endpoints and firewall, log to Log Analytics, rotate keys/secrets, and reference secrets from App Service settings, AKS CSI driver, or pipelines instead of copying values.

### 40. What is Azure Policy, and how does it work with Blueprints/landing zones?
Azure Policy evaluates resources against rules (effects: Deny, Audit, Modify, Append, DeployIfNotExists, AuditIfNotExists, DenyAction) and reports compliance; initiatives group policies (e.g. regulatory compliance). **Azure Blueprints** packaged policies, RBAC, and templates for repeatable environments but were retired in 2026 — the replacement is **Template Specs + Deployment Stacks** plus policy initiatives, usually delivered through **Azure Landing Zones** (Cloud Adoption Framework) via Bicep/Terraform.

### 41. What do Microsoft Defender for Cloud and Microsoft Sentinel do?
**Defender for Cloud**: CSPM (secure score, recommendations, attack paths, regulatory compliance) and workload protection plans (Servers, Containers, Storage, SQL, Key Vault, App Service, Resource Manager, APIs) across Azure, AWS, GCP, and on-prem via Arc. **Sentinel**: cloud-native SIEM/SOAR on Log Analytics — ingests logs from everywhere, detects threats with KQL analytics rules and UEBA, manages incidents, and automates responses with Logic Apps playbooks.

### 42. What is Microsoft Purview?
A data governance, risk, and compliance platform: data map and catalog across Azure, on-prem, multi-cloud, and SaaS; automated classification and sensitivity labels; lineage; information protection and DLP; eDiscovery, audit, Compliance Manager, insider risk management.

### 43. What is Zero Trust, and what is defense in depth (Azure framing)?
**Zero Trust**: verify explicitly, use least-privilege access (JIT/JEA), assume breach (segment, encrypt, monitor). **Defense in depth**: layered controls — physical, identity & access, perimeter (DDoS, firewalls), network (segmentation, NSGs), compute (patching, endpoint protection), application (secure code), data (encryption, classification) — so a single failure doesn't expose data.

### 44. Explain Log Analytics and KQL with an example.
Log Analytics workspaces store logs from Azure resources (via diagnostic settings), VMs (Azure Monitor Agent), containers, and Application Insights; you query them with **Kusto Query Language**:
```kql
AzureDiagnostics
| where ResourceType == "APPLICATIONGATEWAYS" and httpStatus_d >= 500
| summarize errors = count() by bin(TimeGenerated, 5m), requestUri_s
| order by errors desc
```
Queries power dashboards, workbooks, log alerts, and Sentinel analytics.

### 45. What is Application Insights?
Azure Monitor's APM feature: auto-collected requests, dependencies, exceptions, page views, availability tests, live metrics, application map, and distributed tracing (OpenTelemetry-based), stored in a Log Analytics workspace. Use it to find slow dependencies, failing endpoints, and to correlate frontend and backend telemetry.

### 46. What is Azure DevOps, and what does each service do?
**Boards** (agile work tracking), **Repos** (Git with branch policies), **Pipelines** (YAML CI/CD with environments, approvals, deployment strategies, self-hosted or Microsoft-hosted agents, service connections with workload identity federation), **Test Plans** (manual/exploratory testing), **Artifacts** (package feeds). It integrates with GitHub; many orgs use GitHub for code and Actions, Azure Boards for planning.

### 47. How do App Service deployment slots work?
A slot is a live app with its own hostname (e.g. `staging`) running in the same App Service plan. Deploy to staging, warm it up and test, then **swap** with production — the swap is near-instant with no downtime, and rolling back is swapping again. Slot-specific (sticky) settings keep config like connection strings with the slot. Available from Standard tier.

### 48. What are Azure Functions hosting plans?
**Flex Consumption** (recommended serverless: fast scaling, VNet integration, optional always-ready instances, pay per execution), **Consumption** (classic serverless, scale to zero, 10-min limit), **Premium** (pre-warmed instances, no cold start, VNet, longer runtimes), **Dedicated** (runs on an App Service plan), and hosting on **Container Apps**. Durable Functions add stateful orchestrations.

### 49. What are AKS node pools, networking options, and identity integration?
System node pools run critical add-ons; user pools run workloads (can be Spot, Windows, GPU, Arm). Networking: Azure CNI (pods get VNet IPs), **Azure CNI Overlay** (saves VNet IPs), Azure CNI powered by Cilium; network policies; ingress via Application Gateway for Containers or managed NGINX. Identity: Entra ID integration with Kubernetes RBAC or Azure RBAC for Kubernetes, **Workload Identity** for pods to access Azure resources, managed identity to pull from ACR.

---

## Senior Level (5+ yrs)

### 50. How would you design a hybrid environment connecting on-premises Active Directory to Azure?
Network: ExpressRoute (with VPN backup) into a hub VNet, hybrid DNS via DNS Private Resolver and conditional forwarders. Identity: **Entra Connect Sync** (or Cloud Sync) syncs AD users/groups to Entra ID with **Password Hash Sync** (plus Seamless SSO), or PTA/federation if required; Conditional Access + MFA; hybrid-joined devices. Legacy Kerberos/LDAP apps in Azure: domain controllers as Azure VMs across zones or **Entra Domain Services**. Management: Azure Arc for on-prem servers, Defender for Identity on DCs, PIM for admins, tiered admin model.

### 51. How would you deploy a containerized SaaS app to Azure with CI/CD and custom domains?
GitHub Actions authenticating with OIDC federated credentials → build, test, scan → push to ACR → Bicep/Terraform deploys infrastructure → deploy new **Container Apps revision** (or AKS via Helm/Flux) with traffic splitting for canary → **Azure Front Door** with WAF and **custom domains with managed certificates** (CNAME/TXT validation, Azure DNS alias for apex) → private origin access → PostgreSQL Flexible Server (zone-redundant) or Cosmos DB → Key Vault secrets via managed identity → Application Insights monitoring → Entra External ID for customer sign-in with tenant claims.

### 52. How would you implement disaster recovery using Azure Site Recovery and geo-redundant storage?
Define RTO/RPO, replicate VMs with **ASR** to the paired region into pre-built DR VNets, create **recovery plans** with ordered groups and automation runbooks (DNS, LB attach), use Azure SQL **auto-failover groups** for databases, **GZRS/RA-GZRS** or object replication for blob data, Front Door/Traffic Manager priority routing for automatic redirection, and run **test failovers** regularly into isolated networks. Keep **Azure Backup** (immutable vaults, soft delete) separately, because replication also replicates corruption and ransomware.

### 53. How do Azure Policy, Blueprints (successors), Defender for Cloud, and Sentinel support governance and security together?
Policy **prevents and audits** misconfiguration (deny public IPs, require private endpoints, enforce tags, deploy diagnostics). Landing-zone templates (Template Specs/Deployment Stacks, formerly Blueprints) **standardize** new environments. Defender for Cloud **measures posture** (secure score, compliance) and **detects threats** on workloads. Sentinel **correlates** signals across the estate and **automates response**. Together: guardrails → posture → detection → response.

### 54. Design an Azure landing zone for an enterprise.
Management group hierarchy: Platform (Identity, Management, Connectivity), Landing Zones (Corp — private connectivity; Online — internet-facing), Sandbox, Decommissioned. Connectivity subscription with hub VNet/Virtual WAN, Azure Firewall, ExpressRoute/VPN, DNS. Management subscription with Log Analytics, Automation, Sentinel. Identity subscription with DCs/Entra Domain Services if needed. Policy initiatives at MG level (allowed regions, diagnostics, private endpoints, Defender plans, tags), RBAC via groups and PIM, subscription vending automation, budgets per subscription, deployed via the Azure Landing Zones Bicep/Terraform accelerators.

### 55. How would you secure an AKS cluster for production?
Private cluster or authorized IP ranges for the API server; Entra ID + Azure RBAC for Kubernetes with PIM for cluster admins; Workload Identity instead of secrets; Key Vault CSI driver; network policies (Cilium/Calico) with default deny; Azure Firewall for egress (UDR outbound type); Azure Policy for AKS (no privileged pods, approved registries); Defender for Containers; image scanning and signed images; regular upgrades with auto-upgrade channels and maintenance windows; separate system/user node pools; Container Insights and managed Prometheus monitoring.

### 56. How would you optimize Azure costs for a large estate?
Cost Management with mandatory tags (Policy), budgets and anomaly alerts per subscription; Advisor rightsizing and idle-resource cleanup; auto-shutdown and scale-to-zero for non-prod (Container Apps, Functions); Reservations/Savings Plan on the rightsized baseline; Azure Hybrid Benefit for Windows/SQL; Spot VMs/node pools for batch and stateless; blob lifecycle tiers; Log Analytics table plans (Basic/Auxiliary) and retention tuning; reduce egress with Front Door caching and private endpoints; Premium SSD v2 sized to need; FinOps reviews and showback.

### 57. How would you design a highly available, multi-region web application on Azure?
Front Door (global anycast, WAF, health probes, failover) → App Service or Container Apps/AKS in two regions, each zone-redundant → Azure SQL with auto-failover groups (or Cosmos DB with multi-region writes) → Azure Managed Redis per region → GZRS storage → Key Vault per region → Service Bus geo-disaster recovery/geo-replication for messaging → Application Insights per region with global dashboards → IaC for identical deployments → regular failover drills.

### 58. How do you troubleshoot "a VM can't reach a database in another VNet"?
Check peering state and settings (allow forwarded traffic, gateway transit), effective routes on the NIC (UDRs forcing traffic to a firewall that lacks a rule), effective NSG rules on both subnet and NIC (both must allow), Azure Firewall logs, DNS resolution (is the private DNS zone linked to the VNet for private endpoints?), the database firewall/public access settings, and OS firewalls. Network Watcher's IP flow verify, next hop, and connection troubleshoot pinpoint the hop that drops traffic.

### 59. How would you migrate on-premises VMware workloads to Azure?
Assess with **Azure Migrate** (discovery appliance, dependency analysis, rightsizing, cost estimates), build the landing zone and ExpressRoute, then either **relocate** with Azure VMware Solution (no changes, fast) or **rehost** with Azure Migrate server migration (agentless VMware replication), migrate databases to Azure SQL MI/PostgreSQL with DMS, plan waves by dependency, test failover, cut over, and apply Hybrid Benefit and rightsizing after migration.

### 60. Compare identity in Azure with AWS and GCP — what trips people up?
Azure separates the **directory** (Entra ID: users, groups, apps, Entra roles like Global Administrator) from **resource authorization** (Azure RBAC at MG/subscription/RG/resource scope). People from AWS expect IAM to cover both and forget that Entra roles don't grant resource access, that `Contributor` can't read blob data without data-plane roles, and that management-group assignments inherit into every subscription. Managed identities ≈ AWS roles for services ≈ GCP service accounts.
