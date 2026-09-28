# Backup Strategies & Types

Backup types compared, retention/frequency design, the 3-2-1 rule, immutable backups as ransomware protection, and why untested backups aren't real backups. See [Overview](backup-and-dr-overview.md) for the RTO/RPO framing that should drive every choice on this page.

---

## 1. Backup Types Compared

### Full backup
A complete copy of the entire dataset, every time it runs.

### Incremental backup
Only the data that changed **since the last backup of any kind** (full or incremental).

### Differential backup
Only the data that changed **since the last full backup** (regardless of how many differentials have run since).

```
Day 1 (Sun): FULL backup                     -- baseline, everything
Day 2 (Mon): changed since Sun

  Incremental: backs up changes since Mon's backup (i.e. since Sun's full)  -> small
  Differential: backs up changes since Sun's full                          -> small (same as incremental here, day 1)

Day 3 (Tue): changed since Mon

  Incremental: backs up changes since Mon's incremental only  -> small
  Differential: backs up changes since Sun's full (Mon+Tue combined) -> larger, growing each day

Day 4 (Wed): changed since Tue

  Incremental: backs up changes since Tue's incremental only  -> small, stays small
  Differential: backs up changes since Sun's full (Mon+Tue+Wed combined) -> larger still
```

| | Full | Incremental | Differential |
|---|---|---|---|
| **What it captures** | Everything | Changes since last backup (any type) | Changes since last full backup |
| **Backup storage cost** | Highest per run | Lowest per run | Medium, grows until next full |
| **Backup speed/window** | Slowest | Fastest | Medium |
| **Restore procedure** | Restore the one full backup | Restore last full + **every** incremental since, in order | Restore last full + **only the most recent** differential |
| **Restore speed** | Fast (one file) | Slowest — many pieces to apply in sequence | Faster than incremental — only two pieces |
| **Failure sensitivity** | N/A | One corrupt/missing incremental in the chain breaks every restore after it | Only depends on the full + latest differential |

**Practical guidance**: incremental minimizes backup storage/time cost but maximizes restore complexity and risk (a broken link in a long incremental chain is a classic real-world restore failure). Differential is the usual middle-ground default for most workloads. Full-only is viable for small datasets where "just restore the whole thing" is fast enough to meet RTO regardless.

---

## 2. Backup Frequency & Retention Policy Design

Frequency and retention are not chosen by gut feeling — they are derived directly from requirements:

- **Frequency is derived from RPO.** If RPO is 1 hour, you need a recovery point at least every hour (a full/incremental/differential cadence, or continuous log shipping — see [Database Backup & Restore](database-backup-and-restore.md)). If RPO is 24 hours, nightly is sufficient and more frequent backups just cost extra storage/compute for no benefit.
- **Retention length is derived from two independent drivers**, and you need to satisfy the longer of the two:
  1. **Operational recovery needs** — "we need to be able to go back and find a version of this data from before it got corrupted" — corruption is often noticed days or weeks after it happened, not immediately.
  2. **Compliance/regulatory requirements** — many industries mandate minimum retention periods for certain data classes (see [DR Planning § 5](dr-planning-testing-and-runbooks.md#5-compliance-considerations)).

### Grandfather-Father-Son (GFS) rotation

A classic retention scheme that keeps more granularity for recent backups and progressively less for older ones, keeping total storage bounded while still allowing recovery from far in the past:

```
Son (daily):     keep last 7 daily backups
Father (weekly): keep last 4 weekly backups (e.g. every Sunday's daily promoted to "weekly")
Grandfather (monthly): keep last 12 monthly backups (e.g. the 1st of each month promoted to "monthly")

Result: ~7 + 4 + 12 = 23 backups on disk at any time,
        but effective recoverable history spans a full year.
```

```bash
#!/usr/bin/env bash
set -euo pipefail
# Simple GFS-style pruning applied to a directory of daily dated backup files.
# Assumes files are named backup_YYYY-MM-DD.sql.gz

BACKUP_DIR="/backups/postgres"
TODAY=$(date +%d)

cd "$BACKUP_DIR"

# Daily (son): keep last 7 days, delete anything older UNLESS it's a weekly/monthly keeper
find . -name "backup_*.sql.gz" -mtime +7 | while read -r f; do
  day_of_month=$(basename "$f" | grep -oE '[0-9]{2}\.sql\.gz$' | cut -d. -f1)
  is_sunday=$(date -d "$(basename "$f" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}')" +%u 2>/dev/null || echo 0)

  if [[ "$day_of_month" == "01" ]]; then
    continue   # grandfather: keep 1st-of-month backups regardless of age (pruned separately at 12mo)
  elif [[ "$is_sunday" == "7" ]]; then
    continue   # father: keep Sunday backups up to 4 weeks old (pruned separately)
  else
    rm -f "$f"  # son: not a weekly/monthly keeper and older than retention -> delete
  fi
done
```
> In practice, use your backup tool/cloud provider's native lifecycle policies (S3 Lifecycle rules, RDS automated backup retention settings) rather than hand-rolling GFS logic — the script above illustrates the *logic*, not a recommended production implementation.

```yaml
# S3 Lifecycle policy expressing a GFS-like tiering + expiration in AWS-native terms
Rules:
  - Id: backup-retention
    Status: Enabled
    Filter:
      Prefix: backups/postgres/
    Transitions:
      - Days: 30
        StorageClass: STANDARD_IA   # move month-old backups to cheaper storage
      - Days: 90
        StorageClass: GLACIER       # move quarter-old backups to archival storage
    Expiration:
      Days: 365                    # hard delete after 1 year (align with compliance requirement)
```

---

## 3. The 3-2-1 Backup Rule

**3** copies of your data, on **2** different media/storage types, with **1** copy offsite.

```
Copy 1: Production data (the live system)
Copy 2: Local backup — different storage type (e.g. separate disk/volume, on-prem NAS)
Copy 3: Offsite backup — different location/provider entirely (e.g. different cloud region, or different cloud provider)
```

### Why each part matters — each clause defends against a *different* failure mode

| Clause | Defends against |
|---|---|
| **3 copies** (not 1, not 2) | A single point of failure destroying your only backup along with production. Two copies means one backup failure still leaves you with zero margin. |
| **2 different media/storage types** | A failure mode specific to one storage technology/vendor (e.g. a firmware bug, a storage-class-specific outage, a misconfigured lifecycle policy) taking out both production and backup simultaneously because they were architecturally identical. |
| **1 copy offsite** | Site-level disasters — a whole data center or region going down, a physical disaster, or (critically) a *logical* blast radius: an attacker or a misconfigured automation that has access to your primary account/region shouldn't automatically have access to destroy the offsite copy too. |

The offsite clause is where the ransomware-relevant reasoning lives, expanded next.

---

## 4. Immutable / Air-Gapped Backups — Ransomware Protection

**A backup an attacker can also encrypt or delete is not a real backup.** This is the failure mode that makes the difference between "we restored from backup in 2 hours" and "we paid the ransom because our backups were on the same network share the ransomware also reached."

Ransomware that compromises production credentials or network access frequently also:
- Enumerates and encrypts network-attached backup shares/NAS devices reachable from the compromised host.
- Deletes cloud snapshots and backup buckets if the compromised credentials have permission to do so.
- Sits dormant for days/weeks before triggering encryption, specifically to ensure it has propagated into your backup retention window too — meaning even "we have 30 days of backups" doesn't guarantee a clean recovery point if nobody notices the dormant compromise in time.

### Immutable / WORM (Write Once, Read Many) storage
The defense is to make backups **immutable for a defined retention period** — not even an account with full admin/delete permissions can alter or delete them until the lock expires.

```bash
# AWS S3 Object Lock in "Compliance" mode — even the root account cannot
# delete or overwrite the object before the retain-until date, period.
aws s3api put-object-lock-configuration \
  --bucket my-backup-bucket \
  --object-lock-configuration '{
    "ObjectLockEnabled": "Enabled",
    "Rule": {
      "DefaultRetention": {
        "Mode": "COMPLIANCE",
        "Days": 30
      }
    }
  }'

# Individual object with an explicit retain-until date and legal hold
aws s3api put-object-retention \
  --bucket my-backup-bucket \
  --key backups/postgres/backup_2026-07-25.sql.gz \
  --retention '{"Mode":"COMPLIANCE","RetainUntilDate":"2026-08-25T00:00:00Z"}'
```

- **Governance mode**: users with special IAM permission *can* override/delete — weaker, useful for internal safety nets.
- **Compliance mode**: nobody can delete or shorten the retention, including the account root user, until the lock expires — this is the mode that actually survives a fully compromised admin credential.

### Air-gapping as the older/complementary version of the same idea
Air-gapped backups are physically or logically disconnected from any network the production environment (or an attacker who compromised it) can reach — classically, tape stored offline. The cloud-native equivalent is a separate account/tenant with no standing trust relationship to production, reachable only via a narrow, audited, break-glass path — not a routine IAM role that production automation already has.

### The access-control angle, briefly
This ties directly into least-privilege IAM design: the credentials your production systems use day-to-day should **not** have delete/overwrite permission on the backup store — write-append-only for the backup job, and a fully separate, more tightly guarded credential for any deletion/lifecycle management. Deep IAM/least-privilege design is covered in the Security in DevOps notes elsewhere in this repo; the point to take from here is narrower: **your backup strategy is not ransomware-resistant unless you've deliberately designed the access boundary between "can write a backup" and "can delete a backup," independent of general security posture.**

---

## 5. Testing Backups — The Most Skipped, Most Important Practice

**An untested backup is not a backup — it's an unverified hope.** This is the single most common gap between DR plans on paper and DR plans that actually work.

### Why "backup succeeded" logs are not proof of anything
A backup job can report success while still being useless for recovery:
- The dump completed but the database was mid-write and the backup is logically inconsistent (see [Database Backup & Restore § 4](database-backup-and-restore.md#4-backup-consistency-for-databases)).
- The file uploaded to S3 successfully but is truncated or silently corrupted.
- The backup covers the wrong dataset — a config change three months ago quietly excluded a table/directory from the backup scope, and nobody noticed because the job still exits 0.
- The backup is valid, but the restore procedure that's supposed to use it was never written down, or references a tool/flag that no longer exists in the current version.

None of these are visible from a job-success log line. They are only visible by **actually restoring** the backup somewhere and verifying the result.

### Restore drills
The practice of periodically and routinely performing a real restore (to a scratch/staging environment, not production) and verifying the result is usable:

```bash
#!/usr/bin/env bash
set -euo pipefail
# Restore drill: pull the latest backup and restore it into a throwaway
# database, then run basic sanity checks. Intended to run on a schedule
# (e.g. weekly via cron/CI) — NOT a one-time manual exercise.

BACKUP_FILE=$(aws s3 ls s3://my-backup-bucket/postgres/ | sort | tail -n1 | awk '{print $4}')
aws s3 cp "s3://my-backup-bucket/postgres/${BACKUP_FILE}" /tmp/restore-drill.sql.gz

dropdb --if-exists restore_drill_db
createdb restore_drill_db
gunzip -c /tmp/restore-drill.sql.gz | psql restore_drill_db

# Sanity checks — not exhaustive, but catch the most common silent failures:
row_count=$(psql restore_drill_db -tAc "SELECT count(*) FROM orders;")
if [[ "$row_count" -lt 1000 ]]; then
  echo "ALERT: restore drill produced suspiciously low row count ($row_count) — investigate" >&2
  exit 1
fi

latest_order_ts=$(psql restore_drill_db -tAc "SELECT max(created_at) FROM orders;")
echo "Restore drill OK. Latest order timestamp in restored data: $latest_order_ts"
# Compare this timestamp against RPO expectations — if it's older than your
# RPO window, the backup cadence itself is failing to meet requirements.
```

### What a real testing cadence looks like
- **Automated restore verification** on every backup (or a sample of them) — cheapest to run continuously, catches corruption/truncation immediately.
- **Scheduled full restore drills** (weekly/monthly) into a staging environment, checked against expected data volume and recency.
- **Full DR failover tests** on a longer cadence (quarterly/annually) that exercise not just the data restore but the entire runbook — covered in depth in [DR Planning, Testing & Runbooks](dr-planning-testing-and-runbooks.md).

The cost of skipping this is always paid at the worst possible time: during an actual incident, under time pressure, discovering the backup nobody tested doesn't actually restore.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
