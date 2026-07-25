# CircleCI

Cloud-native, config-as-code CI/CD platform — vendor-neutral (works with GitHub, GitLab, and Bitbucket), built around a single `.circleci/config.yml` file per repo. This file is the entry point for the CircleCI notes in this folder; see [CI Fundamentals](../ci-fundamentals.md) for concepts that apply across every CI tool (triggers, matrices, caching, secrets, artifacts, branch protection) — this folder goes deeper on CircleCI-specific mechanics only.

---

## 1. What CircleCI Is

CircleCI is a CI/CD platform where **every pipeline is defined as YAML config committed to the repo** (`.circleci/config.yml`) — there is no separate "configure jobs by clicking around a UI" mode the way classic Jenkins freestyle jobs work. This means:

- **Config-as-code from day one.** Unlike Jenkins (which started as UI-configured jobs and only later grew Pipeline/Jenkinsfile support), CircleCI never had a non-code mode — every project is pipeline-as-code from the start.
- **No plugin-management burden.** Jenkins gets its extensibility from installing and maintaining plugins on the server itself (versions, compatibility, security patches — all your responsibility as the operator). CircleCI gets equivalent extensibility from **orbs** (see [orbs-and-reusability.md](orbs-and-reusability.md)) — reusable packages referenced by name+version in config, with no server-side installation or maintenance at all.
- **Managed compute by default.** In the common "CircleCI Cloud" mode, you don't run or patch the CI server — CircleCI provides and scales the machines (executors) that run your jobs.

---

## 2. Cloud-Hosted vs Self-Hosted (CircleCI Server)

| | CircleCI Cloud | CircleCI Server (self-hosted) |
|---|---|---|
| Where it runs | CircleCI's own infrastructure | Your infrastructure (on-prem or your cloud account) |
| Who patches/scales it | CircleCI | You (like operating Jenkins yourself) |
| Typical use case | Most teams — no infra to run | Regulated industries, air-gapped networks, data residency requirements |
| Execution | CircleCI-managed executors, or **self-hosted runners** for the job-execution layer only (see [contexts-security-and-cicd-patterns.md](contexts-security-and-cicd-patterns.md)) | Fully on your infrastructure end-to-end |
| Config format | Same `.circleci/config.yml` | Same `.circleci/config.yml` |

The important distinction: even on CircleCI Cloud, you can mix in **self-hosted runners** for individual jobs that need to execute inside your own network (e.g., to reach an internal database) while everything else (scheduling, UI, orchestration) stays on CircleCI's managed control plane. Full self-hosted Server is a much heavier commitment — the entire control plane runs on your infrastructure, closer to what running Jenkins yourself entails.

---

## 3. CircleCI vs Jenkins vs GitHub Actions — Concept Mapping

| Concept | Jenkins | GitHub Actions | CircleCI |
|---|---|---|---|
| Config file | `Jenkinsfile` (Groovy DSL) | `.github/workflows/*.yml` | `.circleci/config.yml` |
| Config-as-code from day one? | No — bolted on later (Pipeline plugin) | Yes | Yes |
| Whole automated process | Pipeline | Workflow | **Pipeline** (top level) containing **Workflows** |
| Logical grouping of steps | Stage | Job | Job |
| Individual command | Step | Step | Step |
| Machine that runs it | Agent/Node | Runner | **Executor** |
| Reusable extension | Plugin (installed on server) | Action (from Marketplace) | **Orb** (referenced in config, no install) |
| Platform coupling | None — any VCS | GitHub only | **None — GitHub, GitLab, Bitbucket** |
| Job dependency syntax | `stage` ordering / `parallel` | `needs:` | `requires:` |
| Manual approval gate | Input step / manual stage | Environment protection rules | `type: approval` job |
| Secrets scoping | Credentials store (global/folder) | Repo/Org/Environment secrets | Project env vars / **Contexts** |

**vs Jenkins**: CircleCI trades Jenkins's plugin ecosystem and full self-hosting flexibility for zero server maintenance and mandatory config-as-code — you never manage a plugin compatibility matrix.

**vs GitHub Actions**: the biggest structural difference is that CircleCI is **vendor-neutral** — the exact same `.circleci/config.yml` mechanics work whether your code lives on GitHub, GitLab, or Bitbucket. GitHub Actions is tied to GitHub. CircleCI also has an explicit **Pipeline → Workflows → Jobs** hierarchy (a pipeline can run multiple workflows), where GitHub Actions treats each workflow file more independently.

---

## 4. Core Concepts Glossary

