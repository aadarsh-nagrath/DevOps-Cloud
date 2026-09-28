# Crossplane — Complete Notes

## 1. Beginner

### What is Crossplane?
- CNCF **graduated** project (originally created by Upbound). Extends Kubernetes beyond application workloads into **cloud infrastructure** management — provisioning an AWS S3 bucket, a GCP CloudSQL database, or an Azure VNet the same declarative way you'd manage a `Deployment`.
- Turns Kubernetes into a **universal control plane**: `kubectl apply` an infrastructure resource, and a controller inside the cluster continuously reconciles the real cloud resource to match your desired state.

### The Core Problem It Solves
```
Without Crossplane:
  App team writes k8s manifests -> kubectl apply -> app deployed
  Infra team writes Terraform/CloudFormation -> separate pipeline, separate tool,
       separate state file, separate RBAC model, separate mental model

With Crossplane:
  Everything -> kubectl apply -> Kubernetes API is the single control plane
  (Deployments, Services, S3 buckets, RDS instances, VPCs — all CRDs,
   all reconciled by controllers, all visible via `kubectl get`)
```
Two teams, two toolchains, two ways of thinking about "did my change actually apply." Crossplane collapses infrastructure provisioning into the same API, RBAC, GitOps, and observability model you already use for application workloads.

