# Docker Production and Orchestration

Running containers reliably in production — health checks, logging, resource management, restart policies, monitoring — and where Docker's own tooling stops and full orchestration platforms take over. See also [docker.md](docker.md), [docker-compose.md](docker-compose.md), [docker-swarm.md](docker-swarm.md), and [docker-security.md](docker-security.md).

---

## 1. Health Checks Done Right

### `HEALTHCHECK` instruction
```dockerfile
FROM myapp-base

# --interval: how often to check | --timeout: max time per check before it counts as failed
# --start-period: grace time after container start before failures count (avoids false negatives during boot)
# --retries: consecutive failures needed before marking the container "unhealthy"
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1
```
```bash
docker ps                                  # STATUS column shows (healthy)/(unhealthy)/(starting)
docker inspect --format='{{json .State.Health}}' <container> | jq   # full check history
```
A container that hangs or wedges (not crashed, just unresponsive) will show as `Up` in `docker ps` without a HEALTHCHECK — orchestrators have nothing to act on. With one defined, Swarm/Compose (with `depends_on: condition: service_healthy`) and monitoring tools can detect and react to the wedged state.

### Liveness vs readiness
These are distinct questions that a single `HEALTHCHECK` in plain Docker conflates into one signal:

| | Liveness | Readiness |
|---|---|---|
| Question | "Is this process alive and not deadlocked?" | "Can this instance currently serve traffic?" |
| Failure action | Restart/kill the container | Remove from load balancer rotation, but don't restart |
| Example check | Process responds to any request at all | Dependencies (DB, cache) are reachable, warm-up/cache-fill complete |

Docker's single `HEALTHCHECK` only maps to something like "unhealthy → orchestrator may restart," closer to a liveness probe. It has no native readiness concept (no "remove from rotation but keep running" state).

