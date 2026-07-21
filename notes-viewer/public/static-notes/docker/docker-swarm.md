# Docker Swarm

Docker's native clustering and orchestration mode — turns a group of Docker hosts into a single virtual host for running services. See also [Docker overview](docker.md), [Docker Networking](docker-networking.md), and [Docker Compose](docker-compose.md) (Compose files feed directly into Swarm stacks).

---

## 1. What Swarm Is

Swarm mode is built into the Docker Engine itself (`docker swarm`, `docker service`, `docker stack` — no separate install). It lets you:

- Join multiple Docker hosts (**nodes**) into a single cluster.
- Declare **services** (desired state: "run 5 replicas of this image") instead of managing individual containers.
- Get automatic scheduling, scaling, rolling updates, and load-balanced traffic routing across the cluster.

It solves the same class of problem as Kubernetes — multi-host container orchestration — with a much smaller surface area and no extra components to install.

---

## 2. Swarm vs Kubernetes

| Aspect | Docker Swarm | Kubernetes |
|---|---|---|
| Setup complexity | Very low — `docker swarm init`, done in seconds | High — control plane, etcd, CNI plugin, kubelet, kube-proxy, all need configuring (or a managed offering) |
| Learning curve | Low — reuses Docker CLI/Compose concepts | Steep — its own object model (Pods, Deployments, Services, Ingress, CRDs) |
| Feature depth | Basic scheduling, rolling updates, secrets, overlay networking | Extremely deep — autoscaling (HPA/VPA/cluster autoscaler), advanced scheduling (affinity, taints/tolerations), StatefulSets, Operators, service mesh integration, huge CRD ecosystem |
| Ecosystem & tooling | Small, mostly stagnant since ~2018 | Massive — Helm, ArgoCD, Prometheus/Grafana stacks, virtually every cloud vendor and vendor tool targets it first |
| Managed cloud offerings | None from major clouds (AWS/Azure/GCP dropped Swarm support) | EKS, GKE, AKS, and most PaaS/cloud platforms — first-class support everywhere |
| Community & hiring | Small, shrinking; Docker Inc. shifted focus to Compose + Kubernetes integration | Dominant — most DevOps/platform job postings assume k8s |
| Multi-tenancy / RBAC | Minimal | Rich RBAC, namespaces, admission controllers |
| Networking model | Built-in overlay + routing mesh, simple | Pluggable CNI, more flexible but more moving parts |
| Best fit today | Small teams, homelab/edge clusters, simple stacks that don't need k8s's power, or anyone already fully invested in Compose files who wants a very low-effort step up to multi-host | Anything production-grade at real scale, anywhere hiring/tooling/ecosystem support matters |

**Honest take**: Swarm is genuinely simpler and still works, but the ecosystem has moved on — Docker Inc. itself de-emphasized it years ago in favor of pointing users at Kubernetes for serious production workloads. Learn Swarm to understand orchestration concepts cheaply; expect to use Kubernetes professionally.

---

## 3. Initializing a Swarm

```bash
# On the first machine -- becomes the initial manager node
docker swarm init --advertise-addr <MANAGER_IP>
# --advertise-addr: the IP other nodes will use to reach this manager
# (required when the host has multiple network interfaces)

# Output includes a ready-to-copy join command for workers, e.g.:
#   docker swarm join --token SWMTKN-1-xxxx <MANAGER_IP>:2377

# Get the join token again later (worker or manager token)
docker swarm join-token worker    # prints the worker join command + token
docker swarm join-token manager   # prints the manager join command + token (grants full control -- guard this)

# On additional machines -- join as a worker
docker swarm join --token <TOKEN> <MANAGER_IP>:2377

# Promote a worker to manager (for HA) or demote back
docker node promote <NODE_NAME>
docker node demote <NODE_NAME>

# List all nodes and their role/status
docker node ls
```

### Manager vs worker nodes

| Role | Responsibility |
|---|---|
| **Manager** | Maintains cluster state, schedules services onto nodes, serves the Swarm API, participates in Raft consensus. Can also run workloads unless drained. |
| **Worker** | Executes tasks (containers) assigned by managers. Cannot see cluster state or make scheduling decisions. |

### Raft consensus and manager HA

