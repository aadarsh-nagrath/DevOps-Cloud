# Dockerfile Deep Dive

Every Dockerfile instruction in depth, build context mechanics, layer caching, BuildKit, and image size optimization — see [docker.md](docker.md) for the folder index.

---

## 1. Instructions Reference

### `FROM`
Sets the base image. Must be the first instruction (aside from optional `ARG` before it, for parameterizing the base image itself).
```dockerfile
FROM node:20-alpine AS base    # AS names this stage for multi-stage builds / --target
```
- Use pinned tags (`node:20.11.1-alpine3.19`) or digests (`node@sha256:...`) in production — `latest` and floating minor tags drift.
- `FROM scratch` starts from an empty filesystem (for statically linked binaries, Go, Rust).

### `RUN`
Executes a command at build time, committing the result as a new layer.
```dockerfile
# Shell form — runs via /bin/sh -c, supports shell features (pipes, env expansion, &&)
RUN apt-get update && apt-get install -y curl

# Exec form — no shell, array of exact args, avoids shell injection/expansion surprises
RUN ["apt-get", "install", "-y", "curl"]
```
Combine related commands into a single `RUN` with `&&` to avoid creating throwaway intermediate layers (see §4).

### `CMD` vs `ENTRYPOINT`

| Aspect | `CMD` | `ENTRYPOINT` |
|---|---|---|
| Purpose | Default command/args for the container | Fixed executable the container always runs |
| Overridable | Fully overridden by `docker run <image> <args>` | Not overridden by CLI args (only by `--entrypoint`); CLI args are appended as arguments to it |
| Typical use | Default command for images meant to run varied commands | Images that always run one program, with `CMD` supplying default *arguments* |
| Combine pattern | — | `ENTRYPOINT ["executable"]` + `CMD ["--default-flag"]` — `CMD` supplies default args, replaced if user passes their own |

```dockerfile
# Pattern: entrypoint is fixed, CMD provides default args a user can override
ENTRYPOINT ["python", "app.py"]
CMD ["--port", "8080"]
# docker run myimage --port 9090   -> runs: python app.py --port 9090
```

### Exec form vs Shell form
```dockerfile
CMD ["nginx", "-g", "daemon off;"]   # exec form — PID 1 is nginx directly, receives signals (SIGTERM) correctly
CMD nginx -g "daemon off;"           # shell form — PID 1 is /bin/sh, which does NOT forward signals to nginx by default
```
**Always prefer exec form for `CMD`/`ENTRYPOINT`** — shell form makes your process PID 2, so `docker stop` (SIGTERM) may not reach it, forcing Docker to wait out the grace period and SIGKILL.

### `COPY` vs `ADD`

| Aspect | `COPY` | `ADD` |
|---|---|---|
| Local file/dir copy | Yes | Yes |
| Remote URL fetch | No | Yes (`ADD https://... /dest`) |
| Auto-extract tar archives | No | Yes, local tar/gzip/bzip2 archives auto-extracted on copy |
| Recommended default | **Yes** — explicit, predictable | No — "magic" extraction/fetch behavior is a common source of surprise and is a supply-chain risk (fetching over HTTP without checksum verification) |

Use `COPY` unless you specifically need `ADD`'s tar auto-extraction (and even then, prefer an explicit `RUN tar -xf` for clarity).

### `WORKDIR`
Sets the working directory for subsequent instructions and the container's default CWD. Creates the directory if it doesn't exist.
```dockerfile
WORKDIR /app   # prefer this over `RUN cd /app && ...` — cd doesn't persist across RUN layers
```

### `ENV` vs `ARG`

| Aspect | `ENV` | `ARG` |
|---|---|---|
| Available at build time | Yes | Yes |
| Available at container runtime | Yes (baked into the image) | No — gone after build |
| Set via | `docker build --build-arg` won't affect `ENV` unless you assign `ENV X=$ARG_NAME` | `docker build --build-arg KEY=value` |
| Visible in final image / `docker inspect` | Yes | No (unless copied into an `ENV`) |
| Use case | Runtime config, PATH additions, app settings | Build-time-only parameters (versions, build flags), especially secrets-adjacent values that shouldn't leak into the final image |

```dockerfile
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine
ARG BUILD_ENV=production
ENV NODE_ENV=${BUILD_ENV}   # promote an ARG into a persistent runtime ENV
```
Never put real secrets in `ARG` — build args are cached in image history/layer metadata and visible via `docker history`. Use BuildKit secret mounts instead (§3).

### `EXPOSE`
Documents which port(s) the container listens on. **Purely informational/metadata** — it does not publish the port to the host. Actual publishing happens with `docker run -p`.
```dockerfile
EXPOSE 3000
EXPOSE 3000/udp
```

