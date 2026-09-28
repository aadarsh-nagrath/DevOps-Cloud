# Database Backup & Restore

Database-specific backup strategy — where most of the hard, DR-relevant complexity actually lives. For generic backup theory (types, retention, 3-2-1) see [Backup Strategies & Types](backup-strategies-and-types.md); for raw `pg_dump`/S3 shell examples see [Shell Scripting for DevOps § 6](../scripting/shell-scripting-devops.md#6-backup--restore).

---

## 1. Logical Backups vs Physical/Snapshot Backups

### Logical backups (`pg_dump`, `mysqldump`)
Export the database's *logical* content — the SQL statements (or an equivalent portable format) needed to recreate the schema and data from scratch.

```bash
# Postgres logical backup
pg_dump -Fc mydb > mydb.dump          # custom format, compressed, supports parallel restore
pg_restore -d mydb_restored -j 4 mydb.dump   # -j: parallel restore jobs

# MySQL logical backup
mysqldump --single-transaction --routines --triggers mydb > mydb.sql
mysql mydb_restored < mydb.sql
```

| | Logical backup |
|---|---|
| **Format** | Human-readable (or portable binary) SQL/data representation |
| **Portability** | High — can restore into a different major version, different platform, even a different database product with some translation |
| **Restore speed on large DBs** | **Slow** — every row is re-inserted and every index rebuilt from scratch; a multi-TB database can take many hours to restore this way |
| **Restore speed on small/medium DBs** | Fine — this is where logical backups are perfectly practical |
| **Granularity** | Can restore a single table/schema, not just the whole database |
| **Consistency** | Point-in-time consistent snapshot of the data if taken correctly (`--single-transaction` for MySQL, MVCC snapshot for `pg_dump`) — see § 4 |

### Physical / snapshot backups
Copy the actual on-disk data files (or a storage-layer snapshot of the volume they live on) rather than re-deriving them logically.

```bash
# Filesystem-level physical backup (Postgres pg_basebackup — copies data directory)
pg_basebackup -D /backups/base -Fp -Xs -P -h localhost -U replicator

# Cloud volume snapshot (AWS EBS example — storage-layer, not database-aware)
aws ec2 create-snapshot --volume-id vol-0abc123 --description "pre-migration snapshot"
```

Cloud-native automated snapshots (RDS, Cloud SQL, Azure Database) are the managed version of this — the provider handles scheduling, retention, and consistency internally:

```bash
# RDS automated backups are configured declaratively, not scripted per-run
aws rds modify-db-instance \
  --db-instance-identifier prod-db \
  --backup-retention-period 7 \
  --preferred-backup-window "03:00-04:00" \
  --apply-immediately

# On-demand manual snapshot (survives even if the instance is deleted, unlike automated backups by default)
aws rds create-db-snapshot \
  --db-instance-identifier prod-db \
  --db-snapshot-identifier prod-db-pre-migration-2026-07-25
```

| | Physical/snapshot backup |
|---|---|
| **Format** | Raw data files or block-level storage snapshot |
| **Portability** | Low — generally tied to the same database engine, often the same major version, sometimes the same platform/provider |
| **Restore speed** | **Fast** — especially cloud volume snapshots, which can use copy-on-write and be "restored" in the time it takes to provision a new volume pointing at the snapshot, independent of data size |
| **Granularity** | Whole database/instance — cannot cherry-pick a single table without extra tooling |
| **Consistency** | Requires care — see § 4; naive filesystem copy of a live database is not automatically valid |

### Summary comparison

| | Logical (`pg_dump`/`mysqldump`) | Physical/snapshot (volume snapshot, RDS automated backup) |
|---|---|---|
| Restore speed, large DB | Slow (hours) | Fast (minutes, often size-independent) |
| Portability across engines/versions | High | Low — tied to the engine |
| Partial/table-level restore | Yes | Generally no |
| Typical use | Migrations, small/medium DBs, cross-platform moves, one-off archival exports | Primary DR mechanism for production databases at scale |

**Practical rule of thumb**: use physical/snapshot backups as your primary DR mechanism for any database where restore time matters (i.e., where RTO is tight — see [Overview § 4](backup-and-dr-overview.md#4-worked-example--how-rtorpo-requirements-determine-strategy)); keep logical backups as a secondary/portable copy for migrations, disaster scenarios that require moving to a different engine or provider, or long-term archival where format longevity matters more than restore speed.

---

## 2. Point-in-Time Recovery (PITR) via WAL/Binlog Shipping

Nightly (or even hourly) snapshots only give you discrete recovery points — if disaster strikes at 2:47pm and your last backup was midnight, you lose almost a full day. PITR closes that gap by continuously shipping the database's write-ahead log (Postgres: WAL; MySQL: binlog) to durable storage, so you can replay it forward from a base backup to **any specific transaction/timestamp**, not just the last discrete backup.

```
Base backup (Sunday midnight)
       |
       v
WAL/binlog segments shipped continuously ------> archive storage (e.g. S3)
       |
       v
Disaster occurs at 2:47pm Wednesday
       |
       v
Restore = base backup + replay all WAL segments up to 2:47pm (or up to just before the bad transaction)
```

```bash
# Postgres: continuous WAL archiving configuration (postgresql.conf)
# wal_level = replica
# archive_mode = on
# archive_command = 'aws s3 cp %p s3://my-wal-archive/%f'

# Restore to a specific point in time using a base backup + archived WAL
# recovery.signal + postgresql.conf on the restored instance:
#   restore_command = 'aws s3 cp s3://my-wal-archive/%f %p'
#   recovery_target_time = '2026-07-25 14:46:00'   # one minute before the bad DROP TABLE

# MySQL: enable binlog, then restore = last full backup + mysqlbinlog replay up to target
mysqlbinlog --stop-datetime="2026-07-25 14:46:00" \
  binlog.000045 binlog.000046 | mysql mydb_restored
```

**This is what actually achieves a low RPO.** A base backup taken once a day plus continuously-shipped logs gives you an RPO measured in seconds-to-minutes (however frequently log segments are shipped/flushed) rather than an RPO measured in hours-to-a-day (the gap between discrete backups). This is the mechanism referenced in the [Overview's worked example](backup-and-dr-overview.md#4-worked-example--how-rtorpo-requirements-determine-strategy) for the 5-minute-RPO transactional database scenario.

Cloud-managed databases (RDS, Cloud SQL) expose this as a feature rather than something you configure manually:

```bash
# RDS point-in-time restore — the service handles WAL/log shipping internally;
# you just specify the target timestamp within the retention window.
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier prod-db \
  --target-db-instance-identifier prod-db-restored \
  --restore-time "2026-07-25T14:46:00Z" \
  --use-latest-restorable-time false   # false = use the explicit --restore-time given above
```

---

## 3. Backup Consistency for Databases

You cannot simply copy a database's data files while it's live and mid-write and expect a valid backup — a naive filesystem-level copy taken while transactions are in flight can capture some pages before a write and others after, producing a file that's internally inconsistent and may not even start up, let alone contain correct data.

Three ways to get a consistent backup:

1. **Use the database engine's own backup tooling**, which understands its internal consistency requirements (`pg_dump`'s MVCC snapshot, `pg_basebackup`'s WAL-bracketing, `mysqldump --single-transaction`, engine-native snapshot APIs). This is the default-safe choice — always prefer it over rolling your own.
2. **Quiescing** — briefly pause writes (or put the database in a backup-safe mode) for the instant needed to take a consistent snapshot, then resume. Cloud snapshot integrations often do this automatically and briefly (e.g., freezing the filesystem via `fsfreeze`, or an RDS snapshot that briefly holds writes at the storage layer) — usually sub-second to a few seconds of impact, but worth knowing it isn't "free."
3. **Crash-consistent storage snapshots** — many storage-layer snapshot tools (cloud block storage) can guarantee that the snapshot looks the same as if power had been cut at that instant, which is exactly what a database engine's own crash-recovery logic (WAL replay on startup) is designed to handle safely — so a "crash-consistent" snapshot is safe to restore *as long as the database engine performs normal crash recovery on startup*, even without explicit quiescing. This is why cloud-native automated snapshots (RDS, EBS-backed) are safe to rely on without you manually coordinating a quiesce step — the provider has already designed for this.

**What's actually unsafe**: manually `cp -r`'ing a live database's data directory, or taking a storage snapshot of a system where the storage layer does *not* guarantee crash consistency (e.g., data spread across multiple independently-snapshotted volumes with no coordination between them) — this can produce a backup that looks complete but silently corrupts on restore.

---

## 4. Replication as a DR Mechanism vs a Backup Mechanism

This is a distinction that catches teams out constantly: **a replica is not a backup, even though it feels like one.**

A streaming replica (synchronous or asynchronous) protects against:
- Primary host/hardware failure — promote the replica, you're back up fast, minimal-to-zero data loss depending on sync mode.
- Some classes of storage failure on the primary.

A replica does **not** protect against:
- **Logical corruption or human error** — `DROP TABLE orders;` or a buggy migration that deletes rows executes on the primary, and the replica faithfully, correctly, immediately replicates that exact mistake. The replica has no concept of "this was a mistake" — it's doing its job perfectly by copying it.
- **Ransomware/malicious deletion** — same reasoning; if the attacker's actions replicate, the replica is compromised too, often before anyone notices.

```
Primary DB  --DROP TABLE orders-->  [replicated within seconds]  -->  Replica DB
     |                                                                     |
     v                                                                    v
orders table: GONE                                          orders table: ALSO GONE
```

**The conclusion**: replication solves availability (RTO for hardware/host failures), not recoverability from logical mistakes. You still need real point-in-time backups (§ 2) *even when replication is already in place* — they are solving different problems and neither substitutes for the other. A mature setup runs both simultaneously: replication for fast failover on infrastructure failure, PITR-capable backups for recovery from logical/human error.

---

## 5. Worked Example — Postgres on RDS: Automated Snapshots + PITR Combined

Scenario: production Postgres on AWS RDS, business requirement RTO 30 minutes / RPO 5 minutes (the tight-requirements scenario from the [Overview](backup-and-dr-overview.md#4-worked-example--how-rtorpo-requirements-determine-strategy)).

```bash
# 1. Enable automated backups with PITR support (RDS ships WAL continuously
#    under the hood once automated backups are on — this is what makes any
#    point-in-time restore within the retention window possible, not just
#    restores to the nightly snapshot time).
aws rds modify-db-instance \
  --db-instance-identifier prod-orders-db \
  --backup-retention-period 7 \
  --preferred-backup-window "03:00-04:00" \
  --preferred-maintenance-window "sun:04:30-sun:05:30" \
  --apply-immediately

# 2. Enable Multi-AZ for synchronous standby replication -- this is the
#    hardware/host-failure protection (fast RTO), NOT a substitute for step 1's
#    logical-error protection (see section 4 above).
aws rds modify-db-instance \
  --db-instance-identifier prod-orders-db \
  --multi-az \
  --apply-immediately

# 3. Take an explicit pre-change manual snapshot before risky operations
#    (schema migrations, major version upgrades) — automated backups alone
#    don't guarantee a snapshot exists at exactly the moment you need one.
aws rds create-db-snapshot \
  --db-instance-identifier prod-orders-db \
  --db-snapshot-identifier prod-orders-pre-migration-$(date +%Y%m%d)

# --- Disaster scenario: bad migration at 14:47 corrupts the orders table ---

# 4. Point-in-time restore to just before the bad migration.
#    This creates a NEW instance -- it does not overwrite the existing one,
#    which is deliberate: verify the restored data before cutting traffic over.
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier prod-orders-db \
  --target-db-instance-identifier prod-orders-db-recovery \
  --restore-time "2026-07-25T14:46:30Z" \
  --db-subnet-group-name prod-subnet-group \
  --vpc-security-group-ids sg-0abc123

# 5. Validate the restored instance, then cut the application over
#    (connection string / DNS CNAME repoint -- see the Load Balancing
#    folder for failover routing mechanics), and finally decommission
#    or rename the old corrupted instance once confirmed safe.
```

Why this meets RTO 30 / RPO 5: RDS's continuous WAL shipping under automated backups gives sub-5-minute granularity for the PITR restore target (satisfying RPO), and `restore-db-instance-to-point-in-time` for a moderately sized instance typically completes well within 30 minutes (satisfying RTO) — though this must be verified empirically for your actual data size via a restore drill (see [Backup Strategies & Types § 5](backup-strategies-and-types.md#5-testing-backups--the-most-skipped-most-important-practice)), not assumed from documentation alone.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
