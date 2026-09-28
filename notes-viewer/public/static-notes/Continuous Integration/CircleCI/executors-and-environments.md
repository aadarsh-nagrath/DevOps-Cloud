# Executors & Environments

Deep dive on CircleCI's executor types — the environment a job actually runs in — plus resource sizing and Docker-in-Docker. See [config-syntax-and-pipelines.md](config-syntax-and-pipelines.md) for the surrounding `jobs:`/`steps:` syntax.

---

## 1. Executor Types — Comparison

| Executor | What it is | Typical use case | Startup speed |
|---|---|---|---|
| `docker` | Job runs inside a Docker container you specify | Default choice — fastest, cheapest, works for most Linux CI (build, test, lint) | Fastest — containers start in seconds |
| `machine` | Job runs on a full dedicated VM (with Docker daemon pre-installed and usable directly, no DinD needed) | Building/running Docker images natively, tests needing full OS-level access (systemd, networking, privileged operations) | Slower than `docker` — full VM boot |
| `macos` | Job runs on a real macOS VM | iOS/macOS app builds, anything requiring Xcode | Slowest, most expensive — real Apple hardware billing |
| `windows` | Job runs on a Windows VM | .NET/Windows-only builds, Windows-specific integration tests | Comparable to `machine` |

```yaml
# docker executor — most common
jobs:
  test:
    docker:
      - image: cimg/node:20.11        # primary container — this is where your steps run
      - image: cimg/postgres:15.2     # secondary "service" container — reachable at localhost:5432 from the primary
    steps:
      - checkout
      - run: npm test

# machine executor
jobs:
  build-image:
    machine:
      image: ubuntu-2204:current      # a full VM image, not a container
    steps:
      - checkout
      - run: docker build -t myapp .   # Docker daemon is already running natively — no setup_remote_docker needed

# macos executor
jobs:
  build-ios:
    macos:
      xcode: "15.2.0"                 # pins a specific Xcode version
    steps:
      - checkout
      - run: xcodebuild -scheme MyApp build

# windows executor
jobs:
  build-dotnet:
    machine:
      image: windows-server-2022-gui:current
    resource_class: windows.medium
    steps:
      - checkout
      - run: dotnet build
```

**When to pick which**:
- Default to `docker` unless you have a specific reason not to — it's the fastest and cheapest.
- Reach for `machine` when a job needs to run Docker itself natively (building images, `docker-compose` stacks) or needs OS-level capabilities a container can't provide.
- `macos`/`windows` are dictated by the platform you're building for, not a preference — you use them because Xcode or Windows-only tooling requires that OS.

---

## 2. Multiple Containers in a `docker` Executor — Primary + Service Containers

```yaml
jobs:
  integration-test:
    docker:
      - image: cimg/node:20.11          # PRIMARY — your steps execute here
      - image: cimg/postgres:15.2        # service container, reachable as `localhost` from the primary
        environment:
          POSTGRES_USER: testuser
          POSTGRES_DB: testdb
      - image: cimg/redis:7.2            # another service container
    steps:
      - checkout
      - run: npm ci
      - run:
          name: Wait for Postgres
          command: dockerize -wait tcp://localhost:5432 -timeout 30s
      - run: npm run test:integration    # connects to localhost:5432 and localhost:6379
```
Only the **first** image listed is where your `steps:` actually execute — every image after it is a background service, accessible over `localhost` from the primary container's perspective. This is CircleCI's equivalent to `services:` in other CI tools.

---

## 3. Resource Classes — CPU/Memory Sizing

`resource_class:` controls how much CPU/RAM the job's executor gets — bigger classes cost more credits per minute but finish faster.

```yaml
jobs:
  test:
    docker:
      - image: cimg/node:20.11
    resource_class: medium    # default if omitted; other options: small, large, xlarge, 2xlarge (docker executor)
    steps:
      - checkout
      - run: npm test

  build-heavy:
    machine:
      image: ubuntu-2204:current
    resource_class: large     # machine executor has its own resource_class scale
    steps:
      - checkout
      - run: make build-everything
```