### `VOLUME`
Declares a mount point as holding persistent/externally managed data, causing Docker to create an anonymous volume there if none is bound at runtime.
```dockerfile
VOLUME /var/lib/mysql
```
Use sparingly in application images — it's often clearer to let the Compose file or `docker run --mount` define volumes explicitly (declaring `VOLUME` in a Dockerfile can surprise consumers with unexpected anonymous volumes). See [docker-storage-and-volumes.md](docker-storage-and-volumes.md).

### `USER`
Switches the user (and optionally group) that subsequent instructions and the final container process run as.
```dockerfile
RUN addgroup -S app && adduser -S app -G app
USER app
```
Never run production containers as root — see [docker-security.md](docker-security.md) for the full rationale.

### `LABEL`
Attaches arbitrary key/value metadata to the image (visible via `docker inspect`).
```dockerfile
LABEL maintainer="team@example.com" \
      org.opencontainers.image.source="https://github.com/org/repo" \
      org.opencontainers.image.version="1.4.0"
```

### `HEALTHCHECK`
Defines how Docker checks whether the container is actually healthy, not just running.
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/healthz || exit 1
```
Surfaces as `healthy`/`unhealthy`/`starting` in `docker ps`; orchestrators (Swarm, Compose `depends_on: condition: service_healthy`) can act on it.

### `ONBUILD`
Registers an instruction to run later, when this image is used as the base (`FROM`) of another build. Useful for "template" base images.
```dockerfile
ONBUILD COPY . /app
ONBUILD RUN npm install
```
Rare in modern practice — multi-stage builds usually solve the same problem more transparently.

### `STOPSIGNAL`
Overrides the system call signal sent to stop the container (default `SIGTERM`).
```dockerfile
STOPSIGNAL SIGQUIT   # e.g. some apps need a different signal to trigger graceful shutdown/dump
```

### `SHELL`
Overrides the default shell (`["/bin/sh", "-c"]`) used for shell-form `RUN`/`CMD`/`ENTRYPOINT`.
```dockerfile
SHELL ["/bin/bash", "-c"]
RUN source venv/bin/activate && pip install -r requirements.txt   # 'source' needs bash, not sh
```

---

## 2. Build Context and `.dockerignore`

The **build context** is the set of files sent to the daemon when you run `docker build <path>` — everything under that path (recursively) gets tarred up and transmitted, even files you never `COPY`.

```bash
docker build -t myapp:1.0 .        # "." is the build context — entire current directory is sent
```

A large or careless context slows every build and can leak secrets into layer history. Use `.dockerignore` (same syntax as `.gitignore`) to exclude it:
```
.git
node_modules
*.log
.env
Dockerfile.lock
dist/
coverage/
**/__pycache__
```
Rule of thumb: if it's not needed inside the image, keep it out of the context. Smaller context = faster `docker build` invocation and smaller risk surface.

---

## 3. Layer Caching Mechanics

Each instruction that modifies the filesystem (`RUN`, `COPY`, `ADD`) produces a cached layer, keyed by:
1. The instruction's own content (the command string, or file checksums for `COPY`/`ADD`).
2. The parent layer's cache key (cache is invalidated for every layer *after* the first change — it's a chain, not independent per-layer checks).

**Order matters.** Put instructions that change least often *first*, and instructions that change most often (your application source) *last*:
```dockerfile
FROM node:20-alpine
WORKDIR /app

# Copy only manifest files first — cache hit here survives as long as dependencies don't change
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy app source last — this invalidates only from this point forward, not the npm install above
COPY . .

CMD ["node", "server.js"]
```
If you `COPY . .` before `npm ci`, *every* source change (even a comment edit) invalidates the dependency-install layer, forcing a full reinstall on every build.

Use `docker build --no-cache` to force a clean rebuild when debugging cache-related staleness (e.g., a base image `latest` tag moved but the local cache didn't notice).

---

## 4. BuildKit

BuildKit is Docker's modern build engine (a rewrite of the legacy builder), enabled by default in current Docker versions; explicitly force it with:
```bash
DOCKER_BUILDKIT=1 docker build -t myapp .
```
Benefits over the legacy builder: parallel stage execution, better cache reuse, and native support for cache/secret/ssh mounts inside `RUN` (requires `# syntax=docker/dockerfile:1` at the top of the Dockerfile).

### Cache mounts — persist package manager caches across builds
```dockerfile
# syntax=docker/dockerfile:1
RUN --mount=type=cache,target=/root/.npm \
    npm ci
# The npm cache dir persists across builds (not baked into the image layer), so re-running
# npm ci with an unchanged lockfile is fast even without a Docker layer cache hit.
```

### Secret mounts — use build secrets without leaking them into layers
```dockerfile
# syntax=docker/dockerfile:1
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci
# The secret is available only during this RUN step's execution and is never written to
# any image layer or build history — unlike ARG/ENV, which persist and are inspectable.
```
```bash
docker build --secret id=npmrc,src=$HOME/.npmrc -t myapp .
```

