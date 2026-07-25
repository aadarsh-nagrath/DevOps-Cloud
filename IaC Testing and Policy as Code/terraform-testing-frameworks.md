# Terraform Testing Frameworks

Comparing native plan review, Terratest, and HashiCorp's built-in `terraform test`, plus how to combine them and why module testing matters more as reuse scales.

---

## 1. `terraform plan` Review — The Most Basic Form of Testing

Every `terraform apply` implicitly starts with a plan, and simply reading that plan output is the most basic (and most commonly relied-upon) form of testing in most teams.

```bash
terraform plan
# Terraform will perform the following actions:
#
#   # aws_instance.web will be updated in-place
#   ~ resource "aws_instance" "web" {
#       ~ instance_type = "t3.micro" -> "t3.large"
#         id            = "i-0abc123"
#     }
#
# Plan: 0 to add, 1 to change, 0 to destroy.
```

**What plan review does catch**: the literal set of create/update/destroy actions Terraform intends to take, and the specific attribute-level diffs for updates. It's genuinely useful for catching surprises — an unexpected `destroy` on a resource you thought was untouched is exactly the kind of thing plan review exists to surface.

**What plan review does NOT catch**:
- Whether the change is *semantically correct* — a plan can look clean and still be the wrong change (e.g. correctly resizing the wrong instance).
- Whether the resulting infrastructure will actually *work* — Terraform can successfully create a security group that still doesn't allow the traffic your app needs; the plan has no concept of "does this achieve the intended outcome."
- Runtime/application-level behavior — Terraform's view stops at the API call that created the resource; it can't tell you the database is reachable or the load balancer actually routes traffic correctly.
- Anything that isn't expressed as a resource diff — logic bugs in `for_each`/`count` expressions, incorrect `locals` computations that happen to produce a "valid-looking" plan.

In short: plan review shows you **what** will change, not whether that change is **safe or correct**. It's a necessary check, not a sufficient one — this is exactly the gap the rest of this file's tools exist to close.

---

## 2. Terratest — Real Infrastructure, Real Assertions

**Terratest** is a Go library (not a separate CLI/DSL) for writing tests that actually run `terraform apply` against real cloud infrastructure, make real assertions against the result, then run `terraform destroy` to clean up. It's the most thorough approach available and also the slowest and most expensive — it costs real cloud spend and real wall-clock time for every test run.

### 2.1 Worked conceptual example

```go
package test

import (
	"testing"
	"github.com/gruntwork-io/terratest/modules/terraform"
	"github.com/stretchr/testify/assert"
)

func TestS3BucketModule(t *testing.T) {
	// terraform.Options points Terratest at the module under test and
	// any input variables it needs.
	terraformOptions := &terraform.Options{
		TerraformDir: "../modules/s3-bucket",
		Vars: map[string]interface{}{
			"bucket_name": "terratest-example-bucket-12345",
		},
	}

	// Ensure `terraform destroy` runs at the end of the test, success or failure —
	// this is the safety net that keeps test runs from leaking real cloud resources.
	defer terraform.Destroy(t, terraformOptions)

	// Actually run `terraform init` and `terraform apply` against real infrastructure.
	terraform.InitAndApply(t, terraformOptions)

	// Read a real output value back from the applied infrastructure.
	bucketArn := terraform.Output(t, terraformOptions, "bucket_arn")

	// Assert against it like any other Go test.
	assert.Contains(t, bucketArn, "terratest-example-bucket-12345")

	// Terratest can go further — e.g. use the AWS SDK directly to confirm the
	// bucket's actual encryption configuration matches what was intended,
	// not just what the Terraform output claims.
}
```

```bash
go test -v -timeout 30m ./test/...
# -timeout is set generously because provisioning + destroying real infra
# can legitimately take several minutes per test
```

The value of Terratest is that it validates the *real* outcome — a bucket that Terratest confirms exists with the right ARN and the right encryption setting has actually been proven, not just planned. The cost is real: cloud spend for every run, several minutes minimum per test, and dependency on real provider APIs being available (flaky if a provider has a bad day).

---

## 3. Native `terraform test`

HashiCorp added a built-in testing framework directly to Terraform (`terraform test`), using `.tftest.hcl` files. It supports plan-based assertions that don't necessarily require creating real cloud resources for every test — a test can run against a `plan` command instead of a full `apply`, making it much closer in cost/speed to a unit test than Terratest's integration-test approach.

