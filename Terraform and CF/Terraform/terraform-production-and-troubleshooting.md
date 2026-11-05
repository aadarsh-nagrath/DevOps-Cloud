# Terraform in Production: Refactoring, Safe Changes, Troubleshooting & Gotchas

> Part of the [Terraform notes](./terraform.md). Previous: [Environments & CI/CD](./terraform-environments-and-cicd.md). Next: [Hands-on Labs](./terraform-hands-on-labs.md).

---

## 1. Refactoring without destroying anything

**The core rule:** Terraform identifies objects by **address**. Change an address without telling Terraform, and it plans **destroy old + create new**. `moved` blocks tell it "same object, new address".

### Rename a resource
```hcl
resource "aws_s3_bucket" "logs" { bucket = "acme-logs" }   # was aws_s3_bucket.log_bucket

moved {
  from = aws_s3_bucket.log_bucket
  to   = aws_s3_bucket.logs
}
```

### `count` → `for_each` (verified: `0 to add, 0 to change, 0 to destroy`)
```hcl
resource "random_pet" "u" {
  for_each = toset(var.names)      # was: count = length(var.names)
  prefix   = each.key
}
moved {
  from = random_pet.u[0]
  to   = random_pet.u["alice"]
}
moved {
  from = random_pet.u[1]
  to   = random_pet.u["bob"]
}
moved {
  from = random_pet.u[2]
  to   = random_pet.u["carol"]
}
```
```text
  # random_pet.u[0] has moved to random_pet.u["alice"]
  # random_pet.u[1] has moved to random_pet.u["bob"]
  # random_pet.u[2] has moved to random_pet.u["carol"]
Plan: 0 to add, 0 to change, 0 to destroy.
```
Generate the moved blocks from state so you don't have to hand-write 40 of them:
```bash
terraform state list | grep '^aws_instance.web\[' | while read a; do
  i=$(echo "$a" | sed -E 's/.*\[([0-9]+)\]/\1/')
  name=$(terraform state show -no-color "$a" | awk -F'"' '/Name/ {print $4; exit}')
  printf 'moved {\n  from = %s\n  to   = aws_instance.web["%s"]\n}\n' "$a" "$name"
done > moves.tf
```

### Extract resources into a module
```hcl
module "users" {
  source = "./modules/users"
  names  = toset(var.names)
}

# Whole resource (no count/for_each change):
moved {
  from = aws_iam_role.app
  to   = module.users.aws_iam_role.app
}
```

Two lessons from the lab:

1. **`moved` describes the addresses that are in state *now*.** In the lab, the `count` → `for_each` moves were planned but never applied, and then the code was refactored again into a module. The plan that came out was `3 to add, 3 to destroy`, because state still held `random_pet.u[0]`, not `["alice"]`. Either apply each refactor before starting the next, or map **old state addresses → final addresses** directly:
   ```hcl
   moved {
     from = random_pet.u[0]
     to   = module.users.random_pet.u["alice"]
   }
   ```
2. **You can't mix a whole-resource move and instance moves for the same resource.** Combining `from = random_pet.u` with `from = random_pet.u[0]` gives `Error: Cyclic dependency in move statements`. Use one granularity.

### Other `moved` facts
- It works across module boundaries, for whole module calls (`from = module.a`, `to = module.b`), and from `null_resource` to `terraform_data` (1.9+).
- It **can't** move between resource *types* (`aws_instance` → `aws_spot_instance_request`) unless the provider implements cross-type state moves (Terraform 1.8+, `MoveResourceState`) for that specific pair. Check the provider docs. Otherwise use `removed` + `import`.
- It **can't** move between states. For that, use `removed` in the old state and `import` in the new one (see [State §9](./terraform-state-deep-dive.md#moving-resources-between-states)).
- **Keep moved blocks** in reusable modules for at least one major version, so every caller passes through them. In root modules you can delete them once every environment has applied.

