# Docker

Container platform for packaging, distributing, and running applications with their dependencies — this is the overview and index for all Docker notes in this folder.

---

## 1. What Is Docker

Docker is a platform for building, shipping, and running applications inside **containers** — lightweight, isolated processes that package an application together with its dependencies (libraries, runtime, config) so it runs identically across environments.

Containers solve the "works on my machine" problem: the container image is the unit of deployment, not "the code plus a list of instructions for setting up a server."

Core value:
- **Isolation** — each container has its own filesystem, process namespace, and network stack (via Linux kernel namespaces/cgroups).
- **Portability** — an image built on a laptop runs the same on a CI runner, a staging VM, or a Kubernetes node.
- **Density** — containers share the host kernel, so they start in milliseconds and use far less overhead than a VM.
- **Reproducibility** — a `Dockerfile` is a versionable, auditable build recipe.

---

## 2. Containers vs Virtual Machines

| Aspect | Containers | Virtual Machines |
|---|---|---|
| Isolation unit | OS process (namespaces + cgroups) | Full guest OS on virtualized hardware |
| Kernel | Shared with host | Each VM has its own kernel |
| Startup time | Milliseconds to seconds | Tens of seconds to minutes |
| Image size | MBs (layers, shared base images) | GBs (full OS) |
| Density per host | Dozens to hundreds | Single digits to low tens |
| Overhead | Near-native performance | Hypervisor overhead (CPU/memory virtualization) |
| Isolation strength | Process-level (weaker boundary, shared kernel attack surface) | Hardware-level (stronger boundary) |
| Portability | Same image runs anywhere the container runtime runs | Tied to hypervisor/format (VMDK, VHD, qcow2) unless converted |
| Typical use case | Microservices, CI/CD, stateless apps, horizontal scaling | Full OS isolation, legacy apps, multi-tenant hosting needing hard security boundaries |

Containers and VMs are often combined in practice: cloud instances (EC2, GCE) are VMs, and Docker containers run on top of them.

---

## 3. Docker Architecture

```
+-------------------+       REST API (HTTP over Unix socket / TCP)      +--------------------+
|   Docker Client   |  ------------------------------------------------> |   Docker Daemon     |
|   (docker CLI)     |                                                    |   (dockerd)          |
+-------------------+                                                    +--------------------+
                                                                                    |
                                                                                    | manages
                                                                                    v
                                                                          +--------------------+
                                                                          |    containerd       |
                                                                          | (container lifecycle,|
                                                                          |  image pull/store)    |
                                                                          +--------------------+
                                                                                    |
                                                                                    | spawns via
                                                                                    v
                                                                          +--------------------+
                                                                          |      runc            |
                                                                          | (OCI runtime — creates|
                                                                          |  the actual namespaces|
                                                                          |  + cgroups process)   |
                                                                          +--------------------+
```

- **Docker Client (`docker` CLI)** — what you type commands into. Talks to the daemon over a REST API (usually a Unix socket `/var/run/docker.sock`, or TCP for remote daemons).
- **Docker Daemon (`dockerd`)** — the background service that builds images, manages networks/volumes, and delegates container execution to containerd. Owns the high-level Docker API and object model (images, containers, networks, volumes).
- **containerd** — a separate, CNCF-graduated daemon that handles the container lifecycle (pull images, manage storage, start/stop/pause containers) at a lower level than `dockerd`. Kubernetes can talk to containerd directly, bypassing `dockerd` entirely (this is the standard `kubelet` CRI path today).
- **runc** — the low-level OCI-compliant runtime that actually creates the Linux namespaces and cgroups and execs the container process. This is the thing that "creates the container" in the kernel sense.
- **OCI (Open Container Initiative) spec** — the vendor-neutral specification for container **images** (Image Spec) and container **runtimes** (Runtime Spec). Because Docker images conform to OCI, they run under any OCI-compliant runtime (containerd, CRI-O, Podman), not just Docker.

