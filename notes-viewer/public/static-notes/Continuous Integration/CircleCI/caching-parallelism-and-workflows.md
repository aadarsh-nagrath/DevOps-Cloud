# Caching, Parallelism & Workflow Patterns

CircleCI-specific caching mechanics, test splitting across parallel containers, fan-out/fan-in workflow patterns, and manual approval gates. See [CI Fundamentals §6](../ci-fundamentals.md) for why caching matters in general — this file covers CircleCI's exact `save_cache`/`restore_cache` steps.

---

## 1. Caching Deep Dive — `save_cache` / `restore_cache`

### Basic pattern
```yaml
jobs:
  test:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - restore_cache:
          keys:
            - deps-v1-{{ checksum "package-lock.json" }}   # exact match: only hits if the lockfile is byte-identical to a previous run
      - run: npm ci
      - save_cache:
          key: deps-v1-{{ checksum "package-lock.json" }}
          paths:
            - node_modules
      - run: npm test
```

- **`{{ checksum "package-lock.json" }}`** — a template function that computes a hash of the file's contents. This is the exact mechanism behind [CI Fundamentals §6](../ci-fundamentals.md)'s "key on a lockfile hash, not a timestamp" rule — CircleCI's implementation of it.
- If `package-lock.json` hasn't changed since the last run, the computed key is identical, `restore_cache` hits, and `npm ci` becomes nearly instant (it still runs, but finds everything already present).
- If the lockfile changed, the key changes, the cache misses, `npm ci` does a full install, and `save_cache` stores a *new* cache entry under the new key.

### Fallback key lists — partial cache hits
```yaml
steps:
  - restore_cache:
      keys:
        - deps-v1-{{ checksum "package-lock.json" }}   # 1st choice: exact match for this exact lockfile
        - deps-v1-                                       # 2nd choice: ANY cache with this prefix, even from a different lockfile version
  - run: npm ci
  - save_cache:
      key: deps-v1-{{ checksum "package-lock.json" }}
      paths:
        - node_modules
```
CircleCI tries each key in order and uses the **first one that has a match**, matching by prefix when the key doesn't end in an exact hash. Why this is useful: if the lockfile changed slightly (one new dependency added), an exact-match cache miss would otherwise force a fully-from-scratch install. With a fallback key, `npm ci` still runs (correctness isn't compromised — `npm ci` always installs to match the lockfile exactly) but it starts from a "close enough" `node_modules` already on disk, which is significantly faster than starting from nothing, since most packages are already present and only the delta needs downloading.

### Multi-part cache keys — common real pattern
```yaml
steps:
  - restore_cache:
      keys:
        - deps-v1-{{ .Branch }}-{{ checksum "package-lock.json" }}   # scoped per-branch AND per-lockfile-hash
        - deps-v1-{{ .Branch }}-                                       # fallback: any cache on this branch
        - deps-v1-                                                     # fallback: any cache at all
```
`{{ .Branch }}` and `{{ checksum "..." }}` are the two most common template variables; others include `{{ .Revision }}` (commit SHA) and `{{ .Environment.VAR_NAME }}`.

---

## 2. Test Splitting & Parallelism

### `parallelism:` — running one job across N containers
```yaml
jobs:
  test:
    docker:
      - image: cimg/node:20.11
    parallelism: 4              # spins up 4 identical containers running this same job definition
    steps:
      - checkout
      - run: npm ci
      - run:
          name: Run tests (this container's share only)
          command: |
            TESTFILES=$(circleci tests glob "test/**/*.spec.js" | circleci tests split --split-by=timings)
            npx jest $TESTFILES
      - store_test_results:
          path: test-results/
```

**Why this is powerful**: a test suite that takes 40 minutes to run sequentially, split across `parallelism: 4`, can finish in roughly 10 minutes — because the four containers run *simultaneously*, each executing only its assigned quarter of the tests. This isn't the same as a matrix build (which runs the *same full suite* under different configurations) — parallelism splits *one* suite's individual test files across N containers so each container does less work, not the same work N times.

### How `circleci tests split` decides what goes where

