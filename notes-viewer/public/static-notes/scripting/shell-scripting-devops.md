# Shell Scripting for DevOps

Real-world automation scripts and patterns that come up constantly in DevOps work — deployments, health checks, log processing, backups, and CI/CD glue. See [Bash Scripting](bash-scripting.md) for the underlying language fundamentals.

---

## 1. Script Template (starting point for any DevOps script)

```bash
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/$(basename "$0" .sh).log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

die() {
  log "ERROR: $*"
  exit 1
}

trap 'log "Script exited with status $?"' EXIT

main() {
  log "Starting $(basename "$0")"
  # ... work goes here
}

main "$@"
```
Wrapping logic in a `main()` and calling it at the bottom keeps top-level scope clean and makes the script easy to source/test without side effects.

---

## 2. Health Checks & Monitoring

### Service health check with retry
```bash
#!/usr/bin/env bash
set -euo pipefail

URL="${1:?Usage: $0 <url>}"
MAX_RETRIES=5
RETRY_DELAY=3

for attempt in $(seq 1 "$MAX_RETRIES"); do
  status=$(curl -s -o /dev/null -w "%{http_code}" "$URL" || echo "000")
  if [[ "$status" == "200" ]]; then
    echo "Healthy (attempt $attempt): $URL"
    exit 0
  fi
  echo "Attempt $attempt/$MAX_RETRIES failed (status $status), retrying in ${RETRY_DELAY}s..."
  sleep "$RETRY_DELAY"
done

echo "Service unhealthy after $MAX_RETRIES attempts: $URL" >&2
exit 1
```

### Disk space alert
```bash
#!/usr/bin/env bash
THRESHOLD=80

df -hP | awk 'NR>1 {print $5, $6}' | while read -r usage mount; do
  pct="${usage%\%}"
  if (( pct >= THRESHOLD )); then
    echo "WARNING: $mount is at ${pct}% disk usage"
  fi
done
```

### Process watchdog (restart if not running)
```bash
#!/usr/bin/env bash
SERVICE="myapp"

if ! pgrep -x "$SERVICE" > /dev/null; then
  echo "$(date): $SERVICE not running, restarting..." >> /var/log/watchdog.log
  systemctl restart "$SERVICE"
fi
```
Run via cron every minute: `* * * * * /opt/scripts/watchdog.sh`

---

## 3. Deployment Automation

### Simple blue-green style deploy script
```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/myapp"
RELEASE_DIR="$APP_DIR/releases/$(date +%Y%m%d%H%M%S)"
CURRENT_LINK="$APP_DIR/current"
ARTIFACT_URL="${1:?Usage: $0 <artifact-url>}"

mkdir -p "$RELEASE_DIR"
curl -sL "$ARTIFACT_URL" -o "$RELEASE_DIR/app.tar.gz"
tar -xzf "$RELEASE_DIR/app.tar.gz" -C "$RELEASE_DIR"

# Health-check the new release before cutting over
"$RELEASE_DIR/bin/healthcheck" || { echo "New release failed health check"; exit 1; }

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
systemctl restart myapp

# Keep last 5 releases, prune the rest
cd "$APP_DIR/releases" && ls -1t | tail -n +6 | xargs -r rm -rf
```

### Rolling restart across a list of hosts
```bash
#!/usr/bin/env bash
set -euo pipefail

HOSTS=(web1.internal web2.internal web3.internal)

for host in "${HOSTS[@]}"; do
  echo "Deploying to $host..."
  ssh "$host" "sudo systemctl restart myapp"
  # wait for health check before moving to next host
  until ssh "$host" "curl -sf http://localhost:8080/health"; do
    echo "Waiting for $host to become healthy..."
    sleep 2
  done
  echo "$host healthy, moving on"
done
```

### Zero-downtime Kubernetes rollout wrapper
```bash
#!/usr/bin/env bash
set -euo pipefail

DEPLOYMENT="${1:?Usage: $0 <deployment> <image>}"
IMAGE="${2:?Usage: $0 <deployment> <image>}"
NAMESPACE="${3:-default}"

kubectl set image "deployment/$DEPLOYMENT" "*=$IMAGE" -n "$NAMESPACE"
kubectl rollout status "deployment/$DEPLOYMENT" -n "$NAMESPACE" --timeout=120s \
  || { kubectl rollout undo "deployment/$DEPLOYMENT" -n "$NAMESPACE"; exit 1; }
```

---

## 4. CI/CD Glue Scripts

### Build-tag-push (Docker)
```bash
#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="myorg/myapp"
GIT_SHA=$(git rev-parse --short HEAD)
TAG="${1:-$GIT_SHA}"

docker build -t "$IMAGE_NAME:$TAG" -t "$IMAGE_NAME:latest" .
docker push "$IMAGE_NAME:$TAG"
docker push "$IMAGE_NAME:latest"
echo "Pushed $IMAGE_NAME:$TAG"
```

### Wait-for-it (block until a dependency is reachable — common in CI/entrypoints)
```bash
#!/usr/bin/env bash
set -euo pipefail

HOST="${1:?Usage: $0 <host> <port>}"
PORT="${2:?Usage: $0 <host> <port>}"
TIMEOUT="${3:-30}"

for _ in $(seq 1 "$TIMEOUT"); do
  if nc -z "$HOST" "$PORT" 2>/dev/null; then
    echo "$HOST:$PORT is available"
    exit 0
  fi
  sleep 1
done

echo "Timed out waiting for $HOST:$PORT" >&2
exit 1
```

