# DevSecOps Overview

What DevSecOps means, why security shifts left, the cloud shared responsibility model, and the core principles underlying every other file in this folder.

---

## 1. What "Shifting Left" Actually Means

Traditional software security treats security as a **gate at the end** — code is written, features are built, and only right before release does a security team review it, run a scan, or perform a pentest.

```
Traditional (security as a late gate):
  Plan -> Code -> Build -> Test -> [ SECURITY REVIEW ] -> Release
                                          ^
                                every finding here is expensive:
                                the design is locked, the sprint is over,
                                the release is blocked
```

**Shifting left** means moving security activities earlier in the software development lifecycle (SDLC) — as early as design and first commit — instead of bolting them on at the end:

```
DevSecOps (security integrated throughout):
  Plan          Code           Build            Test           Release          Operate
  |             |              |                |               |               |
  threat        SAST +         SCA + image      DAST +          signing +       runtime
  modeling      secret         scanning         security        admission       monitoring
               scanning                          test cases      control        + patching
```

The core insight: a vulnerability found in a design review or a pre-commit hook costs minutes to fix. The same class of vulnerability found in a production incident costs an outage, an incident response process, and possibly a breach disclosure. Shifting left doesn't eliminate the need for later-stage checks (DAST, runtime monitoring) — it front-loads the *cheap* checks so fewer issues survive to the *expensive* stages.

### Security-as-gate vs DevSecOps

| | Security-as-gate (traditional) | DevSecOps |
|---|---|---|
| When security is involved | End of the cycle, pre-release | Continuously, every commit/PR/build |
| Who owns security | A separate security team | Shared — developers, ops, and security together |
| Feedback loop | Slow (days/weeks — a scan report handed back) | Fast (seconds/minutes — inline in CI, in the IDE) |
| Tooling | Manual review, periodic pentests | Automated scanning (SAST/DAST/SCA) wired into CI/CD |
| Cost of a finding | High — late-stage rework, possible release delay | Low — caught near the point of introduction |
| Mindset | "Security blocks the release" | "Security is part of the definition of done" |

DevSecOps is not a tool or a team — it's the practice of embedding automated, continuous security checks into the same pipelines and workflows that already build, test, and deploy the software, so that security scales with delivery velocity instead of throttling it.

---

## 2. The Shared Responsibility Model

In any cloud environment (AWS, Azure, GCP), security is **split** between the cloud provider and you. Misunderstanding this split is one of the most common root causes of cloud breaches — teams assume the provider secures something that's actually their job (e.g., "the cloud" doesn't encrypt your S3 bucket contents or lock down your IAM policies for you).

```
+---------------------------------------------------------+
|  Customer responsibility: "Security IN the cloud"        |
|  - Data classification & encryption choices               |
|  - IAM users, roles, policies (who can do what)            |
|  - OS/network/firewall configuration (IaaS)                 |
|  - Application-level security, code, secrets                |
|  - Guest OS patching (IaaS) / dependency patching (all)      |
+---------------------------------------------------------+
|  Cloud provider responsibility: "Security OF the cloud"    |
|  - Physical data center security                            |
|  - Hardware, host OS, hypervisor (virtualization layer)     |
|  - Global network infrastructure                            |
|  - Managed service internals (e.g., RDS engine patching)    |
+---------------------------------------------------------+
```

### The split shifts depending on the service model

| Layer | IaaS (e.g., EC2, Azure VM, GCE) | PaaS (e.g., RDS, App Service, Cloud Run) | SaaS (e.g., Microsoft 365, Salesforce) |
|---|---|---|---|
| Data & access control | **Customer** | **Customer** | **Customer** |
| Application code | **Customer** | **Customer** | Provider |
| Guest OS / runtime patching | **Customer** | Provider | Provider |
| Network controls (security groups, firewalls) | **Customer** | Shared | Provider |
| Hypervisor / host infra | Provider | Provider | Provider |
| Physical infrastructure | Provider | Provider | Provider |

The general rule: **the more "managed" the service, the more the provider absorbs — but data, identity, and access configuration remain the customer's responsibility at every level, in every service model.** This is true across AWS, Azure, and GCP — the naming differs slightly but the split is conceptually identical.

### Practical consequence

A breach caused by an S3 bucket left public, an over-permissioned IAM role, or an unpatched application dependency is **not** a cloud provider failure — it's a customer-side failure under the shared responsibility model, even though it happened "in the cloud." Most publicized cloud breaches fall into this category, not into an actual provider infrastructure compromise.

---

## 3. Core Security Principles

### Least privilege

Grant the **minimum** access required to do a job, nothing more. Covered in depth, with worked IAM/RBAC examples, in [iam-and-least-privilege.md](iam-and-least-privilege.md).

### Defense in depth

No single control is assumed to be perfect — layer multiple, independent controls so that if one fails, another still stops the attack.

