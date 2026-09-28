# 🎯 DevOps Interview Questions & Answers

A comprehensive, self-contained interview prep hub covering **DevOps, Cloud, and SRE** topics from **Junior → Mid → Senior** level. Every file is organized the same way: junior-level fundamentals first (good for calibration even if you're experienced), then mid-level "how does this actually work" questions, then senior-level design/scenario/troubleshooting questions that interviewers use to probe real production experience.

This sits alongside the deep-dive reference notes elsewhere in this repo (`Kubernetes/`, `docker/`, `Terraform and CF/`, `Cloud/`, etc.) — those are the long-form learning material; **this folder is interview-format**: question, then a direct, interview-ready answer.

> **How this was built:** researched from current (2026) industry sources and widely-used interview question banks, then written/synthesized originally by Claude rather than copy-pasted from any single source — so answers are consistent in depth and style across every topic. Where useful, answers include the "why," not just the "what," since that's what actually distinguishes strong interview answers.

---

## 📖 How to use this

- **Interviewing soon for a specific role?** Jump straight to the matching topic file(s) and focus on the tier matching the seniority you're interviewing for — but skim one tier below and above too, since interviewers rarely respect tier boundaries perfectly.
- **Studying broadly?** Work through files roughly in the order listed below — it goes from foundational (Linux, Git) to infrastructure (Docker, Kubernetes) to delivery (CI/CD, Terraform) to platform (Cloud, Networking) to operations (Monitoring, Security, SRE) to judgment (System Design, Behavioral).
- **Short on time?** Every file's senior section alone is a good "do I actually understand this deeply, or just know the definitions" self-check, even for a mid-level interview — senior questions tend to reveal gaps that junior/mid questions don't surface.

---

## 📂 Contents

### Core Fundamentals
| File | Topics Covered |
|---|---|
| [Linux & Shell Scripting](./01-linux-and-scripting-qna.md) | Filesystem, permissions, processes, systemd, namespaces/cgroups, Bash scripting, `awk`/`sed`/`grep`, performance troubleshooting |
| [Git & Version Control](./02-git-version-control-qna.md) | Git internals (blobs/trees/commits), branching strategies, rebase vs. merge, recovery (`reflog`, `bisect`), supply-chain/signing |

### Containers & Orchestration
| File | Topics Covered |
|---|---|
| [Docker](./03-docker-qna.md) | Images/layers, Dockerfile best practices, networking, volumes, multi-stage builds, security, runtime isolation internals |
| [Kubernetes](./04-kubernetes-qna.md) | Architecture, Pods/Deployments/Services, networking model, RBAC, storage, autoscaling, scheduler internals, multi-tenancy, CKA-style troubleshooting |

### Delivery Pipeline
| File | Topics Covered |
|---|---|
| [CI/CD (Jenkins, GitHub Actions, GitLab CI)](./05-cicd-jenkins-github-actions-qna.md) | Pipeline concepts, Jenkinsfile, GitHub Actions workflows/matrix/security, deployment gates, pipeline security, DORA metrics |
| [Terraform & IaC](./06-terraform-and-iac-qna.md) | State & locking, modules, `count` vs `for_each`, drift, policy as code, multi-environment structure, CI/CD for Terraform |

### Cloud & Platform
| File | Topics Covered |
|---|---|
| [AWS Cloud](./07-aws-cloud-qna.md) | EC2, S3, IAM, VPC, RDS, Lambda, EKS, Well-Architected Framework, multi-account strategy, DR strategy, cost/security at scale |
| [Networking & Security Fundamentals](./08-networking-and-security-fundamentals-qna.md) | OSI/TCP-IP, DNS, TLS/mTLS, load balancing (L4 vs L7), firewalls/WAF, zero trust, DDoS defense |

### Configuration Management & More Cloud
| File | Topics Covered |
|---|---|
| [Ansible & Configuration Management](./09-ansible-and-config-management-qna.md) | Playbooks/roles/modules, idempotency, Ansible Vault, testing (Molecule), scaling to large fleets, vs. Chef/Puppet |
| [Azure & GCP](./10-azure-and-gcp-qna.md) | Resource Groups/Entra ID, AKS/GKE, Azure Policy vs GCP Org Policy, multi-cloud tradeoffs |

### Operations & Reliability
| File | Topics Covered |
|---|---|
| [Monitoring, Logging & Observability](./11-monitoring-logging-observability-qna.md) | Metrics/logs/traces, PromQL, cardinality, SLIs/SLOs/error budgets, ELK vs. Loki, alerting design |
| [Security & DevSecOps](./12-security-devsecops-qna.md) | SAST/DAST/SCA, secrets management, supply chain security (SBOM), incident response, vulnerability prioritization |
| [SRE, Incident Response, Load Balancing & Service Mesh](./13-sre-incident-loadbalancing-servicemesh-qna.md) | Toil, incident command, circuit breakers, chaos engineering, service mesh vs. NetworkPolicy, multi-region DR |

### Judgment & Interview Formats
| File | Topics Covered |
|---|---|
| [Deployment Strategies, System Design & Behavioral](./14-deployment-systemdesign-behavioral-qna.md) | Rolling/blue-green/canary/shadow deployments, open-ended system-design scenarios, STAR-method behavioral questions |

### Scripting, Systems Fundamentals & "What Companies Actually Ask"
| File | Topics Covered |
|---|---|
| [Python for DevOps](./15-python-for-devops-qna.md) | `subprocess`, `boto3`/AWS SDK, JSON/YAML parsing, testing/mocking, CLI tool design, scaling scripts |
| [Agile, Scrum & DevOps Culture](./16-agile-scrum-devops-culture-qna.md) | Scrum/Kanban, CALMS, the Three Ways, Conway's Law, driving cultural change |
| [Messaging, Caching & Distributed Systems](./17-messaging-caching-distributed-systems-qna.md) | Kafka/RabbitMQ/SQS, Redis/CDN caching, CAP theorem, replication/sharding, microservices vs monolith, API gateways |
| [Practical Scripting Challenges](./18-practical-scripting-challenges-qna.md) | Real live-coding-style tasks (top processes, disk alerts, log monitoring, cert expiry, failover scripts) with working code |
| [Company-Specific Patterns & Behavioral-Plus](./19-company-specific-and-behavioral-plus-qna.md) | Amazon Leadership Principles, Google/SRE-style loops, interview process breakdowns, resume walkthroughs, rapid-fire round-up |

---

## 📊 At a glance

**19 topic files, 550+ individual Q&A**, each with a full-paragraph, interview-ready answer (not a one-liner) — spanning Linux, Git, Docker, Kubernetes, CI/CD, Terraform/IaC, AWS, Azure, GCP, Networking & Security, Ansible, Python, Agile/Culture, Monitoring/Observability, DevSecOps, SRE/Incident Response/Service Mesh, Messaging/Caching/Distributed Systems, Deployment Strategies, System Design, Behavioral interviewing, practical scripting challenges, and real company-specific interview patterns (Amazon LPs, Google/SRE-style loops).

---

## 🧭 A note on using these to actually prepare

Memorizing these answers verbatim is the wrong way to use this. In a real interview:

- Interviewers probe follow-ups. Understanding *why* an answer is true (which every answer here tries to explain, not just state) is what lets you handle "okay, but what if X" follow-ups instead of freezing when the canned answer runs out.
- Senior-level questions here are deliberately scenario-shaped ("a Pod is stuck in X, walk through diagnosing it") because that's the actual format senior interviews use — reciting a definition when asked a scenario question is a common way strong candidates undersell themselves.
- If you can explain an answer here in your own words, using your own past project as the example instead of a generic one, you're in much better shape than if you can only repeat the text as written.

---

*Part of the [DevOps & Cloud Preparation Hub](../README.md). See [`../Index.md`](../Index.md) for the full repository index.*
