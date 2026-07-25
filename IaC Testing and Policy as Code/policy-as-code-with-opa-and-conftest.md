# Policy as Code — OPA, Rego, Conftest, Gatekeeper, Kyverno

Open Policy Agent explained from first principles, Rego syntax walked through line by line, Conftest for running policies in CI, and the two Kubernetes-native admission-control implementations (Gatekeeper and Kyverno).

---

## 1. What OPA Actually Is

**Open Policy Agent (OPA)** is a general-purpose policy engine. It is **not Terraform-specific** and not Kubernetes-specific — it's a standalone tool that evaluates *any* structured data (JSON/YAML) against rules you write, and returns an allow/deny decision (or a list of violation messages).

Things OPA can evaluate policies against, all using the exact same engine:

- A Terraform plan, converted to JSON (`terraform show -json`)
- A Kubernetes manifest (Pod, Deployment, etc.)
- An incoming API request (used for microservice authorization)
- Cloud provider configuration exports (CloudFormation, ARM templates)

The rules are written in **Rego**, OPA's purpose-built policy language. Rego is declarative — you don't write imperative "if/else" control flow to reach a conclusion, you write logical rules that are true or false given the input data, and OPA figures out which rules apply.

The mental model: **input (JSON) + policy (Rego) → decision (JSON)**. OPA doesn't know anything about Terraform or Kubernetes internally — it just consumes structured data. Everything else (Conftest, Gatekeeper, Kyverno) is tooling built *around* this core evaluation engine to make it convenient for a specific use case.

---

## 2. Rego Syntax, From First Principles

Rego looks unfamiliar at first. Below is a genuinely minimal policy, built up piece by piece, that denies any S3 bucket resource without encryption enabled — the same insecure example from [`linting-and-static-analysis.md`](linting-and-static-analysis.md).

### 2.1 The input data