| Consideration | Guidance |
|---|---|
| Cost | Larger resource classes consume more credits per minute of runtime — always cost/time tradeoff, never "free speedup" |
| When to size up | CPU/memory-bound jobs (compiling large codebases, running many parallel test workers) that are clearly resource-starved on the default size |
| When NOT to size up | I/O-bound or network-bound jobs (waiting on a slow external API) — more CPU doesn't help; the job is stalled, not compute-starved |
| Default | Leave `resource_class` unset (defaults to `medium`) until you have evidence a job is resource-constrained — don't pre-optimize |

---

## 4. Docker-in-Docker — `setup_remote_docker`

When a job runs in a `docker` executor (i.e., your steps run *inside* a container) but you need to build or run **another** Docker image (e.g., `docker build` to produce your app's image), you can't just call the host's Docker daemon — there isn't one accessible from inside a container by default. `setup_remote_docker` provisions a separate, isolated Docker environment your steps can then talk to.

```yaml
jobs:
  build-and-push-image:
    docker:
      - image: cimg/base:2024.01
    steps:
      - checkout
      - setup_remote_docker:
          version: 20.10.24          # pin a Docker Engine version for the remote environment
          docker_layer_caching: true  # cache image layers between runs — speeds up repeated builds significantly
      - run:
          name: Build image
          command: docker build -t myapp:$CIRCLE_SHA1 .
      - run:
          name: Push to registry
          command: |
            echo "$DOCKERHUB_PASS" | docker login -u "$DOCKERHUB_USER" --password-stdin
            docker push myapp:$CIRCLE_SHA1
```

**Important nuance**: `setup_remote_docker` creates a genuinely *remote* Docker environment (a separate machine, not literally local to the job container) — so things like volume-mounting a path from the job's filesystem into a container don't work the way they would with a fully local Docker daemon; you generally need to `docker cp` files in/out instead. This trips up people expecting identical behavior to running Docker on their laptop.

**Alternative**: if a job is doing substantial Docker build work, consider just using the `machine` executor instead — it has a real, local Docker daemon already running, avoiding `setup_remote_docker`'s remote-environment quirks entirely. Trade-off is `machine`'s slower startup and coarser resource class options.

---

## 5. Custom Docker Image vs CircleCI Convenience Images

```yaml
# Option A: CircleCI's "convenience images" (cimg/*) — maintained by CircleCI,
# pre-installed with common tooling for that language/runtime, updated regularly
jobs:
  test:
    docker:
      - image: cimg/node:20.11        # includes node, npm, common CA certs, non-root user already set up
    steps:
      - checkout
      - run: npm ci && npm test

# Option B: your own custom image — full control, but you own maintenance
jobs:
  test:
    docker:
      - image: myorg/ci-base:3.2.1    # a Dockerfile you built and pushed to a registry yourself
    steps:
      - checkout
      - run: npm ci && npm test

# Option C: a generic public image, unmodified
jobs:
  test:
    docker:
      - image: node:20.11-bullseye    # official Docker Hub image, not CircleCI-maintained
    steps:
      - checkout
      - run: npm ci && npm test
```

| | `cimg/*` convenience images | Custom image | Generic public image |
|---|---|---|---|
| Maintenance burden | None — CircleCI maintains it | You own the Dockerfile, rebuilds, security patches | None, but not CircleCI-tuned |
| Startup speed | Fast — optimized for CI (small layers, pre-warmed) | Depends on your image | Varies |
| Customization | Limited to what's pre-installed | Full control — bake in exactly the tools/versions you need | Full control over base, but no CI-specific tuning |
| Best for | Most standard jobs (Node, Python, Go, Ruby, etc.) | Teams with unusual/heavy toolchains used across many jobs (worth the maintenance cost) | One-off jobs needing a specific public image not covered by `cimg/*` |

Default to `cimg/*` images unless you have a concrete reason (special tooling, internal compliance base image, unusual dependency combination) to maintain your own.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
