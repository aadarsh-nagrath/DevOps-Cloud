# Docker Security

Hardening containers in depth — kernel isolation model, non-root execution, capability dropping, seccomp/AppArmor, image signing, secrets, and resource limits. See also [docker.md](docker.md) for the overview and [dockerfile-deep-dive.md](dockerfile-deep-dive.md) for build-time practices.

---

## 1. Containers Are Not VMs — The Shared-Kernel Model

Containers share the **host kernel**; they are isolated processes, not separate machines:

```
+-----------------------------------------------------+
|                     Host Kernel                       |
|  (namespaces, cgroups, seccomp, capabilities, LSMs)   |
+-----------------------------------------------------+
|  Container A  |  Container B  |  Container C  |  ... |
|  (processes)  |  (processes)  |  (processes)  |      |
+-----------------------------------------------------+
```

- A VM virtualizes hardware and runs its own kernel — the hypervisor is the isolation boundary.
- A container is isolated via Linux **namespaces** (PID, net, mnt, uts, ipc, user) and **cgroups** (resource limits), but a kernel-level bug or misconfiguration can let a process see or affect the host.
- Consequence: a **kernel exploit or a misconfigured container can break out to the host** — isolation is process-level, not hardware-level. Every security control below exists to shrink that attack surface.
- Rule of thumb: treat container isolation as "good process sandboxing," not "guest OS in a jail." Never run genuinely untrusted code in a container assuming VM-grade isolation — use gVisor/Kata Containers (VM-backed runtimes) or a real VM for that.

---

## 2. Run As Non-Root

By default, unless overridden, the main process inside a container runs as **root (UID 0)** — this is root *inside the container's user namespace*, but if user namespace remapping isn't configured, that UID 0 maps directly to UID 0 on the host's view of container-owned files/processes.

### Why root-in-container is dangerous even without a breakout
- Any file the container can write (via a bind mount, volume, or misconfigured host path) is written as **host root** if remapping isn't in use.
- A container-level vulnerability (e.g., arbitrary file write in the app) becomes a host-root file write.
- Many container escape CVEs specifically require root inside the container as a precondition.

### Set a non-root user in the Dockerfile
```dockerfile
FROM node:20-slim

# Create an unprivileged user/group with fixed IDs (reproducible across builds)
RUN groupadd -r appgroup && useradd -r -g appgroup -u 1001 appuser

WORKDIR /app
COPY --chown=appuser:appgroup . .

USER appuser        # all subsequent RUN/CMD/ENTRYPOINT run as this user
CMD ["node", "server.js"]
```

### Override at runtime with `--user`
```bash
# Force a specific UID:GID even if the image's Dockerfile didn't set USER
docker run --user 1001:1001 myapp

# Run as an unnamed UID with no matching /etc/passwd entry — fine for many apps,
# breaks tools that call getpwuid() to resolve $HOME
docker run --user 1001 myapp
```

> If the base image only ships a root user, prefer fixing it in the Dockerfile with `USER`, not just at `docker run` time — the flag is easy to forget in ad hoc runs and CI.

---

## 3. Read-Only Root Filesystem

Mount the container's root filesystem read-only so a compromised process can't modify the app, install tooling, or persist malware on disk.

```bash
docker run --read-only myapp
# Fails at runtime if the app tries to write anywhere on the root fs (e.g. /tmp, cache dirs)
```

Most apps need *some* writable scratch space — mount `tmpfs` (in-memory, wiped on container stop) for just those paths:

```bash
docker run --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --tmpfs /app/cache:rw,size=32m \
  myapp
```

| Flag on tmpfs | Purpose |
|---|---|
| `rw` | Writable (still read-only everywhere else) |
| `noexec` | Prevents executing binaries dropped into this path — blocks a common post-exploit step |
| `nosuid` | Ignores setuid/setgid bits on binaries in this path |
| `size=64m` | Caps memory used, preventing an attacker (or bug) from exhausting host RAM via tmpfs writes |

In Compose:
```yaml
services:
  app:
    image: myapp
    read_only: true
    tmpfs:
      - /tmp:size=64m,noexec,nosuid
```

---

## 4. Drop Linux Capabilities

Docker grants containers a reduced-but-still-broad default capability set (not full root, but more than most apps need). Drop everything and add back only what's required.

