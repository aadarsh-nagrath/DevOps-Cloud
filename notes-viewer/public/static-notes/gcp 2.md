# ☁️ Google Cloud Platform (GCP) Overview

Google Cloud Platform (GCP) is Google's suite of cloud computing services, offering infrastructure, data analytics, machine learning, and developer tools running on the same infrastructure that powers Google Search, YouTube, and Gmail.

---

## 🧱 GCP Core Concepts

### Resource Hierarchy

```
Organization
    │
Folders (optional grouping)
    │
Projects  ◄── Billing account attached here
    │
Resources (VMs, Buckets, Databases, etc.)
```

- **Organization**: Root node, maps to your domain (e.g., company.com).
- **Folders**: Logical grouping for departments or teams.
- **Project**: Fundamental isolation unit — has its own APIs, billing, resources, and IAM.
- **Resource**: Individual service instance.

### GCP Zones & Regions
- **Zone**: Single deployment area within a region (e.g., `us-central1-a`).
- **Region**: Geographic area with multiple zones (e.g., `us-central1`).
- **Multi-Region**: Broad geographic area spanning multiple regions (e.g., `us`, `eu`).

---

## 🖥️ GCP Compute Services

### Virtual Machines (Compute Engine)
- **Compute Engine**: IaaS VMs running on Google's infrastructure.
- **Machine Types**: General Purpose (N1, N2, E2), Compute Optimized (C2), Memory Optimized (M1, M2).
- **Preemptible VMs / Spot VMs**: Up to 91% cheaper, can be stopped by Google at any time.
- **Managed Instance Groups (MIGs)**: Auto-scaling groups of identical VMs.

```bash
# Create a VM
gcloud compute instances create my-vm \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --image-family=debian-11 \
  --image-project=debian-cloud

# SSH into VM
gcloud compute ssh my-vm --zone=us-central1-a

# List instances
gcloud compute instances list
```

### Containers & Kubernetes
- **Google Kubernetes Engine (GKE)**: Industry-leading managed Kubernetes.
  - **Autopilot mode**: Fully managed, per-pod billing — Google manages nodes.
  - **Standard mode**: You manage nodes, more control.
- **Cloud Run**: Serverless containers — auto-scaling to zero.
- **Artifact Registry**: Private container and package registry.

```bash
# Create GKE cluster
gcloud container clusters create my-cluster \
  --zone us-central1-a \
  --num-nodes 3 \
  --enable-autoscaling \
  --min-nodes 1 \
  --max-nodes 10

# Get credentials
gcloud container clusters get-credentials my-cluster --zone us-central1-a

# Deploy Cloud Run service
gcloud run deploy my-service \
  --image gcr.io/myproject/myapp:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### Serverless
- **Cloud Functions**: Event-driven serverless functions (Gen 1 and Gen 2).
- **Cloud Run**: Stateless containerized serverless services.
- **Cloud Run Jobs**: Run container-based jobs to completion.
- **App Engine**: PaaS for web apps (Standard and Flexible environments).

---

## 💾 GCP Storage Services

| Service | Type | Use Case |
|---|---|---|
| **Cloud Storage** | Object | Files, images, backups, data lake |
| **Persistent Disk** | Block | VM OS and data disks |
| **Filestore** | NFS File | Shared file system for GKE/VMs |
| **Cloud Storage Archive** | Object | Long-term cold archival |

### Cloud Storage Classes

| Class | Access | Use Case |
|---|---|---|
| **Standard** | Frequent | Hot data, websites |
| **Nearline** | Monthly | Backup, accessed ~once/month |
| **Coldline** | Quarterly | Disaster recovery |
| **Archive** | Yearly | Long-term regulatory archives |

```bash
# Create bucket
gsutil mb -l us-central1 gs://my-unique-bucket

# Upload file
gsutil cp localfile.txt gs://my-unique-bucket/

# Make file public
gsutil acl ch -u AllUsers:R gs://my-unique-bucket/localfile.txt

# Sync directory
gsutil -m rsync -r ./local-dir gs://my-unique-bucket/dir
```

---

## 🗄️ GCP Database Services

| Service | Type | Best For |
|---|---|---|
| **Cloud SQL** | Managed relational (MySQL/PostgreSQL/SQL Server) | Traditional apps |
| **Cloud Spanner** | Globally distributed relational | Globally consistent, high scale |
| **Firestore** | Serverless document NoSQL | Mobile/web real-time apps |
| **Bigtable** | Wide-column NoSQL | IoT, analytics, time-series |
| **BigQuery** | Serverless data warehouse | Analytics, ML, reporting |
| **Memorystore** | Managed Redis/Memcached | Caching layer |

```bash
# Create Cloud SQL instance
gcloud sql instances create mydb \
  --database-version=POSTGRES_14 \
  --tier=db-f1-micro \
  --region=us-central1

# Query BigQuery
bq query --use_legacy_sql=false \
  'SELECT name, count FROM dataset.table LIMIT 10'
```

---

## 🌐 GCP Networking

### Core Networking Components

```
Internet
    │
Cloud CDN / Cloud Armor (DDoS + WAF)
    │
Global Load Balancer (L7)
    │
VPC Network (Global — spans all regions!)
    ├── Subnet (us-central1)
    │       └── GKE Nodes, VMs
    └── Subnet (europe-west1)
            └── Databases, services
