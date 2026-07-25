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

## 🚀 Continuous Integration

| Note | Description |
|---|---|
| [CI Fundamentals](Continuous%20Integration/ci-fundamentals.md) | Concepts common to every CI tool — pipelines, triggers, matrices, caching, secrets, artifacts |
| [Jenkins](Continuous%20Integration/Jenkins/jenkins.md) | Pipelines, Jenkinsfile, agents, plugins, Blue Ocean |
| [GitHub Actions Overview](Continuous%20Integration/GithubActions/github-actions.md) | Workflows, jobs, actions, runners — core concepts & a first example |
| [GitHub Actions: Syntax & Triggers](Continuous%20Integration/GithubActions/workflow-syntax-and-triggers.md) | Full `on:`/`jobs:`/`if:` reference, contexts, `pull_request_target` security |
| [GitHub Actions: Actions & Marketplace](Continuous%20Integration/GithubActions/actions-and-marketplace.md) | Action types, SHA-pinning security, writing composite/custom actions |
| [GitHub Actions: Matrix & Caching](Continuous%20Integration/GithubActions/matrix-builds-and-caching.md) | `strategy.matrix`, `actions/cache`, artifact upload/download between jobs |
| [GitHub Actions: Secrets & Security](Continuous%20Integration/GithubActions/secrets-and-security.md) | Secret scoping, `GITHUB_TOKEN` permissions, OIDC cloud auth, environment gates |
| [GitHub Actions: Reusable Workflows & CI/CD](Continuous%20Integration/GithubActions/reusable-workflows-and-cicd-patterns.md) | `workflow_call`, full lint→test→build→deploy pipeline, self-hosted runners |
| [CircleCI Overview](Continuous%20Integration/CircleCI/circleci.md) | Cloud vs self-hosted, concept mapping vs Jenkins/GitHub Actions, first example |
| [CircleCI: Config & Pipelines](Continuous%20Integration/CircleCI/config-syntax-and-pipelines.md) | `config.yml` syntax, built-in steps, workflows, triggers, pipeline parameters |
| [CircleCI: Executors & Environments](Continuous%20Integration/CircleCI/executors-and-environments.md) | docker/machine/macos/windows executors, resource classes, Docker-in-Docker |
| [CircleCI: Orbs & Reusability](Continuous%20Integration/CircleCI/orbs-and-reusability.md) | Using/writing orbs, version pinning, reusable commands, YAML anchors |
| [CircleCI: Caching, Parallelism & Workflows](Continuous%20Integration/CircleCI/caching-parallelism-and-workflows.md) | Cache key templating, test splitting, fan-out/fan-in, manual approval jobs |
| [CircleCI: Contexts, Security & CI/CD](Continuous%20Integration/CircleCI/contexts-security-and-cicd-patterns.md) | Contexts vs env vars, full annotated pipeline, self-hosted runners |

---

## 🔁 CD & GitOps

| Note | Description |
|---|---|
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

## 🕸️ Service Mesh

| Note | Description |
|---|---|
| [Service Mesh Overview](Service%20Mesh/service-mesh-overview.md) | Why meshes exist, sidecar pattern intro, when it's (not) worth adopting |
| [Architecture & Sidecar Pattern](Service%20Mesh/service-mesh-architecture-and-sidecar-pattern.md) | Sidecar injection, iptables traffic interception, control vs data plane |
| [Traffic Management](Service%20Mesh/traffic-management.md) | VirtualService/DestinationRule, traffic splitting, retries, timeouts, fault injection |
| [Security & mTLS](Service%20Mesh/security-and-mtls.md) | Mutual TLS, certificate rotation, AuthorizationPolicy, zero-trust networking |
| [Observability in a Service Mesh](Service%20Mesh/observability-in-service-mesh.md) | Automatic metrics, distributed tracing, Kiali service graphs |
| [Resilience Patterns](Service%20Mesh/resilience-patterns.md) | Circuit breaking, outlier detection, stopping cascading failures |
| [Kubernetes Ingress Deep Dive](Service%20Mesh/kubernetes-ingress-deep-dive.md) | Full Ingress spec, IngressClass, TLS/cert-manager, controllers, Gateway API |
| [Istio Gateway & Ingress](Service%20Mesh/istio-gateway-and-ingress.md) | North-south vs east-west, Istio Gateway vs Kubernetes Ingress, ingress gateway internals |
| [Istio vs Linkerd vs Consul](Service%20Mesh/istio-vs-linkerd-vs-consul.md) | Comparing the three major mesh implementations |
| [Service Mesh Production Simulation](Service%20Mesh/service-mesh-production-simulation.md) | Hands-on Istio walkthrough — mTLS, canary split, retries, fault injection, Kiali |
| [Istio (Install Walkthrough)](Service%20Mesh/istio.md) | Practical Minikube setup, istioctl install, proxy injection, addon stack |

---

## 🌐 Serverless & Networking

| Note | Description |
|---|---|
| [Knative](knative.md) | Serverless on Kubernetes, Knative Serving & Eventing |

---

## ⚖️ Load Balancing

| Note | Description |
|---|---|
| [Load Balancing Overview](Load%20Balancing/load-balancing-overview.md) | Core concepts, glossary, where LBs sit in a real architecture |
| [Load Balancing Algorithms](Load%20Balancing/load-balancing-algorithms.md) | Round robin, least connections, IP hash, consistent hashing, latency-based |
| [L4 vs L7 Load Balancing](Load%20Balancing/l4-vs-l7-load-balancing.md) | Transport vs application layer — what each can and can't do |
| [Software Load Balancers](Load%20Balancing/software-load-balancers.md) | NGINX, HAProxy, Envoy — config examples and when to pick which |
| [Cloud Load Balancers](Load%20Balancing/cloud-load-balancers.md) | AWS (ALB/NLB/GLB), Azure (LB/App Gateway/Front Door), GCP compared |
| [Kubernetes Load Balancing](Load%20Balancing/kubernetes-load-balancing.md) | Service types, kube-proxy, Ingress, service mesh load balancing |
| [Health Checks & Failover](Load%20Balancing/health-checks-and-failover.md) | Active vs passive checks, tuning trade-offs, thundering herd, split-brain |
| [Sticky Sessions & Session Affinity](Load%20Balancing/sticky-sessions-and-session-affinity.md) | Cookie/IP-based affinity, when to externalize state instead |
| [DNS & Global Load Balancing](Load%20Balancing/dns-and-global-load-balancing.md) | DNS round robin, GeoDNS, anycast, multi-region GSLB |
| [Load Balancing Production Simulation](Load%20Balancing/load-balancing-production-simulation.md) | Hands-on HAProxy walkthrough — backend failure, draining, flapping, canary weights |

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
