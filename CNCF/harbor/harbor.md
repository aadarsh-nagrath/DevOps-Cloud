# Harbor — Complete Notes

## 1. Beginner

### What is Harbor?
- Open-source **container image registry** with security and compliance features built on top, originally built at VMware, donated to CNCF in 2018, **graduated** in 2020.
- At its core it's an OCI-compliant registry (it can store container images, Helm charts, and other OCI artifacts) — but "just a registry" undersells it. Harbor wraps the registry with the operational features an org actually needs to run one safely at scale.

### Why Not Just Use a Plain Registry / Docker Hub?
```
Plain registry (docker/distribution):          Harbor:
  push/pull images                               push/pull images
  that's it                                       + vulnerability scanning (Trivy)
                                                    + image signing / content trust
                                                    + RBAC + multi-tenant projects
                                                    + replication between registries
                                                    + retention & garbage collection policies
                                                    + web UI + audit logs
                                                    + robot accounts for CI
```
A bare `registry:2` container will happily store and serve images, but it has no concept of users, projects, or "is this image safe to deploy" — every one of those concerns has to be bolted on externally. Harbor packages them in one deployable unit, which is why most orgs running a **private** registry at any real scale run Harbor (or a hosted equivalent like ECR/GCR/ACR, which replicate a subset of the same ideas) instead of a bare registry.

### Core Architecture
```
                     [Browser / docker CLI / CI pipeline]
                                    |
                                    v
                          [Harbor Core (API server, auth, RBAC)]
                        /          |            |            \
                       v           v            v             v
                 [Registry]   [Trivy Adapter] [Job Service]  [Notary
              (distribution,   (vuln scans)   (async tasks:   (signing,
               OCI storage)                    replication,    optional/
                                                GC, retention)  legacy)
                       \           |            |             /
                        v          v            v            v
                              [PostgreSQL]   [Redis]
                          (metadata, users,  (cache, job queue)
                           projects, scan
                           results)
```
- **Core**: the API server — handles auth, RBAC, project management, and orchestrates the other components. Everything goes through Core.
- **Registry**: the actual image storage backend — this is the CNCF `distribution` project (formerly `docker/distribution`) underneath, storing blobs/manifests on a filesystem, S3, or other object storage.
- **Database (PostgreSQL)**: stores users, projects, permissions, scan results, replication rules, audit logs — everything except the actual image bytes.
- **Redis**: caching layer and job queue backend for the Job Service.
- **Job Service**: runs async background tasks — replication jobs, scheduled scans, garbage collection, retention policy execution.
- **Trivy Adapter**: wraps Aqua Security's Trivy scanner to check pushed images for known CVEs. Harbor also supports pluggable scanners via a standard scanner API (Clair was the original default, Trivy is now standard).
- **Notary (optional)**: implements Docker Content Trust — signs images so pulls can be verified as untampered. Increasingly less emphasized than scanning in practice.

### Core Concepts
| Term | Meaning |
|---|---|
| **Project** | The top-level namespace in Harbor — every image lives under a project, e.g. `harbor.example.com/myproject/myimage:tag`. Analogous to a Docker Hub "organization." |
| **Public vs Private Project** | Public projects allow anonymous pull; private projects require authentication and RBAC. |
| **Robot Account** | A non-human, project-scoped credential meant for CI/CD pipelines — scoped permissions (e.g., push-only), no human login. |
| **RBAC Role** | Per-project roles: Guest (pull-only), Developer (push/pull), Maintainer, ProjectAdmin, plus a system-wide Admin. |
| **Repository** | An image name within a project, e.g. `myproject/myimage` — holds multiple tags. |
| **Tag Retention Policy** | Rules that auto-delete old/unwanted tags (e.g., "keep last 10 tags matching `release-*`") to control storage growth. |
| **Replication Rule** | Push/pull-based sync of images between Harbor and another registry (another Harbor, Docker Hub, ECR, etc.) — for multi-region or DR setups. |
| **Vulnerability Scan** | Trivy (or another pluggable scanner) inspects image layers against a CVE database and reports severity-ranked findings. |

