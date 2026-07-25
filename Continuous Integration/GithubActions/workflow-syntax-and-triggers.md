# Workflow Syntax and Triggers

Full YAML syntax reference for GitHub Actions workflows — every trigger type, job/step structure, conditionals, and the context/expression system. See [github-actions.md](github-actions.md) for core concepts if you haven't read that first, and [CI Fundamentals](../ci-fundamentals.md) for trigger concepts that apply generically across CI tools.

---

## 1. `on:` — Trigger Deep Dive

### `push` — runs on commits pushed to the repo
```yaml
on:
  push:
    branches:
      - main
      - 'release/**'        # glob patterns supported
    paths:                  # only trigger if changed files match (see monorepo patterns)
      - 'src/**'
    tags:
      - 'v*'                # e.g. trigger a release workflow on tag push
```

### `pull_request` — runs when a PR is opened/updated
```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]   # default set if `types:` omitted
    branches: [main]                          # only PRs targeting main
```
Critically: `pull_request` checks out and runs against the **merge commit of the PR**, using the workflow file **from the PR branch itself**, and it runs with **read-only, restricted permissions and no access to repo secrets** when the PR comes from a fork. This is a deliberate safety default — a malicious fork PR can't exfiltrate your secrets just by opening a PR.

### `pull_request_target` — SECURITY CRITICAL

`pull_request_target` looks almost identical to `pull_request` but behaves fundamentally differently:

| | `pull_request` | `pull_request_target` |
|---|---|---|
| Workflow file used | From the PR's head branch (the fork) | From the **base branch** (e.g. `main`) — the fork cannot alter it |
| Checkout target by default | The PR merge commit | The **base branch**, not the PR code (you must explicitly check out the PR ref if you want it) |
| Secrets access | No access for fork PRs | **Full access to repo secrets**, even for fork PRs |
| Token permissions | Restricted | Full `GITHUB_TOKEN` permissions as configured |

**Why this is dangerous**: `pull_request_target` exists so maintainers can run workflows that need secrets (e.g., to post a PR preview comment, or run a deploy-preview) even when triggered by an external contributor's fork PR — normally impossible under `pull_request`. But if a workflow using `pull_request_target` then **checks out and executes code from the fork's PR branch** (a very common mistake — e.g., `actions/checkout@v4` with `ref: ${{ github.event.pull_request.head.sha }}`, then running `npm install && npm test`), you have just executed **untrusted, attacker-controlled code** with **full access to your secrets**. This is a well-documented, real-world supply-chain attack pattern — a malicious PR author writes a `postinstall` script or test file that reads `secrets.AWS_KEY` and exfiltrates it to an external server, and your own workflow hands it over voluntarily.

```yaml
# DANGEROUS — do not do this
on:
  pull_request_target:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}  # checks out UNTRUSTED fork code
      - run: npm ci && npm test   # runs untrusted code, WITH access to secrets.*
```

**Safe patterns for `pull_request_target`:**
- Don't check out the fork's code at all — only interact with metadata (e.g., post a comment, label a PR) using `github.event.pull_request.*` fields, never executing anything from the fork.
- If you must build/test fork code, do it in a **separate `pull_request`-triggered workflow with no secrets**, and use `pull_request_target` only for a narrow, secret-requiring step that consumes the *build result* (an artifact) rather than raw source — combined with `workflow_run` (a trusted trigger that only fires after a workflow completes on the default branch's copy of the config) or manual review gates.
- If you do check out fork code under `pull_request_target`, treat it as fully hostile: never run install scripts, build steps, or arbitrary commands from it; only read specific files you need (e.g., a changelog fragment) via constrained means (`actions/github-script` reading file contents via the API, not executing them).
- Require maintainer approval before first-time contributors' workflows run at all (`Settings → Actions → Fork pull request workflows` — GitHub's built-in gate) as a first line of defense regardless of trigger type.

### `schedule` — cron-based
```yaml
on:
  schedule:
    - cron: '0 3 * * *'    # 03:00 UTC every day — standard 5-field cron syntax
    - cron: '*/15 * * * *' # every 15 minutes
```
Scheduled workflows only run from the **default branch's** workflow file, and GitHub may delay them under high load — don't rely on exact timing for anything time-critical.

### `workflow_dispatch` — manual trigger
```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        default: 'staging'
        type: choice
        options: [staging, production]
      debug:
        description: 'Enable debug logging'
        type: boolean
        default: false
```
Adds a "Run workflow" button in the GitHub UI (Actions tab), with a form built from `inputs:`. Access the values via `github.event.inputs.environment` or, in newer syntax, `inputs.environment` directly. Also invokable via API/CLI: `gh workflow run ci.yml -f environment=production`.

