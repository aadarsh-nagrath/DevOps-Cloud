# 📚 DevOps & Cloud Learning Index

Welcome to the centralized index of all notes in this repository. Click any link below to jump directly to that note.

---

## ☁️ Cloud Platforms

| Note | Description |
|---|---|
| [AWS](aws.md) | EC2, S3, EKS, Lambda, IAM, CodePipeline and core AWS services |
| [Azure](azure.md) | AKS, Azure Pipelines, Entra ID, Azure Monitor, Bicep IaC |
| [GCP](gcp.md) | GKE, Cloud Run, Cloud Build, Cloud Deploy, BigQuery, IAM |
| [Cloud Networking](Cloud-Networking-for-DevOps.md) | VPC, Subnets, Load Balancers, DNS, CDN, hybrid connectivity |

---

## ☸️ Kubernetes

| Note | Description |
|---|---|
| [Kubernetes Core](Kubernetes/kubernetes.md) | Pods, Deployments, Services, ConfigMaps, RBAC, namespaces |
| [K8s Pods Deep Dive](Kubernetes/K-pods.md) | Pod lifecycle, init containers, probes, resource limits |
| [Kubernetes Networking](Kubernetes/Networking.md) | CNI, Services, Ingress, Network Policies, DNS |
| [Kubernetes Doubts](Kubernetes/k8-doubts.md) | Common questions, gotchas, and interview prep |
| [Helm](Kubernetes/Helm/helm.md) | Helm charts, repositories, values, upgrades |
| [Creating Helm Charts](Kubernetes/Helm/creating-helm-chart.md) | Writing your own chart from scratch |
| [Helm Examples](Kubernetes/Helm/helm-eg.md) | Real-world Helm chart examples |
| [Helm vs Kustomize](Kubernetes/helmVkustomize.md) | When to use which tool, comparison |
| [Good Practice Networking](Kubernetes/good-practice-networking.md) | Production networking best practices |
| [Ingress Examples](Kubernetes/examples/ingress-eg.md) | NGINX Ingress controller configurations |

---

## 🎓 CKA (Certified Kubernetes Administrator)

| Note | Description |
|---|---|
| [40 Days of Kubernetes](CKA/%2340daysofkubernetes.md) | Full CKA study plan and curriculum |
| [CKA Overview](CKA/README.md) | CKA exam guide and preparation tips |

---

## 🐳 Docker

| Note | Description |
|---|---|
| [Docker Fundamentals](docker/docker.md) | Overview & index — containers vs VMs, architecture, install, glossary |
| [Docker Commands](docker/commands.md) | Essential Docker CLI cheat sheet |
| [Docker Advanced](docker/docker-more.md) | Volume drivers, multi-stage builds, `Dockerfile.lock` |
| [Dockerfile Deep Dive](docker/dockerfile-deep-dive.md) | Every instruction, build context, layer caching, BuildKit, buildx |
| [Docker Networking](docker/docker-networking.md) | Bridge/host/overlay/macvlan drivers, DNS, port publishing, troubleshooting |
| [Docker Storage & Volumes](docker/docker-storage-and-volumes.md) | Volumes vs bind mounts vs tmpfs, backup/restore, stateful patterns |
| [Docker Compose](docker/docker-compose.md) | Multi-container apps, full YAML reference, profiles, override files |
| [Docker Swarm](docker/docker-swarm.md) | Swarm mode, services, stacks, routing mesh, secrets |
| [Docker Security](docker/docker-security.md) | Non-root, capabilities, seccomp/AppArmor, image scanning, secrets |
| [Docker Registries & Distribution](docker/docker-registries-and-distribution.md) | Docker Hub vs private registries, tagging, auth, multi-arch manifests |
| [Docker Production & Orchestration](docker/docker-production-and-orchestration.md) | Health checks, logging, restart policies, orchestrator comparison, CI/CD |

---

## 🛠️ Infrastructure as Code

