# Cloud Security & IAM — Complete Notes

> Part of the [Cloud hub](../README.md). Provider deep dives: [AWS IAM & Security](../AWS/aws-iam-and-security.md) · [Azure Identity & Security](../AZURE/azure-identity-and-security.md) · [GCP IAM & Security](../GCP/gcp-iam-and-security.md). Related: [`Security in DevOps/`](../../Security%20in%20DevOps), [Networking & Security Fundamentals](../../Networking%20and%20Security%20Fundamentals/index.md).

---

## 1. Identity and Access Management (IAM) — the universal model
Every cloud answers: **who** (principal) can do **what** (actions/permissions) on **which resource** (scope), **under what conditions**.

| Concept | AWS | Azure | GCP |
|---|---|---|---|
| Directory of humans | IAM users (avoid) / **IAM Identity Center** + external IdP | **Microsoft Entra ID** | **Cloud Identity / Google Workspace** (or federated IdP) |
| Workload identity | **IAM roles** (instance profile, IRSA / EKS Pod Identity, Lambda execution role) | **Managed identities** (system/user-assigned), service principals | **Service accounts**, Workload Identity (Federation) |
| Permission bundle | **Policy** (JSON: Effect/Action/Resource/Condition) | **Role definition** (Actions/NotActions/DataActions) | **Role** (set of permissions): basic/predefined/custom |
| Granting | Attach policy to user/group/role; resource-based policies | **Role assignment** = principal + role + **scope** | **IAM allow policy binding** = member + role on resource |
| Scope hierarchy | Organization → OU → account (SCPs/RCPs as guardrails) | Management group → subscription → resource group → resource | Organization → folder → project → resource |
| Guardrails | **SCPs, RCPs, permission boundaries** | **Azure Policy**, deny assignments | **Organization Policies**, IAM deny policies, PAB |
| Temporary credentials | **STS** AssumeRole | Entra tokens (OAuth2), PIM just-in-time | Short-lived SA tokens, impersonation |

### Principles
- **Least privilege**: only the permissions needed, at the narrowest scope, for the shortest time. Start from deny; use access analyzers/recommenders to trim (AWS IAM Access Analyzer, Entra access reviews, GCP IAM Recommender).
- **No long-lived keys**: prefer roles/managed identities/workload identity federation; ban access keys / SA keys / client secrets where possible (org policy `iam.disableServiceAccountKeyCreation`).
- **Federation & SSO**: one IdP (Entra ID, Okta, Google) via SAML/OIDC; MFA everywhere (phishing-resistant FIDO2 for admins).
- **Separation of duties** & **just-in-time admin** (Azure PIM, AWS temporary elevated access, GCP PAM).
- **Break-glass accounts**: few, monitored, MFA hardware keys, alarms on use.
- **Groups not individuals**: grant to groups/roles; review regularly.
- **Root/global admin**: lock away, MFA, never used day to day.

### RBAC vs ABAC
- **RBAC**: permissions via roles (Admin, Developer, Reader).
- **ABAC**: decisions based on attributes/tags (`aws:PrincipalTag/team == aws:ResourceTag/team`, Azure ABAC conditions on storage, GCP IAM Conditions with CEL). Scales better for many teams.

---

## 2. Encryption

### In transit
TLS 1.2+ (prefer 1.3) everywhere — client→LB, LB→backend (re-encrypt for compliance), service-to-service (mTLS via service mesh), DB connections (`require SSL`). Managed certificates: ACM, Azure Key Vault / App Service managed certs, Google-managed certs / Certificate Manager. VPN/IPsec or MACsec for private links.

### At rest
All three encrypt storage by default with provider-managed keys. Options:
| Option | Meaning | AWS | Azure | GCP |
|---|---|---|---|---|
| Provider-managed keys | Default, zero effort | SSE-S3, AWS-owned keys | Microsoft-managed keys | Google-managed encryption keys |
| **Customer-managed keys (CMK/CMEK)** | Your key in the cloud KMS; you control rotation, policy, revoke | **KMS** CMK | **Key Vault / Managed HSM** CMK | **Cloud KMS** CMEK |
| Customer-supplied key | You send key per request | SSE-C | (customer-provided keys for Blob) | CSEK |
| External key manager / HYOK | Key never leaves your HSM | XKS (External Key Store) | Managed HSM / DKE | **Cloud EKM** |
| Dedicated HSM | FIPS 140-3 L3 single-tenant | CloudHSM | Managed HSM / Dedicated HSM | Cloud HSM |

### Envelope encryption (how KMS works)
1. Generate a **data encryption key (DEK)** → encrypt data with it locally.
2. Encrypt the DEK with the **key encryption key (KEK)** stored in KMS (KEK never leaves KMS/HSM).
3. Store encrypted DEK next to the data. To decrypt: KMS decrypts DEK → DEK decrypts data.
Benefits: fast bulk encryption, KEK rotation without re-encrypting all data, central audit/revoke via KMS.

---

## 3. Secrets management
| | AWS | Azure | GCP |
|---|---|---|---|
| Secrets store | **Secrets Manager** (rotation via Lambda, cross-region replication); **SSM Parameter Store** (SecureString, cheaper, no native rotation) | **Key Vault** (secrets, keys, certificates; soft-delete, purge protection) | **Secret Manager** (versions, per-secret IAM, replication, rotation notifications) |
| K8s integration | External Secrets Operator / Secrets Store CSI | Key Vault CSI provider / ESO | Secret Manager CSI / ESO |

