# containerd — Learn It Locally

Goal: get hands-on with `ctr` and `nerdctl` against a real containerd, then look inside a `kind` Kubernetes node and confirm it's containerd (via CRI/`crictl`) doing the actual work underneath kubelet — in about 20 minutes. No native Linux install required; this uses containers to give you a real containerd to talk to, since macOS/Windows Docker Desktop runs containerd inside its Linux VM, not on the host directly.

## Prerequisites
- Docker installed and running.
- `kind` (`brew install kind` on macOS, or see [kind.sigs.k8s.io](https://kind.sigs.k8s.io/)).
- `kubectl`.

---

## Step 1 — Get a Real containerd to Talk To

The cleanest way to get `ctr`/`nerdctl` working locally without touching your host OS is to run containerd inside a container using the official `containerd` image, with a privileged container so it can actually manage its own containers.

```bash
docker run -d --name containerd-lab --privileged \
  docker.io/library/nginx:alpine sh -c "sleep infinity" 2>/dev/null || true
docker rm -f containerd-lab 2>/dev/null || true
```

Instead, the simplest realistic path is to use **kind**, since every kind node is a Docker container that runs containerd internally as its actual container runtime — this also directly sets up Step 4 later. Create the cluster now:

```bash
kind create cluster --name containerd-lab
kubectl get nodes
```

`kind` nodes ship with `ctr`, `crictl`, and containerd itself preinstalled — we'll use the node itself as our containerd sandbox for Steps 2-3, which is also a genuinely useful skill (this is exactly how you'd debug a real cluster node).

```bash
docker ps --filter name=containerd-lab-control-plane
```

---

## Step 2 — Use `ctr` Inside the Node

Exec into the node container:
```bash
docker exec -it containerd-lab-control-plane bash
```

Inside the node, containerd is already running as the node's container runtime. Explore it with `ctr`:
```bash
# containerd's own multi-tenancy namespaces
ctr namespaces ls
# k8s.io    <- everything kubelet/CRI creates lives here

# Images containerd has already pulled for running pods (kube-proxy, coredns, etc.)
ctr --namespace k8s.io images ls

# Running containers/tasks, in the k8s.io namespace
ctr --namespace k8s.io containers ls
ctr --namespace k8s.io tasks ls
```

Now pull and run something yourself, in a separate scratch namespace so it doesn't collide with Kubernetes' own `k8s.io` namespace:
```bash
ctr --namespace demo images pull docker.io/library/hello-world:latest
ctr --namespace demo run --rm docker.io/library/hello-world:latest hello-test
```
You should see the classic "Hello from Docker!" message — except it never touched Docker at all. That output came straight from containerd + runc.

---

## Step 3 — Use `nerdctl` for a Docker-Familiar Workflow

`nerdctl` isn't preinstalled on kind nodes by default, so install it quickly inside the node:
```bash
# still inside the docker exec session from Step 2
apt-get update -qq && apt-get install -y -qq curl >/dev/null
curl -sSL https://github.com/containerd/nerdctl/releases/download/v1.7.6/nerdctl-1.7.6-linux-$(dpkg --print-architecture).tar.gz | tar Cxz /usr/local/bin
nerdctl --namespace demo run -d --name web -p 8081:80 docker.io/library/nginx:alpine
nerdctl --namespace demo ps
```
This is the exact `docker run -d -p ...` syntax you already know, executing entirely through containerd's native API — no Docker daemon involved. Exit the node when done exploring:
```bash
exit
```

---

## Step 4 — Confirm Kubernetes Itself Runs on containerd (via CRI)

Back on your host, inspect the same kind node from the CRI angle — this is what kubelet actually sees, and is the tool you'd reach for on a real production node:

```bash
docker exec -it containerd-lab-control-plane crictl ps
```
This lists every container currently running, exactly as kubelet's CRI client sees them — `kube-apiserver`, `etcd`, `coredns`, `kube-proxy`, all running as plain containerd-managed containers, no Docker anywhere in the picture.

```bash
docker exec -it containerd-lab-control-plane crictl pods
```
Shows **pod sandboxes** — each Kubernetes pod maps to one CRI "pod sandbox" (the `pause` container holding the shared network namespace) plus one or more application containers inside it.

```bash
docker exec -it containerd-lab-control-plane crictl inspect $(docker exec containerd-lab-control-plane crictl ps -q --name coredns | head -1)
```
Full CRI-level container spec — this is the same data `kubectl describe pod` summarizes, but straight from the runtime with nothing lost in translation.

Check the containerd config that made this all possible:
```bash
docker exec -it containerd-lab-control-plane cat /etc/containerd/config.toml | grep -A5 "cri\]"
```

---

## Step 5 — Deploy a Real Pod and Trace It All the Way Down

```bash
kubectl create deployment demo-nginx --image=nginx:alpine
kubectl wait --for=condition=available deployment/demo-nginx --timeout=60s
kubectl get pods -o wide
```

Find that exact container through containerd, bypassing kubectl entirely:
```bash
docker exec -it containerd-lab-control-plane crictl ps --name nginx
docker exec -it containerd-lab-control-plane crictl logs <container-id-from-above>
```

This is the full path proven end to end: `kubectl` → API server → scheduler → kubelet on the node → **CRI gRPC call to containerd** → containerd's CRI plugin → snapshotter (image layers) + shim → `runc` → the actual running container you just queried.

---

## Cleanup
```bash
kind delete cluster --name containerd-lab
```

## What to Explore Next
- Compare `crictl images` output against `ctr --namespace k8s.io images ls` on the same node — same containerd, two different client views of the same content store.
- Deploy a pod with `runtimeClassName` pointing at a second runtime (would require adding a `gvisor`/`runsc` runtime handler to `config.toml` and a matching `RuntimeClass` object) to see containerd route different pods to different OCI runtimes on the same node.
- On a real Linux VM (not kind), install containerd standalone (`apt install containerd` or the official binary release) and compare its default `config.toml` to the one kind ships — note the `SystemdCgroup` setting and registry mirror config differences.
- Kill and restart the `containerd` process inside a kind node (`docker exec containerd-lab-control-plane pkill containerd`, then watch systemd/the node restart it) and observe that already-running containers (via their shim processes) keep running the whole time — direct proof of the shim's job.