### Basic Usage Example
```bash
# Log in (robot account or user credentials)
docker login harbor.example.com -u robot$myproject+ci -p <token>

# Tag and push an image into a project
docker tag myapp:latest harbor.example.com/myproject/myapp:1.0.0
docker push harbor.example.com/myproject/myapp:1.0.0

# Pull it back
docker pull harbor.example.com/myproject/myapp:1.0.0
```
Harbor sits at the registry hostname just like Docker Hub or any other OCI registry — from the Docker CLI's perspective, `docker push`/`docker pull` work identically. The difference shows up in the UI/API: project-level permissions, scan results, and replication all become visible once the image lands.

---

## 2. Intermediate

### Project/RBAC Model in Depth
Every image reference in Harbor is namespaced under a project, and every permission check happens at the project level:
```
harbor.example.com/
├── library/            (default public project)
│   └── nginx:latest
├── team-payments/       (private project)
│   ├── api:1.4.2
│   └── worker:1.4.2
└── team-platform/       (private project)
    └── gateway:2.0.0
```
| Role | Pull | Push | Manage members | Delete project | Configure policies |
|---|---|---|---|---|---|
| **Guest** | Yes | No | No | No | No |
| **Developer** | Yes | Yes | No | No | No |
| **Maintainer** | Yes | Yes | No | No | Yes (scan/retention policies) |
| **ProjectAdmin** | Yes | Yes | Yes | Yes (own project) | Yes |
| **System Admin** | Yes (all projects) | Yes | Yes | Yes | Yes (system-wide) |

Robot accounts are created **within** a project and get an explicit, narrow permission set (e.g., only `push` + `pull` to that one project) — this is the credential you actually put in a CI pipeline, never a human account's password.

### Vulnerability Scanning Workflow
```
docker push image ---> Harbor Core stores manifest ---> (auto or manual) trigger scan
                                                                |
                                                                v
                                                    Trivy Adapter pulls layers,
                                                    checks against CVE DB
                                                                |
                                                                v
                                                    Results stored in Postgres,
                                                    surfaced in UI as severity
                                                    counts (Critical/High/Medium/Low)
```
- Scanning can run **on push** (project setting: "automatically scan images on push") or on a **schedule** (re-scan everything nightly, since new CVEs get published against old images constantly).
- A project can enforce a **"prevent vulnerable images from running"** policy — configurable severity threshold that blocks pull if exceeded (useful when paired with an admission controller that only allows pulls that succeed).
- CVE allowlists let you suppress specific known-acceptable findings (e.g., a CVE with no practical exploit path in your context) instead of being permanently blocked by it.

### Deployment Topologies
| Topology | When to use |
|---|---|
| **docker-compose (official installer script)** | Quick single-VM setups, small teams, evaluation/dev |
| **Helm chart on Kubernetes** | Production — HA-capable, integrates with existing cluster ingress/storage/monitoring |
| **Harbor Operator** | Kubernetes-native lifecycle management via CRDs — less commonly used than the Helm chart in practice |

### Replication Example
```yaml
# Conceptual — configured via UI/API, not a raw manifest, but this is the shape:
name: sync-to-dr-region
source: harbor-primary (project: team-payments)
destination: harbor-dr (project: team-payments)
trigger: event-based   # or scheduled, or manual
filters:
  - repository: "team-payments/**"
  - tag: "release-*"
```
Replication is push-based (source pushes to destination) or pull-based (destination pulls from source), and can filter by repository name pattern, tag pattern, or label — useful for "only replicate release-tagged images, not every dev build."

### Garbage Collection
- Deleting a tag doesn't reclaim disk space immediately — it just removes the manifest reference.
- **Garbage Collection (GC)** is a separate, explicit job (run manually or scheduled) that sweeps unreferenced blobs from the registry storage backend and actually frees space.
- Must be run with registry read-only mode enabled during the sweep in older Harbor versions to avoid races with concurrent pushes (newer versions support non-blocking GC).

---

## 3. Advanced

