# Terraform Hands-on Labs

> Part of the [Terraform notes](./terraform.md). Previous: [Production & Troubleshooting](./terraform-production-and-troubleshooting.md).

Labs 1–11 need **no cloud account**. They use the `random`, `local` and built-in `terraform_data` providers, plus a mocked or fake-credential AWS provider. Lab 12 uses a real AWS account and costs a few cents if you destroy promptly. Every lab was run on Terraform 1.15.8, and the outputs shown are real.

Set up once:
```bash
mkdir -p ~/tf-labs && cd ~/tf-labs
export NO_COLOR=1            # cleaner output (optional)
```

Each lab: **Goal → Do → Expect → Break it → Explain it.** If you can do the "Explain it" part out loud, you understand it well enough for an interview.

---

## Lab 1: First apply, replacement, drift
**Goal:** see the init/plan/apply/destroy loop, implicit dependencies, ForceNew, and drift.

```bash
mkdir lab01 && cd lab01
cat > main.tf <<'EOF'
terraform {
  required_providers {
    random = { source = "hashicorp/random", version = "~> 3.6" }
    local  = { source = "hashicorp/local",  version = "~> 2.5" }
  }
}
variable "name" {
  type    = string
  default = "world"
}
resource "random_pet" "suffix" {}
resource "local_file" "hello" {
  filename = "${path.module}/hello.txt"
  content  = "Hello, ${var.name}! ${random_pet.suffix.id}\n"
}
EOF
terraform init && terraform apply -auto-approve
terraform apply -var name=alice          # Expect: local_file must be replaced (content forces replacement)
rm hello.txt && terraform plan           # Expect: 1 to add (drift detected via refresh)
terraform destroy -auto-approve
```
**Explain it:** why did `random_pet` stay the same when `name` changed? Why did the file get *replaced* and not *updated*? What does `.terraform.lock.hcl` hold?

---

## Lab 2: Variables, precedence, validation
```bash
mkdir ../lab02 && cd ../lab02
cat > main.tf <<'EOF'
variable "env" {
  type    = string
  default = "from-default"
  validation {
    condition     = can(regex("^[a-z-]+$", var.env))
    error_message = "lowercase and dashes only"
  }
}
output "env" { value = var.env }
EOF
terraform init >/dev/null
terraform apply -auto-approve | tail -1                         # from-default
TF_VAR_env=from-env terraform apply -auto-approve | tail -1      # from-env
echo 'env = "from-tfvars"' > terraform.tfvars
TF_VAR_env=from-env terraform apply -auto-approve | tail -1      # from-tfvars  (tfvars beats env var)
echo 'env = "from-auto"' > z.auto.tfvars
terraform apply -auto-approve | tail -1                          # from-auto
terraform apply -auto-approve -var env=from-cli | tail -1        # from-cli
terraform apply -auto-approve -var env=BAD                       # validation error
```
**Break it:** remove the default and run with `-input=false` and no value. What error do you get, and why does CI need `-input=false`?

---

## Lab 3: `for` expressions, flatten, `for_each`
```bash
mkdir ../lab03 && cd ../lab03
cat > main.tf <<'EOF'
variable "envs" {
  type = map(object({
    replicas = number
    tags     = optional(map(string), {})
  }))
  default = {
    dev  = { replicas = 1 }
    prod = { replicas = 3, tags = { tier = "critical" } }
  }
}
locals {
  flat   = flatten([for env, cfg in var.envs : [for i in range(cfg.replicas) : { key = "${env}-${i}", env = env }]])
  by_key = { for x in local.flat : x.key => x }
}
resource "random_pet" "node" {
  for_each = local.by_key
  prefix   = each.value.env
}
output "keys" { value = keys(random_pet.node) }
EOF
terraform init >/dev/null && terraform apply -auto-approve | tail -7
```
Expect:
```text
keys = ["dev-0", "prod-0", "prod-1", "prod-2"]
```
**Do:** `terraform console` and then evaluate `local.flat` and `local.by_key`. **Break it:** change `for_each = local.by_key` to `for_each = local.flat`. What's the error?