- Manager nodes replicate cluster state via the **Raft consensus algorithm** — every manager holds a full copy of the cluster state (services, nodes, secrets, etc.) in an internal store.
- A **quorum** (strict majority) of managers must be reachable and agree for the cluster to accept changes. With `N` managers, the cluster tolerates `floor((N-1)/2)` manager failures.
- Odd numbers are recommended: 3 managers tolerate 1 failure, 5 tolerate 2. An even number (e.g. 4) doesn't improve fault tolerance over the odd number below it, just adds overhead.
- Never run a large number of managers "for safety" — more managers means more Raft replication traffic and slower consensus, with no proportional benefit. 3 or 5 is the practical ceiling for most clusters.

---

## 4. Services — The Swarm Primitive

A **service** is the declarative unit in Swarm: "run this image, this many times, with these constraints." Swarm reconciles actual state to match it continuously.

```bash
# Create a replicated service (Swarm's default mode) -- N identical, load-balanced instances
docker service create \
  --name web \
  --replicas 3 \
  --publish published=8080,target=80 \
  nginx:alpine

# Create a global service -- exactly one instance on EVERY node (current and future)
# Typical use: log shippers, monitoring agents, node-level daemons
docker service create --name node-agent --mode global datadog/agent

# Scale a replicated service up or down
docker service scale web=6

# Update a running service (image, env vars, resources, etc. -- see rolling updates in section 8)
docker service update --image nginx:1.27-alpine web

# Inspect, list, and remove
docker service ls
docker service ps web        # shows each task/replica, which node it's on, and its state
docker service inspect web --pretty
docker service rm web
```

| Mode | Behavior |
|---|---|
| `replicated` (default) | Runs a specified, fixed number of task instances, scheduled across nodes by the scheduler. |
| `global` | Runs exactly one task on every node in the cluster (or every node matching constraints), scaling automatically as nodes join/leave. |

---

## 5. Stacks — Reusing Compose Files for Swarm

A **stack** is a group of services deployed together from a Compose file, the Swarm equivalent of `docker compose up` for a cluster.

```bash
# Deploy a stack from a standard Compose file
docker stack deploy -c docker-compose.yml mystack
# -c: the compose file to read; "mystack" becomes the prefix for all created resources

docker stack ls                 # list deployed stacks
docker stack services mystack   # list services belonging to this stack
docker stack ps mystack         # list all tasks (container instances) across the stack
docker stack rm mystack         # tear down every service, network, and (non-external) resource in the stack
```

Compose files work mostly unchanged, but Swarm only honors the `deploy:` key (ignored by plain `docker compose up`) and ignores `build:` — stacks require pre-built, pushed images, since a manager may schedule the service on any node in the cluster, not just the one that built the image:

```yaml
# docker-compose.yml (used both by `docker compose` locally and `docker stack deploy` in Swarm)
services:
  web:
    image: myregistry/web:1.4.0   # must be a pushed, pullable image -- no `build:` in Swarm
    ports:
      - "8080:80"
    deploy:
      replicas: 3
      update_config:               # see rolling updates, section 8
        parallelism: 1
        delay: 10s
      placement:                   # see placement constraints, section 10
        constraints:
          - node.role == worker
```

---

## 6. Overlay Networks (Multi-Host Communication)

Swarm services on different physical/VM hosts need a network that spans hosts — this is the **overlay** driver.

```bash
# Create an attachable overlay network -- "attachable" lets standalone `docker run` containers join it too
docker network create --driver overlay --attachable app-overlay
```

- Traffic between containers on an overlay network is encrypted by default (VXLAN with IPsec) once `--opt encrypted` is set, or always for the control plane traffic between managers.
- Services attached to the same overlay network resolve each other by service name via Swarm's embedded DNS, the same mental model as Compose's default network — see [Docker Networking](docker-networking.md) for the underlying driver mechanics (bridge vs overlay, VXLAN encapsulation).
- Each service also gets a **virtual IP (VIP)** by default, load-balancing requests to that name across all healthy replicas — an internal L4 load balancer with zero extra config.

---

## 7. Routing Mesh / Ingress Networking

When you publish a port with `--publish published=8080,target=80` (or `ports:` in a stack file), Swarm's **routing mesh** makes that port reachable on **every node in the cluster**, not just the node(s) actually running the container.

- A request hitting `node2:8080` gets routed — via the mesh, over the special `ingress` overlay network — to a healthy replica of the service, even if that replica is running on `node5`.
- This means you can point a load balancer at any/all node IPs on the published port and traffic gets distributed correctly, without needing to track which node currently runs which replica.
- Use `mode: host` in the `ports:` publish config to bypass the mesh and bind the port only on nodes actually running a task (useful when you need the real client source IP, or for `global` services like reverse proxies that should only listen where they actually run).