```bash
# Start with nothing, add back only what the app truly needs
docker run --cap-drop=ALL --cap-add=NET_BIND_SERVICE myapp
```

### Dangerous capabilities in the default set (drop unless proven necessary)
| Capability | Why it's dangerous |
|---|---|
| `NET_RAW` | Allows crafting raw sockets — ARP spoofing, packet sniffing, some DoS techniques |
| `SYS_CHROOT` | Can be leveraged in container-escape chains |
| `SETUID` / `SETGID` | Lets a process change its own UID/GID — privilege escalation primitive if combined with a writable setuid binary |
| `CHOWN` | Change file ownership — bypasses filesystem-based access assumptions |
| `DAC_OVERRIDE` | Bypasses standard file read/write/execute permission checks entirely |
| `FSETID` | Preserves setuid/setgid bits across file modification — escalation aid |

### Capabilities to almost never add
| Capability | Risk if granted |
|---|---|
| `SYS_ADMIN` | "God mode" — mount filesystems, load kernel modules, huge escape surface. Nearly always a sign the container should be redesigned, not granted this. |
| `SYS_PTRACE` | Debug/inspect other processes — can read secrets out of sibling process memory |
| `SYS_MODULE` | Load/unload kernel modules — direct path to full host compromise |

```bash
# Typical minimal-privilege pattern for a web app binding to a low port
docker run --cap-drop=ALL --cap-add=NET_BIND_SERVICE -p 80:80 myapp

# List what a running container currently holds
docker inspect --format='{{.HostConfig.CapAdd}} {{.HostConfig.CapDrop}}' <container>
```

---

## 5. Seccomp Profiles

Seccomp (secure computing mode) filters which **syscalls** a container's processes may invoke — most container escapes and kernel exploits go through a specific syscall the app never legitimately needs (e.g., `mount`, `reboot`, `keyctl`, `ptrace`).

- Docker applies a **default seccomp profile** automatically that already blocks ~44 dangerous syscalls out of ~300+, with no configuration needed.
- You rarely need to disable it; you occasionally need a **custom, stricter** profile for a hardened service, or a **relaxed** one for an application that legitimately needs an unusual syscall (e.g., some database engines, `strace`-based tooling).

```bash
# Explicitly use Docker's default profile (this is already the default; shown for clarity)
docker run --security-opt seccomp=default.json myapp

# Apply a custom, stricter profile
docker run --security-opt seccomp=./custom-seccomp.json myapp

# Disable seccomp entirely — last resort, only for trusted debugging containers
docker run --security-opt seccomp=unconfined myapp
```

Minimal custom profile shape (deny-by-default, allow-list specific syscalls):
```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "architectures": ["SCMP_ARCH_X86_64"],
  "syscalls": [
    { "names": ["read", "write", "open", "close", "exit", "exit_group"], "action": "SCMP_ACT_ALLOW" }
  ]
}
```
Building these by hand is tedious — generate a starting point by tracing a real workload with tools like `strace` or Falco's syscall auditing, then lock it down.

---

## 6. AppArmor / SELinux with Docker

Linux Security Modules (LSMs) add mandatory access control on top of namespaces/capabilities/seccomp — they restrict what a process can do to *specific files, paths, and network operations*, even if the capability/seccomp checks would allow it.

| | AppArmor | SELinux |
|---|---|---|
| Distros | Ubuntu, Debian, SUSE (default enabled) | RHEL, CentOS, Fedora (default enabled) |
| Model | Path-based profiles | Label-based (type enforcement) |
| Docker default | `docker-default` profile applied automatically | `container_t` type applied automatically when enabled |

```bash
# AppArmor: apply a custom profile (must be loaded into the kernel first via apparmor_parser)
docker run --security-opt apparmor=my-custom-profile myapp

# AppArmor: check the profile a running container is confined by
docker inspect --format='{{.AppArmorProfile}}' <container>

# SELinux: label a bind mount so the container's SELinux context can access it
docker run -v /data:/data:z myapp     # :z = shared label, :Z = private/unshared label

# SELinux: run with a specific type/level
docker run --security-opt label=type:container_t myapp
```
Don't disable AppArmor/SELinux to "fix" a permission error — that's removing a real security layer. Diagnose with `journalctl` / `ausearch -m avc` and adjust the profile/policy instead.

