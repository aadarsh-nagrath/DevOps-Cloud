# Ansible, AWS Ops, Fintech Payments & Production Scenarios — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. A combined question bank: a 41-question Ansible set, AWS/EC2/EBS/S3/database ops, Docker and Kubernetes production questions, Linux/ITIL screening questions, a three-round fintech (UPI payments) SRE loop, Git recovery scenarios, and senior "what would you do" scenarios. Questions already answered elsewhere in the hub are linked in the tables. Everything else is answered in full below, with an ID (e.g. **AN-4**) you can find in the Table of Contents.

---

## Already answered elsewhere

### Ansible
| Question | Where |
|---|---|
| Why is Ansible agentless? How does it connect? | [09 Q2](./09-ansible-and-config-management-qna.md). Connection details in [AN-1](#ansible) |
| What is idempotency? Example? | [09 Q6](./09-ansible-and-config-management-qna.md), [19 Q15](./19-company-specific-and-behavioral-plus-qna.md) |
| Ad-hoc commands vs playbooks? | [09 Q7](./09-ansible-and-config-management-qna.md) |
| Role directory structure? | [09 Q11](./09-ansible-and-config-management-qna.md). Tree in [AN-16](#ansible) |
| `defaults` vs `vars`? | [09 Q12](./09-ansible-and-config-management-qna.md) |
| What are Ansible Roles? | [09 Q11](./09-ansible-and-config-management-qna.md) |
| What is Ansible Vault? | [09 Q16](./09-ansible-and-config-management-qna.md). CI/CD usage in [AN-18](#ansible) |
| `--check` and `--diff`? | [09 Q15](./09-ansible-and-config-management-qna.md) |
| Molecule and ansible-lint? | [09 Q22](./09-ansible-and-config-management-qna.md). Commands in [AN-22](#ansible) |
| Ansible vs Terraform, and combining them | [37 T-1, T-2](./37-devops-fundamentals-screening-round-qna.md), [09 Q20](./09-ansible-and-config-management-qna.md) |
| Managing Windows hosts via WinRM | [22 Q9](./22-windows-proxy-vapt-jira-qna.md) |
| Structuring dev/stage/prod in one repo | [09 Q17](./09-ansible-and-config-management-qna.md). Layout in [AN-31](#ansible) |
| Ansible inventory / playbooks (basics) | [09 Q3–4](./09-ansible-and-config-management-qna.md) |
| Everything else in the Ansible list | Answered in [AN-1 to AN-33](#ansible) below |

### AWS, EC2, Linux & networking
| Question | Where |
|---|---|
| EC2 running but app unreachable / not reachable / SG open but still unreachable | [07 Q36](./07-aws-cloud-qna.md), [36 Q49](./36-aws-networking-deep-dive-qna.md), [36 Q43](./36-aws-networking-deep-dive-qna.md) |
| "No space left on device" but `df -h` shows free space | [01 Q40](./01-linux-and-scripting-qna.md), [38 L-5](./38-vpc-terraform-grafana-linux-scenarios-qna.md) (inodes) |
| App fails after moving from public to private subnet | [36 Q48](./36-aws-networking-deep-dive-qna.md) (no NAT route), [36 Q27](./36-aws-networking-deep-dive-qna.md) (VPC endpoints) |
| Design HA architecture / multi-AZ deployment | [07 Q23](./07-aws-cloud-qna.md), [24 Q22, Q45, Q76](./24-aws-deep-dive-qna.md) |
| Secure an AWS environment / best practices for production | [07 Q24, Q29, Q30](./07-aws-cloud-qna.md), [24 Q46](./24-aws-deep-dive-qna.md) |
| Sudden traffic spikes / auto-scaling strategy for high traffic | [24 Q48, Q83](./24-aws-deep-dive-qna.md), [27 Q17](./27-cloud-architecture-scenarios-qna.md) |
| Cost-optimized architecture / cut costs 30% | [24 Q44, Q80](./24-aws-deep-dive-qna.md), [27 Q7](./27-cloud-architecture-scenarios-qna.md), [07 Q31](./07-aws-cloud-qna.md) |
| S3 bucket access denied | [32 R2-05](./32-two-round-devops-aws-interview-qna.md) |
| Backup and disaster recovery in AWS | [07 Q28](./07-aws-cloud-qna.md), [24 Q43, Q77](./24-aws-deep-dive-qna.md), [32 R2-04](./32-two-round-devops-aws-interview-qna.md) |
| Monitor infrastructure with CloudWatch | [07 Q11, Q37](./07-aws-cloud-qna.md), [24 Q33](./24-aws-deep-dive-qna.md) |
| Troubleshoot VPC connectivity | [36 Q43, Q48–54](./36-aws-networking-deep-dive-qna.md) |
| CI/CD pipeline for AWS deployments | [24 Q50, Q55–56](./24-aws-deep-dive-qna.md) |
| Manage secrets in AWS | [24 Q32](./24-aws-deep-dive-qna.md), [37 A-1](./37-devops-fundamentals-screening-round-qna.md) |
| Least privilege with IAM | [07 Q16–17](./07-aws-cloud-qna.md), [24 Q28–29](./24-aws-deep-dive-qna.md) |
| Zero-downtime deployment in AWS | [28 Q10](./28-production-scenarios-rapid-round-qna.md), [24 Q12](./24-aws-deep-dive-qna.md) (connection draining), [14 Q2–4](./14-deployment-systemdesign-behavioral-qna.md) |
| Debug a complete production outage in AWS | [24 Q82](./24-aws-deep-dive-qna.md), [23-how Q19](./23-how-it-works-internals-qna.md) |
| What is a NAT Gateway + practical use case | [36 Q12, Q16](./36-aws-networking-deep-dive-qna.md) |
| VPC architecture used in your project / Terraform script for a VPC | [36 Q5, Q8, Q56](./36-aws-networking-deep-dive-qna.md) |
| IAM Roles vs IAM Policies | [31 Q14](./31-core-devops-scenarios-gap-fill-qna.md) |
| What is Direct Connect? | [36 Q34–35](./36-aws-networking-deep-dive-qna.md), [24 Q39](./24-aws-deep-dive-qna.md). Gateway & hosted/dedicated in [NW-1, NW-2](#aws-networking-s3-and-databases) |
| Regions, Availability Zones, IAM | [07 Q2, Q5](./07-aws-cloud-qna.md), [24 Q14](./24-aws-deep-dive-qna.md) |
| Security groups: inbound and outbound rules | [07 Q8](./07-aws-cloud-qna.md), [36 Q18, Q20](./36-aws-networking-deep-dive-qna.md) |
| S3 lifecycle/expiration rules, storage classes, moving objects between classes | [24 Q6, Q19](./24-aws-deep-dive-qna.md), [07 Q4](./07-aws-cloud-qna.md) |
| Benefits of S3 over EBS | [24 Q3](./24-aws-deep-dive-qna.md), [07 Q19](./07-aws-cloud-qna.md). Short table in [S3-1](#aws-networking-s3-and-databases) |
| CloudFormation and Terraform | [33 Q9–18](./33-platform-engineering-deep-dive-qna.md), [24 Q57](./24-aws-deep-dive-qna.md) |
| Load balancers, ALB vs NLB, reverse vs forward proxy | [24 Q25](./24-aws-deep-dive-qna.md), [07 Q35](./07-aws-cloud-qna.md), [22 Q3](./22-windows-proxy-vapt-jira-qna.md), [08 Q16](./08-networking-and-security-fundamentals-qna.md) |
| Web servers and HTTPD (Apache) | [37 WS-1, WS-3, WS-4](./37-devops-fundamentals-screening-round-qna.md) |
| Secure an S3 bucket | [24 Q20](./24-aws-deep-dive-qna.md). Static-website variant in [S3-3](#aws-networking-s3-and-databases) |
| What is `/proc`? | [01 Q21](./01-linux-and-scripting-qna.md) |
| `chown` vs `chmod` | [01 Q5](./01-linux-and-scripting-qna.md) |
| Everyday Linux operations commands | [01 Q6–8, Q20, Q63](./01-linux-and-scripting-qna.md), [22 Q2](./22-windows-proxy-vapt-jira-qna.md) |
| `ps` vs `top`, CPU utilization, memory-hungry processes, disk I/O | [38 L-3, L-4](./38-vpc-terraform-grafana-linux-scenarios-qna.md), [28 Q01](./28-production-scenarios-rapid-round-qna.md), [18 Q1](./18-practical-scripting-challenges-qna.md) |
| `df -h` vs `du -sh` | [01 Q20](./01-linux-and-scripting-qna.md) |
| `kill` vs `kill -9` | [01 Q11](./01-linux-and-scripting-qna.md) |
| `systemctl`, is a service running? | [01 Q28](./01-linux-and-scripting-qna.md), [38 L-7](./38-vpc-terraform-grafana-linux-scenarios-qna.md) |
| Hard links vs symbolic links | [01 Q3](./01-linux-and-scripting-qna.md) |
| TCP vs UDP, three-way handshake, DNS, HTTP vs HTTPS | [08 Q2, Q3, Q7, Q9](./08-networking-and-security-fundamentals-qna.md), [23-how Q14](./23-how-it-works-internals-qna.md) |
| Is a port listening? `netstat` / `ss` | [01 Q29, Q58](./01-linux-and-scripting-qna.md) |
| Request flow from browser to a Kubernetes pod | [31 Q01](./31-core-devops-scenarios-gap-fill-qna.md), [04 Q26](./04-kubernetes-qna.md) |
| Load balancer vs reverse proxy vs Ingress | [08 Q12, Q16](./08-networking-and-security-fundamentals-qna.md), [04 Q24](./04-kubernetes-qna.md), [33 Q43](./33-platform-engineering-deep-dive-qna.md) |
| Debug high CPU, memory or disk on Linux | [28 Q01](./28-production-scenarios-rapid-round-qna.md) |

### Linux & systems scenarios (the 20-question set, asked twice in the list)
| # | Question | Where |
|---|---|---|
| 1 | CPU is 30% but the app is extremely slow | [34 Q8](./34-onprem-banking-infrastructure-qna.md), [01 Q71](./01-linux-and-scripting-qna.md) |
| 2 | Disk at 95%, app failing | [13 Q26](./13-sre-incident-loadbalancing-servicemesh-qna.md), [34 Q7](./34-onprem-banking-infrastructure-qna.md) |
| 3 | A process keeps getting killed | [01 Q46](./01-linux-and-scripting-qna.md), [38 S-3](./38-vpc-terraform-grafana-linux-scenarios-qna.md) |
| 4 | Memory grows over several days | [01 Q73](./01-linux-and-scripting-qna.md) |
| 5 | Server unreachable: network, OS or app? | [38 L-1](./38-vpc-terraform-grafana-linux-scenarios-qna.md), [01 Q69](./01-linux-and-scripting-qna.md) |
| 6 | Pipeline succeeds, new version isn't running | [38 R-1](./38-vpc-terraform-grafana-linux-scenarios-qna.md) |
| 7 | Works in staging, fails in production | [CI-2](#ci-cd-and-deployments) below |
| 8 | Errors only during peak traffic; rollback fixes it | [CI-3](#ci-cd-and-deployments) below |
| 9 | 30-minute pipeline: find the bottleneck | [05 Q24](./05-cicd-jenkins-github-actions-qna.md), [30 Q03](./30-azure-production-scenarios-qna.md), [20 Q15](./20-devops-roadmap-gap-fill-qna.md) |
| 10 | Zero-downtime deployment strategy | [28 Q10](./28-production-scenarios-rapid-round-qna.md), [14 Q1–4](./14-deployment-systemdesign-behavioral-qna.md) |
| 11 | Pods Running, users get 5xx | [31 Q05](./31-core-devops-scenarios-gap-fill-qna.md), [20 Q14](./20-devops-roadmap-gap-fill-qna.md), [13 Q24](./13-sre-incident-loadbalancing-servicemesh-qna.md) |
| 12 | Pod in CrashLoopBackOff | [04 Q37, Q49–50](./04-kubernetes-qna.md), [28 Q05](./28-production-scenarios-rapid-round-qna.md) |
| 13 | Node becomes NotReady | [38 R-5](./38-vpc-terraform-grafana-linux-scenarios-qna.md), [04 Q56, Q64](./04-kubernetes-qna.md) |
| 14 | CPU/memory normal, latency up | [38 R-4](./38-vpc-terraform-grafana-linux-scenarios-qna.md), [30 Q10](./30-azure-production-scenarios-qna.md) |
| 15 | Container works locally, fails after deploy | [CI-4](#ci-cd-and-deployments) below |
| 16 | Terraform shows no drift, but someone changed infra manually | [TF-3](#terraform) below |
| 17 | Provisioning succeeds, services can't talk to each other | [28 Q08](./28-production-scenarios-rapid-round-qna.md), [36 Q43](./36-aws-networking-deep-dive-qna.md), [04 Q53](./04-kubernetes-qna.md) |
| 18 | Monitoring healthy, customers report failures | [OB-1](#observability-and-incidents) below |
| 19 | Thousands of alerts at once: find the primary failure | [38 R-7](./38-vpc-terraform-grafana-linux-scenarios-qna.md), [35 Q9](./35-observability-rca-scripting-go-qna.md) (inhibition) |
| 20 | Deploys getting faster, incidents increasing | [CI-5](#ci-cd-and-deployments) below |

### Docker
| Question | Where |
|---|---|
| How Docker works internally / what happens on `docker run` | [23-how Q6](./23-how-it-works-internals-qna.md), [03 Q34](./03-docker-qna.md) |
| Optimize images / reduce image size / multi-stage builds | [03 Q16–20, Q30–31](./03-docker-qna.md), [28 Q04](./28-production-scenarios-rapid-round-qna.md) |
| CMD vs ENTRYPOINT / purpose of a Dockerfile | [03 Q4–5](./03-docker-qna.md) |
| Volumes in production | [03 Q10–11, Q29](./03-docker-qna.md) |
| Docker networking | [03 Q24–25](./03-docker-qna.md) |
| Secure containers / scan images for vulnerabilities | [03 Q22, Q28, Q38](./03-docker-qna.md), [12 Q14](./12-security-devsecops-qna.md), [28 Q19](./28-production-scenarios-rapid-round-qna.md) |
| Container crashes / container keeps restarting | [28 Q03](./28-production-scenarios-rapid-round-qna.md), [03 Q40](./03-docker-qna.md), [04 Q50](./04-kubernetes-qna.md) (no errors in logs) |
| Docker Compose in real projects | [03 Q12](./03-docker-qna.md) |
| Docker in CI/CD | [03 Q38, Q41](./03-docker-qna.md), [20 Q15](./20-devops-roadmap-gap-fill-qna.md) |
| Image vs container / volume / Dockerfile basics | [03 Q3, Q4, Q10](./03-docker-qna.md) |
| Everything else in the Docker list | Answered in [DK-1 to DK-8](#docker) below |

### Kubernetes
| Question | Where |
|---|---|
| Kubernetes architecture, master vs worker, API server, etcd, scheduler, kubelet | [04 Q1–4, Q45](./04-kubernetes-qna.md), [23-how Q1](./23-how-it-works-internals-qna.md) |
| Pod vs Node, ReplicaSet, Deployment / StatefulSet / DaemonSet / Job | [04 Q2, Q5, Q13, Q18–20](./04-kubernetes-qna.md) |
| Services (ClusterIP / NodePort / LoadBalancer), Ingress controller | [04 Q6–7, Q24–25](./04-kubernetes-qna.md), [33 Q43–45](./33-platform-engineering-deep-dive-qna.md) |
| PV / PVC, ConfigMaps vs Secrets, managing them across environments | [04 Q9, Q32, Q40](./04-kubernetes-qna.md), [20 Q3, Q11–12](./20-devops-roadmap-gap-fill-qna.md) |
| Requests and limits, HPA, HPA vs Cluster Autoscaler | [04 Q28, Q30, Q61](./04-kubernetes-qna.md), [28 Q06](./28-production-scenarios-rapid-round-qna.md), [23-how Q5](./23-how-it-works-internals-qna.md) |
| Readiness vs liveness, how K8s determines pod health | [04 Q15](./04-kubernetes-qna.md), [23-how Q4](./23-how-it-works-internals-qna.md) |
| Self-healing at pod and node level / automated recovery of an unresponsive app | [23-how Q16](./23-how-it-works-internals-qna.md), [04 Q64](./04-kubernetes-qna.md), [01 Q76](./01-linux-and-scripting-qna.md) |
| Service discovery | [23-how Q3](./23-how-it-works-internals-qna.md) |
| Pods Running but Service returns 503 | [20 Q14](./20-devops-roadmap-gap-fill-qna.md), [13 Q24](./13-sre-incident-loadbalancing-servicemesh-qna.md), [33 Q47, Q51](./33-platform-engineering-deep-dive-qna.md) |
| CrashLoopBackOff / ImagePullBackOff | [04 Q37–38, Q49–50](./04-kubernetes-qna.md), [28 Q05](./28-production-scenarios-rapid-round-qna.md) |
| PodDisruptionBudgets | [20 Q4](./20-devops-roadmap-gap-fill-qna.md) |
| etcd role and backup | [04 Q45](./04-kubernetes-qna.md), [33 Q56](./33-platform-engineering-deep-dive-qna.md) |
| Upgrade prerequisites | [33 Q55](./33-platform-engineering-deep-dive-qna.md), [04 Q47](./04-kubernetes-qna.md) |
| RBAC | [04 Q33–34](./04-kubernetes-qna.md) |
| Kubernetes Operators | [35 Q32](./35-observability-rca-scripting-go-qna.md) |
| Namespace, `kubectl`, `kubectl logs` vs `describe` | [04 Q8, Q12](./04-kubernetes-qna.md) |
| Amazon EKS, managed vs self-managed node groups, IAM integration | [07 Q21](./07-aws-cloud-qna.md), [33 Q52, Q54–55](./33-platform-engineering-deep-dive-qna.md), [29 Q7, Q13](./29-jenkins-k8s-helm-interview-rounds-qna.md) |
| Prometheus + Grafana for K8s | [11 Q18–20](./11-monitoring-logging-observability-qna.md) |
| Centralized logging for microservices | [30 Q05](./30-azure-production-scenarios-qna.md), [11 Q7, Q17](./11-monitoring-logging-observability-qna.md) |
| Chaos engineering in production | [13 Q8, Q14](./13-sre-incident-loadbalancing-servicemesh-qna.md), [`../Chaos Engineering/`](../Chaos%20Engineering/) |
| Docker vs Kubernetes | [37 K-1](./37-devops-fundamentals-screening-round-qna.md), [04 Q1](./04-kubernetes-qna.md) |
| Manifests, HA cluster, securing a cluster (PSP is gone), 504 with healthy pods, CoreDNS broken after upgrade | Answered in [K8-1 to K8-5](#kubernetes) below |

### Terraform & CI/CD
| Question | Where |
|---|---|
| Terraform plans to recreate a production EC2 instance | [33 Q8](./33-platform-engineering-deep-dive-qna.md), [38 TF-1](./38-vpc-terraform-grafana-linux-scenarios-qna.md) |
| Drift detection | [06 Q20](./06-terraform-and-iac-qna.md), [28 Q14](./28-production-scenarios-rapid-round-qna.md) |
| Drift makes apply fail on live, critical infra | [38 R-3](./38-vpc-terraform-grafana-linux-scenarios-qna.md), [28 Q14](./28-production-scenarios-rapid-round-qna.md) |
| Workspaces and modules for large projects / module structure for multiple environments | [06 Q16, Q21–22](./06-terraform-and-iac-qna.md), [31 Q10](./31-core-devops-scenarios-gap-fill-qna.md) |
| State locking and conflicts | [06 Q12–13, Q28](./06-terraform-and-iac-qna.md), [33 Q6](./33-platform-engineering-deep-dive-qna.md) |
| Testing Terraform | [33 Q5](./33-platform-engineering-deep-dive-qna.md) |
| `count` vs `for_each`, state, plan vs apply, providers, modules, variables vs outputs | [06 Q4–9, Q18](./06-terraform-and-iac-qna.md) |
| Jenkins succeeds but old version still running / traffic still on old version | [38 R-1](./38-vpc-terraform-grafana-linux-scenarios-qna.md) |
| Roll back a bad release safely / deploy failed halfway with mixed versions | [05 Q31](./05-cicd-jenkins-github-actions-qna.md), [31 Q20](./31-core-devops-scenarios-gap-fill-qna.md), [30 Q12](./30-azure-production-scenarios-qna.md) |
| CI/CD from commit to production / design for microservices / 50+ microservices | [32 R1-01](./32-two-round-devops-aws-interview-qna.md), [05 Q28, Q35](./05-cicd-jenkins-github-actions-qna.md), [23-how Q10](./23-how-it-works-internals-qna.md) |
| Security tools in the pipeline / SAST and DAST ("SATS and DATS") | [12 Q8, Q11](./12-security-devsecops-qna.md), [28 Q19](./28-production-scenarios-rapid-round-qna.md), [05 Q37](./05-cicd-jenkins-github-actions-qna.md) |
| Pipeline takes 25 / 40 minutes; get it under 10 | [05 Q24](./05-cicd-jenkins-github-actions-qna.md), [30 Q03](./30-azure-production-scenarios-qna.md), [20 Q15](./20-devops-roadmap-gap-fill-qna.md) |
| Secrets in CI/CD | [28 Q18](./28-production-scenarios-rapid-round-qna.md), [33 Q24](./33-platform-engineering-deep-dive-qna.md), [05 Q36](./05-cicd-jenkins-github-actions-qna.md) |
| Artifacts in CI/CD | [05 Q4, Q21](./05-cicd-jenkins-github-actions-qna.md) |
| Troubleshoot pipeline failures / stable pipeline suddenly fails | [28 Q09](./28-production-scenarios-rapid-round-qna.md), [05 Q26](./05-cicd-jenkins-github-actions-qna.md), [29 Q5](./29-jenkins-k8s-helm-interview-rounds-qna.md) |
| Jenkins controller vs agent, pipelines, Jenkinsfile, Declarative vs Scripted, shared libraries | [05 Q11–13](./05-cicd-jenkins-github-actions-qna.md), [29 Q2](./29-jenkins-k8s-helm-interview-rounds-qna.md), [33 Q19–22](./33-platform-engineering-deep-dive-qna.md) |
| Everything else | Answered in [TF-1 to TF-4](#terraform) and [CI-1 to CI-6](#ci-cd-and-deployments) below |

### Monitoring, incidents & senior scenarios
| Question | Where |
|---|---|
| Logs vs metrics vs traces / monitoring vs observability | [11 Q1–2](./11-monitoring-logging-observability-qna.md), [23-how Q18](./23-how-it-works-internals-qna.md) |
| Sudden latency spike / 200 ms → 3 s after a deploy | [28 Q15, Q21](./28-production-scenarios-rapid-round-qna.md), [35 Q14](./35-observability-rca-scripting-go-qna.md), [13 Q25](./13-sre-incident-loadbalancing-servicemesh-qna.md) |
| Monitoring and alerting strategy / which tools you've used | [11 Q18–23](./11-monitoring-logging-observability-qna.md), [35 Q8–12](./35-observability-rca-scripting-go-qna.md) |
| Design a Grafana dashboard | [38 G-8, G-14](./38-vpc-terraform-grafana-linux-scenarios-qna.md) |
| Prometheus metrics for troubleshooting | [28 Q15](./28-production-scenarios-rapid-round-qna.md), [11 Q11–12](./11-monitoring-logging-observability-qna.md) |
| HA monitoring platform | [20 Q23](./20-devops-roadmap-gap-fill-qna.md) |
| Production issue you resolved / most challenging incident / RCA | [31 Q19](./31-core-devops-scenarios-gap-fill-qna.md), [35 Q18–20](./35-observability-rca-scripting-go-qna.md), [14 Q17](./14-deployment-systemdesign-behavioral-qna.md) |
| How you handle a production incident | [23-how Q19](./23-how-it-works-internals-qna.md), [13 Q12](./13-sre-incident-loadbalancing-servicemesh-qna.md) |
| SLA, post-incident review | [11 Q14](./11-monitoring-logging-observability-qna.md), [13 Q4](./13-sre-incident-loadbalancing-servicemesh-qna.md) |
| Critical vulnerability in a production image | [38 R-9](./38-vpc-terraform-grafana-linux-scenarios-qna.md) |
| Secret committed to GitHub and already cloned | [12 Q21](./12-security-devsecops-qna.md), [02 Q50](./02-git-version-control-qna.md) |
| Image security, RBAC, secrets in prod, DR strategy, cost reduction | [12 Q14](./12-security-devsecops-qna.md), [04 Q33](./04-kubernetes-qna.md), [24 Q32](./24-aws-deep-dive-qna.md), [07 Q28](./07-aws-cloud-qna.md), [07 Q31](./07-aws-cloud-qna.md) |
| A failure you introduced / mistake in production | [19 Q11](./19-company-specific-and-behavioral-plus-qna.md) |
| Day-to-day work of a DevOps engineer | [37 D-1](./37-devops-fundamentals-screening-round-qna.md) |
| A project delivered end to end | [19 Q10](./19-company-specific-and-behavioral-plus-qna.md), [32 R1-01](./32-two-round-devops-aws-interview-qna.md) |
| Root Cause Analysis | [35 Q18–19](./35-observability-rca-scripting-go-qna.md) |
| Everything else | Answered in [OB-1 to OB-4](#observability-and-incidents) and [IT-1 to IT-3](#observability-and-incidents) below |

### Azure / AKS
| Question | Where |
|---|---|
| CI/CD for 50+ microservices across Dev/Staging/Prod (Azure DevOps or GitHub Actions) | [05 Q28, Q32](./05-cicd-jenkins-github-actions-qna.md), [25 Q46](./25-azure-deep-dive-qna.md), [20 Q10](./20-devops-roadmap-gap-fill-qna.md) |
| Production-grade AKS architecture | [25 Q49, Q55](./25-azure-deep-dive-qna.md), [20 Q19](./20-devops-roadmap-gap-fill-qna.md), [28 Q22](./28-production-scenarios-rapid-round-qna.md) |
| AKS pods restarting and latency increasing / intermittent latency spikes with normal CPU | [30 Q01, Q04, Q10](./30-azure-production-scenarios-qna.md) |
| AKS security & governance (non-root, secrets, RBAC) | [25 Q55, Q39](./25-azure-deep-dive-qna.md). Networking side in [AZ-1](#azure-aks) |

### Git
| Question | Where |
|---|---|
| Credentials pushed to Git | [02 Q50](./02-git-version-control-qna.md), [12 Q21](./12-security-devsecops-qna.md) |
| merge vs rebase (which in production) | [02 Q11, Q29–30, Q39](./02-git-version-control-qna.md) |
| Resolve merge conflicts | [02 Q12–13](./02-git-version-control-qna.md) |
| Roll back a production deploy with Git | [02 Q18–19](./02-git-version-control-qna.md) |
| Recover a deleted branch / recover after `reset --hard` | [02 Q34–35](./02-git-version-control-qna.md) |
| fetch vs pull | [02 Q14](./02-git-version-control-qna.md) |
| `git bisect` | [02 Q40](./02-git-version-control-qna.md) |
| cherry-pick for a hotfix | [02 Q32](./02-git-version-control-qna.md) |
| What happens on `add`, `commit`, `push` | [02 Q4, Q27](./02-git-version-control-qna.md) |
| Branching strategy for dev/staging/prod | [02 Q38, Q44](./02-git-version-control-qna.md), [29 Q10](./29-jenkins-k8s-helm-interview-rounds-qna.md) |
| CI fails on Git auth/permissions | [32 R2-08](./32-two-round-devops-aws-interview-qna.md) |
| Detached HEAD | [02 Q24](./02-git-version-control-qna.md) |
| Undo last commit, keep changes | [02 Q21](./02-git-version-control-qna.md) |
| Everything else | Answered in [GT-1 to GT-5](#python-git-and-behavioral) below |

> **Not interview questions:** the `fzf` / `zoxide` / `atuin` / `tmux` lines in the source list were setup notes, so they're left out.

---

## Table of Contents
- [Ansible](#ansible) — AN-1 to AN-33
- [Linux and Networking](#linux-and-networking) — LX-1 to LX-5
- [EC2 and EBS](#ec2-and-ebs) — EC-1 to EC-7
- [AWS Networking, S3 and Databases](#aws-networking-s3-and-databases) — NW-1 to NW-3, S3-1 to S3-3, DB-1 to DB-4, AW-1, AW-2
- [Docker](#docker) — DK-1 to DK-8
- [Kubernetes](#kubernetes) — K8-1 to K8-5
- [Terraform](#terraform) — TF-1 to TF-4
- [CI-CD and Deployments](#ci-cd-and-deployments) — CI-1 to CI-6
- [Observability and Incidents](#observability-and-incidents) — OB-1 to OB-4, IT-1 to IT-3
- [Azure AKS](#azure-aks) — AZ-1
- [Fintech Payments Loop](#fintech-payments-loop) — FT-1 to FT-14
- [Python, Git and Behavioral](#python-git-and-behavioral) — PY-1, PY-2, GT-1 to GT-5, BH-1, BH-2

---
## Ansible

### AN-1. How does Ansible actually connect to and run on a host?
No agent or daemon runs on the managed node. For each task, the control node:
1. Opens a connection: **SSH** for Linux (OpenSSH, reusing one connection via `ControlPersist`), **WinRM** or **SSH** for Windows, or an API connection (`network_cli`, `httpapi`) for network devices.
2. Copies a small Python module (wrapped in "AnsiballZ") to a temp directory on the target, runs it with the target's Python, and reads back the JSON result (`changed`, `failed`, return values).
3. Deletes the temp file. With **pipelining** on, it skips the copy and streams the module over stdin.

So the only requirements on the target are SSH access, a Python interpreter (except for `raw` and network modules), and sudo rights if you use `become`.

### AN-2. Static vs dynamic inventory?
- **Static**: an INI or YAML file listing hosts and groups. Fine for a fixed fleet of on-prem servers.
- **Dynamic**: an **inventory plugin** queries a source of truth at run time, so auto-scaled or short-lived instances are always current. Examples: `amazon.aws.aws_ec2`, `azure.azcollection.azure_rm`, `google.cloud.gcp_compute`, `kubernetes.core.k8s`, VMware, NetBox.

```yaml
# inventory/aws_ec2.yml   (file name must end in aws_ec2.yml)
plugin: amazon.aws.aws_ec2
regions: [ap-south-1]
filters:
  tag:Env: prod
  instance-state-name: running
keyed_groups:
  - key: tags.Role          # creates groups like role_web, role_db
    prefix: role
hostnames: [private-ip-address]
compose:
  ansible_host: private_ip_address
```
`ansible-inventory -i inventory/ --graph` shows what the plugin found. You can combine static and dynamic sources by pointing `-i` at a directory.

### AN-3. `host_vars` vs `group_vars`?
Both are directories next to the inventory (or the playbook) that Ansible loads automatically.
- `group_vars/<group>.yml` (or `group_vars/<group>/*.yml`) applies to every host in that group. `group_vars/all.yml` applies to everyone.
- `host_vars/<hostname>.yml` applies to one host and **overrides** group values.

Order inside inventory variables: `all` < parent group < child group < host. When a host is in two groups at the same level, the group sorted last alphabetically wins unless you set `ansible_group_priority`. Put environment-wide values in group vars; keep host vars for genuine one-offs (a static IP, a disk device name).

### AN-4. How do host patterns work (`web:&prod:!db`)?
Patterns select hosts from the inventory for a play (`hosts:`) or the `--limit` flag:

| Pattern | Meaning |
|---|---|
| `web` | hosts in group `web` |
| `web:db` or `web,db` | union: in `web` **or** `db` |
| `web:&prod` | intersection: in `web` **and** `prod` |
| `web:!db` | in `web` but **not** in `db` |
| `web:&prod:!db` | web hosts that are in prod and not in db |
| `web[0]`, `web[0:9]` | by position in the group |
| `*.example.com`, `~web\d+` | wildcard or regex on host names |

Example: `ansible-playbook site.yml --limit 'web:&prod:!web-canary'`. Always quote patterns so the shell doesn't interpret `!` or `&`.

### AN-5. How do handlers work, and when don't they fire?
A handler is a task that runs only when another task **notifies** it **and that task reported `changed`**. Handlers run **once**, at the end of the play (after all tasks, per host), no matter how many tasks notified them. They run in the order they're **defined**, not the order notified.

```yaml
tasks:
  - name: Deploy nginx config
    ansible.builtin.template: { src: nginx.conf.j2, dest: /etc/nginx/nginx.conf, validate: nginx -t -c %s }
    notify: Reload nginx
handlers:
  - name: Reload nginx
    ansible.builtin.service: { name: nginx, state: reloaded }
```

**When they don't fire:**
- The notifying task returned `ok`, not `changed` (nothing changed, or `changed_when: false`).
- A later task **failed** on that host, so the play stopped before the handler phase. Fix with `force_handlers: true` (or `--force-handlers`).
- The notify name doesn't match the handler's `name` or `listen` topic exactly.
- The handler sits in a role that isn't loaded in the play.
- You ran with `--check` and the handler's module doesn't support check mode.
- You need it to run earlier: add `- ansible.builtin.meta: flush_handlers` at the point you need it.

### AN-6. `block` / `rescue` / `always`?
They're Ansible's try / catch / finally.

```yaml
- name: Upgrade app with automatic rollback
  block:
    - ansible.builtin.include_tasks: deploy_new_version.yml
    - ansible.builtin.uri: { url: "http://localhost:8080/health", status_code: 200 }
  rescue:
    - ansible.builtin.include_tasks: rollback.yml
    - ansible.builtin.fail: { msg: "Deploy failed on {{ inventory_hostname }}, rolled back" }
  always:
    - ansible.builtin.file: { path: /tmp/deploy.lock, state: absent }
```
- `rescue` runs only if a task in `block` failed. It can read `ansible_failed_task` and `ansible_failed_result`. If `rescue` succeeds, the host counts as recovered and the play continues; re-raise with `fail` if you want the run to stop.
- `always` runs either way.
- Directives on the block (`when`, `become`, `tags`) apply to every task inside it.
- `rescue` doesn't catch syntax errors or unreachable hosts.

### AN-7. How does `serial` work for rolling updates?
By default each task runs on **all** hosts (in parallel, up to `forks`) before the next task starts. `serial` runs the **whole play** on one batch of hosts before moving to the next batch.

```yaml
- hosts: web
  serial: [1, "10%", "25%"]   # canary 1 host, then 10%, then 25% per batch until done
  max_fail_percentage: 0      # any failure in a batch stops the rollout
```
- `serial: 1`, `serial: 5`, or `serial: "20%"` for a fixed batch size.
- `max_fail_percentage` stops the rollout when too many hosts in a batch fail. `any_errors_fatal: true` stops everything on the first failure.
- Handlers flush at the end of each batch.
- Contrast with `throttle:` (limits concurrency for a single task) and `strategy: free` (hosts run ahead without waiting for each other).

### AN-8. `delegate_to` vs `run_once`?
- `delegate_to: <host>` runs the task **on a different host**, but in the context (variables) of the current host. Classic use: remove this web server from the load balancer by running the API call on `localhost` or on the LB host.
- `run_once: true` runs the task on **only the first host** of the batch, and shares the result with all hosts. Use it for a DB migration or fetching a token once.
- Combined, `run_once` + `delegate_to: localhost` runs a single task on the controller.

Gotchas: `run_once` with `serial` runs once **per batch**, not once per play. Facts gathered by a delegated task go to the inventory host unless you set `delegate_facts: true`.

### AN-9. How do you make `shell` / `command` tasks idempotent?
`command` and `shell` always report `changed`, because Ansible can't know what the command did. Options, best first:
1. **Use a real module** (`ansible.builtin.user`, `file`, `lineinfile`, `community.postgresql.postgresql_db`, ...).
2. **`creates` / `removes`**: skip the command if a path exists / doesn't exist.
3. **Check first, act conditionally**, and tell Ansible what "changed" means:

```yaml
- name: Initialise the app database (one-time)
  ansible.builtin.command: /opt/app/bin/init-db
  args:
    creates: /var/lib/app/.db_initialised

- name: Check current schema version
  ansible.builtin.command: /opt/app/bin/schema-version
  register: schema
  changed_when: false          # read-only check, never "changed"

- name: Run migrations only if behind
  ansible.builtin.command: /opt/app/bin/migrate
  when: schema.stdout | int < target_schema
  register: mig
  changed_when: "'Applied' in mig.stdout"
```
Prefer `command` over `shell` unless you need pipes, redirects or env expansion; it avoids shell injection.

### AN-10. Explain variable precedence.
There are about 22 levels. In practice, from **lowest to highest**:

1. Role `defaults/main.yml`
2. Inventory `group_vars` (all → child groups), then inventory `host_vars`
3. Playbook `group_vars/`, then playbook `host_vars/`
4. Host facts and cached `set_fact`s
5. Play `vars`, `vars_prompt`, `vars_files`
6. Role `vars/main.yml`
7. Block `vars`, then task `vars`
8. `include_vars`
9. `set_fact` and `register` (for the rest of the run)
10. Role and include parameters
11. **Extra vars (`-e`)**: always win

Rules of thumb: put tunables in role **defaults** (easy to override), inventory-specific values in **group_vars**, and avoid role `vars` for anything a user might want to change. Use `-e` for one-off overrides in CI, not as the normal config path. If you're unsure where a value came from, `ansible -m debug -a var=myvar host` shows the resolved value.

### AN-11. `register` vs `set_fact`?
- `register: result` captures the **full result of a task** (`stdout`, `rc`, `changed`, module return values; for loops, `result.results` is a list).
- `set_fact` **creates or computes a variable** for the host from an expression. Use it to derive values (`app_url: "https://{{ domain }}/{{ path }}"`) or reshape a registered result.

Both are host-scoped and last for the rest of the playbook run. `set_fact` with `cacheable: true` also writes to the fact cache, so later runs can read it.

```yaml
- ansible.builtin.command: git -C /opt/app rev-parse HEAD
  register: git_rev
  changed_when: false
- ansible.builtin.set_fact:
    deployed_sha: "{{ git_rev.stdout | trim }}"
```

### AN-12. Useful Jinja2 filters?
| Filter | Example | Use |
|---|---|---|
| `default` | `{{ port \| default(8080) }}`; `{{ x \| default(omit) }}` | fallback values; `omit` drops the parameter entirely |
| `combine` | `{{ base_cfg \| combine(env_cfg, recursive=true) }}` | merge dictionaries (later wins) |
| `regex_replace` | `{{ hostname \| regex_replace('\\.example\\.com$', '') }}` | rewrite strings |
| `regex_search` | `{{ out.stdout \| regex_search('v(\\d+\\.\\d+)', '\\1') }}` | extract values |
| `map` / `selectattr` / `rejectattr` | `{{ users \| selectattr('admin') \| map(attribute='name') \| list }}` | filter and project lists of dicts |
| `dict2items` / `items2dict` | `{{ tags \| dict2items }}` | loop over a dict |
| `to_nice_yaml` / `to_json` / `from_json` | `{{ cfg \| to_nice_yaml }}` | render config files, parse API output |
| `json_query` | `{{ data \| community.general.json_query('items[*].id') }}` | JMESPath queries |
| `bool` / `int` | `{{ enable_tls \| bool }}` | type conversion (strict conditionals need booleans) |
| `password_hash` | `{{ pw \| password_hash('sha512') }}` | hashed passwords for `user` |
| `ipaddr` / `ansible.utils.ipaddr` | `{{ '10.0.0.0/24' \| ansible.utils.ipaddr('net') }}` | network maths |
| `mandatory` | `{{ db_host \| mandatory }}` | fail fast if a var is missing |

### AN-13. `loop` vs `with_items`?
`loop` (Ansible 2.5+) is the recommended syntax. `with_<lookup>` still works and isn't deprecated, but it's the older lookup-based form.
- `with_items` **flattens one level** automatically; `loop` does not, so the equivalent is `loop: "{{ list | flatten(levels=1) }}"`.
- Other `with_*` forms map to filters: `with_dict` → `loop: "{{ d | dict2items }}"`, `with_nested` → `product`, `with_subelements` → `subelements`.
- `loop_control` adds `label` (shorter output), `index_var`, `loop_var` (needed for nested includes), and `pause`.

```yaml
- ansible.builtin.user: { name: "{{ item.name }}", groups: "{{ item.groups }}" }
  loop: "{{ users }}"
  loop_control: { label: "{{ item.name }}" }
```
For many packages, pass the list straight to the module (`name: "{{ pkgs }}"`); it's one transaction instead of N.

### AN-14. `failed_when` vs `changed_when`?
Both override how Ansible interprets a task's result.
- `failed_when`: decides **failure**. Example: `grep` returns rc 1 for "no match", which isn't an error: `failed_when: result.rc not in [0, 1]`. Or fail on output: `failed_when: "'ERROR' in result.stdout"`.
- `changed_when`: decides **changed** (which drives handlers and reporting). `changed_when: false` for read-only checks; `changed_when: "'created' in result.stdout"` for commands.

Both accept a list of conditions, which are ANDed. Related: `ignore_errors: true` continues after a failure but still shows it as failed; prefer `failed_when` to say exactly what counts as failure.

### AN-15. `until` / `retries` / `delay`?
Repeats a task until a condition is true. Use it for eventual consistency: a service coming up, a load balancer marking a target healthy, an API that returns 503 while warming.

```yaml
- name: Wait for the app to report healthy
  ansible.builtin.uri:
    url: "http://{{ inventory_hostname }}:8080/health"
    status_code: 200
  register: health
  until: health.status == 200
  retries: 30     # attempts
  delay: 5        # seconds between attempts
```
The task fails if the condition is still false after the last retry. For simple port or file waits, `ansible.builtin.wait_for` is cleaner.

### AN-16. Role directory structure, and `include_role` vs `import_role`?
```
roles/nginx/
├── defaults/main.yml    # lowest-precedence, user-overridable variables
├── vars/main.yml        # high-precedence internal constants
├── tasks/main.yml       # entry point
├── handlers/main.yml
├── templates/           # *.j2 files for the template module
├── files/               # static files for copy
├── meta/main.yml        # dependencies, platforms, galaxy info
├── meta/argument_specs.yml  # validates role inputs
├── library/, module_utils/, filter_plugins/  # role-local plugins
└── molecule/default/    # tests
```

| | `import_role` / `import_tasks` | `include_role` / `include_tasks` |
|---|---|---|
| When processed | **Static**, at parse time | **Dynamic**, at run time |
| Loops | Not allowed | Allowed (`loop:` over the include) |
| Variables in the name | Not allowed | Allowed (`name: "{{ role_name }}"`) |
| `when` / tags | Copied onto **every task inside** | Applied to the **include statement** only (use `apply:` to pass tags in) |
| `--list-tasks`, `--start-at-task` | Tasks visible | Tasks not visible until run |
| Handlers | Visible to the whole play | Only after the include runs |

Use `import_*` by default (predictable, visible in `--list-tasks`). Use `include_*` when you need loops or a role chosen at run time.

### AN-17. Roles vs collections? What is FQCN?
- A **role** is a reusable unit of tasks, handlers, templates and variables.
- A **collection** is the distribution format for Ansible content: it can contain **modules, plugins (filters, lookups, inventory, connection), roles and playbooks**, versioned and installed from Galaxy or Automation Hub. Since Ansible 2.10, almost all modules live in collections (`amazon.aws`, `community.general`, `kubernetes.core`).
- **FQCN** (Fully Qualified Collection Name) is `namespace.collection.module`, e.g. `ansible.builtin.copy`, `amazon.aws.ec2_instance`. Always use it: it removes ambiguity when two collections have a module with the same short name, and `ansible-lint` enforces it.

Pin collection versions in `collections/requirements.yml` and install with `ansible-galaxy collection install -r requirements.yml`, so a new upstream release can't change your runs.

### AN-18. How do you use Ansible Vault in CI/CD?
1. Encrypt only the secret values, not whole var files, so diffs stay readable: `ansible-vault encrypt_string 's3cr3t' --name db_password`. A common pattern is `group_vars/prod/vars.yml` referencing `{{ vault_db_password }}` from an encrypted `group_vars/prod/vault.yml`.
2. Store the **vault password in the CI secret store** (GitHub Actions secret, Jenkins credential, AWX credential), never in the repo.
3. Feed it at run time without writing it to the log:
```bash
# GitHub Actions / Jenkins step
echo "$ANSIBLE_VAULT_PASSWORD" > .vault_pass && chmod 600 .vault_pass
ansible-playbook -i inventories/prod site.yml --vault-password-file .vault_pass
rm -f .vault_pass
```
   Or point `--vault-password-file` at an executable script that fetches the password from AWS Secrets Manager or HashiCorp Vault.
4. Use **vault IDs** for separate passwords per environment: `--vault-id prod@prompt`, `--vault-id dev@.vault_dev`, so dev CI can't decrypt prod secrets.
5. Rotate with `ansible-vault rekey`.

Vault encrypts secrets at rest in Git; for central rotation and audit, fetch secrets at run time instead ([AN-20](#an-20-how-do-you-integrate-hashicorp-vault-or-aws-secrets-manager)).

### AN-19. What does `no_log` do?
`no_log: true` on a task (or play/block) hides its arguments and results from console output, callback plugins and AWX job logs. A failed task shows "the output has been hidden due to the fact that 'no_log: true' was specified".

Use it on any task that handles passwords, tokens or keys (`user` with `password`, `uri` with an auth header, `set_fact` of a secret). Caveats:
- It makes debugging harder. A common pattern is `no_log: "{{ not debug_mode | default(false) }}"`.
- It doesn't hide the value if you print it in another task, and it doesn't encrypt anything on disk.
- With `-vvv`, module args are still protected, but check custom callbacks.

### AN-20. How do you integrate HashiCorp Vault or AWS Secrets Manager?
Use **lookup plugins** so secrets are fetched at run time and never stored in the repo:

```yaml
# AWS Secrets Manager (amazon.aws collection); auth via the runner's IAM role
db_password: "{{ lookup('amazon.aws.aws_secret', 'prod/app/db', region='ap-south-1') }}"

# AWS SSM Parameter Store
api_key: "{{ lookup('amazon.aws.aws_ssm', '/prod/app/api_key', decrypt=true) }}"

# HashiCorp Vault (community.hashi_vault); token/AppRole/JWT auth from env
db_password: "{{ lookup('community.hashi_vault.vault_kv2_get', 'app/db', engine_mount_point='secret').secret.password }}"
```
Authenticate the **runner**, not a human: an IAM role / instance profile for AWS, or AppRole / JWT (OIDC from the CI system) for Vault. Mark tasks that use the values `no_log: true`. In AWX/AAP, use the built-in **credential plugins** (HashiCorp Vault, AWS Secrets Manager, CyberArk, Azure Key Vault) so the secret is injected into the job and never seen by the playbook author.

### AN-21. A playbook takes 40 minutes on 300 hosts. How do you speed it up? (forks, pipelining, ControlPersist, fact caching)
Measure first: enable `callbacks_enabled = ansible.posix.profile_tasks, ansible.posix.timer` to see which tasks are slow. Then:

| Lever | Setting | Why it helps |
|---|---|---|
| **forks** | `forks = 50` (default is 5) | With 300 hosts and 5 forks, every task runs in 60 waves. Raise it as far as the controller's CPU/RAM allows. |
| **pipelining** | `[ssh_connection] pipelining = True` | Runs the module over the existing SSH session instead of copy + run + delete; often 2-5x faster. Needs `requiretty` disabled in sudoers. |
| **ControlPersist** | `ssh_args = -o ControlMaster=auto -o ControlPersist=60s` | Reuses one SSH connection per host instead of a new handshake per task. |
| **fact caching** | `gathering = smart`, `fact_caching = jsonfile` (or `redis`), `fact_caching_timeout = 86400` | Skips re-gathering facts every run. Or `gather_facts: false` / `gather_subset: [min]` when facts aren't needed. |
| **strategy** | `strategy: free` | Fast hosts don't wait for slow ones (only when task order across hosts doesn't matter). |
| **async** | `async: 600`, `poll: 0`, then `async_status` | Long tasks (package upgrades) run in the background on all hosts at once. |
| **fewer tasks** | pass lists to `package`/`apt` instead of `loop`; use `template` once instead of many `lineinfile` | One module call instead of N round trips. |
| **skip work** | tags, `--limit`, `when` guards, `creates:` | Don't run what hasn't changed. |
| **mitogen** (third party) | strategy plugin | Big speedups, but check compatibility with your ansible-core version. |

Also check the obvious: slow DNS on the targets (`UseDNS no`), `serial: 1` left in by accident, and `package` tasks hitting a slow mirror. Typical result: 40 min → 5-8 min.

### AN-22. Molecule and ansible-lint in practice?
- **ansible-lint** is static analysis: FQCN usage, `command` used where a module exists, missing `name`, risky file permissions, deprecated syntax. It runs in pre-commit and as the first CI step: `ansible-lint --profile production`.
- **Molecule** tests a role: it creates throwaway instances (Docker/Podman containers or cloud VMs), applies the role, runs it a **second time to prove idempotence** (fails if anything reports `changed`), then runs verification tests.

```bash
molecule init scenario -d docker       # scaffolds molecule/default/
molecule test                           # create → converge → idempotence → verify → destroy
molecule converge && molecule login     # iterate and debug
```
Verification is usually another Ansible playbook (`verify.yml` with `assert`) or Testinfra. In CI: `ansible-lint` → `molecule test` on each supported OS image → `--check --diff` against staging → real run.

### AN-23. AWX / AAP: job templates, projects, credentials, inventories?
AWX is the upstream open-source project; **Ansible Automation Platform (AAP)** is Red Hat's supported product built on it. Its main objects:
- **Project**: a Git repo (and branch) containing playbooks, synced on demand or on each job.
- **Inventory**: static hosts or **inventory sources** (AWS, Azure, VMware, SCM files) that sync on a schedule.
- **Credential**: SSH keys, cloud credentials, vault passwords, or lookups into external secret stores. Users can **use** a credential without being able to **see** it.
- **Execution environment**: a container image with ansible-core, collections and Python dependencies, so every job runs with the same versions.
- **Job template**: project + playbook + inventory + credentials + extra vars + survey. This is what people click or call via API.
- **Workflow template**: chains job templates with success/failure branches and approval nodes.
- Plus **RBAC** (teams, orgs), **schedules**, **notifications**, and a full **audit log** of who ran what with which variables.

Why it matters: it turns playbooks into self-service, audited operations (e.g. the app team can run "restart service" on their own hosts without SSH access).

### AN-24. What is Event-Driven Ansible?
**Event-Driven Ansible (EDA)** runs automation in response to events instead of a person or schedule starting it. A **rulebook** defines:
- **sources**: where events come from (webhook, Kafka, Alertmanager, Dynatrace, AWS SQS/CloudWatch, ServiceNow),
- **rules**: conditions on event data,
- **actions**: `run_job_template`, `run_playbook`, `post_event`, `debug`.

```yaml
- name: Auto-remediate disk alerts
  hosts: all
  sources:
    - ansible.eda.alertmanager: { host: 0.0.0.0, port: 5000 }
  rules:
    - name: Disk almost full
      condition: event.alert.labels.alertname == "DiskAlmostFull" and event.alert.status == "firing"
      action:
        run_job_template:
          name: cleanup-disk
          organization: Default
          job_args: { extra_vars: { target: "{{ event.alert.labels.instance }}" } }
```
Typical uses: auto-remediation of known alerts, opening tickets with diagnostics attached, compliance drift correction. Guard rails: limit which alerts can trigger actions, rate-limit, and alert humans when the same remediation keeps firing.

### AN-25. Deploying to Kubernetes with `kubernetes.core`?
The `kubernetes.core` collection talks to the Kubernetes API using a kubeconfig or in-cluster service account:
```yaml
- hosts: localhost
  gather_facts: false
  tasks:
    - name: Apply manifests rendered from templates
      kubernetes.core.k8s:
        state: present
        namespace: payments
        template: deployment.yaml.j2
        apply: true                 # server-side-like apply semantics
        wait: true                  # wait for rollout conditions
        wait_timeout: 300

    - name: Install a Helm chart
      kubernetes.core.helm:
        name: ingress-nginx
        chart_ref: ingress-nginx/ingress-nginx
        release_namespace: ingress-nginx
        create_namespace: true
        values: "{{ lookup('file', 'values-prod.yml') | from_yaml }}"

    - name: Read a resource
      kubernetes.core.k8s_info: { kind: Pod, namespace: payments, label_selectors: [app=api] }
```
Other modules: `k8s_exec`, `k8s_log`, `k8s_drain`, `k8s_scale`, `helm_repository`. It needs the `kubernetes` Python package on the controller. Where it fits: bootstrapping clusters and add-ons, or teams already on Ansible. For ongoing app delivery, a GitOps tool (Argo CD / Flux) is usually better, because it keeps reconciling instead of applying once.

### AN-26. A task shows "changed" on every run. Debug it.
1. Run `--diff -v` on that host to see what Ansible thinks differs.
2. Common causes:
   - `command`/`shell`/`raw` without `changed_when` or `creates` ([AN-9](#an-9-how-do-you-make-shell--command-tasks-idempotent)).
   - A template with a changing value: `{{ ansible_date_time }}`, a random password, an unsorted dict or set rendering in a different order.
   - The file is modified after Ansible writes it (the app rewrites its config, another tool or cron manages the same file).
   - Mode, owner or SELinux context mismatch: e.g. `mode: 644` (an int, interpreted as decimal) instead of `"0644"`.
   - `lineinfile` with a `regexp` that doesn't match the line it inserts, so it appends again each time.
   - `get_url`/`unarchive` without `checksum`/`creates`, so they re-download.
   - Modules that report changed by design: `service: state=restarted`, `uri` with `method: POST`.
3. Fix, then prove it: run twice; the second run must show `changed=0` (this is exactly what Molecule's idempotence step checks).

### AN-27. The playbook ran green but changed nothing. What do you check?
- **Hosts matched?** Look for `skipping: no hosts matched`. Check `--limit`, the play's `hosts:` pattern, and `ansible-inventory --graph` (dynamic inventory filters, tags, wrong region).
- **Tasks skipped?** `skipping:` lines mean a `when` evaluated false; print the variable with `debug`. Check `--tags` / `--skip-tags`.
- **`--check` mode** left on in the pipeline? Nothing is applied in check mode.
- **Wrong variables:** a higher-precedence var (often `-e` or role `vars/`) overrode the value you changed ([AN-10](#an-10-explain-variable-precedence)).
- **Wrong code:** the runner used an old checkout, branch, or AWX project that wasn't synced; an old collection version.
- **Already in the desired state:** maybe it genuinely matched. Check `--diff`.
- **Changed, but the app didn't pick it up:** config written but no handler/restart, or handler didn't fire ([AN-5](#an-5-how-do-handlers-work-and-when-dont-they-fire)).
- **Wrong host:** `ansible_host` points to another IP (stale DNS, reused IP).

### AN-28. SSH fails on some hosts. Walk through it.
Narrow down which layer fails with `ansible <host> -m ping -vvvv`, then plain `ssh -vvv user@host`:

| Symptom | Likely cause | Check |
|---|---|---|
| `UNREACHABLE ... timed out` | network, SG/firewall, wrong IP, host down | `nc -vz host 22`, security groups, route, `ansible_host` |
| `Connection refused` | sshd not running, wrong port | console/SSM: `systemctl status sshd`, `ansible_port` |
| `Host key verification failed` | host rebuilt with a new key | remove the old key from `known_hosts`; in dynamic fleets manage keys (or accept via `StrictHostKeyChecking=accept-new`) |
| `Permission denied (publickey)` | wrong user, key not in `authorized_keys`, wrong permissions on `~/.ssh` | `ansible_user`, `ansible_ssh_private_key_file`, `/var/log/secure` or `auth.log` on target |
| Connects but `sudo: a password is required` / `Missing sudo password` | `become` needs a password | `--ask-become-pass`, NOPASSWD sudoers, `ansible_become_user` |
| `/usr/bin/python: not found` | no Python or different path | `ansible_python_interpreter=/usr/bin/python3`, or bootstrap with `raw` |
| Slow then fails | DNS reverse lookups in sshd, `MaxStartups` hit with high forks | `UseDNS no`, lower `forks`, raise `MaxStartups` |
| Only some fail with "control socket" errors | `ControlPath` too long | set `control_path_dir` to a short path |

Look for a pattern: same subnet (network), same AMI/OS version (python, sudoers), recently rebuilt (host keys).

### AN-29. Zero-downtime rolling deploy behind a load balancer?
```yaml
- hosts: web
  serial: [1, "25%"]          # canary first, then quarter by quarter
  max_fail_percentage: 0
  tasks:
    - name: Take the node out of the target group
      amazon.aws.elb_target:
        target_group_name: web-tg
        target_id: "{{ ec2_id }}"
        state: absent
      delegate_to: localhost

    - name: Wait for connections to drain
      ansible.builtin.pause: { seconds: 30 }   # >= the target group's deregistration delay

    - block:
        - ansible.builtin.include_role: { name: app, tasks_from: deploy }
        - name: Wait until healthy locally
          ansible.builtin.uri: { url: "http://localhost:8080/health", status_code: 200 }
          register: h
          until: h.status == 200
          retries: 20
          delay: 5
      rescue:
        - ansible.builtin.include_role: { name: app, tasks_from: rollback }
        - ansible.builtin.fail: { msg: "Deploy failed on {{ inventory_hostname }}" }

    - name: Put it back into the target group
      amazon.aws.elb_target:
        target_group_name: web-tg
        target_id: "{{ ec2_id }}"
        state: present
        target_status: healthy
        target_status_timeout: 300
      delegate_to: localhost
```
Key points: `serial` limits how much capacity is out at once; draining avoids cutting live requests; the health check gates re-entry; `max_fail_percentage: 0` stops the rollout at the first bad batch, leaving most of the fleet on the old version. For HAProxy or NGINX upstreams, use `community.general.haproxy` with `state: disabled` / `enabled` the same way.

### AN-30. Patching 1,000 servers safely?
The general patching approach is in [34 Q5](./34-onprem-banking-infrastructure-qna.md). With Ansible specifically:
1. **Group by risk and redundancy**: inventory groups by environment, app, and AZ/rack, so a batch never takes out all members of a cluster.
2. **Order**: dev → staging → a prod canary group → the rest of prod, with a soak period between waves.
3. **Per-host flow:** pre-check (disk space, cluster health, no active incident) → drain/remove from LB → `ansible.builtin.dnf`/`apt` upgrade (with a pinned snapshot repo so every host gets the same versions) → `ansible.builtin.reboot` only if needed (`needs-restarting -r` / `/var/run/reboot-required`) → post-checks (service health, kernel version) → return to LB.
4. **Rate and blast radius:** `serial: "5%"`, `max_fail_percentage: 2`, `throttle` on any shared dependency.
5. **Scale tuning:** forks, pipelining, `async` for the package step ([AN-21](#an-21-a-playbook-takes-40-minutes-on-300-hosts-how-do-you-speed-it-up-forks-pipelining-controlpersist-fact-caching)).
6. **Track and report:** AWX job per wave, a report of which hosts patched/failed/skipped, and failed hosts quarantined for manual review rather than retried blindly.
7. **Rollback:** VM snapshots or `dnf history undo` for the canary; for immutable fleets, rebuild from a new patched AMI instead.

### AN-31. How do you structure dev/stage/prod in one repo?
```
ansible/
├── ansible.cfg
├── collections/requirements.yml   # pinned versions
├── inventories/
│   ├── dev/   { hosts.yml or aws_ec2.yml, group_vars/, host_vars/ }
│   ├── stage/ { ... }
│   └── prod/  { hosts.yml, group_vars/all/{vars.yml,vault.yml}, ... }
├── playbooks/  { site.yml, web.yml, db.yml, patch.yml }
└── roles/      { common/, nginx/, app/ }   # or separate versioned role repos
```
- **Same playbooks and roles for every environment.** Only the inventory directory changes: `ansible-playbook -i inventories/prod playbooks/site.yml`.
- Each environment has its own vault password/ID ([AN-18](#an-18-how-do-you-use-ansible-vault-in-cicd)).
- Promote **code** through environments with Git (merge to main → dev automatically, tag → prod with approval), not by editing prod vars ad hoc.
- Separate CI credentials per environment so a dev job can't reach prod hosts.

### AN-32. Tell me about a time an Ansible run broke production.
Sample STAR answer (use your own if you have one):
- **Situation:** We managed `sshd_config` and `/etc/sudoers.d` with a common role across ~400 servers.
- **Task:** A change to restrict SSH ciphers went out in the normal weekly run.
- **Action:** The template used a cipher list that the older RHEL 7 OpenSSH didn't support. sshd failed its config check on restart, and on ~40 legacy hosts it didn't come back, locking us out. We used the cloud console / SSM to restore the previous config, confirmed sshd was up, and froze the role.
- **Result:** No customer impact (the hosts were in redundant pools), but we lost SSH to 10% of the fleet for about an hour.
- **What changed afterwards:**
  - `validate: /usr/sbin/sshd -t -f %s` on the template, so a bad config is never written.
  - The role runs with `serial` and a canary group per OS version, with `max_fail_percentage: 0`.
  - Molecule scenarios for every OS version we actually run.
  - `--check --diff` output posted to the PR for any change to the common role.

The point the interviewer wants: you recovered calmly, owned the cause, and added a guard rail so the same class of mistake can't happen again.

### AN-33. Upgrading ansible-core safely (2.19 EOL: Nov 30, 2026)?
ansible-core 2.19 rewrote templating ("**Data Tagging**"), and it's the release that breaks the most old playbooks. Moving to a supported release (2.20 or 2.21):

1. **Inventory the estate:** which controllers, CI runners and AWX execution environments run which ansible-core and Python version; which collections they use.
2. **Read the porting guides** for each version you skip (2.19, 2.20, 2.21). Things that commonly break from 2.19 on:
   - **Conditionals must be real booleans.** `when: my_list` or `when: "{{ x }}"` now error. Write `when: my_list | length > 0`, `when: x | bool`. `ALLOW_BROKEN_CONDITIONALS` only buys time.
   - **No nested templates** inside expressions (`when: "{{ a }} == 1"` style, `"{{ '{{ x }}' }}"` tricks).
   - **Untrusted data isn't templated:** strings returned from modules or lookups are no longer rendered again as templates.
   - Stricter handling of `omit`, undefined variables and type conversions.
   - Newer Python required on the controller, and some old target Python versions dropped.
3. **Upgrade collections** to versions that declare support for the new core (`requires_ansible` in their metadata).
4. **Test in a new execution environment / venv**, not in place: run `ansible-lint` (it flags many 2.19 issues), Molecule for every role, then `--check --diff` against staging and compare output with the old version.
5. **Roll out** to CI runners and AWX one environment at a time, keep the old EE/venv available for quick rollback, and pin the version (`ansible-core==2.21.*`) so it doesn't drift again.
6. Put the next EOL date on the calendar; ansible-core supports each release for about 18 months.

---
## Linux and Networking

### LX-1. What happens when you run `top`?
`top` doesn't ask the kernel through a special API; it **reads files under `/proc`** and redraws every 3 seconds (`-d` to change):
- `/proc/loadavg` and `/proc/uptime` for the header's load average and uptime,
- `/proc/stat` for CPU time per state (`us`, `sy`, `ni`, `id`, `wa`, `hi`, `si`, `st`); it computes percentages from the **difference** between two samples, which is why the first screen is less accurate,
- `/proc/meminfo` for memory and swap,
- `/proc/<pid>/stat`, `/proc/<pid>/statm`, `/proc/<pid>/status` for each process's state, CPU time, RSS and owner.

Useful keys: `P`/`M` sort by CPU/memory, `1` per-CPU view, `H` threads, `c` full command line, `k` kill. Watch `wa` (I/O wait) and `st` (CPU stolen by the hypervisor, common on burstable cloud instances). Batch mode for scripts: `top -b -n 1 | head -20`.

### LX-2. What is `/etc/fstab`?
It's the table of filesystems to mount at boot (and what `mount -a` reads). Each line has six fields:

```
# <device>                                 <mount point>  <type>  <options>          <dump> <fsck>
UUID=3f6c1b8e-2a4d-4c55-9a51-8f0e2c7d1a90   /data          xfs     defaults,nofail    0      2
```
- **device**: use `UUID=` or `LABEL=`, not `/dev/xvdf` or `/dev/nvme1n1`, because device names can change between boots (very common on Nitro EC2 instances).
- **options**: `defaults`, `noatime`, `ro`; **`nofail`** lets the server boot even if the disk is missing, which matters on cloud instances, where a missing EBS volume otherwise drops you into emergency mode with no SSH.
- **dump**: almost always 0. **fsck order**: 1 for root, 2 for other disks, 0 to skip.

Always test with `sudo mount -a` (or `findmnt --verify`) before rebooting. A typo in fstab is a classic cause of a server that won't boot.

### LX-3. `curl` vs `ping`?
| | `ping` | `curl` |
|---|---|---|
| Protocol | ICMP echo (layer 3) | HTTP/HTTPS/FTP etc. (layer 7) |
| Tells you | the host is reachable at the IP level, and the round-trip time | the service is actually answering: DNS, TCP connect, TLS, HTTP status, headers, body |
| Blocked by | security groups / firewalls that drop ICMP (AWS SGs do by default) | firewalls on the service port |

A failed ping doesn't mean the host is down (ICMP is often blocked), and a successful ping doesn't mean the app works. For services, test the actual port: `curl -v https://api.example.com/health`, `curl -o /dev/null -s -w '%{http_code} dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} total=%{time_total}\n' URL` (shows where time goes), or `nc -vz host 5432` for non-HTTP ports.

### LX-4. How do you check network connectivity, and which package manager does each Linux flavour use?
**Connectivity, bottom-up:**
```bash
ip a; ip r                       # interface up, IP assigned, default route present
ping -c3 10.0.1.10               # L3 reachability (if ICMP allowed)
dig +short db.internal; cat /etc/resolv.conf   # DNS
nc -vz db.internal 5432          # TCP port open? (or: timeout 3 bash -c '</dev/tcp/host/5432')
curl -v https://host/health      # app layer, TLS
traceroute -T -p 443 host        # or mtr: where packets stop
ss -tulnp                        # what's listening locally
sudo tcpdump -ni eth0 port 5432  # are packets actually leaving / arriving?
```

**Package managers:**
| Family | Distros | Low-level | High-level |
|---|---|---|---|
| Debian | Ubuntu, Debian | `dpkg` | `apt` |
| Red Hat | RHEL, Rocky, AlmaLinux, Fedora, **Amazon Linux 2023** | `rpm` | `dnf` (`yum` on RHEL 7 / Amazon Linux 2) |
| SUSE | SLES, openSUSE | `rpm` | `zypper` |
| Alpine | Alpine (common in containers) | — | `apk` |
| Arch | Arch | — | `pacman` |

Install examples: `sudo apt install -y nginx`, `sudo dnf install -y nginx`, `apk add --no-cache curl`. Package that owns a file: `dpkg -S /usr/bin/curl` / `rpm -qf /usr/bin/curl`.

### LX-5. Write a shell script to calculate the factorial of a number.
```bash
#!/usr/bin/env bash
# Usage: ./factorial.sh 5
set -euo pipefail

n="${1:-}"
if [[ ! "$n" =~ ^[0-9]+$ ]]; then
  echo "usage: $0 <non-negative integer>" >&2
  exit 1
fi

result=1
for (( i = 2; i <= n; i++ )); do
  result=$(( result * i ))
done
echo "$n! = $result"
```
`./factorial.sh 5` prints `5! = 120`; `0!` is correctly 1. Points to mention: input validation, and the limit: Bash arithmetic is 64-bit, so it overflows above **20!**. For bigger numbers, use `bc`:
```bash
echo "define f(n){ if (n<2) return 1; return n*f(n-1) }; f(30)" | bc
```
A recursive Bash function also works, but it forks a subshell per call, so the loop is the better answer.

---

## EC2 and EBS

### EC-1. What are EC2 status checks?
EC2 runs automated checks every minute; you see them in the console as "2/2 checks passed" (3/3 on newer instances).

| Check | What it tests | Typical failures | Fix |
|---|---|---|---|
| **System status check** | The AWS side: the physical host, network, power | hardware failure, host network loss | Stop and start the instance (moves it to new hardware). Instance-store data is lost. |
| **Instance status check** | Your OS: is it booting and reachable on the network? | kernel panic, bad `/etc/fstab`, out of memory, wrong network config, full disk | Read **Get system log** / **Get instance screenshot**, use the **EC2 Serial Console**, or detach the root volume and fix it on another instance. |
| **Attached EBS status check** | Whether attached EBS volumes are reachable and can do I/O | EBS volume impaired | Usually AWS-side; failover or restore from snapshot. |

Automate recovery with a CloudWatch alarm on `StatusCheckFailed_System` and the **recover** action (keeps the instance ID, IPs and EBS), or `StatusCheckFailed_Instance` with **reboot**. Instances in an Auto Scaling group with EC2 health checks get replaced automatically. Simplified automatic recovery is on by default for supported instance types.

### EC-2. EBS volumes: root vs secondary, volume types and IOPS?
- **Root volume**: holds the OS, created from the AMI, `DeleteOnTermination = true` by default.
- **Secondary (data) volumes**: added separately, `DeleteOnTermination = false` by default, so data survives instance termination. Keep app data here so you can replace the instance or OS independently.

| Type | Kind | Performance | Use |
|---|---|---|---|
| **gp3** | SSD | 3,000 IOPS and 125 MB/s baseline included at any size; provision up to 80,000 IOPS / 2,000 MB/s independently of size | default for almost everything |
| gp2 | SSD (older) | 3 IOPS per GB (burst to 3,000 under 1 TB) | legacy; migrate to gp3 (usually ~20% cheaper) |
| **io2 Block Express** | provisioned-IOPS SSD | up to 256,000 IOPS, sub-millisecond latency, 99.999% durability | large databases, latency-sensitive OLTP |
| io1 | provisioned-IOPS SSD (older) | up to 64,000 IOPS | legacy |
| **st1** | throughput HDD | MB/s-oriented, cheap | big sequential reads: logs, Kafka, data warehouses |
| **sc1** | cold HDD | cheapest | rarely accessed data |

IOPS vs throughput: IOPS = operations per second (matters for small random I/O like databases); throughput = MB/s (matters for large sequential I/O). The **instance type also has an EBS bandwidth limit**, so a big volume on a small instance won't reach its rated performance. Volume size, type and IOPS can be changed online with **Elastic Volumes** (then grow the filesystem).

### EC-3. How do you change an instance type?
For EBS-backed instances:
1. **Check compatibility:** same architecture (you can't move x86 → Graviton without a new AMI), and the new type must support the AMI's virtualization, ENA network driver and NVMe drivers (needed for all Nitro types). Check `modinfo ena`, `modinfo nvme`.
2. **Stop** the instance (not terminate). Instance-store data is lost; the public IPv4 changes unless it's an Elastic IP.
3. **Actions → Instance settings → Change instance type**, or `aws ec2 modify-instance-attribute --instance-id i-0abc --instance-type "{\"Value\": \"m7i.large\"}"`.
4. **Start** and verify the app.

For zero downtime, don't resize in place: update the launch template and do an ASG **instance refresh**, or create a new instance behind the load balancer and swap. For instances in an ASG, changing one by hand gets undone at the next replacement.

### EC-4. OS-level steps to attach and use multiple EBS volumes?
After creating the volumes **in the same AZ** and attaching them (console or `aws ec2 attach-volume`):
```bash
lsblk                                   # new disks appear as nvme1n1, nvme2n1 (Nitro) or xvdf
sudo file -s /dev/nvme1n1               # "data" = empty; DON'T mkfs a disk that already has a filesystem
sudo mkfs -t xfs /dev/nvme1n1           # format (xfs or ext4)
sudo mkdir -p /data
sudo mount /dev/nvme1n1 /data
sudo blkid /dev/nvme1n1                 # get the UUID
echo 'UUID=<uuid>  /data  xfs  defaults,nofail  0  2' | sudo tee -a /etc/fstab
sudo umount /data && sudo mount -a && df -h /data   # prove fstab works before rebooting
```
- Use the **UUID** in fstab, because NVMe device names can change order between boots ([LX-2](#linux-and-networking)). `ls -l /dev/disk/by-id/` maps NVMe devices to EBS volume IDs.
- For several volumes as one filesystem or for easy growth, use **LVM** (`pvcreate`, `vgcreate`, `lvcreate`) ([34 Q2](./34-onprem-banking-infrastructure-qna.md)), or RAID 0 with `mdadm` for more throughput (no redundancy).
- To grow later: modify the volume size in AWS, then `sudo growpart /dev/nvme0n1 1` (if partitioned) and `sudo xfs_growfs /data` or `sudo resize2fs /dev/nvme1n1`.

### EC-5. How many instances can connect to a single EBS volume?
Normally **one**: an EBS volume attaches to one instance, in the same AZ.

The exception is **EBS Multi-Attach**: **io1/io2** volumes can be attached to **up to 16 Nitro instances in the same AZ**. But ordinary filesystems (ext4, xfs) are not cluster-aware, and mounting one from two instances will corrupt it. You need a cluster filesystem (GFS2, OCFS2) or an application that manages concurrent block access itself (some clustered databases).

If you need many instances sharing files, use **EFS** (NFS, many AZs, thousands of clients), **FSx**, or **S3 Files** ([S3-1](#aws-networking-s3-and-databases)).

### EC-6. C family vs R family instances?
Families differ mainly in the **memory-to-vCPU ratio**:

| Family | Optimized for | Memory per vCPU | Examples of use |
|---|---|---|---|
| **C** (c7i, c7g, c8g) | compute | ~2 GiB | CPU-bound web/API servers, batch, encoding, CI builders, game servers, HPC |
| **M** (m7i, m7g) | general purpose | ~4 GiB | balanced app servers, mid-sized databases |
| **R** (r7i, r7g, r8g) | memory | ~8 GiB | databases, Redis/Memcached, in-memory analytics, JVM apps with large heaps |
| X / U | very high memory | 16+ GiB | SAP HANA, very large in-memory DBs |

Letters in the name: `c7g.xlarge` = family C, generation 7, `g` = Graviton (`i` Intel, `a` AMD), plus extras like `d` (local NVMe), `n` (more network). Pick by measuring: if CPU is saturated while memory is mostly free, go to C; if you're memory-bound or swapping with idle CPU, go to R.

### EC-7. What are Graviton instances, and how do they differ from Intel-based ones?
Graviton is AWS's own **ARM64 (aarch64)** processor family (Graviton2, 3, 4), marked with `g` in instance names (`m7g`, `c8g`, `r8g`).
- **Price/performance:** typically **up to ~40% better price-performance** and about **20% lower price** than comparable x86 instances, and up to 60% less energy for the same performance.
- **Architecture:** each vCPU is a **full physical core** (no hyperthreading), which gives more predictable performance under load. Intel/AMD vCPUs are hyperthreads.
- **Compatibility:** you need **ARM64 builds**. Interpreted and JVM languages (Java, Python, Node.js, Go, .NET 6+) usually just work; native dependencies, old agents and some commercial software may not. Containers need **multi-arch images** (`docker buildx build --platform linux/amd64,linux/arm64`).
- **Can't change in place:** you can't switch an existing x86 instance to Graviton; you need an ARM64 AMI.

Migration approach: build multi-arch images in CI, run a canary node group on Graviton (in EKS, a separate node pool with `kubernetes.io/arch=arm64`), compare latency and cost, then shift gradually. Managed services (RDS, ElastiCache, OpenSearch, Lambda) offer Graviton as a simple option change.

---

## AWS Networking, S3 and Databases

### NW-1. What is a Direct Connect Gateway?
A **Direct Connect gateway** is a global object that lets **one Direct Connect connection reach VPCs in many regions and accounts**. Without it, a private virtual interface connects to one virtual private gateway in one region.
- Attach a **private VIF** to the DX gateway, then associate **virtual private gateways** (per VPC) or a **Transit Gateway** (via a transit VIF) in any region except China.
- It does **not** route VPC to VPC or region to region; it's only on-prem ↔ AWS. Use Transit Gateway (with peering) for VPC-to-VPC traffic.
- Typical enterprise design: DX location → transit VIF → DX gateway → Transit Gateway in each region → spoke VPCs ([36 Q35, Q45](./36-aws-networking-deep-dive-qna.md)).

### NW-2. Hosted vs Dedicated Direct Connect?
| | **Dedicated connection** | **Hosted connection** |
|---|---|---|
| Ordered from | AWS directly | an AWS Direct Connect **Partner** |
| Speeds | 1, 10, 100, 400 Gbps physical port | 50 Mbps to 25 Gbps |
| Port | a physical port dedicated to you | a share of the partner's port, provisioned for you |
| Virtual interfaces | up to 50 public/private VIFs + 1 transit VIF (more for 100G) | **one VIF** per hosted connection |
| Lead time | weeks to months (cross-connect at a DX location, LOA-CFA) | often faster; partner handles the last mile |
| Good for | large, steady bandwidth; many VIFs | smaller bandwidth, no presence at a DX location |

For resilience, AWS recommends at least two connections at **two different DX locations** (the "maximum resiliency" model uses two per location), with Site-to-Site VPN as a cheaper backup. MACsec encryption is available on dedicated 10/100/400 Gbps ports; otherwise run IPsec over DX if you need encryption.

### NW-3. Default ports to know
| Service | Port | Protocol |
|---|---|---|
| SSH, **SFTP**, SCP | **22** | TCP (SFTP runs over SSH) |
| FTP | 21 (control), 20 (data) | TCP |
| FTPS (implicit) | 990 | TCP |
| SMTP / submission / SMTPS | 25 / 587 / 465 | TCP |
| DNS | 53 | UDP (and TCP for large responses, zone transfers) |
| **HTTP** | **80** | TCP |
| **HTTPS** | **443** | TCP (UDP for HTTP/3 / QUIC) |
| NTP | 123 | UDP |
| LDAP / LDAPS | 389 / 636 | TCP |
| RDP | 3389 | TCP |
| **MySQL** / MariaDB / Aurora MySQL | **3306** | TCP |
| PostgreSQL | 5432 | TCP |
| MS SQL Server | 1433 | TCP |
| Oracle | 1521 | TCP |
| **MongoDB** | **27017** | TCP |
| Redis | 6379 | TCP |
| Elasticsearch / OpenSearch | 9200 (HTTP), 9300 (transport) | TCP |
| Kafka | 9092 | TCP |
| Kubernetes API | 6443 | TCP |
| etcd | 2379-2380 | TCP |
| kubelet | 10250 | TCP |
| NodePort range | 30000-32767 | TCP/UDP |
| Prometheus / Grafana | 9090 / 3000 | TCP |

### S3-1. Benefits of S3 over EBS, and what is S3 Files?
| | **S3** | **EBS** |
|---|---|---|
| Type | object storage over an HTTPS API | block storage attached to one instance |
| Scope | regional, accessible from anywhere with permission | one AZ, one instance (Multi-Attach aside) |
| Durability | 11 nines, data stored across ≥3 AZs | replicated within one AZ; snapshots go to S3 |
| Capacity | effectively unlimited, pay for what you store | provisioned size, you pay for the full volume even if empty |
| Cost | from ~$0.023/GB-month (Standard), far less in IA/Glacier tiers | ~$0.08/GB-month (gp3) |
| Features | versioning, lifecycle tiering, replication, Object Lock, static hosting, event notifications | low-latency random I/O for OSes and databases |

Use S3 for artifacts, backups, logs, media, data lakes and static sites; use EBS for boot disks and databases that need low-latency block I/O.

**S3 Files** (launched April 2026) lets you **mount an S3 bucket as a file system** over **NFS v4.1+** from EC2, ECS, EKS and Lambda. Files and directories get POSIX permissions, access is controlled by IAM, and the same data is still readable and writable through the normal S3 API at the same time, with no migration needed. Actively used data is served from a caching layer at around 1 ms latency, while large sequential reads go straight to S3. Thousands of clients can mount the same file system. It's aimed at workloads that expect a file system (ML training data, legacy apps, shared content) without copying data from S3 to EFS. You pay for the data held in the file system layer, for writes and small-file reads, and for S3 requests used for syncing. (Before it, the options were **Mountpoint for Amazon S3**, a client that maps file calls to S3 requests with limited POSIX support, or copying data to EFS/FSx.)

### S3-2. How many objects can an S3 bucket store?
**Unlimited.** There's no limit on the number of objects or total bytes in a bucket. Limits that do exist:
- A single object can be up to **50 TB** (raised from 5 TB in December 2025; GovCloud regions excepted). A single `PUT` is limited to 5 GB, so anything larger, and anything over ~100 MB in practice, uses **multipart upload** (up to 10,000 parts) ([24 Q8](./24-aws-deep-dive-qna.md)).
- Request rates: at least **3,500 PUT/COPY/POST/DELETE and 5,500 GET/HEAD per second per prefix**, and you can spread load over more prefixes for more throughput.
- The limit is on **buckets per account** (10,000 by default since late 2024, more on request), not objects per bucket.

### S3-3. How do you secure an S3 bucket used for static website hosting?
Don't use the public S3 website endpoint (HTTP only, bucket must be public). The standard design:
1. Keep the bucket **private**, with **Block Public Access** on.
2. Put **CloudFront** in front, using **Origin Access Control (OAC)**. The bucket policy only allows `s3:GetObject` from the CloudFront service principal for *that* distribution:
```json
{
  "Effect": "Allow",
  "Principal": { "Service": "cloudfront.amazonaws.com" },
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::my-site-bucket/*",
  "Condition": { "StringEquals": { "AWS:SourceArn": "arn:aws:cloudfront::111122223333:distribution/E1ABCDEF" } }
}
```
3. **HTTPS only**: an ACM certificate (in `us-east-1` for CloudFront) on your domain, viewer protocol policy "redirect HTTP to HTTPS", TLS 1.2+.
4. **Security headers** with a CloudFront response headers policy (HSTS, CSP, X-Content-Type-Options, X-Frame-Options).
5. **AWS WAF** on the distribution for rate limiting and managed rule sets; geo restriction if needed.
6. **Encryption at rest** (SSE-S3 or SSE-KMS; with KMS, allow CloudFront in the key policy), **versioning** to recover from bad deploys, and **access logs**.
7. **Deploy from CI** with an OIDC role that can only write to that bucket and run CloudFront invalidations.

### DB-1. What's your MySQL and MongoDB experience? (How to answer)
Be concrete about versions, sizes and what you actually did. A sample answer:

"I've run **MySQL 8.0** both self-managed on EC2 and on **RDS / Aurora MySQL**: the largest was about 2 TB with a primary, two read replicas and Multi-AZ. Day to day: user and grant management, slow-query analysis with `pt-query-digest` and Performance Insights, adding indexes after looking at `EXPLAIN`, parameter tuning (`innodb_buffer_pool_size`, `max_connections`), backups (automated snapshots plus `mysqldump`/XtraBackup for logical exports), and major-version upgrades using blue/green deployments.

For **MongoDB**, I've operated a three-member **replica set** (MongoDB 6/7) on EC2 and used **Atlas**: setting up replication and backups, creating indexes from `explain()` output, handling elections and replica lag, and managing users and roles. I haven't run sharded clusters in production, but I understand shard keys and the balancer."

Then expect follow-ups from [DB-2](#aws-networking-s3-and-databases) and [DB-3](#aws-networking-s3-and-databases).

### DB-2. How do you troubleshoot production MySQL / MongoDB servers?
**First, which kind of problem:** slow queries, too many connections, replication lag, disk full, or locks.

**MySQL**
```sql
SHOW FULL PROCESSLIST;                         -- what's running now, long queries, "Waiting for lock"
SELECT * FROM sys.statements_with_runtimes_in_95th_percentile LIMIT 10;
SHOW ENGINE INNODB STATUS\G                    -- deadlocks, lock waits, buffer pool
SHOW GLOBAL STATUS LIKE 'Threads_connected';   -- vs max_connections
SHOW REPLICA STATUS\G                          -- Seconds_Behind_Source, IO/SQL thread errors
EXPLAIN ANALYZE SELECT ...;                    -- missing index? full table scan?
```
Plus the slow query log (`long_query_time = 1`) analysed with `pt-query-digest`, and OS checks: `iostat -x` (disk saturation), `free -m` (buffer pool swapping), `df -h` (binlogs filling the disk; set `binlog_expire_logs_seconds`).

**MongoDB**
```javascript
db.currentOp({ secs_running: { $gt: 5 } })     // long-running operations
db.setProfilingLevel(1, { slowms: 100 }); db.system.profile.find().sort({ ts: -1 }).limit(5)
db.coll.find({...}).explain("executionStats")  // COLLSCAN = missing index
rs.status(); rs.printSecondaryReplicationInfo()  // member health, replication lag
db.serverStatus().connections; db.serverStatus().wiredTiger.cache
```
Plus `mongostat` / `mongotop`, and checking the log for elections or slow operations.

**Common causes and fixes:** missing indexes (the most common), a new query pattern from a recent deploy, connection storms from an app scaling out without connection pooling (use RDS Proxy / a pooler, lower pool sizes), long transactions holding locks, replica lag from a large batch write, the working set outgrowing memory, and burst-credit or IOPS limits on the volume. Kill a runaway query with `KILL <id>` / `db.killOp(<opid>)` only after checking what it is.

### DB-3. Set up MySQL source-replica replication on two EC2 instances.
Assume MySQL 8.0 on both instances, a private subnet, and a security group allowing **3306 from the replica's SG only**.

**On the source (10.0.1.10):**
```ini
# /etc/my.cnf  (or /etc/mysql/mysql.conf.d/mysqld.cnf)
[mysqld]
server-id                = 1
log_bin                  = mysql-bin
binlog_format            = ROW
gtid_mode                = ON
enforce_gtid_consistency = ON
bind-address             = 0.0.0.0     # or the private IP
```
```sql
-- restart mysqld, then:
CREATE USER 'repl'@'10.0.2.%' IDENTIFIED BY 'StrongPass!' REQUIRE SSL;
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'10.0.2.%';
```
Take a consistent copy of existing data:
```bash
mysqldump --all-databases --single-transaction --triggers --routines --events \
  --source-data=2 --set-gtid-purged=ON > full.sql
scp full.sql replica:/tmp/
```

**On the replica (10.0.2.20):**
```ini
[mysqld]
server-id                = 2
relay_log                = relay-bin
gtid_mode                = ON
enforce_gtid_consistency = ON
read_only                = ON
super_read_only          = ON
```
```sql
-- restart, then load the dump:  mysql < /tmp/full.sql
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST = '10.0.1.10',
  SOURCE_USER = 'repl',
  SOURCE_PASSWORD = 'StrongPass!',
  SOURCE_AUTO_POSITION = 1,      -- GTID-based, no binlog file/position needed
  SOURCE_SSL = 1;
START REPLICA;
SHOW REPLICA STATUS\G            -- Replica_IO_Running: Yes, Replica_SQL_Running: Yes, Seconds_Behind_Source: 0
```
Verify by writing a test row on the source and reading it on the replica. Mention: for big databases use **Percona XtraBackup** instead of mysqldump; monitor lag and replication errors; failover isn't automatic (you'd use Orchestrator, MySQL InnoDB Cluster, or simply **RDS**, which does Multi-AZ and read replicas for you).

### DB-4. RDS database latency increased. How do you analyze it?
1. **Confirm it's the database:** app traces/APM show time spent in DB calls; compare `ReadLatency`/`WriteLatency` in CloudWatch with app latency.
2. **Performance Insights / Database Insights first:** look at **DB load by wait event** and **top SQL**. That usually points straight at the problem:
   - CPU waits → expensive queries (missing index, plan change after a stats update or a new release).
   - I/O waits (`io/table/sql/handler`, `IO:DataFileRead`) → working set no longer fits in memory, or storage limits.
   - Lock waits → long transactions, hot rows, DDL holding a metadata lock.
3. **CloudWatch metrics:**
   - `CPUUtilization`, `FreeableMemory`, `SwapUsage`
   - `ReadIOPS`/`WriteIOPS` vs provisioned IOPS, `DiskQueueDepth`, and **`BurstBalance`** (gp2) / `CPUCreditBalance` (t-class): a drained balance is a classic "slow since this morning" cause.
   - `DatabaseConnections` (connection storm), `ReplicaLag` (if reads go to replicas).
   - `EBSIOBalance%` / `EBSByteBalance%` on smaller instance classes.
4. **What changed:** a deploy, a new report or batch job, a parameter group change, a minor version upgrade, a maintenance window, a Multi-AZ failover (check RDS events), snapshot/backup timing.
5. **Fix:** add or fix indexes, kill the runaway query, move reads to replicas, add RDS Proxy for connection storms, move gp2 → gp3 or raise IOPS, scale up the instance class (Graviton r7g/r8g for memory), or tune parameters. Turn on slow query logs / `pg_stat_statements` for ongoing visibility.

### AW-1. How do you handle Auto Scaling failures?
First, `aws autoscaling describe-scaling-activities --auto-scaling-group-name <asg>`; the status message almost always names the cause.

| Symptom | Common causes | Fix |
|---|---|---|
| **Launches fail** | insufficient capacity for that instance type in the AZ; vCPU service quota reached; invalid/deleted AMI, key pair or SG; KMS key for encrypted EBS not usable by the ASG service-linked role; IAM instance profile missing; subnet out of IPs | use **multiple instance types** (mixed instances policy, attribute-based selection) and several AZs; raise quotas; fix launch template; grant the KMS key; bigger subnets |
| **Instances launch then get terminated in a loop** | they fail ELB health checks before the app is ready; health check grace period too short; app crashes on boot (bad user data, missing secret) | increase `HealthCheckGracePeriod`, fix the health check path, read the console output / cloud-init logs (`/var/log/cloud-init-output.log`), use lifecycle hooks to finish setup before `InService` |
| **Doesn't scale out when it should** | alarm/metric wrong, `MaxSize` reached, cooldown, scaling policy suspended, target tracking on a metric that doesn't reflect load | check alarms and policies, `SuspendedProcesses`, raise max; scale on request count per target or queue depth instead of CPU |
| **Scales too late** | instances take minutes to boot and warm up | warm pools, pre-baked AMIs, **predictive** or **scheduled scaling** for known peaks, default instance warmup |
| **Flapping** | scale-in too aggressive | longer scale-in cooldown, target tracking with scale-in protection, instance scale-in protection for busy nodes |

Monitor: alarm on `GroupInServiceInstances` < desired, and send scaling activity failures (EventBridge `EC2 Instance Launch Unsuccessful`) to on-call.

### AW-2. How do you troubleshoot load balancer issues?
Start from the **error code and who generated it**: the ALB's access logs show `elb_status_code` vs `target_status_code`.

| Symptom | Meaning | Look at |
|---|---|---|
| **502** | target closed the connection or sent a malformed response | app crashes, keep-alive timeout on the target **shorter** than the ALB idle timeout (set the app's keep-alive higher than 60 s), TLS mismatch to targets ([08 Q17](./08-networking-and-security-fundamentals-qna.md)) |
| **503** | no healthy targets in the target group | target health reasons in the console, health check path/port/codes, SG from ALB to target |
| **504** | target didn't answer within the idle timeout | slow app or DB, target overloaded, SG/NACL silently dropping, idle timeout too low for long requests |
| **460** | client closed the connection before the response | client timeouts shorter than server processing |
| **463 / 400** | malformed request, too many `X-Forwarded-For` hops | proxies in front of the ALB |
| Targets **unhealthy** | health check failing | `curl` the health path *from inside the VPC*, matcher codes, SG allows the health check port from the ALB SG, app listens on 0.0.0.0 not 127.0.0.1 |
| Uneven load | sticky sessions, long-lived connections (gRPC/WebSocket), cross-zone disabled (NLB default) | algorithm (least outstanding requests), cross-zone load balancing |
| Can't reach the LB at all | DNS, listener missing, LB SG, internal vs internet-facing, WAF blocking (403) | `dig`, listeners, WAF logs |

Metrics: `HTTPCode_ELB_5XX_Count` vs `HTTPCode_Target_5XX_Count`, `TargetResponseTime`, `UnHealthyHostCount`, `RejectedConnectionCount`, `SurgeQueueLength` (CLB).

---
## Docker

### DK-1. Container runtime vs Docker Engine?
"Docker" is a stack of layers, and only the bottom ones actually run containers:

```
docker CLI ──REST──▶ dockerd (Docker Engine) ──gRPC──▶ containerd ──▶ containerd-shim ──▶ runc ──▶ container process
                     builds (BuildKit), networks,     high-level runtime:     keeps the      low-level (OCI) runtime:
                     volumes, Compose, API, auth      image pull/unpack,      container      creates namespaces, cgroups,
                                                       snapshots, lifecycle    alive if        seccomp, then exec's the
                                                                               containerd     process and exits
                                                                               restarts
```
- **Docker Engine (`dockerd`)** is the developer-facing platform: CLI/API, image builds, networking, volumes, registry auth.
- A **high-level runtime** (**containerd**, CRI-O) manages images and container lifecycle and exposes the Kubernetes **CRI**.
- A **low-level OCI runtime** (**runc**, crun, gVisor's runsc, Kata) does the kernel work of creating the container.

Why interviewers ask: Kubernetes removed **dockershim** in v1.24, so the kubelet talks to **containerd or CRI-O** directly. Docker-built images still run unchanged, because they're standard **OCI images**. On a node you debug with `crictl ps` / `crictl logs` instead of `docker ps`.

### DK-2. How do you manage environment variables in Docker?
| Method | Example | Notes |
|---|---|---|
| Image default | `ENV APP_PORT=8080` in the Dockerfile | baked into the image; never put secrets here (visible in `docker history` / `inspect`) |
| Build-time only | `ARG VERSION` + `docker build --build-arg VERSION=1.4` | not present at run time unless copied into `ENV` ([03 Q21](./03-docker-qna.md)) |
| Run time, one by one | `docker run -e APP_ENV=prod -e LOG_LEVEL=info app` | overrides `ENV` |
| Run time, from a file | `docker run --env-file ./prod.env app` | keep `.env` files out of Git and out of the image (`.dockerignore`) |
| Compose | `environment:` and `env_file:` per service; `${VAR:-default}` interpolation from the shell or `.env` | different values per environment with override files (`compose.prod.yaml`) |
| Kubernetes | `env`, `envFrom` from ConfigMaps and Secrets | the production equivalent |

For **secrets**, prefer files over env vars: Docker/Compose `secrets:` mounts them at `/run/secrets/<name>`, and BuildKit `RUN --mount=type=secret` for build-time secrets ([03 Q22](./03-docker-qna.md)). Env vars leak easily into crash dumps, `docker inspect`, child processes and logs. Follow the twelve-factor rule: **same image in every environment, different config injected at run time**.

### DK-3. What are common Docker security risks?
| Risk | Why it's dangerous | Mitigation |
|---|---|---|
| Running as **root** in the container | a container escape or volume mount gives root on the host | `USER 10001` in the Dockerfile, rootless Docker / user namespaces |
| `--privileged`, extra capabilities, `--pid=host`, `--network=host` | removes most isolation | never in production; `--cap-drop ALL --cap-add <only what's needed>` |
| Mounting **`/var/run/docker.sock`** | full control of the Docker daemon = root on the host | avoid; use rootless builders (BuildKit rootless, Kaniko) in CI |
| Vulnerable base images and packages | known CVEs | small/distroless base images, scan in CI and the registry, rebuild regularly ([12 Q14](./12-security-devsecops-qna.md)) |
| Secrets in images or env | anyone who pulls the image can read them | BuildKit secret mounts, runtime secret injection ([DK-2](#docker)) |
| Untrusted or tampered images | supply-chain attack | pin by digest, sign and verify (cosign), private registry, admission policies |
| Exposed Docker API (2375 without TLS) | remote code execution on the host | never expose it; TLS client certs if remote access is needed |
| No resource limits | one container starves the host (DoS) | `--memory`, `--cpus`, `--pids-limit` |
| Writable root filesystem | attacker can drop binaries | `--read-only` with tmpfs for scratch dirs |
| Unpatched host kernel | containers share the kernel; kernel bugs = escape | patch hosts, minimal container OS (Bottlerocket, Flatcar), seccomp/AppArmor/SELinux profiles, gVisor/Kata for untrusted code ([03 Q37](./03-docker-qna.md)) |

### DK-4. A container is running but the app isn't accessible. What do you check?
Go from inside the container outwards:
1. **Is the app actually listening?** `docker logs <c>`, then `docker exec <c> ss -tlnp` (or `netstat`). The app may have crashed inside a still-running wrapper, or still be starting.
2. **Listening on the right address?** If it binds to **`127.0.0.1`** inside the container, it's unreachable from outside, even with `-p`. It must bind to **`0.0.0.0`**. This is the most common cause (Flask, Node dev servers, Spring with `server.address`).
3. **Is the port published?** `docker ps` / `docker port <c>`: you need `-p 8080:80` (host:container). `EXPOSE` in the Dockerfile only documents; it doesn't publish. Check the container port matches what the app listens on.
4. **Test locally on the host:** `curl -v localhost:8080`. If that works, the problem is outside Docker.
5. **Host firewall / cloud:** security group, NACL, `firewalld`/`ufw`. Note that Docker writes its own iptables rules, which can bypass `ufw`.
6. **Published only on localhost?** `-p 127.0.0.1:8080:80` binds the host side to loopback only.
7. **Network mode / container-to-container:** on a user-defined network, other containers reach it by **service name and container port** (`http://api:80`), not `localhost` or the host port ([03 Q25](./03-docker-qna.md)).
8. **Health / reverse proxy:** if NGINX or a load balancer sits in front, check its upstream config and logs.

### DK-5. How do you scale applications using Docker?
- **On one host:** `docker compose up -d --scale web=4`. Don't hard-code `container_name` or fixed host ports for scaled services; put a reverse proxy (NGINX, Traefik) in front to spread traffic. This is fine for dev or small internal tools, but a single host is still a single point of failure.
- **Across hosts:** an orchestrator. **Docker Swarm** (`docker service scale web=10`) is simple but has a small ecosystem; **Kubernetes** with Deployments + HPA is the industry default; on AWS, **ECS** with Service Auto Scaling (Fargate or EC2).
- **Prerequisites for scaling out, regardless of tool:** the app must be **stateless** (sessions in Redis or a DB, files in S3/volumes), configured through env vars, fast to start, with a health check, and with graceful shutdown on `SIGTERM` ([20 Q1](./20-devops-roadmap-gap-fill-qna.md)).

### DK-6. What are common Docker issues in production?
| Issue | Typical cause | Fix |
|---|---|---|
| Disk fills up | dangling images, stopped containers, build cache, unbounded **json-file logs** | log rotation (`log-opts: max-size=10m, max-file=3` in `daemon.json`), `docker system prune` on a schedule, separate disk for `/var/lib/docker` |
| Container **OOMKilled** (exit 137) | memory limit too low, JVM not container-aware, leak | right-size limits, `-XX:MaxRAMPercentage`, profile ([03 Q36](./03-docker-qna.md)) |
| Restart loops | crash on boot, missing config, dependency not ready | logs, `docker inspect` exit code, retries / healthchecks for dependencies ([03 Q40](./03-docker-qna.md)) |
| Slow app shutdown, dropped requests on deploy | app is PID 1 and ignores `SIGTERM` (shell-form `CMD`), so Docker kills it after 10 s | exec-form `ENTRYPOINT`, `tini`/`--init`, handle `SIGTERM` |
| Zombie processes | PID 1 doesn't reap children | `--init` / tini |
| Works locally, fails in prod | different architecture (arm64 vs amd64), env vars, `latest` tag | multi-arch builds, pin by digest ([CI-4](#ci-cd-and-deployments)) |
| DNS or network failures | default bridge has no service-name DNS, MTU mismatch on overlay/VPN | user-defined networks, set MTU |
| Time / timezone wrong | no `tzdata` in image | set `TZ`, mount `/etc/localtime` |
| Registry rate limits / pull failures | Docker Hub anonymous pull limits | mirror images to ECR/ACR/Artifactory, authenticate |
| Data lost on redeploy | data written inside the container layer | named volumes or external storage |

### DK-7. How do you monitor Docker containers?
- **Quick look:** `docker stats` (live CPU/memory/net/IO), `docker top`, `docker events` (starts, stops, OOM kills, health changes), `docker inspect --format '{{.State.Health.Status}}'`.
- **Metrics:** **cAdvisor** exposes per-container CPU, memory, network and filesystem metrics; **node_exporter** for the host; Prometheus scrapes both and Grafana shows them. The Docker daemon itself can expose Prometheus metrics (`"metrics-addr"` in `daemon.json`). On ECS, **CloudWatch Container Insights**; commercial agents (Datadog, New Relic) also auto-discover containers.
- **Logs:** apps log to stdout/stderr; ship them with a logging driver (`awslogs`, `fluentd`, `gelf`) or an agent (Fluent Bit, Vector, Promtail/Alloy) to Loki, Elasticsearch or CloudWatch.
- **Health:** a `HEALTHCHECK` in the image, so orchestrators and alerts can tell "running" from "working" ([03 Q27](./03-docker-qna.md)).
- **What to alert on:** restart counts, OOM kills, containers unhealthy for > N minutes, memory near limit, CPU throttling, host disk usage.

### DK-8. What are best practices for Docker in production?
- **Images:** small, pinned base images (distroless/slim/alpine; pin by digest), multi-stage builds, `.dockerignore`, cache-friendly layer order, one process per container ([03 Q16–20, Q30](./03-docker-qna.md)).
- **Tags:** immutable tags (git SHA or semantic version), never deploy `latest`.
- **Security:** non-root user, read-only root filesystem, drop capabilities, no secrets in images, scan in CI and continuously in the registry, sign images ([DK-3](#docker)).
- **Runtime:** CPU and memory limits, `HEALTHCHECK`, restart policy (`unless-stopped`, or let the orchestrator handle it), exec-form `ENTRYPOINT` with proper `SIGTERM` handling.
- **Config:** env vars / mounted config and secrets, the same image across every environment.
- **Data:** volumes or external services for state; containers are disposable.
- **Logs and monitoring:** stdout/stderr logging with rotation, metrics via cAdvisor/Prometheus ([DK-7](#docker)).
- **Hosts:** keep Docker and the kernel patched, a separate disk for `/var/lib/docker`, don't expose the Docker socket.
- **Orchestration:** for more than one host, use Kubernetes or ECS rather than hand-managed `docker run`.

---

## Kubernetes

### K8-1. What are Kubernetes manifest files?
A manifest is a **YAML (or JSON) file describing the desired state** of one or more Kubernetes objects. You submit it with `kubectl apply -f`, and controllers make reality match it. Every manifest has four top-level fields:

```yaml
apiVersion: apps/v1          # API group/version of the object type
kind: Deployment             # object type
metadata:                    # name, namespace, labels, annotations
  name: api
  namespace: payments
  labels: { app: api }
spec:                        # desired state; its shape depends on the kind
  replicas: 3
  selector: { matchLabels: { app: api } }
  template:
    metadata: { labels: { app: api } }
    spec:
      containers:
        - name: api
          image: 111122223333.dkr.ecr.ap-south-1.amazonaws.com/api:1.4.2
          ports: [{ containerPort: 8080 }]
          resources: { requests: { cpu: 250m, memory: 256Mi }, limits: { memory: 512Mi } }
          readinessProbe: { httpGet: { path: /ready, port: 8080 } }
---
apiVersion: v1
kind: Service
metadata: { name: api, namespace: payments }
spec:
  selector: { app: api }
  ports: [{ port: 80, targetPort: 8080 }]
```
The cluster adds a `status` section showing actual state. Several objects can live in one file separated by `---`. In practice manifests are kept in Git and templated with **Helm** or **Kustomize** per environment, validated in CI (`kubectl apply --dry-run=server`, `kubeconform`, policy checks), and applied by a GitOps tool. `kubectl explain deployment.spec` documents any field.

### K8-2. How do you build a highly available Kubernetes cluster?
**Control plane:**
- **3 (or 5) control-plane nodes** spread across **3 availability zones**. etcd needs a **quorum** (majority), so 3 nodes survive 1 failure and 5 survive 2. Never use an even number.
- **etcd topology:** *stacked* (etcd on the control-plane nodes; simpler) or *external* (a separate etcd cluster; more resilient, more to run).
- A **load balancer in front of the API servers** (port 6443); kubelets, users and CI use the LB address. With kubeadm: `kubeadm init --control-plane-endpoint "k8s-api.internal:6443" --upload-certs`, then `kubeadm join ... --control-plane` on the others.
- The scheduler and controller-manager run on every control-plane node and use **leader election**, so only one is active at a time.
- Regular **etcd snapshots** stored off-cluster, and a tested restore ([33 Q56](./33-platform-engineering-deep-dive-qna.md)).
- Or use a managed control plane (**EKS, AKS, GKE**), which handles all of this for you; on AKS, choose the Standard tier for the uptime SLA.

**Worker nodes and workloads:**
- Node groups across **3 AZs**, with the Cluster Autoscaler or Karpenter, and enough spare capacity to lose a whole AZ.
- Workloads with **≥2 replicas** (3 for critical), **topology spread constraints** / pod anti-affinity across zones and nodes, **PodDisruptionBudgets** so drains and upgrades don't take everything down ([20 Q4](./20-devops-roadmap-gap-fill-qna.md)), readiness probes and resource requests.
- **Cluster add-ons in HA too:** CoreDNS (≥2 replicas, autoscaled), ingress controllers, and the CNI.
- **Stateful data** on zone-aware storage or managed databases outside the cluster.

**Beyond one cluster:** for regional DR, run a second cluster in another region with GitOps (both clusters built from the same repo), and back up resources and volumes with Velero ([20 Q21](./20-devops-roadmap-gap-fill-qna.md)).

### K8-3. How do you secure a Kubernetes cluster (RBAC, PSP, NetworkPolicy)?
Note first: **PodSecurityPolicy (PSP) was removed in Kubernetes 1.25.** Its replacement is **Pod Security Admission (PSA)**, plus policy engines (Kyverno, OPA Gatekeeper, or built-in ValidatingAdmissionPolicy) for custom rules. Mentioning PSP as current is a red flag in interviews.

| Layer | Controls |
|---|---|
| **API access** | Authentication through SSO/OIDC (or IAM via EKS access entries), no shared admin kubeconfigs, private API endpoint or IP allowlist, audit logging on |
| **RBAC** | Least-privilege Roles per namespace; avoid `cluster-admin` and wildcards (`*`); separate ServiceAccounts per app with `automountServiceAccountToken: false` where not needed; review bindings regularly ([04 Q33–34](./04-kubernetes-qna.md)) |
| **Pod security (PSA)** | Label namespaces: `pod-security.kubernetes.io/enforce: restricted` (or `baseline`), which blocks privileged pods, hostPath, host networking and root; pods use `runAsNonRoot`, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, drop all capabilities, seccomp `RuntimeDefault` |
| **Policy as code** | Kyverno/Gatekeeper: only images from the trusted registry, signed images (cosign), required labels/limits, no `latest` tag |
| **Network** | **Default-deny NetworkPolicies** per namespace, then allow only needed traffic (including egress); a CNI that enforces them (Calico, Cilium); service-mesh mTLS for encryption and identity |
| **Secrets** | Encryption at rest with KMS, external secret stores (External Secrets Operator, CSI driver), tight RBAC on `secrets` ([20 Q3](./20-devops-roadmap-gap-fill-qna.md)) |
| **Cloud identity** | IRSA / EKS Pod Identity, AKS Workload Identity, GKE Workload Identity instead of node-wide credentials; block pod access to the instance metadata service (IMDSv2 hop limit 1) |
| **Supply chain** | Image scanning in CI and the registry, SBOMs, signed images enforced at admission |
| **Nodes** | Minimal, patched node OS, CIS benchmark (`kube-bench`), kubelet authentication on, no SSH (use SSM) |
| **Runtime detection** | Falco or a commercial tool for suspicious behaviour (shell in container, unexpected outbound connections) |
| **Upgrades** | Stay on supported Kubernetes versions |

### K8-4. Pods are healthy in `kubectl get pods`, but users get 504 errors. Walk through it.
**504 = Gateway Timeout:** a proxy (ALB, Ingress controller, API gateway, service mesh) forwarded the request and **gave up waiting for an answer**. So the pods are reachable, or at least the proxy thinks they are; something on the path is **slow or silently dropping traffic**. (502 = bad/closed response; 503 = no healthy backend.)

1. **Find which hop returns the 504.** The response's `server` header and the logs: ALB access logs (`elb_status_code` vs `target_status_code`), NGINX Ingress logs (`upstream_response_time`, `upstream timed out`), Envoy/Istio `response_flags` (`UT` = upstream timeout).
2. **Is the app slow?** Request latency metrics and traces. Running pods can still be slow because of:
   - slow dependencies (DB, external API) or exhausted DB connection pools,
   - **CPU throttling** from low CPU limits (`container_cpu_cfs_throttled_periods_total`),
   - thread pools saturated, GC pauses.
   Readiness probes often hit a cheap endpoint that doesn't touch dependencies, so pods stay "Ready" while real requests time out.
3. **Timeout mismatch along the chain:** e.g. ALB idle timeout 60 s, NGINX `proxy-read-timeout` 60 s, app needing 90 s for a report. Long operations should be made async, or timeouts aligned deliberately (outer ≥ inner).
4. **Network path silently dropping:** a NetworkPolicy that blocks traffic from the ingress controller's namespace (drops look like timeouts, not refusals), security group rules between the ALB and nodes/pods (EKS with IP targets), node-level `conntrack` table full, MTU problems with VPN/overlay.
5. **Endpoints and routing:** `kubectl get endpointslices -l kubernetes.io/service-name=<svc>`: are the pod IPs right? A Service `targetPort` pointing at a port nothing listens on can cause timeouts rather than errors with some setups.
6. **Only some requests?** One bad pod or node: compare latency per pod; check if 504s cluster on one AZ or node.

Fix the cause (scale, raise limits, fix the slow query, add the NetworkPolicy rule), then add alerts on p99 latency and upstream timeouts, and a readiness check that reflects real health.

### K8-5. A cluster upgrade worked in staging but broke CoreDNS in production. How do you fix it?
**Restore service first:**
1. **Confirm the scope:** `kubectl -n kube-system get pods -l k8s-app=kube-dns`, logs (`kubectl logs -n kube-system deploy/coredns`), and test from a debug pod: `kubectl run -it --rm dnsutils --image=registry.k8s.io/e2e-test-images/agnhost:2.39 -- nslookup kubernetes.default`. Is it all lookups, only external ones, or only some nodes?
2. **Roll back CoreDNS, not the cluster.** A control-plane upgrade usually can't be rolled back, but the CoreDNS add-on can:
   - `kubectl -n kube-system rollout undo deployment/coredns` if the Deployment changed, or
   - re-apply the **previous ConfigMap** (keep a copy: `kubectl -n kube-system get cm coredns -o yaml`), or
   - on EKS, pin the CoreDNS add-on back to the previous compatible version: `aws eks update-addon --addon-name coredns --addon-version <prev> --resolve-conflicts PRESERVE`.
3. **Stopgaps** while you fix it: scale CoreDNS up, and if NodeLocal DNSCache is installed, it can keep serving cached answers.

**Why prod differed from staging (the usual suspects):**
- **Custom Corefile in prod** (stub domains, forwarders to on-prem DNS, `rewrite` rules) that the upgrade or the managed add-on **overwrote**; staging had the default config. With EKS, `--resolve-conflicts OVERWRITE` does exactly this.
- **Removed or renamed plugins** in the new CoreDNS version, so CoreDNS crash-loops on a Corefile that used to be valid.
- **Upstream resolver reachability:** prod forwards to on-prem DNS over VPN/DX; new node security groups or a new node image changed `/etc/resolv.conf` or blocked UDP/TCP 53.
- **Resources:** prod has far more traffic; the new version uses more memory and gets OOMKilled, or the autoscaler config was dropped.
- **RBAC changes:** CoreDNS needs to list/watch EndpointSlices; a missing ClusterRole rule breaks service lookups.
- Node-level DNS changes from a new AMI (systemd-resolved stub, `ndots` behaviour).

**Prevent it next time:** keep CoreDNS config in Git and apply it after upgrades; make staging mirror prod's DNS config and dependencies; add a **synthetic DNS check** (internal service + external domain) that runs during and after upgrades; read the add-on's release notes; upgrade add-ons as a separate, reversible step from the control plane; set `PRESERVE` for managed add-on conflicts.

---

## Terraform

### TF-1. `terraform refresh` vs `terraform plan`?
- `terraform refresh` reads the real state of every resource and **writes it into the state file**, without changing any infrastructure. It's **deprecated** because it updates state with no review: if credentials point at the wrong account or a resource is temporarily unreadable, it can silently corrupt state.
- `terraform plan` **also refreshes** (in memory), then compares real state with your configuration and shows the actions it would take. It doesn't change state.
- The modern replacement for `refresh` is **`terraform apply -refresh-only`** (or `plan -refresh-only`): it shows you what drifted and asks for approval before updating state.
- `plan -refresh=false` skips the refresh for speed on huge states; it's unsafe for real decisions because it ignores drift.

So: use `plan -refresh-only` to **review drift**, `plan` to review **changes you're making**.

### TF-2. How do you migrate Terraform state without recreating resources?
Terraform recreates resources when their **address in state** doesn't match the address in code. Every migration is about moving state, not resources. Always back up first: `terraform state pull > backup.tfstate`.

| Scenario | How |
|---|---|
| **Rename or move a resource into a module** | a `moved` block (reviewed in the plan, works for everyone, can stay in code): `moved { from = aws_instance.web  to = module.web.aws_instance.this }` |
| `count` → `for_each` | `moved { from = aws_instance.web[0]  to = aws_instance.web["a"] }` per instance |
| **Change backend** (local → S3, one bucket → another) | update the `backend` block, then `terraform init -migrate-state` |
| **Split one state into two** (e.g. network out of a monolith) | `removed { from = aws_vpc.main  lifecycle { destroy = false } }` in the old config + an `import` block in the new config; or `terraform state mv -state-out=...` for local states |
| Bring an existing, unmanaged resource in | an `import` block, then `plan` should show **no changes** ([TF-4](#terraform)) |
| Provider/resource type renamed (e.g. split resources) | `moved` blocks across types where the provider supports it; otherwise `removed` + `import` |

The rule for every step: after the change, **`terraform plan` must show zero destroys / replacements** before anyone applies. Run migrations with nobody else applying (state lock), and keep the backup until the next successful apply.

### TF-3. Terraform shows no drift, but someone changed infrastructure manually. How do you investigate?
`plan` only compares **what Terraform manages, and only the attributes it tracks**. Manual changes are invisible when:
1. **The change was to something not in state:** a new security group rule added as a separate object, a new resource created in the console, an extra IAM policy attached. Terraform doesn't know it exists.
2. **The attribute is ignored:** `lifecycle { ignore_changes = [...] }` on that attribute (common for tags, ASG `desired_capacity`, task definition image).
3. **Additive resources:** using `aws_security_group_rule` / `aws_iam_role_policy_attachment` (which manage only *their* item) instead of the exclusive forms. Exclusive resources like `aws_iam_role_policy_attachments_exclusive` or inline `ingress` blocks would show the extra item.
4. **Plan didn't refresh:** `-refresh=false` in CI, or plan ran against a different workspace, account, region or state file than you think.
5. **The provider doesn't read that attribute** back from the API, so it can't detect drift on it.
6. Someone also **ran `terraform apply -refresh-only` or `state` commands** and absorbed the change into state.

**How to find what changed:**
- **AWS CloudTrail** (or Azure Activity Log / GCP Audit Logs): filter for write events (`Create*`, `Modify*`, `Put*`, `Authorize*`) by users who aren't the CI role, over the time window.
- **AWS Config** resource timeline: configuration history per resource, with who changed it.
- Compare the live resource (`aws ec2 describe-security-groups ...`) with `terraform state show <addr>`.
- Tools that look for **unmanaged resources** (e.g. resources in the account with no Terraform tag; tag everything Terraform creates with `managed_by = terraform` via `default_tags`).

**Prevent:** read-only console access in production (changes only through CI's role), an SCP or Config rule alerting on changes not made by the pipeline role, scheduled drift detection, and exclusive resource types for security-sensitive things like SG rules and IAM attachments.

### TF-4. Migrate manually managed infrastructure to Terraform without disrupting production?
1. **Inventory** what exists: by account, VPC and service. Tools like **Terraformer** or `terraform plan -generate-config-out` can draft configs; AWS Config / Resource Explorer list resources.
2. **Prioritise** by risk and value: start with low-risk, frequently changed things (S3 buckets, IAM, security groups), leave databases and core networking until the process is proven.
3. **Import, don't recreate.** Write (or generate) the config, then use **`import` blocks**:
```hcl
import {
  to = aws_s3_bucket.logs
  id = "acme-prod-logs"
}
# terraform plan -generate-config-out=generated.tf   # drafts the resource block for you
```
4. **Iterate until `terraform plan` shows "No changes".** Any diff means your code doesn't match reality; fix the **code**, not the infrastructure. Add `prevent_destroy` on critical resources and `ignore_changes` temporarily for attributes you'll tidy later.
5. **Split state** sensibly from the start: per environment and component (network, data, apps), with remote state and locking.
6. **Move ownership:** once a component is imported, all changes go through PRs and CI; remove humans' write access in the console for that scope. Otherwise drift starts again immediately.
7. **Refactor later** into modules with `moved` blocks ([TF-2](#terraform)), never by destroy/recreate.
8. Do it in **small batches**, each with a reviewed zero-change plan, during normal hours with the owning team aware. The first apply after import should change nothing.

---

## CI-CD and Deployments

### CI-1. How do you manage pipeline configurations and permissions?
**Configuration:**
- **Pipeline as code** in the same repo as the app (`Jenkinsfile`, `.github/workflows/`, `.gitlab-ci.yml`), reviewed through PRs like any code.
- **Shared, versioned templates** so 50 repos don't copy-paste: Jenkins shared libraries, GitHub reusable workflows / composite actions, GitLab `include:` templates. Pin consumers to a version tag ([33 Q19, Q28](./33-platform-engineering-deep-dive-qna.md)).
- **Environment-specific values** in the CI system's environments (GitHub Environments, GitLab environments, Jenkins folders), not hard-coded in the pipeline.
- **Lint and test** pipeline config (actionlint, `jenkinsfile-runner`, GitLab CI lint) ([05 Q30](./05-cicd-jenkins-github-actions-qna.md)).

**Permissions:**
- **Least-privilege tokens:** `permissions:` set per workflow/job in GitHub Actions (default read-only `GITHUB_TOKEN`) ([05 Q18](./05-cicd-jenkins-github-actions-qna.md)).
- **No long-lived cloud keys:** OIDC federation to an IAM role per environment; the prod role trusts only the `main` branch / `production` environment ([33 Q24](./33-platform-engineering-deep-dive-qna.md)).
- **Protected branches and environments:** required reviews, required status checks, CODEOWNERS for pipeline files (so a PR can't quietly change the deploy step), and required approvers for production environments.
- **Secrets** scoped to the environment that needs them, masked in logs, rotated; prefer a secrets manager.
- **Jenkins:** role-based authorization strategy or folder-level permissions, credentials scoped to folders, no builds on the controller ([33 Q23](./33-platform-engineering-deep-dive-qna.md)).
- **Runners:** separate runners (or runner groups) for production deploys; ephemeral runners for untrusted PR builds.
- **Audit:** who changed which pipeline, who approved which deploy.

### CI-2. Deployment works in staging but fails in production. How do you investigate?
Read the **actual error** from the prod deploy and app logs first, then diff the two environments systematically. The difference is almost always one of:

| Area | What to compare |
|---|---|
| **Artifact** | Is it the **same image digest** in both? A rebuild for prod, or a mutable tag, means you didn't actually test what you shipped. |
| **Config & secrets** | missing or different env vars, ConfigMaps, feature flags, secret not created in prod, wrong secret version |
| **Permissions** | IAM role / service account / RBAC in prod is tighter, KMS key policies, a prod-only SCP |
| **Network** | prod NetworkPolicies, security groups, firewall/proxy, private endpoints, DNS names that differ |
| **Data** | prod data volume and shape: a migration that's fast on a small staging DB locks a big prod table; unexpected nulls or encodings |
| **Scale & limits** | resource quotas or LimitRanges in the prod namespace, more replicas hitting connection limits, rate limits from a third party |
| **Infrastructure versions** | Kubernetes / node / runtime / DB versions, a different instance architecture (arm64 vs amd64) |
| **External dependencies** | prod endpoints of partner APIs, different certificates, IP allowlists that only include staging |
| **Deployment mechanics** | different Helm values file, pipeline stage with different steps, PodDisruptionBudgets or HPA settings blocking the rollout |

Tools: `helm diff` / `kubectl diff` between environments, `diff <(kubectl --context stage get deploy x -o yaml) <(kubectl --context prod get deploy x -o yaml)`, Terraform outputs per environment. **Long term**, make staging production-like: the same IaC modules with different sizes, the same image promoted (not rebuilt), config managed the same way, and a smoke test that runs against prod right after deploy ([38 R-2](./38-vpc-terraform-grafana-linux-scenarios-qna.md)).

### CI-3. A deployment causes errors only at peak traffic, and rolling back fixes it. What do you investigate next?
Rollback proves the **new version** is the cause, and "only under load" means it's a **capacity or concurrency** problem, not plain logic. Investigate in a non-prod environment with a load test against both versions, and look at:
- **Resource usage per request:** the new version uses more CPU or memory (new library, serialization change, extra logging), so pods throttle or OOM at peak but not at normal traffic. Compare CPU/memory per request between versions.
- **Database:** a new query pattern or missing index that's fine at low QPS but saturates the DB at peak; N+1 queries; longer transactions causing lock contention.
- **Connection pools and limits:** a changed pool size, new HTTP client without keep-alive, more DB connections per pod × replicas exceeding `max_connections`, file descriptor limits.
- **New downstream calls:** an added call to a service or partner API that rate-limits or slows at volume; missing timeouts or retries that amplify load.
- **Concurrency bugs:** race conditions, thread-safety issues, lock contention that only shows with many parallel requests.
- **Caching:** cache keys changed (so the hit rate dropped and everything hits the DB), or the new version doesn't use the cache.
- **Autoscaling interaction:** slower startup or a heavier readiness check means the HPA can't add pods fast enough.

Compare the two versions' **traces and profiles** under the same load (flame graphs, `pprof`, async-profiler). Prevent recurrence with load tests in CI for performance-sensitive services and **canary releases with automated analysis** on latency and error rate, so a regression is caught at 5% of traffic ([20 Q13](./20-devops-roadmap-gap-fill-qna.md)).

### CI-4. A container works locally but fails after deployment. How do you find the difference?
1. **Get the real error:** `kubectl describe pod` (events: pull errors, OOMKilled, probe failures) and `kubectl logs --previous`.
2. **Same image?** Compare the digest you ran locally (`docker inspect --format '{{index .RepoDigests 0}}'`) with the one in the cluster. "Works locally" often means a locally built image with local changes, never pushed.
3. **CPU architecture:** built on an Apple Silicon Mac (**arm64**), deployed to **amd64** nodes, or the reverse: the error is `exec format error`. Fix with `docker buildx build --platform linux/amd64,linux/arm64`.
4. **Environment and config:** env vars and files you have locally (`.env`, mounted `~/.aws`, a local config file) that aren't in the deployment.
5. **User and filesystem:** Kubernetes may run it as a **non-root user** or with a **read-only root filesystem** (PSA restricted, `securityContext`), so writing to `/app/tmp` or binding port 80 fails. Locally it ran as root.
6. **Resources:** memory limit lower than what it used locally (OOMKilled, exit 137); CPU limits slowing startup so the **liveness probe kills it** before it's ready (use a `startupProbe`).
7. **Network:** locally it reached `localhost:5432`; in the cluster the DB is another service/host. DNS names, NetworkPolicies, egress through a proxy.
8. **Secrets and permissions:** no cloud credentials in the pod (needs IRSA/Workload Identity), missing Secret.
9. **Command differences:** the manifest's `command`/`args` override the image's `ENTRYPOINT`/`CMD`.

Reproduce close to production: run the **same digest** locally with the same user, limits and env (`docker run --user 10001 --read-only --memory 512m --env-file prod-like.env <digest>`), or `kubectl debug` with a copy of the pod.

### CI-5. Deployments are getting faster, but production incidents are increasing. What would you change?
Speed itself isn't the problem; it means the **safety checks didn't scale with the speed**. Measure first: track **change failure rate** and **time to restore** alongside deploy frequency and lead time (all four **DORA** metrics), and tag every incident with the change that caused it. Then:
- **Smaller changes:** many small deploys are safer than few big ones. Feature flags decouple deploying code from releasing features, so you can turn things off without a rollback.
- **Progressive delivery:** canary or blue/green with **automated analysis** of error rate and latency, and automatic rollback ([20 Q13](./20-devops-roadmap-gap-fill-qna.md)).
- **Better tests where incidents actually come from:** if incidents are config, migrations, or integration issues, add tests for those (contract tests, migration checks, config validation), not more unit tests.
- **Production-like staging** and promotion of the same artifact ([CI-2](#ci-cd-and-deployments)).
- **Use error budgets:** when a service has burned its SLO budget, slow down feature releases for it and spend time on reliability ([11 Q15](./11-monitoring-logging-observability-qna.md)).
- **Post-deploy verification:** smoke tests and alerting tied to deploys, so failures are caught in minutes.
- **Blameless postmortems with tracked action items**, looking for patterns (same service, same type of change, same time of day).
- **Guard rails, not gates:** keep deploys fast but add automated checks (policy as code, schema change review, dependency scanning) instead of manual approvals that slow everyone.

### CI-6. Your rollback script fails during an outage, and you have 5 minutes before an SLA breach. What do you do?
**Don't debug the script.** You need the fastest path to restoring service, not to rolling back in the planned way.
1. **Minute 0-1:** say it out loud in the incident channel: "Rollback script failed, switching to manual mitigation." Assign someone else to look at the script failure *in parallel*, and someone to handle communication.
2. **Pick the quickest mitigation you're confident in**, in roughly this order:
   - **Turn off the feature flag** for the new feature, if there is one: seconds, no deploy.
   - **Shift traffic** back: in blue/green, point the LB/Ingress/weighted DNS at the old (still running) environment; in a canary, set the canary weight to 0.
   - **Native rollback** that skips the script: `kubectl rollout undo deployment/<app>`, `helm rollback <release> <rev>`, `argocd app rollback`, or re-deploy the previous image tag manually through the pipeline's "deploy version X" job.
   - **Reduce impact:** scale up, shed load, disable the non-critical failing path, put up a degraded mode.
3. **Database changes:** if the release included a schema migration that the old version can't work with, a code rollback may make things worse. Check before rolling back; this is why migrations should be backward compatible (expand/contract) ([30 Q14](./30-azure-production-scenarios-qna.md)).
4. **Communicate:** if the SLA will be breached anyway, tell the incident commander / customer-facing owner *before* the deadline, with what you're doing and the next update time. A known, communicated breach is far better than a surprise one.
5. **Afterwards:** find why the script failed (untested path, changed credentials, dependency on the broken system). **Test rollback regularly** as part of normal deploys (a rollback that has never run is just a hope), and keep a documented manual fallback in the runbook.

---
## Observability and Incidents

### OB-1. Monitoring is green, but customers report failures or slowness. What do you do? (Also: "SRE says infra is stable, devs say it's slow, dashboards are green: who do you believe?")
**Believe the customers.** Green dashboards mean you're measuring the wrong things, or measuring them in a way that hides the problem. Treat it as a real incident.

1. **Get specifics from the reports:** which feature, which region/ISP/device, error messages, timestamps, request or user IDs. A few concrete failing requests are worth more than any dashboard.
2. **Measure from the user's side:**
   - **Synthetic checks** of the actual user journey (login → search → checkout) from outside your network, not just `/health`.
   - **Real User Monitoring** (browser/mobile timings and errors).
   - Edge logs: CDN, WAF, ALB access logs. Requests may be failing **before they reach** the services you monitor (DNS, TLS certificate, CDN, WAF blocking a region, a third-party script breaking the page).
3. **Look at the right statistics:** **p99/p99.9**, not averages; per-endpoint, per-region and per-customer breakdowns. An average latency of 200 ms can hide 5% of requests taking 10 s, and a global 0.5% error rate can be 100% for one payment method or tenant.
4. **Check what "healthy" checks actually test:** health checks often skip dependencies, so pods are "Up" while the DB pool is exhausted. Status codes can be 200 with an error in the body.
5. **Trace a failing request end to end** using its ID across logs and distributed traces ([35 Q6](./35-observability-rca-scripting-go-qna.md)).
6. **Check dependencies and recent changes:** third-party APIs, a config/feature-flag change, a client app release.

**Fix the monitoring gap afterwards:** alert on **SLOs measured from the user's perspective** (success rate and latency of key journeys), add synthetics for top journeys, and per-dimension breakdowns. The lesson for the "who to believe" version: infra metrics (CPU, memory, pod status) describe the infrastructure; only user-facing SLIs describe the service. Both teams can be "right" while users suffer.

### OB-2. The app is healthy, but users see intermittent timeouts. How do you tell if it's the app, network, infrastructure or load balancer?
Narrow it down by **where time is lost** and **what the failures have in common**.

1. **Characterise the failures:** what percentage, which endpoints, which clients, which AZs, which pods/nodes, what time pattern (every 15 min = a cron, a cache expiry, a token refresh; at peak only = capacity). Correlate with deploys and scaling events.
2. **Get the error from each hop:** client sees a timeout → does the **LB** log the request?
   - **Not in LB logs** → the problem is before the LB: DNS (stale record, resolver timeout), client network, CDN/WAF, LB capacity or a security group.
   - **LB logs it with 504 / `target_processing_time = -1`** → the LB reached a target but didn't get a reply: the app or the path behind the LB.
   - **LB shows a fast response** but the client still timed out → client-side or network between client and LB.
3. **App layer:** does the app's own access log show the request, and how long it took? Traces show which span is slow (DB, downstream API, lock wait). GC pauses, thread-pool exhaustion, CPU throttling ([K8-4](#kubernetes)).
4. **Network layer:** TCP retransmits (`ss -ti`, `netstat -s | grep retrans`, node_exporter `node_netstat_Tcp_RetransSegs`), conntrack table full (`nf_conntrack: table full` in `dmesg`), **NAT gateway port exhaustion** for outbound calls (`ErrorPortAllocation`) ([36 Q53](./36-aws-networking-deep-dive-qna.md)), MTU issues (large responses fail, small ones work), packet loss on one AZ. VPC Flow Logs for `REJECT`s.
5. **Infrastructure:** one bad node (noisy neighbour, disk I/O, CPU steal `%st`), EBS/IOPS limits, DNS resolver throttling (Route 53 Resolver 1,024 packets/s per ENI limit; use NodeLocal DNSCache).
6. **Load balancer:** idle timeout vs app keep-alive mismatch (intermittent 502/504 on reused connections), uneven distribution, unhealthy targets flapping, cross-zone settings.

The quickest discriminator is usually **comparing timestamps across hops for the same failing request** (client → LB → app → DB). Wherever the time gap appears is the faulty layer.

### OB-3. How do you configure alerts with automated remediation?
1. **Good alerts first:** alert on symptoms (SLO burn rate, error rate, latency) for paging; cause-based alerts (disk filling, cert expiring) as tickets ([35 Q10](./35-observability-rca-scripting-go-qna.md), [20 Q17](./20-devops-roadmap-gap-fill-qna.md)).
2. **Only automate a remediation that's well understood:** a fix that's in the runbook, has been done manually many times, and is safe to run twice. Examples: clear a cache or temp directory when disk > 90%, restart a stuck consumer, scale out a queue worker, recycle a node that's NotReady, renew a certificate, fail over a replica.
3. **Wiring:** Prometheus/Alertmanager → **webhook receiver** → automation:
   - Event-Driven Ansible rulebook → AWX job template ([AN-24](#ansible)),
   - AWS: CloudWatch alarm → EventBridge → SSM Automation runbook or Lambda,
   - Kubernetes-native: liveness probes, HPA/KEDA, operators, and the cluster autoscaler already remediate many cases without custom scripts.
4. **Guard rails:**
   - **Rate limits and circuit breakers:** at most N runs per hour per target; stop and page a human if the same fix keeps triggering (it's hiding a real problem).
   - **Blast radius:** act on one host or pod at a time, never "restart everything".
   - **Verify:** check the condition cleared after the action; escalate if not.
   - **Audit and notify:** every automated action is logged and posted to the team channel, linked to the alert.
   - **Dry-run mode** first, then enable for real.
5. **Feed back:** a remediation that fires often is toil; turn it into a permanent fix (bigger disk, log rotation, bug fix).

### OB-4. The AWS bill spiked 3x overnight and no deployments happened. What's your step-by-step response?
"Overnight with no deploys" points to either **runaway automation/usage** or a **compromised account**. Check for compromise first, because it gets more expensive by the hour.

1. **Find where the money is going (15 minutes):**
   - **Cost Explorer**, grouped by **service**, then **region**, then **usage type**, at **hourly** granularity; **Cost Anomaly Detection** may already have flagged it.
   - Look for usage in **regions you don't use** (classic crypto-mining sign), big EC2 GPU instances, a jump in data transfer or NAT gateway processing, Lambda invocations, S3 requests, CloudWatch Logs ingestion.
2. **Rule out compromise:**
   - **CloudTrail**: `RunInstances`, `CreateUser`, `CreateAccessKey`, `CreateLoginProfile`, `AttachUserPolicy` from unusual identities, IPs or regions.
   - **GuardDuty** findings (crypto-mining, anomalous API calls, exfiltration).
   - IAM credential report: new or recently used keys. Check GitHub for leaked keys (AWS also emails you about exposed keys).
   - **If compromised:** disable the keys, terminate rogue resources (in all regions), revoke sessions, follow the incident process ([12 Q21](./12-security-devsecops-qna.md)), and open an AWS Support case (they sometimes credit fraudulent usage).
3. **If not compromised, find the runaway:**
   - **Autoscaling gone wrong:** an ASG, Karpenter or HPA scaled up and never scaled down (a stuck metric, a bad scaling rule).
   - **Loops:** a Lambda triggered by its own S3 writes, a retry storm, an SQS message that's never deleted, a recursive event.
   - **Logging explosion:** debug logging left on, a crash loop writing huge logs to CloudWatch.
   - **Data transfer:** a job copying data cross-region or out to the internet, a misconfigured backup, a cache miss storm pulling from S3 through NAT.
   - **Scheduled jobs:** a batch/ETL job that ran with the wrong parameters, a forgotten load test or EMR cluster.
   - **A "no deploy" that wasn't:** Terraform applies, config changes, feature flags, or another team's account in the same organization.
4. **Stop the bleeding**, then fix the cause and **clean up**.
5. **Prevent:** **AWS Budgets** with alerts (and budget actions) at daily granularity, Cost Anomaly Detection alerts to Slack, SCPs denying unused regions and GPU/large instance types, tagging for ownership, and GuardDuty enabled in every region ([07 Q27](./07-aws-cloud-qna.md), [38 R-6](./38-vpc-terraform-grafana-linux-scenarios-qna.md)).

### IT-1. Incident vs problem in ITIL?
- An **incident** is an unplanned interruption or degradation of a service. The goal of **incident management** is to **restore service as fast as possible**, even with a workaround (restart, failover, rollback).
- A **problem** is the **underlying cause of one or more incidents**. **Problem management** finds the root cause (RCA) and a permanent fix, and it can start before any incident happens (proactive).
- A **known error** is a problem with a documented root cause and workaround, kept in the known error database (KEDB) so the service desk can resolve repeat incidents fast.
- A **change** (via change enablement) is how the permanent fix is deployed.

Example: "Checkout returning 500s" is an incident, resolved by restarting the payment service. Five such incidents in a month raise a problem, whose RCA finds a connection leak, fixed through a change.

### IT-2. Severity vs priority?
- **Severity** = **impact**: how badly the service is broken (e.g. SEV1 total outage, SEV2 major feature down or heavy degradation, SEV3 minor issue with a workaround, SEV4 cosmetic). It's a technical assessment.
- **Priority** = **order of work**: how urgently to act, combining **impact × urgency** plus business context (deadlines, number of customers, regulatory exposure).

They usually move together but not always:
- **High severity, lower priority:** a reporting tool used by three internal users is completely down on a Sunday.
- **Lower severity, high priority:** a typo in the company name on the checkout page before a launch, or a small bug that leaks data for one regulated customer.

In incident response, severity drives the **process** (who's paged, whether there's an incident commander, update frequency); priority drives the **queue** for tickets and fixes ([13 Q2](./13-sre-incident-loadbalancing-servicemesh-qna.md)).

### IT-3. What are the key components of an effective incident report?
1. **Summary:** two or three sentences anyone in the company can understand: what broke, for how long, who was affected, and that it's resolved.
2. **Impact:** duration (start, detection, mitigation, resolution times), affected users/regions/features, error rates, failed transactions, revenue, SLA/SLO breach and error budget used.
3. **Timeline** (with timestamps and time zone): first signal, alert, acknowledgement, key decisions, mitigation, all-clear. Shows MTTD/MTTR honestly.
4. **Root cause and contributing factors:** the technical cause and why the system allowed it (missing test, no alert, risky deploy process). Use 5 Whys ([35 Q19](./35-observability-rca-scripting-go-qna.md)), and avoid stopping at "human error".
5. **Detection:** how it was found (alert, customer, engineer) and how it could have been found sooner.
6. **Resolution and recovery:** what fixed it, any data repair or reconciliation needed.
7. **What went well / what didn't** during response (tools, communication, runbooks).
8. **Action items:** specific, with an **owner and a due date**, prioritised (prevent, detect faster, mitigate faster), tracked in the ticketing system until done.
9. **Blameless tone** throughout: focus on systems and processes, not individuals ([13 Q4](./13-sre-incident-loadbalancing-servicemesh-qna.md)).
10. **Supporting material:** links to dashboards, logs, the incident channel, related past incidents.

---

## Azure AKS

### AZ-1. How do you secure internal AKS networking while exposing only selected apps externally (Azure CNI, NGINX Ingress, Network Policies, service mesh)?
**Network layout:**
- **Azure CNI** (preferably **Azure CNI Overlay**, or **Azure CNI powered by Cilium**) so pods get routable IPs or overlay IPs with eBPF policy enforcement, in a dedicated VNet/subnets per node pool. Hub-and-spoke: the AKS VNet is a spoke peered to a hub with **Azure Firewall** for all egress (`outboundType: userDefinedRouting`), so outbound traffic is filtered and logged.
- **Private cluster** (API server on a private endpoint) or API server VNet integration plus authorized IP ranges; admins reach it through a jump host, Bastion or VPN.

**Two ingress paths:**
- **Internal apps:** an NGINX Ingress controller exposed through an **internal load balancer** (`service.beta.kubernetes.io/azure-load-balancer-internal: "true"`), reachable only from the VNet/on-prem, with Private DNS zones for names.
- **External apps:** a separate ingress class (e.g. a second NGINX controller, or **Application Gateway for Containers / AGIC**) behind **Application Gateway WAF v2** or **Azure Front Door** with WAF and DDoS protection. Only Ingress objects with the external class are reachable from the internet, which makes "what's public" explicit and reviewable. (The community ingress-nginx project was retired in March 2026 and gets no more security fixes, so new designs should use a Gateway API implementation such as Application Gateway for Containers or the Istio gateway; AKS's managed NGINX via the application routing add-on has its own support timeline.)

**East-west controls:**
- **Default-deny NetworkPolicies** in every namespace (Azure Network Policy Manager, Calico, or Cilium), then allow only: ingress controller → app, app → its DB, everyone → CoreDNS on 53.
- **Service mesh** (the **Istio-based service mesh add-on** for AKS) for **mTLS** between services in `STRICT` mode, plus `AuthorizationPolicy` for service-identity-based rules ("only `orders` may call `payments` on `POST /charge`"). NetworkPolicy works on IPs/labels at L3/L4; the mesh adds encrypted, identity-based L7 control.
- **Private Endpoints** for PaaS dependencies (Azure SQL, Key Vault, Storage, ACR) with public access disabled.

**Governance around it:** Azure Policy for AKS to deny public LoadBalancer Services except in approved namespaces, NSGs on subnets, NSG flow logs / Container Network Observability for visibility, and Defender for Containers. The identity and pod-security side (Workload Identity, Key Vault CSI driver, non-root, Entra ID RBAC) is in [25 Q55](./25-azure-deep-dive-qna.md).

---
## Fintech Payments Loop

A three-round SRE/platform loop at an Indian fintech (UPI payments). UPI context worth knowing: the payer's app (PSP) sends requests to **NPCI**, which routes them to the **payer's bank** (debit) and **payee's bank** (credit). Your platform depends on banks and NPCI you don't control, every transaction has a unique ID, and the final state can arrive late (`PENDING` / deemed-approved), so **status checks and reconciliation** are core features, not afterthoughts.

### Round 1: Systems & Design

### FT-1. Design a UPI payments platform that handles massive peak traffic during festivals and sale days.
**Core flow:** API gateway → **payment orchestration service** → per-bank / NPCI **connector services** → banks; results go to a **transaction ledger**, and status changes are published as events (Kafka) for notifications, merchant webhooks, analytics and reconciliation.

**Design for peaks:**
- **Stateless services** on Kubernetes across 3 AZs, autoscaled on request rate and queue depth, and **pre-scaled** before known peaks ([FT-4](#fintech-payments-loop)).
- **Idempotency everywhere:** clients send an idempotency key / the UPI transaction ID; the orchestrator stores it with the request, so retries from the app, gateway or connector never create a second debit.
- **Explicit state machine** per transaction (`INITIATED → SENT_TO_NPCI → PENDING → SUCCESS / FAILED / DEEMED`), persisted at each step before the next call.
- **Async where possible:** the client gets "processing" and then a push or polling result; slow banks don't hold threads. Time-outs move transactions to `PENDING` and a **status-check worker** queries NPCI/the bank later.
- **Per-bank isolation (bulkheads):** separate connection pools, thread pools, rate limits and **circuit breakers per bank**, so one slow bank can't exhaust shared resources ([FT-7](#fintech-payments-loop)).
- **Data:** the ledger in a strongly consistent, horizontally scalable store (sharded PostgreSQL/MySQL by transaction ID, or a distributed SQL DB), **append-only** entries; Redis for idempotency keys, rate limits and hot lookups (VPA → account mappings) with the DB as the source of truth.
- **Load shedding and priorities:** under overload, protect payments over non-critical traffic (history, offers, analytics). Token-bucket rate limits per merchant and per user.
- **Regulatory:** data stored in India (RBI data localisation), PCI DSS/RBI controls, audit logs ([34 Q34–35](./34-onprem-banking-infrastructure-qna.md)).
- **Observability:** success rate **per bank, per app version, per payment type**, latency per hop, pending counts, plus alerts on SLO burn rate.

### FT-2. Multi-region active-active infrastructure for a system with strict transaction consistency?
"Active-active" and "strict consistency" conflict (CAP), so be explicit about the trade-off ([17 Q11](./17-messaging-caching-distributed-systems-qna.md)):

- **Partition ownership (the usual answer):** both regions serve traffic, but **each transaction (or each account/merchant shard) has exactly one home region** that owns its writes. Routing is by the transaction or shard ID. Each region is active for its own shards and a standby for the other's. You get active-active capacity without two regions writing the same row.
- **Distributed SQL with consensus** (Spanner, CockroachDB, YugabyteDB, Aurora DSQL): writes commit by Raft/Paxos quorum across regions, so you get strong consistency, but **every write pays cross-region latency** (Mumbai ↔ Hyderabad is ~20-30 ms, which is acceptable for payments; across continents it often isn't). Place the quorum so a single region loss keeps a majority (e.g. 3 regions, or 2 regions + a witness).
- **What must never happen:** two regions both accepting a debit for the same transaction. Guard with idempotency keys stored in the **consistent** store, and fencing tokens / leases for any leader role.
- **Failover:** health-checked DNS or a global load balancer moves traffic; a region takes over the other's shards only after the failed region is **fenced** (can't write any more), to avoid split brain ([34 Q31](./34-onprem-banking-infrastructure-qna.md)).
- **Eventually consistent parts are fine** for non-money data: notifications, analytics, user profiles, can replicate asynchronously.
- **In-flight transactions at failover** end up `PENDING` and are resolved by status checks and reconciliation ([FT-5](#fintech-payments-loop)), never by guessing.
- Practise regional failover with regular game days.

### FT-3. Design a deployment pipeline for a fintech where every change touching money needs extra safety checks.
Start with the base pipeline ([14 Q15](./14-deployment-systemdesign-behavioral-qna.md), [05 Q28](./05-cicd-jenkins-github-actions-qna.md)), then add a **risk tier** decided automatically from what changed (CODEOWNERS paths like `ledger/`, `settlement/`, `pricing/`, DB migrations on money tables, payment connector config):

| Stage | All changes | "Money path" changes add |
|---|---|---|
| Review | 1 approval, CI green | **2 approvals incl. a domain owner**, security review for auth/crypto changes |
| Tests | unit, integration, SAST/SCA, image scan | **ledger invariant tests** (debits = credits, no negative balances), **idempotency tests** (replay every request twice), contract tests against bank/NPCI simulators, property-based tests for amount/rounding/currency |
| Data | migration lint | backward-compatible (expand/contract) migrations only, run against a prod-sized anonymised copy, with lock-time checks |
| Staging | deploy + smoke | **end-to-end payment flows in a sandbox with real-like bank simulators**, reconciliation run on test transactions that must match exactly |
| Release | canary with auto-rollback | **behind a feature flag**, canary at 1% → 5% → 25% → 100% with automated analysis on **payment success rate, latency, and reconciliation mismatch count**; slower soak times; no releases during peak windows (change freeze around festivals) |
| Approval | automatic | change record (CAB-lite) auto-created with the diff, test evidence and rollback plan; approval by an on-call lead |
| After | standard monitoring | **shadow reconciliation** comparing new vs old code paths' results, extra alerting for the first hours |

Plus: signed artifacts and provenance, separation of duties (the author can't approve their own prod deploy), and every deploy linked to its change record for auditors ([34 Q37](./34-onprem-banking-infrastructure-qna.md)).

### FT-4. Design a capacity plan for predictable peaks (festival days) and unpredictable spikes.
**Predictable peaks:**
1. **Forecast** from history: last year's same festival × growth rate, broken down per minute (peaks are sharp: midnight sale starts, salary day mornings). Add a safety margin (e.g. 1.5-2x forecast).
2. **Find each component's limit** with **load tests** at forecast scale against production-like environments: app pods, DB write throughput, Kafka partitions, Redis, NAT gateways, third-party rate limits. The bottleneck is usually the DB, connection limits, or a partner bank, not the stateless tier.
3. **Pre-scale days ahead:** raise HPA minimums, pre-provision nodes (don't rely on the cluster autoscaler adding hundreds of nodes in minutes), **request cloud quota increases** and capacity reservations, pre-warm load balancers if needed, scale up DBs/read replicas, add Kafka partitions in advance.
4. **Coordinate with partners:** banks and NPCI have their own limits; agree on TPS limits and escalation contacts.
5. **Change freeze** and an on-call war room during the window.

**Unpredictable spikes:**
- **Headroom:** run with spare capacity (e.g. 30-50% at normal peak) on critical paths.
- **Fast autoscaling:** HPA on request rate or queue depth (KEDA), warm node pools / over-provisioning pods (low-priority placeholder pods that get evicted to make room instantly).
- **Graceful degradation:** rate limiting, load shedding of non-critical features, queues to absorb bursts, and per-tenant limits so one merchant's flash sale doesn't hurt others.
- **Alert on saturation** (pool usage, queue lag), not just CPU.

Review after each peak: actual vs forecast, what saturated first, update the model.

### FT-5. How do you design reconciliation so that money is never lost or duplicated, even during failures?
1. **Make the system correct by construction first:**
   - **Idempotency keys** on every money-moving request, stored atomically with the transaction, so retries are safe.
   - **Double-entry, append-only ledger:** every movement is a debit and a credit entry that sum to zero; no updates or deletes, only reversing entries.
   - **Transactional outbox:** the ledger write and the "publish event" record are committed in the **same DB transaction**; a relay publishes from the outbox. No "wrote the DB but lost the event" (or the reverse).
   - **Explicit state machine** with persisted states, so after a crash you know exactly where each transaction stopped.
2. **Then verify continuously, at three levels:**
   - **Internal:** ledger balances vs account balances; every transaction has matching entries; no transaction stuck in an intermediate state beyond its SLA.
   - **External, near-real-time:** for `PENDING`/timed-out transactions, **status-check APIs** to NPCI/banks; resolve to final state.
   - **External, batch (T+0 / T+1):** match your records against **NPCI settlement files and bank statements**, transaction by transaction (by UPI transaction ID / RRN), and by totals.
3. **Classify mismatches:** missing on our side, missing on their side, amount mismatch, status mismatch (we say failed, bank says debited). Each class has an automated resolution where safe (auto-reversal / refund within the RBI-mandated timelines for failed transactions) and a manual queue otherwise.
4. **Never "fix" by editing data:** corrections are new, audited ledger entries with a reason and an approver.
5. **Monitor the reconciliation itself:** mismatch counts and values as an SLO, alerts when they rise, reports for finance and auditors.

### Round 2: RCA & Troubleshooting

### FT-6. Payment success rate drops for one bank only. How do you investigate?
1. **Confirm and scope:** success rate by bank, split by **failure code** (bank declined, timeout, NPCI error codes, technical decline), by transaction type (pay vs collect, debit vs credit side), by app version, and by your instance/AZ. Only one bank dropping almost always means the problem is **between you and that bank** or **at that bank**.
2. **Compare with the ecosystem:** NPCI dashboards / bank status communications, other PSPs' public reports, social media. Banks frequently have planned or unplanned downtime.
3. **Your side for that bank:** connector service errors and latency, the bank-specific **circuit breaker** state, connection pool usage, a recent config or certificate change for that bank (expired client cert, rotated keys, IP allowlist change after your NAT IPs changed), recent deploy of the connector.
4. **Error codes tell you who:** business declines (insufficient funds, wrong PIN) rising normally means user behaviour or a UI problem; technical declines and timeouts point to infrastructure.
5. **Act:**
   - If it's the bank: open an escalation with the bank / NPCI with **evidence** (transaction IDs, timestamps, error codes); **show users a "bank is facing issues" message** or nudge to another bank account; reduce retries to that bank ([FT-7](#fintech-payments-loop)).
   - If it's you: roll back the change, fix the cert/allowlist.
6. Track all **pending** transactions from the window for status checks and reconciliation ([FT-5](#fintech-payments-loop)).

### FT-7. Latency to a payment partner rises, and your retries are amplifying the load. What do you do?
This is a **retry storm**: each layer retries, so one slow partner sees 3 × 3 × 3 = 27x traffic, which makes it slower still.

**Immediately:**
- **Cut retries for that partner:** disable or reduce retries at all but one layer (via config/feature flag), and add **backoff with jitter**.
- **Open the circuit breaker** (or lower the rate limit) for that partner, so you fail fast instead of piling up waiting requests and exhausting your thread and connection pools ([13 Q15](./13-sre-incident-loadbalancing-servicemesh-qna.md)).
- **Protect the rest of the platform:** the bulkhead for that partner should contain the damage; if it isn't isolated, shed that partner's traffic before it takes down unrelated payments.
- **Tell users and the partner:** degraded message in the app, escalate to the partner with data.
- **Don't retry non-idempotent payment calls blindly.** A timeout doesn't mean failure; the debit may have happened. Move them to `PENDING` and resolve via **status check**, not a second payment request.

**Afterwards:**
- **Retry budgets** (e.g. retries ≤ 10% of requests per client), retry only at **one layer**, only on safe/idempotent operations, with exponential backoff + jitter.
- **Timeouts** shorter on the outer layer's view than the sum of inner retries; deadline propagation.
- **Adaptive concurrency limits** per partner, circuit breakers in the mesh or client library, and alerts on retry rate, not just errors.

### FT-8. A database failover happens mid-transaction. How do you verify no transaction was lost or duplicated?
1. **Know what the failover guarantees:** synchronous replication (RDS Multi-AZ, Aurora, synchronous standby) means committed transactions survive; **asynchronous** replication can lose the last few seconds of commits (RPO > 0). Note the exact failover window from DB events.
2. **Find the transactions in the window:** everything with a timestamp from slightly before failover start to after recovery. Three groups:
   - **Committed before failover:** should exist on the new primary. Compare against the application's logs/events and the outbox.
   - **In flight (client got an error or timeout):** the app doesn't know if the commit happened. Its **idempotency key** tells you: on retry, the service checks whether the key exists and returns the original result instead of executing again. Duplicates are prevented by the **unique constraint on the idempotency key / transaction ID**, not by luck.
   - **Sent to the bank but not recorded:** the money moved externally but our record is missing. Found via **status-check** to NPCI/bank for those IDs and by external reconciliation.
3. **Cross-check sources:** DB vs Kafka events (outbox), DB vs NPCI/bank responses, ledger double-entry balance checks (every debit has its credit), counts per minute vs normal.
4. **Run reconciliation early**, not just the nightly batch, for the affected window ([FT-5](#fintech-payments-loop)).
5. **Fix by new entries** (reversals, completions), never by editing rows.
6. Report: number of transactions in the window, how many needed correction, customer impact, and whether any refunds were made within RBI timelines.

### FT-9. Traffic is 10x normal on a festival day and autoscaling is lagging. What are your first moves?
1. **Protect the core first, scale second:** turn on **load shedding / degradation** of non-critical features (offers, history, recommendations, analytics events) via feature flags; **rate limit** at the edge so the backend serves what it can at good quality rather than everything badly. Queue what can be queued.
2. **Scale manually, ahead of the autoscaler:** raise HPA `minReplicas` and node group minimums directly; don't wait for metrics and cooldowns. Add placeholder/over-provisioning capacity if available.
3. **Find the real bottleneck:** if pods are scaling but latency is still bad, the limit is elsewhere: DB CPU/connections, Redis, Kafka consumer lag, NAT port limits, a bank's TPS limit. More pods can make a DB bottleneck worse (more connections), so check before adding.
4. **Cloud limits:** instance capacity in the AZ (use multiple instance types and AZs), vCPU quotas, IP addresses in subnets (EKS IP exhaustion ([33 Q53](./33-platform-engineering-deep-dive-qna.md))).
5. **Communicate:** incident channel, status page, business and partner updates.
6. **Afterwards:** this means the capacity plan missed the peak ([FT-4](#fintech-payments-loop)). Pre-scale for known events instead of relying on reactive autoscaling, and tune the autoscaler (scale on request rate, faster scale-up policies, warm pools).

### FT-10. A deploy goes out clean, and the success rate slowly decays over an hour. What do you suspect?
A **slow decay** (not an instant drop) suggests something that **accumulates** or **ages out**:
- **Resource leaks:** connections, file descriptors, threads or memory leaking per request; pods slowly approach a limit, then start failing or get OOMKilled. Look at pool usage and memory per pod since the deploy.
- **Caches expiring:** the old version's warm cache (or a cache key format) changes; as old entries expire (TTL ≈ 1 hour), more requests miss and hit a slow path or a DB that can't keep up.
- **Tokens and sessions:** a change in auth token handling that only fails when tokens issued before the deploy expire or refresh.
- **Gradual rollout:** the deploy itself, or traffic shifting, is gradual (canary weight increasing, pods replaced slowly, DNS TTLs, clients reconnecting), so the bad version gets more traffic over time.
- **Queues backing up:** a consumer slightly slower than producers; lag grows until timeouts start.
- **Retries building up** into a storm ([FT-7](#fintech-payments-loop)).
- **Scheduled interactions:** an hourly job, a partner's key rotation, a certificate pinned in the new build.
- **Data-dependent bugs:** only some merchants/banks/amounts hit the new code path, and their share grows as the day's traffic mix changes.

**Action:** if success rate is still falling, **roll back first** (correlation with the deploy is enough); then compare old vs new version metrics side by side to find which of these it was. Add canary analysis with a long enough soak time to catch slow decays.

### Round 3: Leadership & Judgement

### FT-11. You're incident commander during a payments outage on a peak day. How do you run the room?
1. **Declare and set up (first 5 minutes):** declare the severity, open one incident channel and one bridge, and assign roles: **IC** (you: decisions and coordination, not debugging), **ops/tech lead(s)** per workstream, **communications lead** (status page, business, banks/NPCI), **scribe** (timeline). Pull in the right teams quickly, but keep the bridge small.
2. **Focus on mitigation, not root cause:** "What's the fastest safe way to restore payments?" Rollback, failover, disable the failing path, shed load. Root cause comes later ([13 Q13](./13-sre-incident-loadbalancing-servicemesh-qna.md)).
3. **Run on a cadence:** every 10-15 minutes, a short sync: current impact (success rate, TPS), what's being tried, next update time. Updates out on schedule even with no news.
4. **Make decisions explicit:** state the decision, the owner and the timebox ("the connector owner rolls back, 10 minutes; if no improvement we fail over to the DR region"). One change at a time so you know what helped.
5. **Protect the responders:** stop side conversations and the flood of executives on the bridge (the comms lead handles them), rotate people on long incidents.
6. **Track money impact:** list affected transaction IDs for reconciliation and refunds; tell customer support what to say.
7. **Close properly:** confirm recovery with metrics (not just "looks better"), keep monitoring, hand over, schedule the **blameless postmortem** within days ([13 Q12](./13-sre-incident-loadbalancing-servicemesh-qna.md), [IT-3](#observability-and-incidents)).

### FT-12. How do you decide to degrade or disable a payment method to protect the overall platform?
Decide with **pre-agreed criteria**, not in the heat of the moment:
- **Blast radius:** is the failing method (one bank, credit-on-UPI, a wallet, a card network) **consuming shared resources** (threads, DB connections, retries) so that healthy methods are degrading too? If yes, isolating it protects everyone else. That's the main trigger.
- **Success rate vs threshold:** e.g. below 50% success for 5+ minutes, or latency so high that users time out anyway. A method that mostly fails is already "disabled" from the user's view, just with a worse experience and more pending transactions.
- **Customer impact of disabling:** share of traffic on that method, whether users have alternatives (another bank account, another method), merchant contracts.
- **Money risk:** failures that produce **ambiguous states** (debited but not confirmed) are worse than clean declines, and cause reconciliation and refund load. That argues for disabling sooner.

**How:** prefer **degrading** to disabling: rate-limit, mark as "slow" in the app, steer users to alternatives, disable only the failing sub-flow. Use pre-built **kill switches** (feature flags per bank/method) documented in the runbook, with authority delegated to the IC so no one waits for a VP at 2 am. Communicate to users in the app, to merchants, and to the partner. Re-enable gradually (a small percentage first) once the partner confirms recovery, and review the decision in the postmortem.

### FT-13. Tell me about a time you balanced speed of fix against the risk of a bad fix.
Sample STAR answer:
- **Situation:** During a weekday evening peak, ~8% of payments to one bank were failing with timeouts after that bank rotated its TLS certificate chain.
- **Task:** As on-call lead I had two options: a quick fix (disable certificate validation for that bank's endpoint, a one-line config change) or the correct fix (add the bank's new intermediate CA to our trust store, which needed a build and a canary).
- **Action:** Disabling validation was fast but meant sending payment traffic over an unverified connection, which was a security and compliance risk I wasn't willing to take. Instead, I **mitigated** first: we showed an in-app message for that bank, shortened timeouts so users failed fast, and stopped retries. In parallel the team shipped the trust store fix through the normal pipeline with an expedited review and a fast canary (5 minutes instead of 30).
- **Result:** The proper fix was live in ~40 minutes. The quick hack would have taken 5, but this kept us within security policy, and the canary actually caught a second missing certificate on one cluster that a blind config push would have missed.
- **Learning:** We added certificate chain monitoring for partner endpoints and a pre-approved emergency change path, so the "safe fix" is also fast next time.

Key message: **mitigate fast, fix safely**, and choose the option you can reverse and verify.

### FT-14. How do you communicate with banks and partners during an incident?
- **Know the channels beforehand:** escalation matrices for each bank and NPCI (L1 → L2 → relationship manager), shared incident bridges, and agreed SLAs for response. Keep them in the runbook and test them; an incident is the wrong time to find a contact list is stale.
- **One owner:** the comms lead (or a partner-relations person) talks to partners, so engineers aren't pulled into many separate calls and the message is consistent.
- **Lead with evidence:** time window, error codes, sample transaction IDs/RRNs, request/response timings, and what you've already ruled out on your side. This gets a fix much faster than "your bank is down".
- **Be factual and blameless:** say what you see, not who's at fault; partners respond better and you may turn out to be the cause.
- **Agree on actions and next update time**, and follow up in writing (email or ticket) so there's a record, which regulators and auditors may ask for.
- **Coordinate customer-facing messages** so you don't publicly blame a bank, and so refund/reversal timelines are consistent.
- **Afterwards:** a joint review for significant incidents, shared action items (monitoring, certificate rotation notice periods, capacity limits), and an updated escalation matrix.

---

## Python, Git and Behavioral

### PY-1. What's the difference between a function and a class in Python?
- A **function** is a reusable block of code that takes inputs and returns an output. It has no state between calls (beyond what you pass in).
- A **class** is a blueprint for **objects** that bundle **state (attributes) and behaviour (methods)** together. Each instance keeps its own state.

```python
def is_healthy(url: str, timeout: float = 3.0) -> bool:    # function: input → output
    return requests.get(url, timeout=timeout).status_code == 200

class HealthChecker:                                       # class: state + behaviour
    def __init__(self, urls: list[str], timeout: float = 3.0):
        self.urls = urls
        self.timeout = timeout
        self.failures: dict[str, int] = {}                 # state kept between calls

    def run(self) -> None:
        for url in self.urls:
            if not is_healthy(url, self.timeout):
                self.failures[url] = self.failures.get(url, 0) + 1
```
Use a **function** when the logic is stateless (most DevOps scripts). Use a **class** when you have state that lives across many operations (a client with a session and retry config, a checker tracking failure counts), several related operations on the same data, or you need multiple instances. Don't create a class with one method; that's just a function. `@dataclass` is handy for classes that mostly hold data.

### PY-2. What are Python type hints?
Type hints (PEP 484) are **optional annotations** describing the expected types of variables, parameters and return values:
```python
from typing import Optional

def scale(deployment: str, replicas: int, namespace: str = "default") -> bool: ...
def find_pod(name: str) -> Optional[dict[str, str]]: ...   # or: dict[str, str] | None  (3.10+)
retries: int = 3
```
- They're **not enforced at run time**; Python ignores them when executing. They're checked by **static type checkers** (`mypy`, `pyright`) in the editor and in CI.
- Benefits: catch bugs before running (passing a `str` where an `int` is expected), much better IDE autocomplete, and the code documents itself. Valuable in shared automation code and libraries.
- Built-in generics work directly since Python 3.9 (`list[str]`, `dict[str, int]`); `X | None` since 3.10. Libraries like **Pydantic** and FastAPI *do* use hints at run time to validate data.
- Add `mypy --strict` (or `pyright`) to CI for internal tools.

### GT-1. What's the difference between a Git branch and a worktree?
- A **branch** is just a movable **pointer to a commit**. In a normal clone you have **one working directory**, so you can only have one branch checked out at a time; switching branches rewrites your files (and you must stash or commit work in progress).
- A **worktree** is an **additional working directory** attached to the **same repository** (shared `.git` objects and history), with a different branch checked out in each:
```bash
git worktree add ../app-hotfix hotfix/payment-timeout   # new dir with that branch checked out
git worktree add -b feature/x ../app-feature main       # create a branch and a worktree at once
git worktree list
git worktree remove ../app-hotfix
```
Use worktrees to work on a hotfix while a feature build or long test runs in another directory, review a PR without disturbing your work, or run several AI coding agents on separate branches in parallel. Rules: the same branch can't be checked out in two worktrees at once, and worktrees are cheaper than a second clone because objects are shared.

### GT-2. A developer accidentally committed directly to `main`. How do you recover safely?
**If it's not pushed yet** (only local):
```bash
git branch feature/oops            # keep the commits on a new branch
git reset --hard origin/main       # move local main back to the remote state
git switch feature/oops            # continue there and open a PR
```
**If it was pushed** and others may have pulled it:
- **Don't rewrite shared history.** Use `git revert <sha>` (or `git revert <oldest>^..<newest>` for several) to create new commits that undo it, push those, and re-apply the change properly through a PR (`git cherry-pick` the original commits onto a feature branch).
- Only force-push (`git push --force-with-lease`) to `main` if the team agrees, nobody has pulled, and nothing deployed from it.
- If CI/CD deployed it automatically, check what's in production and roll back if needed.

**Prevent it:** **branch protection** on `main` (require PRs, reviews and status checks, block force-pushes, include administrators), plus a local pre-push hook if you like ([02 Q49](./02-git-version-control-qna.md)).

### GT-3. `git reset` vs `git revert` vs `git restore`?
| Command | What it changes | Rewrites history? | Typical use |
|---|---|---|---|
| `git reset <commit>` | moves the **branch pointer** (and optionally the index and working tree: `--soft` / `--mixed` / `--hard`) | **yes** | undo local, unpushed commits; unstage files (`git reset HEAD file`) ([02 Q20](./02-git-version-control-qna.md)) |
| `git revert <commit>` | creates a **new commit** that applies the inverse of an earlier one | no | undo something already **pushed / shared**, e.g. a bad change on `main` |
| `git restore <file>` | restores **files** in the working tree (or with `--staged`, the index) from HEAD or another source | no (no commits touched) | discard local edits to a file: `git restore app.py`; unstage: `git restore --staged app.py`; get an old version: `git restore --source=HEAD~3 app.py` |

`git restore` (with `git switch`) was added in Git 2.23 to split the overloaded `git checkout` into clearer commands. Rule of thumb: **reset** for your own local history, **revert** for shared history, **restore** for files.

### GT-4. The repository has become huge and cloning is slow. How do you troubleshoot and optimize it?
**Find out why it's big:**
```bash
git count-objects -vH                         # total pack size
git rev-list --objects --all \
  | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
  | awk '$1=="blob"' | sort -k3 -n -r | head -20   # biggest blobs ever committed
# or: git-sizer, git filter-repo --analyze
```
Usual culprits: binaries, build artifacts, datasets, videos or `node_modules` committed in the past (still in history even if deleted), very long history, many large branches/tags.

**Speed up clones without changing history (start here):**
- **Shallow clones** in CI: `git clone --depth 1` (or `fetch-depth: 1` in GitHub Actions).
- **Partial clones:** `git clone --filter=blob:none` downloads blobs only when checked out; `--filter=tree:0` for even less.
- **Sparse checkout** for monorepos: `git sparse-checkout set services/payments`.
- `--single-branch`, and caching/mirroring the repo on CI runners.
- `git gc --aggressive` / `git maintenance` on the server-side repo.

**Fix the repo itself (needs coordination, rewrites history):**
- Remove large files from history with **`git filter-repo`** (preferred over BFG and `filter-branch`), then everyone must re-clone; open PRs need rebasing.
- Move large binaries to **Git LFS** (`git lfs migrate import --include="*.zip,*.psd"`) or an artifact store (S3, Artifactory).
- Delete stale branches and tags.
- **Prevent recurrence:** `.gitignore` for build outputs, a pre-commit hook or server-side push rule that rejects files over a size limit (GitHub warns at 50 MB, blocks at 100 MB).

### GT-5. Multiple developers push to the same branch and get non-fast-forward errors. How do you resolve them safely?
`! [rejected] main -> main (non-fast-forward)` means the remote has commits you don't have; Git refuses to overwrite them.

**Resolve:**
```bash
git fetch origin
git rebase origin/main           # replay your local commits on top (linear history)
# or: git merge origin/main      # creates a merge commit; safer if your commits are already shared
# fix any conflicts → git add <files> → git rebase --continue
git push
```
Set a default so `git pull` behaves consistently: `git config --global pull.rebase true` (or `pull.ff only`).

**Never** "fix" it with `git push --force`: that deletes your colleagues' commits ([02 Q45](./02-git-version-control-qna.md)). If you must force-push your own feature branch after a rebase, use **`git push --force-with-lease`**, which refuses if someone else pushed in the meantime.

**Prevent it:** many developers pushing directly to one branch is the real problem. Use short-lived feature branches and PRs, protect shared branches (no direct pushes, no force-push), and use a merge queue for busy repos ([02 Q38](./02-git-version-control-qna.md)).

### BH-1. How do you manage multiple projects with competing deadlines?
Show a method, then a real example:
1. **Make all the work visible:** one list/board with every project, its deadline, and an estimate. Hidden work is what causes surprises.
2. **Prioritise by impact and urgency, with stakeholders:** I don't decide priority alone when projects belong to different people; I bring the trade-off to my manager or the stakeholders: "I can deliver A on Friday and B next Wednesday, or B first and A slips. Which matters more to the business?"
3. **Protect production work:** incidents and security fixes interrupt everything; I keep some capacity for them so planned work doesn't constantly slip.
4. **Break work into smaller deliverables** so each project shows progress and can ship a usable first version early.
5. **Reduce the work:** automate repetitive pieces, reuse existing modules, and say no to (or defer) low-value requests.
6. **Communicate early:** if a deadline is at risk, I say so as soon as I know, with options, not on the due date.

Example: "Last quarter I had an EKS upgrade with an AWS end-of-support date, a CI migration the developers were waiting for, and an audit evidence request. I mapped them out, agreed with my manager that the upgrade had a hard external deadline, delivered the audit evidence first because it took two days, and split the CI migration so the three busiest repos moved first. Everything shipped, and the CI migration finished two weeks later than first planned, which everyone had agreed to in advance."

### BH-2. Why should we hire you?
Structure: **their needs → your evidence → what you'll do for them.** Keep it to about a minute and specific to the job description:

"From the job description and our conversation, you need someone to make deployments to your EKS platform safer and faster while keeping costs under control. That's what I've done for the last three years: at my current company I moved 40 services to a GitOps pipeline with Argo CD and canary releases, which cut our change failure rate by about half and deploy time from 45 minutes to under 10. I also led a cost project that reduced the AWS bill by 28% through rightsizing and Graviton, without any availability impact. I'm strongest in Kubernetes, Terraform and CI/CD, I'm comfortable owning production incidents, and I write things down: runbooks, postmortems, docs that other teams use. I'd expect to be useful on your on-call within the first month and to start on the deployment pipeline improvements right after."

Tips: use your real numbers; tie every claim to something they said they need; end with what you'd do for them, not what you want from them.

---

*Part of the [DevOps & Cloud Preparation Hub](../README.md). See [`../Index.md`](../Index.md) for the full repository index.*