| Note | Description |
|---|---|
| [Terraform](Terraform%20and%20CF/terraform.md) | State, providers, resources, modules, workspaces |
| [CloudFormation](Terraform%20and%20CF/cloud-formation.md) | AWS native IaC, stacks, templates, change sets |
| [Terraform Sample Project](Terraform%20and%20CF/sample-project.md) | End-to-end Terraform project walkthrough |
| [Terraform Learn Log](Terraform%20and%20CF/learnlog.md) | Personal notes and learning progress |

---

## 🚀 CI/CD & GitOps

| Note | Description |
|---|---|
| [Jenkins](jenkins.md) | Pipelines, Jenkinsfile, agents, plugins, Blue Ocean |
| [GitOps](GitOps.md) | GitOps principles, Flux, ArgoCD-based workflows |
| [ArgoCD](Argo-cd.md) | ArgoCD setup, apps, sync policies, RBAC |
| [ArgoCD + Helm Integration](argo-cd-integration-helm.md) | Deploy Helm charts via ArgoCD |
| [CI/CD Pipeline Project](Project/cicd-pipeline.md) | Real-world pipeline implementation |

---

## 🚢 Deployment Strategies

| Note | Description |
|---|---|
| [Deployment Strategies Overview](Deployment/deployment-strategies.md) | Index & comparison of all strategies, health checks, rollback, DB migrations |
| [Recreate Deployment](Deployment/recreate-deployment.md) | Simplest strategy — full stop/start, accepted downtime |
| [Rolling Deployment](Deployment/rolling-deployment.md) | Gradual instance replacement, maxSurge/maxUnavailable tuning |
| [Blue-Green Deployment](Deployment/Blue-Green%20Deployment/blue-green-deployment.md) | Two full environments, instant cutover & rollback |
| [Canary Deployment](Deployment/Canary%20Deployment/canary-deployment.md) | Gradual traffic shifting with automated metric-based promotion |
| [A/B Testing](Deployment/ab-testing-deployment.md) | Product/business experimentation vs technical canary release |
| [Shadow Deployment](Deployment/shadow-deployment.md) | Mirror real traffic to a new version with zero user-facing risk |
| [Feature Flags & Progressive Delivery](Deployment/feature-flags-and-progressive-delivery.md) | Decoupling deploy from release, ring-based rollout, flag hygiene |
| [Deployment Anti-Patterns & Checklist](Deployment/deployment-anti-patterns-and-checklist.md) | Common mistakes, strategy decision guide, pre-deploy checklist |

---

## 🌐 Service Mesh & Networking

| Note | Description |
|---|---|
| [Istio](istio.md) | Service mesh, traffic management, mTLS, Envoy |
| [Knative](knative.md) | Serverless on Kubernetes, Knative Serving & Eventing |

---

## 📜 Scripting & Linux

| Note | Description |
|---|---|
| [Bash Scripting](scripting/bash-scripting.md) | Variables, loops, functions, error handling |
| [Shell Scripting for DevOps](scripting/shell-scripting-devops.md) | Automation scripts, real DevOps use cases |
| [Linux Commands](scripting/linux-cmds.md) | Essential Linux CLI commands reference |
| [Linux Permissions](scripting/linux-permissions.md) | chmod, chown, ACLs, umask explained |

---

## ⚙️ Configuration Management

| Note | Description |
|---|---|
| [Chef](Configuration%20Management/chef/chef.md) | Client-server & masterless architecture, cookbooks, recipes, roles, environments, testing |
| [Ansible](Configuration%20Management/ansible/ansible.md) | Agentless architecture, playbooks, roles, collections, vault, dynamic inventory, testing & CI |
| [Puppet](Configuration%20Management/puppet/puppet.md) | Agent/master architecture, manifests, classes/modules, Hiera, roles & profiles, PuppetDB, testing & CI |

---

## 🔧 Tools & Miscellaneous

| Note | Description |
|---|---|
| [Important Concepts](imp_concepts.md) | Cross-cutting DevOps concepts and principles |
| [EFK Stack](EFK.md) | Elasticsearch, Fluentd, Kibana for log aggregation |

---

> 💡 **Tip**: Use the search box in the sidebar to quickly filter notes by keyword.  
> 🎨 **Themes**: Click the theme button (☀️/🌙/⚡/❄️) in the top-right to switch between Light, Dark, Cyberpunk, and Nord themes.
