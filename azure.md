# ☁️ Microsoft Azure Overview

Microsoft Azure is a cloud computing platform and service offering by Microsoft, providing a wide range of cloud services including compute, analytics, storage, and networking. Azure enables organizations to build, run, and manage applications across a global network of Microsoft-managed data centers.

---

## 🧱 Azure Core Concepts

### Regions & Availability Zones
- **Regions**: Physical locations worldwide where Azure operates data centers (e.g., East US, West Europe).
- **Availability Zones (AZ)**: Isolated locations within a region to provide high availability.
- **Region Pairs**: Two paired regions within the same geography for disaster recovery.
- **Geography**: A discrete market that preserves data residency and compliance boundaries.

### Resource Organization

| Concept | Description |
|---|---|
| **Management Group** | Top-level grouping for managing access, policy, and compliance across subscriptions |
| **Subscription** | Logical unit of services, billed separately (like an AWS account) |
| **Resource Group** | Container for resources sharing a lifecycle and permissions |
| **Resource** | Individual service instance (VM, Storage Account, etc.) |

---

## 🖥️ Azure Compute Services

### Virtual Machines
- **Azure Virtual Machines**: IaaS offering for Windows/Linux VMs.
- **VM Scale Sets (VMSS)**: Auto-scaling groups of identical VMs.
- **Azure Spot VMs**: Unused compute at reduced cost (can be evicted).
- **Azure Dedicated Hosts**: Physical servers dedicated to your organization.

### Containers & Kubernetes
- **Azure Kubernetes Service (AKS)**: Managed Kubernetes with automatic upgrades and patching.
- **Azure Container Instances (ACI)**: Serverless container execution — fastest way to run a container.
- **Azure Container Apps**: Serverless microservices platform built on Kubernetes + KEDA.
- **Azure Container Registry (ACR)**: Private Docker image registry.

```bash
# Login to ACR
az acr login --name myregistry

# Push image to ACR
docker tag myapp myregistry.azurecr.io/myapp:v1
docker push myregistry.azurecr.io/myapp:v1

# Create AKS cluster
az aks create \
  --resource-group myRG \
  --name myAKSCluster \
  --node-count 3 \
  --enable-addons monitoring \
  --generate-ssh-keys
```

### Serverless
- **Azure Functions**: Event-driven serverless compute (like AWS Lambda).
- **Azure Logic Apps**: Low-code workflow automation and integration.
- **Azure Event Grid**: Event routing for reactive, event-driven architectures.

---

## 💾 Azure Storage Services

| Service | Type | Use Case |
|---|---|---|
| **Azure Blob Storage** | Object | Files, images, videos, backups |
| **Azure File Storage** | File share (SMB/NFS) | Lift-and-shift on-prem file shares |
| **Azure Disk Storage** | Block | OS and data disks for VMs |
| **Azure Table Storage** | NoSQL key-value | Structured NoSQL data |
| **Azure Queue Storage** | Message queue | Decoupled async communication |
| **Azure Data Lake Gen2** | Hierarchical object | Big data analytics |

### Storage Tiers
- **Hot**: Frequently accessed data.
- **Cool**: Infrequently accessed (at least 30 days).
- **Archive**: Rarely accessed (at least 180 days), lowest cost.

---

## 🗄️ Azure Database Services

- **Azure SQL Database**: Fully managed PaaS SQL Server.
- **Azure Cosmos DB**: Globally distributed, multi-model NoSQL database (supports JSON, graph, key-value).
- **Azure Database for PostgreSQL / MySQL**: Managed open-source relational databases.
- **Azure Cache for Redis**: In-memory cache for low-latency data access.
- **Azure Synapse Analytics**: Enterprise data warehouse + big data analytics.

---

## 🌐 Azure Networking

### Core Networking Components

```
Internet
    │
Azure Front Door / CDN
    │
Application Gateway (WAF + L7 LB)
    │
Virtual Network (VNet)
    ├── Subnet A (Public)  → VMs, AKS nodes
    └── Subnet B (Private) → Databases, internal services
```

- **Virtual Network (VNet)**: Isolated private network in Azure (like AWS VPC).
- **VNet Peering**: Connect two VNets (same or different regions).
- **Azure Load Balancer**: L4 load balancing for VMs.
- **Application Gateway**: L7 load balancer with Web Application Firewall (WAF).
- **Azure Front Door**: Global CDN + load balancer with DDoS protection.
- **Azure DNS**: Managed DNS hosting.
- **ExpressRoute**: Dedicated private connection from on-premises to Azure.
- **VPN Gateway**: Site-to-site and point-to-site VPN connections.