| Term | Meaning |
|---|---|
| **Pipeline** | The top-level unit — everything triggered by one event (a push, a scheduled trigger, a manual API trigger). A pipeline is composed of one or more workflows. |
| **Workflow** | Orchestrates a set of jobs — defines their order, dependencies (`requires:`), and conditional execution (`filters:`). Defined under the `workflows:` key. |
| **Job** | A collection of steps that run in a single executor instance — e.g., "test", "build", "deploy". Defined under `jobs:`. |
| **Step** | A single command or action within a job — e.g., `checkout`, `run: npm test`, or invoking an orb command. |
| **Executor** | The environment type a job runs in — `docker`, `machine`, `macos`, or `windows`. See [executors-and-environments.md](executors-and-environments.md). |
| **Orb** | A versioned, shareable package of reusable config (commands + jobs + executors bundled together). See [orbs-and-reusability.md](orbs-and-reusability.md). |
| **Context** | A named group of environment variables shared across projects, with access control. See [contexts-security-and-cicd-patterns.md](contexts-security-and-cicd-patterns.md). |

```
Pipeline (one push to GitHub)
  └─ Workflow: build-and-test
       ├─ Job: lint        (runs in a docker executor)
       ├─ Job: test         (runs in a docker executor, requires: lint)
       └─ Job: deploy       (requires: test, gated by a manual approval job)
            └─ Step: checkout
            └─ Step: run "npm run deploy"
```

---

## 5. Where Config Lives

Every CircleCI project reads exactly one file: **`.circleci/config.yml`**, at the repo root (the `.circleci` directory, not a hidden dotfile itself). CircleCI must be connected to the VCS project (via the CircleCI web UI or API) and that project must be "followed" before pushes trigger pipelines — simply having the file in the repo isn't enough on its own the first time.

```
my-repo/
├── .circleci/
│   └── config.yml     # the only file CircleCI reads
├── src/
├── package.json
└── ...
```

---

## 6. A First Complete Minimal Example

A fully annotated, working build-and-test config for a Node.js project:

```yaml
# .circleci/config.yml

version: 2.1   # always use 2.1 — unlocks orbs, pipeline parameters, and reusable commands (see config-syntax-and-pipelines.md)

jobs:                       # define the units of work
  build-and-test:           # job name — referenced later in the workflow
    docker:                                    # executor type: docker (see executors-and-environments.md)
      - image: cimg/node:20.11                 # CircleCI's official "convenience image" for Node
    steps:
      - checkout                                # built-in step: clones the repo into the job's working directory
      - run:
          name: Install dependencies             # human-readable label shown in the CircleCI UI
          command: npm ci                        # npm ci = clean, reproducible install from package-lock.json
      - run:
          name: Run tests
          command: npm test

workflows:                  # orchestrate jobs — even a single job needs a workflow to run automatically
  build-and-test-workflow:  # workflow name
    jobs:
      - build-and-test      # runs the job defined above on every push (default trigger)
```

What happens on a push:
1. CircleCI detects the push (via the connected GitHub/GitLab/Bitbucket webhook).
2. A **pipeline** starts, reads `.circleci/config.yml`.
3. The `build-and-test-workflow` workflow runs its one job, `build-and-test`.
4. That job spins up a fresh `cimg/node:20.11` Docker container, checks out the code, installs deps, runs tests.
5. Pass/fail is reported back to the VCS as a status check (see [CI Fundamentals §9](../ci-fundamentals.md) for why this matters for branch protection).

---

## 7. Contents of This Folder

| File | Covers |
|---|---|
| [config-syntax-and-pipelines.md](config-syntax-and-pipelines.md) | Full YAML syntax reference — `jobs`, `steps`, built-in steps, `workflows`, `requires`, `filters`, triggers, pipeline parameters, conditional `when`/`unless` config |
| [executors-and-environments.md](executors-and-environments.md) | `docker` / `machine` / `macos` / `windows` executors, resource classes, Docker-in-Docker, custom vs convenience images |
| [orbs-and-reusability.md](orbs-and-reusability.md) | What orbs are, using popular orbs, version pinning, writing reusable commands, YAML anchors |
| [caching-parallelism-and-workflows.md](caching-parallelism-and-workflows.md) | `save_cache`/`restore_cache` deep dive, test splitting/parallelism, fan-out/fan-in workflows, manual approval jobs |
| [contexts-security-and-cicd-patterns.md](contexts-security-and-cicd-patterns.md) | Contexts, env var precedence, branch-restricted contexts, a full end-to-end pipeline example, self-hosted runners |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
