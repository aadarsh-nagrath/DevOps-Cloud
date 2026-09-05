# 📚 DevOps & Cloud Learning Index

Welcome to the centralized index of all notes in this repository. Click any link below to jump directly to that note.

---

## 🎯 Interview Questions & Answers

| Note | Description |
|---|---|
| [Interview Questions — Hub](Interview%20Questions/README.md) | Junior → Mid → Senior interview Q&A across the whole DevOps/Cloud/SRE stack |
| [Linux & Shell Scripting Q&A](Interview%20Questions/01-linux-and-scripting-qna.md) | Filesystem, processes, systemd, namespaces/cgroups, Bash scripting, troubleshooting |
| [Git & Version Control Q&A](Interview%20Questions/02-git-version-control-qna.md) | Git internals, branching strategies, rebase vs merge, recovery, supply-chain signing |
| [Docker Q&A](Interview%20Questions/03-docker-qna.md) | Images/layers, Dockerfile, networking, volumes, multi-stage builds, security |
| [Kubernetes Q&A](Interview%20Questions/04-kubernetes-qna.md) | Architecture, workloads, networking, RBAC, storage, autoscaling, CKA-style scenarios |
| [CI/CD Q&A](Interview%20Questions/05-cicd-jenkins-github-actions-qna.md) | Pipeline concepts, Jenkins, GitHub Actions, GitLab CI, pipeline security, DORA metrics |
| [Terraform & IaC Q&A](Interview%20Questions/06-terraform-and-iac-qna.md) | State & locking, modules, drift, policy as code, multi-environment structure |
| [AWS Cloud Q&A](Interview%20Questions/07-aws-cloud-qna.md) | EC2, S3, IAM, VPC, RDS, Lambda, EKS, Well-Architected, multi-account, DR strategy |
| [Networking & Security Fundamentals Q&A](Interview%20Questions/08-networking-and-security-fundamentals-qna.md) | OSI/TCP-IP, DNS, TLS/mTLS, load balancing, firewalls/WAF, zero trust, DDoS |
| [Ansible & Config Management Q&A](Interview%20Questions/09-ansible-and-config-management-qna.md) | Playbooks, roles, idempotency, Vault, testing with Molecule, scaling to large fleets |
| [Azure & GCP Q&A](Interview%20Questions/10-azure-and-gcp-qna.md) | Resource Groups/Entra ID, AKS/GKE, Azure Policy vs GCP Org Policy, multi-cloud tradeoffs |
| [Monitoring & Observability Q&A](Interview%20Questions/11-monitoring-logging-observability-qna.md) | Metrics/logs/traces, PromQL, cardinality, SLIs/SLOs/error budgets, alerting design |
| [Security & DevSecOps Q&A](Interview%20Questions/12-security-devsecops-qna.md) | SAST/DAST/SCA, secrets management, supply chain security, incident response |
| [SRE, Incident Response & Service Mesh Q&A](Interview%20Questions/13-sre-incident-loadbalancing-servicemesh-qna.md) | Toil, incident command, circuit breakers, chaos engineering, service mesh, multi-region DR |
| [Deployment Strategies, System Design & Behavioral Q&A](Interview%20Questions/14-deployment-systemdesign-behavioral-qna.md) | Rolling/blue-green/canary/shadow deployments, system-design scenarios, STAR-method behavioral prep |
| [Python for DevOps Q&A](Interview%20Questions/15-python-for-devops-qna.md) | subprocess, boto3/AWS SDK, JSON/YAML parsing, testing/mocking, CLI tool design |
| [Agile, Scrum & DevOps Culture Q&A](Interview%20Questions/16-agile-scrum-devops-culture-qna.md) | Scrum/Kanban, CALMS, the Three Ways, Conway's Law, driving cultural change |
| [Messaging, Caching & Distributed Systems Q&A](Interview%20Questions/17-messaging-caching-distributed-systems-qna.md) | Kafka/RabbitMQ/SQS, Redis/CDN caching, CAP theorem, replication/sharding, microservices vs monolith |
| [Practical Scripting Challenges Q&A](Interview%20Questions/18-practical-scripting-challenges-qna.md) | Real live-coding-style tasks with working code (top processes, disk alerts, cert expiry, failover scripts) |
| [Company-Specific Patterns & Behavioral-Plus Q&A](Interview%20Questions/19-company-specific-and-behavioral-plus-qna.md) | Amazon Leadership Principles, Google/SRE-style loops, resume walkthroughs, rapid-fire round-up |