Practices: never in code/images/Git; inject at runtime; per-secret least-privilege access; rotation; audit every read; pin versions in prod; avoid secrets entirely with identity-based auth (IAM DB auth, managed identity to SQL, Workload Identity).

---

## 4. Network security in the cloud
- **Segmentation**: VPC/VNet per environment; public subnets only for LBs/NAT/bastion; app and DB in private subnets.
- **Stateful firewalls on resources**: AWS Security Groups, Azure NSGs/ASGs, GCP firewall rules (tags/service accounts). **Stateless subnet ACLs**: AWS NACLs.
- **Central firewalls / egress filtering**: AWS Network Firewall, Azure Firewall, GCP Cloud NGFW / Secure Web Proxy.
- **Private access to PaaS**: VPC endpoints/PrivateLink, Azure Private Endpoints, GCP Private Service Connect / Private Google Access.
- **Edge protection**: WAF (AWS WAF, Azure WAF on App Gateway/Front Door, Cloud Armor), DDoS (Shield Standard/Advanced, Azure DDoS Protection, Cloud Armor).
- **Admin access without public SSH/RDP**: AWS SSM Session Manager, Azure Bastion, GCP IAP TCP forwarding; bastion host if needed (hardened, MFA, logged).
- **Zero Trust**: never trust network location; verify explicitly (identity + device + context), least privilege, assume breach (micro-segmentation, encryption, continuous monitoring). Tools: Entra Conditional Access, BeyondCorp/IAP, AWS Verified Access.
- **Defense in depth** layers: physical → identity → perimeter (DDoS/WAF) → network (segmentation) → compute (hardening, patching) → application (secure code) → data (encryption, access).

### Securing a multi-tier web application (classic question)
```
Users → DNS → CDN + WAF + DDoS → Public LB (TLS) → [Private subnet] App tier (autoscaled) → [Private subnet] DB tier (encrypted, Multi-AZ)
```
- Web/LB tier: only 443 from internet; WAF managed rules + rate limiting; TLS certs managed.
- App tier: SG allows only from LB SG; no public IPs; outbound via NAT/egress firewall; roles/managed identity for cloud API access; secrets from secrets manager; patched images; scanning.
- DB tier: SG allows only DB port from app SG; encryption at rest (CMK) + TLS; no public access; automated backups/PITR; IAM DB auth.
- Cross-cutting: least-privilege IAM, MFA, centralized logging (CloudTrail/Activity Log/Audit Logs + flow logs), threat detection (GuardDuty / Defender for Cloud / SCC), vulnerability scanning, config compliance (Config / Policy / Org Policy), backups tested, incident runbooks.

---

## 5. Threat detection, posture & compliance
| Capability | AWS | Azure | GCP |
|---|---|---|---|
| API audit log | **CloudTrail** | **Activity Log** + Entra sign-in/audit logs | **Cloud Audit Logs** (Admin Activity, Data Access, System Event, Policy Denied) |
| Config compliance | **AWS Config** (rules, conformance packs) | **Azure Policy** (+ Regulatory compliance) | Org Policies + **Security Command Center** posture |
| Threat detection | **GuardDuty**, Detective | **Defender for Cloud** (CWPP), Defender XDR | **Security Command Center** (Event/Container Threat Detection) |
| Posture management (CSPM) | **Security Hub** | **Defender for Cloud** (secure score) | **SCC** |
| SIEM/SOAR | Security Lake + partner / OpenSearch | **Microsoft Sentinel** | **Google SecOps (Chronicle)** |
| Vulnerability scanning | **Inspector** | Defender for Servers/Containers | Artifact Analysis, Web Security Scanner |
| Sensitive data discovery | **Macie** | **Microsoft Purview** | **Sensitive Data Protection (DLP)** |
| Data exfiltration perimeter | SCPs/RCPs + VPC endpoint policies (data perimeter) | Private Endpoints + Policy | **VPC Service Controls** |

### Compliance & regulations
- **GDPR** (EU personal data: lawful basis, data minimization, right to erasure, breach notice 72 h, data transfers outside EU), **HIPAA** (US health data: BAA with provider, encryption, audit), **PCI DSS** (card data: segmentation, scanning, logging), **SOC 2**, **ISO 27001**, **FedRAMP**, **DPDP Act** (India).
- Tools: AWS Artifact, Microsoft Service Trust Portal / Purview Compliance Manager, Google Compliance Reports Manager — download provider attestations.
- **Data residency/sovereignty**: restrict regions via SCP `aws:RequestedRegion`, Azure Policy allowed locations, GCP org policy `gcp.resourceLocations`; sovereign clouds (AWS European Sovereign Cloud, Azure sovereign regions, Google sovereign offerings).
- **Compliance audits**: continuous controls (Config/Policy/SCC), evidence collection (Audit Manager), tagging data classification, retention of logs, periodic access reviews.

---

## 6. Cloud incident response (credential compromise playbook)
1. **Detect**: GuardDuty/Defender/SCC alert, billing anomaly, leaked key report (GitHub secret scanning).
2. **Contain**: disable/rotate the credential, revoke sessions (AWS: deny policy with `aws:TokenIssueTime`; Azure: revoke sessions; GCP: disable SA key), isolate affected instances (quarantine SG), snapshot disks for forensics.
3. **Investigate**: CloudTrail/Activity/Audit logs — what did the identity do, which regions, new users/roles/keys created, data accessed.
4. **Eradicate & recover**: remove persistence (rogue IAM users, Lambda, access keys), rebuild from known-good images/IaC, restore data.
5. **Post-incident**: blameless review, enforce MFA, remove long-lived keys, add detections, tighten guardrails.