---

## 🔐 Azure Identity & Security

### Azure Active Directory (Entra ID)
- **Azure AD / Entra ID**: Cloud-based identity and access management.
- **Managed Identity**: Auto-managed service principal for Azure resources (no secrets to manage).
- **Service Principal**: App identity for automation and CI/CD pipelines.
- **RBAC (Role-Based Access Control)**: Grant fine-grained access to Azure resources.

### Key RBAC Roles

| Role | Description |
|---|---|
| Owner | Full access including delegation |
| Contributor | Create/manage resources, no access delegation |
| Reader | View-only access |
| User Access Administrator | Manage user access only |

### Key Vault
```bash
# Create Key Vault
az keyvault create --name myKV --resource-group myRG --location eastus

# Store a secret
az keyvault secret set --vault-name myKV --name DBPassword --value "SuperSecret123"

# Get a secret
az keyvault secret show --vault-name myKV --name DBPassword --query value -o tsv
```

---

## 🚀 Azure DevOps

### Azure DevOps Services
- **Azure Repos**: Git source control hosting.
- **Azure Pipelines**: CI/CD pipelines for any language, platform, or cloud.
- **Azure Boards**: Agile project management (Kanban, Scrum, backlogs).
- **Azure Artifacts**: Package management (npm, NuGet, Maven, Python).
- **Azure Test Plans**: Manual and exploratory testing tools.

### Azure Pipelines - Key Concepts

```yaml
# azure-pipelines.yml example
trigger:
  branches:
    include:
      - main

pool:
  vmImage: 'ubuntu-latest'

variables:
  imageTag: $(Build.BuildId)

stages:
  - stage: Build
    jobs:
      - job: BuildAndPush
        steps:
          - task: Docker@2
            inputs:
              containerRegistry: 'myACR'
              repository: 'myapp'
              command: 'buildAndPush'
              tags: |
                $(imageTag)
                latest

  - stage: Deploy
    dependsOn: Build
    jobs:
      - deployment: DeployToAKS
        environment: 'production'
        strategy:
          runOnce:
            deploy:
              steps:
                - task: KubernetesManifest@0
                  inputs:
                    action: 'deploy'
                    manifests: 'k8s/deployment.yaml'
```

### Azure CLI Essentials
```bash
# Login
az login

# Set subscription
az account set --subscription "My Subscription"

# Create resource group
az group create --name myRG --location eastus

# List resources
az resource list --resource-group myRG --output table

# Get AKS credentials
az aks get-credentials --resource-group myRG --name myAKSCluster
```

---

## 📊 Azure Monitoring & Observability

| Tool | Purpose |
|---|---|
| **Azure Monitor** | Centralized monitoring for all Azure resources |
| **Log Analytics** | Query logs with KQL (Kusto Query Language) |
| **Application Insights** | APM for web apps (traces, dependencies, exceptions) |
| **Azure Alerts** | Trigger notifications/actions based on metric thresholds |
| **Azure Dashboards** | Custom monitoring dashboards |

### KQL Quick Examples
```kql
// Top 10 failed requests in the last hour
requests
| where timestamp > ago(1h)
| where success == false
| summarize count() by name
| top 10 by count_

// Container CPU usage
Perf
| where ObjectName == "Container"
| where CounterName == "% Processor Time"
| summarize avg(CounterValue) by InstanceName, bin(TimeGenerated, 5m)
```

---

## 💡 Azure DevOps Best Practices

1. **Use Managed Identities** instead of service principals with passwords wherever possible.
2. **Tag all resources** for cost tracking and governance.
3. **Use Azure Policy** to enforce compliance (e.g., require tags, restrict regions).
4. **Enable Microsoft Defender for Cloud** for security posture management.
5. **Use Private Endpoints** for databases and storage to keep traffic off the public internet.
6. **ARM Templates / Bicep / Terraform** for repeatable IaC deployments.
7. **Use Azure Monitor + Alerts** for proactive incident management.

---

## 🔗 Related Notes
- [AWS Notes](aws.md)
- [GCP Notes](gcp.md)
- [Terraform & CloudFormation](Terraform%20and%20CF/terraform.md)
- [Kubernetes on AKS](Kubernetes/kubernetes.md)