### `release` — runs on release events
```yaml
on:
  release:
    types: [published]   # also available: created, edited, deleted, prereleased, released
```

### `issue_comment` — runs when someone comments on an issue or PR
```yaml
on:
  issue_comment:
    types: [created]
```
Common use: chatops-style commands (`/deploy`, `/retest`) typed as PR comments. Note `issue_comment` fires for comments on **both issues and PRs** — check `github.event.issue.pull_request` to distinguish. Like `pull_request_target`, this trigger runs with the base repo's permissions/secrets regardless of who commented, so validate the commenter's permission level (`github.event.comment.author_association`) before acting on the command.

### Other common triggers
```yaml
on:
  workflow_call:        # makes this workflow callable by other workflows — see reusable-workflows-and-cicd-patterns.md
  workflow_run:         # runs after another named workflow completes (trusted chaining pattern)
    workflows: ["CI"]
    types: [completed]
  repository_dispatch:  # externally triggered via API (custom event from outside GitHub)
  merge_group:          # runs as part of GitHub's merge queue feature
```

---

## 2. `jobs:` Structure

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps: [...]

  test:
    runs-on: ubuntu-latest
    needs: lint              # test waits for lint to succeed before starting
    steps: [...]

  deploy:
    runs-on: ubuntu-latest
    needs: [lint, test]      # waits for BOTH to succeed
    if: github.ref == 'refs/heads/main'   # only deploy from main
    steps: [...]
```
Jobs run **in parallel by default** unless linked with `needs:`. Without `needs:`, `lint` and `test` above would start simultaneously on separate runners.

---

## 3. `steps:` Structure

```yaml
steps:
  - name: Human-readable label      # optional, shown in UI logs
    id: my_step                     # optional, lets later steps reference this step's outputs
    uses: actions/checkout@v4       # invoke a packaged action (mutually exclusive with `run:`)

  - name: Run a shell command
    run: echo "hello"               # execute directly in the runner's default shell
    shell: bash                     # override default shell (bash, pwsh, python, sh, cmd...)

  - name: Multi-line script
    run: |
      echo "line one"
      echo "line two"

  - name: Use output from a previous step
    run: echo "Previous step said: ${{ steps.my_step.outputs.result }}"

  - name: Conditional step
    if: success() && github.event_name == 'push'
    run: echo "only runs on push, if prior steps succeeded"

  - name: Continue even if this fails
    run: flaky-command
    continue-on-error: true

  - name: Timeout an individual step
    run: slow-command
    timeout-minutes: 5
```

---

## 4. `runs-on:` — Runner Selection

```yaml
runs-on: ubuntu-latest    # GitHub-hosted runner
runs-on: windows-latest
runs-on: macos-latest
runs-on: [self-hosted, linux, x64, gpu]   # self-hosted runner, matched by labels
```

| GitHub-hosted OS options | Notes |
|---|---|
| `ubuntu-latest` (and pinned `ubuntu-22.04`, `ubuntu-24.04`, etc.) | Cheapest, fastest to provision, most common choice |
| `windows-latest` (`windows-2022`, ...) | For .NET/Windows-specific builds |
| `macos-latest` (`macos-14`, ...) | For iOS/macOS builds — significantly more expensive in Actions minutes |

GitHub-hosted runners are ephemeral VMs: fresh for every job, pre-installed with a large toolset (common language runtimes, Docker, common CLIs), destroyed afterward — no state persists between runs (which is exactly why caching and artifacts matter; see [matrix-builds-and-caching.md](matrix-builds-and-caching.md)). Self-hosted runners are covered in [reusable-workflows-and-cicd-patterns.md](reusable-workflows-and-cicd-patterns.md).

---

## 5. `needs:` — Job Dependencies

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      artifact-name: ${{ steps.build-step.outputs.name }}   # expose a job output
    steps:
      - id: build-step
        run: echo "name=app-v1" >> "$GITHUB_OUTPUT"

  deploy:
    runs-on: ubuntu-latest
    needs: build                       # won't start until `build` finishes successfully
    steps:
      - run: echo "Deploying ${{ needs.build.outputs.artifact-name }}"
```
If a job listed in `needs:` fails, dependent jobs are **skipped by default** (not run, not failed — skipped). Override with `if: always()` or `if: failure()` on the dependent job if you need cleanup/notification jobs to run regardless of upstream success.

---

