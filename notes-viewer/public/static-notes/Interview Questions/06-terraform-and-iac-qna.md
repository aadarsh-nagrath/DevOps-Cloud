# Terraform & Infrastructure as Code — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. See also [`Terraform and CF/`](../Terraform%20and%20CF) and [`IaC Testing and Policy as Code/`](../IaC%20Testing%20and%20Policy%20as%20Code) in this repo. Grouped **Junior → Mid → Senior**, focused on Terraform with a lighter CloudFormation/Pulumi comparison.

---

## Table of Contents
- [Junior Level (0–2 yrs)](#junior-level-02-yrs)
- [Mid Level (2–5 yrs)](#mid-level-25-yrs)
- [Senior Level (5+ yrs)](#senior-level-5-yrs)

---

## Junior Level (0–2 yrs)

### 1. What is Infrastructure as Code (IaC), and why is it better than manually clicking through a cloud console?
IaC means defining infrastructure (servers, networks, databases, permissions) as version-controlled, declarative configuration files instead of manual, one-off actions in a UI. It gives you reproducibility (spin up an identical environment from the same code), a reviewable change history (a pull request instead of an untracked console click), disaster recovery (rebuild infrastructure from code after a region loss), and eliminates configuration drift caused by undocumented manual tweaks that nobody remembers making.

### 2. What is Terraform, and what problem does it solve?
Terraform (by HashiCorp) is an open-source IaC tool that lets you define infrastructure declaratively in HCL (HashiCorp Configuration Language) and provision it across almost any cloud or service via **providers** — a single tool and workflow for AWS, Azure, GCP, Kubernetes, and hundreds of other platforms, rather than learning each provider's own bespoke IaC tool (CloudFormation for AWS only, ARM/Bicep for Azure only, etc.).

### 3. What's the difference between declarative and imperative IaC?
Declarative (Terraform, CloudFormation) describes the *desired end state* ("I want 3 EC2 instances of this type") and lets the tool figure out what actions are needed to get there. Imperative (a Bash/Python script calling the AWS CLI/SDK step by step) describes the *exact sequence of actions* to take. Declarative tools can compute a diff and only change what's actually different; imperative scripts must handle "what already exists" logic themselves, which is why most modern IaC has converged on declarative approaches for infrastructure.

### 4. What are the core Terraform workflow commands, and what does each do?
`terraform init` downloads required providers/modules and sets up the working directory (backend, plugin cache) — run once per new configuration or after adding a provider/module. `terraform plan` computes and shows what changes would be made to reach the desired state, without actually applying anything. `terraform apply` executes those changes against real infrastructure (prompting for confirmation unless run with `-auto-approve`). `terraform destroy` tears down everything the configuration manages.

### 5. What is Terraform state, and why does Terraform need it at all?
State (`terraform.tfstate`, a JSON file) is Terraform's record of what real-world resources it created and their current attributes, mapped back to the resources declared in your configuration. Terraform needs it because cloud APIs don't offer a generic "show me everything this specific Terraform config previously created" query — the state file is what lets Terraform compute an accurate plan (comparing desired config vs. its record of actual last-known state) instead of blindly re-creating everything on every run.

### 6. What is a Terraform provider?
A provider is a plugin that translates Terraform's generic resource/data-source model into actual API calls against a specific platform (the `aws` provider, `azurerm`, `google`, `kubernetes`). You declare which providers you need and their version constraints in a `required_providers` block, and `terraform init` downloads them.

### 7. What's the difference between a resource and a data source in Terraform?
A `resource` block tells Terraform to *create and manage* something (Terraform owns its lifecycle — create, update, destroy). A `data` block *reads* information about something that already exists (created outside this configuration, or by another part of it) without managing its lifecycle at all — e.g. looking up the latest AMI ID, or referencing a VPC created by a different Terraform state/team.

### 8. What are Terraform variables and outputs, and why use them instead of hardcoding values?
`variable` blocks parameterize a configuration (instance size, environment name, region) so the same code can be reused across environments/accounts by supplying different values (via `.tfvars` files, CLI flags, or environment variables) instead of duplicating near-identical code with hardcoded differences. `output` blocks expose specific values (a resource's generated ID, an IP address) after apply — useful for chaining between configurations, or simply for visibility (`terraform output`).

### 9. What is a Terraform module?
A module is a reusable, self-contained package of Terraform configuration (its own resources, variables, and outputs) that can be called multiple times with different inputs — e.g. a "vpc" module called once per environment instead of copy-pasting the same 200 lines of VPC/subnet/route-table configuration three times. The Terraform Registry hosts many public, community-maintained modules for common infrastructure patterns.

### 10. What does `terraform fmt` and `terraform validate` do?
`terraform fmt` automatically rewrites configuration files into Terraform's canonical formatting style (consistent indentation/alignment) — purely cosmetic, but keeps diffs clean across a team. `terraform validate` checks configuration syntax and internal consistency (referencing an undeclared variable, type mismatches) *without* contacting any provider API or requiring valid credentials — a fast, offline sanity check typically run early in CI, before `plan`.

---

## Mid Level (2–5 yrs)

### 11. Why is storing Terraform state in a remote backend (S3, Terraform Cloud, etc.) instead of locally on disk essential for team use?
Local state creates two hard problems the moment more than one person touches the infrastructure: no shared source of truth (everyone has their own possibly-stale copy, so `plan` output is unreliable/wrong for anyone but the last person to apply), and no locking (two people running `apply` concurrently can corrupt state or create conflicting/duplicate resources). A remote backend (S3 + DynamoDB for locking, Terraform Cloud/HCP Terraform, Azure Storage, GCS) centralizes state as the single source of truth and provides locking so concurrent applies are serialized safely rather than racing.

### 12. What is state locking, and what happens if it isn't configured?
State locking prevents two `terraform apply` operations from running against the same state simultaneously — the backend (e.g. a DynamoDB table alongside an S3 backend) acquires a lock before an operation begins and releases it after. Without locking, two concurrent applies can both read the same "before" state, compute conflicting plans, and both write back — resulting in a corrupted state file that no longer accurately reflects real infrastructure, often requiring manual `terraform state` surgery or `import` to reconcile.

### 13. You hit a "state locked" error mid-pipeline. How would you actually resolve it?
First confirm no `apply` is genuinely still running anywhere (check the CI pipeline's own running jobs, and whoever's listed as the lock holder in the error message — it includes who/what acquired it and when) before touching anything, since force-unlocking while an apply is genuinely in progress is exactly how you get real state corruption, not just an inconvenient error. If it's confirmed stale (a crashed pipeline run, a killed process, an agent that died before releasing the lock), run `terraform force-unlock <LOCK_ID>` using the lock ID from the error output. After unlocking, don't immediately re-run `apply` blindly — run `terraform plan` first to see what Terraform currently believes needs to change, since the process that died may have partially applied some resources before crashing, and the plan will reveal whether state and real infrastructure have already diverged as a result. Structurally, prevent recurrence by making sure pipeline jobs have reasonable timeouts (so a hung job doesn't hold a lock indefinitely) and that the backend's locking mechanism (DynamoDB alongside S3, or Terraform Cloud's native locking) is actually configured correctly in the first place — a surprising number of "stuck lock" incidents turn out to be a misconfigured backend that isn't reliably releasing locks at all.

### 14. What's the difference between `terraform taint` (or the modern `-replace` flag) and simply changing a resource's configuration?
Changing configuration causes Terraform to compute an in-place update (or replace, if the changed attribute forces replacement) based on what actually differs. `terraform apply -replace="aws_instance.example"` (the modern replacement for the deprecated `terraform taint` command) forces Terraform to destroy and recreate a specific resource on the next apply *even though its configuration hasn't changed* — useful when the resource is broken/corrupted in a way Terraform's own state doesn't reflect (e.g. a VM whose disk got corrupted outside Terraform's knowledge) and you need a clean recreation.

### 15. What does `terraform import` do, and when would you use it?
`terraform import` brings an existing resource — one created manually in a console, by a script, or by another tool — under Terraform's management by associating it with a resource block in your configuration and recording it in state, *without* recreating it. Common scenario: adopting IaC for infrastructure that already exists in production, where destroying and recreating it isn't an option. You still must write the matching `resource` configuration block yourself so future plans don't show a diff against real attributes (modern Terraform's `import` blocks, generating starter configuration, ease this significantly compared to the older CLI-only workflow).

### 16. What is a Terraform workspace, and what's a common misconception about using them for environment separation (dev/staging/prod)?
A workspace lets one configuration manage multiple, named, independent state files (`terraform workspace new staging`) without duplicating code. The common misconception/pitfall: using workspaces alone as your *only* separation mechanism between environments as different as dev vs. production is often too weak a boundary — since it's just one code path with the same variables potentially referencing the wrong environment by human error (running `terraform apply` in the wrong workspace context), many teams instead prefer fully separate state files/backends (and sometimes separate cloud accounts) per environment, using workspaces more for things like short-lived per-feature/per-PR ephemeral environments where the accidental-cross-application risk is lower.

### 17. Explain the concept of a dependency graph in Terraform, and how it determines apply order.
Terraform builds a directed graph of resources based on explicit and implicit references between them (a subnet referencing a VPC's ID, an EC2 instance referencing a security group's ID) and walks that graph to determine execution order — resources with no dependency on each other can be created/updated in parallel, while a resource is only created/modified after everything it depends on has successfully completed. `depends_on` lets you declare an *implicit* ordering dependency that isn't expressed through a direct attribute reference (e.g. an IAM policy that must exist before a resource that assumes it works correctly, even if no attribute is literally passed between them).

### 18. What's the difference between `count` and `for_each` for creating multiple similar resources, and when would you prefer one over the other?
`count = 3` creates N near-identical resources indexed numerically (`resource[0]`, `resource[1]`, `resource[2]`) — if you remove the *middle* item from the source list, Terraform sees index-based diffs and may destroy/recreate resources that didn't conceptually need to change, since positions shifted. `for_each` (over a map or a set of strings) creates one resource per key, addressed by that stable key rather than a numeric index — removing one entry only affects that specific resource, leaving the others completely untouched. `for_each` is generally preferred for anything where the *set of items* might change over time; `count` remains fine for genuinely fixed-count or conditionally-present-or-absent (`count = var.enabled ? 1 : 0`) resources.

### 19. How do you manage secrets (database passwords, API keys) needed by Terraform configuration, given that state files store resource attributes in plaintext?
Never hardcode secrets directly in `.tf`/`.tfvars` files committed to source control. Pull secrets at apply-time from a dedicated secrets manager (AWS Secrets Manager, HashiCorp Vault, Azure Key Vault) via a `data` source, or mark sensitive variables with `sensitive = true` (which redacts them from CLI plan/apply output — but does **not** encrypt them within the state file itself, a common misconception). Because the state file itself can still contain secret values in plaintext regardless of the `sensitive` flag, the remote backend storing state must itself be encrypted at rest and tightly access-controlled (private S3 bucket with encryption + strict IAM, or Terraform Cloud's managed, access-controlled state storage) — the `sensitive` flag only protects against accidental exposure in logs/output, not against someone with direct access to the state file itself.

### 20. What is "drift" in the context of IaC, and how do you detect it?
Drift is when real infrastructure no longer matches what's declared in code/state — typically caused by manual out-of-band changes (someone tweaking a security group rule directly in the console during an incident and forgetting to update the Terraform code afterward). `terraform plan` itself detects drift naturally (it refreshes state against real infrastructure before diffing against config, so a manual change shows up as an unexpected planned change) — but relying on someone happening to run `plan` isn't reliable detection. Dedicated drift-detection tooling (scheduled `terraform plan` runs in CI purely for detection/alerting, or platforms like driftctl) run this proactively and alert when drift is found, without necessarily auto-applying a fix (since the "fix" might be to update the code to match an intentional manual emergency change, not to blindly revert it).

### 21. What's the difference between a Terraform module's "root module" and a "child module," and how do you pass values between them?
The root module is the configuration in the directory where you run `terraform apply` directly. A child module is invoked from the root (or another module) via a `module` block, receiving inputs through its declared `variable` blocks and exposing results back to its caller through its own `output` blocks — the calling module accesses those as `module.<name>.<output_name>`. This is the mechanism for composing larger infrastructure out of smaller, independently-testable, reusable building blocks.

### 22. How would you structure a Terraform codebase for a company managing infrastructure across dev, staging, and production environments?
A common, robust pattern: a shared library of well-tested modules (network, compute, database patterns) versioned and referenced by tag/ref, plus separate root configurations (and separate state files/backends) per environment that call those shared modules with environment-specific variable values — rather than one giant configuration branching internally on an "environment" variable (which risks a mistake in one environment's variables accidentally affecting another, since they're evaluated from the exact same code path and state). Directory layouts vary (a `live/` repo per environment calling a separate `modules/` repo is common, as is a monorepo with `environments/{dev,staging,prod}/` directories each with their own backend config) — the specific layout matters less than the underlying principle of state isolation per environment plus DRY, versioned, reusable module logic.

---

## Senior Level (5+ yrs)

### 23. Design a Terraform CI/CD pipeline for a team where `terraform apply` against production should never be run from someone's laptop. What does the pipeline enforce, and what are the failure modes to guard against?
Pipeline stages: `terraform fmt -check` and `validate` (fast, cheap correctness checks) → `terraform plan` (posted as a PR comment/artifact for human review, run with read-only credentials scoped to *only* what's needed to plan) → required human approval on the plan output specifically (not just "approve the PR," since the *plan*, not just the diff of `.tf` files, is what actually determines real-world impact — a seemingly small code change can produce a surprisingly large or destructive plan) → `terraform apply` run only from the CI pipeline itself, using separate, more privileged credentials than the plan stage, gated behind that approval, with locking ensuring only one apply runs at a time. Failure modes to explicitly guard against: state lock left stuck after a crashed/killed pipeline run (need a documented force-unlock procedure with strong safeguards against misuse), a plan approved by a human that goes stale by the time apply actually runs (re-running plan immediately before apply, or using a tool/workflow that guarantees the applied plan is exactly the one that was reviewed, avoids a "the world changed between plan and apply" surprise), and drift between what CI's state believes and reality if anyone still has standing console/CLI access to touch the same resources outside the pipeline (which argues for removing direct human write-access to production resources entirely once the pipeline is trusted, not just relying on process discipline).

### 24. Compare Terraform, Pulumi, and native cloud-specific tools (CloudFormation, ARM/Bicep) — what would actually drive you to choose one over another for a new project?
Terraform's biggest strengths are its mature multi-cloud/multi-provider ecosystem (a single tool and workflow across AWS/Azure/GCP/Kubernetes/SaaS providers) and the largest community module ecosystem — the default reasonable choice for most multi-cloud or cloud-agnostic-leaning organizations. Pulumi lets you write infrastructure in a real general-purpose language (TypeScript, Python, Go) instead of a DSL, which is genuinely valuable when infrastructure logic needs real programming constructs (complex conditionals, loops, calling out to existing internal libraries/tooling) that HCL expresses awkwardly, at the cost of a less mature/smaller module ecosystem and requiring your infra-as-code authors to actually know that language well. Native tools (CloudFormation, ARM/Bicep) integrate most deeply and immediately with their own cloud's newest features (a brand-new AWS service often has day-one CloudFormation support, while a Terraform provider update can lag), avoid a third-party state-management/backend dependency (AWS manages CloudFormation's state), and are the natural choice for an organization deliberately and permanently single-cloud with no near-term multi-cloud ambition — the tradeoff is lock-in and losing a single unified tool/workflow if that assumption changes later.

### 25. How do you implement and enforce Policy as Code (e.g. Sentinel, OPA/Conftest, or checkov) against Terraform, and what's the difference between enforcing it at plan-time vs. only scanning the written `.tf` code statically?
Static scanning of `.tf` source (checkov, tfsec, Terrascan) catches misconfigurations expressible purely from the code itself (an S3 bucket resource missing `encryption`, a security group with an overly broad CIDR) and can run very early (pre-commit, PR time) — but it can't see computed/interpolated values that only resolve at plan time (a variable-driven CIDR that only becomes "0.0.0.0/0" for a specific environment's variable values) or account for existing infrastructure context. Policy enforcement against the actual generated **plan** (Sentinel in Terraform Cloud/Enterprise, or OPA/Conftest run against `terraform show -json plan.out`) evaluates the fully-resolved, real intended change — catching issues static source scanning would miss, and can be wired as a hard, blocking gate in the pipeline (an apply that would violate policy simply cannot proceed) rather than only an advisory finding. A mature setup layers both: fast static scanning for immediate developer feedback, and plan-time policy enforcement as the actual non-bypassable gate before anything touches real infrastructure.

### 26. A `terraform apply` was interrupted midway (network failure / process killed) leaving state in an inconsistent or partially-applied condition. Walk through recovering safely.
First, don't panic-apply again immediately — run `terraform plan` first to see exactly what Terraform currently believes needs to change, since state may or may not accurately reflect what actually got created before the interruption (some resources may exist in the cloud but not yet recorded in state, if the interruption happened between creation and the state-write step). Check the backend for a stale lock left behind by the killed process (`terraform force-unlock`, used carefully, only after confirming no other apply is genuinely still running) since an interrupted process often fails to release its lock cleanly. If specific resources exist in the real cloud but are missing from state (a real risk if the process died right after resource creation but before Terraform recorded it), reconcile using `terraform import` for those specific resources rather than letting the next `apply` blindly try to create duplicates. Only once `terraform plan` shows a diff you fully understand and expect should you proceed with `apply` again — treating the interrupted state as something to *understand before touching further*, not something to blindly re-run through.

### 27. How would you manage Terraform provider and module version upgrades safely across a large, multi-team codebase, avoiding both "stuck on ancient versions forever" and "everyone breaks simultaneously on every upgrade"?
Pin provider versions with a constrained range (`~> 5.0`, not fully unpinned) in every root module, and commit the `.terraform.lock.hcl` dependency lock file to source control so `terraform init` reproducibly resolves the exact same provider version everywhere until it's deliberately updated (`terraform init -upgrade`) — never letting versions silently drift between different engineers' machines or CI runs. Roll out major provider/module version upgrades through a staged process: upgrade and validate against a non-production environment first, read the provider's changelog/upgrade guide for breaking changes (a major provider version bump frequently renames or restructures resource arguments), and land the upgrade as its own isolated, reviewed change rather than bundled with unrelated infrastructure changes — so if something breaks, it's unambiguous what caused it. For shared internal modules consumed by many teams, apply semantic versioning and give consuming teams a real window to adopt a new major version on their own schedule (rather than force-upgrading everyone the moment a module changes), the same discipline you'd expect from any shared library dependency.

### 28. How would you prevent conflicts during infrastructure changes when several engineers work on the same Terraform code?
Conflicts happen at three levels: **the state file**, **the code**, and **the real infrastructure**. Handle each one:

1. **State level: remote backend with locking.** S3 backend with locking (`use_lockfile = true` for native S3 locking in Terraform ≥1.10, or the older DynamoDB table), Terraform Cloud/HCP, or GCS/Azure Blob, which lock natively. A second `apply` then fails fast with "Error acquiring the state lock" instead of corrupting state (see Q12). Turn on S3 versioning so a bad state write can be rolled back.
2. **Process level: nobody applies from their laptop.** Every change goes through a **Git PR → CI runs `terraform fmt/validate/plan` → plan posted on the PR → review → merge → pipeline applies the saved plan file** (`terraform plan -out=tfplan` then `terraform apply tfplan`, so what's applied is exactly what was reviewed). Tools like **Atlantis**, HCP Terraform, Spacelift or env-gated GitHub Actions also **serialize runs per workspace/directory**, so two PRs touching the same stack can't apply at the same time. Engineers get read-only cloud credentials, and only the pipeline role can write.
3. **Blast-radius level: split state.** One huge state file means everyone contends for the same lock and every plan touches everything. Split by environment and component (`network/`, `eks/`, `rds/`, per env), and share outputs via `terraform_remote_state` or data sources. Smaller stacks mean fewer conflicts, faster plans and smaller mistakes.
4. **Drift level: Terraform owns what it manages.** No ClickOps changes in the console (enforced via IAM/SCPs). Run scheduled `terraform plan -detailed-exitcode` drift detection in CI and alert on non-zero. Use `lifecycle { ignore_changes = [...] }` only for attributes that something else legitimately changes (e.g. ASG desired capacity managed by autoscaling).
5. **Code level**: pin provider/module versions in `.terraform.lock.hcl` + `required_providers` so two engineers don't get different plans. Use small, focused PRs. Use `CODEOWNERS` so platform owners review shared modules. Add policy-as-code (OPA/Sentinel/Checkov) to block dangerous changes before they reach apply.

One-line summary: **"Locking stops simultaneous writes, but the real fix is a single serialized PR-based pipeline as the only path to apply, plus small state files."**

### 29. How would you delete a specific resource using Terraform?
It depends on whether you want it **gone for good**, **destroyed just this once**, or **removed from Terraform's management but left running**:

1. **The normal, correct way: remove it from the code.** Delete the `resource` block (or reduce `count`/remove the `for_each` key), then `terraform plan` shows `- destroy`, and `terraform apply`. Code and state stay in sync, and it goes through PR review. Prefer this for anything permanent.
2. **One-off targeted destroy**:
   ```bash
   terraform plan -destroy -target=aws_instance.web          # preview first
   terraform destroy -target=aws_instance.web
   terraform destroy -target='aws_instance.web["app1"]'      # for_each instance (quote it)
   terraform destroy -target='module.vpc.aws_nat_gateway.this[0]'
   ```
   `-target` also destroys things that **depend on** that resource. Terraform warns that targeting is for exceptional cases: if the block is still in the code, the **next `apply` recreates it**. Use it for break-glass situations, not as a workflow.
3. **Stop managing it, but keep the real resource** (e.g. handing it to another stack or team):
   ```bash
   terraform state rm aws_s3_bucket.logs
   ```
   Or declaratively in Terraform ≥1.7:
   ```hcl
   removed {
     from = aws_s3_bucket.logs
     lifecycle { destroy = false }
   }
   ```
   Then delete the resource block. The bucket keeps existing in AWS, and Terraform just forgets it.
4. **Recreate rather than delete**: `terraform apply -replace=aws_instance.web` (the modern replacement for `terraform taint`).

Safety notes: always `plan` first, watch for `prevent_destroy = true` in `lifecycle` (it blocks deletion on purpose, so remove it deliberately), and for stateful resources (RDS, S3) check `deletion_protection`, `skip_final_snapshot`, and `force_destroy` before you go.

### 30. What is parallelism in Terraform?
Terraform builds a **dependency graph** of all resources (from references like `aws_subnet.a.id` and explicit `depends_on`). Resources that **don't depend on each other are created, updated or destroyed concurrently**. A resource waits only for the things it references. **Parallelism** is the maximum number of graph nodes Terraform works on at the same time.

- **Default: 10** concurrent operations.
- Change it per run: `terraform apply -parallelism=20` (also on `plan` and `destroy`), or for every run with `export TF_CLI_ARGS_apply="-parallelism=20"`.
- **Raise it** for large stacks with many independent resources (hundreds of DNS records, IAM policies, security group rules), so applies finish faster.
- **Lower it** (e.g. `-parallelism=1` to `5`) when you hit **API rate limits / throttling** (`ThrottlingException`, `429 Too Many Requests`) from AWS, Azure or GitHub providers, when a provider has concurrency bugs, or to make debug logs readable and sequential.
- It only controls concurrency **within one run**. It is unrelated to running two `apply`s at once, which **state locking** prevents (Q12).
- It doesn't override dependencies. With `-parallelism=50`, a subnet still waits for its VPC. The order always comes from the graph (`terraform graph | dot -Tsvg > graph.svg` to visualize it).