---

## 🔐 Networking & Security Fundamentals

| Note | Description |
|---|---|
| [Networking & Security Fundamentals — Index](Networking%20and%20Security%20Fundamentals/index.md) | How DNS/firewalls/TLS/VPNs/hardening tie together, zero trust, beginner → advanced |
| [Networking Fundamentals](Networking%20and%20Security%20Fundamentals/networking-fundamentals.md) | OSI/TCP-IP model, TCP vs UDP, well-known ports table, subnetting, NAT, BGP, overlay networking |
| [DNS Deep Dive](Networking%20and%20Security%20Fundamentals/dns-deep-dive.md) | Record types, resolution flow, split-horizon DNS, DNSSEC, CoreDNS, troubleshooting |
| [TLS & Certificates](Networking%20and%20Security%20Fundamentals/tls-and-certificates.md) | Handshake (1.2 vs 1.3), PKI/cert chains, cipher suites, mTLS, ACME/Let's Encrypt, cert-manager |
| [Firewalls](Networking%20and%20Security%20Fundamentals/firewalls.md) | iptables/nftables, Security Groups vs NACLs, WAF, NetworkPolicy, eBPF/Cilium, egress filtering |
| [VPNs](Networking%20and%20Security%20Fundamentals/vpns.md) | IPsec, OpenVPN, WireGuard, site-to-site vs remote access, split tunneling, ZTNA (Tailscale/BeyondCorp) |
| [Hardening Practices](Networking%20and%20Security%20Fundamentals/hardening-practices.md) | CIS Benchmarks, SSH hardening, sysctl, SELinux/AppArmor, immutable infra, hardening checklist |

---

## ☁️ Cloud Platforms

| Note | Description |
|---|---|
| [AWS](Cloud/AWS/aws.md) | EC2, S3, EKS, Lambda, IAM, CodePipeline and core AWS services |
| [Azure](Cloud/AZURE/azure.md) | AKS, Azure Pipelines, Entra ID, Azure Monitor, Bicep IaC |
| [GCP](Cloud/GCP/gcp.md) | GKE, Cloud Run, Cloud Build, Cloud Deploy, BigQuery, IAM |
| [Cloud Networking](Cloud/Cloud-Networking-for-DevOps.md) | VPC, Subnets, Load Balancers, DNS, CDN, hybrid connectivity |

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
| [Pulumi](Terraform%20and%20CF/pulumi.md) | IaC in real languages (TS/Python/Go), beginner → advanced, vs Terraform, CrossGuard policy, Automation API |
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
| [ArgoCD](Continuous%20Delivery/ArgoCD/Argo-cd.md) | ArgoCD setup, apps, sync policies, RBAC |
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
| [Knative](Knative/knative.md) | Serverless on Kubernetes, Knative Serving & Eventing |

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

## 📊 Monitoring & Logging

| Note | Description |
|---|---|
| [Monitoring & Logging Master Notes](Monitoring%20and%20Loggin/index.md) | Concepts tying it all together, beginner → advanced, folder map |
| [Prometheus](Monitoring%20and%20Loggin/prometheous/prometheus.md) | Metrics collection, PromQL, alerting |
| [Grafana](Monitoring%20and%20Loggin/grafana/grafana.md) | Visualization, dashboards, alerting |
| [Loki](Monitoring%20and%20Loggin/loki/loki.md) | Label-indexed log aggregation, LogQL, PLG/LGTM stack, beginner → advanced |
| [Elasticsearch](Monitoring%20and%20Loggin/elasticsearch/elasticsearch.md) | Search & analytics engine — storage layer of ELK |
| [ELK / Logstash](Monitoring%20and%20Loggin/elk/logstash.md) | ELK stack overview, ingest/transform pipeline |
| [Kibana](Monitoring%20and%20Loggin/kibana/kibana.md) | Visualization layer for Elasticsearch |
| [Fluentd](Monitoring%20and%20Loggin/fluentid/fluentd.md) | Unified logging layer / log forwarder |
| [Datadog](Monitoring%20and%20Loggin/datadog/datadog.md) | Commercial all-in-one observability SaaS |