---

## 7. `--privileged` — Avoid It

```bash
docker run --privileged myapp   # grants ALL capabilities, disables seccomp, disables AppArmor/SELinux confinement, gives access to all host devices
```

`--privileged` effectively removes every isolation layer covered in sections 4–6 at once. It is functionally close to running the process directly on the host as root. Legitimate uses are narrow (Docker-in-Docker CI runners, certain hardware/device-passthrough tooling) — and even then, prefer scoped alternatives:

```bash
# Instead of --privileged for device access, grant just the device needed
docker run --device=/dev/ttyUSB0 myapp

# Instead of --privileged for DinD, prefer rootless Docker or a sidecar with only
# the specific capability required (e.g. --cap-add=SYS_ADMIN scoped to one mount need)
```

---

## 8. Docker Content Trust / Image Signing

Verify that an image was published by whom you expect and hasn't been tampered with in the registry.

```bash
# Enable Docker Content Trust for the current shell — pull/push/build enforce signature verification
export DOCKER_CONTENT_TRUST=1

docker pull myregistry/myapp:1.4.0   # fails if the tag isn't signed
docker push myregistry/myapp:1.4.0   # signs on push using a local signing key
```

DCT (built on Notary/TUF) is being superseded in practice by **Sigstore/cosign**, which signs images without needing a long-lived private key on disk (keyless signing via OIDC identity):

```bash
# Sign an image after pushing it (keyless — ties the signature to your CI identity/OIDC token)
cosign sign myregistry/myapp:1.4.0

# Verify a signature before deploying
cosign verify --certificate-identity=ci@example.com \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  myregistry/myapp:1.4.0
```
In a CI/CD pipeline: sign at push time, verify at deploy/admission time (e.g., a Kubernetes admission controller like Kyverno or Connaisseur rejecting unsigned images).

---

## 9. Image Vulnerability Scanning

Scan images for known-vulnerable packages (CVEs in OS packages and language dependencies) before they ship.

```bash
# Docker Scout — built into modern Docker CLI, no separate install
docker scout cves myapp:1.4.0
docker scout quickview myapp:1.4.0     # summary of vulnerabilities + base image recommendations
docker scout compare myapp:1.4.0 --to myapp:1.3.0   # diff vulnerabilities between versions

# Trivy — fast, widely used, works on images, filesystems, and IaC
trivy image myapp:1.4.0
trivy image --severity HIGH,CRITICAL --exit-code 1 myapp:1.4.0   # fail CI on high/critical findings

# Grype — Anchore's scanner, good SBOM integration (pairs with Syft for SBOM generation)
grype myapp:1.4.0
syft myapp:1.4.0 -o spdx-json > sbom.json   # generate a Software Bill of Materials first
```
Wire one of these into CI as a gate (`--exit-code 1` on Trivy, or equivalent) rather than running it manually — the value is catching regressions before merge, not after deploy.

---

## 10. Secrets Management — Done Right vs Wrong

### Wrong — secrets baked into the image or exposed via `ENV`/build args
```dockerfile
# NEVER do this — the secret lands in an image layer, readable forever via `docker history`
# or by anyone who pulls the image, even after the file is later deleted in a later layer.
ENV API_KEY=sk-live-abc123
COPY .env .env
RUN curl -H "Authorization: Bearer sk-live-abc123" https://api.example.com/setup
```
`docker history --no-trunc` and simple layer extraction (`docker save` + `tar`) will recover any value that ever touched a layer, even if a later `RUN rm` deletes the file — the earlier layer still has it.

### Right — BuildKit build secrets (never persisted to a layer)
```dockerfile
# syntax=docker/dockerfile:1
FROM alpine
RUN --mount=type=secret,id=api_key \
    API_KEY=$(cat /run/secrets/api_key) && \
    curl -H "Authorization: Bearer $API_KEY" https://api.example.com/setup
    # secret file exists only for this RUN step, never committed to the image filesystem
```
```bash
docker build --secret id=api_key,src=./api_key.txt -t myapp .
```

