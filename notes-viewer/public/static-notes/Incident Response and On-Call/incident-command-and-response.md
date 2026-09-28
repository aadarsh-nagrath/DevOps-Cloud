# Incident Command and Response

The Incident Commander role, other incident roles, the incident channel/war room practice, a worked SEV1 timeline, and the mitigate-first mindset.

---

## 1. The Incident Commander (IC)

The **Incident Commander** coordinates the response. This is the single most misunderstood role for people new to formal incident response, so it's worth stating plainly what it is *not*: the IC is **not necessarily the most senior engineer, and not necessarily the person who knows the most about the broken system.**

The IC's job is coordination and communication:
- Keep the response organized — track what's been tried, what's in progress, who's investigating what.
- Delegate investigation to the engineers with the relevant system knowledge, rather than doing the debugging personally.
- Manage the timeline and drive it forward — periodically ask "where are we, what's the next step, who's blocked."
- Own stakeholder updates (or delegate that specifically to a Communications lead — see §2) so the engineers actually debugging the issue don't have to context-switch between deep technical investigation and writing status updates.
- Make the call on escalation, mitigation decisions, and eventually declaring the incident resolved.

This separation matters because debugging under pressure and managing a room under pressure are different cognitive modes, and doing both at once degrades both. An engineer deep in a stack trace who also has to pause every ten minutes to post a status update, field questions from a stakeholder in the channel, and decide whether to loop in another team is going to do a worse job at the actual debugging — and probably a worse job at the communication too, since it's getting whatever attention is left over. Splitting the roles lets each person actually focus.

In practice, for a small team or a low-severity incident, one person may end up wearing multiple hats out of necessity — that's fine. The point of naming the IC role explicitly is that as severity and team size scale up, the roles *can* and *should* split, and everyone understands what "IC" means when they hear it so a SEV1 doesn't start with a debate about who's in charge.

---

## 2. Other Common Incident Roles

| Role | Responsibility | Why it matters |
|---|---|---|
| **Incident Commander (IC)** | Coordination, delegation, timeline, decisions | See §1 |
| **Scribe / note-taker** | Captures a real-time timeline of what's happening as it happens — key actions, hypotheses tried, timestamps | Human memory during a stressful incident is genuinely unreliable; nobody accurately recalls "what time did we roll back" two hours later from memory. A good real-time timeline is essential input for the postmortem (see [postmortems-and-blameless-culture.md](postmortems-and-blameless-culture.md)) and often impossible to reconstruct well after the fact without one. |
| **Communications lead** | Owns external/customer-facing updates — status page, support team briefing — separate from internal technical coordination | Internal responders need to talk shorthand, fast, and sometimes speculatively ("might be the cache, checking now") — that's not language you want verbatim on a public status page. Separating the audiences lets internal coordination stay fast and informal while external updates stay calm, accurate, and appropriately paced. |
| **Subject-matter investigator(s)** | The engineer(s) actually debugging, delegated a specific area to investigate by the IC | Ideally focused purely on technical investigation, insulated from communication overhead by the roles above |

For a SEV3 or a very small team, several of these collapse into one or two people. For a SEV1 at any team of meaningful size, keeping them separate is what keeps the response from degrading into everyone talking over each other in one panicked thread.

---

## 3. The Incident Channel / War Room

Every incident of meaningful severity gets **one dedicated, real-time communication channel** — a chat channel, a video call, or both — created specifically for that incident and nothing else.