---

## 🔒 Security in DevOps

| Note | Description |
|---|---|
| [DevSecOps Overview](Security%20in%20DevOps/devsecops-overview.md) | Shift-left model, cloud shared responsibility, least privilege/defense in depth/zero trust, glossary |
| [SAST, DAST & Code Scanning](Security%20in%20DevOps/sast-dast-and-code-scanning.md) | Static/dynamic/dependency scanning, pipeline placement, secret scanning |
| [Container & Image Security](Security%20in%20DevOps/container-and-image-security.md) | Vulnerability scanning, base image trade-offs, SBOM, signing, admission control |
| [IAM & Least Privilege](Security%20in%20DevOps/iam-and-least-privilege.md) | Cross-cloud IAM, Kubernetes RBAC, workload identity (IRSA/Workload Identity), JIT access |
| [Secrets Management](Security%20in%20DevOps/secrets-management.md) | Vault dynamic secrets, Kubernetes Secret limitations, external-secrets patterns |
| [Supply Chain Security](Security%20in%20DevOps/supply-chain-security.md) | Compromised dependency/CI scenarios, SLSA framework, provenance & attestation |
| [Security in CI/CD Pipelines](Security%20in%20DevOps/security-in-cicd-pipelines.md) | Full annotated secure pipeline, fail-vs-warn gating strategy, compliance-as-code |

---

## 💥 Chaos Engineering

| Note | Description |
|---|---|
| [Chaos Engineering Overview](Chaos%20Engineering/chaos-engineering-overview.md) | Origin story, core philosophy, Principles of Chaos Engineering, glossary |
| [Designing Chaos Experiments](Chaos%20Engineering/designing-chaos-experiments.md) | Hypothesis-driven structure, blast radius progression, fault categories |
| [Chaos Engineering Tools](Chaos%20Engineering/chaos-engineering-tools.md) | Chaos Monkey, Chaos Mesh, LitmusChaos, Gremlin, AWS FIS compared |
| [Game Days & Organizational Practice](Chaos%20Engineering/game-days-and-organizational-practice.md) | Running a Game Day, roles, building organizational buy-in |
| [Chaos Engineering Production Simulation](Chaos%20Engineering/chaos-engineering-in-production-simulation.md) | Hands-on Chaos Mesh walkthrough — pod kill, latency injection, good vs bad experiment design |

---

## 💾 Backup & Disaster Recovery

| Note | Description |
|---|---|
| [Backup & DR Overview](Backup%20and%20Disaster%20Recovery/backup-and-dr-overview.md) | Backup vs DR, RTO/RPO, glossary |
| [Backup Strategies & Types](Backup%20and%20Disaster%20Recovery/backup-strategies-and-types.md) | Full/incremental/differential, 3-2-1 rule, immutable backups, restore testing |
| [Database Backup & Restore](Backup%20and%20Disaster%20Recovery/database-backup-and-restore.md) | Logical vs physical backups, point-in-time recovery, replication vs backup |
| [Disaster Recovery Strategies](Backup%20and%20Disaster%20Recovery/disaster-recovery-strategies.md) | Backup&Restore/Pilot Light/Warm Standby/Multi-Site tiers, cost/RTO mapping |
| [DR Planning, Testing & Runbooks](Backup%20and%20Disaster%20Recovery/dr-planning-testing-and-runbooks.md) | DR plan documents, drill types, worked failover runbook, anti-patterns |