### Stop managing something without deleting it
```hcl
removed {
  from = aws_s3_bucket.legacy
  lifecycle { destroy = false }        # forget it; bucket stays
}
# with destroy = true (or no lifecycle block) it's a deliberate, reviewable destroy
```
`from` must be a **whole resource or module**. `random_pet.u["a"]` is rejected with `Resource instance keys not allowed`, so for a single instance use `terraform state rm`.

### Adopt something that exists
```hcl
import {
  to = aws_s3_bucket.legacy
  id = "acme-legacy-bucket"
}
```
`terraform plan -generate-config-out=gen.tf`, clean it up, plan until it shows **0 to change**, then apply.

---

## 2. Changing live infrastructure safely

### Before approving any plan, check
1. **The summary line.** `X to destroy` should be the number you expected. Any surprise destroy is a stop.
2. **`forces replacement`.** Search for it. A replaced database, a replaced EKS cluster or a replaced NAT gateway (new IP) is an outage.
3. **`(known after apply)` on identifying fields** of resources you didn't touch. That means a data source or upstream value became unknown and things may cascade.
4. **IAM and security group changes.** `-` lines on policies can lock out a service.
5. **The resource count against the PR description.** Does a one-line change really touch 40 resources?

### Zero-downtime replacement patterns

| Resource | Problem | Pattern |
|---|---|---|
| Launch template / ASG | Replacement kills instances | `create_before_destroy`, `name_prefix`, ASG `instance_refresh`, or a new ASG per AMI (blue/green) |
| ACM certificate on an ALB listener | Can't delete a cert that's in use | `create_before_destroy = true` on the cert |
| Security group attached to ENIs | Can't delete an SG in use, and a fixed `name` collides | `name_prefix` + `create_before_destroy` |
| RDS instance class/storage | In-place (with brief failover on Multi-AZ). `apply_immediately` decides now vs maintenance window | Plan it, schedule it |
| RDS engine major version, or anything that forces new | Replacement = **new empty DB** | Never via a straight apply: snapshot, blue/green deployment, `deletion_protection = true`, `prevent_destroy` |
| EKS cluster version | In-place upgrade, one minor at a time | Bump one minor per apply, then node groups |
| Node groups | Replacing means draining | New node group, migrate, delete the old one |
| Lambda | Fine (in place) | `publish = true` + alias for traffic shifting |

