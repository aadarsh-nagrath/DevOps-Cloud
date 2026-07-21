# Docker Compose

Define and run multi-container applications from a single declarative YAML file — the standard tool for local dev environments and single-host deployments. See also [Docker overview](docker.md) and the [CLI cheatsheet](commands.md).

---

## 1. What Problem It Solves

Running a real application by hand means a chain of `docker run` commands: one for the app, one for the database, one for the cache, each with matching networks, volumes, and env vars, started in the right order. That's error-prone and not reproducible.

Compose lets you describe the whole stack — services, networks, volumes, dependencies — in one `docker-compose.yml`, then bring it all up or down with a single command. It's aimed at **single-host** setups (local dev, CI, small deployments); for multi-host orchestration see [Docker Swarm](docker-swarm.md) or Kubernetes.

---

## 2. Compose File Version History (Brief)

| Version | Notes |
|---|---|
| v1 (no `version:` key) | Original format, no networks section, all containers on one default bridge — deprecated. |
| v2.x | Introduced `version: "2"`, automatic network creation, `depends_on` (without health conditions), named volumes as top-level keys. |
| v3.x | Introduced `version: "3"`, added `deploy:` key for Swarm stacks, dropped some v2-only options (e.g. `cpu_shares` moved under `deploy.resources`). |
| **Compose Spec** (current) | v2 and v3 were unified into a single, versionless **Compose Specification**. The `version:` key is now optional/ignored by modern Compose — the CLI just uses whatever keys it understands. New files should omit `version:` entirely. |

### `docker compose` (CLI plugin) vs `docker-compose` (legacy binary)

