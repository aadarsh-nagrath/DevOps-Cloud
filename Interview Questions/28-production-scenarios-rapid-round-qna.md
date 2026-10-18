# Production Scenarios Rapid Round (22 Most-Asked DevOps/SRE Questions) — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. A compact set of the 22 scenario questions that come up again and again in mid–senior DevOps/SRE loops. Each one spans several topics, so the answers pull them together into one walkthrough. Each answer ends with **See also** links to the deeper single-topic Q&A elsewhere in this hub.

---

## Table of Contents
**Linux + Shell Scripting**
1. [Troubleshoot high CPU, memory and disk I/O on a Linux server](#01-how-would-you-troubleshoot-high-cpu-memory-usage-and-disk-io-on-a-linux-server)
2. [Bash: check service health, retry failures, alert on recovery](#02-write-a-bash-script-to-check-service-health-retry-failures-and-alert-on-recovery)

**Docker + Containers**

3. [Container crashes, OOMKilled, image pull failures](#03-how-do-you-troubleshoot-container-crashes-oomkilled-events-and-image-pull-failures)
4. [Multi-stage builds, layers, networking — performance & security](#04-how-do-multi-stage-builds-image-layers-and-docker-networking-affect-performance-and-security)

**Kubernetes**

5. [Pending / CrashLoopBackOff / ImagePullBackOff](#05-a-pod-is-stuck-in-pending-crashloopbackoff-or-imagepullbackoff-how-do-you-debug-it)
6. [Requests, limits, HPA and Cluster Autoscaler together](#06-how-do-requests-limits-hpa-and-cluster-autoscaler-work-together)
7. [Helm releases, rollback, configuration management](#07-how-do-helm-releases-rollback-and-configuration-management-work)
8. [Service, Ingress, DNS and NetworkPolicy failures](#08-how-would-you-troubleshoot-service-ingress-dns-and-network-policy-failures)

**CI/CD**

9. [Pipeline that suddenly fails](#09-how-do-you-debug-a-jenkins-github-actions-or-gitlab-ci-pipeline-that-suddenly-fails)
10. [Zero-downtime deploys, automated rollback, approval gates](#10-how-do-you-implement-zero-downtime-deployments-automated-rollback-and-approval-gates)

**Cloud + Infrastructure**

11. [Highly available infrastructure on AWS/Azure/GCP](#11-how-would-you-design-highly-available-infrastructure-across-aws-azure-or-gcp)
12. [IAM roles, LBs, Auto Scaling and DR together](#12-how-do-iam-roles-load-balancers-auto-scaling-and-disaster-recovery-work-together)

**Terraform + IaC**

13. [Remote state, locking, concurrent runs](#13-how-do-you-manage-remote-state-state-locking-and-concurrent-terraform-runs)
14. [Detect and resolve drift without outages](#14-how-do-you-detect-and-resolve-infrastructure-drift-without-causing-outages)

**Monitoring + Observability**

15. [Prometheus + Grafana for a latency spike](#15-how-would-you-use-prometheus-and-grafana-to-investigate-a-production-latency-spike)
16. [Logs, metrics, traces via OpenTelemetry](#16-how-do-logs-metrics-and-traces-integrate-through-opentelemetry)
17. [SLIs, SLOs, error budgets](#17-how-do-you-define-slis-slos-and-error-budgets-for-an-sre-team)

**Security + DevSecOps**

18. [Secrets across CI/CD and Kubernetes](#18-how-do-you-manage-secrets-securely-across-cicd-pipelines-and-kubernetes)
19. [Image, dependency and IaC scans in CI/CD](#19-how-would-you-integrate-image-scanning-dependency-checks-and-iac-security-scans-into-cicd)

**Coding / Scenario**

20. [Bash: find failed services and restart them safely](#20-write-a-bash-script-to-identify-failed-services-and-restart-them-safely)
21. [Latency up after a deploy — investigate and roll back](#21-production-latency-suddenly-increases-after-deployment-how-would-you-investigate-and-roll-back)
22. [Design a secure, autoscaling K8s platform with HA, monitoring, DR](#22-design-a-secure-autoscaling-kubernetes-platform-with-ha-monitoring-and-disaster-recovery)

---

## 🔹 Linux + Shell Scripting

### 01. How would you troubleshoot high CPU, memory usage and disk I/O on a Linux server?
Work from a quick overall view down to the single process, and keep evidence as you go. A common opening is the **USE method** (Utilization, Saturation, Errors) applied to each resource.

**1. Triage in 60 seconds:**
```bash
uptime                      # load average vs. nproc — load 16 on 4 cores = saturated
dmesg -T | tail -50         # OOM kills, disk errors, NIC resets
vmstat 1 5                  # r (run queue), b (blocked on I/O), si/so (swap), wa (iowait), st (steal)
mpstat -P ALL 1 3           # one core pegged = single-threaded hot loop; all cores = real load
iostat -xz 1 3              # %util, await, aqu-sz per device
free -h; df -h; df -i       # memory, disk space AND inodes
top / htop                  # who is it
```

**2. High CPU:**
- Split by type. High `us` means application code. High `sy` points to syscalls or context switching (see `pidstat -w`). High `wa` means it's really a disk problem. High `st` means a noisy neighbor or burstable-instance credits ran out (common on AWS t3).
- Find the culprit: `top -o %CPU`, `pidstat -u 1`, then per thread with `top -H -p <pid>`.
- Go deeper: `perf top -p <pid>`. For the JVM, use `jstack` and match the hot thread ID in hex. For Python, use `py-spy dump`. Use `strace -c -p <pid>` to get syscall counts.
- High load with low CPU usually means processes are in **D state** (uninterruptible I/O wait), often from NFS or a dying disk: `ps -eo state,pid,cmd | grep ^D`.

**3. High memory:**
- `free -h`: read **available**, not "free". Linux uses spare RAM for page cache, and that's healthy.
- `ps aux --sort=-rss | head` or `smem -rk` to see who holds the memory. Leak test: is RSS climbing steadily over time? (`pidstat -r 1`.)
- Swapping (`si/so` > 0 in vmstat) slows everything down. Check `dmesg | grep -i oom` for OOM-killer victims, and `/proc/<pid>/status` for VmRSS/VmSwap.
- In containers, the cgroup limit matters, not host RAM: `cat /sys/fs/cgroup/memory.max` and `memory.current`.

**4. High disk I/O:**
- `iostat -xz 1`: high `%util` plus high `await` means the device is saturated. On cloud volumes, check whether you've hit the provisioned **IOPS/throughput** ceiling or burst balance (EBS gp2/st1 credits).
- Find the process: `iotop -oPa` and `pidstat -d 1`. Find the files: `lsof -p <pid>`, or `fatrace`.
- Common causes: runaway logging, a missing DB index causing full scans, a backup or cron job (`updatedb`, logrotate compress) running during peak, swap thrashing that looks like disk I/O.
- Disk full but `du` doesn't add up: a deleted file is still held open. Find it with `lsof +L1` and restart that process (or truncate via `/proc/<pid>/fd/N`).

**5. Fix and prevent:** short term, kill/restart the process or throttle it (`renice`, `ionice -c3`, cgroup limits). Long term, fix the root cause (query, leak, log level), right-size the instance or volume, and alert on **saturation** (load/cores, iowait, PSI in `/proc/pressure/*`), not just raw usage.

**See also:** [01 Linux](./01-linux-and-scripting-qna.md) (performance troubleshooting section), [18 Practical scripting](./18-practical-scripting-challenges-qna.md).

---

### 02. Write a Bash script to check service health, retry failures and alert on recovery.
What the interviewer wants to see: **strict mode, retries with backoff, alerts only when state changes (no alert storms), and a recovery alert**.

```bash
#!/usr/bin/env bash
# healthcheck.sh — check an HTTP endpoint, retry with backoff, alert on DOWN and on RECOVERY.
# Usage: URL=https://api.example.com/healthz SLACK_WEBHOOK=... ./healthcheck.sh   (run from cron / systemd timer)
set -euo pipefail

URL="${URL:?set URL}"
SERVICE="${SERVICE:-$(basename "$URL")}"
RETRIES="${RETRIES:-3}"
TIMEOUT="${TIMEOUT:-5}"
STATE_FILE="${STATE_FILE:-/var/tmp/health_${SERVICE//[^a-zA-Z0-9]/_}.state}"

log()   { echo "$(date -Is) [$SERVICE] $*"; }
alert() {
  log "ALERT: $1"
  [[ -n "${SLACK_WEBHOOK:-}" ]] && curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
    -d "{\"text\":\"[$SERVICE] $1\"}" "$SLACK_WEBHOOK" >/dev/null || true
}

check() { curl -fsS -o /dev/null -m "$TIMEOUT" "$URL"; }

healthy=false
for ((i = 1; i <= RETRIES; i++)); do
  if check; then healthy=true; break; fi
  log "attempt $i/$RETRIES failed"
  (( i < RETRIES )) && sleep $(( 2 ** i ))          # 2s, 4s, 8s ... exponential backoff
done

prev="$(cat "$STATE_FILE" 2>/dev/null || echo UP)"
now=$([[ $healthy == true ]] && echo UP || echo DOWN)
echo "$now" > "$STATE_FILE"

# Alert only on transitions — avoids paging every minute while it stays down.
if [[ $prev == UP && $now == DOWN ]]; then
  alert "DOWN after $RETRIES attempts ($URL)"
elif [[ $prev == DOWN && $now == UP ]]; then
  alert "RECOVERED ($URL)"
else
  log "state $now (unchanged)"
fi

[[ $now == UP ]]   # exit code reflects health for cron/monitoring
```
**Points to talk through:**
- **State file**: an alert fires on a state change only, so you get one DOWN and one RECOVERED message instead of 60 pages an hour.
- `curl -f` makes HTTP 4xx/5xx count as failures, and `-m` sets a timeout so the script never hangs.
- To check a systemd service instead, swap `check` for `systemctl is-active --quiet "$SERVICE"`. To check a TCP port, use `nc -z host port`.
- Extensions: run several checks in parallel, use `flock` so overlapping cron runs don't race, and add an auto-restart step (see Q20).
- In production, this belongs in Prometheus Blackbox exporter / Uptime Kuma plus Alertmanager. The script is for hosts without that stack, or for the interview.

**See also:** [18 Practical scripting](./18-practical-scripting-challenges-qna.md).

---

## 🔹 Docker + Containers

### 03. How do you troubleshoot container crashes, OOMKilled events and image pull failures?
**First, collect facts:**
```bash
docker ps -a                                   # exit status & restart count
docker logs --tail 200 <c>                     # app output (k8s equivalent: kubectl logs --previous)
docker inspect <c> --format '{{json .State}}'  # ExitCode, OOMKilled, Error, StartedAt/FinishedAt
docker events --since 30m                      # die / oom / kill events
```

**Container crashes: read the exit code**
| Exit code | Meaning | Typical cause |
|---|---|---|
| 0 | Main process finished | Process is not long-running (e.g. ran a script, or the daemon forked into the background). |
| 1 / 2 | App error | Bad config, missing env var, failed DB connection. Check the logs. |
| 126 / 127 | Not executable / not found | Wrong `ENTRYPOINT`, missing binary, CRLF line endings, wrong architecture (arm64 image on amd64 shows `exec format error`). |
| 137 | SIGKILL (128+9) | **OOMKilled**, or killed after the stop grace period. |
| 139 | SIGSEGV | Native crash, glibc/musl mismatch. |
| 143 | SIGTERM (128+15) | Normal stop. If it's unexpected, find out who sent it. |

When the logs are empty, run it interactively: `docker run -it --entrypoint sh <image>` and run the command by hand. Or `docker commit` the dead container and poke around inside it.

**OOMKilled:**
- Confirm with `"OOMKilled": true` in inspect, `dmesg | grep -i oom`, or `kubectl describe pod`, which shows `Last State: Terminated, Reason: OOMKilled`.
- Find out whether it's a real **leak** (memory climbs until killed) or a **too-low limit** (killed under normal load). Check `docker stats`, or container_memory_working_set_bytes in Prometheus.
- Runtimes that ignore cgroup limits cause many of these. Older JVMs size the heap from host RAM, so use `-XX:MaxRAMPercentage=75`. For Node, set `--max-old-space-size`. For Go, set `GOMEMLIMIT`.
- Fix: set the limit from observed p99 usage plus headroom, fix the leak (heap dump), and cut concurrency or batch size. Don't just keep raising the limit.

**Image pull failures:**
- `manifest unknown` / `not found`: wrong tag, or the tag was deleted. Pin by **digest** in production.
- `unauthorized` / `denied`: missing or expired registry credentials (`docker login`, K8s `imagePullSecrets`, node IAM role lacks ECR pull permission, ECR token is valid for 12h).
- `toomanyrequests`: Docker Hub rate limit. Use a pull-through cache or mirror (ECR/ACR/Artifact Registry).
- Timeout / `i/o timeout`: network problem. Private nodes have no NAT or VPC endpoint to the registry, or a proxy or DNS issue. Test from the node with `crictl pull` / `curl https://<registry>/v2/`.
- `no matching manifest for linux/arm64`: architecture mismatch. Build multi-arch with `docker buildx --platform linux/amd64,linux/arm64`.

**See also:** [03 Docker](./03-docker-qna.md), [04 Kubernetes](./04-kubernetes-qna.md) Q37–Q38, Q49–Q50.

---

### 04. How do multi-stage builds, image layers and Docker networking affect performance and security?
**Multi-stage builds:** compile in a fat builder stage, then copy only the artifact into a minimal runtime stage (distroless, alpine, `scratch`).
```dockerfile
FROM golang:1.23 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download                 # cached unless deps change
COPY . .
RUN CGO_ENABLED=0 go build -o /app ./cmd/server

FROM gcr.io/distroless/static:nonroot
COPY --from=build /app /app
USER nonroot
ENTRYPOINT ["/app"]
```
- *Performance:* images shrink from about 1 GB to about 20 MB, so pulls, cold starts and node scale-ups are faster, and registry storage is cheaper.
- *Security:* no compiler, shell or package manager ships to production, so the attack surface is smaller and CVE scanners report far less noise. Build-time secrets stay in the builder stage. Use `RUN --mount=type=secret` so they never land in any layer.

**Image layers:**
- Each `RUN/COPY/ADD` creates an immutable layer, and the cache is invalidated from the first changed layer onward. **Put things that rarely change first**: base image, then OS packages, then dependency manifests and install, then source code. That way a code change doesn't reinstall dependencies.
- Combine `apt-get update && apt-get install ... && rm -rf /var/lib/apt/lists/*` in **one** `RUN`. A file deleted in a later layer still exists in the earlier one, which bloats the image and **leaks secrets** (`docker history` and layer tarballs expose them).
- Use `.dockerignore` (`.git`, `node_modules`, `.env`) so you don't break the cache or ship secrets.
- Shared base layers are pulled once per node, so standardizing base images speeds up the whole fleet.
- Pin base images by digest, rebuild regularly for patches, and sign images (cosign).

**Docker networking:**
- **bridge** (default): NAT plus a veth pair, with a little overhead. A **user-defined bridge** adds built-in DNS between containers and isolation between networks, which the default bridge lacks.
- **host**: no network namespace. You get the best throughput and latency (useful for high-packet-rate workloads like VoIP or proxies), but you lose isolation and can get port conflicts.
- **overlay** (Swarm/multi-host): VXLAN encapsulation. You pay a small MTU/CPU cost (watch for MTU mismatches that cause hangs on large packets).
- **none**: fully isolated, for batch jobs that need no network.
- *Security:* publish only the ports you need, and bind to `127.0.0.1:port` when it's local-only. Note that **Docker-published ports bypass UFW/iptables INPUT rules** (they go through the DOCKER chain). Put containers on separate networks so a compromised frontend can't reach the DB directly. Avoid `--network host` and `--privileged` unless you really need them.

**See also:** [03 Docker](./03-docker-qna.md) Q16–Q20, Q22, Q30–Q31.

---

## 🔹 Kubernetes

### 05. A Pod is stuck in Pending, CrashLoopBackOff or ImagePullBackOff. How do you debug it?
Start the same way every time: `kubectl describe pod <p>` (read the **Events** at the bottom) and `kubectl get events --sort-by=.lastTimestamp -n <ns>`.

**Pending: the scheduler can't place it, or volumes can't bind**
- `0/5 nodes are available: insufficient cpu/memory`: requests are bigger than any node's free allocatable. Lower the requests, add nodes, or check whether the Cluster Autoscaler is working (Q06).
- `didn't match node selector / affinity`, or `had untolerated taint`: fix the labels, affinity or tolerations.
- `pod has unbound immediate PersistentVolumeClaims`: the StorageClass is missing, or the volume is in a different AZ from the node. Use `volumeBindingMode: WaitForFirstConsumer`.
- `Too many pods`: you hit the node's max-pods or IP limit (AWS VPC CNI ENI IP exhaustion). Also check namespace **ResourceQuota**: `kubectl describe quota`.
- No events at all: the scheduler itself may be down, or the pod uses a custom `schedulerName`.

**CrashLoopBackOff: the container starts, then exits, again and again**
```bash
kubectl logs <p> --previous        # logs of the crashed instance — the most important command
kubectl describe pod <p>           # Last State: exit code / Reason (OOMKilled = 137)
```
- Exit 1: app error (missing ConfigMap/Secret key or env var, can't reach the DB, bad flags).
- OOMKilled: raise the memory limit or fix the leak.
- Liveness probe failing: the probe kills a slow-starting app. Add a `startupProbe` or raise `initialDelaySeconds`. Events show `Liveness probe failed`.
- Exit 0 in a loop: the process isn't long-running.
- Logs are empty: override the command to keep it alive (`command: ["sleep","infinity"]`) and `kubectl exec` in, or use `kubectl debug -it <p> --image=busybox --target=<container>`.
- Permissions: `runAsNonRoot` or a read-only filesystem conflicts with what the image expects.

**ImagePullBackOff / ErrImagePull**
- `ErrImagePull` is the first failure. `ImagePullBackOff` means the kubelet is now retrying with backoff.
- Check the exact image string and tag, then whether `imagePullSecrets` exists **in the same namespace**, then the node's IAM pull permissions for the registry (ECR/ACR/GAR), then registry rate limits, then the node's network path to the registry (NAT / VPC endpoints). Test it directly: `crictl pull <image>` on the node.

**See also:** [04 Kubernetes](./04-kubernetes-qna.md) Q36–Q38, Q49–Q52.

---

### 06. How do requests, limits, HPA and Cluster Autoscaler work together?
They form a chain, and each layer depends on the one before it:

1. **Requests** are what the **scheduler** reserves. A pod only lands on a node whose allocatable minus the existing requests fits it. Requests also form the denominator of HPA's CPU utilization %.
2. **Limits** are enforced at runtime by the kernel cgroup. Going over the CPU limit causes **throttling** (latency goes up, no crash). Going over the memory limit causes **OOMKill**. Requests vs. limits also set the QoS class (Guaranteed / Burstable / BestEffort), which decides eviction order under node pressure.
3. **HPA** adds or removes **pods**. It reads metrics-server (or custom/external metrics via Prometheus Adapter or KEDA) and computes `desired = ceil(current × currentMetric / target)`. Example: 4 pods at 90% CPU with a 60% target gives `ceil(4×90/60) = 6`. It has a stabilization window (300 s by default for scale-down) to prevent flapping.
4. **Cluster Autoscaler** (or **Karpenter**) adds or removes **nodes**. When the HPA creates pods that stay **Pending** because no node fits their *requests*, CA adds a node to the right node group. Karpenter instead picks an instance type that fits. When nodes sit underused (by requests, roughly <50% by default) and their pods can move elsewhere, it drains and removes them, respecting PDBs.

**How it flows under load:** traffic goes up, CPU usage goes up, HPA scales 4 pods to 10, 4 pods go Pending, CA/Karpenter adds 2 nodes (about 1–3 min), pods schedule, and latency recovers. Scale-down runs the same chain in reverse, more slowly.

**Common mistakes interviewers probe:**
- **No requests set**: HPA CPU % can't be computed, and CA can't reason about fit.
- **Requests far above real usage**: nodes look full, so CA adds nodes while actual CPU sits at 15%, and you waste money. **Requests far below usage**: nodes get overpacked, then throttled and evicted.
- **CPU limits** often hurt latency through CFS throttling. Many teams set CPU requests but no CPU limit, and always set memory limit = request for predictability.
- **HPA and VPA both acting on CPU** for the same workload will fight each other.
- **Lag**: HPA reacts in about 15–60 s, but a new node takes minutes. Cover the gap with headroom, overprovisioning "pause" pods with low PriorityClass, or scaling on leading metrics such as RPS or queue depth with KEDA.
- Set `maxReplicas`, and set CA/Karpenter limits, or a bug or DDoS turns into a giant bill.

**See also:** [04 Kubernetes](./04-kubernetes-qna.md) Q27, Q30, Q52, [23 Internals](./23-how-it-works-internals-qna.md) (HPA math).

---

### 07. How do Helm releases, rollback and configuration management work?
**Releases:** `helm install|upgrade <release> <chart> -f values.yaml` renders templates with values and applies the manifests. Helm stores each **revision** as a Secret (`sh.helm.release.v1.<name>.v<N>`) in the release namespace. That Secret holds the rendered manifest plus the values, which is what makes history and rollback possible.
```bash
helm upgrade --install api ./chart -n prod -f values-prod.yaml \
  --set image.tag=$GIT_SHA --atomic --wait --timeout 5m
helm history api -n prod
helm rollback api 7 -n prod --wait        # re-applies revision 7's stored manifest as a NEW revision
helm diff upgrade api ./chart -f values-prod.yaml   # (helm-diff plugin) preview before applying
```
- `--atomic` automatically rolls back if the upgrade doesn't become healthy within `--timeout`. That's the simplest automated rollback there is.
- Helm 3 uses a **3-way merge** (old manifest, new manifest, live state), so manual `kubectl edit` changes are handled. But they're still drift, so avoid them.

**Rollback caveats:**
- Rollback restores Kubernetes objects. It does **not** undo DB migrations, data in PVs, or changes made by hooks. Make migrations backward compatible (expand/contract).
- CRDs in `crds/` are installed once and never upgraded or deleted by Helm. Manage them separately.
- A release stuck in `pending-upgrade` (the pipeline was killed mid-upgrade) blocks later upgrades. Fix it with `helm rollback` to the last good revision.

**Configuration management:**
- **One chart, many values files**: `values.yaml` holds the defaults, and `values-dev.yaml` / `values-prod.yaml` hold per-environment overrides. Keep logic in templates and data in values.
- Use `values.schema.json` to validate inputs. Use `helm lint` and `helm template | kubeconform` in CI.
- Add a checksum annotation on the pod template (`checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}`) so that a ConfigMap change actually triggers a rolling restart.
- **Secrets are never stored in plain values files.** Use External Secrets Operator, Sealed Secrets, or SOPS with `helm-secrets` (Q18).
- Version charts with SemVer, publish them to an OCI registry, and pin chart versions.
- At scale, let **GitOps** run Helm (Argo CD / Flux). Git becomes the record of what's deployed, and rollback is a `git revert`.

**See also:** [Argo CD + Helm integration](../Continuous%20Delivery/ArgoCD/argo-cd-integration-helm.md), [20 Gap-fill](./20-devops-roadmap-gap-fill-qna.md) Q2–Q3, Q9–Q11.

---

### 08. How would you troubleshoot Service, Ingress, DNS and network policy failures?
Debug **one hop at a time**, from the pod outward: Pod, then Service, then DNS, then Ingress, then the outside world. Keep a debug pod handy: `kubectl run tmp --rm -it --image=nicolaka/netshoot -- bash`.

**1. Pod itself:** is it `Ready`? Does the app listen on the expected port **on 0.0.0.0** (not 127.0.0.1)? Test with `curl <podIP>:<containerPort>` from the debug pod.

**2. Service:**
```bash
kubectl get endpointslices -l kubernetes.io/service-name=<svc>   # (or kubectl get endpoints <svc>)
```
- **No endpoints** is the most common bug. The Service `selector` doesn't match the pod labels, or the pods aren't Ready (a failing readiness probe removes them).
- A wrong `targetPort` (must match the container port or its name) shows as connection refused.
- Test `curl <svc>.<ns>.svc.cluster.local:<port>` and the ClusterIP. If the ClusterIP fails but the pod IP works, look at kube-proxy / iptables / IPVS (or the Cilium eBPF maps).

**3. DNS:**
```bash
nslookup <svc>.<ns>.svc.cluster.local     # from the debug pod
cat /etc/resolv.conf                      # nameserver = kube-dns ClusterIP, search domains, ndots:5
kubectl -n kube-system logs -l k8s-app=kube-dns
```
- Short names only resolve in the same namespace. Cross-namespace calls need `svc.ns`.
- CoreDNS pods crashing or overloaded gives intermittent `SERVFAIL` and timeouts. Scale CoreDNS or use NodeLocal DNSCache. `ndots:5` multiplies external lookups, so use FQDNs with a trailing dot for external hosts.
- A NetworkPolicy that blocks **UDP/TCP 53 egress** to kube-system breaks DNS for the whole namespace. This is a classic cause.

**4. Ingress:**
- `kubectl describe ingress`: is the `ingressClassName` correct? Does the backend Service and port exist? Is an ADDRESS assigned?
- Ingress controller logs (ingress-nginx / AWS LB Controller): 404 means no rule matched (host or path, `pathType`). 502/503 means no healthy backends, or the backend protocol is wrong (HTTP vs HTTPS). 504 means a timeout.
- TLS: does the secret exist in the same namespace? Is the cert-manager `Certificate` Ready? Does the cert's SAN match the host?
- Cloud LB: are the target group health checks passing? Do security groups allow LB-to-node/pod traffic? Is the DNS record pointing at the LB?

**5. NetworkPolicy:**
- Once **any** policy selects a pod, all traffic not explicitly allowed (in that direction) is denied.
- Check policies on **both** sides: egress on the client, ingress on the server. Cross-namespace rules need `namespaceSelector` (e.g. `kubernetes.io/metadata.name: other-ns`). Combining `podSelector` and `namespaceSelector` in one `from` entry means AND; separate entries mean OR.
- Make sure the CNI actually enforces policies (Calico/Cilium do; plain Flannel doesn't). Watch drops with `cilium monitor --type drop` or Hubble.

**See also:** [04 Kubernetes](./04-kubernetes-qna.md) Q24–Q25, Q35, Q53, [20 Gap-fill](./20-devops-roadmap-gap-fill-qna.md) Q14.

---

## 🔹 CI/CD

### 09. How do you debug a Jenkins, GitHub Actions or GitLab CI pipeline that suddenly fails?
"Suddenly" means **something changed**. Your job is to find out what changed: code, dependencies, environment, credentials, or infrastructure.

1. **Read the first real error**, not the last line. Find the step that failed and the first error above it.
2. **Compare with the last green run.** Look at the commit diff, and also check: did the runner image or agent change? Did a dependency resolve to a newer version (unpinned `latest`, `^1.2`)? Did a base image tag move?
3. **Re-run once.** If it passes, it's **flaky**: a test race, network timeout, or rate limit. Quarantine and fix it; don't just keep re-running. If it fails the same way, it's deterministic.
4. **Check the usual causes:**
   - **Expired or rotated credentials**: tokens, cloud keys, registry passwords, an OIDC trust policy change, a certificate expiry.
   - **Dependency changes**: a new transitive version, a yanked package, a registry outage. The fix is lockfiles and an internal proxy (Artifactory/Nexus).
   - **Runner/agent environment**: disk full on the Jenkins agent, a GitHub-hosted runner image update (`ubuntu-latest` moved), a plugin update in Jenkins, a tool version change.
   - **Rate limits**: Docker Hub pulls, GitHub API.
   - **Infrastructure**: the target cluster or registry is down, a firewall change, a full quota.
   - **Pipeline config**: a changed shared library or reusable workflow, branch protection rules, a changed secret scope (e.g. secrets aren't available to fork PRs).
5. **Reproduce locally or in the same image**: `docker run` the runner image, `act` for GitHub Actions, `gitlab-runner exec`, or the Jenkins replay feature. Turn on debug logs: `ACTIONS_STEP_DEBUG=true`, `CI_DEBUG_TRACE`, `set -x`.
6. **Fix and harden**: pin action versions to a commit SHA, pin tool versions and base images by digest, cache dependencies, add retries **only** on network steps, set timeouts, and alert the owning team on main-branch failures.

**See also:** [05 CI/CD](./05-cicd-jenkins-github-actions-qna.md) Q26, [20 Gap-fill](./20-devops-roadmap-gap-fill-qna.md) Q15.

---

### 10. How do you implement zero-downtime deployments, automated rollback and approval gates?
**Zero downtime is three layers working together:**
- **Strategy**: rolling update (`maxUnavailable: 0`, `maxSurge: 25%`), **blue-green** (switch traffic at the LB or Service, with instant switch-back), or **canary** (1% → 10% → 50% → 100%) through Argo Rollouts / Flagger / a service mesh / weighted ALB target groups.
- **App readiness**: a correct **readinessProbe** (don't send traffic until the app is warm), **graceful shutdown** (handle SIGTERM, drain in-flight requests, and add a `preStop: sleep 5–10` so endpoints are removed before the process exits), and `terminationGracePeriodSeconds` longer than the drain time. Add a **PodDisruptionBudget** and enough replicas spread across zones.
- **Backward-compatible changes**: the DB uses **expand/contract** migrations (add column, deploy code that reads both, backfill, remove the old column later). APIs are versioned. Behavior changes ship behind **feature flags**, so a code deploy is separate from a feature release.

**Automated rollback:**
- Gate each step on **metrics**, not hope. Argo Rollouts `AnalysisTemplate` queries Prometheus (error rate < 1%, p99 < 300 ms) at each canary step and **aborts and rolls back automatically** if a check fails.
- Simpler versions: `helm upgrade --atomic`, `kubectl rollout status --timeout` followed by `kubectl rollout undo` on failure, ECS deployment circuit breaker, CodeDeploy alarms.
- Post-deploy smoke tests in the pipeline. If they fail, roll back to the previous immutable image digest.

**Approval gates:**
- GitHub Actions **Environments** with required reviewers and wait timers, GitLab `when: manual` + protected environments, Jenkins `input` step, Spinnaker/Argo manual judgment.
- Put gates where the risk is: auto-deploy to dev/staging, then a human approval (or a change ticket) before production, then automated canary analysis inside production.
- Combine with policy: only signed images from main, passing scans, and change freezes enforced in the pipeline.

```yaml
# GitHub Actions: prod requires approval (configured on the "production" environment)
deploy-prod:
  needs: deploy-staging
  environment: production          # required reviewers + branch restriction set in repo settings
  runs-on: ubuntu-latest
  steps:
    - run: helm upgrade --install api ./chart -f values-prod.yaml --set image.tag=${{ github.sha }} --atomic --timeout 5m
```

**See also:** [14 Deployment strategies](./14-deployment-systemdesign-behavioral-qna.md) Q1–Q13, [04 Kubernetes](./04-kubernetes-qna.md) Q59, [20 Gap-fill](./20-devops-roadmap-gap-fill-qna.md) Q13.

---

## 🔹 Cloud + Infrastructure

### 11. How would you design highly available infrastructure across AWS, Azure or GCP?
**Start by clarifying:** the availability target (99.9% allows about 8.7 h of downtime a year; 99.99% allows about 52 min), RTO/RPO, single region vs. multi-region, and the budget.

**Principles (same on every cloud):**
- **No single points of failure.** Run at least 3 Availability Zones, with N+1 capacity, so losing one AZ leaves enough capacity.
- **Stateless compute behind a load balancer**, with health checks and autoscaling. Keep state in managed, replicated services.
- **Managed data with synchronous standby across AZs**, plus backups and PITR. Cross-region replicas if you need regional DR.
- **Decouple with queues** so spikes and partial outages don't cascade. Use timeouts, retries with jitter, and circuit breakers.
- **Everything in IaC**, so a region or environment can be rebuilt from code.
- **Observe and test it**: SLO alerts, game days, chaos testing on AZ failure.

| Layer | AWS | Azure | GCP |
|---|---|---|---|
| DNS / global routing | Route 53 (health checks, failover/latency) | Front Door / Traffic Manager | Cloud DNS + global external LB |
| Edge / WAF | CloudFront + WAF + Shield | Front Door + WAF | Cloud CDN + Cloud Armor |
| Load balancer | ALB / NLB (multi-AZ) | App Gateway / Standard LB (zone-redundant) | Regional/global Application LB |
| Compute | ASG / EKS / ECS across 3 AZs | VMSS / AKS with zones | Regional MIG / GKE regional |
| Database | Aurora / RDS Multi-AZ, Global Database | Azure SQL zone-redundant, failover groups | Cloud SQL HA, Spanner multi-region |
| Storage | S3 (multi-AZ by default), CRR | ZRS / GZRS | Multi/dual-region buckets |
| Queue | SQS / SNS | Service Bus | Pub/Sub |

**Multi-region options**, from cheapest to most expensive: backup & restore, then pilot light, then warm standby, then active-active. Active-active needs global data (DynamoDB Global Tables, Cosmos DB, Spanner) and conflict handling, so pick it only if the RTO/RPO really requires it.

**See also:** [27 Cloud scenarios](./27-cloud-architecture-scenarios-qna.md) #1, #6, #15, [07 AWS](./07-aws-cloud-qna.md) Q28.

---

### 12. How do IAM roles, load balancers, Auto Scaling and disaster recovery work together?
Walk through a single request, and the system around it:

- **Load balancer** (ALB / App Gateway / GCP LB) is the single front door across AZs. It runs **health checks** and sends traffic only to healthy targets. It terminates TLS and does connection draining (deregistration delay) during scale-in and deploys.
- **Auto Scaling Group** (VMSS / MIG) keeps the desired count of instances from a **launch template**. It **registers new instances with the LB target group automatically**. If the LB health check fails (set ASG health check type = ELB), the ASG **replaces** the instance. That's self-healing. Scaling policies (target tracking on CPU or requests per target) change capacity, and lifecycle hooks let instances warm up or drain.
- **IAM roles** let all of this run without static keys:
  - The **instance profile / managed identity / service account** gives each instance temporary, auto-rotated credentials (via IMDSv2) to read secrets, pull images, write logs and reach S3. Every new instance gets this identity automatically, which matters because you can't hand-copy keys onto instances the ASG launches.
  - **Service-linked roles** let the ASG and LB manage instances and ENIs on your behalf.
  - Least privilege, scoped per tier (web role ≠ batch role).
- **Disaster recovery** extends the same building blocks to a second region:
  - The launch template / AMI / container image and the IaC are copied to the DR region, and the IAM roles exist there too (IAM is global in AWS, but KMS keys and secrets are regional, so replicate them).
  - Data is replicated (Aurora Global DB, S3 CRR, DynamoDB Global Tables, AWS Backup cross-region copies).
  - **Pilot light / warm standby**: the DR region's ASG runs at min=0 or a small size, and on failover you **scale it up**.
  - **Route 53 health checks / failover routing** (or Front Door / global LB) move users to the DR region's LB.
  - Test it regularly (game days) and measure the real RTO/RPO.

In one sentence: *the LB sends traffic to healthy instances, the ASG keeps the right number of healthy instances and replaces bad ones, IAM roles give every new instance credentials without secrets, and DR repeats this pattern in another region with replicated data and DNS failover.*

**See also:** [24 AWS deep dive](./24-aws-deep-dive-qna.md), [`../Backup and Disaster Recovery/`](../Backup%20and%20Disaster%20Recovery/disaster-recovery-strategies.md).

---

## 🔹 Terraform + IaC

### 13. How do you manage remote state, state locking and concurrent Terraform runs?
**Remote state:** never keep state locally or in Git. It holds secrets and it's the single record of what exists.
```hcl
terraform {
  backend "s3" {
    bucket         = "acme-tfstate-prod"
    key            = "network/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    use_lockfile   = true            # Terraform ≥1.10: native S3 lock; older: dynamodb_table = "tf-locks"
  }
}
```
- Other options: Azure Storage (blob lease lock), GCS (built-in lock), Terraform Cloud/HCP, Spacelift, env0.
- Harden the bucket: **versioning** (to recover corrupt state), encryption with KMS, blocked public access, tight IAM (only the CI role writes), access logging.

**State locking:** a lock is taken for any operation that writes state (`plan` with refresh, `apply`). A second run fails with `Error acquiring the state lock` instead of corrupting state. Never disable it (`-lock=false`) in shared environments.
- A stale lock (CI job killed mid-apply): first confirm that **nobody is actually running**, then `terraform force-unlock <LOCK_ID>`. Then run a `plan` to check that state matches reality.

**Concurrent runs, at the design level:**
- **Split state** by environment and component (network / data / app per env), so teams don't block each other and mistakes affect less. Share outputs via `terraform_remote_state` or data sources.
- **Serialize applies through CI**: one pipeline per state, with concurrency control (`concurrency: group: tf-prod-network` in GitHub Actions, resource locks in GitLab), or Atlantis/TFC, which lock the workspace per PR.
- **No applies from laptops** for shared environments. Developers run `plan` read-only; only the CI role (via OIDC) can apply.
- Apply the **saved plan** that was reviewed (`plan -out tfplan` then `apply tfplan`). If state changed in between, apply fails instead of doing something unexpected.
- Use `-lock-timeout=5m` in CI so a short overlap waits instead of failing.

**See also:** [06 Terraform](./06-terraform-and-iac-qna.md) Q12–Q13, Q23, [23 Internals](./23-how-it-works-internals-qna.md) Q9.

---

### 14. How do you detect and resolve infrastructure drift without causing outages?
**Detect:**
- Run `terraform plan -detailed-exitcode` (exit code 2 means changes) **on a schedule** in CI for every state, read-only, and alert or open a ticket when it finds drift. Or use TFC/Spacelift drift detection, driftctl-style tools, or AWS Config / Azure Policy / GCP Asset Inventory for resources nobody manages.
- Use `terraform plan -refresh-only` to see *what changed in reality* without proposing to change it back.
- In Kubernetes, GitOps tools (Argo CD / Flux) continuously show OutOfSync.

**Resolve. Investigate first; never blindly `apply`:**
1. **Find out who changed it and why**: CloudTrail / Activity Log / Audit Logs. A manual hotfix during an incident might be the *correct* state.
2. **Decide which side is right:**
   - The change was intentional and right: **update the code to match** (or `terraform apply -refresh-only` to accept it into state), then review and merge. No infrastructure change happens.
   - The change was wrong (someone opened a security group to 0.0.0.0/0): **revert through Terraform**, in a change window if it affects traffic.
   - The resource was created outside Terraform: `import` it (`import {}` blocks in Terraform ≥1.5), or delete it if it's junk.
3. **Make the fix safe:**
   - Read the plan for `-/+ destroy and then create replacement`. That marks the dangerous changes (renaming, changing ForceNew attributes like subnet or AZ). Use `moved {}` blocks for refactors, and `create_before_destroy` / `prevent_destroy` on critical resources.
   - Apply with a **targeted, small** change first if needed (`-target` only as a one-off), outside peak hours, with a rollback plan.
   - Use `ignore_changes` only for attributes that something else legitimately manages (ASG desired_count set by autoscaling, tags added by tools).
4. **Prevent it:** take console write access away from humans in production (read-only roles plus break-glass access), use SCPs and policy as code, run every change through PRs, and keep scheduled drift detection running.

**See also:** [06 Terraform](./06-terraform-and-iac-qna.md) Q20, [20 Gap-fill](./20-devops-roadmap-gap-fill-qna.md) Q9.

---

## 🔹 Monitoring + Observability

### 15. How would you use Prometheus and Grafana to investigate a production latency spike?
Use the **RED** method (Rate, Errors, Duration) on the service, then **USE** on its dependencies and infrastructure. Narrow it down by time, then scope, then component.

1. **Confirm and scope** on the service dashboard. Is it p50 or only p99 (the tail)? All endpoints or one? All pods or one AZ?
```promql
# p99 latency by route
histogram_quantile(0.99, sum by (le, route) (rate(http_request_duration_seconds_bucket{job="api"}[5m])))
# did traffic change?
sum(rate(http_requests_total{job="api"}[5m]))
# error ratio
sum(rate(http_requests_total{job="api",code=~"5.."}[5m])) / sum(rate(http_requests_total{job="api"}[5m]))
# is it one pod/node?
histogram_quantile(0.99, sum by (le, pod) (rate(http_request_duration_seconds_bucket{job="api"}[5m])))
```
2. **Correlate with changes**: add Grafana **annotations** for deploys, config changes and feature flags. If the spike lines up with a deploy, roll back first and analyze later (Q21).
3. **Check saturation** of the service's own resources:
```promql
rate(container_cpu_cfs_throttled_periods_total[5m]) / rate(container_cpu_cfs_periods_total[5m])   # CPU throttling
container_memory_working_set_bytes / container_spec_memory_limit_bytes                            # close to OOM
# runtime: GC pause, thread pool / DB connection pool exhaustion (app metrics)
```
4. **Check dependencies**: DB query latency and connections, cache hit ratio, downstream HTTP client latency, queue lag. A drop in the cache hit ratio, or slow queries, is a frequent root cause.
5. **Check infrastructure**: node CPU, disk I/O, network errors, noisy neighbors, LB metrics (target response time, surge queue).
6. **Pivot to traces and logs**: Grafana **exemplars** link a slow histogram bucket to a specific trace ID in Tempo/Jaeger, and the trace shows *which span* is slow. Then open Loki logs filtered by that trace ID.
7. **Mitigate, then fix**: roll back, scale out, disable a feature flag, or shed load. Then do the root-cause analysis and a postmortem, and add an SLO burn-rate alert if this wasn't caught quickly enough.

Gotcha: averages hide tail latency, so always use histograms and quantiles. `histogram_quantile` over summed buckets is correct; averaging per-pod quantiles is not.

**See also:** [11 Monitoring](./11-monitoring-logging-observability-qna.md) Q11–Q20, [13 SRE](./13-sre-incident-loadbalancing-servicemesh-qna.md) Q25, [27 Scenarios](./27-cloud-architecture-scenarios-qna.md) #10.

---

### 16. How do logs, metrics and traces integrate through OpenTelemetry?
**OpenTelemetry (OTel)** is a vendor-neutral CNCF standard: **APIs + SDKs** (instrument once), the **OTLP** protocol, and the **Collector**. It produces all three signals (plus profiles) with **shared context**, which is what ties them together.

**How the correlation works:**
- **Context propagation**: every request carries a **trace ID** and span ID across services via the W3C `traceparent` header (HTTP/gRPC/messaging). Auto-instrumentation handles this for common frameworks.
- **Traces**: each service creates **spans** with timing and attributes, so you can see the whole request path and where time is spent.
- **Logs**: the OTel log bridge (or logging library integration) **stamps `trace_id`/`span_id` on every log line** written during that span. You can jump from a span to the exact logs, and back.
- **Metrics**: counters and histograms carry **exemplars**, which are sample trace IDs attached to data points. You can click from a latency spike on a graph to a real slow trace.
- **Resource attributes** (`service.name`, `service.version`, `deployment.environment`, `k8s.pod.name`) are the same on all three signals, so you can filter and join consistently.

**Pipeline:**
```
App (OTel SDK / auto-instrumentation)
   └─ OTLP ─▶ OTel Collector (agent DaemonSet → gateway)
                 receivers: otlp, prometheus, filelog, k8s
                 processors: batch, memory_limiter, k8sattributes, tail_sampling, redaction
                 exporters ─▶ Prometheus/Mimir (metrics) · Loki/Elastic (logs) · Tempo/Jaeger (traces) · or a vendor (Datadog, New Relic, Honeycomb)
```
- Why use the **Collector**: apps stay vendor-agnostic (switch backends with a config change), and the Collector centralizes sampling (tail-based: keep all errors and slow traces), PII scrubbing, enrichment with K8s metadata, batching and retries.
- In **Grafana**, metrics (exemplars) link to Tempo traces, trace-to-logs links go to Loki, and logs link back to traces through derived fields. That's one click per pivot during an incident.

**See also:** [20 Gap-fill](./20-devops-roadmap-gap-fill-qna.md) Q16, [11 Monitoring](./11-monitoring-logging-observability-qna.md).

---

### 17. How do you define SLIs, SLOs and error budgets for an SRE team?
- **SLI** (indicator) is a measured ratio of **good events / valid events**, taken from the user's point of view. Examples: availability (non-5xx responses / all responses), latency (requests < 300 ms / all requests), freshness (data updated < 5 min ago), correctness.
- **SLO** (objective) is the target for an SLI over a window. Example: "99.9% of checkout requests succeed over 28 days." It's an internal target, set tighter than any external **SLA** (the contract with penalties).
- **Error budget** = 1 − SLO. At 99.9% over 30 days, that's 0.1% of requests, or about **43 minutes** of full outage equivalent.

**How to define them:**
1. Start with **critical user journeys** (login, search, checkout), not with servers. Measure as close to the user as possible (LB or edge logs, or synthetic checks), not CPU.
2. Pick 1–3 SLIs per journey (availability plus latency usually covers it).
3. Set the target from **historical performance** and from what users need. Don't aim for 100%, because every extra 9 costs a lot more and dependencies cap you anyway. You can't be more reliable than what you depend on.
4. Agree on it with product and engineering, write it down, and review it each quarter.

**Error budget policy, the part that changes behavior:**
- Budget left: ship features, run experiments, do planned risky work.
- Budget burning fast or used up: **freeze risky releases**, put the team on reliability work, require postmortems. Product leadership signs off on this ahead of time, so it's a pre-agreed rule and not a fight during an incident.

**Alerting on SLOs: multi-window, multi-burn-rate** (the Google SRE workbook approach):
```promql
# page: burning 14.4x budget (2% of 30d budget in 1h), confirmed by a short window
(
  sum(rate(http_requests_total{code=~"5.."}[1h])) / sum(rate(http_requests_total[1h])) > (14.4 * 0.001)
and
  sum(rate(http_requests_total{code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > (14.4 * 0.001)
)
# ticket: 6x over 6h / 30m, and 1x over 3d
```
This pages on real user impact and ignores CPU blips. Tools: Sloth / Pyrra generate these rules, and Grafana / Datadog / Nobl9 provide SLO dashboards.

**See also:** [11 Monitoring](./11-monitoring-logging-observability-qna.md) Q14–Q15, Q25, [13 SRE](./13-sre-incident-loadbalancing-servicemesh-qna.md) Q22, [20 Gap-fill](./20-devops-roadmap-gap-fill-qna.md) Q17.

---

## 🔹 Security + DevSecOps

### 18. How do you manage secrets securely across CI/CD pipelines and Kubernetes?
**Principles:** one source of truth (a secrets manager), **short-lived credentials over static ones**, least privilege, nothing in Git or images, and audit plus rotation.

**CI/CD:**
- **OIDC federation instead of stored cloud keys.** GitHub Actions, GitLab and Jenkins get a short-lived token and assume a cloud role (AWS `AssumeRoleWithWebIdentity`, Azure federated credentials, GCP Workload Identity Federation). The trust policy is scoped to a repo, branch or environment, so there's nothing long-lived to leak.
- Any remaining secrets live in the CI secret store **scoped to an environment** (prod secrets are only available to protected branches behind an approval gate), or are fetched at runtime from Vault / a cloud secrets manager.
- Logs mask secrets, and you avoid `set -x` around them. Secrets are not exposed to PRs from forks (`pull_request_target` is dangerous). Pin third-party actions by SHA, since a compromised action can exfiltrate secrets.
- Run **secret scanning** (gitleaks / trufflehog / GitHub push protection) in pre-commit and CI.

**Kubernetes:**
- Native `Secret` objects are only **base64-encoded**. To harden them: turn on **encryption at rest** with a KMS provider for etcd, use tight **RBAC** (no `get/list secrets` for broad roles, since `list` exposes the values), and mount secrets as files rather than env vars where possible (env vars leak into crash dumps and `/proc`).
- **Sync from an external manager**:
  - **External Secrets Operator**: an `ExternalSecret` CR pulls from AWS Secrets Manager / Azure Key Vault / GCP Secret Manager / Vault into a K8s Secret, and refreshes it on rotation.
  - **Secrets Store CSI Driver**: mounts secrets straight from the manager as a volume.
  - **Vault Agent injector / Vault Secrets Operator**: supports **dynamic secrets** (DB credentials created per pod with a TTL).
- **GitOps-safe options**: Sealed Secrets (encrypted with the cluster's public key) or SOPS + KMS. The encrypted form is safe to store in Git.
- **Workload identity** (IRSA / EKS Pod Identity, Azure Workload Identity, GKE Workload Identity): pods get cloud permissions through their service account, so you don't need a cloud-key secret at all.

**Rotation and audit:** automate rotation (Secrets Manager rotation Lambdas, Vault TTLs), make sure apps reload (Reloader, or reading the mounted file again), and audit every access. Have an incident plan for a leaked secret: revoke first, then rotate, then investigate.

**See also:** [12 DevSecOps](./12-security-devsecops-qna.md) Q12–Q13, [20 Gap-fill](./20-devops-roadmap-gap-fill-qna.md) Q3, Q11, Q24.

---

### 19. How would you integrate image scanning, dependency checks and IaC security scans into CI/CD?
**Shift left, but enforce at the gates.** Run fast checks on every PR, block on high-severity findings that have a fix, and keep scanning after deploy.

| Stage | Check | Tools |
|---|---|---|
| Pre-commit / PR | Secrets | gitleaks, trufflehog, GitHub push protection |
| PR | SAST (code) | Semgrep, CodeQL, SonarQube |
| PR | **SCA / dependencies** | Dependabot/Renovate (updates), Trivy fs, Snyk, OWASP Dependency-Check, `npm audit`, `pip-audit`, govulncheck |
| PR | **IaC scan** | Checkov, Trivy config (tfsec merged into Trivy), KICS, Terrascan; also scan `terraform plan` JSON |
| Build | **Image scan** | Trivy, Grype, Snyk Container, Docker Scout; plus Hadolint for Dockerfiles |
| Build | SBOM + sign + provenance | Syft (SBOM), cosign (sign + attest), SLSA provenance |
| Deploy | Admission policy | Kyverno / OPA Gatekeeper: only signed images from the trusted registry, no `:latest`, no privileged pods |
| Runtime | Continuous rescans + detection | Registry scanning (ECR/ACR/GAR), Trivy Operator, Falco, Defender/GuardDuty |

```yaml
# GitHub Actions excerpt
- name: IaC scan
  run: trivy config --severity HIGH,CRITICAL --exit-code 1 ./terraform
- name: Dependency scan
  run: trivy fs --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 .
- name: Build image
  run: docker build -t $IMAGE:${{ github.sha }} .
- name: Image scan
  run: trivy image --severity CRITICAL --ignore-unfixed --exit-code 1 $IMAGE:${{ github.sha }}
- name: SBOM + sign
  run: |
    syft $IMAGE:${{ github.sha }} -o spdx-json > sbom.json
    cosign sign --yes $IMAGE@${DIGEST}            # keyless via OIDC
    cosign attest --yes --predicate sbom.json --type spdxjson $IMAGE@${DIGEST}
- uses: github/codeql-action/upload-sarif@v3       # findings show up in the PR/Security tab
  with: { sarif_file: trivy-results.sarif }
```
**Making it work in practice (this is what interviewers want to hear):**
- **Fail only on what's actionable**: critical/high with a fix available (`--ignore-unfixed`). Everything else is reported, not blocking. Otherwise developers learn to bypass the scans.
- **Suppressions with expiry and an owner** (`.trivyignore` with a reason, VEX documents), reviewed by security.
- **Prioritize by real risk**: is it reachable, is it exploited in the wild (CISA KEV list, EPSS score), is it exposed to the internet. Raw CVSS isn't enough.
- **Keep it fast**: run scans in parallel, cache vulnerability DBs, do incremental scans on PRs and full scans nightly.
- **Rescan running images daily**, because new CVEs appear in images that were clean yesterday. Rebuild on base-image updates automatically (Renovate).
- Send results to one place (GitHub Security / DefectDojo) with SLAs (e.g. criticals fixed in 7 days).

**See also:** [12 DevSecOps](./12-security-devsecops-qna.md) Q14–Q15, [20 Gap-fill](./20-devops-roadmap-gap-fill-qna.md) Q20, [`../IaC Testing and Policy as Code/`](../IaC%20Testing%20and%20Policy%20as%20Code/).

---

## 🔹 Coding / Scenario Questions

### 20. Write a Bash script to identify failed services and restart them safely.
"Safely" is the key word. It means: dry-run mode, an allowlist (never touch critical units blindly), a lock against parallel runs, a restart limit, verification after each restart, and an audit log.

```bash
#!/usr/bin/env bash
# restart-failed.sh — find failed systemd units and restart them safely.
# Usage: sudo ./restart-failed.sh [--dry-run]
set -euo pipefail

DRY_RUN=false; [[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true
ALLOWLIST_RE="${ALLOWLIST_RE:-^(nginx|myapp|worker-.*)\.service$}"   # only touch what we own
MAX_RESTARTS="${MAX_RESTARTS:-3}"                                    # per unit per day
STATE_DIR=/var/tmp/restart-failed; mkdir -p "$STATE_DIR"
LOG_TAG=restart-failed

log() { echo "$(date -Is) $*"; logger -t "$LOG_TAG" -- "$*"; }

# Single instance — overlapping cron runs must not double-restart.
exec 9>"$STATE_DIR/lock"
flock -n 9 || { log "another run in progress, exiting"; exit 0; }

mapfile -t failed < <(systemctl list-units --type=service --state=failed --no-legend --plain | awk '{print $1}')
(( ${#failed[@]} == 0 )) && { log "no failed services"; exit 0; }

rc=0
for unit in "${failed[@]}"; do
  if [[ ! $unit =~ $ALLOWLIST_RE ]]; then
    log "SKIP $unit (not in allowlist) — needs a human"; rc=1; continue
  fi

  counter="$STATE_DIR/${unit}.$(date +%F)"
  count=$(cat "$counter" 2>/dev/null || echo 0)
  if (( count >= MAX_RESTARTS )); then
    log "SKIP $unit — restarted $count times today, possible crash loop; escalating"; rc=1; continue
  fi

  log "FAILED $unit — last logs:"
  journalctl -u "$unit" -n 20 --no-pager | sed 's/^/    /'   # capture evidence BEFORE restart

  if $DRY_RUN; then log "DRY-RUN would restart $unit"; continue; fi

  systemctl reset-failed "$unit"
  if systemctl restart "$unit" && sleep 5 && systemctl is-active --quiet "$unit"; then
    echo $((count + 1)) > "$counter"
    log "OK $unit restarted (attempt $((count + 1))/$MAX_RESTARTS today)"
  else
    echo $((count + 1)) > "$counter"
    log "ERROR $unit failed to come back"; rc=1
  fi
done
exit "$rc"     # non-zero → cron/monitoring surfaces that something still needs attention
```
**Talking points:**
- Grab **logs before restarting**, so the evidence for the root cause isn't lost.
- The **daily restart cap** stops a crash-looping service from getting hammered. That case needs a human, not more restarts.
- `systemctl is-active` after a short wait checks that the restart worked, not just that the command returned.
- An even better answer: systemd already does most of this natively. Use `Restart=on-failure`, `RestartSec=5`, `StartLimitIntervalSec=300` / `StartLimitBurst=5` in the unit file, plus `OnFailure=alert@%n.service` to alert. The script is the fallback or audit layer. In Kubernetes, the kubelet does this (restartPolicy plus probes).

**See also:** [18 Practical scripting](./18-practical-scripting-challenges-qna.md), [01 Linux](./01-linux-and-scripting-qna.md) (systemd).

---

### 21. Production latency suddenly increases after deployment. How would you investigate and roll back?
**Rule #1: if the timing points at the deploy, mitigate first and debug second.** Roll back as soon as the correlation is clear. You can investigate safely afterwards.

**1. Confirm (2–5 minutes):**
- The SLO / latency dashboard shows p95/p99 rising, and the deploy **annotation** lines up with it. Check whether error rates are also climbing.
- Is it only the new version? Compare metrics `by (version)` or by pod: canary pods vs. stable pods. If only the new pods are slow, that confirms the deploy.
- Make sure nothing else changed at the same time: config, feature flags, infrastructure, a dependency, a traffic spike.

**2. Mitigate, i.e. roll back:**
```bash
kubectl argo rollouts abort api            # canary: shift traffic back to stable instantly
kubectl rollout undo deployment/api -n prod   # plain Deployment → previous ReplicaSet
helm rollback api <prev-rev> -n prod --wait   # Helm
git revert <sha> && git push                # GitOps (Argo CD/Flux syncs the previous version)
# or: flip the feature flag off; or switch blue-green traffic back to blue
```
- Roll back to the **previous immutable image digest**, not to "latest".
- **Watch out for DB migrations**: if the release ran a migration that isn't backward compatible, a code rollback can break things. That's why expand/contract matters (Q10). In that case a **roll-forward hotfix** or a flag-off may be the safer move.
- Communicate: declare an incident, post status updates, name an incident commander if it's serious.

**3. Verify recovery:** latency and error SLIs return to baseline, and the error budget burn stops.

**4. Investigate the root cause (after mitigation), in the order of likely causes:**
- **Diff the release**: code, dependency bumps, config, resource requests and limits, image base, JVM/runtime flags.
- **Traces**: compare span breakdowns between the old and new versions. A new or slower span shows exactly where the time went (a new downstream call, an N+1 query, a removed cache).
- **Database**: new slow queries or a missing index (`pg_stat_statements`, slow query log), lock contention from a migration, connection pool exhaustion.
- **Resources**: CPU **throttling** from a lowered limit, more memory leading to GC pauses, fewer replicas, a cold cache or JIT warm-up after restart.
- **Dependencies**: the new version calls a slow service, or makes sync calls that used to be async, or has a changed timeout or retry setting (retry storms).
- Reproduce in staging with a load test (k6/Gatling) against both versions.

**5. Prevent it:** canary with **automated analysis** on latency and error SLIs (auto-abort), performance tests in CI on critical paths, smaller and more frequent deploys, SLO burn-rate alerts, and a blameless **postmortem** with action items.

**See also:** [13 SRE](./13-sre-incident-loadbalancing-servicemesh-qna.md) Q25, [14 Deployment](./14-deployment-systemdesign-behavioral-qna.md), [27 Scenarios](./27-cloud-architecture-scenarios-qna.md) #10.

---

### 22. Design a secure, autoscaling Kubernetes platform with HA, monitoring and disaster recovery.
Clarify first: number of teams and services, traffic profile, SLO (e.g. 99.95%), RTO/RPO (e.g. 1 h / 15 min), compliance needs, and which cloud. Then present it layer by layer:

**1. Cluster and HA**
- A managed control plane (EKS / AKS / GKE regional), which is multi-AZ by default. Self-managed means 3 or 5 etcd nodes across AZs.
- Node pools spread across **3 AZs**: a system pool (CoreDNS, ingress, monitoring) kept separate from workload pools; spot/preemptible pools for stateless or batch work; on-demand for critical work.
- Workload HA: at least 3 replicas, `topologySpreadConstraints` across zones and nodes, **PodDisruptionBudgets**, readiness, liveness and startup probes, graceful shutdown, PriorityClasses so critical pods win under pressure.
- Separate clusters per environment (dev / stage / prod), and namespaces per team within a cluster.

**2. Autoscaling**
- **HPA** on CPU or custom metrics (RPS, latency) via Prometheus Adapter. **KEDA** for event-driven scaling (queue depth, Kafka lag, scale to zero).
- **VPA** in recommendation mode to right-size requests.
- **Karpenter** (or Cluster Autoscaler) for nodes, with consolidation to save cost, plus overprovisioning pods for headroom. Set max limits on everything (Q06).

**3. Security (defense in depth)**
- **Identity and access**: SSO (OIDC) to the API server, RBAC per team namespace, no shared admin accounts, break-glass access. **Workload identity** for cloud APIs (no static keys).
- **Network**: private API endpoint, private nodes, **default-deny NetworkPolicies** per namespace (Cilium/Calico), WAF at the edge, optional mTLS via a service mesh (Istio / Linkerd / Cilium).
- **Workloads**: Pod Security Standards (`restricted`), non-root, read-only root filesystem, dropped capabilities, seccomp. **Kyverno/Gatekeeper** policies: signed images from the trusted registry only, required resource requests and limits, no `:latest`.
- **Supply chain**: scan, sign and verify images (Q19), SBOMs.
- **Secrets**: External Secrets Operator plus a cloud secrets manager, and etcd encryption with KMS (Q18).
- **Runtime**: Falco/GuardDuty, audit logs shipped off-cluster, CIS benchmark scans (kube-bench).

**4. Delivery**
- GitOps with **Argo CD / Flux**: the platform add-ons and the apps are declared in Git. Clusters are built with **Terraform**, so a cluster is reproducible and can be thrown away.
- Progressive delivery with **Argo Rollouts / Flagger**, using canaries gated by SLO metrics (Q10).

**5. Observability**
- Metrics: **Prometheus** (kube-prometheus-stack) with long-term storage in **Thanos/Mimir** (or managed AMP / Azure Monitor / GMP), and **Grafana** dashboards.
- Logs: Fluent Bit to **Loki** / OpenSearch / cloud logging. Traces: **OpenTelemetry** Collector to **Tempo/Jaeger**, correlated by trace ID (Q16).
- **SLOs and burn-rate alerts** through Alertmanager to PagerDuty, with runbooks linked from each alert (Q17). The monitoring stack should be watched from **outside** the cluster as well (a dead man's switch).

**6. Disaster recovery**
- **Rebuildable by design**: cluster via Terraform, everything inside via GitOps. A new cluster in another region can be fully configured in minutes, which covers most stateless RTO needs.
- **Backups**: **Velero** for K8s objects plus PV snapshots on a schedule, copied to a bucket in another region with immutability (object lock). Run etcd snapshots if self-managed.
- **Data tier**: put state in managed databases where possible (RDS / Cloud SQL with cross-region replicas, PITR) rather than in-cluster, to keep the cluster as stateless as possible.
- **Multi-region**: warm standby cluster, or active-active behind global DNS / LB (Route 53 / Front Door / Cloud LB) with health-check failover.
- **Test it**: run restore drills and region-failover game days every quarter, and measure the actual RTO/RPO against the targets.

**7. Cost and operations:** spot nodes plus Karpenter consolidation, request right-sizing, cost allocation per namespace (Kubecost / OpenCost), and upgrade runbooks (stay within the supported K8s versions, upgrade non-prod first, keep blue-green node pools).

```
Users → DNS (failover) → CDN/WAF → Cloud LB → Ingress (NGINX/Gateway API, 3 AZ)
      → Services (HPA, PDB, NetPol, mTLS) → Managed DB (Multi-AZ + cross-region replica)
Platform: Terraform (clusters) · Argo CD (apps/add-ons) · Karpenter · Kyverno · ESO · OTel/Prometheus/Loki/Tempo · Velero → cross-region bucket
```

**See also:** [20 Gap-fill](./20-devops-roadmap-gap-fill-qna.md) Q4, Q5, Q19, Q21, [04 Kubernetes](./04-kubernetes-qna.md) Q42–Q48, [27 Scenarios](./27-cloud-architecture-scenarios-qna.md) #12.

---

*Part of the [Interview Questions](./README.md) hub. See [`../Index.md`](../Index.md) for the full repository index.*
