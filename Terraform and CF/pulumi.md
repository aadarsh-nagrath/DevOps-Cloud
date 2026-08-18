# Pulumi — Master Notes

Complete notes on Pulumi, structured beginner → intermediate → advanced. Pulumi is Infrastructure as Code (IaC) using general-purpose programming languages instead of a DSL — sits alongside [Terraform](terraform.md) and [CloudFormation](cloud-formation.md) in this repo's IaC section.

---

## 1. Beginner — Core Concepts

### What is Pulumi?
Pulumi is an open-source IaC tool that lets you define, deploy, and manage cloud infrastructure using **real programming languages** (TypeScript, Python, Go, C#, Java, YAML) instead of a custom DSL like HCL. You write normal code — loops, functions, classes, `if` statements, package managers — and Pulumi turns it into a declarative resource graph that gets diffed and applied against the cloud, the same conceptual model as Terraform.

#### Key Characteristics
- **General-purpose languages**: no new syntax to learn — use the language (and its tooling: linters, IDEs, unit test frameworks, package managers) you already know.
- **Declarative engine under an imperative-looking language**: your program *runs* to build a desired-state graph; Pulumi's engine still diffs desired vs actual state and computes a plan, exactly like Terraform.
- **State management**: tracks resource state in a **stack** — backed by Pulumi Cloud (SaaS, free tier), self-managed object storage (S3/Azure Blob/GCS), or local files.
- **Multi-cloud**: providers for AWS, Azure, GCP, Kubernetes, Docker, and 150+ others, built on the same provider model as Terraform (many Pulumi providers are auto-generated bridges over Terraform providers).
- **Component reuse**: infrastructure abstractions are just classes/functions — reuse via your language's native package manager (npm, PyPI, NuGet, Go modules) instead of a bespoke module registry.

### Pulumi vs Terraform

| Aspect | Pulumi | Terraform |
|---|---|---|
| Language | TypeScript, Python, Go, C#, Java, YAML | HCL (custom DSL); JSON |
| Learning curve | Low if you know the language; new SDK concepts (Input/Output) | Low but HCL-specific patterns (loops via `count`/`for_each`) |
| Logic/control flow | Native (`if`, `for`, functions, classes) | HCL functions, `count`, `for_each`, `dynamic` blocks |
| State | Pulumi Cloud / self-managed backend (S3, Azure Blob, GCS, local) | Terraform Cloud / self-managed backend (S3, Azure Blob, GCS, local) |
| Providers | Wraps/bridges Terraform providers + native providers | Native provider ecosystem (largest) |
| Secrets | Encrypted by default per-stack (via KMS/Cloud) | Plaintext in state by default unless backend encrypts |
| Testing | Native unit tests (mock the engine) in your language's test framework | Plan review, Terratest (external Go tests), native `terraform test` (HCL-based) |
| Policy as Code | CrossGuard (policies written in TS/Python) | Sentinel (HCP Terraform) / OPA via Conftest |
| Ecosystem maturity | Smaller, growing | Largest IaC ecosystem, most mature |

**When to pick Pulumi**: team is already strong in a general-purpose language, wants real unit tests / IDE autocomplete / abstraction via functions & classes, or needs to embed complex conditional logic that gets awkward in HCL.

**When to pick Terraform**: want the largest ecosystem/community, a stable long-lived DSL not tied to a language runtime, or existing team HCL expertise.

### Core Vocabulary
- **Program**: the code (in your chosen language) that declares resources — the Pulumi equivalent of `.tf` files.
- **Resource**: a single piece of infrastructure (an S3 bucket, an EC2 instance, a K8s Deployment).
- **Stack**: an isolated, independently configurable instance of a Pulumi program — typically maps to an environment (`dev`, `staging`, `prod`) or region.
- **Project**: a directory with a `Pulumi.yaml` — the unit that contains one or more stacks.
- **Backend**: where state (checkpoint) is stored — Pulumi Cloud (default), or self-managed (`s3://`, `azblob://`, `gs://`, `file://`).
- **Input / Output**: Pulumi's mechanism for handling values not known until after `apply` (analogous to Terraform's unknown-at-plan-time attributes) — `Output<T>` is a promise-like wrapper you `.apply()` transforms onto.

