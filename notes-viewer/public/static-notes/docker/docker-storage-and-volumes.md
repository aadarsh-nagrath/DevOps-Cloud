# Docker Storage and Volumes

Volumes, bind mounts, and tmpfs compared in depth, plus backup/restore and stateful container patterns — see [docker.md](docker.md) for the folder index.

---

## 1. The Three Storage Mechanisms Compared

| Aspect | Volumes | Bind Mounts | tmpfs |
|---|---|---|---|
| Location | Managed by Docker under `/var/lib/docker/volumes/` | Any path on the host filesystem | In-memory only (never touches disk) |
| Persistence | Persists until explicitly removed, independent of container lifecycle | Persists on the host (it's just a host directory/file) | Gone when the container stops |
| Performance | Native filesystem performance on Linux; good | Native — direct host filesystem access | Fastest (RAM), but limited by available memory |
| Portability | Fully portable — Docker manages the path, works the same across hosts, drivers can target remote storage | **Not portable** — depends on the exact host path existing with the right permissions | Not portable / not persistent by design |
| Managed by Docker CLI | Yes (`docker volume create/inspect/rm`) | No — you manage the host path yourself | No dedicated management commands |
| Backed by 3rd-party drivers | Yes (NFS, cloud block storage, etc. — see [docker-more.md](docker-more.md)) | No | No |
| Best use case | Databases, application state, anything you want Docker to own and back up | Local development (mount source code for live-reload), sharing config/secrets from a known host path, CI runners needing host log access | Sensitive/ephemeral data you never want written to disk (secrets scratch space, cache that must vanish on stop) |
| Sharing across multiple containers | Yes — mount the same named volume into multiple containers | Yes — mount the same host path into multiple containers | No — tmpfs is per-container |

> `docker-more.md` already documents third-party **volume drivers** (NFS, rexray, portworx, glusterfs, etc.) in depth — see that file rather than duplicating it here.

---

## 2. `docker volume` Command Reference

```bash
# Create a named volume (uses the default 'local' driver unless --driver is given)
docker volume create mydata

# List all volumes
docker volume ls

# Inspect — shows Mountpoint on the host, driver, labels, scope
docker volume inspect mydata

# Remove a volume (fails if still in use by a container)
docker volume rm mydata

# Remove all volumes not referenced by any container
docker volume prune
```

---

## 3. Named Volumes vs Anonymous Volumes

| Aspect | Named volume | Anonymous volume |
|---|---|---|
| Identifier | Explicit name you choose (`mydata`) | Random hash Docker generates |
| Reusability | Easy — reference the same name from other containers/runs | Hard — you'd have to look up the generated ID |
| Created by | `docker volume create`, or implicitly via `-v mydata:/path` | `-v /path` (no source) or a Dockerfile `VOLUME` instruction with nothing bound at runtime |
| Cleanup | Survives `docker rm` unless removed explicitly | Also survives `docker rm` by default, but `docker rm -v` and `--rm` clean them up — easy to accumulate orphans if forgotten |

```bash
docker run -d -v mydata:/var/lib/postgresql/data postgres:16   # named
docker run -d -v /var/lib/postgresql/data postgres:16          # anonymous — random name each run
```
Prefer named volumes for anything you intend to reuse, inspect, or back up — anonymous volumes are easy to lose track of and pile up as orphaned storage.

---

## 4. Bind Mount Syntax: `-v` vs `--mount`

```bash
# -v / --volume (older, terser, positional syntax: [host-src:]container-dest[:options])
docker run -v /host/path:/container/path:ro myapp

# --mount (newer, explicit key=value syntax — recommended)
docker run --mount type=bind,source=/host/path,target=/container/path,readonly myapp
```

| Aspect | `-v` / `--volume` | `--mount` |
|---|---|---|
| Syntax | Positional, colon-separated — easy to mistype which side is host vs container | Explicit `key=value` pairs — unambiguous |
| Creates missing host directory automatically | Yes (silently) — can mask a typo'd path as a surprise empty new directory | No — errors if the source doesn't exist, catching typos immediately |
| Supports volume drivers/advanced options | Limited | Full support (`volume-opt`, `volume-driver`, tmpfs size, etc.) |
| Recommended | Fine for quick one-liners | **Preferred** for scripts, Compose files, and anything production-facing — explicit and fails loudly on mistakes |

---

## 5. Read-Only Mounts

```bash
docker run --mount type=bind,source=/etc/app-config,target=/config,readonly myapp
docker run -v /etc/app-config:/config:ro myapp
```
Use read-only mounts for configuration, secrets, or any host data the container should never be able to modify — limits blast radius if the container is compromised or has a bug that writes where it shouldn't.

---

## 6. Volume Backup and Restore Patterns

Back up a named volume to a tarball on the host, using a throwaway container that mounts both the volume and a host directory:
```bash
# --rm: throwaway container, cleaned up automatically after it exits
# -v myvolume:/data       : mount the volume being backed up, read-only from this container's perspective conceptually
# -v $(pwd):/backup       : mount current host directory to write the tarball into
docker run --rm -v myvolume:/data -v $(pwd):/backup busybox \
  tar cvf /backup/backup.tar /data
```

Restore into a fresh (or existing) volume from that tarball:
```bash
docker volume create myvolume_restored
docker run --rm -v myvolume_restored:/data -v $(pwd):/backup busybox \
  tar xvf /backup/backup.tar -C /data --strip-components=1
```

Compress instead of a plain tar for large datasets:
```bash
docker run --rm -v myvolume:/data -v $(pwd):/backup busybox \
  tar czvf /backup/backup.tar.gz /data
```

For databases specifically, prefer the database's own logical backup tool (`pg_dump`, `mysqldump`) over raw volume tar copies where possible — raw file copies of a live database's data directory can capture an inconsistent state unless the database is stopped or you use a filesystem-consistent snapshot mechanism.

---

## 7. Data Persistence Patterns for Stateful Containers

```bash
# Database container: named volume for durable data, separate from the container's lifecycle
docker run -d --name pg \
  -e POSTGRES_PASSWORD=secret \
  -v pgdata:/var/lib/postgresql/data \
  postgres:16
```
- The container can be removed and recreated (new image version, config change) without losing data, as long as the same named volume is reattached.
- Never store stateful data in the container's writable layer — it's deleted with `docker rm` and doesn't survive image updates.
- For clustered/HA databases, volumes are still per-node/per-container; replication is handled at the application layer (Postgres streaming replication, MySQL group replication), not by Docker.

---

## 8. Sharing Data Between Containers

```bash
# Two containers mounting the same named volume — e.g., an app writing logs, a sidecar shipping them
docker volume create shared-logs
docker run -d --name app -v shared-logs:/var/log/app myapp
docker run -d --name log-shipper -v shared-logs:/var/log/app:ro fluentd
```
- The producer mounts read-write, the consumer can mount `:ro` if it should never modify the shared data.
- This is the standard pattern for sidecar containers (log shippers, metrics exporters) that need access to another container's files without merging processes into one container.
- In Compose, the same effect is achieved by declaring one `volumes:` entry and referencing it from multiple services — see [docker-compose.md](docker-compose.md).

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
