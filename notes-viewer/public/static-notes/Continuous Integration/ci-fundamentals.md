# Continuous Integration — Fundamentals

Core CI concepts that apply across every tool (Jenkins, GitHub Actions, CircleCI, GitLab CI, etc.) — this is the entry point for the Continuous Integration folder. Tool-specific deep dives are linked at the bottom.

---

## 1. What CI Actually Means

**Continuous Integration** is the practice of merging code changes into a shared branch *frequently* (multiple times a day, not once a week), with every merge automatically built and tested. The goal is to catch integration problems (two developers' changes conflicting, a change breaking existing tests) within minutes of them happening, not weeks later when a "big bang" merge happens.

```
Without CI:
  Dev A works on a branch for 3 weeks -----------------------------> merges, BREAKS everything
  Dev B works on a branch for 3 weeks -----------------------------> merges, conflicts with Dev A
  (This is "integration hell" — long-lived branches, painful merges, delayed feedback)

With CI:
  Dev A commits -> build+test (2 min) -> merged        Dev B commits -> build+test (2 min) -> merged
  Dev A commits -> build+test (2 min) -> merged        Dev B commits -> build+test (2 min) -> merged
  (Small, frequent changes; broken builds are caught and fixed within minutes, not weeks)
```

The core promise of CI: **the main branch should always be in a working, deployable state.** A red (failing) build is treated as an emergency to fix immediately, not something to work around.

---

## 2. CI vs CD — Three Related but Distinct Terms

| Term | Meaning |
|---|---|
| **Continuous Integration (CI)** | Automatically build and test every code change as it's merged |
| **Continuous Delivery (CD)** | Every change that passes CI is automatically prepared for release (build artifacts, staging deploys) — but a human still approves the actual production release |
| **Continuous Deployment (CD)** | Every change that passes CI is automatically deployed straight to production, no human gate at all |

The distinction between the two CDs is entirely about **whether a human approval gate exists before production**. Both build on top of CI — you cannot have reliable CD without reliable CI underneath it, since CD is trusting that "passed CI" actually means "safe to ship."

---

## 3. The Anatomy of a CI Pipeline

Nearly every CI tool models a pipeline the same way, just with different YAML syntax:

```
Trigger (push, PR, schedule, manual)
   |
   v
Checkout code
   |
   v
[Stage: Build]     -- compile, install dependencies, produce a build artifact
   |
   v
[Stage: Test]       -- unit tests, integration tests, linting, static analysis
   |
   v
[Stage: Package]    -- build a Docker image, a zip/tarball, a binary
   |
   v
[Stage: Publish]    -- push the artifact to a registry/artifact store
   |
   v
(CD picks up from here: deploy to staging/production)
```

### Core vocabulary (same concepts, different names per tool)
| Concept | Jenkins | GitHub Actions | CircleCI |
|---|---|---|---|
| The whole automated process | Pipeline | Workflow | Workflow |
| A logical grouping of steps | Stage | Job | Job |
| An individual command/action | Step | Step | Step |
| The machine running the job | Agent/Node | Runner | Executor |
| The config file | `Jenkinsfile` | `.github/workflows/*.yml` | `.circleci/config.yml` |

---

## 4. Triggers — What Starts a Pipeline

- **Push-triggered**: runs on every push to a branch (or specific branches, e.g., only `main` and `develop`).
- **Pull/Merge Request-triggered**: runs when a PR is opened or updated — critical for catching problems *before* merge, not after.
- **Scheduled (cron)**: nightly builds, periodic dependency-update checks, recurring security scans.
- **Manual**: a human explicitly clicks "run" — common for deployments or expensive/slow test suites you don't want on every single commit.
- **Tag-triggered**: runs specifically when a version tag (e.g., `v1.2.0`) is pushed — a common release pipeline pattern.

**Best practice**: run fast checks (linting, unit tests) on every push/PR; reserve slow/expensive stages (full integration suites, deployments) for merges to main or explicit triggers, so contributors get fast feedback without waiting on everything.

---

## 5. Build Matrices — Testing Across Multiple Configurations

A matrix build runs the same job across a combination of variables (language versions, OS, dependency versions) in parallel, rather than writing out each combination by hand.

```yaml
# Conceptual — exact syntax varies by tool, but the idea is universal
matrix:
  os: [ubuntu-latest, macos-latest, windows-latest]
  node-version: [18, 20, 22]
# This automatically generates 3 x 3 = 9 parallel jobs, one per combination
```
**Why it matters**: a library that needs to work on Node 18/20/22 across Linux/macOS/Windows would otherwise require 9 hand-written, duplicated job definitions — a matrix generates all 9 from one concise definition, and they run in parallel, not sequentially, so total pipeline time doesn't multiply by 9.

---

## 6. Caching — Making CI Fast

Without caching, every single pipeline run reinstalls every dependency from scratch — for a large project, this can dominate total build time.

```
Without caching: install deps (3 min) + build (1 min) + test (1 min) = 5 min every single run
With caching:    restore cached deps (10s) + build (1 min) + test (1 min) = ~2 min every run
```
Caching works by storing a directory (e.g., `node_modules`, `~/.m2`, `~/.cargo/registry`) keyed by something that changes only when dependencies actually change (typically a hash of the lockfile — `package-lock.json`, `poetry.lock`, `Cargo.lock`). If the lockfile hasn't changed, the cache hits and installation is skipped entirely; if it has, the cache misses and a fresh install runs (and gets cached again for next time).

**Common mistake**: caching keyed on something that changes every run (like a timestamp or commit SHA) never actually hits — always key on the lockfile hash or an equivalent stable identifier.

---

## 7. Secrets Management in CI

CI pipelines routinely need credentials (cloud provider keys, registry tokens, API keys) — handling these incorrectly is one of the most common sources of real security incidents in CI/CD.

### The rules that matter everywhere, regardless of tool
- **Never hardcode secrets in the pipeline config file** — config files are committed to version control and often world-readable in open-source repos; a hardcoded secret is a leaked secret the moment it's committed, permanently (git history retains it even after a later "fix" commit).
- **Use the CI platform's built-in encrypted secrets store** (GitHub Actions Secrets, CircleCI Contexts/Project Environment Variables, Jenkins Credentials Plugin) — these are encrypted at rest and injected as environment variables at runtime only, not exposed in logs by default.
- **Be careful with secrets and forked-repo pull requests**: most platforms deliberately withhold secrets from PRs originating from forks (untrusted external contributors) by default — this is a security feature, not a bug, and working around it carelessly (e.g., via `pull_request_target` in GitHub Actions without understanding its implications) is a well-known way to leak secrets to a malicious PR.
- **Scope secrets as narrowly as possible** — a secret only one specific job needs shouldn't be available to every job in the pipeline; least privilege applies to CI credentials just as much as to production access.
- **Mask secrets in logs** — most platforms automatically redact known secret values from log output, but be careful with secrets that get transformed (base64-encoded, concatenated into a URL) before being printed, since transformed values often bypass automatic masking.

---

## 8. Artifacts — Passing Build Output Between Stages/Jobs

An artifact is a file (or set of files) produced by one job that another job (or a human) needs afterward — a compiled binary, a test report, a Docker image, coverage output.

```
[Build job]  produces  app-binary  --> uploaded as an artifact
                                          |
                                          v
[Deploy job]  downloads the app-binary artifact  -->  deploys it
```
Why this matters: jobs (especially in GitHub Actions/CircleCI) often run in **completely separate, ephemeral environments** — a deploy job cannot simply "see" files a build job created unless they were explicitly passed along as an artifact. Forgetting this is a common early mistake ("why can't my deploy step find the file my build step created?").

---

## 9. Status Checks & Branch Protection

Most teams configure their version control platform (GitHub, GitLab, Bitbucket) to **require CI to pass before a PR can be merged** — this is what actually enforces "main is always green," rather than just hoping people notice a red build and don't merge anyway.

```
PR opened -> CI runs automatically -> CI must show ✅ before the "Merge" button is even enabled
```
Combine this with requiring a minimum number of code review approvals for a real, enforced quality gate — CI catches what tests can catch (regressions, broken builds); human review catches what tests can't (design issues, unclear code, missed edge cases neither party thought to test for).

---

## 10. Fast Feedback — the Underlying Design Principle

Every CI best practice above is really in service of one core principle: **the faster a developer learns their change broke something, the cheaper it is to fix.** A failure caught in 2 minutes (while the change is still fresh in the developer's mind, before they've moved on to something else) is far cheaper to fix than one caught a day later, or worse, in production.

This is why: fast checks run on every push, slow checks are reserved for less frequent triggers; caching exists to keep pipelines fast; matrices run in parallel rather than sequentially; and status checks block merges rather than relying on people noticing failures after the fact.

---

## 11. CI and Deployment Strategies — How They Connect

CI is the foundation that makes safe deployment strategies possible in the first place — you cannot safely canary-release, blue-green deploy, or automate rollback decisions on code that hasn't been reliably built and tested first. See [Deployment Strategies](../Deployment/deployment-strategies.md) for what happens *after* a CI pipeline produces a trustworthy, tested artifact.

---

## 12. Tool-Specific Deep Dives in This Folder

| File | Covers |
|---|---|
| [Jenkins/jenkins.md](Jenkins/jenkins.md) | Self-hosted, plugin-based CI/CD — architecture, pipelines, Jenkinsfile, master-agent setup |
| [GithubActions/github-actions.md](GithubActions/github-actions.md) | GitHub-native CI/CD — workflows, jobs, actions marketplace, reusable workflows |
| [CircleCI/circleci.md](CircleCI/circleci.md) | Cloud-native CI/CD — orbs, executors, workflows, config-driven pipelines |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