### Reduce blast radius
- Small states (one per layer per environment).
- `prevent_destroy` on stateful resources, **plus** provider-level protection: `deletion_protection` (RDS, ELB, DynamoDB), `force_destroy = false` on S3, KMS `deletion_window_in_days = 30`.
- **Policy gates** that refuse plans which delete stateful resources (see the Rego example in [CI/CD](./terraform-environments-and-cicd.md#9-quality-gates-in-ci)).
- Separate apply roles per layer. The app pipeline physically *can't* delete the VPC.
- `-target` and `-replace` only through a break-glass procedure.

---

## 3. Troubleshooting: real errors and fixes

| Error (abridged) | Cause | Fix |
|---|---|---|
| `Error acquiring the state lock` | Another run holds it, or a dead run left it | Wait or `-lock-timeout`. If the holder is dead: `terraform force-unlock ID` |
| `Backend configuration changed` / `Backend initialization required` | Backend block or `-backend-config` changed | `terraform init -reconfigure` (no copy) or `-migrate-state` |
| `Inconsistent dependency lock file` | Provider added or changed without updating the lock | `terraform init -upgrade` (or plain `init`), then commit the lock |
| `doesn't match any of the checksums previously recorded` | Lock file only has hashes for another OS | `terraform providers lock -platform=linux_amd64 -platform=darwin_arm64` |
| `Unsupported Terraform Core version` | `required_version` excludes your binary | Install the matching version (tfenv) |
| `state snapshot was created by Terraform vX, which is newer` | Someone used a newer binary | Upgrade. Pin versions in CI |
| `Provider configuration not present` | Resource in state, but its provider block (often inside a removed module) is gone | Re-add the provider/module temporarily and plan the destroy, or `state rm` |
| `The "for_each" ... cannot be determined until apply` | Keys depend on unknown attributes | Key on static values. Sometimes a `-target` bootstrap |
| `The "count" value depends on resource attributes...` | Same, for count | Derive from variables |
| `Cycle: a, b` | Mutual references (often SGs referencing each other inline) | Separate rule resources. Break the loop |
| `Cyclic dependency in move statements` | Overlapping `moved` (whole resource + instances) | Use one granularity |
| `Reference to undeclared resource` | Typo, or a resource in another module | Use `module.x.output` |
| `Unsupported argument` / `An argument named "x" is not expected here` | Provider version mismatch (arg removed or renamed) or block-vs-argument confusion | Check the docs **for your provider version** |
| `Error: Output refers to sensitive values` | Output derived from a sensitive value | `sensitive = true` |
| `Saved plan is stale` | State changed after plan | Plan again |
| `Instance cannot be destroyed` (`prevent_destroy`) | Plan wants to destroy a protected resource | Find out *why* it's replacing it (usually a ForceNew attribute) and fix the code |
| `Provider produced inconsistent final plan` / `...result after apply` | Provider bug | Upgrade the provider, apply again, report upstream |
| `Error: creating X: ... already exists` | The object exists outside state (a previous failed run, or created by hand) | `import` it, or delete the stray |
| `InvalidClientTokenId` / `ExpiredToken` / `no valid credential sources` | Credentials | `aws sts get-caller-identity`, refresh SSO, check OIDC trust `sub` |
| `AccessDenied` on `*.tflock` | Plan role can't write the S3 lock | Grant Put/Delete on `<key>.tflock`, or `-lock=false` for read-only plans |
| `timeout while waiting for state to become 'available'` | Slow resource (RDS, CloudFront, EKS) | Resource `timeouts { create = "60m" }`. Check the console for the real failure |
| `DependencyViolation` on destroy | AWS objects Terraform doesn't know about (ENIs from Lambda/EKS, LB-created SGs) still use the resource | Find and remove the stray dependents (`aws ec2 describe-network-interfaces --filters Name=group-id,Values=sg-...`) |
| Perpetual diff on every plan | API normalisation, `timestamp()`, inline vs separate rules, JSON key order | Normalise in code, `jsonencode`, one rule style, `ignore_changes` for externally owned fields |
| Plan takes 20 minutes | Huge state, every resource refreshed | Split state. `-parallelism`. Don't `-refresh=false` the real plan |

### Debugging method
1. Read the **whole** error. Terraform errors show the file and line, and the expression with its values (`│ var.x is "foo"`).
2. Reproduce the expression in **`terraform console`** with the same `-var-file`.
3. `terraform state show ADDR` shows what Terraform believes, and the cloud CLI shows what's really there.
4. `TF_LOG_PROVIDER=DEBUG` shows the exact API call and response.
5. Shrink the problem: copy the failing resource into a scratch directory with the same provider version.

---

## 4. Upgrades

### Terraform core
- Read the CHANGELOG / upgrade guide for each minor version you're skipping.
- Upgrade in dev first. Use `terraform plan` with the new binary and look for diffs caused by the upgrade itself.
- After the first apply with the new version, **older binaries can't read that state**. Bump the CI pin and `required_version` together.
- From 1.0 on there's a compatibility promise for the language within 1.x.

### Provider major versions (e.g. AWS 5 → 6)
1. Read the provider's **upgrade guide** (renamed and removed arguments, changed defaults, resources split apart).
2. Fix deprecation warnings on the *current* major version first. Today's warnings are tomorrow's errors.
3. Bump the constraint (`~> 6.0`), `terraform init -upgrade`, plan. **Expect a few changes**, and understand every one before applying.
4. Roll through environments dev → staging → prod.

### Terraform ↔ OpenTofu

| | Terraform | OpenTofu |
|---|---|---|
| Licence | BSL 1.1 (since 1.6) | MPL 2.0, Linux Foundation |
| Binary / registry | `terraform`, registry.terraform.io | `tofu`, registry.opentofu.org (mirrors most providers) |
| State encryption | No (backend-side only) | **Yes**, client-side (1.7+) |
| Variables in backend / module source | No | **Yes**, if known early (1.8+) |
| `for_each` on provider blocks | No | **Yes** (1.9+) |
| Ephemeral resources, write-only args | 1.10 / 1.11 | Added later (1.11+). Check the release notes for parity |
| HCP features (Stacks, Sentinel) | Yes | No (use Spacelift/env0/etc.) |
| `-exclude` flag | No | **Yes** (1.9+, the opposite of `-target`) |

Migrating from TF ≤ 1.5.x to OpenTofu is close to drop-in: back up state, `tofu init`, `tofu plan` should show no changes. From newer Terraform versions, check feature parity first. Language features introduced after the fork may differ.

---

## 5. Gotchas that cause real outages

1. **Renaming a resource or module without `moved`** means destroy + create. Always check for `-` lines after a refactor.
2. **`count` over a list of named things**: removing one item replaces every item after it.
3. **Replacing a resource with a fixed name and no CBD** gives downtime (destroy first), or with CBD a "name already exists" error.
4. **Changing a ForceNew attribute on a database** (subnet group, engine, `identifier`, encryption) **replaces the database**, which means data loss if you have no snapshot.
5. **`terraform destroy` in the wrong directory or workspace.** Use `allowed_account_ids`, put the environment in the path, and don't use the default workspace for prod.
6. **Applying an unreviewed plan** (`apply -auto-approve` without `-out`). The world changed between your plan and your apply.
7. **Inline rules plus separate rule resources** on the same SG or route table cause endless add/remove flapping.
8. **`ignore_changes` used to silence a diff** you didn't investigate hides real drift.
9. **Secrets in tfvars, state or plan artifacts** that are readable by too many people.
10. **Two pipelines writing the same state** with `-lock=false` corrupts it.
11. **`depends_on` on a data source** pushes the read to apply time, makes values unknown, and replaces things that depend on them.
12. **Provider upgrade with no lock file**: CI silently takes a new major version on Monday morning.
13. **`-target` habit**: state slowly stops matching code. The next full plan is a surprise.
14. **S3 bucket `force_destroy = true`** on a data bucket. One bad plan empties it.
15. **Deleting a provider block before its resources** gives `Provider configuration not present`, and the objects are orphaned in state.

---

## 6. Performance at scale

| Lever | Effect |
|---|---|
| Split states | Biggest win. Plan time grows with resources × API latency |
| `-parallelism=20..50` | Faster walks, unless the API throttles |
| `TF_PLUGIN_CACHE_DIR` + CI cache | Skips provider downloads (AWS 6.x is ~770 MB unpacked) |
| `-refresh=false` | For a quick look at code changes only. **Never for the plan you apply** |
| Avoid huge `for_each` over data sources | Each instance is a separate API call |

---

## 7. Production readiness checklist

- [ ] Remote state: encrypted, versioned, locked, least privilege
- [ ] `required_version` and provider constraints, lock file committed with every platform
- [ ] Module versions pinned (tag or SHA)
- [ ] One state per layer per environment. Environment visible in the path
- [ ] `allowed_account_ids` on every AWS provider
- [ ] `default_tags` (owner, environment, cost centre, repo)
- [ ] CI: fmt, validate, tflint, checkov/trivy, `terraform test`, plan comment, policy gate, cost diff
- [ ] Apply only from CI, on the main branch, behind an environment approval, with OIDC roles
- [ ] Concurrency group per state, never cancel an in-progress apply
- [ ] `prevent_destroy` + provider deletion protection on stateful resources
- [ ] No secrets in code, tfvars or state where avoidable (managed passwords, ephemeral, write-only)
- [ ] `moved`/`removed`/`import` blocks for every refactor
- [ ] Scheduled drift detection with alerting
- [ ] Runbooks: stuck lock, state restore, failed apply, provider upgrade

Next: [Hands-on Labs →](./terraform-hands-on-labs.md)