---

## Lab 4: The `count` index-shift trap
```bash
mkdir ../lab04 && cd ../lab04
cat > main.tf <<'EOF'
variable "names" { default = ["alice", "bob", "carol"] }
resource "random_pet" "c" {
  count  = length(var.names)
  prefix = var.names[count.index]
}
resource "random_pet" "f" {
  for_each = toset(var.names)
  prefix   = each.key
}
EOF
terraform init >/dev/null && terraform apply -auto-approve >/dev/null
sed -i.bak 's/"alice", //' main.tf && terraform plan | grep -E '^  #|Plan:'
```
Expect:
```text
  # random_pet.c[0] must be replaced
  # random_pet.c[1] must be replaced
  # random_pet.c[2] will be destroyed
  # random_pet.f["alice"] will be destroyed
Plan: 2 to add, 0 to change, 4 to destroy.
```
**Explain it:** imagine these were RDS instances. Which version would you want in production, and why?

---

## Lab 5: Lifecycle rules
```bash
mkdir ../lab05 && cd ../lab05
cat > main.tf <<'EOF'
variable "app_version" { default = "v1" }
resource "terraform_data" "ver" { input = var.app_version }

resource "random_id" "server" {
  byte_length = 4
  lifecycle {
    create_before_destroy = true
    replace_triggered_by  = [terraform_data.ver]
  }
}
resource "random_id" "db" {
  byte_length = 4
  lifecycle { prevent_destroy = true }
}
EOF
terraform init >/dev/null && terraform apply -auto-approve >/dev/null
terraform plan -var app_version=v2 | grep -E 'replace|Plan:'
#  +/- create replacement and then destroy
#  # random_id.server will be replaced due to changes in replace_triggered_by
terraform destroy           # Expect: Error: Instance cannot be destroyed (random_id.db)
```
**Do:** remove `prevent_destroy`, then destroy. **Explain it:** why doesn't `prevent_destroy` protect you if someone deletes the whole resource block?

---

## Lab 6: State surgery
```bash
cd ../lab03                  # reuse lab 3's state
terraform state list
terraform state show 'random_pet.node["prod-0"]'
terraform state pull > backup.tfstate
jq '{version, serial, lineage, n: (.resources|length)}' backup.tfstate
terraform state mv 'random_pet.node["prod-0"]' 'random_pet.node["prod-zero"]'
terraform plan | grep Plan:          # Expect: 1 to add, 1 to destroy (code still wants prod-0, state has prod-zero)
terraform state mv 'random_pet.node["prod-zero"]' 'random_pet.node["prod-0"]'
terraform plan | grep -E 'No changes|Plan:'      # back to No changes
terraform state rm 'random_pet.node["dev-0"]'
terraform plan | grep Plan:          # Expect: 1 to add — Terraform forgot it (a real resource would be orphaned!)
```
**Explain it:** what do `serial` and `lineage` protect against? What happens to a real cloud resource after `state rm`?

---

## Lab 7: Refactor with `moved` (count → for_each → module), zero destroys
```bash
mkdir ../lab07 && cd ../lab07
cat > main.tf <<'EOF'
variable "names" { default = ["alice", "bob", "carol"] }
resource "random_pet" "u" {
  count  = length(var.names)
  prefix = var.names[count.index]
}
EOF
terraform init >/dev/null && terraform apply -auto-approve >/dev/null

mkdir -p modules/users && cat > modules/users/main.tf <<'EOF'
variable "names" { type = set(string) }
resource "random_pet" "u" {
  for_each = var.names
  prefix   = each.key
}
EOF
cat > main.tf <<'EOF'
variable "names" { default = ["alice", "bob", "carol"] }
module "users" {
  source = "./modules/users"
  names  = toset(var.names)
}
moved {
  from = random_pet.u[0]
  to   = module.users.random_pet.u["alice"]
}
moved {
  from = random_pet.u[1]
  to   = module.users.random_pet.u["bob"]
}
moved {
  from = random_pet.u[2]
  to   = module.users.random_pet.u["carol"]
}
EOF
terraform init >/dev/null && terraform plan | grep -E 'moved|Plan:'
```
Expect:
```text
  # random_pet.u[0] has moved to module.users.random_pet.u["alice"]
  # random_pet.u[1] has moved to module.users.random_pet.u["bob"]
  # random_pet.u[2] has moved to module.users.random_pet.u["carol"]
Plan: 0 to add, 0 to change, 0 to destroy.
```
**Break it:** add a fourth block, `moved { from = random_pet.u  to = module.users.random_pet.u }`. You should get `Cyclic dependency in move statements`. Then remove all the moved blocks and plan again: `3 to add, 3 to destroy`.