| `--split-by` mode | Behavior |
|---|---|
| `--split-by=timings` (recommended) | Uses historical timing data (from previous `store_test_results` runs) to balance containers by *actual execution time*, not just file count — avoids one container getting all the slow tests while others sit idle |
| `--split-by=filesize` | Balances by file size — a rough proxy when no timing data exists yet (e.g., first run) |
| `--split-by=name` (default) | Splits alphabetically/by name — simplest, but can badly imbalance load if some tests are much slower than others |

`circleci tests split` needs `store_test_results` wired up from previous runs to build a timing history — on the very first run (no history yet), it falls back to a naive split until enough data accumulates.

### Worked example — before and after
```
Without parallelism: 1 container runs all 400 test files sequentially -> 32 minutes total

With parallelism: 4:
  Container 1: ~100 files (balanced by timing, not raw count) -> ~8 minutes
  Container 2: ~100 files                                      -> ~8 minutes
  Container 3: ~100 files                                      -> ~8 minutes
  Container 4: ~100 files                                      -> ~8 minutes
  (all 4 run concurrently) -> ~8-9 minutes total, ~4x faster
```
Cost note: `parallelism: 4` consumes 4x the compute-minutes of credits for that job (4 containers running concurrently), even though wall-clock time drops — it trades cost for speed, same tradeoff as `resource_class` sizing in [executors-and-environments.md](executors-and-environments.md).

---

## 3. Workflow Fan-Out / Fan-In Patterns

### Fan-out — one trigger, multiple parallel jobs
```yaml
workflows:
  test-matrix:
    jobs:
      - lint
      - unit-tests
      - integration-tests
      - security-scan
      # all four jobs above have no `requires:` between each other -> they all start immediately and run in parallel
```

### Fan-in — multiple jobs converge into one gate
```yaml
workflows:
  test-then-build:
    jobs:
      - lint
      - unit-tests
      - integration-tests
      - security-scan
      - build:
          requires:                # build waits for ALL FOUR to succeed before starting — this is fan-in
            - lint
            - unit-tests
            - integration-tests
            - security-scan
```

### Combined fan-out then fan-in — a realistic full shape
```yaml
workflows:
  full-pipeline:
    jobs:
      - lint                                  # fan-out: 3 independent jobs start together
      - unit-tests
      - integration-tests

      - build:
          requires:                            # fan-in: build waits for all 3
            - lint
            - unit-tests
            - integration-tests

      - deploy-staging:                        # fan-out again: 2 deploy targets run in parallel after build
          requires:
            - build
      - deploy-canary:
          requires:
            - build

      - notify-complete:
          requires:                            # final fan-in: wait for both deploy targets
            - deploy-staging
            - deploy-canary
```
```
        lint ─┐
  unit-tests ─┼─> build ─┬─> deploy-staging ─┐
integ-tests ──┘          └─> deploy-canary ──┴─> notify-complete
```
This is the same underlying DAG concept as any CI tool's job dependency graph — CircleCI's `requires:` list is simply how you draw the edges.

---

## 4. Manual Approval Jobs — `type: approval`

A `type: approval` job pauses the workflow at that point until a human clicks "Approve" in the CircleCI UI — the direct equivalent of GitHub Actions' environment protection rules requiring a reviewer.

```yaml
workflows:
  deploy-pipeline:
    jobs:
      - build
      - test:
          requires:
            - build
      - hold-for-approval:              # a special pseudo-job, not a real job defined under `jobs:`
          type: approval                 # this is what makes it a manual gate instead of running code
          requires:
            - test
      - deploy-production:
          requires:
            - hold-for-approval           # only proceeds after a human approves hold-for-approval in the UI
          filters:
            branches:
              only: main
```

Key characteristics:
- `hold-for-approval` needs no corresponding entry under `jobs:` — `type: approval` is a built-in pseudo-job type, not something you define steps for.
- The workflow **pauses indefinitely** at that point — no timeout by default — until someone with sufficient permissions on the project clicks Approve (or the workflow is canceled).
- Multiple approval gates can exist in one workflow (e.g., approve-staging, then later approve-production).
- This is the standard pattern for gating production deploys — see the full worked example combining this with everything else in [contexts-security-and-cicd-patterns.md](contexts-security-and-cicd-patterns.md).

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
