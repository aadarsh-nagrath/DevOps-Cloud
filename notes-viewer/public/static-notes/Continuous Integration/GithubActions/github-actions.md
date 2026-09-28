# GitHub Actions

GitHub-native CI/CD — no separate server to install or maintain, workflows live in your repo and run on GitHub's infrastructure (or your own). This file is the entry point for the folder; see [CI Fundamentals](../ci-fundamentals.md) for concepts that apply across every CI tool (triggers, matrices, caching, secrets, artifacts, branch protection) — this folder goes deeper on GitHub-Actions-specific mechanics only.

---

## 1. What GitHub Actions Actually Is

GitHub Actions is CI/CD **built into GitHub itself**. This is the single biggest structural difference from a tool like [Jenkins](../Jenkins/jenkins.md):

| | Jenkins | GitHub Actions |
|---|---|---|
| Server | You install, host, and patch a Jenkins server (master + agents) yourself | No server to run — GitHub hosts the control plane; you only choose where jobs *execute* (GitHub-hosted or self-hosted runners) |
| Config location | `Jenkinsfile` in repo, but pipeline logic/plugins configured on the Jenkins server UI | Entirely as YAML files in the repo, `.github/workflows/*.yml` — fully "pipeline as code" from day one |
| Extensibility | Plugins (installed/managed on the server) | Actions (reusable units pulled from the Marketplace or your own repo, referenced per-workflow — no server-wide install step) |
| Trigger source | Webhooks configured to talk to an external Jenkins server | Native — GitHub events (push, PR, issue, release, etc.) trigger workflows directly, no webhook plumbing needed |
| Where it runs | Your own infrastructure (agents you provision and maintain) | GitHub-hosted VMs by default (ephemeral, auto-provisioned, auto-patched), or self-hosted runners if you need them |

The practical upshot: with GitHub Actions there is nothing to "stand up" — you write a YAML file, commit it, push, and it runs. There's no master node to secure, no agent fleet to patch, no plugin compatibility matrix to manage. The tradeoff is less control over the execution environment's lifecycle (though self-hosted runners claw that back — see [reusable-workflows-and-cicd-patterns.md](reusable-workflows-and-cicd-patterns.md)).

---

## 2. Core Concepts Glossary

| Term | Meaning |
|---|---|
| **Workflow** | The top-level automated process, defined by one YAML file. A repo can have many workflows (e.g., `ci.yml`, `release.yml`, `nightly-scan.yml`), each independently triggered. |
| **Event** | The thing that triggers a workflow to run — `push`, `pull_request`, `schedule`, `workflow_dispatch`, `release`, etc. |
| **Job** | A group of steps that run on the same runner. Jobs run in **parallel by default**; use `needs:` to sequence them. |
| **Step** | A single task within a job — either a shell command (`run:`) or an invocation of an **action** (`uses:`). Steps in a job run sequentially, in order, on the same machine, sharing filesystem state. |
| **Action** | A reusable, packaged unit of automation (JavaScript action, Docker container action, or composite action) — the thing you invoke with `uses:`. See [actions-and-marketplace.md](actions-and-marketplace.md). |
| **Runner** | The machine (VM or container) that actually executes a job's steps. GitHub-hosted (`ubuntu-latest`, `windows-latest`, `macos-latest`) or self-hosted. |
| **Artifact** | A file/directory produced by a job that persists after the job finishes, downloadable or passable to another job. See [matrix-builds-and-caching.md](matrix-builds-and-caching.md). |
| **Context** | Objects exposing information at runtime — `github.*`, `env.*`, `secrets.*`, `matrix.*`, `steps.*`, etc. See [workflow-syntax-and-triggers.md](workflow-syntax-and-triggers.md). |

---

## 3. Where Workflow Files Live

Every workflow is a YAML file inside `.github/workflows/` at the repository root:

```
your-repo/
├── .github/
│   └── workflows/
│       ├── ci.yml              # e.g. runs on every push/PR
│       ├── release.yml         # e.g. runs on tag push
│       └── nightly-security.yml # e.g. runs on a cron schedule
├── src/
└── ...
```

GitHub auto-discovers **every** `.yml`/`.yaml` file in that directory — there's no central registry or manifest to update. Add a file, commit, push, and it's live. Delete or rename the file to retire the workflow. Filenames don't matter functionally (they're just labels shown in the Actions UI); `name:` inside the file is what's displayed prominently.

---

## 4. A First Complete Minimal Workflow

The smallest useful workflow: run tests on every push. Fully annotated:

```yaml
# .github/workflows/ci.yml

name: CI   # Shown in the GitHub Actions UI tab; purely cosmetic

on: push    # Trigger: run this workflow on every push to any branch
            # (see workflow-syntax-and-triggers.md for narrowing this to
            # specific branches, PRs, schedules, etc.)

jobs:                       # A workflow is made of one or more jobs
  test:                     # Arbitrary job ID — used internally (e.g. by `needs:`)
    runs-on: ubuntu-latest  # Which runner executes this job's steps

    steps:                              # Steps run in order, top to bottom
      - name: Checkout code             # Human-readable label (optional but recommended)
        uses: actions/checkout@v4       # Marketplace action: clones the repo onto the runner
                                         # Without this step, the runner has NO copy of your code

      - name: Set up Node.js
        uses: actions/setup-node@v4     # Marketplace action: installs Node and adds it to PATH
        with:                           # `with:` passes inputs to the action
          node-version: '20'

      - name: Install dependencies
        run: npm ci                     # `run:` executes a shell command directly on the runner
                                         # npm ci = clean, reproducible install from package-lock.json

      - name: Run tests
        run: npm test
```

Walking through what happens on a push:
1. GitHub sees the push event, matches it against `on: push`, and schedules the `test` job.
2. GitHub provisions a fresh `ubuntu-latest` VM (ephemeral — destroyed after the job finishes).
3. Steps run top to bottom on that VM: checkout, then Node setup, then `npm ci`, then `npm test`.
4. If any step exits non-zero, the job is marked failed and remaining steps in that job are skipped (unless `continue-on-error` or `if:` says otherwise — see [workflow-syntax-and-triggers.md](workflow-syntax-and-triggers.md)).
5. Result (pass/fail) shows up as a status check on the commit/PR — pair this with branch protection rules (see [CI Fundamentals §9](../ci-fundamentals.md)) so failing CI blocks merges.

---

## 5. Contents of This Folder

| File | Covers |
|---|---|
| [workflow-syntax-and-triggers.md](workflow-syntax-and-triggers.md) | Full `on:`/`jobs:`/`steps:` syntax reference, all trigger types, `pull_request_target` security, `runs-on:`, `needs:`, `if:`, contexts and expressions |
| [actions-and-marketplace.md](actions-and-marketplace.md) | What an Action is (JS/Docker/composite), using marketplace actions, pinning by SHA vs tag, writing your own composite and JS actions |
| [matrix-builds-and-caching.md](matrix-builds-and-caching.md) | `strategy.matrix` deep dive, `actions/cache` patterns, artifact upload/download between jobs |
| [secrets-and-security.md](secrets-and-security.md) | Secrets scoping (repo/environment/org), `GITHUB_TOKEN` and `permissions:`, OIDC for cloud deploys, Dependabot, CodeQL, environment protection rules |
| [reusable-workflows-and-cicd-patterns.md](reusable-workflows-and-cicd-patterns.md) | `workflow_call` reusable workflows vs composite actions, a full end-to-end CI/CD pipeline example, self-hosted runners, monorepo path filters |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
