# Backup & Disaster Recovery — Overview

What Disaster Recovery actually means, how it differs from backup, and the two metrics (RTO/RPO) that drive every decision in this domain.

---

## 1. What Disaster Recovery Actually Means

Disaster Recovery (DR) is the ability to recover a system or business to an acceptable operational state after a catastrophic event. "Catastrophic" doesn't only mean a burning data center — the events that actually trigger DR in practice are, in rough order of frequency:

- **Human error** — an engineer runs `DROP TABLE`, deletes a production S3 bucket, or applies the wrong Terraform plan against prod.
- **Data corruption** — a bad deploy silently writes malformed data for hours before anyone notices.
- **Ransomware** — an attacker encrypts production data and any backup they can reach.
- **Hardware failure** — a disk, host, or storage array dies.
- **Region/availability-zone outage** — a cloud provider has a regional event (power, networking, control-plane failure).
- **Vendor/dependency failure** — a critical SaaS dependency or upstream API goes down for an extended period.

DR planning treats all of these as instances of the same underlying question: *if this happens right now, what do we do, how long does it take, and how much do we lose?*

---

## 2. Backup vs Disaster Recovery — Related but Distinct

These terms get used interchangeably in casual conversation, and that sloppiness causes real outages. They are not the same thing.

| | Backup | Disaster Recovery |
|---|---|---|
| **Definition** | Having a copy of your data | The full capability to restore an entire running system/service |
| **Scope** | Data only | Data + infrastructure + configuration + DNS + secrets + dependencies + network topology + the humans who execute it |
| **Proves** | "We have a copy from last night" | "We can actually bring the service back up and serve traffic" |
| **Typical artifact** | A `.sql.gz` file in S3, a snapshot | A tested runbook, pre-provisioned (or provisionable) infrastructure, a rehearsed team |
| **Common failure mode** | Backup job silently stops running | Backup exists and is valid, but nobody can rebuild the app around it in time |

A backup is a **necessary but not sufficient** condition for disaster recovery. You can have perfect nightly backups of your database and still fail a disaster recovery scenario because:

- Nobody has the Terraform/CloudFormation to rebuild the VPC, subnets, and security groups.
- The restore procedure depends on a config file that only exists on the dead host.
- DNS still points at the dead region and nobody knows how to cut it over (see [DNS & Global Load Balancing](../Load%20Balancing/dns-and-global-load-balancing.md) for the traffic-routing mechanics of that cutover).
- The one engineer who knew the restore process left the company.

DR is the superset: it's the org-level capability of which "restore this backup" is just one step.

---

## 3. RTO and RPO — The Two Numbers That Drive Everything

Every DR decision — architecture, budget, tooling, staffing — ultimately traces back to two numbers negotiated with the business, not chosen unilaterally by engineering.

### RTO — Recovery Time Objective
**How long can the system be down before the business impact is unacceptable?** Measured from the moment of failure to the moment the system is back up and serving traffic normally.

> Example: "RTO of 4 hours" means that from the moment of a declared disaster, the service must be restored and functional within 4 hours.

### RPO — Recovery Point Objective
**How much data can you afford to lose, measured in time?** It answers "if disaster strikes right now, how far back does the most recent usable recovery point go?"

> Example: "RPO of 15 minutes" means that after recovery, you may have lost at most the last 15 minutes of writes — not that recovery itself takes 15 minutes.

```
Timeline of a disaster:

  Last backup/replication point         Disaster occurs         System restored
         |                                     |                        |
         |<---------- RPO window ------------->|<------ RTO window ---->|
         |    (data lost = this much time)     |  (downtime = this much)|
```

RTO and RPO are independent axes — a system can have a tight RTO and a loose RPO (must come back fast, some data loss is tolerable) or vice versa (can stay down a while, but must lose almost nothing when it comes back). Most critical systems need both tight, which is exactly what makes them expensive.

---

## 4. Worked Example — How RTO/RPO Requirements Determine Strategy

This is the single most important mental model in DR: **RTO/RPO aren't aspirational descriptions, they're hard constraints that mathematically rule out entire categories of strategy.**

### Scenario A: Internal analytics dashboard
- Business requirement: "If it's down a day, annoying but survivable. Losing a day of data is fine, we can re-ingest."
- **RTO: 24 hours, RPO: 24 hours**
- Strategy this permits: nightly `pg_dump` to S3, restore manually when needed. Cheapest possible option — see [Database Backup & Restore](database-backup-and-restore.md).

