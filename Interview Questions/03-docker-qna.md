# Docker — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. See also [`docker/`](../docker) in this repo for the deep-dive reference notes this file's answers are distilled from. Grouped **Junior → Mid → Senior**.

---

## Table of Contents
- [Junior Level (0–2 yrs)](#junior-level-02-yrs)
- [Mid Level (2–5 yrs)](#mid-level-25-yrs)
- [Senior Level (5+ yrs)](#senior-level-5-yrs)

---

## Junior Level (0–2 yrs)

### 1. What is Docker, and what problem does it solve?
Docker is a platform for building, shipping, and running applications inside containers — lightweight, isolated environments that package an application with everything it needs to run (code, runtime, libraries, system tools) so it behaves identically regardless of where it's deployed. It solves the classic "works on my machine" problem by making the environment itself part of the deployable artifact, rather than something separately configured on every host.

### 2. What's the fundamental difference between a container and a virtual machine?
A VM virtualizes hardware — each VM runs a full guest OS with its own kernel, on top of a hypervisor, making VMs heavier (GBs, slow to boot) but very strongly isolated. A container virtualizes the OS, not the hardware — all containers on a host share the same host kernel, isolated from each other via Linux namespaces and resource-bounded via cgroups, making containers lightweight (MBs, start in milliseconds) but with a weaker isolation boundary since they share a kernel.

### 3. What is a Docker image vs a Docker container?
An image is a read-only, immutable template — a set of layered filesystem snapshots plus metadata (entrypoint, exposed ports, env defaults) — that defines what a container *will* look like. A container is a running (or stopped) *instance* of an image, with its own writable layer on top and its own process/network/filesystem namespace. The same image can be used to spin up any number of independent containers.

### 4. What is a `Dockerfile`?
A `Dockerfile` is a plain-text, declarative script of instructions (`FROM`, `RUN`, `COPY`, `CMD`, etc.) that Docker reads to build an image layer by layer. `docker build -t myapp:1.0 .` builds an image from the `Dockerfile` in the current directory (`.` is the *build context* — the set of files sent to the Docker daemon).

### 5. What do `CMD` and `ENTRYPOINT` do, and how are they different?
Both define what runs when a container starts. `ENTRYPOINT` sets the fixed, main executable for the container (hard to override without `--entrypoint`). `CMD` provides default *arguments* — either to the `ENTRYPOINT` if one is set, or as the full command if `ENTRYPOINT` isn't set — and is easily overridden by arguments passed to `docker run`. The common pattern `ENTRYPOINT ["python", "app.py"]` + `CMD ["--port", "8080"]` lets users override just the port (`docker run myimage --port 9090`) without needing to know or repeat the base command.

### 6. What's the difference between `RUN`, `COPY`, and `ADD` in a Dockerfile?
`RUN` executes a command *during the build* and commits the resulting filesystem changes as a new layer (e.g. installing packages). `COPY` copies files/directories from the build context into the image, verbatim. `ADD` does what `COPY` does plus two extra behaviors: it can fetch a remote URL, and it auto-extracts local tar archives — because these two automatic behaviors are often surprising, `COPY` is the recommended default unless you specifically need one of `ADD`'s extra features.

### 7. What are the most common Docker CLI commands you use day to day?
`docker build -t name:tag .` (build an image), `docker run -d -p 8080:80 name:tag` (run detached, port-mapped), `docker ps` / `docker ps -a` (list running / all containers), `docker logs -f <container>` (follow logs), `docker exec -it <container> sh` (shell into a running container), `docker stop`/`docker rm` (stop/remove a container), `docker images` / `docker rmi` (list/remove images), `docker pull`/`docker push` (fetch/publish images from/to a registry).

### 8. What does `docker run -p 8080:80` mean?
It publishes container port `80` to host port `8080` — the format is `<host-port>:<container-port>`. Traffic hitting `localhost:8080` on the host gets forwarded to port `80` inside the container. Without `-p`, the container's ports aren't reachable from outside the Docker host at all (though other containers on the same Docker network can still reach it directly by its internal port and container name/IP).

### 9. What's the difference between `docker stop` and `docker kill`?
`docker stop` sends `SIGTERM` to the container's main process, then waits a grace period (default 10s) before sending `SIGKILL` if it hasn't exited — giving the app a chance to shut down cleanly. `docker kill` sends `SIGKILL` (or another signal you specify) immediately, forcefully terminating it with no grace period.

### 10. What is a Docker volume, and why not just write data inside the container's filesystem?
A container's own writable layer is ephemeral — it's deleted when the container is removed, and by default isn't shared between containers. A **volume** (`docker volume create`, or the `-v`/`--mount` flag) is storage managed by Docker, living outside any single container's lifecycle, so data persists across container restarts/removals and can be shared between multiple containers. This is essential for anything stateful (databases, uploaded files).

### 11. What's the difference between a named volume and a bind mount?
A named volume is fully managed by Docker (stored under Docker's own data directory, portable, easiest to back up via `docker volume` commands). A bind mount maps an *existing path on the host filesystem* directly into the container (`-v /host/path:/container/path`) — useful for local development (editing code on the host and seeing changes instantly in the container) but tightly couples the setup to that specific host's filesystem layout, which is why volumes (not bind mounts) are generally preferred for production data.

### 12. What is `docker-compose` (or the `docker compose` CLI plugin), and why use it?
Compose lets you define a multi-container application (services, networks, volumes, environment variables, dependencies between services) declaratively in a single `docker-compose.yml` file, then bring the whole stack up/down with one command (`docker compose up -d`, `docker compose down`) instead of manually running a series of `docker run` commands with matching flags every time.

### 13. What does `docker exec` do, and why is it different from `docker attach`?
`docker exec -it <container> sh` starts a *brand-new* process (like a shell) inside an already-running container's namespaces — the most common way to poke around inside a container for debugging, without disturbing its main process. `docker attach` instead connects your terminal directly to the container's *existing* main process's stdin/stdout/stderr — exiting or Ctrl-C-ing an attached session can accidentally stop the container's main process, which is why `exec` is almost always what you actually want for debugging.

### 14. How do you view logs from a container, and what if the application doesn't log there?
`docker logs <container>` (add `-f` to follow, `--tail 100` for just the last 100 lines) shows whatever the container's main process (PID 1) wrote to stdout/stderr — this is why Docker/container best practice is to log to stdout/stderr rather than to a file inside the container; if the app only writes to an internal log file, `docker logs` will show nothing useful, and you'd need to `exec` in and read that file directly (or better, reconfigure the app to log to stdout).

### 15. What is a Docker registry, and what's the difference between Docker Hub and a private registry?
A registry stores and distributes Docker images by name and tag (`repository:tag`), which clients `pull`/`push` to/from. Docker Hub is the default public registry (`docker pull nginx` implicitly pulls from `docker.io/library/nginx`). Private registries (AWS ECR, Google Artifact Registry, Azure ACR, Harbor, GitLab Container Registry, self-hosted) restrict access, are typically required for proprietary images, and are often geographically/network-closer to your deployment infrastructure, reducing pull latency.

---

## Mid Level (2–5 yrs)

### 16. How do image layers work, and why does layer ordering in a Dockerfile matter for build speed?
Each Dockerfile instruction that changes the filesystem (`RUN`, `COPY`, `ADD`) produces a new, immutable, cacheable layer, stacked via a union filesystem (overlayfs). When rebuilding, Docker reuses cached layers up to the *first* instruction whose input has changed — everything after that point must rebuild, even if unaffected. So you order instructions from least-to-most frequently changing: install OS packages and dependencies first (rarely change), copy dependency manifests and install dependencies next, and copy application source code *last* — so an ordinary code change only invalidates the cheap final layers, not a full dependency reinstall.

### 17. What is a multi-stage build, and what problem does it solve?
A multi-stage `Dockerfile` uses multiple `FROM` statements, each starting a new build stage, where later stages can selectively `COPY --from=<earlier-stage>` specific artifacts from earlier ones. This lets you use a full SDK/toolchain image to *compile* an application in one stage, then copy just the compiled binary/output into a minimal final runtime image (e.g. `scratch`, `distroless`, or `alpine`) — dramatically shrinking the final image size and attack surface by excluding compilers, build tools, and source code that aren't needed at runtime.

### 18. What's the difference between `ENV` and `ARG` in a Dockerfile?
`ARG` defines a build-time-only variable, available during the build but *not* present in the final running container's environment (unless separately assigned to an `ENV`). `ENV` defines an environment variable that's baked into the image and *is* present at container runtime, overridable at `docker run` time with `-e`. A common pattern is `ARG VERSION` used to parameterize a build, then `ENV APP_VERSION=$VERSION` to also expose it to the running application.

### 19. How do you keep secrets (API keys, credentials) out of a Docker image?
Never `COPY` a secrets file into the image or bake it in via `ENV`/`ARG` in a way that lands in a layer or the image's history (`docker history`, or simply `docker inspect`, can reveal `ENV` values, and even a value only used transiently in a `RUN` line remains in that layer's diff unless very carefully handled). Instead: use `docker build --secret` (BuildKit's dedicated secret-mounting mechanism, which never persists the secret into any layer), inject secrets at *runtime* via environment variables or mounted files from a secrets manager (Vault, AWS Secrets Manager, Kubernetes Secrets) rather than at build time, and add sensitive paths to `.dockerignore` so they're never even sent as part of the build context.

### 20. What is `.dockerignore`, and why does it matter for both build speed and security?
Analogous to `.gitignore`, it excludes files/directories from the build context sent to the Docker daemon. Excluding things like `.git/`, `node_modules/`, local `.env` files, and build artifacts speeds up builds (smaller context to transfer/hash) and prevents accidentally `COPY`-ing sensitive files into an image via a broad `COPY . .` instruction.

### 21. How does Docker networking work — what are the built-in network drivers, and when do you use each?
`bridge` (the default) creates an isolated private network on the host; containers on the same bridge network can reach each other by container name via Docker's built-in DNS, and reach the outside world via NAT — the right default for most single-host setups. `host` removes network isolation entirely, sharing the host's network namespace directly (max performance, no port mapping needed, but no isolation and possible port conflicts). `overlay` spans multiple Docker hosts (used by Swarm, and conceptually similar to what CNI plugins provide for Kubernetes) for multi-host container communication. `none` disables networking entirely, for fully isolated workloads.

### 22. How does container-to-container communication work on a user-defined bridge network vs the default bridge?
On a **user-defined** bridge network (`docker network create mynet`), Docker provides automatic DNS resolution by container name — `curl http://backend:5000` from a container named `frontend` just works. On the **default** bridge network, this automatic DNS doesn't work — containers can only reach each other by IP address (which changes across restarts), which is precisely why creating a user-defined network (or using Compose, which does this automatically) is standard practice rather than relying on the default bridge.

### 23. What is `docker system prune`, and what does it actually remove?
It removes unused Docker data to reclaim disk space: stopped containers, dangling images (untagged, unreferenced layers), unused networks, and (by default) the build cache — but **not** volumes, unless you explicitly add `--volumes` (a safety default, since volumes usually hold real data you don't want to lose accidentally). `docker system df` shows current disk usage broken down by images/containers/volumes/build-cache before you decide what to prune.

### 24. What does `HEALTHCHECK` do in a Dockerfile, and how does it interact with orchestrators?
`HEALTHCHECK CMD curl -f http://localhost/health || exit 1` tells Docker to periodically run a command inside the container and mark its status as `healthy`/`unhealthy`/`starting` based on the exit code (visible in `docker ps` as `(healthy)`). Orchestrators (Swarm, and Kubernetes via its own separate `livenessProbe`/`readinessProbe` mechanism rather than reading the Dockerfile `HEALTHCHECK` directly) use this signal to decide whether to route traffic to a container or restart/replace it.

### 25. Why should containers generally run as a non-root user, and how do you configure that?
If a container process running as root is compromised (a code execution vulnerability in the app, for example), and the container escapes its isolation or a mounted volume has permissive host permissions, the attacker effectively has root-level capability on whatever they can reach — a needlessly large blast radius most applications don't actually need. Set a non-root user in the Dockerfile (`RUN useradd -m appuser` then `USER appuser`) or at runtime (`docker run --user 1000:1000`), and Kubernetes additionally supports `runAsNonRoot: true` in a pod's `securityContext` to *enforce* this as policy, refusing to start a pod that would otherwise run as root.

### 26. What's the difference between `docker cp`, a bind mount, and a volume, for getting files into/out of a container?
`docker cp` is a one-time, manual copy of files between the host and a container's filesystem (works even on a stopped container) — not a persistent or live-syncing mechanism. A bind mount live-links a host directory into the container for as long as it's running, so changes on either side are immediately visible to the other — ideal for local dev iteration. A volume is Docker-managed persistent storage, decoupled from any specific host path, intended for data that should outlive and be portable across containers.

### 27. How would you reduce a Docker image's size? Name several concrete techniques.
Use a minimal base image (`alpine`, `distroless`, or `scratch` for statically-linked binaries) instead of a full OS image. Use multi-stage builds so build-time-only tools/dependencies never reach the final image. Combine related `RUN` commands with `&&` and clean up package manager caches in the *same* layer they were created in (cleaning up in a later `RUN` doesn't shrink earlier layers, since layers are additive/immutable). Order Dockerfile instructions to maximize cache reuse (not strictly a size technique, but reduces wasted rebuild time). Avoid copying unnecessary files (`.dockerignore`), and periodically audit with `docker history <image>` or tools like `dive` to see exactly which layer/instruction is contributing the most size.

### 28. What is Docker BuildKit, and what does it improve over the legacy builder?
BuildKit (the default builder since Docker 23.0+) parallelizes independent build stages instead of executing sequentially, provides smarter, more granular caching (including cache mounts for package manager caches across builds via `RUN --mount=type=cache`), supports the secure `--secret`/`--ssh` mount mechanisms for secrets that never land in a layer, and enables more efficient cache export/import for CI (e.g. `--cache-from`/`--cache-to` against a registry, letting CI runners share build cache across ephemeral runners).

### 29. What's the difference between `docker inspect`, `docker stats`, and `docker top`?
`docker inspect <container>` dumps detailed JSON configuration/state (mounts, network settings, env vars, resource limits) — the "what is this container configured as" view. `docker stats` shows live, continuously updating resource usage (CPU %, memory, network I/O) per container — the "what is this container doing right now, resource-wise" view. `docker top <container>` lists the actual OS processes running inside the container (similar to running `ps` from the host's perspective on that container's namespace).

### 30. How do you limit a container's CPU and memory usage, and what happens when it exceeds the memory limit?
`docker run --memory=512m --cpus=1.5 myimage` caps memory to 512MB and CPU to 1.5 cores' worth of time. Exceeding the memory limit triggers the kernel's OOM killer *scoped to that container's cgroup* — the container's process gets killed (visible as an `OOMKilled: true` / exit code 137 in `docker inspect`), rather than affecting the host or other containers, which is exactly the isolation cgroups are designed to provide.

---

## Senior Level (5+ yrs)

### 31. Explain exactly how container isolation is implemented at the kernel level, and identify a concrete way that isolation can be weaker than expected.
Isolation comes from Linux namespaces (PID, net, mount, UTS, IPC, and optionally user namespaces) restricting what a process can *see*, and cgroups bounding what it can *use* — but all containers on a host still share one kernel. A concrete weak point: without a remapped user namespace (`--userns-remap`, off by default in most setups), root inside a container *is* UID 0 on the host — if a container escape occurs (a kernel exploit, an overly permissive mount, or a dangerous capability like `CAP_SYS_ADMIN` left enabled), the attacker has genuine host-root, not just "container root." This is why `--userns-remap`, dropping all capabilities and adding back only what's needed (`--cap-drop=ALL --cap-add=NET_BIND_SERVICE`), read-only root filesystems (`--read-only`), and seccomp/AppArmor profiles are defense-in-depth layers senior engineers should be able to speak to, not just "namespaces provide isolation" as a one-line answer.

### 32. How would you design a base-image strategy across an organization with dozens of microservices, balancing security patching, consistency, and build speed?
Maintain a small set of centrally-owned, hardened "golden" base images (per language/runtime), rebuilt on a scheduled cadence and automatically on upstream CVE disclosure, scanned (Trivy/Grype/Snyk) as part of that rebuild pipeline, and published to an internal registry that all service Dockerfiles `FROM` instead of pulling directly from public Docker Hub. This centralizes the patching burden (fix once, every service inherits it on next build) instead of each team managing their own base image drift, while a policy-as-code gate (OPA/Conftest, or registry-level admission control) blocks any image built `FROM` an unapproved or stale base from being deployed — turning "everyone should use the hardened base image" from a wiki convention into an enforced pipeline requirement.

### 33. A container that was fine in staging OOMKills intermittently in production under load. Walk through your investigation.
First confirm it's actually a memory limit issue and not a crash from something else being misreported (`docker inspect --format='{{json .State}}' <container>` or `kubectl describe pod` for the exact `OOMKilled`/exit-code-137 signal). Compare configured memory limits between staging and production (a surprisingly common root cause: different limits, or production simply seeing genuinely higher load/concurrency/cache growth than staging ever exercised). Profile actual memory usage under production-like load in a controlled way (language-specific heap profiler, or `docker stats`/cgroup `memory.stat` trends over time) to distinguish a real leak from expected-but-underestimated working-set size (e.g. connection pool growth, in-memory caching that scales with traffic, or page-cache-inflated RSS as discussed in the Linux section of this repo). If it's a genuine leak, bisect recent releases; if it's underestimated legitimate usage, right-size the limit based on observed data rather than a guessed number, and add memory-usage alerting *before* the OOM threshold so you get warning ahead of the next incident rather than only a post-mortem signal.

### 34. Compare Docker's default `runc`-based containers to gVisor and Kata Containers, and explain when the added complexity of a sandboxed/lightweight-VM runtime is actually justified.
Standard Docker containers use `runc`, which creates namespace/cgroup-isolated processes directly against the host kernel — fast, low overhead, but the isolation boundary is "as strong as the shared kernel's own security," meaning a kernel vulnerability can potentially be exploited across container boundaries. gVisor intercepts a container's syscalls in userspace via a sandbox kernel (`runsc`), trading some performance for a much smaller kernel attack surface exposed to the container. Kata Containers goes further, running each container inside a lightweight, hardware-virtualized micro-VM, giving genuine hypervisor-level isolation at a bigger performance/resource cost. The justification threshold is usually: multi-tenant untrusted workloads (running arbitrary/customer-submitted code, a CI runner executing untrusted PR code, a serverless platform hosting multiple customers on shared nodes) where the isolation upgrade is worth the overhead — versus a single organization's own trusted internal microservices, where standard `runc` isolation plus good image/capability hygiene is normally sufficient and the added latency/complexity isn't justified.

### 35. How would you architect and secure a fully automated container build pipeline end to end (source → registry → deployment), addressing supply-chain risk specifically?
Pin all base images by digest (not just tag, since tags are mutable) in source-controlled Dockerfiles; run dependency and container vulnerability scanning (Trivy/Grype/Snyk) as a required, blocking CI gate, not just an informational report; generate an SBOM (Software Bill of Materials, e.g. via Syft) for every built image and store it alongside the artifact; sign built images (Sigstore/cosign, or Docker Content Trust/Notary) and generate build provenance attestation tying the artifact back to the exact source commit, pipeline, and build inputs that produced it (aligned with SLSA); enforce, at the deployment/admission-control layer (Kubernetes admission webhook, e.g. Kyverno or OPA Gatekeeper), that only signed images with a verified provenance attestation from your CI system — never an image pushed manually or from an unapproved pipeline — can be deployed; and restrict registry write access tightly, since a compromised registry credential otherwise undermines every other control in the chain regardless of how well the pipeline itself is secured.

### 36. Explain the tradeoffs of running Docker (or any container runtime) in production directly on bare-metal hosts vs. inside VMs, from a defense-in-depth and multi-tenancy perspective.
Bare-metal containers give you the best raw performance and resource efficiency (no hypervisor tax, no double-scheduling of CPU/memory between hypervisor and container orchestrator), simpler capacity planning, and is common for organizations running their own fleet at scale. Running containers *inside* VMs (the common cloud pattern — e.g. Kubernetes nodes that are themselves cloud VMs) adds a genuine additional isolation boundary: a kernel-level container escape is contained within that VM's blast radius rather than reaching a shared bare-metal host running many customers' or teams' workloads, at the cost of some performance overhead and an extra layer of infrastructure (VM images, hypervisor patching) to manage. Multi-tenant platforms (cloud providers themselves, or internal platforms hosting many independent teams with varying trust levels) almost always choose the VM-wrapped approach specifically for this defense-in-depth reason, even though it's not "necessary" for isolation among fully trusted, single-organization workloads.
