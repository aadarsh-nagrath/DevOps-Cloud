# Azure Identity, Access & Security — Entra ID, RBAC, Managed Identities, Key Vault, Defender, Sentinel — Complete Notes

> Part of the [Azure overview](./azure.md). Cross-cloud: [Cloud Security & IAM](../Fundamentals/03-cloud-security-and-iam.md).

---

## 1. Microsoft Entra ID (formerly Azure Active Directory)
- Cloud **identity provider** (IdP) and directory: users, groups, devices, applications. One **tenant** = one directory/organization. Subscriptions trust exactly one tenant.
- Protocols: OAuth 2.0, **OpenID Connect**, SAML, WS-Fed (not LDAP/Kerberos — that's AD DS).
- **Entra ID vs on-prem Active Directory Domain Services**: AD DS = Kerberos/NTLM/LDAP, OUs, Group Policy, domain-joined machines on-prem. Entra ID = web/cloud identity over HTTPS for SaaS/Azure/M365, conditional access, MFA. Connected via **Entra Connect**.
- **Microsoft Entra Domain Services**: managed domain (LDAP, Kerberos, NTLM, Group Policy) for legacy apps in Azure without running DCs.
- **Licenses**: Free, P1 (Conditional Access, dynamic groups, hybrid), P2 (**PIM**, **ID Protection**, access reviews), Entra ID Governance.
- **External identities**: **B2B collaboration** (invite partners as guests using their own identities), **B2B direct connect** (Teams shared channels), **Entra External ID** for customer-facing apps (CIAM, replacing Azure AD B2C for new customers).

### Authentication methods
- **SSO**: one sign-in for many apps (gallery SaaS apps via SAML/OIDC, on-prem apps via **Application Proxy** / Global Secure Access).
- **MFA**: something you know + have + are; methods: Microsoft Authenticator push/number matching, OATH tokens, SMS/voice (weak), **FIDO2 security keys**, Windows Hello. **Security defaults** turn on baseline MFA for small tenants.
- **Passwordless**: Windows Hello for Business, Authenticator passwordless sign-in, **passkeys/FIDO2** — phishing-resistant, best for admins.
- **Self-service password reset (SSPR)**, password protection (banned passwords).

### Conditional Access (P1)
"**If** signal **then** decision" policies evaluated at sign-in:
- Signals: user/group, app, location/IP (named locations), device platform/compliance (Intune), sign-in risk & user risk (ID Protection), client app.
- Decisions: block, grant with requirements (MFA, compliant/hybrid-joined device, approved app, **authentication strength**, terms of use), session controls (sign-in frequency, app-enforced restrictions).
- Examples: require MFA for admins; block legacy authentication; require compliant device for M365; block sign-ins from untrusted countries; require password change for high user risk.
- Use **report-only mode** first; exclude break-glass accounts.

### Privileged Identity Management (PIM, P2)
Just-in-time, time-bound, approval-required activation of Entra roles and Azure RBAC roles; MFA on activation; access reviews; alerts. Eliminates standing admin access.

## 2. Azure RBAC (authorization for Azure resources)
- **Role assignment** = **security principal** (user, group, service principal, managed identity) + **role definition** (permissions: `Actions`, `NotActions`, `DataActions`, `NotDataActions`) + **scope** (management group / subscription / resource group / resource).
- Assignments **inherit downward**. Effective permissions = union of all assignments; **deny assignments** (created by Blueprints/Deployment Stacks/managed apps) override.
- Built-in roles: **Owner** (full + manage access), **Contributor** (full, no access management), **Reader**, **User Access Administrator** (manage access only), **Role Based Access Control Administrator** (manage role assignments, can be constrained with conditions), service-specific (Virtual Machine Contributor, Storage Blob Data Reader, Key Vault Secrets User, AcrPull…). **Custom roles** with assignable scopes.
- **Control plane vs data plane**: `Contributor` can manage a storage account but **cannot read blob data** unless a data role (Storage Blob Data Reader) — DataActions.
- **Entra roles vs Azure roles**: Entra roles (Global Administrator, User Administrator, Application Administrator) manage the *directory*; Azure RBAC roles manage *Azure resources*. A Global Admin can elevate to User Access Administrator at root scope (break-glass).
- **ABAC**: role assignment conditions (e.g. only blobs with tag `project=alpha`).
```bash
az role assignment create --assignee <objectId-or-upn> --role "Storage Blob Data Reader" \
  --scope /subscriptions/<sub>/resourceGroups/rg-data/providers/Microsoft.Storage/storageAccounts/stdata
```

## 3. Workload identities: service principals vs managed identities
| | **Service principal** | **Managed identity** |
|---|---|---|
| What | Identity of an **app registration** in a tenant | Entra identity **managed by Azure** for an Azure resource |
| Credentials | Client secret or certificate — **you** store/rotate (or **federated credentials** — no secret) | **None to manage** — Azure handles tokens & rotation |
| Where usable | Anywhere (on-prem, other clouds, CI/CD) | Only from Azure resources (VM, App Service, Functions, AKS workload identity, Container Apps, ADF…) |
| Types | — | **System-assigned** (tied to resource lifecycle, 1:1) / **User-assigned** (standalone, shareable across resources, survives resource deletion) |
- App registration (global app object) vs **enterprise application** (service principal = local instance in a tenant, where users/permissions are assigned).
- **Workload identity federation**: trust external OIDC tokens (GitHub Actions, Kubernetes service accounts, other clouds) → no secrets. Preferred for CI/CD.
- Prefer: managed identity inside Azure; federated credentials outside; secrets/certs only as last resort (short expiry, Key Vault).

## 4. Azure Key Vault
- Stores **secrets** (passwords, connection strings), **keys** (RSA/EC, software or **HSM-backed** in Premium; for encryption/signing, CMK), **certificates** (lifecycle, auto-renewal with integrated CAs).
- Access model: **Azure RBAC** (recommended — `Key Vault Secrets User`, `Key Vault Crypto User`, `Key Vault Administrator`) or legacy vault access policies.
- Protection: **soft delete** (mandatory, 7–90 days) + **purge protection** (prevents permanent deletion during retention — required for CMK scenarios); private endpoints; firewall; logging to Log Analytics; key rotation policies.
- Integrations: App Service/Functions **Key Vault references** in app settings, AKS **Key Vault CSI driver**, VM extensions for certs, ARM/Bicep `getSecret`, CMK for Storage/SQL/Disks.
- **Managed HSM**: single-tenant FIPS 140-3 Level 3 HSM pools for high compliance.
```bash
az keyvault create -n kv-app-prod -g rg --enable-rbac-authorization --enable-purge-protection
az keyvault secret set --vault-name kv-app-prod -n DbPassword --value '<value>'
```

## 5. Security models & services
- **Zero Trust** principles: **verify explicitly** (always authenticate/authorize with all signals), **use least-privilege access** (JIT/JEA, risk-based adaptive policies), **assume breach** (segment, encrypt end-to-end, analytics for detection).
- **Defense in depth** layers: physical security → identity & access → perimeter (DDoS, firewalls) → network (segmentation, NSGs) → compute (patching, endpoint protection) → application (secure dev) → data (encryption, classification).
- **Microsoft Defender for Cloud**: **CSPM** (secure score, recommendations, attack path analysis, regulatory compliance dashboards — free foundational + Defender CSPM paid) + **CWP** plans (Defender for Servers, Containers, Storage, SQL, App Service, Key Vault, Resource Manager, DNS, APIs) — threat detection & vulnerability assessment across Azure, AWS, GCP and on-prem (via Arc). **Just-in-time VM access**, adaptive hardening, file integrity monitoring.
- **Microsoft Sentinel**: cloud-native **SIEM + SOAR** on Log Analytics: data connectors (Entra, Defender, AWS CloudTrail, firewalls, syslog), analytics rules (KQL), incidents, hunting, workbooks, **playbooks** (Logic Apps automation), UEBA, threat intelligence; part of the unified Defender portal.
- **Microsoft Defender XDR** (M365 Defender) for endpoints, identity, email, apps.
- **Azure Policy + Defender + Sentinel together**: Policy prevents misconfiguration, Defender finds posture issues and threats, Sentinel correlates and responds organization-wide.

## 6. Identity & security best practices (interview checklist)
1. Entra ID as single IdP; SSO for all apps; hybrid via Entra Connect with Password Hash Sync.
2. MFA for all users (phishing-resistant for admins); block legacy auth; Conditional Access baseline policies.
3. PIM for all privileged roles; ≤5 Global Admins; 2 break-glass accounts excluded from CA with alerts.
4. RBAC at the right scope via **groups**; avoid Owner at subscription for individuals; custom roles sparingly.
5. Managed identities / workload identity federation instead of secrets; secrets in Key Vault with RBAC, purge protection, private endpoint.
6. Azure Policy initiatives for guardrails; Defender for Cloud plans on; secure score tracked; Sentinel for SOC.
7. Network: private endpoints, NSGs, Azure Firewall in hub, Bastion, WAF on Front Door/App Gateway, DDoS Protection for internet-facing.
8. Diagnostic settings to Log Analytics for all resources; Activity Log retained; alerts on role assignment changes.
