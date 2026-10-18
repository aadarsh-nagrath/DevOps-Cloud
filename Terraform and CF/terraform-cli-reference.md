# Terraform CLI Reference

> Part of the [Terraform notes](./terraform.md). Previous: [Modules](./terraform-modules.md). Next: [Environments, Workflows & CI/CD](./terraform-environments-and-cicd.md).

These flags were checked against `terraform <cmd> -help` on v1.15.8. Global options come **before** the subcommand: `terraform -chdir=envs/prod plan`.

---

## Global options

```bash
terraform -chdir=infra/prod plan    # run as if cd'd into that dir (paths resolve there)
terraform -version / version -json
terraform -help / terraform plan -help
terraform -install-autocomplete
```

---

## `init`

```bash
terraform init                                   # backend + modules + providers
terraform init -upgrade                          # newest allowed provider/module versions; rewrites lock file
terraform init -reconfigure                      # ignore saved backend config; DON'T migrate state
terraform init -migrate-state                    # move state to the newly configured backend
terraform init -migrate-state -force-copy        # ...without prompting (CI)
terraform init -backend-config=prod.s3.tfbackend -backend-config="key=app/terraform.tfstate"
terraform init -backend=false                    # skip backend (lint/validate in CI without creds)
terraform init -lockfile=readonly                # FAIL if lock file would change — use in CI
terraform init -input=false                      # never prompt
terraform init -plugin-dir=/opt/providers        # only install from this dir (air gap)
terraform init -from-module=git::https://...     # copy a module into an empty dir as a starting point
terraform get -update                            # modules only
```

`.terraform/terraform.tfstate` (inside `.terraform/`) is **not** your state. It caches the backend configuration. Deleting `.terraform/` and re-running init is a safe "turn it off and on again".

---

## `fmt` / `validate`

```bash
terraform fmt                 # rewrite files in canonical style
terraform fmt -recursive      # include subdirectories (modules/)
terraform fmt -check -diff    # CI: exit 3 if unformatted, show diff
terraform validate            # syntax, types, references, provider schema — no API calls, no state
terraform validate -json      # machine-readable diagnostics (editors, CI annotations)
```

`validate` needs `init` first, because it needs the provider schemas. In CI, use `init -backend=false && validate`.

---

## `plan`

```bash
terraform plan
terraform plan -out=tfplan                       # save the exact plan → apply it later
terraform plan -var 'env=prod' -var-file=prod.tfvars
terraform plan -input=false -lock-timeout=5m     # CI
terraform plan -detailed-exitcode                # 0 none · 1 error · 2 changes present
terraform plan -refresh-only                     # only reconcile state with reality
terraform plan -refresh=false                    # skip refresh (fast, may be wrong)
terraform plan -destroy                          # what would destroy do?
terraform plan -target='module.db'               # EMERGENCY ONLY — partial graph
terraform plan -replace='aws_instance.web["a"]'  # force replace one instance (replaces `taint`)
terraform plan -generate-config-out=generated.tf # with import blocks: write HCL for them
terraform plan -parallelism=20
terraform plan -compact-warnings -no-color
terraform plan -json | jq                        # streaming machine-readable UI log
```

### About `-target`
`-target` plans only the target and its **dependencies**. Its dependents aren't included, and neither is anything else. Terraform prints a warning, because the result is a **partial** state of the world:
- Good uses: break-glass recovery, or bootstrapping an unknown value (create the EKS cluster first, then everything else).
- Bad uses: routine work. People "target around" a broken resource, and the drift between code and reality grows quietly.
- After any targeted apply, **run a full plan** and get it to zero changes.

### Plan files
- A binary zip that holds the config snapshot, the planned changes, the prior state, **and variable values (including secrets)**. Treat it like state.
- Tied to that state version. If state changes, you get `Saved plan is stale`.
- `terraform show tfplan` gives the human view. `terraform show -json tfplan` gives JSON for OPA/Conftest/Checkov/Infracost.

```bash
terraform show -json tfplan | jq '[.resource_changes[] | select(.change.actions | index("delete")) | .address]'
# → list every resource the plan will delete — great pre-apply guard in CI
```

---

## `apply` / `destroy`

```bash
terraform apply                                  # plan + prompt
terraform apply tfplan                           # apply saved plan — no prompt, no re-plan
terraform apply -auto-approve                    # no prompt (dev/CI non-prod)
terraform apply -replace='aws_instance.web'
terraform apply -refresh-only                    # accept drift into state
terraform apply -destroy  ==  terraform destroy
terraform destroy -target='aws_instance.tmp'     # destroy one thing (+ its dependents!)
terraform apply -parallelism=5 -lock-timeout=10m
```

Ctrl+C **once** stops gracefully: in-flight operations finish and state is saved. Pressing it **twice** kills immediately, which can leave a stale lock and objects that exist but aren't recorded in state. Press it once and wait.

---

## `output` / `show` / `console`

