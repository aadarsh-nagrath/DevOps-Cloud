# Docker Networking

Network drivers, container-to-container communication, port publishing, DNS, and troubleshooting — see [docker.md](docker.md) for the folder index.

---

## 1. Network Drivers

| Driver | Scope | Isolation | Use case |
|---|---|---|---|
| `bridge` | Single host | Containers on the same bridge can reach each other; isolated from other bridges | Default for standalone containers — most common single-host case |
| `host` | Single host | None — container shares the host's network namespace directly | Max network performance, no NAT overhead; when you need the container to bind host ports/interfaces directly (not available on Docker Desktop for Mac/Windows the same way as on Linux) |
| `none` | Single host | Total — no networking at all (only loopback) | Security-sensitive batch jobs, custom/manual network setup |
| `overlay` | Multi-host (Swarm) | Encrypted, routable across hosts via VXLAN | Multi-host container communication in Swarm services — see [docker-swarm.md](docker-swarm.md) / [docker-production-and-orchestration.md](docker-production-and-orchestration.md) |
| `macvlan` | Single host, L2 | Container gets its own MAC address, appears as a physical device on the LAN | Legacy apps expecting a real LAN IP, network monitoring tools, migrating VM-based network topologies |

```bash
docker network ls          # list all networks on this host
docker network ls --filter driver=bridge
```

---

## 2. Default Bridge vs User-Defined Bridge

Docker creates a default network named `bridge` automatically. Containers not attached to any other network land here unless told otherwise.

| Aspect | Default `bridge` | User-defined bridge |
|---|---|---|
| DNS-based service discovery | No — containers only reach each other by IP | **Yes** — containers resolve each other by container name / service name automatically |
| Isolation from other containers | All containers on default bridge can reach each other unless firewalled | Only containers explicitly attached to the network can reach each other |
| Legacy `--link` needed for name resolution | Yes | No — not needed at all |
| Recommended for | Nothing, really — kept for backward compatibility | **Always** — create one per application/stack |

```bash
# Create a user-defined bridge
docker network create app-net

# Run containers attached to it — they can now resolve each other by name
docker run -d --name db --network app-net postgres:16
docker run -d --name api --network app-net myapp:1.0
# From inside `api`, `curl http://db:5432` resolves via Docker's embedded DNS server (127.0.0.11)
```
This DNS-based discovery — not needing to hardcode IPs, which are not stable across restarts — is the main reason user-defined bridges are the practical default for any multi-container setup, including what Compose creates automatically per project.

---

## 3. Container-to-Container Communication

- Containers on the **same user-defined network** communicate over their container/service name, resolved via Docker's embedded DNS resolver at `127.0.0.11` inside each container.
- Containers on **different** networks cannot reach each other unless one is explicitly connected to both (`docker network connect`) or traffic is routed through the host.
- Compose automatically creates a dedicated user-defined bridge per project and attaches all services to it — see [docker-compose.md](docker-compose.md).

---

## 4. Exposing and Publishing Ports

| Mechanism | Effect |
|---|---|
| `EXPOSE` in Dockerfile | Documentation only — no port is actually published to the host |
| `-P` (capital) | Publishes **all** `EXPOSE`d ports to random high host ports |
| `-p host:container` | Publishes a **specific** container port to a specific (or random, if host port omitted) host port |

```bash
docker run -d -p 8080:80 nginx          # host:8080 -> container:80
docker run -d -p 127.0.0.1:8080:80 nginx  # bind only to host loopback, not all interfaces
docker run -d -p 8080:80/udp myapp        # publish a UDP port
docker run -d -P nginx                    # publish all EXPOSEd ports to random host ports
docker port <container>                   # show the actual host-port mapping
```
Containers on the *same* user-defined network never need `-p` to reach each other — publishing to the host is only needed to expose a service outside Docker's network entirely (e.g., to your laptop's browser, or the public internet).

---

## 5. `docker network` Command Reference

```bash
# Create
docker network create --driver bridge --subnet 172.20.0.0/16 --gateway 172.20.0.1 custom-net

# Inspect — shows connected containers, subnet, gateway, driver options
docker network inspect custom-net

# Connect a running container to an additional network (containers can belong to multiple networks)
docker network connect custom-net some-container

# Disconnect
docker network disconnect custom-net some-container

# Remove (fails if containers are still attached)
docker network rm custom-net

# Remove all unused networks
docker network prune
```

---

## 6. DNS Resolution Inside Docker Networks

- Every user-defined network runs Docker's embedded DNS server at `127.0.0.11`, injected into each container's `/etc/resolv.conf`.
- Name resolution order: container name → Compose service name (aliases) → falls through to the host's configured DNS/upstream resolvers for anything not internal.
- Custom DNS servers or search domains can be set per-container:
```bash
docker run --dns 8.8.8.8 --dns-search example.com myapp
```
- On the *default* bridge network, this DNS service is **not** active — another reason to avoid it (§2).

---

## 7. Linking Containers: Legacy `--link` vs Modern Networks

```bash
# Legacy (deprecated) — one-directional, fragile, no longer recommended
docker run -d --name db postgres
docker run -d --name api --link db:db myapp
```
`--link` predates user-defined networks; it manually injected `/etc/hosts` entries and environment variables, was one-directional, and broke on container restart (new IP, stale link). **Use a user-defined bridge network instead** — bidirectional name resolution, survives restarts, no special flags needed at all beyond `--network`.

---

## 8. Network Troubleshooting

```bash
# Inspect a network's config, subnet, and connected containers
docker network inspect app-net

# Check a container's actual network interfaces/IP from outside
docker exec -it mycontainer ip addr show

# Check routing table inside a container
docker exec -it mycontainer ip route

# Test DNS resolution from inside a container
docker exec -it mycontainer nslookup db
docker exec -it mycontainer getent hosts db

# Enter a container's network namespace directly from the host (useful when the container
# has no shell, e.g. distroless) — find its PID first
docker inspect -f '{{.State.Pid}}' mycontainer
sudo nsenter -t <pid> -n ip addr    # -n = enter only the network namespace

# Check iptables NAT rules Docker installed for port publishing (Linux host)
sudo iptables -t nat -L -n | grep DOCKER
```

**iptables basics for Docker NAT**: on Linux, `dockerd` programs `iptables` rules in the `DOCKER` chain to implement `-p host:container` publishing — a `DNAT` rule rewrites the destination of incoming host-port traffic to the container's internal IP:port. If port publishing "isn't working," check that `iptables`-based forwarding isn't being overridden by another firewall manager (firewalld, ufw) that resets Docker's chains on reload.

---

## 9. Overlay Networks (Multi-Host, Brief)

`overlay` networks let containers on **different physical/virtual hosts** communicate as if on the same L2 network, using VXLAN encapsulation across a Swarm cluster's data plane. Creating one requires Swarm mode to be initialized:
```bash
docker network create --driver overlay --attachable my-overlay
```
Full multi-host orchestration, service discovery across nodes, and encrypted overlay traffic are covered in [docker-swarm.md](docker-swarm.md) and [docker-production-and-orchestration.md](docker-production-and-orchestration.md) — this file only covers single-host networking in depth.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