### Scenario B: Primary transactional e-commerce database
- Business requirement: "Losing more than 5 minutes of orders is a business-threatening, possibly legally-relevant event. Being down more than 30 minutes costs six figures an hour."
- **RTO: 30 minutes, RPO: 5 minutes**
- What this rules out immediately: nightly backups are mathematically incompatible with a 5-minute RPO — the best a nightly backup can ever do is lose up to 24 hours of data, regardless of how good the restore process is. A 5-minute RPO **requires continuous replication or continuous log/WAL shipping** (point-in-time recovery — see [Database Backup & Restore § 3](database-backup-and-restore.md#3-point-in-time-recovery-pitr-via-wal--binlog-shipping)), and a 30-minute RTO **requires pre-provisioned or fast-scaling standby infrastructure**, not "spin up a new environment from Terraform after the fact" (see [Disaster Recovery Strategies](disaster-recovery-strategies.md) for the Pilot Light / Warm Standby / Active-Active tiers this implies).

### The takeaway
Work the derivation in this order, every time:

1. Get RTO/RPO from the business (not from engineering guessing what "sounds reasonable").
2. Derive the *minimum* backup/replication frequency the RPO allows — this is arithmetic, not opinion.
3. Derive the *minimum* infrastructure readiness tier the RTO allows (cold rebuild vs warm standby vs hot active-active).
4. Price out that tier. If the business balks at the cost, the RTO/RPO negotiation happens again — in the *other* direction. This is the correct order of operations; picking a cheap strategy first and hoping it happens to meet unstated requirements is how DR plans fail silently until the day they're needed.

---

## 5. Glossary

| Term | Meaning |
|---|---|
| **RTO** (Recovery Time Objective) | Maximum acceptable downtime — how long recovery is allowed to take |
| **RPO** (Recovery Point Objective) | Maximum acceptable data loss, measured as a time window |
| **Hot standby** | A fully running duplicate environment, kept continuously in sync, ready to take traffic immediately or near-immediately |
| **Warm standby** | A smaller-scale but functional duplicate environment running continuously, scaled up on failover |
| **Cold standby** | Infrastructure that must be provisioned or substantially started up from scratch (or from images/IaC) at failover time — cheapest, slowest |
| **Failover** | The act of switching operation from the failed primary system to a standby/secondary system |
| **Failback** | The act of switching back from the standby system to the original (now-repaired) primary once it's healthy again — often the more error-prone half of a DR event, since it's rehearsed far less often than failover |
| **Backup window** | The time period during which a backup job runs — relevant because backups can compete for I/O/CPU with live traffic, and a backup window that overruns into business hours is itself an operational risk |
| **Disaster declaration** | The formal decision point where an incident is classified as requiring the DR plan (as opposed to normal incident response) — usually has an explicit owner/authority, since invoking full failover has real cost and risk |

---

## 6. Contents of This Folder

| File | Covers |
|---|---|
| [backup-strategies-and-types.md](backup-strategies-and-types.md) | Full/incremental/differential backups, retention design, the 3-2-1 rule, immutable/air-gapped backups, testing backups |
| [database-backup-and-restore.md](database-backup-and-restore.md) | Logical vs physical/snapshot backups, PITR via WAL/binlog shipping, backup consistency, replication vs backup |
| [disaster-recovery-strategies.md](disaster-recovery-strategies.md) | The four DR tiers (Backup & Restore, Pilot Light, Warm Standby, Multi-Site Active-Active), cost/RTO/RPO mapping, decision framework |
| [dr-planning-testing-and-runbooks.md](dr-planning-testing-and-runbooks.md) | The DR plan as a document, testing/drills, runbook design, worked failover runbook, compliance, anti-patterns |

Related, outside this folder:
- [Shell Scripting for DevOps § 6 — Backup & Restore](../scripting/shell-scripting-devops.md#6-backup--restore) — raw shell-script-level backup examples (`pg_dump`, S3 sync).
- [DNS & Global Load Balancing](../Load%20Balancing/dns-and-global-load-balancing.md) — the traffic-routing mechanics of multi-region failover (DNS failover, anycast, active-active routing).

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
