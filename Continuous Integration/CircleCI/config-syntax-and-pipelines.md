# Config Syntax & Pipelines

Full reference for `.circleci/config.yml` syntax — versioning, jobs, steps, workflows, job orchestration, triggers, and pipeline-level parameters. See [circleci.md](circleci.md) for the glossary (pipeline/workflow/job/step) if any of these terms are unfamiliar.

---

## 1. `version:` — Why 2.1 Matters

```yaml
version: 2.1
```

Every config file starts with a version declaration. In practice **always use `2.1`** — it is the version that unlocks:
- **Orbs** (`orbs:` key — see [orbs-and-reusability.md](orbs-and-reusability.md))
- **Reusable `commands:`** (custom named steps you define once, use in multiple jobs)
- **Pipeline parameters** (`parameters:` at the top level, for dynamic/conditional config)
- **`executors:`** as a top-level, reusable, named block

Version `2.0` still works for legacy configs but lacks all of the above — there is no reason to write a new config against `2.0`.

---

## 2. `jobs:` — Defining Units of Work

```yaml
version: 2.1

jobs:
  lint:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - run: npm ci
      - run: npm run lint

  test:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - run: npm ci
      - run: npm test
```

Each job:
- Has a name (`lint`, `test`) used to reference it from `workflows:`.
- Declares an **executor** (`docker:`, `machine:`, `macos:`, `windows:` — see [executors-and-environments.md](executors-and-environments.md)).
- Runs in a **fresh, isolated environment every time** — nothing persists between jobs unless explicitly cached or passed as a workspace/artifact.

---

## 3. `steps:` and Built-in Steps

Steps run sequentially within a job. CircleCI ships several built-in steps beyond plain `run:`.

### `checkout`
```yaml
steps:
  - checkout   # clones the repo at the triggering commit into the job's working directory
```
Without this, the job's container starts with no source code at all — it's not implicit the way it can feel in other CI tools.

### `run`
```yaml
steps:
  - run: npm test                     # shorthand form — command only

  - run:                              # full form — adjust behavior
      name: Run integration tests      # label shown in the UI (defaults to the command text if omitted)
      command: npm run test:integration
      working_directory: ./server      # run from a subdirectory
      environment:                     # step-scoped env vars
        NODE_ENV: test
      no_output_timeout: 15m           # kill the step if it produces no output for 15 minutes (default 10m)
      when: on_success                 # on_success (default) | on_fail | always
```
`when: always` is the CircleCI equivalent of a "run this even if a previous step failed" cleanup step.

### `save_cache` / `restore_cache`
```yaml
steps:
  - restore_cache:
      keys:
        - deps-v1-{{ checksum "package-lock.json" }}
  - run: npm ci
  - save_cache:
      key: deps-v1-{{ checksum "package-lock.json" }}
      paths:
        - node_modules
```
Full deep dive (fallback keys, checksum templating) in [caching-parallelism-and-workflows.md](caching-parallelism-and-workflows.md). Same underlying concept as [CI Fundamentals §6](../ci-fundamentals.md) — this is just CircleCI's specific step syntax for it.

### `store_artifacts`
```yaml
steps:
  - store_artifacts:
      path: coverage/            # uploads this directory as a downloadable build artifact
      destination: coverage-report  # optional — folder name shown in the CircleCI UI artifacts tab
```
See [CI Fundamentals §8](../ci-fundamentals.md) for why artifacts matter (jobs run in ephemeral, isolated environments — nothing survives unless explicitly persisted).

### `store_test_results`
```yaml
steps:
  - store_test_results:
      path: test-results/   # a directory of JUnit XML files — CircleCI parses these into its Tests UI tab (pass/fail counts, timing, flaky test detection)
```
This is distinct from `store_artifacts`: `store_test_results` is specifically parsed by CircleCI to power the Tests UI (and is also what `circleci tests split` uses for timing-based splitting — see [caching-parallelism-and-workflows.md](caching-parallelism-and-workflows.md)). `store_artifacts` just makes files downloadable with no parsing.

---

## 4. `workflows:` — Orchestrating Jobs

A workflow ties jobs together with ordering and conditions.

```yaml
workflows:
  build-test-deploy:
    jobs:
      - lint
      - test:
          requires:
            - lint          # test only starts after lint succeeds
      - build:
          requires:
            - test
      - deploy:
          requires:
            - build
          filters:
            branches:
              only: main    # deploy job only runs on pushes to main
```