### Installation & First Project
```bash
# Install (macOS)
brew install pulumi

# Log in (Pulumi Cloud free tier, or `pulumi login --local` / `s3://bucket`)
pulumi login

# Scaffold a new AWS + TypeScript project
mkdir my-infra && cd my-infra
pulumi new aws-typescript
```

### Example — TypeScript (AWS S3 bucket)
```typescript
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const bucket = new aws.s3.Bucket("my-bucket", {
    versioning: { enabled: true },
    tags: { Environment: "dev" },
});

export const bucketName = bucket.id;
```

### Example — Python (equivalent)
```python
import pulumi
import pulumi_aws as aws

bucket = aws.s3.Bucket("my-bucket",
    versioning=aws.s3.BucketVersioningArgs(enabled=True),
    tags={"Environment": "dev"})

pulumi.export("bucket_name", bucket.id)
```

### Core Workflow (CLI)
```bash
pulumi new <template>       # scaffold a project (language + cloud template)
pulumi preview               # diff desired vs actual state (like `terraform plan`)
pulumi up                    # apply changes (like `terraform apply`)
pulumi stack output          # print exported values
pulumi destroy                # tear down all resources in the current stack
pulumi stack rm               # remove the stack itself (after destroy)
```

---

## 2. Intermediate — Stacks, Config & State

### Stacks in Depth
A stack is a named, isolated deployment of a project — same code, different config/state.
```bash
pulumi stack init dev
pulumi stack init prod
pulumi stack select dev
pulumi stack ls
```
Each stack gets its own state file and config (`Pulumi.dev.yaml`, `Pulumi.prod.yaml`). This is the direct analogue of Terraform **workspaces**, but config is first-class and per-stack from the start (not bolted on).

### Configuration & Secrets
```bash
pulumi config set aws:region us-east-1
pulumi config set instanceType t3.micro
pulumi config set --secret dbPassword "S3cr3t!"   # encrypted at rest
```
```typescript
const config = new pulumi.Config();
const instanceType = config.require("instanceType");
const dbPassword = config.requireSecret("dbPassword"); // returns Output<string>, stays encrypted in state
```
- Secrets are encrypted **per-stack** using a provider: the Pulumi Cloud default, a **passphrase**, or a cloud KMS (AWS KMS, Azure Key Vault, GCP KMS, HashiCorp Vault) — set via `pulumi stack init --secrets-provider`.
- Unlike vanilla Terraform state (plaintext unless the backend encrypts it), Pulumi encrypts secret *values* inline in the state file regardless of backend, so a leaked state file doesn't leak secrets in the clear.

### State & Backends
```bash
pulumi login s3://my-pulumi-state-bucket      # self-managed backend
pulumi login --local                           # local filesystem, ~/.pulumi
pulumi login                                    # Pulumi Cloud (default, free tier available)
```
- State = a **checkpoint file** per stack, serialized as JSON, containing the resource graph + outputs.
- Pulumi Cloud adds free hosted state, a web UI for history/diffs, RBAC, and policy enforcement on top of the same open-source engine — comparable to Terraform Cloud but with a permissive free tier for individuals/small teams.
- **State locking** is automatic on Pulumi Cloud; self-managed backends (S3 etc.) rely on the same lease/locking mechanisms Terraform uses.

### Inputs, Outputs & the `apply` Pattern
Values from cloud resources (ARNs, generated IDs, IPs) aren't known until the resource is created. Pulumi models this as `Output<T>` — a container you transform functionally instead of accessing directly:
```typescript
const vpc = new aws.ec2.Vpc("main", { cidrBlock: "10.0.0.0/16" });

