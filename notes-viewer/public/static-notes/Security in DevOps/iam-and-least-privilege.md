# IAM and Least Privilege

Cloud IAM fundamentals, why broad permissions are dangerous, Kubernetes RBAC worked examples, workload identity as the modern alternative to static credentials, and just-in-time access.

---

## 1. IAM Fundamentals

Every major cloud (AWS, Azure, GCP) models access control around the same three building blocks, just with different names:

| Concept | AWS | Azure | GCP |
|---|---|---|---|
| Identity | IAM User / Role | Azure AD (Entra ID) identity / Managed Identity | IAM Member / Service Account |
| Permission grouping | IAM Policy | Role Definition | IAM Role |
| Binding identity to permissions | Policy attachment | Role Assignment | IAM Policy Binding |

The pattern is always: **identity** (who) + **policy/role** (what actions, on what resources) + **binding** (connecting the two). Everything downstream — least privilege, RBAC, workload identity — is a variation on getting this binding as narrow as possible.

### Least privilege — a concrete bad vs good example

**Bad**: a CI deploy job given broad S3 access because "it needs to upload build artifacts somewhere":

```json
{
  "Effect": "Allow",
  "Action": "s3:*",
  "Resource": "*"
}
```

This policy can read, write, or **delete** every object in **every bucket** in the account — including buckets holding customer data, other teams' Terraform state, or backups, none of which this job has any legitimate reason to touch.

**Good**: scoped to exactly the action and resource the job actually performs:

```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject"],
  "Resource": "arn:aws:s3:::my-app-build-artifacts/*"
}
```

Now, even if this job's credentials are ever compromised (a leaked token, a supply-chain-compromised build step — see [supply-chain-security.md](supply-chain-security.md)), the attacker can only read/write objects in one specific bucket, not exfiltrate or destroy data anywhere else in the account.

---

## 2. The Danger of Overly Broad Permissions

`*:*` (AWS: effectively equivalent to `AdministratorAccess`; Azure: `Owner` role; GCP: `roles/owner`) grants unrestricted control over the entire account/project — every resource, every action, including modifying IAM itself.

### Blast radius reasoning

```
Scoped credential compromised:            Admin credential compromised:
  attacker can touch ONE bucket             attacker can:
                                               - read/exfiltrate ALL data in the account
                                               - delete ALL infrastructure
                                               - create new admin users for persistence
                                               - modify IAM to lock the real owners out
                                               - pivot into connected accounts/VPCs
                                               - disable logging/monitoring to hide activity
```

The core reasoning: **the value of a credential to an attacker is defined by what it can reach, not by how it was originally intended to be used.** A CI token was "only ever meant for deploys," but if it's provisioned with `AdministratorAccess` "to avoid permission errors," its actual blast radius on compromise is the entire account. This is why `*:*`/`AdministratorAccess` as a default is an anti-pattern even when the *current* use case is narrow — permissions get used to their full extent by whoever holds the credential, intentionally or not.

**Practical guidance**: start with zero permissions, add exactly what's needed based on real usage/errors (many cloud providers offer access-analyzer tooling — AWS IAM Access Analyzer, GCP Policy Analyzer — that examines actual API call history to suggest a minimal policy), and treat any `*` in an `Action` or `Resource` field as something that needs explicit justification, not a convenient default.

---

## 3. RBAC in Kubernetes

Kubernetes' native access-control model is Role-Based Access Control — the same least-privilege principle, scoped to cluster/namespace resources instead of cloud API actions.

| Object | Scope | Purpose |
|---|---|---|
| `Role` | Single namespace | Defines a set of permissions (verbs on resources) within one namespace |
| `RoleBinding` | Single namespace | Grants a `Role` (or `ClusterRole`) to a subject, scoped to that namespace |
| `ClusterRole` | Cluster-wide | Defines permissions that can apply cluster-wide, or be reused namespace-scoped via a `RoleBinding` |
| `ClusterRoleBinding` | Cluster-wide | Grants a `ClusterRole` across the entire cluster — use sparingly |

### Worked example: a properly scoped Role for a CI deployer

A CI pipeline that deploys to the `staging` namespace needs to manage Deployments there — nothing else, nowhere else.

```yaml
# Role: scoped to exactly the verbs and resources this job needs, in ONE namespace
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: deployer
  namespace: staging
rules:
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch", "update", "patch"]   # no "delete" — this job only rolls out updates
  - apiGroups: [""]
    resources: ["pods", "pods/log"]
    verbs: ["get", "list"]                                 # read-only, for verifying rollout status
---
# RoleBinding: attaches the Role to a specific ServiceAccount, in the SAME namespace only
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: deployer-binding
  namespace: staging
subjects:
  - kind: ServiceAccount
    name: ci-deployer
    namespace: staging
roleRef:
  kind: Role
  name: deployer
  apiGroup: rbac.authorization.k8s.io
```

Compare to the anti-pattern this avoids:

```yaml
# ANTI-PATTERN: cluster-wide admin bound to a CI service account
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ci-cluster-admin
subjects:
  - kind: ServiceAccount
    name: ci-deployer
    namespace: staging
roleRef:
  kind: ClusterRole
  name: cluster-admin        # full control over EVERY namespace, EVERY resource, including RBAC itself
  apiGroup: rbac.authorization.k8s.io
```

A leaked `ci-deployer` token under the scoped `Role` can, at worst, modify Deployments in `staging`. Under `cluster-admin`, the same leaked token can read every Secret in every namespace, delete production workloads, and grant itself further access — a wildly different blast radius for the same underlying leak.

### Checking effective permissions

```bash
# Verify what a ServiceAccount can actually do BEFORE relying on it — don't just trust the YAML
kubectl auth can-i delete deployments \
  --as=system:serviceaccount:staging:ci-deployer -n staging   # should print "no"

kubectl auth can-i update deployments \
  --as=system:serviceaccount:staging:ci-deployer -n staging   # should print "yes"
```

---

## 4. Service Accounts and Workload Identity

### The problem with static credentials on a workload

Historically, a workload needing cloud access (e.g., a Pod reading from S3) was given a long-lived static credential — an access key baked into an environment variable or mounted secret. This has the same structural problems as any static credential:
- It doesn't expire on its own, so a leak (log exposure, image layer, compromised dependency reading `process.env`) remains exploitable indefinitely until someone notices and manually revokes it.
- It has to be manually rotated, which in practice usually means it's rotated rarely or never.
- It's provisioned once and often over-scoped "to avoid future permission errors" — see §2.

### The modern alternative: workload identity federation

Instead of a stored credential, the cloud provider **trusts a signed identity token the platform already issues**, and exchanges it for short-lived, scoped credentials on demand — the workload never holds a long-lived secret at all.

| Platform | Mechanism |
|---|---|
| AWS EKS | **IRSA** (IAM Roles for Service Accounts) — a Kubernetes ServiceAccount is annotated with an IAM role ARN; pods using that ServiceAccount get temporary STS credentials automatically via a projected OIDC token |
| GKE | **Workload Identity** — a Kubernetes ServiceAccount is bound to a GCP IAM service account; pods authenticate to GCP APIs using the cluster's OIDC issuer, no key file needed |
| Azure AKS | **Workload Identity** (successor to AAD Pod Identity) — same pattern, federates a Kubernetes ServiceAccount token with an Azure AD app registration |

### Worked example: IRSA on EKS

```yaml
# ServiceAccount annotated with the IAM role to assume — no access key anywhere
apiVersion: v1
kind: ServiceAccount
metadata:
  name: s3-reader
  namespace: staging
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/staging-s3-reader
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: staging
spec:
  template:
    spec:
      serviceAccountName: s3-reader   # pod automatically gets a projected OIDC token +
                                        # temporary AWS credentials scoped to staging-s3-reader's policy
      containers:
        - name: app
          image: myregistry/myapp:1.4.0
          # the AWS SDK inside the container picks up the federated credentials automatically —
          # no AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars anywhere in this manifest
```

This is the **exact same underlying pattern** as GitHub Actions OIDC-based cloud deployment — trust a signed token from a platform you already trust (Kubernetes' OIDC issuer, or GitHub's) instead of storing a static credential. See the fully worked AWS OIDC example (IAM trust policy + workflow YAML) in [GitHub Actions secrets-and-security.md §3](../Continuous%20Integration/GithubActions/secrets-and-security.md) — that file covers the CI-time instance of workload identity; this section covers the runtime-workload instance. The security reasoning (no long-lived secret to leak, automatic expiry, precisely scoped trust) is identical in both.

---

## 5. Just-in-Time / Temporary Access vs Standing Access

**Standing access**: a human or service always has a permission, whether or not they're using it right now. Every standing grant is a permanent piece of attack surface — a compromised account with standing admin access is immediately as dangerous as a compromised admin account, all the time, even during the 99% of hours nobody is actually doing admin work.

**Just-in-time (JIT) access**: permissions are granted only for a bounded window, typically requiring an explicit request/approval, and automatically expire.

| | Standing access | Just-in-time access |
|---|---|---|
| Default state | Permission always active | No permission until requested |
| Attack surface | Constant — 24/7 | Limited to the approved window |
| Audit trail | "User X has role Y" (static) | "User X requested role Y at time T, approved by Z, expired at T+1h" (event-based, richer) |
| Typical mechanism | IAM policy attached permanently | AWS IAM Identity Center permission sets with time-bound sessions, `sudo`-style elevation tools (e.g., HashiCorp Boundary, cloud-native PIM in Azure AD) |

Workload identity (§4) is JIT access applied to *machines* — a Pod's credentials exist only for the lifetime of its session token, not permanently. The same principle applies to *humans*: an on-call engineer who needs production database access for an incident should request time-bound elevated access for that incident, not hold standing production access indefinitely "in case it's needed" — the latter means every credential compromise of that engineer's account is automatically a production-database-level incident, regardless of whether they were actually doing anything with that access at the time.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
