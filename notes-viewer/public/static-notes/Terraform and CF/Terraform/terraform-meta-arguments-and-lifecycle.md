# Terraform Meta-Arguments, Lifecycle, Data Sources & Conditions

> Part of the [Terraform notes](./terraform.md). Previous: [HCL Language](./terraform-hcl-language.md). Next: [State Deep Dive](./terraform-state-deep-dive.md).

**Meta-arguments** work on *every* resource type, whatever the provider: `count`, `for_each`, `depends_on`, `provider` and `lifecycle`. Modules support the first four.

---

## 1. `count`

```hcl
resource "aws_instance" "web" {
  count         = var.web_count          # must be known at plan time
  ami           = var.ami
  instance_type = "t3.micro"
  tags          = { Name = "web-${count.index}" }
}

# references
aws_instance.web[0].id
aws_instance.web[*].id               # list of all ids
length(aws_instance.web)
```

The good use of `count` is an **on/off switch**: `count = var.enabled ? 1 : 0`.

### The `count` index-shift trap (real plan output)

```hcl
variable "names" { default = ["alice", "bob", "carol"] }

resource "random_pet" "c" {            # count version
  count  = length(var.names)
  prefix = var.names[count.index]
}
resource "random_pet" "f" {            # for_each version
  for_each = toset(var.names)
  prefix   = each.key
}
```

Apply this, then remove `"alice"` from the list:

```text
  # random_pet.c[0] must be replaced
      ~ prefix    = "alice" -> "bob" # forces replacement
  # random_pet.c[1] must be replaced
      ~ prefix    = "bob" -> "carol" # forces replacement
  # random_pet.c[2] will be destroyed
  # (because index [2] is out of range for count)
  # random_pet.f["alice"] will be destroyed
  # (because key ["alice"] is not in for_each map)
Plan: 2 to add, 0 to change, 4 to destroy.
```

With `count`, the identities are **positions**. Removing the first element shifts every later element down one place, so Terraform sees "c[0] changed from alice to bob" and so on. With **EC2 instances or databases, that means destroying and recreating production machines.** With `for_each`, the identity is the **key**, so only `alice` goes away.

**Rule: use `count` only for 0/1 toggles or for genuinely identical, interchangeable copies. Use `for_each` for everything else.**

---

## 2. `for_each`

```hcl
# set of strings
resource "aws_iam_user" "this" {
  for_each = toset(["alice", "bob"])
  name     = each.key                   # each.value == each.key for sets
}

# map of objects — the normal pattern
variable "buckets" {
  type = map(object({
    versioning = optional(bool, true)
    lifecycle_days = optional(number)
  }))
  default = {
    logs    = { lifecycle_days = 30 }
    backups = { versioning = true }
  }
}

resource "aws_s3_bucket" "this" {
  for_each = var.buckets
  bucket   = "acme-${each.key}"
}

resource "aws_s3_bucket_versioning" "this" {
  for_each = { for k, v in var.buckets : k => v if v.versioning }
  bucket   = aws_s3_bucket.this[each.key].id     # chaining: same keys, cross-reference
  versioning_configuration { status = "Enabled" }
}

# for_each over ANOTHER for_each resource (keys carry over)
resource "aws_s3_bucket_public_access_block" "this" {
  for_each                = aws_s3_bucket.this
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

Instance addresses look like `aws_s3_bucket.this["logs"]`. In a shell you have to quote them: `terraform state show 'aws_s3_bucket.this["logs"]'`.

### `for_each` rules
- The value must be a **map** or a **set of strings**. A list isn't allowed, so use `toset()` or build a map.
- **Keys must be known at plan time.** Values can be unknown.
- Keys should be **stable, human-meaningful names**. Never use a list index or a generated ID.
- You can't use `count` and `for_each` on the same block.
- Moving from `count` to `for_each` without `moved` blocks destroys everything (see [Production → Refactoring](./terraform-production-and-troubleshooting.md#1-refactoring-without-destroying-anything)).

### Output shapes

```hcl
output "bucket_arns" {
  value = { for k, b in aws_s3_bucket.this : k => b.arn }   # map — most useful
}
output "bucket_arn_list" {
  value = values(aws_s3_bucket.this)[*].arn                 # list, ordered by key
}
```

---

## 3. `depends_on`

Terraform works out dependencies from **references**. Use `depends_on` only when there's a real dependency that **no attribute reference expresses**:

```hcl
resource "aws_iam_role_policy" "lambda_logs" {
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.logs.json
}