// WRONG: vpc.id is an Output<string>, not a string — can't use directly
// const sg = new aws.ec2.SecurityGroup("sg", { vpcId: vpc.id }); // actually fine, Output flows through

// Deriving a *new* plain value from an Output requires .apply()
const vpcIdUpper = vpc.id.apply(id => id.toUpperCase());

// Combining multiple Outputs
const summary = pulumi.interpolate`VPC ${vpc.id} created with CIDR ${vpc.cidrBlock}`;
```
This is the trickiest concept for newcomers — Outputs are like `Promise<T>` but tracked by the engine for dependency ordering and secret propagation (an `Output` derived from a secret stays secret).

### Resource Dependencies
- **Implicit**: passing one resource's property (an `Output`) into another resource's args automatically creates a dependency edge — Pulumi provisions in the correct order.
- **Explicit**: `{ dependsOn: [otherResource] }` when there's no data dependency but an ordering requirement still exists.

### Multi-Language Support & Component Resources
Reusable infrastructure is expressed as a **Component Resource** — a class wrapping child resources, published like any library package:
```typescript
class StaticWebsite extends pulumi.ComponentResource {
    constructor(name: string, args: { indexDocument: string }, opts?: pulumi.ComponentResourceOptions) {
        super("custom:StaticWebsite", name, {}, opts);
        const bucket = new aws.s3.Bucket(`${name}-bucket`, {
            website: { indexDocument: args.indexDocument },
        }, { parent: this });
        this.registerOutputs({ bucketEndpoint: bucket.websiteEndpoint });
    }
}
```
Compare to Terraform **modules** — the difference is components are ordinary classes: you get constructors, inheritance, generics, and can `npm publish` / `pip install` them.

### Providers & Provider Configuration
```typescript
const euProvider = new aws.Provider("eu", { region: "eu-west-1" });
const bucket = new aws.s3.Bucket("eu-bucket", {}, { provider: euProvider });
```
Multiple provider instances (multi-region, multi-account) work the same way as Terraform's aliased providers.

---

## 3. Advanced — Testing, Policy, CI/CD & Production Patterns

### Unit Testing (Mocking the Engine)
Because programs are real code, you can unit test infrastructure logic without touching the cloud, using Pulumi's mocking API:
```typescript
import * as pulumi from "@pulumi/pulumi";

pulumi.runtime.setMocks({
    newResource: (args) => ({ id: `${args.name}-id`, state: args.inputs }),
    call: (args) => args.inputs,
});

import("./index").then(infra => {
    infra.bucket.tags.apply(tags => {
        if (tags?.Environment !== "dev") throw new Error("missing Environment tag");
    });
});
```
This runs in your normal test runner (Jest, pytest, `go test`) — far closer to standard software unit testing than Terraform's `terraform plan`-diffing or Terratest's spin-up-real-infra approach.

### Integration Testing
- **Terratest-style**: deploy to a real (ephemeral) stack, assert on outputs, then destroy — Pulumi's Go/`@pulumi/pulumi/testing` helpers support this pattern too.
- **Property testing**: assert invariants on the resource graph itself (e.g., "no S3 bucket is public") before/without a real deploy — this overlaps with Policy as Code below.

### Policy as Code — CrossGuard
Pulumi's built-in policy engine, analogous to Sentinel (Terraform Cloud) or OPA/Conftest:
```typescript
import { PolicyPack, validateResourceOfType } from "@pulumi/policy";
import * as aws from "@pulumi/aws";

