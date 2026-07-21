# Docker Registries and Distribution

How images are stored, named, authenticated, published, and cleaned up across Docker Hub, cloud registries, and self-hosted options. See also [docker.md](docker.md) and [dockerfile-deep-dive.md](dockerfile-deep-dive.md) for build-side context.

---

## 1. Docker Hub vs Private Registries

| | Docker Hub (free/anonymous) | Docker Hub (paid) | Private registry (self-hosted or cloud) |
|---|---|---|
| Pull rate limits | 100 pulls / 6h (anonymous, per IP) | Higher/unlimited depending on tier | No Docker Hub rate limit (you own the infra) |
| Cost | Free for public images | Subscription (Pro/Team/Business) | Infra cost (storage + egress) or managed-service cost |
| Private repos | 1 free private repo (varies by plan) | Multiple private repos included | Unlimited, access-controlled by your own IAM |
| Visibility | Public by default | Public or private | Fully private by default |
| Vulnerability scanning | Docker Scout (basic tier) | Docker Scout (fuller tier) | Depends on product — Harbor/ECR/GAR have it built in |
| Best fit | OSS images, small projects, personal use | Small teams needing more private repos | Companies with compliance/network requirements, internal-only images |

Anonymous/unauthenticated pulls hitting Docker Hub's rate limit is one of the most common CI failure causes — `docker login` even with a free account raises the limit substantially, and most teams end up mirroring/caching through a private registry regardless.

---

## 2. Running Your Own Registry

The reference implementation is the open-source `registry:2` image (Docker Distribution / CNCF Distribution project).

```bash
# Minimal local registry, storage inside the container (ephemeral — fine for testing only)
docker run -d -p 5000:5000 --name registry registry:2

# Persistent storage on the host
docker run -d -p 5000:5000 --name registry \
  -v registry-data:/var/lib/registry \
  registry:2

# Push/pull against it
docker tag myapp:1.0 localhost:5000/myapp:1.0
docker push localhost:5000/myapp:1.0
docker pull localhost:5000/myapp:1.0
```

By default this registry has **no authentication and no TLS** — fine on localhost, unacceptable exposed on a network. Add basic auth:

```bash
# Generate an htpasswd file for basic auth
mkdir -p auth
docker run --entrypoint htpasswd httpd:2 -Bbn myuser mypassword > auth/htpasswd

docker run -d -p 5000:5000 --name registry \
  -v "$(pwd)/auth:/auth" \
  -e REGISTRY_AUTH=htpasswd \
  -e REGISTRY_AUTH_HTPASSWD_REALM="Registry Realm" \
  -e REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd \
  -v registry-data:/var/lib/registry \
  registry:2
```
For anything beyond local testing, put TLS in front of it (reverse proxy with a real cert, or the registry's native TLS env vars) — Docker refuses to talk to an insecure registry over a non-localhost address unless explicitly allow-listed via `insecure-registries` in the daemon config, which itself is not recommended outside isolated lab networks.

---

## 3. Popular Registry Options

| Registry | Type | Notable features |
|---|---|---|
| Docker Hub | SaaS, public-first | Largest ecosystem, official images, Docker Scout scanning |
| AWS ECR | SaaS, cloud-native | IAM-based auth, lifecycle policies, tight integration with ECS/EKS, image scanning (Basic via Clair-based, Enhanced via Inspector) |
| Google Artifact Registry (GAR) | SaaS, cloud-native | Replaces GCR, supports Docker + language package formats, IAM auth, vulnerability scanning |
| Azure Container Registry (ACR) | SaaS, cloud-native | Geo-replication, tasks (build-in-registry), Microsoft Defender scanning integration |
| GitHub Container Registry (ghcr.io) | SaaS, tied to GitHub | Free for public images, ties permissions to GitHub orgs/repos, good fit for GitHub Actions pipelines |
| Harbor | Self-hosted, open source | RBAC, built-in Trivy vulnerability scanning, replication between Harbor instances, image signing (Notary/Cosign), garbage collection UI |

Pick cloud-native (ECR/GAR/ACR) when you're already deployed on that cloud — IAM integration removes a whole class of credential-management problems. Pick Harbor when you need a fully self-hosted, air-gapped-capable option with enterprise features (RBAC, scanning, replication) without SaaS dependency. Pick ghcr.io for GitHub-centric OSS/CI workflows.

---

## 4. Image Naming and Tagging Conventions

```
[registry-host[:port]/]namespace/image-name[:tag]

# Examples
myapp:1.0                                  # Docker Hub, implicit "library/" or user namespace
myorg/myapp:1.0                            # Docker Hub, org namespace
ghcr.io/myorg/myapp:1.0                    # GitHub Container Registry
123456789012.dkr.ecr.us-east-1.amazonaws.com/myapp:1.0   # AWS ECR
registry.example.com:5000/myapp:1.0        # self-hosted, custom port
```

### Tagging conventions
- **Semantic versioning** for release artifacts: `myapp:1.4.2`, plus rolling aliases like `myapp:1.4`, `myapp:1`, updated to point at the latest patch/minor.
- **Git SHA or build number** for traceability in CI: `myapp:abc1234`, `myapp:build-482` — immutable, unambiguous which commit produced the image.
- **`:latest`** — the default tag when none is specified; means "most recently pushed with no tag," not "most stable" or "newest version."

### Why avoid `:latest` in production
- It's mutable — `docker pull myapp:latest` today and tomorrow can return different images with zero indication anything changed.
- Rollbacks become guesswork — you can't redeploy "the previous `:latest`" because the pointer already moved.
- Breaks reproducibility for anyone auditing "what exact image is running in prod right now."
- Correct pattern: deploy pinned, immutable tags (semver or git SHA); use `:latest` only for local dev convenience or as a floating "current stable" pointer that itself always resolves to a specific pinned tag underneath in your deployment manifests.

---

## 5. Authenticating to Registries

```bash
# Interactive login (prompts for username/password or token)
docker login
docker login ghcr.io
docker login myregistry.example.com:5000

# Non-interactive, e.g. in scripts/CI — pipe the secret in, never put it in a plain arg
echo "$CR_PAT" | docker login ghcr.io -u myuser --password-stdin

docker logout ghcr.io
```

### Credential storage
- By default, `docker login` writes credentials to `~/.docker/config.json` — in plaintext unless a credential helper is configured.
- Use OS-native credential helpers so secrets aren't sitting in plaintext JSON:
```bash
# macOS
docker-credential-osxkeychain
# Linux (pass, or secretservice for GNOME keyring)
docker-credential-pass
docker-credential-secretservice
# Configured in ~/.docker/config.json:
# "credsStore": "osxkeychain"
```

### CI/CD service account patterns
| Platform | Pattern |
|---|---|
| AWS ECR | `aws ecr get-login-password \| docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com` — short-lived token, IAM role scoped to push/pull only |
| GCP Artifact Registry | `gcloud auth print-access-token \| docker login -u oauth2accesstoken --password-stdin ...`, or Workload Identity Federation from CI with no static key at all |
| GitHub Actions → ghcr.io | Built-in `GITHUB_TOKEN` with `packages: write` permission, no separate secret needed |
| Generic | Dedicated CI service account/robot account with push-only scope to a specific repo path, rotated credentials, never a personal account's token |

Prefer short-lived, scope-limited credentials (IAM roles, OIDC federation, robot accounts) over long-lived personal access tokens wherever the registry supports it.

---

## 6. Image Manifests and Multi-Arch Manifest Lists

A pulled "image" is really a **manifest** referencing content-addressed layer blobs. For multi-platform images, a **manifest list** (aka "fat manifest" / OCI image index) wraps per-architecture manifests under one tag.

```bash
# Inspect the manifest (or manifest list) for a tag without pulling the image
docker manifest inspect myorg/myapp:1.4.0

# Example manifest list structure (abridged)
# {
#   "manifests": [
#     { "platform": { "architecture": "amd64", "os": "linux" }, "digest": "sha256:..." },
#     { "platform": { "architecture": "arm64", "os": "linux" }, "digest": "sha256:..." }
#   ]
# }
```

`docker buildx` builds and publishes each architecture's image, then assembles and pushes the manifest list under a single tag — clients pulling `myapp:1.4.0` automatically get the manifest matching their own CPU architecture:

```bash
# Build and push amd64 + arm64 under one tag in a single command
docker buildx create --use   # ensure a buildx builder instance is active
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t myorg/myapp:1.4.0 \
  --push .
```
This is why the same `myapp:1.4.0` tag works transparently on both an Intel CI runner and an Apple Silicon dev laptop or ARM-based cloud instance — Docker resolves the platform-specific manifest automatically at pull time.

---

## 7. Push/Pull Workflow End to End

```bash
# 1. Build locally, tag for the target registry
docker build -t ghcr.io/myorg/myapp:1.4.0 .

# 2. Authenticate
echo "$CR_PAT" | docker login ghcr.io -u myuser --password-stdin

# 3. Push
docker push ghcr.io/myorg/myapp:1.4.0

# 4. On the deploy target (or teammate's machine): pull and run
docker pull ghcr.io/myorg/myapp:1.4.0
docker run -d ghcr.io/myorg/myapp:1.4.0

# 5. Verify what's actually running matches what you expect
docker inspect --format='{{.Image}}' <container>       # image ID the running container uses
docker image inspect ghcr.io/myorg/myapp:1.4.0 --format='{{.Id}}'   # compare against the tag's current digest
```
Pulling by **digest** (`ghcr.io/myorg/myapp@sha256:...`) instead of tag gives an immutable reference — useful for deploy manifests where you want a guarantee the exact bytes never change underneath the reference, even if someone re-pushes the tag.

---

## 8. Retention, Cleanup, and Lifecycle Policies

Registries fill up fast in CI-heavy workflows (every commit can push a new tag) — retention policies keep storage/cost bounded.

```jsonc
// AWS ECR lifecycle policy example — keep last 10 tagged images matching "v", expire untagged after 1 day
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Expire untagged images older than 1 day",
      "selection": { "tagStatus": "untagged", "countType": "sinceImagePushed", "countUnit": "days", "countNumber": 1 },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Keep only the last 10 images with tags starting with v",
      "selection": { "tagStatus": "tagged", "tagPrefixList": ["v"], "countType": "imageCountMoreThan", "countNumber": 10 },
      "action": { "type": "expire" }
    }
  ]
}
```
```bash
aws ecr put-lifecycle-policy --repository-name myapp --lifecycle-policy-text file://lifecycle-policy.json
```

- **Google Artifact Registry**: cleanup policies defined per-repository (`gcloud artifacts repositories set-cleanup-policies`), supporting "keep most recent N" and age-based deletion, dry-run mode before enforcing.
- **Harbor**: built-in tag retention rules (UI or API) plus a separate garbage collection job to reclaim blob storage after tags are deleted.
- **General principle**: expire untagged/dangling manifests aggressively (they're almost always CI build byproducts), keep tagged releases longer or indefinitely, and always dry-run a new retention policy before enabling deletion.

### Garbage collection on a self-hosted registry
Deleting a tag/manifest from `registry:2` does not immediately reclaim disk space — blobs are only unlinked, not deleted, until GC runs:

```bash
# Registry must be stopped or set read-only during GC to avoid deleting in-use blobs
docker exec registry bin/registry garbage-collect /etc/docker/registry/config.yml

# Dry run first to see what would be deleted
docker exec registry bin/registry garbage-collect --dry-run /etc/docker/registry/config.yml
```
Schedule GC on a cron alongside your deletion/retention policy — deletions without periodic GC just accumulate orphaned blobs on disk indefinitely.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