```bash
terraform output                         # all root outputs
terraform output -raw alb_dns            # plain string, for scripts
terraform output -json | jq -r '.subnet_ids.value["us-east-1a"]'
terraform show                           # current state, human-readable
terraform show -json | jq '.values.root_module.resources[].address'
terraform console                        # REPL with your vars/locals/state loaded
echo 'cidrsubnet("10.0.0.0/16", 8, 3)' | terraform console     # one-shot evaluation
```

`console` is the best debugging tool you have. Load your real variables (`-var-file=prod.tfvars`) and evaluate `local.subnets_by_key` to see exactly what your `for` expressions produce.

---

## `state`

```bash
terraform state list [ADDR_PREFIX] [-id=REAL_ID]
terraform state show ADDR
terraform state mv SRC DST                     # prefer moved {}
terraform state rm ADDR                        # prefer removed {}
terraform state pull > backup.tfstate
terraform state push [-force] FILE             # DR only
terraform state replace-provider OLD NEW
terraform state identities -json               # 1.12+
terraform untaint ADDR
terraform force-unlock LOCK_ID                 # only when holder is dead
```

Quote any address that has brackets: `'module.svc["api"].aws_iam_role.this'`. In PowerShell, use `'module.svc[\"api\"]'`.

---

## `import` / `query`

```bash
terraform import ADDR ID                       # legacy one-by-one; writes state immediately
terraform plan -generate-config-out=gen.tf     # with import {} blocks — preferred
terraform query                                # 1.14+: run list blocks in *.tfquery.hcl to discover resources
terraform query -generate-config-out=found.tf  # emit import blocks + config for what it found
```

---

## `workspace`

```bash
terraform workspace show
terraform workspace list
terraform workspace new staging
terraform workspace select -or-create staging  # 1.4+
terraform workspace delete staging             # must be empty (or -force)
```
See [Environments](./terraform-environments-and-cicd.md#1-workspaces) for when to use workspaces and when not to.

---

## `providers` / `modules` / `graph` / `metadata`

```bash
terraform providers                             # tree of provider requirements per module
terraform providers lock -platform=linux_amd64 -platform=darwin_arm64
terraform providers mirror ./mirror             # download for offline use
terraform providers schema -json | jq '.provider_schemas["registry.terraform.io/hashicorp/aws"].resource_schemas | keys | length'
terraform modules -json                         # installed modules and their sources/versions
terraform graph | dot -Tsvg > graph.svg
terraform metadata functions -json              # all built-in function signatures
```

---

## `test`

```bash
terraform test                                  # run tests/*.tftest.hcl + *.tftest.hcl
terraform test -filter=tests/vpc.tftest.hcl
terraform test -verbose                         # print plan/state for each run
terraform test -junit-xml=results.xml           # CI reporting
terraform test -var 'region=us-west-2'
```

---

## `login` / `logout` (HCP Terraform / TFE)

```bash
terraform login                     # app.terraform.io → token in ~/.terraform.d/credentials.tfrc.json
terraform login tfe.acme.corp
```

---

## Environment variables

| Variable | Effect |
|---|---|
| `TF_VAR_name` | Sets root variable `name` |
| `TF_LOG` / `TF_LOG_CORE` / `TF_LOG_PROVIDER` | `TRACE`/`DEBUG`/`INFO`/`WARN`/`ERROR`/`JSON` |
| `TF_LOG_PATH` | Write logs to a file |
| `TF_INPUT=0` | Never prompt (same as `-input=false`) |
| `TF_IN_AUTOMATION=1` | Shortens output for CI (drops the "run terraform apply next" hints) |
| `TF_CLI_ARGS` / `TF_CLI_ARGS_plan` | Extra args for every command or for one command: `TF_CLI_ARGS_plan="-parallelism=30"` |
| `TF_DATA_DIR` | Use something other than `.terraform/` (useful for parallel init of the same dir with different backends) |
| `TF_WORKSPACE` | Select a workspace without running `workspace select` |
| `TF_PLUGIN_CACHE_DIR` | Shared provider download cache |
| `TF_CLI_CONFIG_FILE` | Path to the `.terraformrc` |
| `TF_TOKEN_<host>` | Registry/HCP token, e.g. `TF_TOKEN_app_terraform_io` |
| `TF_REGISTRY_CLIENT_TIMEOUT` | Registry timeout in seconds (slow networks) |

---

## Exit codes

| Command | Codes |
|---|---|
| Most | `0` success, `1` error |
| `plan -detailed-exitcode` | `0` no changes, `1` error, **`2` changes present** |
| `fmt -check` | `0` formatted, `3` needs formatting |

---

## Commands that are deprecated or discouraged

| Old | Use instead |
|---|---|
| `terraform taint X` | `terraform apply -replace=X` |
| `terraform refresh` | `terraform apply -refresh-only` (reviewable) |
| `terraform state mv` for refactors | `moved {}` blocks |
| `terraform state rm` to abandon | `removed { lifecycle { destroy = false } }` |
| `terraform import` CLI | `import {}` blocks + `-generate-config-out` |
| `null_resource` | `terraform_data` |
| S3 backend `dynamodb_table` | `use_lockfile = true` |

Next: [Environments, Workflows & CI/CD →](./terraform-environments-and-cicd.md)