### Pre-commit / CI lint gate
```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Running shellcheck on all scripts..."
find . -name "*.sh" -not -path "./node_modules/*" -print0 \
  | xargs -0 -n1 shellcheck

echo "All scripts passed lint"
```

---

## 5. Log Processing

### Rotate and compress logs older than N days
```bash
#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="/var/log/myapp"
DAYS_TO_KEEP=7

find "$LOG_DIR" -name "*.log" -mtime +"$DAYS_TO_KEEP" -exec gzip {} \;
find "$LOG_DIR" -name "*.log.gz" -mtime +30 -delete
```

### Tail-and-alert on error patterns
```bash
#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="${1:?Usage: $0 <logfile>}"

tail -Fn0 "$LOG_FILE" | while read -r line; do
  if echo "$line" | grep -qi "error\|exception\|fatal"; then
    echo "ALERT: $line"
    # e.g. curl -s -X POST "$SLACK_WEBHOOK_URL" -d "{\"text\":\"$line\"}"
  fi
done
```

### Extract summary stats from access logs
```bash
#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="${1:?Usage: $0 <access.log>}"

echo "Top 10 IPs:"
awk '{print $1}' "$LOG_FILE" | sort | uniq -c | sort -rn | head -10

echo "Status code breakdown:"
awk '{print $9}' "$LOG_FILE" | sort | uniq -c | sort -rn
```

---

## 6. Backup & Restore

### Database backup with rotation
```bash
#!/usr/bin/env bash
set -euo pipefail

DB_NAME="mydb"
BACKUP_DIR="/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"
pg_dump "$DB_NAME" | gzip > "$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

echo "Backup complete: ${DB_NAME}_${TIMESTAMP}.sql.gz"
```

### Sync to remote storage (S3 example)
```bash
#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="/backups"
BUCKET="s3://my-backup-bucket/prod"

aws s3 sync "$SOURCE_DIR" "$BUCKET" --delete --storage-class STANDARD_IA
echo "Synced $SOURCE_DIR to $BUCKET"
```

---

## 7. Infrastructure & Environment Automation

### Bootstrap a new server
```bash
#!/usr/bin/env bash
set -euo pipefail

log() { echo "[bootstrap] $*"; }

log "Updating packages..."
apt-get update -y && apt-get upgrade -y

log "Installing base tools..."
apt-get install -y curl git vim htop unzip jq

log "Creating deploy user..."
id -u deploy &>/dev/null || useradd -m -s /bin/bash deploy

log "Configuring SSH..."
mkdir -p /home/deploy/.ssh
cp /tmp/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

log "Bootstrap complete"
```

### Environment variable validation before deploy
```bash
#!/usr/bin/env bash
set -euo pipefail

REQUIRED_VARS=(DATABASE_URL API_KEY AWS_REGION)

for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "Missing required env var: $var" >&2
    exit 1
  fi
done

echo "All required environment variables are set"
```

### Generate a `.env` file from a template + secrets manager
```bash
#!/usr/bin/env bash
set -euo pipefail

TEMPLATE=".env.template"
OUTPUT=".env"

> "$OUTPUT"
while IFS= read -r key; do
  value=$(aws secretsmanager get-secret-value --secret-id "$key" --query SecretString --output text)
  echo "${key}=${value}" >> "$OUTPUT"
done < <(grep -v '^#' "$TEMPLATE" | cut -d= -f1)

chmod 600 "$OUTPUT"
echo "Generated $OUTPUT"
```

---

## 8. Parallelization

### Run tasks concurrently and wait
```bash
#!/usr/bin/env bash
set -euo pipefail

pids=()
for host in web1 web2 web3; do
  ssh "$host" "sudo systemctl restart myapp" &
  pids+=($!)
done

for pid in "${pids[@]}"; do
  wait "$pid" || echo "A job failed (pid $pid)"
done
echo "All restarts complete"
```

### Bounded parallelism with `xargs -P`
```bash
cat hosts.txt | xargs -P 4 -I{} ssh {} "df -h /"
```

---

## 9. Cron & Scheduling Notes

```bash
# crontab -e
# m h dom mon dow  command
*/5 * * * * /opt/scripts/healthcheck.sh >> /var/log/healthcheck.log 2>&1
0 2 * * *   /opt/scripts/backup.sh
0 3 * * 0   /opt/scripts/log-rotate.sh
```
- Always redirect output in crontab entries — cron mail delivery is unreliable/unconfigured on most hosts, and silent failures are the #1 cause of "it broke and nobody noticed."
- Cron runs with a minimal `PATH` and no shell profile loaded — use absolute paths to binaries or explicitly `source` the environment at the top of the script.

---

## 10. Common Gotchas in DevOps Scripts

- **Don't parse `ls` output** — use globs (`for f in *.log`) or `find` instead; filenames with spaces/newlines break naive parsing.
- **Quote everything** — unquoted `$var` in a path with spaces (common in Windows-mounted or user-uploaded paths) silently breaks.
- **Check SSH exit codes** — `ssh host cmd` returns the *remote* command's exit code; don't assume `&&` chains behave like local ones under `set -e` without testing.
- **Beware `cd` in scripts** — always pair with `|| exit` or check the return; a failed `cd` followed by destructive commands (`rm -rf ./*`) run in the *wrong* directory is a classic outage cause.
- **Test destructive scripts with `echo` first** — prefix `rm`/`kubectl delete`/`terraform destroy` calls with `echo` while developing, remove only once verified.
- **Idempotency matters** — deployment and bootstrap scripts get re-run after partial failures; design them so running twice is safe (`mkdir -p`, `ln -sfn`, checks before create).

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
