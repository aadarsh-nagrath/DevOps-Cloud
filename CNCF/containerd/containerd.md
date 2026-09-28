# containerd — Complete Notes

## 1. Beginner

### What is containerd?
- An industry-standard **container runtime** — the layer of software responsible for pulling images, managing filesystems, and starting/stopping/supervising containers.
- Originally extracted out of Docker in 2016 (Docker split its internals into `containerd` + `runc` to modularize the stack), donated to CNCF, **graduated** in 2019.
- Today it's not "part of Docker" so much as the reverse: **Docker Engine itself runs on top of containerd**. containerd is the shared low-level engine that both Docker and Kubernetes now build on.

### The Core Problem It Solves
```
Before a clean runtime layer:
  Docker Engine did EVERYTHING itself: image pull, storage, networking config,
  build, CLI, container lifecycle — one big monolith, hard to reuse pieces of it
  from other tools (like Kubernetes) without dragging in the whole Docker daemon.

After extracting containerd:
  [Docker Engine]  [Kubernetes kubelet]  [nerdctl]  [ctr]
         \                |                 |         |
          \               |                 |         |
           \___________  _|_________________|_________|
                       \ |
                    [containerd]  <- shared, reusable low-level runtime
                       /
                  [runc]  <- actually creates the Linux container (OCI runtime)
```
Kubernetes doesn't need a full Docker installation (dockerd, its CLI, its build system) just to run containers — it only ever needed the part that pulls images and starts containers. containerd is that part, standardized and reusable.

### Core Concepts
| Term | Meaning |
|---|---|
| **High-level runtime** | Manages the full container lifecycle: image pull/unpack, storage, networking setup, supervising the container process — containerd's job |
| **Low-level runtime (OCI runtime)** | Does the actual `namespaces`/`cgroups`/`chroot` syscalls to create an isolated process — `runc` is the reference implementation |
| **CRI (Container Runtime Interface)** | The gRPC API Kubernetes' `kubelet` uses to talk to any compliant runtime, without needing runtime-specific code in kubelet itself |
| **OCI (Open Container Initiative)** | The standards body defining the image format and runtime spec that containerd/runc implement, ensuring any OCI image runs on any OCI-compliant runtime |
| **`ctr`** | containerd's own low-level, bare-bones debugging CLI — not meant for daily driving |
| **`nerdctl`** | A Docker-CLI-compatible frontend for containerd (same command syntax as `docker`, e.g. `nerdctl run`, `nerdctl build`) |
| **containerd namespace** | containerd's own multi-tenancy concept — isolates sets of containers/images from each other *within one containerd daemon* (unrelated to Linux kernel namespaces or Kubernetes namespaces) |

