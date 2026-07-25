# Incident Response Overview

What counts as an incident, why a defined response process matters, the incident lifecycle, and the vocabulary used throughout this folder.

---

## 1. What Is an "Incident"?

An **incident** is any unplanned event that degrades or interrupts a service — the range is wide. It spans everything from a minor, barely-user-visible performance blip (checkout is 200ms slower than usual) to a full outage (the site returns 500s for every user). Not every incident is a fire; treating them all as equally urgent burns people out and trains everyone to stop trusting the alarm (see the alert fatigue discussion in [detection-and-alerting.md](detection-and-alerting.md)).

Because incidents vary so much in severity, most teams categorize them with **severity levels** — commonly `SEV1`/`SEV2`/`SEV3` (or `P1`/`P2`/`P3`) — so that the *urgency and resourcing of the response* is proportional to actual impact, not to how alarming the first alert sounds or who happened to notice it.

### Worked Example: Severity Levels for a Hypothetical E-Commerce Service

| Severity | Definition | Example | Response expectation |
|---|---|---|---|
| **SEV1 / P1** | Complete outage or critical business function fully broken, affecting most/all users | Checkout is down site-wide — no orders can be placed; payment processing is completely failing | Immediate, all-hands response; Incident Commander declared; status page updated within minutes; work continues until mitigated, including overnight |
| **SEV2 / P2** | Significant degradation or a major feature broken for a subset of users, but the core service is still usable | Checkout works but is failing for users paying with one specific card network; search is returning stale/incorrect results for 15% of queries | Urgent response during business hours, on-call paged outside them; may or may not need a formal IC depending on team size; fix within hours, not days |
| **SEV3 / P3** | Minor issue, workaround exists, or impact is limited/cosmetic | A promotional banner renders incorrectly on one device size; a non-critical internal admin report is delayed by an hour | Handled as normal priority work, typically during business hours, no paging |

The exact definitions differ by company, but the pattern is consistent: **severity is defined by user/business impact, not by how technically severe the underlying bug is.** A serious-looking stack trace in the logs that never actually reaches a user is not a SEV1. A "trivial" one-line config typo that takes down checkout for everyone is.

---

## 2. Why a Defined Process Matters

Without a defined incident response process, every incident is handled ad hoc: whoever happens to notice it first decides how urgent it is, whether to loop other people in, how to communicate to stakeholders, and when to call it resolved. This has real, compounding costs:

- **Response quality is a lottery.** If the person who happens to be online at 2am has deep context on the failing system, the incident gets handled well. If not, it doesn't — and there's no consistent process to compensate for that.
- **It doesn't scale.** Ad hoc response works passably when a company is small enough that a handful of people know the entire system. It falls apart as the system and team grow and no single person has full context anymore.
- **It burns people out.** Without defined roles, the same few "heroes" end up doing everything during every incident — the technical investigation *and* the stakeholder updates *and* the timeline tracking — because nobody delegated. That's a fast path to burnout, and it also makes response slower, since one person is context-switching between debugging and communicating instead of either being done well. See [incident-command-and-response.md](incident-command-and-response.md) for how role separation fixes this directly.
- **Nothing gets learned.** Without a consistent postmortem practice, the same class of incident recurs, because nobody structurally addressed what allowed it to happen. See [postmortems-and-blameless-culture.md](postmortems-and-blameless-culture.md).

A defined process doesn't make incidents not happen — it makes the response to them predictable, delegable, and something the *organization* gets better at over time, rather than something that depends entirely on individual heroics.

---

## 3. The Incident Lifecycle

At a high level, every incident moves through the same five phases, regardless of severity (though for a SEV3, several phases might take seconds and involve one person; for a SEV1, each phase is a distinct, deliberate step involving several people).

```
Detect -> Triage -> Respond / Mitigate -> Resolve -> Postmortem / Learn
```

