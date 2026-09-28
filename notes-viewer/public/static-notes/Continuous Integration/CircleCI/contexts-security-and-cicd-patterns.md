# Contexts, Security & Full CI/CD Patterns

CircleCI's mechanism for sharing secrets across projects (Contexts), environment variable precedence, and a complete end-to-end pipeline example tying together everything from the rest of this folder. See [CI Fundamentals §7](../ci-fundamentals.md) for secrets-handling rules that apply everywhere, not just CircleCI.

---

## 1. Contexts — Sharing Secrets/Env Vars Across Projects

A **Context** is a named, org-level group of environment variables that any project (with access) can reference in its workflow — CircleCI's mechanism for *not* re-entering the same AWS credentials or Docker registry token separately into every single repo's project settings.

```yaml
workflows:
  deploy:
    jobs:
      - deploy-prod:
          context:
            - aws-production-creds     # pulls in every env var defined in this Context, org-wide
```

```yaml
# A job using a context-provided variable — nothing special in the job itself,
# it just reads the env var like any other:
jobs:
  deploy-prod:
    docker:
      - image: cimg/aws:2024.03
    steps:
      - checkout
      - run:
          name: Deploy to AWS
          command: |
            aws configure set aws_access_key_id "$AWS_ACCESS_KEY_ID"      # comes from the context, not job-local config
            aws configure set aws_secret_access_key "$AWS_SECRET_ACCESS_KEY"
            aws s3 sync ./dist s3://prod-bucket
```

Contexts are managed in the CircleCI **Organization Settings** UI (not in `config.yml` itself) — you create a context, add key/value pairs to it, and grant **security groups** access to it. A job only gets the context's variables if the *project* is authorized to use that context (configured by an org admin) — this is the access-control layer that prevents, say, a low-trust open-source contributor's fork from being able to reference `aws-production-creds` just by writing `context: aws-production-creds` into a config file.

**Comparison to GitHub Actions**: a CircleCI Context is functionally equivalent to a GitHub Actions **Environment** combined with **Organization Secrets** — both let you define a secret once and scope which repos/jobs can pull from it, rather than duplicating the same secret value into every repo's own secrets store.

---

## 2. Project-Level vs Context-Level Environment Variables — Precedence

| Scope | Where it's set | Visibility |
|---|---|---|
| **Project environment variables** | Project Settings → Environment Variables (per-repo) | Only jobs within that specific project |
| **Context environment variables** | Organization Settings → Contexts (org-wide) | Any project explicitly granted access to that context |
| **In-config `environment:`** | Directly in `config.yml`, at job or step level | Only within that job/step — and since it's committed to the repo, **never put secrets here** (see [CI Fundamentals §7](../ci-fundamentals.md) — config files are version-controlled and world-readable in public repos) |

Precedence when the same variable name is defined in more than one place:
```
in-step `environment:` (highest precedence — most specific)
  > in-job `environment:`
    > Context environment variables
      > Project-level environment variables (lowest precedence — most general)
```
In practice: a variable set directly on a `run:` step's `environment:` block overrides the same-named variable coming from a Context, which in turn overrides a project-level variable of the same name. This matters when debugging "why is my deploy using the wrong credential" — check the most specific scope first.

---

## 3. Restricting Context Usage by Branch

Contexts alone don't restrict *which branch* can use them — that's layered on with a `filters:` block on the job referencing the context, combined with the org-level security group permissions on the context itself.

```yaml
workflows:
  deploy:
    jobs:
      - build
      - deploy-prod:
          context: aws-production-creds
          requires:
            - build
          filters:
            branches:
              only: main            # even though the project HAS access to the context,
                                     # this job (and therefore the context's secrets) only runs on main
```
Without this filter, any branch — including a feature branch a contributor pushes — could trigger `deploy-prod` and pull production credentials. Combining branch filters with context access control is the same "least privilege" principle as [CI Fundamentals §7](../ci-fundamentals.md): a secret should be reachable only by the specific job/branch that legitimately needs it, not by everything in the pipeline by default.

---

## 4. Full End-to-End Pipeline Example

Lint → parallelized test → build Docker image → push to registry → manual-approval-gated deploy, combining orbs, caching, parallelism, contexts, and an approval gate:

```yaml
# .circleci/config.yml

version: 2.1

orbs:
  node: circleci/node@5.2.0        # pinned exact version — see orbs-and-reusability.md for why pinning matters
  slack: circleci/slack@4.13.3

jobs:
  lint:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - node/install-packages:            # orb-provided install+cache, see orbs-and-reusability.md
          pkg-manager: npm
      - run:
          name: Run linter
          command: npm run lint

  test:
    docker:
      - image: cimg/node:20.11
    parallelism: 4                         # split the suite across 4 containers — see caching-parallelism-and-workflows.md
    steps:
      - checkout
      - node/install-packages:
          pkg-manager: npm
      - run:
          name: Run this container's share of tests
          command: |
            TESTFILES=$(circleci tests glob "test/**/*.spec.js" | circleci tests split --split-by=timings)
            npx jest $TESTFILES --ci
      - store_test_results:
          path: test-results/               # feeds future `tests split` timing data

  build-image:
    docker:
      - image: cimg/base:2024.01
    steps:
      - checkout
      - setup_remote_docker:                 # needed to run `docker build` inside a docker executor — see executors-and-environments.md
          version: 20.10.24
          docker_layer_caching: true
      - run:
          name: Build Docker image
          command: docker build -t myorg/myapp:${CIRCLE_SHA1} .
      - run:
          name: Log in and push to registry
          command: |
            echo "$DOCKERHUB_PASS" | docker login -u "$DOCKERHUB_USER" --password-stdin
            docker push myorg/myapp:${CIRCLE_SHA1}
    # DOCKERHUB_PASS / DOCKERHUB_USER come from a context granted below in the workflow

  deploy-production:
    docker:
      - image: cimg/base:2024.01
    steps:
      - checkout
      - run:
          name: Deploy new image to production
          command: |
            echo "Deploying myorg/myapp:${CIRCLE_SHA1} to production..."
            # e.g. kubectl set image, or a deploy script calling your infra provider
      - slack/notify:
          event: pass
          template: success_tagged_deploy_1
      - slack/notify:
          event: fail
          template: basic_fail_1

workflows:
  build-test-deploy:
    jobs:
      - lint

      - test:
          requires:
            - lint

      - build-image:
          context: dockerhub-creds          # grants DOCKERHUB_USER / DOCKERHUB_PASS from the org Context
          requires:
            - test
          filters:
            branches:
              only: main                     # only build+push images from main, not every feature branch

      - hold-for-approval:                   # manual gate — see caching-parallelism-and-workflows.md §4
          type: approval
          requires:
            - build-image
          filters:
            branches:
              only: main

      - deploy-production:
          context: aws-production-creds       # separate context, scoped only to this job
          requires:
            - hold-for-approval
          filters:
            branches:
              only: main
```

Stage-by-stage summary:
1. **`lint`** — fast feedback, runs on every push, catches style issues cheaply before spending time on anything slower.
2. **`test`** — waits on lint, runs the suite split across 4 parallel containers for speed.
3. **`build-image`** — only on `main`, after tests pass; uses `setup_remote_docker` to build and push an image, pulling registry credentials from a `dockerhub-creds` Context.
4. **`hold-for-approval`** — pipeline pauses here; a human must approve in the CircleCI UI before production deploy proceeds.
5. **`deploy-production`** — runs only after explicit approval, using a separate, narrowly-scoped `aws-production-creds` Context (not the same context as the build step — least privilege), then notifies Slack of the outcome either way.

---

## 5. Self-Hosted Runners — CircleCI's Runner Product

CircleCI **self-hosted runners** let specific jobs execute on infrastructure *you* control, while the rest of the pipeline (scheduling, orchestration, UI, the other jobs) still runs on CircleCI's managed cloud control plane — this is a lighter-weight option than full CircleCI Server (see [circleci.md §2](circleci.md)), which moves the *entire* control plane onto your infrastructure.

```yaml
jobs:
  deploy-internal:
    machine: true                 # signals a self-hosted runner job (no cloud-managed docker/machine image specified)
    resource_class: myorg/internal-runner   # references YOUR registered runner resource class, not a CircleCI-provided one
    steps:
      - checkout
      - run: ./deploy-to-internal-network.sh
```

### When/why you'd use a self-hosted runner over cloud executors

| Reason | Explanation |
|---|---|
| **Network access to internal resources** | A job needs to reach a database, internal API, or service that only exists inside your private network/VPN — CircleCI's cloud executors have no route to it, but a runner installed inside your network does |
| **Specialized hardware** | GPU-heavy workloads, custom hardware CircleCI's standard executors don't offer |
| **Data residency / compliance** | Job execution (and the data it touches) must stay within a specific infrastructure boundary for regulatory reasons |
| **Cost at scale** | If you already have significant idle compute capacity in your own infrastructure, running some jobs there can be cheaper than paying for CircleCI-managed compute-minutes |

**Trade-off**: you now own patching, scaling, and availability of the runner machines themselves for those specific jobs — a smaller version of the operational burden of full CircleCI Server (or self-hosting Jenkins), scoped down to only the jobs that actually need it. Most teams use self-hosted runners for a small, targeted subset of jobs (e.g., the one deploy job that needs internal network access) while leaving everything else — lint, test, build — on CircleCI's fully managed cloud executors.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
