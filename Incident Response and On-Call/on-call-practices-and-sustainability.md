# On-Call Practices and Sustainability

Rotation design, compensation and fairness, why runbooks make on-call survivable, reducing on-call burden as an explicit engineering goal, and handoff practice between rotations.

---

## 1. On-Call Rotation Design

### Schedule structure

- **Weekly vs. daily rotations**: a weekly rotation (one person on-call for a full 7-day stretch) is simpler to plan around and gives responders more continuity within a rotation, but concentrates the burden — if a bad week happens, one person absorbs all of it. A daily rotation spreads risk more evenly but means more frequent handoffs (see §4) and less continuity if an issue spans multiple days.
- **Primary / secondary on-call**: the primary is paged first; if they don't acknowledge within the escalation window (see [detection-and-alerting.md](detection-and-alerting.md) §5), the secondary is paged next. The secondary also serves as a real backstop if the primary is genuinely unreachable (phone dead, transit, family emergency) — without one, an unlucky moment of unavailability for a single person becomes a full detection failure.
- **Follow-the-sun coverage**: for globally distributed teams, on-call responsibility rotates by timezone/region so that "on-call" always corresponds to someone's normal working hours somewhere, rather than any single team perpetually absorbing overnight pages. This requires genuinely distributed team presence to work — bolting a "follow-the-sun" label onto a team that's actually concentrated in one timezone doesn't achieve the goal.

### Worked example: a simple weekly rotation for a small team

A 5-person team, weekly primary/secondary rotation:

```
Week 1: Primary = Priya   Secondary = Marcus
Week 2: Primary = Marcus  Secondary = Wei
Week 3: Primary = Wei     Secondary = Dana
Week 4: Primary = Dana    Secondary = Sam
Week 5: Primary = Sam     Secondary = Priya
(cycle repeats)
```

Each person is primary once every 5 weeks and secondary once every 5 weeks — meaning at most 2 out of every 5 weeks carry any on-call responsibility at all for a given person, with 3 weeks completely off. This kind of explicit, visible rotation is what makes fairness auditable (see §2) — anyone can look at the schedule and see it isn't quietly always landing on the same one or two people.

---

## 2. Compensation and Workload Fairness

Being paged at 3am has a genuine human cost — interrupted sleep, elevated stress, the anxiety of being on-call even during hours nothing actually fires. This is a real, legitimate topic, not a minor inconvenience to shrug off. **Burnout from poorly-designed on-call rotations is a well-documented, serious problem** that directly affects retention, not an abstract HR concern separate from engineering effectiveness — an exhausted, resentful on-call engineer makes worse decisions during an actual incident, on top of the personal cost to them.

Two dimensions matter in practice:

- **Compensation**: some organizations pay a flat stipend for carrying the pager regardless of whether it goes off, and/or offer compensatory time off for time spent actively responding to a page (especially overnight). This isn't universal, but it's a legitimate and increasingly common practice — it explicitly acknowledges that being on-call has a cost even in a quiet week, since the *availability* itself is what's being asked for, not just the response time when something happens.
- **Fairness**: rotation load should actually rotate. A common anti-pattern is the same one or two senior engineers ending up as the de facto on-call for a system because they're the ones who understand it best, while everyone else stays comfortably uninvolved. This might look efficient in the short term (they *are* the fastest responders) but it's corrosive over time — those engineers burn out, leave, or become bottlenecks, and nobody else on the team ever builds the operational knowledge needed to cover for them. Rotation fairness — genuinely spreading the load, and using unfamiliarity with a system as a reason to build documentation/runbooks rather than a reason to permanently exclude someone from the rotation — matters directly for both individual retention and the team's long-term resilience.

---

## 3. Runbooks and Documentation

An on-call engineer facing an unfamiliar failure mode at 3am needs a **runbook** — a written, step-by-step procedure for diagnosing and mitigating a specific known issue — not tribal knowledge that only exists in one senior engineer's head. This is what actually makes on-call *survivable* for anyone who isn't the system's original author: the alternative is either waking up someone else who does know (defeating the point of having more than one person on rotation) or guessing under pressure.

A good runbook entry for a given alert typically includes: what the alert means in plain language, what the likely causes are, the specific commands/dashboards to check first, the known mitigation steps (and their risks), and when to escalate rather than keep trying alone. Runbooks are living documents — every incident that reveals a gap ("nobody knew how to do X" or "the runbook said Y but that was outdated") is itself an action item for the postmortem (see [postmortems-and-blameless-culture.md](postmortems-and-blameless-culture.md) §2) to update or create the relevant runbook entry.

This folder focuses on runbooks in the context of everyday production incident response. For disaster-scale scenarios specifically — full region loss, data restoration, RTO/RPO-driven recovery procedures — a dedicated Backup & Disaster Recovery folder elsewhere in this repo likely covers DR-specific runbooks in more depth; the concepts here (a written procedure beating tribal knowledge) apply equally there, just at a larger blast radius.

---

## 4. Reducing On-Call Burden as an Explicit Goal

**Every recurring page for the same known issue is a bug or a gap that should get fixed — not something to just get used to tolerating.** A team that pages three times a week for the same flaky dependency and treats that as "just how it is" has normalized a problem that's actively degrading on-call sustainability, and normalizing it removes the pressure to ever actually fix it.

The practical fix: **track pages per week/month as a real, trackable health metric for the system** — the same way you'd track error rate or latency. A rising or persistently high page volume, especially concentrated on a small number of repeat-offender alerts, is a direct, quantifiable signal that reliability work needs to be prioritized, and it's a much more concrete argument for that prioritization than "on-call has felt rough lately." Some teams review this explicitly on a regular cadence (e.g., "pages this month, broken down by alert, with repeat offenders flagged") specifically so recurring pain doesn't stay anecdotal and easy to deprioritize against feature work — the same dynamic as the follow-up-item trap described in [postmortems-and-blameless-culture.md](postmortems-and-blameless-culture.md) §3, just applied to on-call load instead of postmortem action items specifically.

Reducing genuine on-call burden usually comes from a small set of levers: fixing the underlying flaky/recurring issue (the highest-leverage fix), automating a known manual mitigation so it doesn't need a human at all, or improving the alert itself so it's not firing more often than the underlying problem actually warrants (see alert quality and fatigue in [detection-and-alerting.md](detection-and-alerting.md) §2–3).

---

## 5. On-Call Handoff Practice

A brief, structured handoff between one on-call rotation and the next prevents context from silently getting lost — the outgoing on-call engineer knows things the incoming one doesn't yet, and without a deliberate handoff, that knowledge just doesn't transfer.

A good handoff, whether written or a short synchronous conversation, covers:
- **What's currently flaky** — anything that's been intermittently alerting or behaving oddly but hasn't risen to a full incident, so the incoming on-call isn't caught completely off guard by something the outgoing one already had context on.
- **Any active or "watching" issues** — anything not fully resolved, including a postmortem action item that's in progress, or a known degraded state being monitored.
- **Any planned risky deploys or changes coming up** during the next person's shift — so a page that fires right after a known risky change isn't investigated from scratch; the incoming on-call already has the most likely first hypothesis.

Skipping the handoff is a common corner-cutting move on a busy week, but it directly increases the incoming on-call's time-to-diagnose for anything related to what got skipped — the cost shows up later, during an actual page, as slower response rather than as an obviously missing step at handoff time.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