Assume OPA is given this JSON (a simplified stand-in for a Terraform plan's `resource_changes`):

```json
{
  "resource_changes": [
    {
      "type": "aws_s3_bucket",
      "name": "data",
      "change": {
        "after": {
          "bucket": "my-app-data-bucket",
          "server_side_encryption_configuration": []
        }
      }
    }
  ]
}
```

### 2.2 The policy, line by line

```rego
package main
# Every Rego file declares a package — a namespace for its rules.
# "main" is just a name; Conftest defaults to looking in package "main".

import rego.v1
# Opts into current Rego syntax/semantics (recommended in modern OPA versions).

deny contains msg if {
	# "deny" is a rule name — by convention, a set of violation messages.
	# "contains msg if {...}" means: for every way the body below can be
	# satisfied, add the resulting "msg" value into the "deny" set.

	some resource in input.resource_changes
	# Loop construct: iterate over each element of input.resource_changes,
	# binding each one in turn to the variable "resource".

	resource.type == "aws_s3_bucket"
	# Condition: only consider resources of type aws_s3_bucket.
	# In Rego, every line in a rule body is an implicit AND — all conditions
	# must hold for the rule to produce output for this iteration.

	count(resource.change.after.server_side_encryption_configuration) == 0
	# Condition: the encryption config block is empty — i.e. not set.
	# count() is a built-in function; here it's checking array length.

	msg := sprintf(
		"S3 bucket '%s' does not have encryption enabled",
		[resource.change.after.bucket],
	)
	# If both conditions above held, construct the violation message.
	# ":=" is assignment. sprintf is a built-in string-formatting function,
	# analogous to printf — %s is replaced by the array's elements in order.
}
```

### 2.3 What happens when this runs

For the input above, `resource.type == "aws_s3_bucket"` is true, and `server_side_encryption_configuration` is an empty array, so both conditions hold. The rule produces:

```json
{
  "deny": [
    "S3 bucket 'my-app-data-bucket' does not have encryption enabled"
  ]
}
```

If `deny` is a non-empty set, the policy has failed — that's the convention nearly all OPA tooling (Conftest, Gatekeeper) relies on: **a non-empty `deny` set means reject this input.**

### 2.4 Key Rego concepts recap

| Concept | Meaning |
|---|---|
| `package` | Namespace for the policy file |
| `input` | The JSON/YAML data being evaluated — provided externally, not part of the policy file |
| `some x in collection` | Iterate over a collection, binding each element to `x` |
| Implicit AND | Every statement in a rule body must be true for that rule to fire |
| `:=` | Assignment |
| `==` | Equality comparison |
| `deny contains msg if {...}` | Idiomatic pattern: build up a set of violation strings; non-empty set = policy violated |
| Built-in functions | `count()`, `sprintf()`, and many more — Rego ships a large standard library so you rarely need custom logic for basic checks |

---

## 3. Conftest — Running Rego Policies Against Config Files

**Conftest** is a CLI wrapper around OPA that makes it trivial to run Rego policies against config files (Terraform plans, Kubernetes YAML, Dockerfiles, etc.) without writing any custom integration code yourself — no need to write a Go program that calls the OPA library; Conftest handles input parsing and policy loading for you.

### 3.1 Worked example: gating a Terraform plan in CI

```bash
# 1. Generate a plan and save it to a binary file
terraform plan -out=tfplan

# 2. Convert the binary plan to JSON — this JSON is what Conftest/OPA will read
terraform show -json tfplan > tfplan.json

# 3. Run Conftest against it, pointing at a directory of .rego policy files
conftest test tfplan.json --policy ./policy

# Or, piping directly without an intermediate file:
terraform show -json tfplan | conftest test -
```

### 3.2 Example output

```
FAIL - tfplan.json - main - S3 bucket 'my-app-data-bucket' does not have encryption enabled

2 tests, 1 passed, 0 warnings, 1 failure, 0 exceptions
```

Conftest exits non-zero on any failure, which is exactly what's needed to fail a CI job — wire it in as a required step right after `terraform plan`:

```yaml
# Conceptual CI step (see ../Continuous Integration/ci-fundamentals.md for general pipeline structure)
- name: Policy check with Conftest
  run: |
    terraform plan -out=tfplan
    terraform show -json tfplan | conftest test - --policy ./policy
    # non-zero exit here fails the pipeline before anything is ever applied
```

Policies live in version control alongside the infrastructure code, get code-reviewed like everything else, and evolve the same way application logic does — this is the "as code" part of policy as code.

---

## 4. OPA Gatekeeper — Kubernetes-Native Admission Control

Everything above runs in CI, *before* an apply. **OPA Gatekeeper** applies the same OPA/Rego engine at a different point in the lifecycle: **inside the Kubernetes cluster itself**, as an admission controller. When any resource (Pod, Deployment, etc.) is submitted to the Kubernetes API — via `kubectl apply`, a CI/CD pipeline, or anything else — Gatekeeper intercepts it and can accept or reject it before it's ever persisted to etcd.

This matters because CI-stage policy checks can be bypassed (someone applies a manifest directly with `kubectl`, or a change comes from a tool that skips the pipeline). Gatekeeper is the enforcement backstop *inside the cluster* — policy as code that can't be skipped by going around CI.

Gatekeeper uses two custom resources:

- **ConstraintTemplate** — defines the Rego logic and the schema for its parameters (reusable, like a class definition)
- **Constraint** — an instance of a ConstraintTemplate with specific parameters applied (like instantiating that class)

### 4.1 Worked example: denying Pods with no resource limits

For the concept of `resources.limits` on a container itself, see [`../Kubernetes/K-pods.md`](../Kubernetes/K-pods.md) — this example assumes that's already understood and focuses purely on the policy enforcement layer.

```yaml
# constrainttemplate.yaml — defines the reusable policy logic
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: requirelimits
spec:
  crd:
    spec:
      names:
        kind: RequireLimits   # the Kind that Constraints of this template will use
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package requirelimits

        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          # iterate over every container in the Pod spec being admitted

          not container.resources.limits
          # true if the container has no resources.limits block at all

          msg := sprintf(
            "Container '%s' has no resource limits set",
            [container.name],
          )
        }
```

```yaml
# constraint.yaml — activates the policy against a specific set of resources
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: RequireLimits
metadata:
  name: require-limits-on-pods
spec:
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]
    # scopes this constraint to Pod resources only — other kinds are unaffected
```

With both applied to the cluster, submitting a Pod with no `resources.limits` is rejected at admission time:

```
$ kubectl apply -f bad-pod.yaml
Error from server (Forbidden): error when creating "bad-pod.yaml":
admission webhook "validation.gatekeeper.sh" denied the request:
[require-limits-on-pods] Container 'app' has no resource limits set
```

---

## 5. Kyverno — A Kubernetes-Native Alternative

**Kyverno** solves the same problem as Gatekeeper (admission control inside Kubernetes) but with YAML-native policies instead of Rego — no new language to learn, since policies are written using patterns that look like the Kubernetes resources they validate.

The equivalent "require resource limits" policy in Kyverno:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-limits
spec:
  validationFailureAction: Enforce   # reject on violation (vs "Audit" which only logs)
  rules:
    - name: check-resource-limits
      match:
        resources:
          kinds:
            - Pod
      validate:
        message: "Resource limits are required on all containers"
        pattern:
          spec:
            containers:
              - resources:
                  limits:
                    memory: "?*"   # "?*" means: this field must exist and be non-empty
                    cpu: "?*"
```

No Rego, no `input.review.object` traversal — just a YAML pattern that mirrors the shape of the resource being validated.

### 5.1 OPA/Gatekeeper vs Kyverno

| | OPA / Gatekeeper | Kyverno |
|---|---|---|
| Policy language | Rego (general-purpose, powerful, steeper learning curve) | YAML (Kubernetes-native, no new language) |
| Scope | General-purpose — same engine works for Terraform plans, API authorization, K8s, anything | Kubernetes-only by design |
| Learning curve | Higher — Rego takes real time to get comfortable with | Lower — anyone who can read a K8s manifest can read most Kyverno policies |
| Ecosystem maturity | Very mature, widely adopted beyond Kubernetes (CI policy checks, API gateways, service mesh authorization) | Mature specifically within Kubernetes; growing fast, strong CNCF backing |
| Best fit | Teams that want one policy engine/language across CI (Conftest) *and* the cluster (Gatekeeper) | Teams that only need Kubernetes admission control and want the lowest possible barrier to entry |

A common real pattern: use Conftest/Rego for CI-stage Terraform/config checks (where Rego's general-purpose power is valuable) and Kyverno specifically inside the cluster (where its simpler YAML policies are faster for a platform team to maintain day to day). There's no requirement to use the same tool at every layer.

---

## 6. Shift Left: Why Catch It in CI, Not at Admission, Not in an Incident

The same violation can theoretically be caught at three different points, and the cost/impact of catching it grows by roughly an order of magnitude at each stage:

1. **CI plan-check (Conftest against a Terraform plan, or a PR-time check)** — cheapest possible point. Nothing has been created yet; the fix is a one-line diff before merge.
2. **Cluster admission rejection (Gatekeeper/Kyverno)** — more expensive. The manifest was already fully written and submitted; the rejection happens live, potentially blocking a deploy someone is actively watching, and depends on the admission webhook being correctly configured and available.
3. **Security incident after the fact** — most expensive by far. The violation (e.g. an unencrypted bucket, an open security group) was actually running in production, potentially for hours or days, exposed to real risk before anyone noticed.

This is the same "shift left" logic that shows up in application security practice generally — likely covered in more depth in a sibling Security in DevOps section of this repo — applied specifically to infrastructure policy: the earlier a violation is caught in the pipeline, the cheaper it is to fix and the smaller its real-world blast radius. Policy as code exists specifically to make the cheap, early catch (layer 1) the default, with admission control (layer 2) as a backstop for anything that slips past CI — not the primary enforcement mechanism.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
