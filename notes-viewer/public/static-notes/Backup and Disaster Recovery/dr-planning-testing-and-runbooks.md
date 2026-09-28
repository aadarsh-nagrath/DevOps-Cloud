# DR Planning, Testing & Runbooks

The DR plan as a document, testing/drills philosophy, what makes a good runbook, a worked failover runbook, compliance drivers, and the anti-patterns that quietly make a DR plan useless. See [Disaster Recovery Strategies](disaster-recovery-strategies.md) for choosing the underlying architecture this plan operationalizes.

---

## 1. The Disaster Recovery Plan as a Document

A DR plan is not a one-page diagram — it's an operational document meant to be followed under pressure, by someone who may not be the person who wrote it. It should contain, at minimum:

| Section | Contents |
|---|---|
| **Scope** | Which systems this plan covers, and explicitly which it doesn't (avoids ambiguity mid-incident about whether this plan applies) |
| **RTO / RPO** | The agreed targets for this system (see [Overview § 3](backup-and-dr-overview.md#3-rto-and-rpo--the-two-numbers-that-drive-everything)), so responders know what "done" looks like and how much urgency is warranted |
| **Disaster declaration criteria** | Who has authority to declare a disaster and invoke this plan, and what conditions trigger it — this should not be ambiguous or improvised in the moment |
| **Roles and responsibilities** | Named roles (Incident Commander, Communications Lead, Technical Lead per system) with clear handoff — not "whoever's on call figures it out" |
| **Contact information** | Escalation paths, vendor/provider support contacts, internal stakeholders who need status updates — kept current, and reachable *without* depending on the systems that are currently down (don't store the on-call phone tree only in the tool that's currently offline) |
| **Dependency order** | The explicit order systems must be restored in — you cannot bring the application up before its database, cannot bring the database up before its network/VPC, cannot authenticate anyone before the auth service is up. This is frequently the part missing from otherwise-decent plans. |
| **Recovery procedures** | Step-by-step runbooks per system/scenario (see § 3) |
| **Rollback/failback procedure** | How to return to the original primary once it's repaired — see § 3's note on why this is often the weaker half of the plan |
| **Communication templates** | Pre-drafted status update language for stakeholders/customers, so nobody is composing incident comms from scratch while also fixing the problem |

### Dependency ordering — worked example
```
Restore order for a typical web app stack:

1. Network/VPC + DNS zones           <- everything else needs a network to exist in
2. Secrets/config management         <- app and DB both need credentials to start
3. Database (restored/promoted)      <- must be up and confirmed healthy before app starts writing to it
4. Cache/session store               <- app may degrade-fail without it, but shouldn't be strictly blocking
5. Application/backend services      <- depends on 2 and 3 being ready
6. Load balancer / ingress           <- depends on 5 having healthy targets to route to
7. DNS cutover to the new endpoint   <- see dns-and-global-load-balancing.md for the mechanics
8. Downstream/dependent services, batch jobs, scheduled tasks
```
Getting this order wrong under pressure — e.g., cutting DNS over before the application layer is actually healthy — turns a controlled recovery into a second outage.

---

## 2. DR Testing / Drills

The same "start small, build confidence" progression that applies to chaos engineering (covered in more depth elsewhere in this repo, in the dedicated Chaos Engineering notes) applies directly to DR testing — you do not go straight to pulling the plug on production as your first test.

### Tabletop exercises
A walkthrough, not an execution — the team talks through "if X happened right now, what would we do?" using the actual DR plan document, without touching any real systems.

- **Cheap, fast, low-risk** — can run frequently (monthly/quarterly).
- **Catches**: missing steps, unclear ownership, outdated contact info, dependency-order mistakes, plans that reference tools/processes that no longer exist.
- **Doesn't catch**: whether the actual restore commands work, whether the standby infrastructure is really in a usable state, whether the described RTO is achievable in practice.

### Partial/component-level tests
Actually executing one piece of the plan against a real (non-production) environment — e.g., a real restore drill (see [Backup Strategies & Types § 5](backup-strategies-and-types.md#5-testing-backups--the-most-skipped-most-important-practice)), or actually promoting a read replica in staging and timing how long it takes.

### Full failover tests
Actually invoking the complete DR plan, ideally against production or a fully production-representative environment, with real traffic cutover.

- **Highest confidence** — this is the only test that validates the plan end-to-end, including the traffic-routing cutover (see [DNS & Global Load Balancing](../Load%20Balancing/dns-and-global-load-balancing.md)) actually working as described.
- **Highest risk and cost** — requires careful scoping, a rollback plan for the test itself, and usually off-peak scheduling with stakeholder sign-off.
- **Cadence**: annually at minimum for critical systems; some organizations run these quarterly for their most critical tier. Less frequent than that and configuration drift (§ 5) has likely already invalidated the last successful test.

The progression — tabletop, then component-level, then full failover — builds organizational confidence and catches cheaper classes of problems before spending the cost of a full test, exactly mirroring how chaos engineering practice starts with small, contained experiments before graduating to larger-blast-radius ones.

---

## 3. Runbooks

A runbook is the executable unit of a DR plan — the actual step-by-step instructions for one specific recovery scenario.

### What makes a good runbook
- **Assumes the reader is stressed and unfamiliar** — write it for the 3am on-call engineer who has never done this before, not for the expert who wrote it. Spell out exact commands, not "restore the database appropriately."
- **Explicit, copy-pasteable commands** with placeholders clearly marked, not prose descriptions of what to do.
- **States expected output/success criteria at each step** — how does the person running it know step 3 actually worked before moving to step 4?
- **Includes rollback/abort guidance** — what to do if a step fails partway through.
- **Tested regularly, not written once and shelved** — a runbook that references a command-line flag that was deprecated two tool-versions ago, or a hostname that was renamed in a later migration, fails exactly when it's needed most. Untested runbooks rot silently, just like untested backups (see [Backup Strategies & Types § 5](backup-strategies-and-types.md#5-testing-backups--the-most-skipped-most-important-practice)) — the failure mode is identical: it *looks* fine sitting in the wiki, and you only discover it's wrong during the incident.
- **Version-controlled and dated** — so responders can see it was actually kept in sync with the current architecture.

### Worked example — Runbook: "Primary Region Is Down, Execute Regional Failover"

```markdown
# Runbook: Regional Failover — Primary (us-east-1) Down

**Last tested**: 2026-06-14 (quarterly full failover test)
**Owner**: Platform team
**RTO target**: 30 minutes | **RPO target**: 5 minutes

## 1. Declaration
- [ ] Confirm this is a genuine region-level event, not a single-service issue:
      check provider status page + at least 2 independent health checks
      (app health endpoint AND database connectivity) both failing from
      multiple vantage points.
- [ ] Incident Commander declares "regional failover" explicitly in the
      incident channel. This runbook does not start until that declaration
      is made — do not unilaterally begin failover on suspicion alone.

## 2. Notify
- [ ] Post initial status update using the DR communication template
      (see DR plan § Communication templates).
- [ ] Page: Database on-call, App on-call, Comms lead (see contact list).

## 3. Database
- [ ] Confirm replica in us-west-2 is healthy and replication lag < 5 min:
      `aws rds describe-db-instances --db-instance-identifier prod-db-replica \
        --query 'DBInstances[0].StatusInfos'`
- [ ] Promote the us-west-2 replica to standalone primary:
      `aws rds promote-read-replica --db-instance-identifier prod-db-replica`
- [ ] Wait for promotion to complete (status: available). Expected: ~5-10 min.
- [ ] Verify writability: connect and run a test write against a scratch table.

## 4. Application
- [ ] Scale up us-west-2 application tier to full production capacity
      (already running at reduced scale — Warm Standby tier):
      `kubectl --context us-west-2 scale deployment/app --replicas=20`
- [ ] Confirm health checks passing on all new pods before proceeding.

## 5. Traffic cutover
- [ ] Update Route 53 failover record to point at us-west-2 load balancer
      (see dns-and-global-load-balancing.md for the underlying mechanism):
      `aws route53 change-resource-record-sets --hosted-zone-id Z123456 \
        --change-batch file://failover-to-west.json`
- [ ] Monitor traffic shift via dashboard; confirm error rate returns to baseline.

## 6. Verify
- [ ] Run smoke test suite against production endpoint.
- [ ] Confirm background jobs / cron in us-west-2 are running (not still
      pointed at the dead region's scheduler).
- [ ] Post "failover complete" status update.

## 7. Failback (once us-east-1 is confirmed repaired — separate, later exercise)
- [ ] Do NOT attempt failback improvised — use the separate Failback Runbook.
      Failback is not simply this runbook in reverse: the promoted us-west-2
      primary now has writes that us-east-1 doesn't, requiring a re-sync step
      before us-east-1 can safely resume as primary.
```

Note the explicit callout in step 7 — failback is a distinct, separately-tested procedure, not an assumed mirror image of failover. This is a common gap: teams rehearse failover regularly and never rehearse failback, then improvise it for the first time during a real recovery.

---

## 4. Compliance Considerations

Many regulated industries (financial services, healthcare, critical infrastructure) have explicit regulatory requirements around RTO/RPO targets, backup retention periods, and demonstrable, documented DR testing — not just having a plan, but being able to prove it was tested and produce audit evidence of drills. This varies significantly by industry and jurisdiction and is a compliance/legal question as much as an engineering one — the point to internalize here is that **regulatory requirements are sometimes the actual source of your RTO/RPO numbers**, not just a business preference, and retention periods in particular (see [Backup Strategies & Types § 2](backup-strategies-and-types.md#2-backup-frequency--retention-policy-design)) may be a legal floor, not a storage-cost optimization. Confirm with compliance/legal what applies to your specific industry rather than assuming.

---

## 5. Common DR Planning Failures / Anti-Patterns

### The plan exists only as a document nobody has tested
The most common failure. A polished DR plan in the wiki that was written once, reviewed in a meeting, and never executed. It accumulates inaccuracies silently (tool changes, architecture changes, personnel changes) and the first time anyone actually tries to follow it is during a real disaster — the worst possible time to discover step 4 references a decommissioned system.

### Key-person dependency
Only one engineer actually knows how to execute the failover — everyone else has read the runbook but never run it, or the "real" knowledge lives in that person's head and isn't in the runbook at all. This fails catastrophically if that person is unreachable, on vacation, or has left the company exactly when the disaster happens. The fix is mechanical: rotate who executes the drill each time, and treat "someone other than the usual person can follow this runbook unassisted" as the actual pass/fail criterion for a drill, not just "did recovery succeed."

### Configuration drift between DR environment and production
The standby/DR environment was correctly configured when first built, but production has since changed — new environment variables, a new dependency, an updated database extension, a security group rule added directly in the console and never replicated to the DR side — and the DR environment quietly no longer matches. This is invisible until failover is actually invoked, at which point the standby comes up broken or subtly wrong. Mitigations:
- Provision both environments from the same IaC source of truth, not divergent manual configuration.
- Include drift detection as a routine check (`terraform plan` against the DR environment on a schedule, diffing expected vs actual state), not just against production.
- Full failover tests (§ 2) are the ultimate drift detector — this is one more reason "we tested it 18 months ago" is not the same as "it works now."

### Treating DR as purely an infrastructure problem
A DR plan that only accounts for data and compute but not the human process (who declares the disaster, who has authority, how the team communicates when normal tools might be down) will stall on process ambiguity even when every technical piece works correctly.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
