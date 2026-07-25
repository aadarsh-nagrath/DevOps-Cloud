# Linting & Static Analysis for IaC

The base of the testing pyramid — fast, free, no-excuse-not-to-run checks that catch syntax, style, and known-bad security patterns before anything is applied.

---

## 1. The Absolute Baseline: `terraform fmt` and `terraform validate`

These ship with Terraform itself. There is no excuse not to run both on every commit.

```bash
terraform fmt -check -recursive
# -check: exit non-zero if files aren't formatted (don't silently rewrite in CI)
# -recursive: check all subdirectories/modules, not just the current one

terraform fmt -recursive
# locally: actually rewrite files into canonical style
```

```bash
terraform validate
# checks internal consistency: syntax errors, type mismatches, missing required
# arguments, undeclared variable references. Does NOT check against real
# provider APIs or credentials — no plan is generated, no state is touched.
```

What `terraform validate` does **not** catch: whether an S3 bucket name is already taken, whether an instance type exists in a given region, whether your AWS credentials even work, or anything about security/cost/compliance. It's purely "is this HCL well-formed and internally consistent."

---

## 2. Deeper Static Analysis Tools

| Tool | Focus | Notes |
|---|---|---|
| **TFLint** | Provider-specific correctness — invalid instance types, deprecated syntax, unused variables/declarations, naming conventions | Plugin-based; has AWS/Azure/GCP rule sets that know real provider constraints Terraform's own `validate` doesn't check |
| **Checkov** | Security & compliance-focused static scanning | Large built-in rule set (1000+) covering Terraform, CloudFormation, Kubernetes, Dockerfiles; catches things like unencrypted storage, overly permissive IAM, missing logging |
| **tfsec** | Security-focused scanning, similar goal to Checkov | Now merged into **Trivy** (Aqua Security's unified scanner) — new projects should generally reach for `trivy config` rather than the standalone `tfsec` binary, though `tfsec` still works and is widely referenced in existing pipelines |

These three are not mutually exclusive — many teams run TFLint for correctness plus Checkov or Trivy for security, since they catch different classes of problems.

---

## 3. Worked Example: Catching an Insecure S3 Bucket

Deliberately insecure Terraform — a public-read S3 bucket with no encryption, plus a security group open to the world:

```hcl
# main.tf — intentionally insecure for demonstration

resource "aws_s3_bucket" "data" {
  bucket = "my-app-data-bucket"
}

resource "aws_s3_bucket_acl" "data_acl" {
  bucket = aws_s3_bucket.data.id
  acl    = "public-read"          # PROBLEM: bucket readable by anyone on the internet
}
# PROBLEM: no aws_s3_bucket_server_side_encryption_configuration resource at all

resource "aws_security_group" "web" {
  name        = "web-sg"
  description = "Allow SSH from anywhere"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]   # PROBLEM: SSH open to the entire internet
  }
}
```

### Checkov output

```bash
$ checkov -d .

Check: CKV_AWS_20: "S3 Bucket has an ACL defined which allows public READ access."
        FAILED for resource: aws_s3_bucket_acl.data_acl
        File: /main.tf:6-9

Check: CKV_AWS_19: "Ensure the S3 bucket has server-side-encryption enabled"
        FAILED for resource: aws_s3_bucket.data
        File: /main.tf:3-5

Check: CKV_AWS_24: "Ensure no security groups allow ingress from 0.0.0.0:0 to port 22"
        FAILED for resource: aws_security_group.web
        File: /main.tf:16-25

Passed checks: 4, Failed checks: 3, Skipped checks: 0
```

### tfsec / Trivy output (equivalent findings, different formatting)

```bash
$ tfsec .

Result #1 CRITICAL Security group rule allows ingress from public internet.
main.tf:21-22
  aws_security_group.web (Missing description for rule; opens port 22 to 0.0.0.0/0)

Result #2 HIGH Bucket does not have encryption enabled
main.tf:3
  aws_s3_bucket.data

Result #3 HIGH Bucket has an ACL which allows public read access
main.tf:8
  aws_s3_bucket_acl.data_acl
```

The fix, for reference — encrypt the bucket, remove the public ACL, restrict ingress to known CIDR ranges:

```hcl
resource "aws_s3_bucket_server_side_encryption_configuration" "data_enc" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_acl" "data_acl" {
  bucket = aws_s3_bucket.data.id
  acl    = "private"
}

ingress {
  from_port   = 22
  to_port     = 22
  protocol    = "tcp"
  cidr_blocks = ["10.0.0.0/8"]   # restrict to internal network / VPN range
}
```

---

## 4. Where These Run in a Pipeline

| Stage | Tools | Purpose |
|---|---|---|
| **Pre-commit hook** | `terraform fmt -check`, `terraform validate`, TFLint | Instant local feedback — catches issues before they even reach a PR, cheapest possible point to fail |
| **CI pipeline (PR stage)** | All of the above plus Checkov/tfsec, run as a required, enforced gate | Nobody can merge a PR that fails these checks — this is where linting becomes *policy*, not just a suggestion |

Example pre-commit hook config (using the [pre-commit](https://pre-commit.com/) framework):

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/antonbabenko/pre-commit-terraform
    rev: v1.88.0
    hooks:
      - id: terraform_fmt
      - id: terraform_validate
      - id: terraform_tflint
      - id: terraform_checkov
```

For how these steps fit into a larger CI pipeline (stages, triggers, required status checks), see [`../Continuous Integration/ci-fundamentals.md`](../Continuous%20Integration/ci-fundamentals.md) rather than re-deriving general CI concepts here — this file is specifically about *what* to run, not the general mechanics of pipeline stages.

Static/security scanning is necessary but not sufficient — it catches known-bad patterns, not organization-specific rules like "all S3 buckets must be tagged with a cost center" or "no resource may be created outside `us-east-1`." That's the job of policy as code, covered next in [`policy-as-code-with-opa-and-conftest.md`](policy-as-code-with-opa-and-conftest.md).

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
