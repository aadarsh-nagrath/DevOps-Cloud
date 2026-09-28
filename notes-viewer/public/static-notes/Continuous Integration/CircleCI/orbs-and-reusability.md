# Orbs & Reusability

What orbs are, how to use popular ones, version pinning, and writing your own reusable config — from lightweight YAML anchors up to a full custom orb. See [circleci.md](circleci.md) for how orbs fit into the config-as-code philosophy vs Jenkins plugins.

---

## 1. What an Orb Actually Is

An **orb** is a versioned, shareable package of CircleCI config — bundling together **commands**, **jobs**, and **executors** that you reference by name instead of writing from scratch. It's conceptually similar to a GitHub Actions marketplace action, but broader: a single orb can ship multiple reusable jobs, multiple reusable commands, *and* executor definitions together, versioned as one unit — where a GitHub Action is typically one narrow reusable step.

```yaml
version: 2.1

orbs:
  node: circleci/node@5.2.0    # import the orb, pinned to an exact version, aliased as "node"

jobs:
  build:
    executor: node/default      # use an executor DEFINED BY the orb
    steps:
      - checkout
      - node/install-packages    # use a COMMAND defined by the orb — replaces manual npm ci + caching logic
      - run: npm test
```

No installation step, no server-side plugin registry to manage (unlike Jenkins plugins) — importing an orb in `orbs:` is the entire "installation."

---

## 2. Using Popular Orbs — Annotated Examples

### `circleci/node` — Node.js projects
```yaml
version: 2.1

orbs:
  node: circleci/node@5.2.0

jobs:
  test:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - node/install-packages:          # handles npm/yarn install AND dependency caching automatically
          pkg-manager: npm
          cache-path: node_modules       # what to cache
          override-ci-command: npm ci    # exact install command to run
      - run: npm test

workflows:
  test-workflow:
    jobs:
      - test
```
`node/install-packages` replaces the manual `restore_cache` → `npm ci` → `save_cache` sequence shown in [caching-parallelism-and-workflows.md](caching-parallelism-and-workflows.md) — the orb encodes that pattern once so you don't hand-write it in every project.

### `circleci/aws-s3` — uploading build output to S3
```yaml
version: 2.1

orbs:
  aws-s3: circleci/aws-s3@4.0.0

jobs:
  deploy-static-site:
    docker:
      - image: cimg/base:2024.01
    steps:
      - checkout
      - run: npm ci && npm run build
      - aws-s3/sync:                    # orb-provided job step — wraps `aws s3 sync` with sane defaults
          from: dist
          to: 's3://my-static-site-bucket'
          arguments: |
            --delete
            --cache-control "max-age=86400"
```
Credentials (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) are picked up from environment variables — typically injected via a Context, see [contexts-security-and-cicd-patterns.md](contexts-security-and-cicd-patterns.md).

### `circleci/slack` — pipeline notifications
```yaml
version: 2.1

orbs:
  slack: circleci/slack@4.13.3

jobs:
  deploy:
    docker:
      - image: cimg/base:2024.01
    steps:
      - checkout
      - run: ./deploy.sh
      - slack/notify:                   # sends a message to Slack
          event: fail                    # fire only when the job fails
          template: basic_fail_1         # a built-in message template
      - slack/notify:
          event: pass
          template: success_tagged_deploy_1
```
Requires a `SLACK_ACCESS_TOKEN` environment variable (again, usually via a Context) and the target channel configured via the orb's parameters or Slack app config.

---

## 3. Orb Versioning — Pinning and Why It Matters

```yaml
orbs:
  node: circleci/node@5.2.0     # pinned to an exact version — reproducible, safe
  aws-s3: circleci/aws-s3@4      # pinned to major version only — auto-gets 4.x updates, some drift risk
  slack: circleci/slack@volatile  # ALWAYS resolves to the newest published version — never do this in real pipelines
```

| Pinning style | Behavior | Recommendation |
|---|---|---|
| `orb@1.2.3` (exact) | Never changes until you bump it yourself | **Use this for production pipelines** |
| `orb@1` (major only) | Auto-updates within major version | Acceptable for low-risk orbs, still some risk |
| `orb@volatile` | Always latest, including breaking changes | Avoid outside of quick experiments |

**Why pinning matters — the same supply-chain reasoning as SHA-pinning GitHub Actions**: an orb is third-party code that runs with access to your job's environment, including any secrets/env vars exposed to that job. An unpinned or loosely-pinned orb reference means a compromised or maliciously updated orb version could execute arbitrary code in your CI pipeline the next time it runs — with no code review on your side, because nothing in *your* repo changed. Exact version pinning (`orb@1.2.3`) makes orb upgrades an explicit, reviewable change (you see the version bump in a diff) rather than something that silently changes behind your back. This is the identical risk model to why security guidance for GitHub Actions pushes pinning third-party actions to a full commit SHA rather than a mutable tag like `@v4`.

CircleCI also supports **private orbs** (published to your own organization, not the public registry) for internal reusable config that shouldn't be public — same versioning and pinning rules apply.

---

## 4. Writing Your Own Reusable `commands:` Block

Before reaching for a full orb, a `commands:` block in a single `config.yml` gives you the same DRY benefit for reuse *within one repo*, with far less overhead than publishing a versioned package.

```yaml
version: 2.1

commands:                          # define once, use in as many jobs as you want
  install-and-lint:                 # a custom, named, reusable step
    description: "Installs dependencies and runs the linter"
    parameters:                     # commands can take parameters, just like orb commands
      lint-command:
        type: string
        default: "npm run lint"
    steps:
      - run:
          name: Install dependencies
          command: npm ci
      - run:
          name: Lint
          command: << parameters.lint-command >>

jobs:
  lint-app:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - install-and-lint                          # uses defaults

  lint-server:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - install-and-lint:
          lint-command: "npm run lint:server"       # overrides the parameter

workflows:
  ci:
    jobs:
      - lint-app
      - lint-server
```
Both jobs share the exact install+lint logic without copy-pasting the two `run:` steps twice — if the lint invocation changes, it changes in one place.

**When to graduate a `commands:` block into a real orb**: once the same reusable logic needs to be shared *across multiple repositories* (not just multiple jobs in one repo), publish it as a private orb instead of copy-pasting the `commands:` block into every repo's config.

---

## 5. YAML Anchors/Aliases — Lighter-Weight Reuse

For teams not ready to invest in a `commands:` block or an orb, plain YAML anchors (`&`) and aliases (`*`) — a native YAML feature, nothing CircleCI-specific — can deduplicate repeated config blocks.

```yaml
version: 2.1

jobs:
  test-node-18: &test-template            # &test-template defines an anchor on this whole job block
    docker:
      - image: cimg/node:18.20
    steps:
      - checkout
      - run: npm ci
      - run: npm test

  test-node-20:
    <<: *test-template                    # merge-key: pulls in everything from the anchor
    docker:
      - image: cimg/node:20.11             # then override just the image
```

| Reuse mechanism | Scope | Overhead | Best for |
|---|---|---|---|
| YAML anchors/aliases | Within one `config.yml` | None — plain YAML | Small, config-shape duplication (e.g. near-identical job blocks) |
| `commands:` block | Within one `config.yml`, but composable across many jobs | Low — CircleCI-native, supports parameters | Reusable *step sequences* used by several jobs in the same repo |
| Custom private orb | Across many repos in an org | Higher — versioning, publishing, changelog discipline | Logic genuinely shared org-wide (deploy patterns, notification patterns, internal tooling wrappers) |

Anchors are the "duct tape" option — fast, zero-setup, but they can't take parameters the way `commands:` can, and they only work within a single file.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