| Phase | What happens | Covered in |
|---|---|---|
| **Detect** | Something signals that a problem exists — an alert fires, a synthetic check fails, a user reports an issue | [detection-and-alerting.md](detection-and-alerting.md) |
| **Triage** | Assess severity, decide if/how to escalate, assign an Incident Commander for anything significant | [incident-command-and-response.md](incident-command-and-response.md) |
| **Respond / Mitigate** | Stop the customer-facing impact — rollback, failover, kill switch — this is distinct from finding the deep root cause, which comes later | [incident-command-and-response.md](incident-command-and-response.md) |
| **Resolve** | Confirm the mitigation actually worked (metrics back to normal, user impact gone) and formally close the incident | [incident-command-and-response.md](incident-command-and-response.md) |
| **Postmortem / Learn** | Reconstruct the timeline, identify contributing factors, assign owned follow-up actions so it's structurally less likely to recur | [postmortems-and-blameless-culture.md](postmortems-and-blameless-culture.md) |

The whole cycle is also directly shaped by who's actually available to respond and how sustainable that rotation is — see [on-call-practices-and-sustainability.md](on-call-practices-and-sustainability.md).

---

## 4. Glossary

| Term | Meaning |
|---|---|
| **MTTA** (Mean Time To Acknowledge) | Average time from an alert firing to a human acknowledging it (i.e., confirming someone is looking at it). A high MTTA usually points to alert routing/escalation problems, not necessarily a slow team — see [detection-and-alerting.md](detection-and-alerting.md) §5. |
| **MTTD** (Mean Time To Detect) | Average time from when a problem actually *started* to when it was detected (alert fired, or someone noticed). Depends heavily on monitoring/alert coverage quality. |
| **MTTR** (Mean Time To Resolve/Recover) | Average time from detection to the incident being resolved (customer impact stopped). The metric most commonly used to judge incident response effectiveness overall — note it can be gamed by mitigating fast without truly fixing anything, which is why it's tracked alongside recurrence rate, not in isolation. |
| **Incident Commander (IC)** | The person coordinating the response — not necessarily the most senior or most technically knowledgeable person on the call. See [incident-command-and-response.md](incident-command-and-response.md) §1. |
| **Blast radius** | How much of the system/user base is actually affected by a given failure or change. A core concept for both assessing incident severity and for deciding deployment strategy blast radius (see [../Deployment/deployment-anti-patterns-and-checklist.md](../Deployment/deployment-anti-patterns-and-checklist.md)). |
| **War room / incident channel** | A dedicated, centralized real-time communication channel (chat channel, video call, or both) created for the duration of a single incident, so response coordination happens in one place instead of scattered side-conversations. See [incident-command-and-response.md](incident-command-and-response.md) §3. |
| **Error budget** | The amount of acceptable "badness" (failed requests, downtime) a service is allowed before it breaches its SLO. See [detection-and-alerting.md](detection-and-alerting.md) §3. |
| **Runbook** | A written, step-by-step procedure for diagnosing/resolving a specific known failure mode, so response doesn't depend on one person's memory. See [on-call-practices-and-sustainability.md](on-call-practices-and-sustainability.md) §3. |

For disaster-scale events specifically (region loss, full data-center failure, data restoration) — as opposed to the everyday production incidents this folder focuses on — a dedicated Backup & Disaster Recovery folder elsewhere in this repo covers DR-specific runbooks, RTO, and RPO in more depth.

---

## 5. Contents of This Folder

| File | Covers |
|---|---|
| [incident-response-overview.md](incident-response-overview.md) | This file — severity levels, why process matters, the lifecycle, glossary |
| [detection-and-alerting.md](detection-and-alerting.md) | Where signal comes from, good vs bad alerts, alert fatigue, SLIs/SLOs/error budgets, escalation |
| [incident-command-and-response.md](incident-command-and-response.md) | The IC role, other incident roles, the incident channel, a worked SEV1 timeline, mitigate-first mindset |
| [postmortems-and-blameless-culture.md](postmortems-and-blameless-culture.md) | Blameless culture philosophy, what a good postmortem contains, the follow-up-item trap, timing, a reusable template |
| [on-call-practices-and-sustainability.md](on-call-practices-and-sustainability.md) | Rotation design, compensation and fairness, runbooks, reducing on-call burden, handoff practice |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