**Then try `removed` on a single instance:** `removed { from = module.users.random_pet.u["carol"] ... }`. It fails with `Resource instance keys not allowed`, because `removed` only accepts whole resources or modules. To forget a single instance, use `terraform state rm 'module.users.random_pet.u["carol"]'` and drop `carol` from `names` in the same change.

---

## Lab 8: Import with generated config
```bash
mkdir ../lab08 && cd ../lab08
cat > main.tf <<'EOF'
terraform {
  required_providers {
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}
import {
  to = random_string.legacy
  id = "AbCdEf123"            # random_string supports import of an existing value
}
EOF
terraform init >/dev/null
terraform plan -generate-config-out=generated.tf
#  random_string.legacy: Preparing import... [id=AbCdEf123]
#  Plan: 1 to import, 0 to add, 0 to change, 0 to destroy.
#  Warning: Config generation is experimental
cat generated.tf             # every attribute, including noise like `keepers = null`, `min_lower = 0`
terraform apply -auto-approve   # Apply complete! Resources: 1 imported ...
```
**Do:** delete the `= null` and `= 0` noise lines from `generated.tf`, then plan. You want `No changes`. That's exactly the clean-up loop for real cloud imports.

---

## Lab 9: Lock conflict
```bash
mkdir ../lab09 && cd ../lab09
cat > main.tf <<'EOF'
resource "terraform_data" "slow" {
  provisioner "local-exec" { command = "sleep 15" }
}
EOF
terraform init >/dev/null
terraform apply -auto-approve > /dev/null &      # holder
sleep 4 && terraform plan                        # contender
```
Expect:
```text
Error: Error acquiring the state lock
Lock Info:
  ID:        dcf162e9-...
  Operation: OperationTypeApply
```
**Do:** run `terraform plan -lock-timeout=30s`. It now waits and succeeds. **Explain it:** when is `force-unlock` safe, and when does it corrupt state?

---