Request flow: `docker run` → Docker Client sends REST request to `dockerd` → `dockerd` asks `containerd` to pull the image and create a container → `containerd` invokes `runc` → `runc` creates namespaces/cgroups and execs the process → `runc` exits (it's not long-running) → `containerd-shim` stays alive as the container's parent process so `containerd`/`dockerd` can restart without killing running containers.

---

## 4. Installation

### Docker Desktop (macOS / Windows)
- Ships a lightweight Linux VM (via Apple's Virtualization.framework on macOS, WSL2 on Windows) since the Linux kernel features Docker depends on (namespaces, cgroups) don't exist natively on macOS/Windows.
- Includes the daemon, CLI, Compose, and a GUI.
- Free for personal use / small business / education; paid tiers for larger commercial use.

### Docker Engine (Linux)
```bash
# Debian/Ubuntu — official convenience script (fine for dev boxes, avoid for prod — pin versions instead)
curl -fsSL https://get.docker.com | sh

# Or via apt with Docker's official repo (recommended for reproducible installs)
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Run docker without sudo (adds current user to the docker group — equivalent to root access on the host, be aware)
sudo usermod -aG docker $USER
newgrp docker
```

### Rootless mode
Runs the daemon and containers entirely as an unprivileged user — no `root`-owned `dockerd`, reducing the blast radius if the daemon or a container is compromised.
```bash
# Install rootless Docker (separate daemon instance per user, own socket, own cgroup slice)
curl -fsSL https://get.docker.com/rootless | sh

# Rootless daemon listens on a per-user socket, not the system-wide one
export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock
```
Trade-offs: some features are limited or need extra setup (certain network drivers, binding ports <1024 requires `setcap` or a proxy, older kernels may lack `cgroup v2` delegation). Use it when running Docker on shared/multi-tenant hosts or where root daemon access is a compliance concern.

---

## 5. Core Concepts Glossary

| Term | Definition |
|---|---|
| **Image** | An immutable, read-only template built from a `Dockerfile` — a stack of filesystem layers plus metadata (entrypoint, env, exposed ports). |
| **Container** | A running (or stopped) instance of an image — image layers plus a thin writable layer on top, plus an isolated process/network/mount namespace. |
| **Layer** | A single filesystem diff produced by one Dockerfile instruction (mainly `RUN`, `COPY`, `ADD`). Layers are content-addressed and cached/shared across images. |
| **Registry** | A server that stores and distributes images (Docker Hub, GHCR, ECR, GCR, Harbor, a private registry). Organized into repositories, each holding tagged versions of an image. |
| **Repository** | A named collection of related image tags in a registry, e.g. `library/nginx` or `myorg/myapp`. |
| **Tag** | A human-readable pointer to a specific image version within a repository, e.g. `nginx:1.27-alpine`. `latest` is just a tag, not a special "always newest" marker — treat it with suspicion in production. |
| **Digest** | A content-addressable SHA256 hash of an image manifest — immutable, unlike tags. Pin production deploys to a digest (`image@sha256:...`) for true reproducibility. |
| **Dockerfile** | The declarative build recipe: a text file of instructions (`FROM`, `RUN`, `COPY`, `CMD`, ...) that `docker build` turns into an image. |
| **Volume** | Docker-managed persistent storage, decoupled from any single container's lifecycle. |
| **Bind mount** | A host filesystem path mounted directly into a container. |
| **Namespace (kernel)** | Linux kernel feature providing per-container isolated views of PIDs, network, mounts, users, hostname, IPC. |
| **cgroups** | Linux kernel feature that limits and accounts for resource usage (CPU, memory, I/O) per container. |
| **OCI** | Open Container Initiative — the spec governing image format and runtime behavior, ensuring cross-vendor compatibility. |

---

## 6. Docker Notes in This Folder

| File | Covers |
|---|---|
| [commands.md](commands.md) | Docker CLI cheatsheet — container/image/network/volume/compose commands, cleanup, auth |
| [docker-more.md](docker-more.md) | Volume drivers (NFS, rexray, portworx, etc.), multi-stage builds, `Dockerfile.lock` |
| [dockerfile-deep-dive.md](dockerfile-deep-dive.md) | Every Dockerfile instruction, build context/`.dockerignore`, layer caching, BuildKit, buildx multi-platform builds, image size optimization, production Dockerfile example |
| [docker-networking.md](docker-networking.md) | Network drivers (bridge/host/none/overlay/macvlan), user-defined bridges, DNS, port publishing, `docker network` commands, troubleshooting |
| [docker-storage-and-volumes.md](docker-storage-and-volumes.md) | Volumes vs bind mounts vs tmpfs, named/anonymous volumes, `--mount` vs `-v`, backup/restore, stateful container patterns |
| [docker-compose.md](docker-compose.md) | Multi-container app definitions, `docker-compose.yml` structure, service dependencies, environments |
| [docker-swarm.md](docker-swarm.md) | Native Docker orchestration — swarm mode, services, stacks, scaling |
| [docker-security.md](docker-security.md) | Image scanning, least-privilege containers, secrets, seccomp/AppArmor, rootless, supply-chain hardening |
| [docker-registries-and-distribution.md](docker-registries-and-distribution.md) | Docker Hub vs private registries (Harbor, ECR, GCR, GHCR), image distribution, signing/verification |
| [docker-production-and-orchestration.md](docker-production-and-orchestration.md) | Running Docker in production, orchestration options, multi-host overlay networking, scaling patterns |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