resource "aws_lambda_function" "fn" {
  function_name = "fn"
  role          = aws_iam_role.lambda.arn         # implicit dep on the ROLE...
  # ...but not on the POLICY. Lambda may start and fail to write logs before the policy attaches.
  depends_on    = [aws_iam_role_policy.lambda_logs]
  # ...
}
```

Typical genuine cases: IAM policy propagation, or "the NAT gateway must exist before these instances boot and run `yum install`".

Costs of `depends_on`:
- It's **coarse**. A `depends_on` pointing at a whole module makes everything in that module a dependency.
- When used on **data sources** or modules, it can defer reads to apply time, so values become "known after apply" and replacements can cascade. Avoid `depends_on` on data sources unless you really need it.

---

## 4. `provider`

This chooses a non-default (aliased) provider configuration:

```hcl
provider "aws" { region = "us-east-1" }
provider "aws" {
  alias  = "eu"
  region = "eu-west-1"
}

resource "aws_s3_bucket" "replica" {
  provider = aws.eu
  bucket   = "acme-replica-eu"
}
```

Modules use `providers = { aws = aws.eu }` instead. See [Providers](./terraform-providers-and-internals.md#4-multiple-provider-configurations-aliases).

---

## 5. `lifecycle`: every option

```hcl
resource "aws_instance" "web" {
  # ...
  lifecycle {
    create_before_destroy = true
    prevent_destroy       = true
    ignore_changes        = [tags["LastPatched"], user_data]
    replace_triggered_by  = [terraform_data.ami_version]

    precondition {
      condition     = data.aws_ami.app.architecture == "x86_64"
      error_message = "AMI must be x86_64."
    }
    postcondition {
      condition     = self.public_ip == ""
      error_message = "Instance must not get a public IP."
    }
  }
}
```

### `create_before_destroy`
By default, a replacement is **destroy, then create** (`-/+`), which means downtime and possibly a name collision. With `create_before_destroy = true` it becomes `+/-`: the new object is built first, dependencies are switched over to it, and then the old one is destroyed.

```text
+/- create replacement and then destroy
  # random_id.x will be replaced due to changes in replace_triggered_by
```

Things to know:
- **Unique names collide.** If a resource has a fixed `name`, the new one can't be created while the old one exists. Use `name_prefix` (ASGs, launch templates, security groups) or a random suffix.
- It **spreads**: if A has CBD and depends on B, Terraform forces CBD-style ordering onto B's replacement too, and it can't be turned off there.
- It's essential for: launch templates and ASGs, TLS certificates attached to load balancers (`aws_acm_certificate`), and security groups attached to ENIs.

### `prevent_destroy`
Any plan that would destroy this resource **errors**. That includes `terraform destroy` and replacements:
```text
Error: Instance cannot be destroyed
  Resource aws_db_instance.main has lifecycle.prevent_destroy set...
```
It's a guard rail for databases, state buckets and KMS keys. **It doesn't protect against removing the whole block from code.** If the block is deleted, the lifecycle setting is gone with it. For real protection, add provider-level `deletion_protection = true` (RDS), S3 Object Lock, or IAM deny policies.

### `ignore_changes`
This tells Terraform not to diff the listed attributes after creation. Use it when something else legitimately manages those attributes:
```hcl
lifecycle {
  ignore_changes = [
    desired_count,        # ECS service scaled by autoscaling
    tags["kubernetes.io/cluster/x"],   # added by EKS
  ]
}
# ignore_changes = all  → only create; never update (rarely right)
```
Don't use `ignore_changes` to hide a diff you don't understand. That's how drift builds up until something breaks.

### `replace_triggered_by` (1.2+)
Forces replacement when **another** resource or attribute changes:
```hcl
resource "terraform_data" "app_version" {
  input = var.app_version
}
resource "aws_instance" "app" {
  # ...
  lifecycle { replace_triggered_by = [terraform_data.app_version] }
}
```
It only accepts references to managed resources (or their attributes), not variables. That's why you wrap the variable in `terraform_data`.

### Preconditions and postconditions (1.2+)
- `precondition` runs **before** the resource is planned or applied. It checks your **assumptions about inputs**.
- `postcondition` runs **after**, and can refer to `self`. It checks **guarantees about the result**.
- Both are allowed on `resource`, `data` and `output` blocks.
- A failure stops the run (unlike `check` blocks, see below).

```hcl
data "aws_ami" "app" {
  most_recent = true
  owners      = ["self"]
  filter {
    name   = "name"
    values = ["app-*"]
  }
  lifecycle {
    postcondition {
      condition     = self.tags["Approved"] == "true"
      error_message = "Latest AMI ${self.id} is not approved."
    }
  }
}
```

### Validation vs precondition vs postcondition vs check

| | Where | Can reference | On failure | Use for |
|---|---|---|---|---|
| `variable.validation` | Variable | That var (and since 1.9 other vars, locals, data) | Error | Input format |
| `precondition` | resource/data/output | Anything | Error, stops run | Assumptions across objects |
| `postcondition` | resource/data/output | `self` + anything | Error (resource already changed) | Guarantees about the result |
| `check` block | Top level | Anything, plus a scoped data source | **Warning only** | Ongoing health checks (endpoint returns 200, cert not expiring) |

```hcl
check "api_health" {
  data "http" "api" {
    url = "https://${aws_lb.web.dns_name}/healthz"
  }
  assert {
    condition     = data.http.api.status_code == 200
    error_message = "API returned ${data.http.api.status_code}"
  }
}
```

HCP Terraform runs `check` blocks continuously as health assessments.

> **Gotcha (seen in the lab):** under `terraform test`, a `check` whose values are unknown at plan time (`command = plan`) **fails** that run with "Check block assertion known after apply". Use `command = apply` with mocks, or make the check independent of computed values.

---

## 6. Data sources

```hcl
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_vpc" "shared" {
  tags = { Name = "shared-vpc" }        # look up something another team manages
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.shared.id]
  }
  tags = { Tier = "private" }
}