## Lab 10: Build and test a module (mocked AWS, no account)
Copy the VPC module from [Modules §2](./terraform-modules.md#worked-example-a-production-style-vpc-module) into `lab10/modules/vpc/` (`versions.tf`, `variables.tf`, `main.tf`, `outputs.tf`, `tests/vpc.tftest.hcl`).
```bash
cd lab10/modules/vpc
terraform init && terraform test
#  run "single_nat_by_default"... pass
#  run "per_az_nat"... pass
#  run "rejects_bad_cidr"... pass
#  run "rejects_one_az"... pass
#  Success! 4 passed, 0 failed.
```
**Extend it:** add a `run` that asserts the public subnets have `map_public_ip_on_launch = true`, and one that checks `nat_gateway_mode = "none"` creates no `aws_route.private_nat`.

**Gotcha to reproduce:** add a top-level `check` block that refers to a computed attribute (e.g. `aws_vpc.this.arn`) and run a `command = plan` test. It fails with "Check block assertion known after apply". Then switch that run to `command = apply` (mocks give it a value) and it passes.

---

## Lab 11: Plan real AWS resources offline + policy-check the plan JSON
Real AWS provider schema, no account, no API calls (there are no data sources and no existing state):
```bash
cd lab10
cat > main.tf <<'EOF'
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "fake"
  secret_key                  = "fake"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}
module "vpc" {
  source           = "./modules/vpc"
  name             = "prod"
  cidr_block       = "10.20.0.0/16"
  azs              = ["us-east-1a", "us-east-1b", "us-east-1c"]
  nat_gateway_mode = "per_az"
}
EOF
terraform init >/dev/null && terraform plan -out=tfplan | grep Plan:
#  Plan: 28 to add, 0 to change, 0 to destroy.     (single → 24, none → 19)
terraform show -json tfplan > plan.json
jq -r '.resource_changes[] | "\(.change.actions|join(",")) \(.address)"' plan.json | head
jq '[.resource_changes[] | select(.type=="aws_nat_gateway")] | length' plan.json      # 3
# A "policy": fail if any subnet would be public in a 'private' tier
jq -e '[.resource_changes[] | select(.type=="aws_subnet")
        | select(.change.after.tags.Tier=="private" and .change.after.map_public_ip_on_launch==true)] | length == 0' plan.json \
  && echo "policy OK"
```
**Explain it:** why does this work without credentials, and what would break it? (Answer: any data source, or any resource already in state, needs real API calls.)

---

## Lab 12 (real AWS, costs cents): S3 backend + a VPC, then destroy
Prerequisites: an AWS sandbox account, `aws sts get-caller-identity` works.

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="tf-labs-state-$ACCOUNT"
aws s3api create-bucket --bucket "$BUCKET" --region us-east-1
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled

mkdir lab12 && cp -r lab10/modules lab12/ && cd lab12
cat > main.tf <<EOF
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    bucket       = "$BUCKET"
    key          = "labs/vpc/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = ["$ACCOUNT"]
  default_tags { tags = { Lab = "terraform-12" } }
}
module "vpc" {
  source           = "./modules/vpc"
  name             = "lab"
  cidr_block       = "10.99.0.0/16"
  azs              = ["us-east-1a", "us-east-1b"]
  nat_gateway_mode = "none"           # NAT gateways cost ~\$0.045/hr each — keep off for labs
}
output "private_subnets" { value = module.vpc.private_subnet_ids }
EOF
terraform init && terraform plan -out=tfplan && terraform apply tfplan
aws s3 ls "s3://$BUCKET/labs/vpc/"           # terraform.tfstate (and .tflock while a run is active)

# Drift exercise: change a tag by hand
VPC=$(terraform state show module.vpc.aws_vpc.this | awk -F'"' '/^ *id /{print $2}')
aws ec2 create-tags --resources "$VPC" --tags Key=Name,Value=hacked
terraform plan -refresh-only                 # shows the outside change
terraform plan                               # proposes setting Name back to "lab"
terraform apply -auto-approve

# State recovery exercise: list versions you could restore
aws s3api list-object-versions --bucket "$BUCKET" --prefix labs/vpc/terraform.tfstate \
  --query 'Versions[].{v:VersionId,t:LastModified}' --output table

terraform destroy -auto-approve
```

---

## Capstone (do it without looking anything up)

Build `live/dev` and `live/prod` roots that call **your** VPC module plus a new `modules/web` (ALB + ASG + launch template with `create_before_destroy`, SG with separate rule resources). Requirements:
- S3 backend with partial config (`-backend-config=backends/<env>.s3.tfbackend`)
- `allowed_account_ids`, `default_tags`, provider constraints, a committed lock file with linux+darwin hashes
- `terraform test` for both modules with mocks
- a GitHub Actions workflow: fmt → validate → tflint → test → plan comment on PR → apply on merge behind an environment, using OIDC
- one refactor PR that renames a resource **with `moved`** and shows `0 to destroy`
- a Rego/jq gate that fails any plan deleting an `aws_lb` or `aws_db_instance`

When you can build that from scratch and explain every plan line, you know Terraform better than most people who list it on their CV.

Back to the [Terraform index](./terraform.md) · [Interview Q&A](../Interview%20Questions/06-terraform-and-iac-qna.md)