```
Attacker's path to a database, layer by layer:
  Network perimeter (firewall/security group)
    -> Network segmentation (private subnet, no public route)
      -> Authentication (mTLS / IAM)
        -> Authorization (least-privilege role, RBAC)
          -> Application-level input validation
            -> Encryption at rest
              -> Audit logging / detection
```

A single misconfigured layer (e.g., an overly broad security group) is a problem, not an automatic breach, *if* the layers behind it are also sound. Relying on exactly one control (e.g., "we're behind a firewall so internal traffic doesn't need auth") is the anti-pattern this principle exists to prevent.

### Zero trust

Never trust a connection or request just because of where it came from on the network (same VPC, same cluster, "internal"). Always verify identity and authorization explicitly, every time.

This is covered in full depth — including mTLS, SPIFFE identities, and Istio `PeerAuthentication`/`AuthorizationPolicy` examples — in [Service Mesh security-and-mtls.md](../Service%20Mesh/security-and-mtls.md). That file is the canonical reference for zero-trust *service-to-service* networking; this note only establishes the principle at a conceptual level so the rest of this folder can build on it (e.g., IAM/RBAC in [iam-and-least-privilege.md](iam-and-least-privilege.md) is zero trust applied to *identity*, not network position).

### Fail securely / secure by default

When something goes wrong (a check errors out, a service is unreachable), the system should default to **denying** access, not granting it. An admission controller that fails open on a scanner timeout, or an auth check that defaults to "allow" on an exception, quietly defeats every control layered on top of it.

---

## 4. Glossary

| Term | Meaning |
|---|---|
| **SAST** | Static Application Security Testing — scans source code without executing it, looking for insecure patterns (SQL injection, hardcoded secrets, unsafe deserialization). See [sast-dast-and-code-scanning.md](sast-dast-and-code-scanning.md). |
| **DAST** | Dynamic Application Security Testing — scans a *running* application by sending it real requests, finding issues only observable at runtime (auth bypass, misconfigured headers, injection that only manifests through the live request path). |
| **SCA** | Software Composition Analysis — scans your dependency tree for known vulnerabilities in third-party/open-source packages. |
| **SBOM** | Software Bill of Materials — a machine-readable manifest listing every component (and version) that makes up a piece of software, similar in spirit to a food ingredients label. See [container-and-image-security.md](container-and-image-security.md). |
| **CVE** | Common Vulnerabilities and Exposures — a unique public identifier (e.g., `CVE-2021-44228`) for a specific known vulnerability. |
| **CVSS** | Common Vulnerability Scoring System — a 0–10 severity score for a CVE, used to prioritize remediation (roughly: 0.1–3.9 Low, 4.0–6.9 Medium, 7.0–8.9 High, 9.0–10.0 Critical). |
| **SLSA** | Supply-chain Levels for Software Artifacts — a framework of increasing maturity levels for securing the software build/release pipeline itself. See [supply-chain-security.md](supply-chain-security.md). |
| **Least privilege** | Grant only the minimum access necessary, nothing more. |
| **Zero trust** | Never implicitly trust based on network location; always verify identity and authorization explicitly. |
| **Attestation** | A signed statement asserting a fact about an artifact (e.g., "this image was built from this exact source commit by this CI pipeline"). |
| **Admission control** | A Kubernetes mechanism that inspects and can reject resources (e.g., Pods) at creation time, used to enforce security policy. |

---

## 5. Contents of This Folder

| File | Covers |
|---|---|
| [devsecops-overview.md](devsecops-overview.md) | This file — shift-left, shared responsibility, core principles, glossary |
| [sast-dast-and-code-scanning.md](sast-dast-and-code-scanning.md) | SAST, DAST, SCA, secret scanning, and where each fits in CI |
| [container-and-image-security.md](container-and-image-security.md) | Image vulnerability scanning, base image strategy, SBOM, signing, admission control |
| [iam-and-least-privilege.md](iam-and-least-privilege.md) | Cloud IAM, Kubernetes RBAC, workload identity, just-in-time access |
| [secrets-management.md](secrets-management.md) | Vault, cloud secrets managers, Kubernetes Secrets limitations, dynamic secrets |
| [supply-chain-security.md](supply-chain-security.md) | Supply chain attack anatomy, SLSA, dependency pinning, provenance |
| [security-in-cicd-pipelines.md](security-in-cicd-pipelines.md) | Pulling every control into one annotated pipeline, fail-vs-warn policy, rollout strategy |

Related security content that already exists elsewhere in this repo and is *not* duplicated here:
- [Docker Security](../docker/docker-security.md) — Dockerfile-level hardening (non-root, capabilities, seccomp, AppArmor)
- [Service Mesh security-and-mtls.md](../Service%20Mesh/security-and-mtls.md) — mTLS, SPIFFE identity, zero-trust service-to-service networking
- [GitHub Actions secrets-and-security.md](../Continuous%20Integration/GithubActions/secrets-and-security.md) — CI-pipeline-specific secrets scoping and OIDC

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