new PolicyPack("aws-security", {
    policies: [{
        name: "s3-no-public-read",
        description: "S3 buckets must not be publicly readable",
        enforcementLevel: "mandatory",
        validateResource: validateResourceOfType(aws.s3.Bucket, (bucket, args, reportViolation) => {
            if (bucket.acl === "public-read") {
                reportViolation("S3 buckets cannot have public-read ACL");
            }
        }),
    }],
});
```
```bash
pulumi preview --policy-pack ./aws-security   # enforced locally
```
Policies run **at preview/update time**, blocking non-compliant changes before they ever reach the cloud — same guardrail role as [OPA/Conftest](../IaC%20Testing%20and%20Policy%20as%20Code/policy-as-code-with-opa-and-conftest.md) plays for Terraform in this repo's IaC testing notes.

### CI/CD Integration
```yaml
# GitHub Actions example
- uses: pulumi/actions@v5
  with:
    command: up
    stack-name: myorg/myproject/prod
  env:
    PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
```
- **Pulumi Deployments** (Pulumi Cloud feature): runs `preview`/`up` in Pulumi-managed runners triggered by git push/PR, posting plan diffs as PR comments — the Pulumi-native equivalent of Atlantis/HCP Terraform Run Tasks.
- **Review Stacks**: ephemeral per-PR stacks that spin up, test, and tear down automatically — useful for full-environment preview-per-PR workflows.
- Drift detection: `pulumi refresh` (or scheduled Pulumi Cloud drift detection) reconciles state with real cloud resources, same role as Terraform's `terraform plan -refresh-only`.

### Secrets Providers in Production
- Prefer a cloud KMS-backed secrets provider over the default service-managed one for compliance-sensitive workloads:
```bash
pulumi stack init prod --secrets-provider="awskms://alias/pulumi-prod?region=us-east-1"
```
- Rotate by re-encrypting: `pulumi stack change-secrets-provider <new-provider>`.

### Managing Multiple Environments/Accounts
- **Stack references**: read another stack's outputs (e.g., a shared VPC stack) without duplicating state:
```typescript
const network = new pulumi.StackReference("myorg/network/prod");
const vpcId = network.getOutput("vpcId");
```
- **Automation API**: embed Pulumi itself as a library inside a Node/Python/Go program — build custom self-service platforms, SaaS provisioning APIs, or CLIs that programmatically drive `up`/`destroy` without shelling out to the `pulumi` CLI. This has no direct Terraform equivalent (closest analogue: wrapping the CDKTF or `terraform-exec` Go library).

### Import Existing Infrastructure
```bash
pulumi import aws:s3/bucket:Bucket my-bucket existing-bucket-name
```
Generates both the resource declaration and adopts it into state in one step — comparable to `terraform import` but Pulumi can also **generate the source code** for the imported resource automatically.

### Common Pitfalls
- Treating `Output<T>` like a plain value outside `.apply()`/`pulumi.all()`/`pulumi.interpolate` — causes `[object Object]`-style bugs or type errors.
- Not pinning provider versions in `Pulumi.yaml` — provider upgrades can change resource shapes just like Terraform provider upgrades.
- Storing state locally (`--local`) for team projects — no locking, no collaboration, easy to lose; always use a shared backend (Pulumi Cloud or S3/Blob/GCS) once more than one person touches a stack.
- Forgetting `pulumi refresh` before `pulumi up` when infrastructure may have drifted (manual console changes) — stale state produces incorrect plans.

---

## Related Notes
- [Terraform](terraform.md) — the other major general-purpose IaC tool in this repo, direct point of comparison throughout.
- [CloudFormation](cloud-formation.md) — AWS-native alternative; Pulumi/Terraform are both cloud-agnostic by contrast.
- [Policy as Code with OPA & Conftest](../IaC%20Testing%20and%20Policy%20as%20Code/policy-as-code-with-opa-and-conftest.md) — same guardrail role as CrossGuard, different engine.
- [Terraform Testing Frameworks](../IaC%20Testing%20and%20Policy%20as%20Code/terraform-testing-frameworks.md) — compare against Pulumi's native unit-test model above.
- [IaC Testing Overview](../IaC%20Testing%20and%20Policy%20as%20Code/iac-testing-overview.md) — testing pyramid applied to infrastructure generally.
