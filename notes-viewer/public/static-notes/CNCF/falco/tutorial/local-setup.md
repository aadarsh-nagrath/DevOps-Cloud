# Falco — Learn It Locally

Goal: run Falco in Docker against the local Docker socket, deliberately trigger a few default rules and watch real-time alerts, then deploy Falco as a Kubernetes DaemonSet on kind and trigger a rule there too — in about 20 minutes.

## Prerequisites
- Docker installed and running, on a Linux kernel (native Linux, or Docker Desktop's Linux VM on macOS/Windows — both work since Falco needs a Linux kernel to attach eBPF probes to).
- (Optional, for the Kubernetes section) `kind`, `kubectl`, `helm`.

---

## Step 1 — Run Falco in Docker (eBPF Driver)

```bash
docker run -i -t --rm \
  --name falco \
  --privileged \
  -v /var/run/docker.sock:/host/var/run/docker.sock \
  -v /proc:/host/proc:ro \
  -v /etc:/host/etc:ro \
  -e HOST_ROOT=/host \
  falcosecurity/falco-no-driver:latest \
  falco -o engine.kind=modern_ebpf
```

If your Falco image/version instead expects the classic bundled eBPF driver, this simpler form also works on most setups:
```bash
docker run -i -t --rm \
  --name falco \
  --privileged \
  -v /var/run/docker.sock:/host/var/run/docker.sock \
  -v /dev:/host/dev \
  -v /proc:/host/proc:ro \
  -v /boot:/host/boot:ro \
  -v /lib/modules:/host/lib/modules:ro \
  -v /usr:/host/usr:ro \
  -v /etc:/host/etc:ro \
  falcosecurity/falco:latest
```

Leave this running — its terminal is your live alert feed. You should see Falco's startup banner and a line like `Loaded event sources: syscall` confirming the probe attached successfully.

---

## Step 2 — Start a Target Container to Attack

In a second terminal:
```bash
docker run -dit --name victim alpine:latest sh
```

---

## Step 3 — Trigger "Terminal Shell in Container"

```bash
docker exec -it victim sh
```
The instant this command runs, switch back to the Falco terminal — you'll see an alert fire immediately, something like:
```
19:42:10.123456789: Warning A shell was spawned in a container with an attached terminal
(user=root user_loginuid=-1 victim (id=...) shell=sh parent=<NA> cmdline=sh terminal=34816
container_id=... image=alpine)
```
This is Falco's default "Terminal shell in container" rule — one of the most reliable, high-signal default rules, because legitimate application containers almost never spawn interactive shells mid-lifecycle.

Type `exit` to leave the shell.

---

## Step 4 — Trigger "Write Below Etc"

```bash
docker exec victim sh -c "echo 'malicious' >> /etc/hosts"
```
Falco terminal shows:
```
19:44:02.987654321: Error File below /etc opened for writing
(user=root command=sh -c echo 'malicious' >> /etc/hosts file=/etc/hosts
container_id=... image=alpine)
```
Writes under `/etc` are a classic persistence/tampering technique (modifying `/etc/passwd`, `/etc/hosts`, cron files), so Falco flags it by default at a higher severity (`Error`, vs `Warning` for the shell rule).

---

## Step 5 — Trigger "Launch Package Management Process in Container"

```bash
docker exec victim sh -c "apk add curl"
```
Falco fires again — running a package manager inside an already-running container is unusual (images should be built with what they need, not patched live) and is a common signal of an attacker installing tools post-compromise.

---

## Step 6 — Deploy Falco on Kubernetes (kind) via Helm

```bash
kind create cluster --name falco-lab

helm repo add falcosecurity https://falcosecurity.github.io/charts
helm repo update

helm install falco falcosecurity/falco \
  --namespace falco --create-namespace \
  --set driver.kind=ebpf \
  --set tty=true
```

```bash
kubectl -n falco get pods -o wide
# One Falco pod per node (kind's single control-plane node here, or more if you added workers)

kubectl -n falco logs -l app.kubernetes.io/name=falco -f
```
Leave the log tailing in one terminal.

---

## Step 7 — Trigger a Rule Inside the Kubernetes Cluster

```bash
kubectl run victim --image=alpine:latest -- sleep infinity
kubectl wait --for=condition=Ready pod/victim --timeout=60s

kubectl exec -it victim -- sh
```
Back in the Falco log terminal, the same "Terminal shell in container" alert fires, now enriched with Kubernetes metadata:
```
Warning A shell was spawned in a container with an attached terminal
(user=root ... k8s.ns=default k8s.pod=victim container=victim image=alpine)
```
Notice `k8s.ns` and `k8s.pod` are populated automatically — Falco queried the Kubernetes API to enrich the raw syscall event with pod/namespace context, which is what makes the alert actionable instead of just a bare container ID.

---

## Step 8 — Install Falcosidekick to See Fan-Out (Optional)

```bash
helm upgrade falco falcosecurity/falco \
  --namespace falco \
  --reuse-values \
  --set falcosidekick.enabled=true \
  --set falcosidekick.webui.enabled=true

kubectl -n falco port-forward svc/falco-falcosidekick-ui 2802:2802
```
Open http://localhost:2802 — Falcosidekick's built-in UI shows every alert it received, which is the same data path you'd wire to Slack/PagerDuty/a SIEM in production by adding the relevant Falcosidekick output config instead of (or alongside) the UI.

Repeat Step 7's shell-spawn trigger and watch the alert land in the Falcosidekick UI within a second or two.

---

## Cleanup

```bash
docker rm -f falco victim
kind delete cluster --name falco-lab
```

## What to Explore Next
- Write a custom rule (like the `debug-tools` exclusion example in the notes) that suppresses shell-spawn alerts for a specific namespace, and confirm it quiets that namespace while still alerting elsewhere.
- Trigger "Unexpected outbound connection" by curling an unusual external port from inside a container and watch Falco flag it.
- Put Falco in log-only mode against a busy namespace for a while and count how many alerts are noise vs. real signal — this is the exact tuning exercise real rollouts go through.
- Compare this to admission-time control: apply a Kyverno policy that would have blocked the `victim` pod from running as root in the first place, and think through why that doesn't replace what Falco just caught (see the Falco vs admission-controller comparison in the notes).