### buildx and multi-platform builds
`buildx` is the BuildKit-backed CLI plugin (`docker buildx`) that adds multi-platform builds, richer caching backends, and remote/distributed builders.
```bash
# Create and use a builder that supports multiple platforms (uses QEMU emulation for cross-arch)
docker buildx create --use --name multiarch-builder

# Build and push a single image manifest covering both architectures
docker buildx build --platform linux/amd64,linux/arm64 -t myorg/myapp:1.0 --push .
```
`--push` is required for multi-platform builds (the resulting multi-arch manifest can't be loaded into the local single-arch Docker image store with `--load`; only a single-platform build can be `--load`ed locally).

---

## 5. Image Layering and Size Optimization

### Combine RUN commands
```dockerfile
# Bad: 3 layers, and apt cache lingers in an earlier layer even after `rm -rf` in a later one
RUN apt-get update
RUN apt-get install -y curl
RUN rm -rf /var/lib/apt/lists/*

# Good: single layer, cache cleanup actually reduces the final layer size
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*
```
Because layers are diffs, deleting a file in a *later* layer doesn't shrink an *earlier* layer — the bytes are still in the image, just hidden. Cleanup must happen in the same `RUN` that created the bloat.

### Multi-stage builds
Already covered with a full worked example in [docker-more.md](docker-more.md) — use `FROM ... AS builder` to compile/build in one stage, then `COPY --from=builder` only the needed artifacts into a slim final stage. This is the single biggest lever for cutting image size and attack surface.

### Base image comparison

| Base | Size | Package manager | Shell/debugging | Best for |
|---|---|---|---|---|
| `ubuntu`/`debian` (full) | ~70-120MB+ | apt | Full shell, easy to debug | Dev/CI images, when compatibility matters more than size |
| `alpine` | ~5-8MB | apk | Has `sh` (busybox), but musl libc can break glibc-compiled binaries | General-purpose small images; watch for musl vs glibc native-binding issues (e.g. some Python/Node native modules) |
| `distroless` (gcr.io/distroless/*) | ~20-30MB (language runtime only) | None | No shell at all (or a `:debug` variant with busybox shell) | Production runtime images — minimal attack surface, no shell for an attacker to pivot with |
| `scratch` | 0MB (empty) | None | None | Statically linked binaries only (Go with `CGO_ENABLED=0`, Rust musl builds) |

Rule of thumb: `alpine` for a good size/compatibility balance; `distroless` when you want to eliminate the shell/package manager as an attack vector in the final production layer; `scratch` only for fully static binaries.

---

## 6. Production Dockerfile Example (Node.js)

```dockerfile
# syntax=docker/dockerfile:1
ARG NODE_VERSION=20

# ---- Stage 1: install dependencies (cached separately from source changes) ----
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --mount=type=cache speeds up repeat builds; npm ci enforces the lockfile exactly (no drift)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# ---- Stage 2: build the application (TS compile, bundling, etc.) ----
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci   # full deps incl. devDependencies for the build
COPY . .
RUN npm run build

# ---- Stage 3: minimal runtime image ----
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Non-root user — never run the app as root in production (see docker-security.md)
RUN addgroup -S nodejs && adduser -S nodeapp -G nodejs

# Only copy what's needed to run: prod node_modules + built output, nothing from devDependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

USER nodeapp
EXPOSE 3000

# Exec form so SIGTERM reaches the node process directly (fast, clean shutdown)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', r => process.exit(r.statusCode===200?0:1))"

ENTRYPOINT ["node"]
CMD ["dist/server.js"]
```

Design choices explained:
- **3 stages** (`deps`, `builder`, `runner`) so the final image contains neither devDependencies nor build tooling (TypeScript, bundlers) — only production `node_modules` and compiled output.
- **`npm ci` not `npm install`** — `ci` installs exactly what's in the lockfile and fails on drift, giving reproducible builds.
- **Cache mount on `/root/.npm`** — repeat builds reuse npm's package cache without needing a Docker layer cache hit, useful in CI where the layer cache may be cold.
- **Copying `package.json`/lockfile before source** — maximizes layer cache reuse across builds where only app code changed.
- **Non-root `USER`** — limits blast radius if the app is compromised.
- **`ENTRYPOINT`/`CMD` split, exec form** — process runs as PID 1 and receives signals correctly for graceful shutdown; `CMD` alone stays overridable for local debugging (`docker run myimage node dist/debug.js`).
- **`HEALTHCHECK`** — lets orchestrators detect a hung process, not just a crashed one.
- **Alpine base** — small footprint; if native modules ever break under musl libc, switch the base to `node:20-slim` (Debian-based) instead.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