## 6. `if:` Conditionals

```yaml
# Job-level
jobs:
  deploy:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps: [...]

# Step-level
steps:
  - name: Notify on failure only
    if: failure()
    run: echo "send alert"

  - name: Always run cleanup
    if: always()
    run: echo "cleanup"

  - name: Only for a specific matrix value
    if: matrix.os == 'ubuntu-latest'
    run: echo "linux-only step"
```

| Status-check function | Meaning |
|---|---|
| `success()` | Default — no failed/canceled steps so far in this job |
| `always()` | Runs regardless of prior step outcomes (including cancellation) |
| `failure()` | At least one prior step failed |
| `cancelled()` | Workflow run was cancelled |

Note: `if:` expressions are evaluated **without** the `${{ }}` wrapper when they're the entire value of `if:` (GitHub implicitly wraps it) — but `${{ }}` is required when embedding an expression inside a larger string (e.g., in a `run:` command).

---

## 7. Contexts — `github.*`, `env.*`, `secrets.*`, `matrix.*`

Contexts are objects you read via `${{ context.field }}` expressions, available in different scopes depending on the context.

| Context | Common fields | Availability |
|---|---|---|
| `github` | `github.sha`, `github.ref`, `github.actor`, `github.event_name`, `github.event.pull_request.number`, `github.repository` | Everywhere |
| `env` | Custom vars set via `env:` blocks (workflow/job/step level) | Everywhere, scoped by where `env:` was defined |
| `secrets` | `secrets.MY_SECRET`, `secrets.GITHUB_TOKEN` | Everywhere, but a fork PR's `pull_request` run gets empty values for repo secrets |
| `matrix` | Whatever keys your `strategy.matrix` defines, e.g. `matrix.node-version` | Only inside a job using `strategy: matrix:` |
| `steps` | `steps.<step-id>.outputs.<name>`, `steps.<step-id>.outcome` | Within the same job, after the step has run |
| `needs` | `needs.<job-id>.outputs.<name>`, `needs.<job-id>.result` | Within a job that declares `needs:` on that job |
| `job` | `job.status` | Within the current job |
| `runner` | `runner.os`, `runner.temp`, `runner.arch` | Everywhere |

```yaml
env:
  NODE_ENV: production          # workflow-level env, available to all jobs

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      BUILD_TARGET: release     # job-level env, available to all steps in this job
    steps:
      - name: Use contexts
        env:
          STEP_SPECIFIC: value  # step-level env, only this step
        run: |
          echo "Commit: ${{ github.sha }}"
          echo "Actor: ${{ github.actor }}"
          echo "Node env: $NODE_ENV"             # shell reads env vars directly, no ${{ }}
          echo "Build target: $BUILD_TARGET"
          echo "Is main branch: ${{ github.ref == 'refs/heads/main' }}"
```
Important distinction: inside `run:` shell scripts, environment variables are read with normal shell syntax (`$NODE_ENV`), **not** `${{ env.NODE_ENV }}` — the `${{ }}` form is evaluated by GitHub Actions *before* the shell even runs, which matters for injection safety (see [secrets-and-security.md](secrets-and-security.md) for why interpolating untrusted `github.event.*` values directly into `run:` via `${{ }}` is a script-injection risk).

---

## 8. Expressions and Functions

```yaml
${{ github.event_name == 'push' }}                     # comparison
${{ contains(github.event.head_commit.message, 'skip-ci') }}
${{ startsWith(github.ref, 'refs/tags/') }}
${{ endsWith(matrix.os, 'windows-latest') }}
${{ format('Hello {0}, build {1}', github.actor, github.run_number) }}
${{ join(fromJSON('["a","b","c"]'), ', ') }}
${{ toJSON(github.event) }}                             # useful for debugging — dump full event payload
${{ fromJSON(steps.parse.outputs.json).someKey }}       # parse a JSON string output
```

| Function | Purpose |
|---|---|
| `contains(a, b)` | true if `a` contains `b` |
| `startsWith(s, prefix)` / `endsWith(s, suffix)` | string prefix/suffix check |
| `format(fmt, ...)` | `{0}`-style string templating |
| `join(array, sep)` | joins array elements |
| `toJSON(x)` / `fromJSON(x)` | serialize/parse JSON — commonly used to pass structured data through step outputs |
| `success()` / `failure()` / `always()` / `cancelled()` | job/step status checks |
| `hashFiles(path, ...)` | hash of matched files — the basis of cache keys (see [matrix-builds-and-caching.md](matrix-builds-and-caching.md)) |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