### `requires:` — job dependencies (fan-in/fan-out)
```yaml
workflows:
  full-pipeline:
    jobs:
      - lint
      - unit-test
      - integration-test
      - build:
          requires:         # build waits for ALL three to succeed — fan-in
            - lint
            - unit-test
            - integration-test
```
Without `requires:`, all jobs in a workflow run **in parallel** by default — `requires:` is what introduces sequencing. See [caching-parallelism-and-workflows.md](caching-parallelism-and-workflows.md) for full fan-out/fan-in patterns.

### `filters:` — branch and tag conditions
```yaml
workflows:
  release:
    jobs:
      - build
      - deploy:
          requires:
            - build
          filters:
            branches:
              only:
                - main
                - /release\/.*/     # regex — matches release/1.0, release/2.3, etc.
            tags:
              only: /^v.*/          # only run for tags matching v* (e.g. v1.2.0)

# Tag-triggered jobs need an explicit opt-in on EVERY job in the chain,
# because by default CircleCI ignores tags entirely:
  publish:
    jobs:
      - build:
          filters:
            tags:
              only: /^v.*/
      - publish-release:
          requires:
            - build
          filters:
            tags:
              only: /^v.*/
```
**Gotcha**: tags are ignored by default. If a job needs to run on a tag push, every job in its `requires:` chain needs its own `filters.tags.only` — a missing filter anywhere in the chain silently drops the whole workflow for that tag push.

---

## 5. Pipeline Triggers

| Trigger | How it works |
|---|---|
| **Push (webhook)** | Default — any push to a connected GitHub/GitLab/Bitbucket repo fires a pipeline automatically once the project is "followed" in CircleCI. |
| **Manual (API/UI)** | Trigger a pipeline via the "Trigger Pipeline" button in the CircleCI UI, or via the REST API (`POST /api/v2/project/{project-slug}/pipeline`) — CircleCI's rough equivalent of GitHub Actions' `workflow_dispatch`. Can pass pipeline parameters at trigger time. |
| **Scheduled pipelines** | Configured in the CircleCI UI (Project Settings → Triggers) with a cron expression and a target branch — not written inline in `config.yml` the way GitHub Actions' `schedule:` is. Runs the same config on a timer, independent of any push. |
| **API trigger with parameters** | ```bash\ncurl -X POST https://circleci.com/api/v2/project/gh/org/repo/pipeline \\\n  -H "Circle-Token: $CIRCLE_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"branch": "main", "parameters": {"run-deploy": true}}'\n``` — triggers a pipeline and feeds `run-deploy` into the pipeline parameters below. |

---

## 6. Pipeline Parameters and Conditional Workflows (`when`/`unless`)

Pipeline parameters let a single config adapt its behavior based on values passed in at trigger time (via the API) or set in defaults — used for **dynamic config**, e.g. skip a workflow entirely unless explicitly requested.

```yaml
version: 2.1

parameters:
  run-deploy:              # a pipeline parameter — settable via the API trigger payload
    type: boolean
    default: false
  target-env:
    type: string
    default: "staging"

jobs:
  build:
    docker:
      - image: cimg/base:2024.01
    steps:
      - checkout
      - run: echo "building..."

  deploy:
    docker:
      - image: cimg/base:2024.01
    steps:
      - checkout
      - run: echo "deploying to << pipeline.parameters.target-env >>"   # reference a parameter inline

workflows:
  build-always:
    jobs:
      - build

  deploy-conditionally:
    when: << pipeline.parameters.run-deploy >>   # this ENTIRE workflow is skipped unless run-deploy=true
    jobs:
      - deploy

  deploy-unless-skipped:
    unless: << pipeline.parameters.skip-deploy >>   # inverse of when — runs unless the condition is true
    jobs:
      - deploy
```

Triggering with the parameter set:
```bash
curl -X POST https://circleci.com/api/v2/project/gh/org/repo/pipeline \
  -H "Circle-Token: $CIRCLE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"branch": "main", "parameters": {"run-deploy": true, "target-env": "production"}}'
```

`when`/`unless` can also use logical operators (`and`, `or`, `not`) for more complex conditions:
```yaml
workflows:
  conditional-example:
    when:
      and:
        - equal: [main, << pipeline.git.branch >>]
        - equal: [true, << pipeline.parameters.run-deploy >>]
    jobs:
      - deploy
```

This is CircleCI's mechanism for what GitHub Actions handles with `workflow_dispatch` inputs plus `if:` conditions on jobs — the config stays static and declarative, but specific workflows within it activate only when their `when:` condition evaluates true.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
