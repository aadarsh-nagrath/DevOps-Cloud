# Harbor — Learn It Locally

Goal: run Harbor locally via its official docker-compose installer, push a real image to it, trigger a vulnerability scan, and view the results — in about 20-30 minutes (Harbor is heavier than most CNCF tools you'll have run so far, so first startup takes a few minutes).

## Prerequisites
- Docker and Docker Compose installed and running.
- At least 4GB RAM free for the Harbor containers (Core, Registry, Postgres, Redis, Trivy, Job Service, Portal, nginx proxy all run as separate containers).
- `openssl` available (for generating a local TLS cert — Harbor's installer expects one).

---

## Step 1 — Download the Offline Installer

Harbor ships a versioned installer tarball with all the compose files and default configs.

```bash
mkdir -p ~/harbor-lab && cd ~/harbor-lab
curl -LO https://github.com/goharbor/harbor/releases/download/v2.11.0/harbor-offline-installer-v2.11.0.tgz
tar xzvf harbor-offline-installer-v2.11.0.tgz
cd harbor
```

You'll see `harbor.yml.tmpl`, `install.sh`, `common.sh`, and a `prepare` script.

---

## Step 2 — Configure `harbor.yml`

```bash
cp harbor.yml.tmpl harbor.yml
```

Edit the key fields for a local run:

```yaml
# harbor.yml (relevant excerpts)
hostname: localhost

http:
  port: 80

# Comment out the https block entirely for this local lab —
# avoids needing a real cert for a quick first run.
# https:
#   port: 443
#   certificate: /your/certificate/path
#   private_key: /your/private/key/path

harbor_admin_password: Harbor12345

database:
  password: root123

data_volume: /data
```

Running HTTP-only locally is fine for learning (Harbor will warn you, and `docker login` needs `--insecure-registry` handling — see Step 4). For anything beyond local experimentation, always run Harbor behind TLS.

---

## Step 3 — Install and Start Harbor

```bash
sudo ./install.sh
```

This runs `prepare` (renders configs from `harbor.yml` into the compose files) then `docker compose up -d`. First run pulls ~8 images and can take a few minutes.

Verify everything is up:
```bash
docker compose ps
```
You should see containers named `harbor-core`, `harbor-db`, `harbor-portal`, `registry`, `redis`, `harbor-jobservice`, `trivy-adapter`, `nginx`, all `Up`/`healthy`.

Open the UI:
```bash
open http://localhost
```
Log in with `admin` / `Harbor12345` (whatever you set in `harbor.yml`).

---

## Step 4 — Configure Docker to Trust the Local (HTTP) Registry

Since we skipped TLS, tell your local Docker daemon to treat `localhost` as insecure:

```json
// ~/.docker/daemon.json (macOS: Docker Desktop > Settings > Docker Engine)
{
  "insecure-registries": ["localhost"]
}
```
Restart Docker Desktop after saving. Without this, `docker push`/`docker login` against a plain-HTTP Harbor will fail with a TLS handshake error.

---

## Step 5 — Create a Project and Push an Image

In the UI: **Projects → New Project**, name it `lab`, leave it private.

```bash
docker login localhost -u admin -p Harbor12345

docker pull nginx:1.25
docker tag nginx:1.25 localhost/lab/nginx:1.25
docker push localhost/lab/nginx:1.25
```

Refresh the UI, click into the `lab` project — you'll see the `nginx` repository with tag `1.25`, its size, and push time.

---

## Step 6 — Trigger a Vulnerability Scan

In the UI: **Projects → lab → Repositories → nginx**, select the `1.25` tag, click **Scan**.

Or trigger it project-wide via the API:
```bash
curl -u admin:Harbor12345 -X POST \
  "http://localhost/api/v2.0/projects/lab/repositories/nginx/artifacts/1.25/scan"
```

Watch the scan status go from `Pending` → `Running` → `Success` (poll the UI or `GET` the artifact endpoint). Once done, the tag row shows a severity badge (e.g., "Critical: 3, High: 12, Medium: 40" — nginx base images always carry some known CVEs, which is exactly the point of this exercise).

Click into the scan results to see the full CVE list: CVE ID, severity, affected package, fixed version if available. This is the same report a CI gate would check before allowing a deploy.

---

## Step 7 — Create a Robot Account (the CI-Realistic Path)

In the UI: **Projects → lab → Robot Accounts → New Robot Account**, scope it to `lab` with push+pull permission only. Copy the generated token (shown once).

```bash
docker login localhost -u 'robot$lab+ci' -p '<token-shown-once>'
docker push localhost/lab/nginx:1.25   # same push, now using a scoped, CI-realistic credential
```
This is the credential you'd actually put in a GitHub Actions/Jenkins secret — never the admin password.

---

## Cleanup
```bash
cd ~/harbor-lab/harbor
docker compose down -v   # -v also removes the named volumes (Postgres data, registry blobs)
cd ~ && rm -rf ~/harbor-lab
```

## What to Explore Next
- Set a **tag retention policy** on the `lab` project (e.g., "keep only the last 5 tags") and push several tagged versions to watch it prune automatically.
- Enable **"prevent vulnerable images from running"** at a Critical severity threshold on the project, then try pushing/pulling an intentionally vulnerable old image to see the block.
- Set up a **replication rule** to Docker Hub (pull-based, filtered to a specific repository) and watch the Job Service execute it.
- Run Harbor with real TLS via `cert-manager` if you have a kind cluster and want to try the Helm chart path instead of docker-compose — closer to how it's actually run in production.