### Crossplane vs Terraform
| | Terraform | Crossplane |
|---|---|---|
| Execution model | Imperative-run: `terraform apply` runs once, computes a diff, applies it, then stops | Continuous control loop: a controller watches the resource forever and reconciles drift automatically |
| Drift handling | Only detected/corrected on the next manual/CI-triggered `apply` | Detected and corrected continuously, same as any Kubernetes controller |
| State | Local or remote `.tfstate` file, a known source of pain (locking, corruption, drift from manual changes) | Kubernetes etcd is the state store — no separate state file to manage |
| API surface | HCL, its own CLI/workflow | Kubernetes API — same `kubectl`, same RBAC, same GitOps tooling as everything else in-cluster |
| Abstraction for platform teams | Modules | Compositions/XRDs — a first-class, in-cluster self-service abstraction (see below) |
| Multi-cloud | Providers per cloud, one HCL codebase | Providers per cloud, one Kubernetes API — resources from different clouds are just different CRDs in the same cluster |
- Crossplane isn't strictly a Terraform replacement in every shop — it's common to see Crossplane provision the platform-level self-service layer while Terraform (or Crossplane's own `provider-terraform`) still handles complex, bespoke one-off infrastructure that doesn't fit a reusable abstraction. `provider-terraform` even lets Crossplane wrap and manage existing Terraform modules/state as a managed resource, bridging the two rather than forcing an all-or-nothing migration.

### Core Architecture
```
                     +---------------------------+
                     |     Kubernetes API          |
                     |  (Crossplane installed as   |
                     |   a set of controllers +    |
                     |   CRDs, via Helm)            |
                     +---------------------------+
                                 |
        +------------------------+------------------------+
        |                        |                         |
        v                        v                         v
  [Providers]            [Managed Resources]        [Compositions / XRDs]
  provider-aws,           the actual cloud            platform-team-defined
  provider-gcp,            resource CRDs               abstractions:
  provider-azure...        (Bucket, RDSInstance,        "give me a Database"
  install cloud-specific   SecurityGroup, ...)          expands into N
  CRDs + controllers        one CRD per resource         managed resources
        |                        |                         |
        +------------------------+-------------------------+
                                 |
                                 v
                        Real cloud API calls
                    (AWS/GCP/Azure SDKs, reconciled
                     continuously against desired state)
```

### Core Concepts
| Term | Meaning |
|---|---|
| **Provider** | A plugin that adds CRDs + controllers for one system's resources (`provider-aws-s3`, `provider-gcp-sql`, `provider-kubernetes`, etc.) |
| **Managed Resource (MR)** | A CRD representing one specific cloud resource, 1:1 (e.g., `Bucket`, `RDSInstance`) — the lowest-level building block |
| **Composite Resource (XR)** | A higher-level custom API defined by a platform team (e.g., `Database`) that expands into several Managed Resources |
| **Composite Resource Definition (XRD)** | Defines the schema for an XR — like a CRD-for-CRDs, it's what makes the XR appear as a real API in the cluster |
| **Composition** | The template/logic that maps one XR down to a specific set of Managed Resources (the "how" behind the XR's "what") |
| **Claim (XRC)** | A namespaced, developer-facing request for an XR (e.g., a dev applies a `Database` claim in their namespace; the XR itself is cluster-scoped) |

### Basic Example — Provisioning an S3 Bucket Directly (Managed Resource)
```yaml
apiVersion: s3.aws.upbound.io/v1beta1
kind: Bucket
metadata:
  name: my-app-artifacts
spec:
  forProvider:
    region: us-east-1
  providerConfigRef:
    name: default
```
`kubectl apply -f bucket.yaml` and Crossplane's AWS provider controller creates the real S3 bucket, then reconciles it forever — if someone deletes the bucket out-of-band or changes a setting manually in the AWS console, Crossplane notices on its next reconcile loop and corrects it back to match this spec.

---

## 2. Intermediate

### Installing a Provider and Configuring Credentials
```yaml
apiVersion: pkg.crossplane.io/v1
kind: Provider
metadata:
  name: provider-aws-s3
spec:
  package: xpkg.upbound.io/upbound/provider-aws-s3:v1
```
```yaml
apiVersion: aws.upbound.io/v1beta1
kind: ProviderConfig
metadata:
  name: default
spec:
  credentials:
    source: Secret
    secretRef:
      namespace: crossplane-system
      name: aws-creds
      key: creds
```
The `aws-creds` Secret holds a standard AWS credentials file format (`[default]\naws_access_key_id = ...\naws_secret_access_key = ...`). In production, `source: IRSA` (EKS) or a cloud-native workload identity mechanism is preferred over static keys, exactly like KEDA's TriggerAuthentication pattern.

### XRDs and Compositions — Building a Self-Service "Database" API
This is Crossplane's core value proposition for platform engineering: a platform team defines a simple, opinionated API (`Database`) that developers consume without ever seeing AWS-specific resource types.

**1. Define the schema (XRD):**
```yaml
apiVersion: apiextensions.crossplane.io/v1
kind: CompositeResourceDefinition
metadata:
  name: xdatabases.platform.example.org
spec:
  group: platform.example.org
  names:
    kind: XDatabase
    plural: xdatabases
  claimNames:
    kind: Database
    plural: databases
  versions:
    - name: v1alpha1
      served: true
      referenceable: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                parameters:
                  type: object
                  properties:
                    storageGB:
                      type: integer
                    engine:
                      type: string
                      enum: ["postgres", "mysql"]
                  required: ["storageGB", "engine"]
              required: ["parameters"]
```

**2. Define the expansion logic (Composition) — turns one `Database` claim into an RDS instance + security group:**
```yaml
apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: xdatabases-aws-rds
spec:
  compositeTypeRef:
    apiVersion: platform.example.org/v1alpha1
    kind: XDatabase
  resources:
    - name: security-group
      base:
        apiVersion: ec2.aws.upbound.io/v1beta1
        kind: SecurityGroup
        spec:
          forProvider:
            region: us-east-1
            description: "SG for managed database"
    - name: rds-instance
      base:
        apiVersion: rds.aws.upbound.io/v1beta1
        kind: Instance
        spec:
          forProvider:
            region: us-east-1
            instanceClass: db.t3.micro
            engine: postgres
            allocatedStorage: 20
      patches:
        - fromFieldPath: "spec.parameters.storageGB"
          toFieldPath: "spec.forProvider.allocatedStorage"
        - fromFieldPath: "spec.parameters.engine"
          toFieldPath: "spec.forProvider.engine"
```

**3. A developer requests a database with a Claim — no AWS knowledge required:**
```yaml
apiVersion: platform.example.org/v1alpha1
kind: Database
metadata:
  name: orders-db
  namespace: team-orders
spec:
  parameters:
    storageGB: 50
    engine: postgres
```
`kubectl apply -f orders-db.yaml` in the `team-orders` namespace creates the XR, which the Composition expands into a `SecurityGroup` + `Instance`, both reconciled continuously. The developer never writes AWS-specific YAML.

### Patch Types
| Patch type | What it does |
|---|---|
| `FromCompositeFieldPath` | Copy a value from the XR/claim spec down into a composed resource |
| `ToCompositeFieldPath` | Copy a value from a composed resource's status back up to the XR's status (e.g., surface the real RDS endpoint) |
| `CombineFromComposite` | Combine multiple XR fields into one composed field (e.g., build a name string) |
| `PatchSet` | Reusable named group of patches, referenced by multiple resources in the same Composition |

### Composition Functions (Modern Approach)
Newer Crossplane versions favor **Composition Functions** (`mode: Pipeline`) over the older patch-and-transform style above — functions are small containers (often written in Go, Python, or KCL) that receive the XR as input and return the desired composed resources, giving full programming-language logic (loops, conditionals) instead of declarative patches alone. Patch-and-transform Compositions remain fully supported and are simpler for straightforward cases.

---

## 3. Advanced

### Reconciliation and Drift Correction
- Every Managed Resource has a controller running a standard Kubernetes reconcile loop: observe real cloud state -> diff against desired spec -> create/update/delete as needed -> requeue.
- This is Crossplane's structural advantage over `terraform apply`-on-a-schedule: drift introduced by a manual console change, another automation, or a rogue script is detected and corrected within one reconcile interval (typically under a minute), not at the next scheduled pipeline run.
- `spec.deletionPolicy: Orphan` (vs default `Delete`) controls whether deleting the Kubernetes resource also deletes the underlying cloud resource — critical for adopting existing infrastructure without risking accidental deletion.

### Multi-Cloud and Composition Portability
- Because Managed Resources are just CRDs per provider, the same XRD/Claim API (`Database`) can have **multiple Compositions** targeting different clouds (`xdatabases-aws-rds`, `xdatabases-gcp-cloudsql`) or different configurations (small/large, dev/prod). A claim can select which Composition to use via `compositionSelector` labels — this is how platform teams offer a consistent internal API across multi-cloud or multi-tier environments.

### Security Model
- Crossplane's provider controllers hold real cloud credentials with real permissions — treat `ProviderConfig` secrets with the same care as any cloud IAM credential.
- RBAC on Claims (namespaced) vs XRs/Managed Resources (cluster-scoped) lets platform teams give developers access to request a `Database` claim in their own namespace without granting them any direct access to the underlying `Instance`/`SecurityGroup` managed resources.
- Prefer provider-native workload identity (IRSA on EKS, Workload Identity on GKE) over long-lived static credentials, same rationale as KEDA's TriggerAuthentication.

### Operator/CRD Patterns and GitOps
- Crossplane is itself built entirely on the Kubernetes operator pattern — Providers, XRDs, and Compositions are all just CRDs, which means the entire platform definition (self-service APIs included) is GitOps-friendly: ArgoCD/Flux can sync XRDs, Compositions, Providers, and Claims exactly like any other manifest.
- Common pattern: platform team's Compositions/XRDs live in one Git repo (the "platform config" repo), while application teams' Claims live alongside their app manifests in their own repos — infra self-service without infra teams reviewing every PR.

### Failure Modes / Debugging
| Symptom | Likely cause | Check |
|---|---|---|
| Managed Resource stuck `SYNCED: False` | Provider credentials invalid/expired, or cloud API rejecting the request | `kubectl describe <resource>`, provider pod logs |
| XR created but composed resources never appear | Composition doesn't match `compositeTypeRef`, or `compositionSelector` matched nothing | `kubectl get composition`, check labels on both XR and Composition |
| Claim stuck pending | XRD not yet established, or provider package still installing | `kubectl get xrd`, `kubectl get providers` (check `INSTALLED`/`HEALTHY` columns) |
| Drift not corrected | Reconcile loop errored repeatedly (rate limits, permission denied) | Provider controller logs, check `kubectl get managed` for `READY`/`SYNCED` status |

### Quick Inspection Commands
```bash
kubectl get providers                 # provider install/health status
kubectl get xrd                       # registered composite resource definitions
kubectl get compositions              # available compositions
kubectl get managed                   # every managed resource across all providers, one view
kubectl get databases -A              # claims, if using the example XRD above
kubectl describe bucket my-app-artifacts   # full reconcile status/events for one MR
```

---

## Quick Revision — Crossplane
- Turns Kubernetes into a universal control plane for cloud infrastructure — `kubectl apply` an S3 bucket the same way you'd apply a Deployment.
- Continuous reconciliation, not one-shot apply: this is the structural difference from Terraform. Drift gets corrected automatically on every reconcile loop, not just on the next manual/CI run.
- Providers (provider-aws, provider-gcp, ...) install CRDs + controllers for a cloud's resources.
- Managed Resources = 1:1 CRDs for real cloud resources (`Bucket`, `Instance`, `SecurityGroup`).
- XRD + Composition + Claim = the platform engineering pattern: define a simple self-service API (`Database`) that expands into several underlying Managed Resources — developers never touch cloud-specific YAML.
- Composition Functions (`mode: Pipeline`) are the modern way to write composition logic with real code instead of patch-and-transform YAML.
- `kubectl get managed` gives one unified view across every provisioned cloud resource regardless of cloud/type.
- Treat `ProviderConfig` credentials like real cloud IAM secrets; prefer workload identity over static keys.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