---

## 8. Rolling Updates and Rollback

```bash
# Trigger a rolling update by changing the image (or any service spec)
docker service update \
  --image myapp:2.0 \
  --update-parallelism 2 \
  --update-delay 20s \
  --update-failure-action rollback \
  web

# Roll back to the previous service spec if something's wrong
docker service rollback web
```

Compose/stack file equivalent — `deploy.update_config`:

```yaml
services:
  web:
    image: myapp:2.0
    deploy:
      replicas: 6
      update_config:
        parallelism: 2          # update 2 tasks at a time, not all 6 at once
        delay: 20s               # wait 20s between each batch, giving time to observe health
        failure_action: rollback # auto-revert to the previous version if an update batch fails
        order: start-first       # start the new task before stopping the old one (vs default stop-first)
      rollback_config:
        parallelism: 1
        delay: 10s
```

Combine `update_config` with a `healthcheck:` block — Swarm considers a task "failed" during rollout if it doesn't become healthy, which is what actually triggers `failure_action` rather than just watching for a crash.

---

## 9. Secrets and Configs

Both are cluster-managed objects mounted as **files inside the container's filesystem** (under `/run/secrets/<name>` and the specified target path respectively) rather than passed as environment variables — meaningfully more secure, since env vars are visible via `docker inspect`, process listings, and often leak into logs, while these files are mounted directly into the container's tmpfs and only in memory on manager nodes.

```bash
# Secrets -- for sensitive data (passwords, API keys, TLS certs)
echo "supersecretpassword" | docker secret create db_password -
docker secret ls
docker secret inspect db_password   # metadata only -- value is never shown back

# Configs -- for non-sensitive config files (nginx.conf, app.json, etc.)
docker config create nginx_conf ./nginx.conf
docker config ls
```

Attach them to a service:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password   # Postgres reads the password from a file, not an env var
    secrets:
      - db_password

  proxy:
    image: nginx:alpine
    configs:
      - source: nginx_conf
        target: /etc/nginx/nginx.conf

secrets:
  db_password:
    external: true      # already created via `docker secret create`, referenced by name

configs:
  nginx_conf:
    external: true
```

Secrets/configs are immutable once created — to change a value, create a new secret/config with a new name (or versioned name) and update the service to reference it, then remove the old one once nothing uses it.

---

## 10. Placement Constraints and Node Labels

Control which nodes a service's tasks are allowed to run on.

```bash
# Label a node -- arbitrary key/value metadata
docker node update --label-add ssd=true node3
docker node update --label-add zone=us-east node1
```

```yaml
services:
  db:
    image: postgres:16-alpine
    deploy:
      placement:
        constraints:
          - node.role == worker        # only schedule on worker nodes, keep managers free for control-plane work
          - node.labels.ssd == true    # only nodes labeled with fast storage
        preferences:
          - spread: node.labels.zone   # spread replicas evenly across the "zone" label's distinct values
```

Common built-in constraint keys: `node.role` (`manager`/`worker`), `node.id`, `node.hostname`, `node.labels.<key>` (custom labels), `engine.labels.<key>` (Docker Engine labels).

---

## 11. When To Actually Choose Swarm Today

| Choose Swarm when | Choose Kubernetes when |
|---|---|
| Small team, small cluster (a handful of nodes), no dedicated platform team | Any production workload at meaningful scale |
| Already deeply invested in Compose files and want a low-effort step to multi-host | You need autoscaling, service mesh, advanced scheduling, or a large ecosystem of tools |
| Homelab, edge devices, or internal tooling where operational simplicity beats features | Hiring matters — k8s skills are what the market expects |
| You want zero extra infrastructure (no etcd cluster, no separate control plane to run) | You need long-term vendor/cloud support — every major cloud offers managed k8s, none offer managed Swarm |
| A stopgap while migrating from single-host Compose towards eventual Kubernetes | You're building anything expected to still be maintained and staffed in a few years |

In short: Swarm is a legitimate, low-friction choice for small, simple, self-managed clusters — but go in aware that the ecosystem, tooling, and hiring pool have consolidated around Kubernetes, so anything beyond a small/simple deployment tends to hit Swarm's ceiling quickly.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