Centralizing communication in one place matters because the alternative — parallel side-conversations (a DM here, a hallway conversation there, a separate thread started by someone who didn't see the first one) — causes real damage during an active incident:
- Context gets lost or duplicated — two people investigate the same hypothesis independently because neither saw the other already ruled it out.
- The IC loses the ability to actually track state, because state is scattered across channels they may not even be in.
- The eventual postmortem timeline has gaps, because the scribe can only capture what happened in the channel they were watching.

The incident channel is also usually where the IC, scribe, and communications lead post their respective updates, so anyone joining mid-incident can scroll up and get full context in one place rather than having to ask "what's going on" and pull someone away from actual work to explain.

---

## 4. Worked Example: A SEV1 Timeline

A fictional but realistic walkthrough — an e-commerce checkout outage caused by a bad deploy — showing roles and communication in action from first alert to resolution.

```
14:02  Alert fires: checkout error rate > 1% (crossed 40% within a minute — clearly a fast burn).
       On-call engineer (Priya) is paged, acknowledges within 90 seconds.

14:04  Priya confirms real user impact (not a monitoring false positive) and declares a SEV1.
       Incident channel #inc-2847 created. IC assigned: Marcus (engineering manager, NOT
       the engineer who wrote the checkout service — chosen because he's available and
       experienced at running incidents, per §1).

14:06  Communications lead (Dana) posts initial status page update:
       "We're investigating an issue affecting checkout. Updates to follow."
       Scribe (Wei) starts logging the timeline in the incident channel.

14:08  Marcus asks in-channel: "Anything deploy in the last hour?" — pulls up the deploy
       log rather than guessing. Confirms checkout-service deployed a new version at 13:55.

14:15  Priya (now paired with the checkout-service on-call owner) confirms: the 13:55 deploy
       introduced a bug in payment-gateway request formatting. Root cause identified as
       a bad deploy — NOT yet the full "why did this pass review/testing" root cause,
       just enough to know the deploy is the trigger. That deeper analysis is postmortem
       work (see §5 and postmortems-and-blameless-culture.md), not right now.

14:17  Marcus makes the call: rollback, not forward-fix. Rollback initiated immediately
       (see §5 on mitigate-first). Does not wait for a patched fix to be written and
       reviewed — that would prolong customer impact for no good reason.

14:22  Error rate back to baseline (<0.1%). Priya confirms via dashboard and a manual
       checkout test.

14:24  Dana updates the status page: "The issue has been resolved. All systems operating
       normally." Internal channel updated in parallel.

14:25  Marcus formally declares the incident resolved. Notes in-channel that a postmortem
       will be scheduled, and that the deploy pipeline gap (how did this reach prod) is
       explicitly a postmortem topic, not something to solve right now under pressure.
```

Notice what didn't happen: nobody stopped to ask "why did this bug pass code review" or "why didn't our tests catch this" *during* the incident. Those are real, important questions — deferred deliberately to the postmortem, per §5 below.

---

## 5. Mitigate First, Root-Cause Later

The single most common mistake newer incident responders make is **conflating "find the root cause" with "stop the bleeding" as the same urgent task.** They are not the same task, and prioritizing the wrong one costs real customer impact time.

The immediate goal during an active incident is narrow and specific: **stop the customer-facing impact.** That's it. Not understand it fully, not fix it properly, not prevent recurrence — just stop it from actively hurting users right now. The tools for this are typically fast and blunt:
- **Rollback** to the last known-good version.
- **Failover** to a healthy region/backend.
- **Feature-flag kill switch** — disable the specific feature causing the problem without a full deploy cycle.

Rollback mechanics themselves — how to structure a deploy so rollback is fast and safe, the database/schema coupling trap that makes rollback harder than expected, why "no rollback plan until something breaks" is an anti-pattern — are already covered in [../Deployment/deployment-anti-patterns-and-checklist.md](../Deployment/deployment-anti-patterns-and-checklist.md); this file isn't re-explaining that mechanic, just where it fits in the incident timeline: as the *first* move, not something considered only after root-causing fails.

**Root cause analysis is important — it just happens after mitigation, not instead of it.** A deep, careful investigation into *why* the bad deploy happened, *why* it passed whatever checks existed, and *what structurally needs to change so it can't happen the same way again is exactly what a postmortem is for (see [postmortems-and-blameless-culture.md](postmortems-and-blameless-culture.md)) — done with the time and calm that a proper investigation deserves, not squeezed in while checkout is still actively broken and customers are actively losing money. Trying to fully root-cause *during* the incident usually means customers stay impacted longer for no corresponding benefit, since a rollback would have stopped the bleeding just as fast without needing the full explanation first.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