---

## 💰 FinOps & Cost Optimization

| Note | Description |
|---|---|
| [FinOps Overview](FinOps%20and%20Cost%20Optimization/finops-overview.md) | Inform/Optimize/Operate framework, OpEx cost dynamics, glossary |
| [Cost Visibility & Allocation](FinOps%20and%20Cost%20Optimization/cost-visibility-and-allocation.md) | Tagging, showback vs chargeback, native cloud cost tools, Kubecost |
| [Compute Cost Optimization](FinOps%20and%20Cost%20Optimization/compute-cost-optimization.md) | Right-sizing, Reserved/Savings Plans, spot instances, Kubernetes cost mechanics |
| [Storage & Data Transfer Costs](FinOps%20and%20Cost%20Optimization/storage-and-data-transfer-costs.md) | Storage tiering, egress/cross-AZ costs, snapshot sprawl, CDN caching |
| [FinOps Culture & Governance](FinOps%20and%20Cost%20Optimization/finops-culture-and-governance.md) | Cost-in-CI review, guardrails, ownership model, cost anti-patterns |

---

## 📋 IaC Testing & Policy as Code

| Note | Description |
|---|---|
| [IaC Testing Overview](IaC%20Testing%20and%20Policy%20as%20Code/iac-testing-overview.md) | Why IaC needs testing, the testing pyramid applied to infrastructure |
| [Linting & Static Analysis](IaC%20Testing%20and%20Policy%20as%20Code/linting-and-static-analysis.md) | terraform fmt/validate, TFLint, Checkov, tfsec with worked examples |
| [Policy as Code with OPA & Conftest](IaC%20Testing%20and%20Policy%20as%20Code/policy-as-code-with-opa-and-conftest.md) | Rego from first principles, Conftest, OPA Gatekeeper vs Kyverno |
| [Kyverno In Depth](IaC%20Testing%20and%20Policy%20as%20Code/kyverno.md) | Architecture, validate/mutate/generate/verifyImages, context/variables, background scanning, policy reports, exceptions, CLI testing, HA & security |
| [Terraform Testing Frameworks](IaC%20Testing%20and%20Policy%20as%20Code/terraform-testing-frameworks.md) | Plan review, Terratest, native `terraform test`, module testing |
| [Drift Detection & Continuous Validation](IaC%20Testing%20and%20Policy%20as%20Code/drift-detection-and-continuous-validation.md) | What drift is, detection pipelines, prevention, full combined pipeline |

---

## 🚨 Incident Response & On-Call

| Note | Description |
|---|---|
| [Incident Response Overview](Incident%20Response%20and%20On-Call/incident-response-overview.md) | Severity levels, incident lifecycle, glossary (MTTA/MTTD/MTTR) |
| [Detection & Alerting](Incident%20Response%20and%20On-Call/detection-and-alerting.md) | Good vs bad alerts, alert fatigue, SLIs/SLOs/error budgets, escalation |
| [Incident Command & Response](Incident%20Response%20and%20On-Call/incident-command-and-response.md) | IC role, incident roles, worked SEV1 timeline, mitigate-first mindset |
| [Postmortems & Blameless Culture](Incident%20Response%20and%20On-Call/postmortems-and-blameless-culture.md) | Blameless philosophy, postmortem template, the follow-up-item trap |
| [On-Call Practices & Sustainability](Incident%20Response%20and%20On-Call/on-call-practices-and-sustainability.md) | Rotation design, fairness/burnout, runbooks, reducing on-call burden |

---

## 🔧 Tools & Miscellaneous

| Note | Description |
|---|---|
| [Important Concepts](imp_concepts.md) | Cross-cutting DevOps concepts and principles |

---

> 💡 **Tip**: Use the search box in the sidebar to quickly filter notes by keyword.  
> 🎨 **Themes**: Click the theme button (☀️/🌙/⚡/❄️) in the top-right to switch between Light, Dark, Cyberpunk, and Nord themes.
