# Practical Scripting Challenges — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Many companies (Amazon, and plenty of others per Glassdoor-reported interviews) don't just ask *about* scripting — they hand you a terminal and ask you to write something live. This file collects the real, recurring style of practical task asked in DevOps/SRE screens, each with a working solution and the reasoning an interviewer is actually listening for. Grouped **Junior → Mid → Senior** by task complexity. Pairs with [Linux & Shell Scripting](./01-linux-and-scripting-qna.md) and [Python for DevOps](./15-python-for-devops-qna.md).

---

## Table of Contents
- [Junior Level (0–2 yrs)](#junior-level-02-yrs)
- [Mid Level (2–5 yrs)](#mid-level-25-yrs)
- [Senior Level (5+ yrs)](#senior-level-5-yrs)

---

## Junior Level (0–2 yrs)

### 1. Write a command/script to find the top 5 memory-consuming processes on a Linux host.
```bash
ps aux --sort=-%mem | head -6
# header line + top 5, or skip the header explicitly:
ps aux --sort=-%mem | awk 'NR>1' | head -5
```
**What it's testing:** basic familiarity with `ps` and sorting — a very common Amazon/SRE screen opener specifically because it's realistic (exactly what you'd actually run during a real memory-pressure incident) rather than abstract.

### 2. Write a script that checks disk usage and prints a warning if any filesystem is above 80% used.
```bash
#!/usr/bin/env bash
set -euo pipefail
THRESHOLD=80

df -hP | awk 'NR>1 {print $5, $6}' | while read -r usage mount; do
  pct="${usage%\%}"
  if (( pct > THRESHOLD )); then
    echo "WARNING: $mount is at ${pct}% usage"
  fi
done
```
**What it's testing:** parsing `df` output correctly (stripping the `%` sign before numeric comparison is a common stumbling point), basic looping, and using `set -euo pipefail` defensively.

### 3. Write a one-liner to find all files larger than 100MB under a directory.
```bash
find /path/to/dir -type f -size +100M -exec ls -lh {} \;
# or, more efficiently for large trees:
find /path/to/dir -type f -size +100M -printf '%s %p\n' | sort -rn
```
**What it's testing:** `find`'s `-size` predicate and the difference between `-exec` (spawns a process per match) vs. `-printf`/batch approaches for efficiency at scale.

### 4. Write a script that checks whether a given process (by name) is running, and prints yes/no.
```bash
#!/usr/bin/env bash
PROC_NAME="$1"
if pgrep -x "$PROC_NAME" > /dev/null; then
  echo "yes"
else
  echo "no"
fi
```
**What it's testing:** knowing `pgrep`/`pidof` exist rather than fragile `ps aux | grep name` (which famously also matches its own `grep` process unless you `grep -v grep` or use `pgrep`/`[n]ame` patterns to avoid it — interviewers often specifically probe whether you know this classic gotcha).

### 5. Write a command to count how many times each HTTP status code appears in an nginx/Apache access log.
```bash
awk '{print $9}' access.log | sort | uniq -c | sort -rn
```
**What it's testing:** the classic `awk`/`sort`/`uniq -c` combo — one of the single most common "show me you can use standard Unix tools together" questions, and a genuinely useful real-world one-liner.

### 6. Write a script to back up a directory to a timestamped archive.
```bash
#!/usr/bin/env bash
set -euo pipefail
SRC="$1"
DEST_DIR="${2:-/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ARCHIVE="${DEST_DIR}/backup_${TIMESTAMP}.tar.gz"

mkdir -p "$DEST_DIR"
tar -czf "$ARCHIVE" -C "$(dirname "$SRC")" "$(basename "$SRC")"
echo "Backup created: $ARCHIVE"
```
**What it's testing:** basic scripting hygiene (default argument, `set -euo pipefail`, creating the destination if missing) plus correct `tar` usage (using `-C` and relative basename so the archive doesn't embed absolute host paths).

### 7. Write a one-liner to find the 10 largest files in a directory tree.
```bash
find . -type f -exec du -h {} + | sort -rh | head -10
```
**What it's testing:** combining `find`, `du`, and `sort -h` (human-readable numeric sort, handling "1.2G" vs "800M" correctly) — `sort -rh` specifically trips up candidates who only know plain `sort -rn`.

### 8. Write a script that takes a list of URLs (one per line) and reports which ones are down (non-2xx response).
```bash
#!/usr/bin/env bash
while read -r url; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url")
  if [[ ! "$code" =~ ^2 ]]; then
    echo "DOWN: $url (HTTP $code)"
  fi
done < urls.txt
```
**What it's testing:** `curl`'s `-w` write-out format for grabbing just the status code without downloading the body, and remembering a timeout (`--max-time`) so one hung URL doesn't stall the whole check indefinitely.

---

## Mid Level (2–5 yrs)

### 9. Write a script that finds and kills whatever process is listening on a given port.
```bash
#!/usr/bin/env bash
set -euo pipefail
PORT="$1"
PID=$(lsof -t -i:"$PORT")

if [[ -z "$PID" ]]; then
  echo "Nothing is listening on port $PORT"
  exit 0
fi

echo "Killing PID $PID (port $PORT)"
kill -TERM "$PID"
sleep 2
if kill -0 "$PID" 2>/dev/null; then
  echo "Process didn't exit gracefully, force killing"
  kill -KILL "$PID"
fi
```
**What it's testing:** `lsof -i:` for port-to-process lookup, and — the part that actually distinguishes strong candidates — trying `SIGTERM` first and only escalating to `SIGKILL` if it doesn't exit, rather than jumping straight to `-9`.

### 10. Write a script to monitor a log file for a specific error pattern and send an alert (e.g. print/email) when it appears, without re-alerting on lines already seen.
```bash
#!/usr/bin/env bash
set -euo pipefail
LOGFILE="$1"
PATTERN="ERROR"
STATE_FILE="/tmp/$(basename "$LOGFILE").offset"

LAST_OFFSET=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
CURRENT_SIZE=$(stat -c%s "$LOGFILE")

if (( CURRENT_SIZE < LAST_OFFSET )); then
  LAST_OFFSET=0  # log was rotated/truncated
fi

tail -c +$((LAST_OFFSET + 1)) "$LOGFILE" | grep "$PATTERN" && echo "ALERT: new '$PATTERN' entries found in $LOGFILE"

echo "$CURRENT_SIZE" > "$STATE_FILE"
```
**What it's testing:** tracking a byte offset between runs (so a cron-scheduled check doesn't repeatedly re-alert on the same old lines) and — the detail that separates a thorough answer — explicitly handling log rotation/truncation (current size smaller than the last recorded offset) rather than assuming the file only ever grows.

### 11. Write a script that checks a list of services (via systemd) and restarts any that aren't active.
```bash
#!/usr/bin/env bash
set -euo pipefail
SERVICES=("nginx" "postgresql" "myapp")

for svc in "${SERVICES[@]}"; do
  if ! systemctl is-active --quiet "$svc"; then
    echo "$svc is down — attempting restart"
    systemctl restart "$svc"
    sleep 2
    if systemctl is-active --quiet "$svc"; then
      echo "$svc restarted successfully"
    else
      echo "FAILED to restart $svc — needs manual intervention"
    fi
  fi
done
```
**What it's testing:** `systemctl is-active --quiet` as the correct, script-friendly health check (rather than parsing `systemctl status`'s human-oriented output), and verifying the restart actually worked instead of assuming success — plus implicitly, whether the candidate flags the real operational concern this script raises (auto-restarting masks the underlying reason it went down in the first place, so this should feed an alert/metric, not just silently self-heal forever).

### 12. Write a script (Bash or Python) that finds duplicate files in a directory by content, not just by name.
```bash
#!/usr/bin/env bash
find . -type f -exec md5sum {} \; | sort | awk '
{
  if ($1 == prev) print $0;
  prev = $1
}'
```
Or in Python, for more control:
```python
import hashlib, os
from collections import defaultdict

hashes = defaultdict(list)
for root, _, files in os.walk("."):
    for name in files:
        path = os.path.join(root, name)
        with open(path, "rb") as f:
            digest = hashlib.md5(f.read()).hexdigest()
        hashes[digest].append(path)

for digest, paths in hashes.items():
    if len(paths) > 1:
        print("Duplicate set:", paths)
```
**What it's testing:** understanding that duplicate *detection* must be by content hash, not filename — and (a strong-candidate detail) knowing that `md5sum` is fine for this non-cryptographic duplicate-finding purpose, since collision-resistance against a deliberate adversary isn't the threat model here, just accidental identical content.

### 13. Write a script to check an SSL/TLS certificate's expiration date for a list of domains and warn if any expire within 30 days.
```bash
#!/usr/bin/env bash
set -euo pipefail
DOMAINS=("example.com" "api.example.com")
WARN_DAYS=30

for domain in "${DOMAINS[@]}"; do
  expiry=$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null \
    | openssl x509 -noout -enddate | cut -d= -f2)
  expiry_epoch=$(date -d "$expiry" +%s)
  now_epoch=$(date +%s)
  days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

  if (( days_left < WARN_DAYS )); then
    echo "WARNING: $domain certificate expires in $days_left days ($expiry)"
  fi
done
```
**What it's testing:** familiarity with `openssl s_client`/`x509` for certificate inspection from the command line — a very realistic, frequently-actually-needed script (expired certificates causing outages is a common, entirely preventable real incident class).

### 14. Given a large log file, write a script/command to extract all unique IP addresses that made more than 100 requests (a basic abuse/DoS detection pattern).
```bash
awk '{print $1}' access.log | sort | uniq -c | awk '$1 > 100 {print $2, $1}' | sort -rn -k2
```
**What it's testing:** chaining `awk`/`sort`/`uniq -c` a second, slightly more complex time with a numeric filter — testing whether the earlier status-code question was genuinely understood or just memorized, since this requires adapting the same pattern to a new field and adding a threshold filter.

### 15. Write a Python script that lists all S3 buckets and their region using boto3.
```python
import boto3

s3 = boto3.client("s3")
response = s3.list_buckets()

for bucket in response["Buckets"]:
    name = bucket["Name"]
    location = s3.get_bucket_location(Bucket=name)["LocationConstraint"] or "us-east-1"
    print(f"{name}: {location}")
```
**What it's testing:** basic `boto3` fluency, and knowing the specific `get_bucket_location` quirk that a `None`/empty `LocationConstraint` actually means `us-east-1` (AWS's original region, which doesn't return an explicit value for historical reasons) — a real gotcha that trips up candidates who haven't actually used this API.

---

## Senior Level (5+ yrs)

### 16. Write a script that implements a simple health-check-based failover: poll a primary endpoint, and if it fails N consecutive checks, switch traffic (e.g. update a config file or DNS record) to a backup, then switch back once the primary recovers — without flapping.
```bash
#!/usr/bin/env bash
set -euo pipefail
PRIMARY="https://primary.example.com/health"
FAIL_THRESHOLD=3
RECOVER_THRESHOLD=3
STATE_FILE="/tmp/failover_state"
fail_count=0
recover_count=0
current_state="primary"  # or "backup"

check() {
  curl -sf --max-time 3 "$1" > /dev/null
}

while true; do
  if check "$PRIMARY"; then
    fail_count=0
    ((recover_count++))
    if [[ "$current_state" == "backup" && $recover_count -ge $RECOVER_THRESHOLD ]]; then
      echo "Primary recovered — failing back"
      current_state="primary"
      # apply failback action here (update config/DNS)
    fi
  else
    recover_count=0
    ((fail_count++))
    if [[ "$current_state" == "primary" && $fail_count -ge $FAIL_THRESHOLD ]]; then
      echo "Primary failed $FAIL_THRESHOLD times — failing over to backup"
      current_state="backup"
      # apply failover action here (update config/DNS)
    fi
  fi
  echo "$current_state" > "$STATE_FILE"
  sleep 5
done
```
**What it's testing:** this is deliberately open-ended — the code itself is secondary to whether the candidate proactively addresses **flapping** (requiring *consecutive* failures/successes via separate counters before switching either direction, rather than reacting to a single blip) and separates *detection* from *action* (the actual failover mechanism — DNS update, config reload, load balancer API call — is pluggable/commented rather than hardcoded, since a senior candidate should recognize the health-check loop and the failover action are genuinely separate concerns worth keeping decoupled).

### 17. Write a script to safely rotate a credential (e.g. an API key stored in a secrets manager) with zero downtime — generate a new one, update all consumers, verify, then revoke the old one.
```python
import boto3
import time

client = boto3.client("secretsmanager")
SECRET_ID = "prod/api-key"

# 1. Generate and stage a new secret version (AWSPENDING) without touching AWSCURRENT yet
new_value = generate_new_credential()  # your own credential-generation logic
client.put_secret_value(
    SecretId=SECRET_ID,
    SecretString=new_value,
    VersionStages=["AWSPENDING"],
)

# 2. Verify the new credential actually works before promoting it
if not verify_credential_works(new_value):
    raise RuntimeError("New credential failed verification — aborting rotation")

# 3. Promote AWSPENDING to AWSCURRENT (old AWSCURRENT automatically becomes AWSPREVIOUS)
current_version = client.describe_secret(SecretId=SECRET_ID)["VersionIdsToStages"]
pending_version_id = [v for v, stages in current_version.items() if "AWSPENDING" in stages][0]

client.update_secret_version_stage(
    SecretId=SECRET_ID,
    VersionStage="AWSCURRENT",
    MoveToVersionId=pending_version_id,
)

# 4. Give consumers time to pick up the new value (cache TTL, next poll cycle) before hard-revoking the old one
time.sleep(300)
revoke_old_credential()  # your own revocation logic against whatever issued the old credential
```
**What it's testing:** whether the candidate reaches for the additive-then-subtractive pattern (stage new → verify → promote → *then*, after a safety window, revoke old) instead of naively "generate new, immediately delete old" — the latter guarantees an outage window for any consumer that hasn't yet picked up the new credential, which is exactly the zero-downtime requirement the question is checking for.

### 18. You're asked to write a script live, and partway through you realize the straightforward approach won't scale (e.g. loading an entire multi-GB log file into memory to search it). How do you handle that in an interview, and what's the actual fix?
This is as much a communication question as a coding one: a strong candidate says out loud, immediately upon recognizing it, "this approach loads the whole file into memory, which won't work at the scale implied here — let me adjust" rather than either silently pushing forward with a broken approach or freezing. The concrete fix is almost always **streaming instead of loading fully**: iterate a file line-by-line (`for line in open(path):` in Python, or `while read -r line` in Bash) rather than `.read()`/`readlines()`-ing the whole thing; use `grep`/`awk` (which are already implemented as streaming tools) instead of loading content into a scripting language at all when the task is simple text filtering; and for aggregation across huge inputs, use constant-memory techniques (running counts/sums in a dict, not collecting every raw record) rather than materializing the full dataset before processing it. Interviewers explicitly use this "realize mid-task that it doesn't scale" moment to see whether a candidate has genuine production intuition about data volume, versus only having practiced toy-sized examples.

### 19. Write a script that safely performs a rolling restart of N application instances behind a load balancer, only proceeding to the next instance once the current one passes a health check — and stops immediately if a restart causes a health-check failure that doesn't recover.
```bash
#!/usr/bin/env bash
set -euo pipefail
INSTANCES=("app1" "app2" "app3")
HEALTH_URL_TEMPLATE="http://%s:8080/health"
MAX_WAIT=60
POLL_INTERVAL=5

wait_for_healthy() {
  local host="$1"
  local elapsed=0
  local url
  url=$(printf "$HEALTH_URL_TEMPLATE" "$host")
  while (( elapsed < MAX_WAIT )); do
    if curl -sf --max-time 3 "$url" > /dev/null; then
      return 0
    fi
    sleep "$POLL_INTERVAL"
    ((elapsed+=POLL_INTERVAL))
  done
  return 1
}

for host in "${INSTANCES[@]}"; do
  echo "Removing $host from load balancer..."
  remove_from_lb "$host"   # your own LB-deregistration logic

  echo "Restarting $host..."
  ssh "$host" "sudo systemctl restart myapp"

  echo "Waiting for $host to become healthy..."
  if wait_for_healthy "$host"; then
    echo "$host healthy — re-adding to load balancer"
    add_to_lb "$host"      # your own LB-registration logic
  else
    echo "FATAL: $host did not become healthy within ${MAX_WAIT}s — aborting rollout, leaving remaining instances untouched"
    exit 1
  fi
done

echo "Rolling restart completed successfully across all instances"
```
**What it's testing:** the whole point of this task is the **fail-fast abort** — a candidate who writes a loop that restarts every instance regardless of intermediate health-check results has built something that can take down 100% of capacity on a bad release, one instance at a time, with nobody stopping it; explicitly halting on the first unhealthy instance (rather than "logging a warning and continuing") is the detail interviewers are specifically screening for, since it's exactly the difference between a script that's safe to run unattended in production and one that isn't.