### Storage Backend Tradeoffs
| Backend | Pros | Cons |
|---|---|---|
| **Local filesystem** | Simple, no external dependency | Not horizontally scalable, single point of failure, backup is manual |
| **S3 / GCS / Azure Blob** | Durable, scalable, decouples registry pods from local disk | Requires correct IAM/credentials setup, slightly higher latency per blob |
| **NFS / shared filesystem** | Works with multi-replica registry pods without object storage | Adds a shared-storage dependency, potential bottleneck |

Production Harbor on Kubernetes almost always backs the Registry component with S3-compatible object storage — this is also what makes the Registry component horizontally scalable (multiple stateless registry pods pointing at the same bucket).

### High Availability
- **Core, Registry, Job Service**: stateless — scale via replica count behind a Service/Ingress.
- **PostgreSQL**: needs external HA (managed RDS/Cloud SQL, or a Postgres operator like Zalando/CloudNativePG) — Harbor's own chart ships a single-instance Postgres by default, not HA out of the box.
- **Redis**: same story — use a managed Redis or Redis Sentinel/Cluster for production HA rather than the chart's bundled single instance.
- **Registry storage**: must be shared (object storage) across replicas, not local disk, or replicas will disagree about what blobs exist.

### Security Hardening
- Enforce **TLS** on the Harbor endpoint (the chart supports cert-manager integration for automated certs).
- Use **robot accounts with minimal scope** per CI pipeline rather than one shared admin credential — rotate them.
- Turn on **"prevent vulnerable images from running"** with a severity gate, combined with a Kubernetes admission controller (e.g., Kyverno/OPA Gatekeeper policy that only allows images from your Harbor registry) so unscanned or failing images can never even attempt to run.
- **Content trust/Notary** for signature verification is available but has fallen out of favor industry-wide relative to attestation-based approaches (e.g., Sigstore/cosign) — many teams now sign with cosign and verify via admission policy instead of relying on Notary.
- **Audit logging**: every push/pull/delete/permission-change is logged — export these to your SIEM for compliance requirements (SOC2, etc.).

### Integration with the Broader CNCF Ecosystem
- **Trivy**: default scanner, also usable standalone in CI to fail builds before they even reach Harbor.
- **Notary / cosign**: signing and verification.
- **Kyverno / OPA Gatekeeper**: admission-time policy enforcement referencing Harbor scan results or image provenance.
- **ArgoCD/Flux**: pull images Harbor stores as part of GitOps-driven deployments — Harbor is frequently the registry sitting behind a GitOps pipeline's image references.
- **Prometheus**: Harbor exposes metrics for scrape (job queue depth, API latency, storage usage) — wire into existing cluster monitoring.

### Common Failure Modes / Debugging
| Symptom | Likely cause |
|---|---|
| `denied: requested access to the resource is denied` on push | Robot account lacks push permission on that specific project, or wrong project name in the image tag |
| Scans stuck in "Pending" indefinitely | Job Service can't reach Trivy adapter, or Redis (job queue) is down/misconfigured |
| Disk usage keeps growing despite deleting tags | GC hasn't been run — deleting a tag alone doesn't reclaim blob storage |
| UI shows project but `docker pull` gets 404 | Case sensitivity or typo in project/repo name — Harbor repo names are lowercase only |
| Replication job fails silently | Check network egress from Job Service pods to the destination registry, and credential validity on the replication endpoint |

---

## Quick Revision — Harbor
- CNCF graduated container registry with scanning, RBAC, replication, and retention on top of a plain OCI registry.
- Architecture: Core (API/auth) + Registry (distribution-based storage) + Postgres (metadata) + Redis (jobs/cache) + Trivy adapter (scanning) + Job Service (async tasks).
- Project = top-level namespace; RBAC (Guest/Developer/Maintainer/ProjectAdmin) is scoped per project.
- Robot accounts = scoped, non-human credentials for CI — never use a human admin password in a pipeline.
- Vulnerability scanning via Trivy runs on push or schedule; severity thresholds can block deployment of vulnerable images.
- Deleting a tag doesn't free disk space — Garbage Collection is a separate explicit job.
- Production storage backend should be S3-compatible object storage for horizontal scaling of Registry pods; Postgres/Redis need external HA, the default chart install isn't HA.
- Replication rules sync images between Harbor instances or other registries for DR/multi-region.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