```

> **Key Difference from AWS**: GCP VPCs are **global** — a single VPC spans all regions. Subnets are regional.

- **VPC (Virtual Private Cloud)**: Global private network.
- **Cloud Router**: Dynamic routing with BGP for hybrid connectivity.
- **Cloud Interconnect**: Dedicated or Partner private connection from on-prem.
- **Cloud VPN**: Encrypted tunnel over the internet to GCP.
- **Cloud NAT**: Managed Network Address Translation for outbound internet from private VMs.
- **Private Google Access**: VMs without external IPs can still reach Google APIs.

### Firewall Rules
```bash
# Allow HTTP/HTTPS from anywhere
gcloud compute firewall-rules create allow-http \
  --allow tcp:80,tcp:443 \
  --source-ranges 0.0.0.0/0 \
  --target-tags http-server

# Allow internal traffic
gcloud compute firewall-rules create allow-internal \
  --allow tcp,udp,icmp \
  --source-ranges 10.0.0.0/8
```

---

## 🔐 GCP IAM & Security

### IAM Concepts
- **Principal**: Who (user, group, service account, domain).
- **Role**: Collection of permissions.
- **Policy**: Binding of principals to roles on a resource.

### IAM Role Types

| Type | Description | Example |
|---|---|---|
| **Basic** | Broad legacy roles | Owner, Editor, Viewer |
| **Predefined** | Service-specific curated roles | `roles/storage.objectViewer` |
| **Custom** | Your own fine-grained roles | Cherry-picked permissions |

### Service Accounts
```bash
# Create service account
gcloud iam service-accounts create my-sa \
  --display-name "My Service Account"

# Grant role to service account
gcloud projects add-iam-policy-binding my-project \
  --member="serviceAccount:my-sa@my-project.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Create and download key
gcloud iam service-accounts keys create key.json \
  --iam-account my-sa@my-project.iam.gserviceaccount.com

# Workload Identity (preferred — no keys!)
gcloud iam service-accounts add-iam-policy-binding my-sa@my-project.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:my-project.svc.id.goog[default/my-k8s-sa]"
```

### Security Services
- **Cloud Armor**: WAF + DDoS protection.
- **Secret Manager**: Store and access API keys, passwords, certificates.
- **Cloud KMS**: Manage encryption keys.
- **Binary Authorization**: Policy enforcement for container images in GKE.

---

## 🚀 GCP DevOps & CI/CD

### Cloud Build
```yaml
# cloudbuild.yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/myapp:$COMMIT_SHA', '.']

  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/myapp:$COMMIT_SHA']

  - name: 'gcr.io/cloud-builders/kubectl'
    args:
      - 'set'
      - 'image'
      - 'deployment/myapp'
      - 'myapp=gcr.io/$PROJECT_ID/myapp:$COMMIT_SHA'
    env:
      - 'CLOUDSDK_COMPUTE_ZONE=us-central1-a'
      - 'CLOUDSDK_CONTAINER_CLUSTER=my-cluster'
```

### Cloud Deploy (Managed CD)
- Fully managed continuous delivery to GKE, Cloud Run, Anthos.
- Supports pipelines with promotion between stages (dev → staging → prod).
- Built-in rollback capability.

```bash
# Create delivery pipeline
gcloud deploy apply --file clouddeploy.yaml --region us-central1
```

### GCP DevOps Toolchain

| Tool | Purpose |
|---|---|
| **Cloud Source Repositories** | Managed Git hosting |
| **Cloud Build** | CI — build, test, push |
| **Artifact Registry** | Store containers & packages |
| **Cloud Deploy** | CD — deploy to environments |
| **Cloud Scheduler** | Cron jobs |
| **Cloud Tasks** | Async task queues |

---

## 📊 GCP Monitoring & Observability (Cloud Operations Suite)

| Tool | Purpose |
|---|---|
| **Cloud Monitoring** | Metrics, dashboards, alerts |
| **Cloud Logging** | Centralized log management |
| **Cloud Trace** | Distributed request tracing |
| **Cloud Profiler** | CPU and memory profiling |
| **Error Reporting** | Real-time exception tracking |

```bash
# Stream logs in real time
gcloud logging read "resource.type=gke_container" --limit 50 --format json

# Create alerting policy
gcloud alpha monitoring policies create --policy-from-file=alert-policy.json
```

---

## 🏗️ Infrastructure as Code on GCP

### Terraform with GCP
```hcl
provider "google" {
  project = "my-project"
  region  = "us-central1"
}

resource "google_compute_instance" "default" {
  name         = "my-vm"
  machine_type = "e2-medium"
  zone         = "us-central1-a"

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-11"
    }
  }

  network_interface {
    network = "default"
    access_config {}
  }
}
```

### Deployment Manager (Native IaC)
- GCP's native IaC tool using YAML/Python/Jinja2 templates.
- Less popular than Terraform; Terraform is preferred for GCP.

---

## 💡 GCP DevOps Best Practices

1. **Use Workload Identity** instead of downloaded service account keys for GKE workloads.
2. **Enable VPC Service Controls** to prevent data exfiltration from sensitive APIs.
3. **Use GKE Autopilot** for production to reduce node management overhead.
4. **Label all resources** for cost attribution with team, environment, and project labels.
5. **Use Cloud Armor** to protect public-facing applications from DDoS and web attacks.
6. **Binary Authorization** to enforce only signed, approved container images run in GKE.
7. **Use Private Clusters** for GKE to prevent the API server from being publicly accessible.

---

## 🔗 Related Notes
- [AWS Notes](aws.md)
- [Azure Notes](azure.md)
- [Terraform Notes](Terraform%20and%20CF/terraform.md)
- [Kubernetes Notes](Kubernetes/kubernetes.md)