### 3.1 Worked example

```hcl
# tests/bucket.tftest.hcl

variables {
  bucket_name = "test-bucket-example"
}

run "validate_bucket_name" {
  command = plan
  # "plan" mode: only generates a plan, no real resources are created —
  # fast and free. Use "apply" mode when a test genuinely needs real state
  # (e.g. checking a value only known after creation).

  assert {
    condition     = aws_s3_bucket.this.bucket == var.bucket_name
    error_message = "Bucket name did not match the input variable"
  }
}

run "encryption_is_enabled" {
  command = plan

  assert {
    condition     = length(aws_s3_bucket_server_side_encryption_configuration.this.rule) > 0
    error_message = "Bucket must have server-side encryption configured"
  }
}

run "full_apply_check" {
  command = apply
  # "apply" mode: this run block actually creates real resources, checks
  # them, and Terraform tears them down automatically at the end of the
  # test file's execution — use sparingly, only where plan-mode can't
  # answer the question (e.g. asserting on a computed ARN).

  assert {
    condition     = can(regex("^arn:aws:s3:::", aws_s3_bucket.this.arn))
    error_message = "Bucket ARN did not have the expected format"
  }
}
```

```bash
terraform test
# Runs every run block in every *.tftest.hcl file found, in order.
# Output reports pass/fail per run block, similar to any test runner.
```

`terraform test` is HashiCorp's own answer to "we want fast, plan-based tests without reaching for an external Go toolchain" — it lives inside the same binary and config language as the infrastructure it's testing, which lowers the barrier for teams that don't want a separate Go test suite.

---

## 4. The Trade-off Spectrum

| Approach | Speed | Cost | Thoroughness | Best for |
|---|---|---|---|---|
| `terraform plan` manual review | Seconds | Free | Low — shows the diff, proves nothing about correctness | Every single change, as a baseline sanity check |
| `terraform test` (plan mode) | Seconds | Free | Medium — validates logic/attribute values without real infra | Fast unit-level assertions on module logic, run on every PR |
| `terraform test` (apply mode) | Minutes | Real cloud cost | High for the specific resources touched | A handful of critical assertions that truly need real state |
| Terratest | Minutes to tens of minutes | Real cloud cost, higher due to full module scope | Highest — proves the whole module works end to end | Critical, widely-reused modules; pre-release validation; not run on every commit |

The practical strategy: test most module logic with fast, plan-based tests (`terraform test` in plan mode, or even just thorough `terraform plan` review for less critical changes), and reserve full apply-and-destroy integration tests (Terratest, or `terraform test` in apply mode) for a smaller number of genuinely critical modules — the ones where "the plan looked right but the real infrastructure was subtly broken" would be expensive to discover in production.

---

## 5. Module Testing Specifically

A **reusable Terraform module** — one consumed by multiple environments, teams, or repositories — deserves disproportionately more testing investment than a one-off root module, because a bug in a shared module is a bug multiplied across every consumer. If a VPC module has a subnet CIDR calculation bug, that bug doesn't affect one environment — it affects every environment that consumes the module, all at once, likely silently until someone notices unexpected overlap or exhaustion.

Practical implications:

- Test the module **in isolation**, with its own dedicated test fixtures/examples directory, independent of any specific consuming environment — this is what both Terratest and `terraform test` are designed to do (point directly at a module path, not at a full environment's root config).
- Cover the module's variable combinations that matter — default values, edge-case inputs (empty lists, zero counts), and any conditional logic (`count`, `for_each`, `dynamic` blocks) inside the module.
- Version the module (semantic versioning via a Git tag or registry version) so consumers can pin to a known-tested version rather than always tracking a mutable branch — testing is only meaningful if consumers actually get the tested version.
- Run the module's test suite in its own CI pipeline, separate from and in addition to whatever tests exist for the environments that consume it — a module repository should be able to say "this version passed its own tests" independently of any one consumer's pipeline.

The general principle: testing investment should scale with blast radius. A root module used by one team in one environment can reasonably lean on `terraform plan` review and CI static/policy checks alone; a shared module consumed by 20 teams justifies a real Terratest suite.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