locals {
  account_id = data.aws_caller_identity.current.account_id
}
```

**When does a data source get read?**
- **During plan**, if all of its arguments are known.
- **During apply** (shown as `<= read (data resources)` in the plan), if any argument depends on a resource that's changing or unknown, or if it has `depends_on` pointing at something with pending changes.

Reading at apply time makes the data source's outputs unknown during plan, and that can turn into "forces replacement" on everything that uses them. This is the most common cause of mysterious plans like "why does it want to replace my instance?" Keep data source inputs static.

If a data source finds **zero or more than one** match, most of them **error** (`no matching VPC found`). Plural data sources (`aws_subnets`) return lists and are happy with empty results.

---

## 7. `terraform_data` (1.4+) and `null_resource`

`terraform_data` is built in, so there's no provider to install. It stores a value, and its replacement can trigger other things:

```hcl
resource "terraform_data" "bootstrap" {
  triggers_replace = [aws_instance.db.id, var.schema_version]   # replace when these change
  input            = var.schema_version                          # stored; readable as .output

  provisioner "local-exec" {
    command = "./scripts/migrate.sh ${self.input}"
  }
}
```

It replaces `null_resource` (from the `hashicorp/null` provider). You can migrate with `moved { from = null_resource.x  to = terraform_data.x }` (1.9+).

---

## 8. Provisioners (last resort)

```hcl
resource "aws_instance" "web" {
  # ...
  connection {
    type        = "ssh"
    user        = "ec2-user"
    private_key = file("~/.ssh/id_ed25519")
    host        = self.public_ip
  }

  provisioner "file" {
    source      = "app.conf"
    destination = "/tmp/app.conf"
  }
  provisioner "remote-exec" {
    inline = ["sudo mv /tmp/app.conf /etc/app.conf", "sudo systemctl restart app"]
  }
  provisioner "local-exec" {
    command     = "echo ${self.private_ip} >> inventory"
    when        = create            # or destroy
    on_failure  = continue          # default: fail (and TAINT the resource)
    environment = { FOO = "bar" }
  }
}
```

HashiCorp's own docs call provisioners a **last resort**, because:
- They only run on **create** (or destroy). Change the script and nothing happens.
- Terraform can't plan them or show a diff for them. They're invisible imperative steps.
- A failure **taints** the resource, so the next apply replaces it.
- They need network access (SSH from wherever CI runs) and credentials.
- Destroy-time provisioners can only use `self`, and they don't run if the resource is removed from code.

What to use instead:

| Need | Use |
|---|---|
| Configure a VM at boot | `user_data` / cloud-init |
| Software baked into an image | Packer AMI |
| Configure software after boot | Ansible (triggered by CI after apply) |
| Kubernetes resources | Helm/Argo CD, or the `kubernetes`/`helm` provider |
| Run a script when X changes | `terraform_data` + `local-exec` (accept the trade-offs), or a CI step |
| Call an API without a resource | Provider-defined `action` blocks (1.14+) where the provider supports them |

Next: [State Deep Dive →](./terraform-state-deep-dive.md)