### Right — runtime secrets
```bash
# Docker Swarm secrets — encrypted at rest, mounted as tmpfs files, never as env vars
echo "supersecret" | docker secret create db_password -
docker service create --secret db_password myapp

# Kubernetes: use a Secret object mounted as a volume (not env vars, which leak via
# `kubectl describe pod`, /proc/<pid>/environ, and crash dumps more easily)
```
For config-management-driven secret storage/retrieval (e.g., pulling a DB password into a deploy step), see [Ansible Vault notes](../Configuration%20Management/ansible/vault-and-security.md) — the same "never plaintext at rest, decrypt only at point of use" principle applies.

| | Wrong | Right |
|---|---|---|
| Build-time | `ENV`, `ARG`, `COPY` of secret files | `--mount=type=secret` (BuildKit) |
| Runtime | Plaintext env vars in Compose/run command | Swarm secrets, Kubernetes Secrets, Vault-issued short-lived creds |
| Storage | Committed `.env` files, secrets in image layers | Secret manager (Vault, AWS Secrets Manager, SOPS-encrypted files) |

---

## 11. Resource Limits As a Security Boundary

Without limits, a single compromised or buggy container can exhaust host memory/CPU/PIDs, taking down every other workload on the host — a denial-of-service that doesn't require a kernel exploit at all.

```bash
docker run \
  --memory=512m \          # hard memory cap; OOM-killed if exceeded, can't starve the host
  --memory-swap=512m \     # equal to --memory disables swap use, preventing swap-based slowdowns
  --cpus=1.0 \             # caps CPU to 1 core-equivalent, limits noisy-neighbor / cryptomining impact
  --pids-limit=100 \       # caps process count — stops a fork bomb from exhausting host PIDs
  myapp
```

- `--pids-limit` is the direct mitigation for fork-bomb-style DoS (`:(){ :|:& };:`) — without it, one container can exhaust the host's total PID table and disrupt every other container.
- Treat resource limits as mandatory on any container that runs code you don't fully control (multi-tenant build runners, user-submitted code execution, etc.), not just a performance tuning knob.

---

## 12. Network Segmentation for Security

- Put unrelated services on **separate user-defined networks**; don't run everything on the default bridge where all containers can reach each other.
- Expose only the ports that need to be reachable from outside (`-p 443:443`), and let internal service-to-service traffic happen over an internal network with no published host ports.
- Use `internal: true` networks in Compose for tiers (e.g., database) that should never be reachable from outside the Docker host at all.
- Full network-model details, including bridge/overlay/host modes, are in [docker-networking.md](docker-networking.md) — this section is the security angle on top of that model: least-privilege network topology, not just connectivity.

---

## 13. Secure Dockerfile Checklist

| Check | Why |
|---|---|
| Pin base image to a digest or exact version, not `:latest` | Reproducible, avoids surprise upstream changes (see also [docker-more.md](docker-more.md) on `Dockerfile.lock`) |
| Use a minimal base (`-slim`, `-alpine`, or distroless) | Smaller attack surface, fewer packages to have CVEs |
| Add a non-root `USER` before `CMD`/`ENTRYPOINT` | Limits blast radius of an app-level compromise |
| Multi-stage build; don't ship build tools/compilers in the final image | Removes tooling an attacker could otherwise use |
| No secrets via `ENV`, `ARG`, or `COPY` of credential files | Layers are permanently recoverable |
| `--read-only` root filesystem + scoped `tmpfs` for writable paths | Blocks persistence/tampering by a compromised process |
| `--cap-drop=ALL`, add back only required capabilities | Removes unnecessary kernel-level privilege |
| Default (or custom, stricter) seccomp profile enabled | Blocks unnecessary/dangerous syscalls |
| Never `--privileged` in production | Preserves every isolation layer above |
| Image scanned in CI (Trivy/Grype/Docker Scout), gated on HIGH/CRITICAL | Catches known CVEs before deploy |
| Image signed (cosign/DCT), signature verified at deploy | Prevents tampered/spoofed images from running |
| `--memory`, `--cpus`, `--pids-limit` set | Bounds blast radius of DoS/runaway processes |
| Service on a least-privilege user-defined network | Limits lateral movement if one container is compromised |
| `HEALTHCHECK` defined | Not itself a security control, but lets orchestrators evict a compromised/crashed instance automatically |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