### Mapping to Kubernetes probes
Kubernetes splits this explicitly — `livenessProbe` (restart on failure) and `readinessProbe` (pull from Service endpoints on failure, no restart), plus `startupProbe` for slow-starting apps (equivalent to Docker's `--start-period`, but as its own gate). When migrating a Dockerized app to Kubernetes, split your `HEALTHCHECK` logic into these three, rather than reusing one endpoint for all — see [Kubernetes notes](../Kubernetes/kubernetes.md) for probe configuration details.

---

## 2. Logging Drivers

Docker's logging driver determines where a container's stdout/stderr goes and how it's retained.

| Driver | Behavior | Risk / fit |
|---|---|---|
| `json-file` (default) | Writes JSON-wrapped log lines to disk per container | **Unbounded by default — will fill the host disk** if not rotated; fine for dev, dangerous unconfigured in prod |
| `journald` | Sends logs to the host's systemd-journal | Integrates with existing systemd-based log tooling, supports structured queries via `journalctl` |
| `syslog` | Forwards to a syslog daemon (local or remote) | Good for centralizing across a fleet using existing syslog infra |
| `gelf` | Sends structured logs to a Graylog/Logstash GELF endpoint | Good fit for ELK/Graylog-centric stacks, supports structured fields |
| `none` | Discards all logs | Only when logging is handled entirely inside the app/container (e.g., app ships logs directly to a remote sink) |

### Disk-fill risk with the default driver
```bash
# Without rotation, json-file logs grow forever — a noisy/crash-looping container can fill the disk
docker run -d myapp    # uses json-file with no size cap by default on older Docker versions
```

### Rotation config
```bash
docker run -d \
  --log-driver json-file \
  --log-opt max-size=10m \     # rotate once a log file hits 10MB
  --log-opt max-file=3 \       # keep at most 3 rotated files (30MB total ceiling per container)
  myapp
```
Or globally in `/etc/docker/daemon.json` so every container gets sane defaults without remembering the flags:
```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
```

### Centralized logging
```bash
# Forward directly to a remote syslog/GELF collector instead of writing locally at all
docker run -d --log-driver gelf --log-opt gelf-address=udp://logs.example.com:12201 myapp
```
For multi-host fleets, prefer a sidecar/daemonset log shipper (Fluentd, Vector, Filebeat) reading from the host's log directory or via the driver above, over configuring each container individually — centralizes retention/rotation policy in one place.

---

## 3. Resource Management in Production

```bash
docker run -d \
  --memory=1g \            # hard cap; process is OOM-killed by the kernel if exceeded
  --memory-swap=1g \        # equal to --memory means zero swap usage allowed (recommended for latency-sensitive apps)
  --cpus=2.0 \              # cap to 2 core-equivalents; throttled via CFS quota once exceeded, not killed
  --cpu-shares=1024 \       # relative weight vs other containers during CPU contention (default 1024 = normal priority)
  myapp
```

| Flag | What it controls | Failure mode when exceeded |
|---|---|---|
| `--memory` | Hard memory ceiling | OOM killer terminates the container's main process (exit code 137) |
| `--memory-swap` | Memory + swap ceiling (`--memory-swap` = `--memory` → swap disabled) | Same OOM behavior, no swap thrashing |
| `--cpus` | Absolute CPU core-equivalent cap | Throttled (slower), not killed |
| `--cpu-shares` | Relative priority under contention only (no effect if CPU isn't contended) | Gets proportionally less CPU time vs higher-share siblings |

### OOM killer behavior in containers
- The Linux OOM killer operates per-cgroup when a container hits its `--memory` limit — it kills the container's main process, Docker reports exit code `137` (128 + SIGKILL 9).
- Without `--memory` set, a runaway container competes for host-wide memory and can trigger the **host's** OOM killer, which may kill an unrelated process (including, in bad cases, the Docker daemon itself) rather than the offending container.
- Always set explicit memory limits in production — an unbounded container is a shared-host stability risk, not just a self-contained one.

---

## 4. Restart Policies

```bash
docker run -d --restart unless-stopped myapp
```

| Policy | Behavior | Typical use |
|---|---|---|
| `no` (default) | Never restart automatically | One-off jobs, debugging |
| `on-failure[:max-retries]` | Restart only on non-zero exit; optional retry cap | Batch/worker jobs that should retry transient failures but not loop forever |
| `always` | Always restart, including after a manual `docker stop` followed by daemon/host restart | Long-running services that should always be up, even across host reboots |
| `unless-stopped` | Like `always`, but respects an explicit manual stop — won't restart on daemon/host restart if you'd manually stopped it before that | Most production long-running services — the common default |

`on-failure` is the only policy with a retry cap (`--restart on-failure:5`); `always`/`unless-stopped` retry indefinitely, which is usually correct for a supervised service but means a fast crash-loop will spin the CPU restarting rapidly unless paired with a `HEALTHCHECK`-aware orchestrator or backoff at the app level.

---

## 5. Monitoring Containers

```bash
# Live resource usage snapshot across all running containers
docker stats
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
```

For anything beyond ad hoc checks, use a metrics pipeline:

- **cAdvisor** (Container Advisor) — runs as its own container, scrapes per-container CPU/memory/network/disk stats from the kernel/cgroups, exposes them for scraping.
- **Prometheus node-exporter** — host-level metrics (disk, network, host memory) complementing container-level metrics.
- **Prometheus + cAdvisor** — the common self-hosted pattern: cAdvisor exposes a `/metrics` endpoint, Prometheus scrapes it, Grafana visualizes it.

```yaml
# Minimal docker-compose snippet wiring cAdvisor for Prometheus scraping
services:
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.47.0
    ports:
      - "8080:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    privileged: true   # cAdvisor needs broad host visibility to read cgroup/container metrics — isolate this host accordingly
```
At true production scale, this pattern is usually replaced outright by a Kubernetes cluster's built-in metrics pipeline (kubelet cAdvisor integration + metrics-server + Prometheus Operator) rather than hand-wiring it per Docker host.

---

## 6. Container Orchestration Landscape

| | Docker Compose | Docker Swarm | Kubernetes | Nomad |
|---|---|---|---|---|
| Complexity | Low | Low–Medium | High | Medium |
| Multi-host | No (single host) | Yes, built-in | Yes, built-in | Yes, built-in |
| Scale (typical) | Single dev/small prod host | Small–medium clusters | Small to massive (thousands of nodes) | Small to large, simpler than k8s at similar scale |
| Ecosystem | Huge (dev workflows), minimal orchestration tooling | Small, largely stagnant | Enormous (Helm, Operators, service meshes, CNCF landscape) | Smaller, HashiCorp ecosystem (Consul, Vault integration) |
| Scheduling/self-healing | None (manual restart policy only) | Basic (service replicas, rolling updates) | Advanced (affinity, taints/tolerations, HPA/VPA, custom schedulers) | Solid (bin-packing, constraints), simpler model than k8s |
| Learning curve | Very low | Low | Steep | Moderate |
| When to pick | Local dev, single-host small deployments, CI test environments | Rare today — simple multi-host needs where full k8s is overkill and team wants to stay in the Docker CLI mental model | Default choice for serious multi-service, multi-host production at any real scale, or where ecosystem tooling (service mesh, GitOps, operators) matters | Teams already invested in HashiCorp stack, or wanting orchestration without Kubernetes' operational complexity, including non-container workloads (VMs, batch jobs) alongside containers |

Compose and Swarm share the same `docker-compose.yml`-adjacent file format lineage, which is why Swarm is often the "next step" from Compose — but in practice, most teams outgrowing Compose jump straight to Kubernetes rather than through Swarm, given Swarm's stalled ecosystem growth relative to Kubernetes.

---

## 7. Migrating from Compose to Kubernetes

### Kompose
```bash
# Converts an existing docker-compose.yml into a first-pass set of Kubernetes manifests
kompose convert -f docker-compose.yml

# Or convert-and-apply directly against a cluster
kompose up -f docker-compose.yml
```
Treat Kompose's output as a **starting draft**, not a finished manifest set — it typically needs hand-tuning for resource requests/limits, probes, ingress rules, and secret handling before it's production-ready.

### Concept mapping
| Compose concept | Kubernetes equivalent |
|---|---|
| `services.<name>` | `Deployment` (+ `Service` for networking) |
| `image`, `command`, `environment` | `Deployment.spec.template.spec.containers[]` fields |
| `ports` | `Service` + container `ports` |
| `volumes` (named) | `PersistentVolumeClaim` + `PersistentVolume` |
| `networks` | Kubernetes `Namespace`s / `NetworkPolicy` (all pods in a namespace can reach each other by default, unlike Compose's isolated networks) |
| `depends_on` | No direct equivalent — replaced by readiness probes + retry logic in the app, since k8s doesn't guarantee startup order |
| `restart: unless-stopped` | `Deployment` reconciliation loop — implicitly "always desired replicas running" |
| `.env` file / `environment` secrets | `ConfigMap` (non-sensitive) / `Secret` (sensitive) |
| `docker-compose.override.yml` | Kustomize overlays or per-environment Helm values |

---

## 8. CI/CD Patterns for Docker

### Build-tag-push pipeline (generic shape, any CI system)
```yaml
# Conceptual pipeline stages
# 1. checkout
# 2. docker buildx build --platform linux/amd64,linux/arm64 -t $REGISTRY/$IMAGE:$SHA --push .
# 3. trivy image $REGISTRY/$IMAGE:$SHA --exit-code 1 --severity HIGH,CRITICAL   # gate on scan
# 4. cosign sign $REGISTRY/$IMAGE:$SHA                                          # sign the artifact
# 5. deploy step references the immutable $SHA tag, never :latest
```

### Image layer caching in CI
Without cache reuse, every CI run rebuilds every layer from scratch — slow and wasteful for unchanged dependency layers.

```yaml
# GitHub Actions — docker/build-push-action with GitHub Actions cache backend
- uses: docker/setup-buildx-action@v3
- uses: docker/build-push-action@v6
  with:
    context: .
    push: true
    tags: ${{ env.REGISTRY }}/${{ env.IMAGE }}:${{ github.sha }}
    cache-from: type=gha        # reuse layers cached from previous CI runs
    cache-to: type=gha,mode=max # persist all layers (not just final stage) for future runs
```

```yaml
# GitLab CI — registry-backed BuildKit cache
build:
  script:
    - docker buildx build
      --cache-from type=registry,ref=$CI_REGISTRY_IMAGE:buildcache
      --cache-to type=registry,ref=$CI_REGISTRY_IMAGE:buildcache,mode=max
      -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
      --push .
```
`mode=max` caches every intermediate layer (including ones only used by earlier build stages in a multi-stage Dockerfile), not just the layers contributing to the final image — larger cache, but much better hit rate on rebuilds where only a late stage changed.

---

## 9. Production Readiness Checklist

| Check | Why |
|---|---|
| `HEALTHCHECK` defined, liveness/readiness split if deploying to Kubernetes | Lets orchestrators detect and react to unhealthy instances automatically |
| Logging driver configured with rotation (`max-size`, `max-file`) or shipped centrally | Prevents disk exhaustion from unbounded `json-file` growth |
| `--memory` / `--cpus` (or k8s `resources.limits`) set explicitly | Bounds blast radius of runaway/compromised containers, avoids host-wide OOM |
| Restart policy set (`unless-stopped` or orchestrator-native equivalent) | Ensures automatic recovery from crashes without manual intervention |
| Metrics pipeline in place (cAdvisor/Prometheus or platform-native) | Required to detect problems before users report them |
| Immutable image tags (SHA/semver), never `:latest`, in deploy manifests | Reproducible deploys, sane rollbacks |
| Image scanned and gated in CI (Trivy/Grype/Docker Scout) | Blocks known-vulnerable images from reaching production |
| Image signed and verified at deploy (cosign/DCT) | Prevents tampered or spoofed images from running |
| Secrets via Swarm/k8s secrets or Vault, never baked into images/env | Avoids credential leakage via image layers or process listings |
| Build cache wired into CI (`cache-from`/`cache-to`) | Keeps pipeline build times sane as the codebase grows |
| Orchestration platform matches actual scale/team needs (see section 6) | Avoids both under-provisioning (Compose at real multi-host scale) and over-engineering (full k8s for a single-host hobby project) |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
