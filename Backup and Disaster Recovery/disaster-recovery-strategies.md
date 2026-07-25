# Disaster Recovery Strategies

The four classic DR strategy tiers, how each maps to RTO/RPO and cost, and a framework for picking the right one. This file covers the data/infrastructure readiness side of each tier — for the traffic-routing mechanics of actually cutting over once you've picked a tier, see [DNS & Global Load Balancing](../Load%20Balancing/dns-and-global-load-balancing.md).

---

## 1. The Four DR Strategy Tiers

These are the standard tiers (as popularized by AWS's Well-Architected DR guidance, but the concepts are cloud-agnostic) — each one trades cost for recovery speed.

| Tier | What's always running | Failover process | Relative cost |
|---|---|---|---|
| **Backup & Restore** | Nothing — just backups sitting in storage | Provision infrastructure from scratch (IaC), restore data, bring the app up | Lowest |
| **Pilot Light** | A minimal core (e.g., a continuously-replicated database, but no application servers) | Scale up the surrounding infrastructure (app servers, load balancers) around the already-warm core | Low-medium |
| **Warm Standby** | A smaller-scale but fully functional duplicate of the whole stack, always running | Scale up capacity to full production size, redirect traffic | Medium-high |
| **Multi-Site Active-Active** | A full-scale duplicate, always running and *already serving production traffic* | Just stop routing to the failed site — the other site is already handling load | Highest |

```
Backup & Restore    Pilot Light        Warm Standby       Multi-Site Active-Active
     |                   |                   |                       |
   nothing          DB replica only    full stack, small       full stack, full scale
   running           (core state)         scale, idle            already serving traffic
     |                   |                   |                       |
  slowest RTO -----------------------------------------------------> fastest RTO
  cheapest    -----------------------------------------------------> most expensive
```

---

## 2. Tier Detail — Data & Infrastructure Readiness

### Backup & Restore
- **State**: only backups exist (see [Backup Strategies & Types](backup-strategies-and-types.md) and [Database Backup & Restore](database-backup-and-restore.md)). No standby compute, no standby network.
- **What failover actually involves**: run the IaC (Terraform/CloudFormation) to stand up the environment, restore the database from the most recent backup/PITR target, redeploy application artifacts, reconfigure DNS.
- **RTO reality**: hours, sometimes many hours — bounded by how long infrastructure provisioning + data restore + app deploy takes, all done cold, all done under incident pressure.
- **RPO reality**: bounded by backup frequency, unless PITR/log shipping is layered on top (which is compatible with this tier and cheap to add).
- **Where this fits**: non-critical systems, internal tools, anything where a multi-hour outage is a real but tolerable cost.

### Pilot Light
- **State**: the minimal, hardest-to-quickly-recreate core is kept continuously running/synced — almost always the database (via cross-region replication or continuous log shipping), sometimes core config/secrets infrastructure. Application/compute layers are *not* running, or exist only as machine images/container definitions ready to deploy.
- **What failover actually involves**: the data is already there and current (or near-current) — you scale up the surrounding compute layer around it (launch app servers from a pre-built AMI/image, stand up load balancers) and cut traffic over.
- **RTO reality**: significantly better than Backup & Restore because the slowest part — getting data into a usable, current state — is already done. Provisioning compute from pre-built images is fast (minutes, not hours).
- **RPO reality**: as good as your replication/log-shipping lag — can be very low (minutes or less) since the database is continuously current, unlike Backup & Restore's discrete backup gaps.
- **Where this fits**: the common middle-ground default for production systems that need materially better recovery than nightly backups but where the cost of a fully duplicated, always-running application tier isn't justified.

### Warm Standby
- **State**: a complete, functional duplicate of the entire stack — database, application servers, load balancers — is running continuously in the DR region/site, just at reduced scale (e.g., 1-2 instances instead of the 20 running in production).
- **What failover actually involves**: scale the already-running standby up to production capacity (autoscaling, or a manual scale-out step), and redirect traffic.
- **RTO reality**: fast — minutes. Nothing needs to be provisioned from scratch or deployed fresh; it's already running the current application version and just needs more capacity and traffic.
- **RPO reality**: low, same replication-lag-bound reasoning as Pilot Light, but typically with tighter, more actively-monitored replication since the whole stack is live and easier to validate continuously (you can actually smoke-test the standby's application layer routinely, not just its database).
- **Where this fits**: business-critical systems where minutes of downtime matter and the budget for a continuously-running (if smaller) duplicate stack is justified.

### Multi-Site Active-Active
- **State**: full-scale, fully duplicated infrastructure in two or more sites/regions, **all of it already serving live production traffic simultaneously**, not sitting idle as standby.
- **What failover actually involves**: nothing needs to "come up" — the other site(s) are already up and already handling their share of traffic. Failover is purely a traffic-routing decision: stop sending traffic to the failed site (see [DNS & Global Load Balancing](../Load%20Balancing/dns-and-global-load-balancing.md) for exactly how that routing/health-check/anycast mechanism works).
- **RTO reality**: fastest possible — bounded almost entirely by how fast the traffic-routing layer detects failure and reroutes, not by any data/infrastructure readiness step, because there's nothing left to make ready.
- **RPO reality**: depends on the data layer's replication topology — active-active *application* tiers don't automatically imply active-active *writable* databases; the hardest part of this tier is usually multi-region data consistency (conflict resolution for concurrent writes in two regions), which is a genuinely hard distributed-systems problem, not just an infrastructure cost question.
- **Where this fits**: only the most business-critical systems, where downtime cost outweighs running (and operating, and keeping in sync, and testing) two full production-scale environments continuously. Also the most operationally complex tier — the cost isn't purely dollars, it's ongoing engineering complexity to keep both sites truly consistent.

---

## 3. Mapping Tiers to RTO/RPO and Cost

| Tier | Typical RTO | Typical RPO | Cost driver |
|---|---|---|---|
| Backup & Restore | Hours | Backup interval (or PITR-bound, minutes-hours) | Storage only |
| Pilot Light | Tens of minutes | Minutes (replication-lag-bound) | Replicated data store + pre-built images, minimal idle compute |
| Warm Standby | Minutes | Minutes (replication-lag-bound, tightly monitored) | Continuously-running reduced-scale full stack |
| Multi-Site Active-Active | Seconds (traffic-routing-bound) | Depends on multi-region data consistency design | Full duplicate production-scale infrastructure, ongoing |

This is the same RTO/RPO-drives-strategy logic from the [Overview](backup-and-dr-overview.md#4-worked-example--how-rtorpo-requirements-determine-strategy) — the table above is effectively a lookup: take your negotiated RTO/RPO, find the cheapest tier whose typical numbers satisfy them, and treat that as your starting architecture (then validate empirically, since "typical" numbers vary a lot by actual system size and complexity).

---

## 4. Decision Framework — Picking a Tier

Not every system needs Multi-Site Active-Active, and defaulting everything to the most expensive tier wastes budget that would matter more concentrated on the systems that actually need it. Work through this in order:

1. **Classify business criticality.** What's the actual cost of downtime and data loss for *this specific system* — revenue impact, regulatory exposure, customer trust, safety? Not "how important does the team building it feel it is."
2. **Get explicit RTO/RPO numbers** from the business owner for that system — not engineering's guess (see [Overview § 3](backup-and-dr-overview.md#3-rto-and-rpo--the-two-numbers-that-drive-everything)).
3. **Use the table in § 3** to find the cheapest tier whose typical numbers meet those requirements.
4. **Price it out** and take the number back to the business owner. If it's more than they expected, the conversation is about *relaxing RTO/RPO*, not silently under-building. This negotiation should happen explicitly and be documented — an unstated assumption here is exactly how a system ends up with a DR posture nobody actually agreed to.
5. **Reassess periodically.** A system's criticality changes as the business changes around it — an internal tool that becomes load-bearing for a new revenue stream needs its DR tier revisited, not left at whatever it was provisioned with originally.

### Anti-pattern: uniform over-engineering
Putting every system — including low-criticality internal tools — on Warm Standby or Active-Active because "that's what we do for DR here" is not conservative, it's a budget misallocation. Every dollar and every hour of engineering time spent maintaining unnecessary standby infrastructure for a low-stakes system is a dollar and hour not spent improving the tier for a system where it actually matters (or testing that the important system's DR plan actually works — see [DR Planning, Testing & Runbooks](dr-planning-testing-and-runbooks.md)). Tiering should be deliberately uneven across a portfolio of systems, matching each system's actual criticality.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