### The Runtime Layering (Why Two Runtimes Exist)
```
kubelet
   |  (CRI, gRPC)
   v
containerd  (high-level: image management, snapshotting, gRPC API, CRI plugin)
   |  (via containerd-shim)
   v
runc        (low-level: OCI runtime — the actual clone()/unshare()/cgroups syscalls)
   |
   v
Linux kernel namespaces + cgroups  (the actual isolation primitives)
```
- containerd never directly executes the container process itself — it delegates to a **shim** process (`containerd-shim-runc-v2`) per container, which in turn invokes `runc` to create the container and then stays alive to keep the container running independent of containerd's own process lifecycle. This means **containerd can restart or be upgraded without killing running containers** — a critical production property.
- Swapping `runc` for a different OCI runtime (e.g., `gVisor`'s `runsc` for stronger sandboxing, or `kata-containers` for VM-level isolation) is a config change, not an architecture change — this pluggability is the entire point of the OCI runtime spec.

### Basic Usage Example (`ctr`)
```bash
# Pull an image into the default namespace
ctr images pull docker.io/library/nginx:alpine

# Run it (foreground)
ctr run --rm docker.io/library/nginx:alpine my-nginx

# List running containers/tasks
ctr containers ls
ctr tasks ls
```

---

## 2. Intermediate

### CRI — How Kubernetes Actually Talks to containerd
- Before Kubernetes 1.24, kubelet talked to Docker through a shim called **dockershim** (because Docker itself didn't speak CRI natively — it predates CRI). This added an extra translation layer and maintenance burden inside Kubernetes itself.
- **dockershim was removed in Kubernetes 1.24.** Since then, kubelet talks **directly** to containerd (or CRI-O) over CRI — no Docker involved at all on the node, unless you separately install Docker for local development convenience.
- containerd ships a built-in **CRI plugin** that implements the CRI gRPC service directly inside the containerd binary — no separate shim process needed for the Kubernetes path (this is what replaced dockershim's role).
```
kubelet --> (CRI gRPC over a unix socket, /run/containerd/containerd.sock)
              --> containerd's built-in CRI plugin
                    --> containerd core (images, snapshots, tasks)
                          --> containerd-shim-runc-v2 --> runc --> container
```

### containerd's Plugin Architecture
containerd is built as a **core gRPC API surrounded by pluggable subsystems** — almost everything beyond the gRPC transport is a plugin:
| Plugin type | Responsibility |
|---|---|
| **Content** | Content-addressable storage for image layers (blobs identified by digest) |
| **Snapshotter** | Manages the filesystem layers containers run on — `overlayfs` (default on Linux), `btrfs`, `devmapper`, `zfs` |
| **Runtime (`io.containerd.runtime.v2`)** | Pluggable shim/OCI-runtime backend — `runc` by default, swappable for `runsc`/`kata` |
| **CRI** | Implements the Kubernetes Container Runtime Interface |
| **Metadata** | Bolt-backed database tracking images, containers, snapshots |
| **Events** | Pub/sub bus other plugins and external tools subscribe to (container start/stop/OOM, etc.) |

This is configured in `/etc/containerd/config.toml`:
```toml
version = 2

[plugins."io.containerd.grpc.v1.cri"]
  sandbox_image = "registry.k8s.io/pause:3.9"

[plugins."io.containerd.grpc.v1.cri".containerd]
  default_runtime_name = "runc"

[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc]
  runtime_type = "io.containerd.runc.v2"

[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc.options]
  SystemdCgroup = true

[plugins."io.containerd.grpc.v1.cri".registry.mirrors."docker.io"]
  endpoint = ["https://registry-1.docker.io"]
```
- `SystemdCgroup = true` is a common gotcha: kubelet and containerd must agree on the cgroup driver (`systemd` vs `cgroupfs`) — a mismatch is one of the most common "kubelet won't join the cluster" issues in kubeadm setups.

### containerd Namespaces (Not Linux/Kubernetes Namespaces)
- containerd has its own internal namespace concept purely for **multi-tenancy within one daemon** — Docker's containerd client uses the `moby` namespace, Kubernetes' CRI plugin uses the `k8s.io` namespace, so images/containers pulled by Docker and by Kubernetes on the same host don't collide or get visibly mixed:
```bash
ctr namespaces ls
# NAME
# k8s.io
# moby   (if Docker is also installed on this host)

ctr --namespace k8s.io containers ls   # see what kubelet's containers actually are
```

### nerdctl — Docker-Compatible Frontend
- `ctr` is intentionally low-level/debugging-only (no build support, minimal UX). **nerdctl** provides the familiar `docker`-style CLI directly on top of containerd:
```bash
nerdctl run -d -p 8080:80 --name web nginx:alpine
nerdctl ps
nerdctl build -t myapp:latest .
nerdctl compose up -d      # docker-compose compatible
```
- nerdctl additionally exposes containerd-native features Docker's CLI doesn't have equivalents for, like lazy-pulling images (via `stargz` snapshotter) and rootless mode as a first-class option.

---

## 3. Advanced

### Snapshotters and Image Layer Management
- containerd uses a **snapshotter** abstraction instead of Docker's older "graphdriver" terminology, but the concept is the same: manage the union/overlay filesystem stacking image layers plus a writable container layer.
- `overlayfs` is the default and generally fastest on modern Linux kernels. `devmapper` and `zfs` exist for specific storage backend requirements. Choice of snapshotter is a per-node config decision (`config.toml`), not per-container.
- **Content-addressable storage**: image layers are stored/deduplicated by content digest (sha256), so identical layers shared across many images are only stored once on disk — this is why pulling a new image that shares a base layer with an existing one is fast.

### Security
- containerd itself runs as a privileged root daemon on the node by default (same trust model as dockerd) — securing it means securing the node: restrict access to `containerd.sock`, since anything that can talk to it can effectively run arbitrary privileged containers.
- **Rootless mode**: containerd and nerdctl both support running entirely as a non-root user (user namespaces map container root to an unprivileged host UID) — reduces blast radius if the container runtime itself is compromised, at some performance/feature cost.
- **Pluggable OCI runtime for stronger isolation**: swap `runc` for `gVisor` (`runsc`, a user-space kernel intercepting syscalls) or `kata-containers` (each container gets a lightweight VM) via `runtimeClassName` in a Kubernetes `Pod` spec — containerd routes that pod to a different configured runtime plugin without kubelet or the app knowing the difference:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: sandboxed-pod
spec:
  runtimeClassName: gvisor
  containers:
    - name: app
      image: nginx:alpine
```
```yaml
# corresponding RuntimeClass object, referencing a containerd runtime configured in config.toml
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
handler: runsc
```

### containerd in the Real World: Who Actually Runs It
- **Every major managed Kubernetes offering** (EKS, GKE, AKS) defaults to containerd as the node container runtime today.
- **Docker Desktop** and **kind** both run containerd under the hood inside their VM/node containers — even developers who only ever type `docker` commands are running containerd two layers down.
- **k3s** (lightweight Kubernetes) embeds containerd directly into the k3s binary itself.

### Debugging containerd Directly (Bypassing kubectl)
When a pod is stuck (`ContainerCreating`, `CrashLoopBackOff` with no useful `kubectl describe` output), dropping to the node and talking to containerd/CRI directly is often the fastest diagnosis path:
```bash
# crictl is the CRI-native equivalent of ctr/nerdctl, ships alongside containerd for exactly this purpose
crictl ps -a                       # all containers, CRI's view (matches what kubelet sees)
crictl pods                        # pod sandboxes
crictl logs <container-id>
crictl inspect <container-id>      # full CRI-level container spec/state
crictl images                      # images containerd has pulled for CRI
```
- `crictl` talks CRI directly (same protocol kubelet uses), so it shows exactly what kubelet sees — more reliable for diagnosing "kubelet thinks this container is unhealthy" than `nerdctl`/`ctr`, which operate on containerd's native API rather than the CRI view.

### Common Failure Modes
| Symptom | Likely cause |
|---|---|
| kubelet fails to register / node NotReady, containerd logs show gRPC errors | `containerd.sock` permissions, or containerd not running/crashed — check `systemctl status containerd` |
| cgroup driver mismatch errors on kubeadm join | kubelet and containerd configured with different cgroup drivers (`systemd` vs `cgroupfs`) — must match, `SystemdCgroup = true` in `config.toml` is the modern default |
| Image pulls fail only inside the cluster, work fine with plain `docker pull` | containerd's own registry mirror/auth config (`config.toml` `[plugins."io.containerd.grpc.v1.cri".registry]`) differs from Docker's `~/.docker/config.json` — they don't share credentials |
| Pod stuck in `ContainerCreating` indefinitely | Sandbox (pause container) image pull failing, or snapshotter/storage issue — check with `crictl pods` / `crictl inspectp` |

---

## Quick Revision — containerd
- High-level container runtime, extracted from Docker in 2016, CNCF graduated 2019 — Docker itself now runs on top of containerd, not the other way around.
- Runtime layering: kubelet → containerd (image mgmt, CRI, snapshotting) → containerd-shim → runc (OCI runtime, actual namespaces/cgroups) → kernel.
- CRI (Container Runtime Interface) is the gRPC contract kubelet uses; dockershim was removed in Kubernetes 1.24, so kubelet talks to containerd directly now.
- Plugin architecture: content store, snapshotter (`overlayfs` default), runtime (pluggable — `runc`/`runsc`/`kata`), CRI plugin, all behind one gRPC API.
- `ctr` = low-level debugging CLI (not for daily use). `nerdctl` = Docker-CLI-compatible frontend. `crictl` = CRI-native debugging tool, shows exactly what kubelet sees.
- containerd namespaces (`k8s.io`, `moby`) are multi-tenancy within one daemon — unrelated to Linux kernel namespaces.
- `RuntimeClass` + `runtimeClassName` lets a single containerd install serve multiple isolation levels (runc, gVisor, Kata) per-pod.
- Every major managed Kubernetes service, Docker Desktop, kind, and k3s all run containerd under the hood by default.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