| | `docker-compose` (v1, legacy) | `docker compose` (v2, current) |
|---|---|---|
| Distribution | Standalone Python binary, installed separately | Docker CLI plugin, written in Go, bundled with Docker Desktop / `docker-compose-plugin` package |
| Invocation | `docker-compose up` (hyphen) | `docker compose up` (space, subcommand) |
| Maintenance | End-of-life, no longer receiving updates | Actively maintained, receives new features first |
| Performance | Slower (Python) | Faster (Go, shares Docker CLI's connection) |
| Recommendation | Avoid on new setups | Use this — install via Docker Desktop or `apt install docker-compose-plugin` |

Both read the same `docker-compose.yml` / `compose.yaml` file, so existing files don't need rewriting — just switch the command you invoke.

---

## 3. Full `docker-compose.yml` Syntax Reference

```yaml
# compose.yaml (or docker-compose.yml — both names are recognized)
services:
  web:
    build:                        # build an image from a Dockerfile...
      context: ./web               # directory containing the Dockerfile
      dockerfile: Dockerfile.prod  # optional, defaults to "Dockerfile"
      args:                        # build-time ARG values
        NODE_ENV: production
    # image: myregistry/web:1.2.0 # ...OR use a pre-built image instead of `build`
                                   # (if both are set, Compose builds AND tags it as `image`)

    ports:
      - "3000:3000"                # "host:container" — host port : container port
      - "127.0.0.1:9229:9229"      # bind only to localhost on the host side

    volumes:
      - ./web/src:/app/src         # bind mount — host path : container path
      - node_modules:/app/node_modules   # named volume (declared in top-level `volumes:`)
      - ./config.ro.yml:/app/config.yml:ro   # :ro = read-only mount

    environment:                   # inline env vars (take precedence over env_file)
      - NODE_ENV=production
      - LOG_LEVEL=info

    env_file:                      # load env vars from a file (lower precedence than `environment`)
      - .env.web

    networks:
      - frontend
      - backend

    depends_on:
      db:
        condition: service_healthy   # wait for db's healthcheck to pass, not just for it to start
      cache:
        condition: service_started   # default behavior — just wait for the container to start

    restart: unless-stopped         # see restart policy table below

    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s                 # time between checks
      timeout: 3s                   # time to wait for the check to respond
      retries: 3                    # consecutive failures before marked "unhealthy"
      start_period: 15s             # grace period on startup before failures count

    deploy:                         # mostly relevant to `docker stack deploy` (Swarm), ignored by
      resources:                    # plain `docker compose up`, but resource limits ARE respected
        limits:
          cpus: "0.50"
          memory: 256M

    profiles: ["debug"]             # only starts when this profile is active (see section 6)

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}   # substituted from shell env or .env file
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5

networks:
  frontend:
  backend:
    driver: bridge

volumes:
  node_modules:
  pgdata:
```

### Restart policies

| Value | Behavior |
|---|---|
| `no` (default) | Never restart automatically. |
| `always` | Always restart, even after a manual stop or daemon restart. |
| `on-failure[:max-retries]` | Restart only if the container exits with a non-zero code, up to an optional retry cap. |
| `unless-stopped` | Restart unless the container was explicitly stopped by the user — the common choice for long-running services. |

---

## 4. Multi-Service Example — Node + Postgres + Redis

```yaml
# compose.yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://appuser:${DB_PASSWORD}@db:5432/appdb   # "db" resolves via Compose DNS
      - REDIS_URL=redis://cache:6379
    depends_on:
      db:
        condition: service_healthy   # don't start app until Postgres is actually ready to accept connections
      cache:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - app-net

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: appdb
    volumes:
      - pgdata:/var/lib/postgresql/data   # persist data across container recreation
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser -d appdb"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - app-net

  cache:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]   # enable AOF persistence
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 5
    networks:
      - app-net

networks:
  app-net:
    driver: bridge

volumes:
  pgdata:
  redisdata:
```

`docker compose up -d` starts all three in dependency order, waiting on each healthcheck before starting the next dependent service.

---

## 5. Compose Networking

- Compose automatically creates a **default bridge network** for the project (named `<project>_default`) unless custom networks are declared.
- Every service on a shared network can reach every other service **by service name** — Compose runs an embedded DNS resolver, so `db`, `cache`, etc. resolve to the correct container IP without any manual linking.
- Service name resolution means connection strings just use the service name as the hostname (`postgres://db:5432`, `redis://cache:6379` in the example above) — no hardcoded IPs, ever.
- Declaring multiple networks (as in section 3) lets you segment services — e.g., put a public-facing `frontend` service on both `frontend` and `backend` networks, but keep `db` reachable only on `backend`, so it's unreachable from outside that network entirely.
- Full network driver details, custom bridge configuration, and inter-container communication patterns are in [Docker Networking](docker-networking.md).

---

## 6. Compose Profiles

Profiles let you define services that only start when explicitly requested — useful for optional tooling (debuggers, admin UIs, seed jobs) that shouldn't run by default.

```yaml
services:
  app:
    image: myapp:latest
    # no profiles key -> always starts

  pgadmin:
    image: dpage/pgadmin4
    profiles: ["debug", "admin"]   # only starts if "debug" or "admin" profile is active

  seed-db:
    image: myapp:latest
    command: ["npm", "run", "seed"]
    profiles: ["seed"]             # a one-off job, opt-in only
```

```bash
docker compose up -d                     # starts only services with no profiles set
docker compose --profile debug up -d     # also starts services tagged "debug"
docker compose --profile "*" up -d       # starts everything, regardless of profile
COMPOSE_PROFILES=debug docker compose up -d   # same effect, via env var instead of flag
```

---

## 7. Override Files & Layering

Compose merges multiple files in the order given, with later files overriding/extending earlier ones. This is the standard way to keep dev/prod differences out of a single monolithic file.

- `docker-compose.yml` — base file, always loaded automatically.
- `docker-compose.override.yml` — **also loaded automatically** if present alongside the base file (no `-f` flag needed), typically holding dev-only conveniences (bind mounts for hot-reload, exposed debug ports).
- Explicit `-f` layering — used for named environments (prod, staging) where automatic override loading isn't wanted:

```bash
# Base + dev override (implicit, no -f needed if named docker-compose.override.yml)
docker compose up -d

# Base + explicit prod override, ignoring any local override file
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Validate what the merged config actually resolves to before applying it
docker compose -f docker-compose.yml -f docker-compose.prod.yml config
```

Example prod override — swap bind mounts for a production restart policy and drop debug ports:
```yaml
# docker-compose.prod.yml
services:
  app:
    restart: always
    ports:
      - "3000:3000"      # only the prod port, no debugger port
    volumes: []          # clear out the dev bind mount entirely
```

---

## 8. Environment Variable Substitution & `.env`

Compose automatically loads a `.env` file from the project directory (same folder as the compose file) and substitutes `${VAR}` / `$VAR` references in the YAML at parse time — this happens on the **client side**, before the file is even sent to the engine.

```bash
# .env
DB_PASSWORD=supersecret
COMPOSE_PROJECT_NAME=myapp     # overrides the default project name (dirname) used as a prefix for resources
TAG=1.4.0
```

```yaml
services:
  app:
    image: "myapp:${TAG:-latest}"    # ${VAR:-default} — use "latest" if TAG is unset/empty
    environment:
      - DB_PASSWORD=${DB_PASSWORD:?DB_PASSWORD must be set}   # fail fast with a clear error if unset
```

Important distinction: `.env` substitution happens for the **compose file itself** (image tags, ports, etc.); `environment:`/`env_file:` control what's injected **into the running container**. A value in `.env` is not automatically available inside the container unless you also reference it via `${...}` under `environment:`.

---

## 9. Essential CLI Commands

```bash
docker compose up -d                 # create and start all services in the background
docker compose up -d --build         # rebuild images before starting (skip Compose's build cache reuse)
docker compose down                  # stop and remove containers + default network (keeps volumes)
docker compose down -v               # also remove named volumes -- destroys persisted data, use with care
docker compose logs -f               # stream logs from all services
docker compose logs -f app           # stream logs from just the "app" service
docker compose exec app sh           # open a shell inside the running "app" container
docker compose ps                    # list containers for this project and their status
docker compose build                 # build (or rebuild) images without starting containers
docker compose config                # render the fully merged/resolved config -- validates syntax + overrides
docker compose restart app           # restart a single service without recreating it
docker compose up -d --scale app=3   # run 3 replicas of the "app" service (only works for stateless services
                                      # without a fixed host port mapping, since ports would collide)
```

---

## 10. Common Gotchas

- **Volume permission issues**: bind-mounted host directories keep the host's UID/GID. If the container process runs as a non-root user with a different UID, it may not be able to write to the mounted path — match UIDs explicitly (`user:` key) or `chown` inside an entrypoint script.
- **`depends_on` without healthchecks only waits for "started," not "ready."** A database container can report "running" long before Postgres is actually accepting connections. Always pair `depends_on: condition: service_healthy` with a real `healthcheck:` block on the dependency — otherwise the dependent service will race-fail on first boot.
- **Environment variable precedence** (highest to lowest): shell environment > `environment:` key in the compose file > `env_file:` > `.env` file substitution in the compose file itself > Dockerfile `ENV` default. When a value looks wrong, check all four places — it's easy to set a var in `.env` and forget it's being shadowed by a shell-exported variable of the same name.
- Named volumes declared in an override file must also exist in the base file's `volumes:` top-level key (or be declared fresh) — Compose won't implicitly create a volume referenced only in a service's `volumes:` list without a matching top-level entry, depending on version; check with `docker compose config`.
- `docker compose down` without `-v` leaves named volumes intact by design — this is usually what you want (don't lose the database on a routine restart), but it surprises people expecting a full reset.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
