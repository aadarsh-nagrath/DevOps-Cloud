# Game Days and Organizational Practice

Chaos engineering isn't just a technical practice — it's also an organizational and human-readiness one. This file covers Game Days, blameless postmortems, and how mature organizations build the trust required to run chaos experiments in production at all.

---

## 1. What a Game Day Is

A **Game Day** is a scheduled, deliberate exercise where a team runs a chaos experiment together, often simulating an incident live, in real time, as a group. It's the human counterpart to the technical experiment design covered in [designing-chaos-experiments.md](designing-chaos-experiments.md) — the experiment itself might be identical, but a Game Day wraps it in a structured team exercise.

The distinction that matters: a Game Day is testing **two things at once**:
1. **The system's resilience** — does it actually survive the injected failure, same as any chaos experiment.
2. **The team's readiness** — does the on-call engineer know where to look, does the runbook actually work, does the team's communication/escalation process function under pressure, in a setting where a mistake doesn't turn into a real customer-facing outage.

A team can have a perfectly resilient system and still handle a real incident badly because nobody has practiced the human side — knowing which dashboard to check first, who to page, how to communicate status externally. Game Days train that muscle deliberately, the same way a fire drill trains evacuation behavior separately from testing whether the sprinklers work.

---

## 2. How to Run One

### Planning
- Pick a **realistic scenario** — something plausible given your actual architecture, ideally informed by a real near-miss or a genuine unknown ("we've never actually tested what happens if the read replica goes down" is a legitimate, common Game Day motivation).
- Use the experiment design document format from [designing-chaos-experiments.md](designing-chaos-experiments.md) §4 — steady state, hypothesis, blast radius, abort conditions — a Game Day is not exempt from that discipline just because it's a scheduled team event.
- Choose a low-stakes time window for less mature teams (business hours, low-traffic period, everyone available) — the "attended, bounded blast radius" pattern from the maturity progression in [designing-chaos-experiments.md](designing-chaos-experiments.md).

### Defining roles
| Role | Responsibility |
|---|---|
| **Facilitator** | Runs the exercise, injects the fault at the agreed time, keeps time, decides when to reveal information or escalate scenario complexity |
| **On-call responder(s)** | Play their real role — respond as if this were a genuine incident, using real runbooks/dashboards/paging tools |
| **Observer(s)** | Take notes on what worked, what was confusing, what took too long — this is the raw material for the retrospective |
| **Abort authority** | Someone explicitly empowered to call a real stop if the exercise starts causing genuine unintended impact — same authority as the abort conditions in the experiment design |

### Picking a realistic scenario and timeboxing
Set a hard time limit for the exercise itself (e.g., 60-90 minutes) — long enough to let the response play out realistically, short enough that it doesn't turn into an open-ended, fatiguing event. Timebox the fault injection itself too, exactly as in any chaos experiment (a `duration` field, an automatic revert) so the exercise can't accidentally run indefinitely if something goes wrong with the "let's stop now" signal.

### The retrospective — critically important
The exercise isn't done when the fault is reverted. The **blameless postmortem** immediately afterward is where most of the actual value gets captured:
- What did the steady-state metrics actually show, compared to the hypothesis?
- How long did detection take? How long did the responder take to identify the right runbook/dashboard?
- What was confusing, missing, or outdated in the runbook?
- What would have made this faster or clearer for whoever's on call next time it's a *real* incident?

The "blameless" part matters as a deliberate practice, not just a nice sentiment — if a Game Day retrospective turns into pointing out that the on-call engineer didn't know where to look, people will stop volunteering for or taking Game Days seriously. The failure being examined is a **systems/process** failure (missing runbook step, confusing dashboard, unclear escalation path) not a **person** failure. This repo likely has a more detailed, incident-specific postmortem process written up in a dedicated Incident Response folder elsewhere — the format there for handling a *real* production incident's postmortem is the same blameless discipline, just applied after a genuine outage rather than a scheduled drill.

---

## 3. Game Day vs Continuous/Automated Chaos

Both are valid chaos engineering practices — they represent different maturity levels and answer different questions, not competing approaches.

| | Game Day | Continuous/Automated Chaos |
|---|---|---|
| **Scheduling** | Scheduled in advance, run once (or periodically, e.g. quarterly) | Runs unattended, continuously (e.g., daily/hourly) in production |
| **Team presence** | Team is present, actively watching and responding | No one is specifically watching each individual run |
| **Safety posture** | Safe-to-abort, human-supervised at every step | Relies entirely on automated abort conditions/safety mechanisms (no human in the loop for any single run) |
| **Primary goal** | System resilience AND team/process readiness | System resilience only, verified continuously as regressions could otherwise creep back in |
| **Example** | A scheduled 90-minute exercise simulating an AZ failure, team on a call together | Chaos Monkey randomly terminating instances every business day, unattended |
| **Maturity level required** | Achievable relatively early — the "start small" stages from [designing-chaos-experiments.md](designing-chaos-experiments.md) | Requires deep trust that abort conditions/automated safety actually work correctly — a later-stage practice |

A mature organization typically runs **both**: Game Days for scenarios that need human judgment and team-readiness training (something new, something rare, something involving cross-team coordination), and continuous automated chaos for well-understood, already-validated failure modes where the goal is catching *regressions* (e.g., someone removed a retry policy and nobody noticed until continuous chaos caught it).

---

## 4. Building Organizational Buy-In Progressively

### Why teams resist chaos engineering initially

The most common objection, and a legitimate one: **fear of causing a real outage**. This isn't irrational — deliberately injecting failure into production genuinely can cause a real incident if done carelessly, and a team that's been burned once (or heard about another team being burned) will resist for a long time afterward. Other common resistance points:
- "We don't have time for this, we're busy shipping features."
- "Our system isn't resilient enough yet — we need to fix known issues first, not go looking for more."
- "What if this becomes an actual incident and it's blamed on the person who ran the experiment?"

None of these objections are unreasonable, and dismissing them doesn't build trust — addressing them concretely does.

### How mature organizations build trust

1. **Start in staging, with zero production risk**, and get genuinely good at running experiments there before ever touching production — the same "start small" progression as blast radius itself, but applied to organizational trust rather than technical scope.
2. **Pick the first production experiment very deliberately** — something with a small, well-understood blast radius, a strong hypothesis you're fairly confident will hold, and clear abort conditions. The first production chaos experiment should be close to a guaranteed success, specifically to build a track record.
3. **Publicize the success story** — when the first production experiment confirms the system handled the injected failure correctly, tell that story widely. "We tested database failover in production last week and it worked exactly as designed" is a genuinely persuasive argument to a skeptical team, in a way that abstract chaos engineering advocacy never is.
4. **Make abort mechanisms visibly trustworthy** — the "halt-all" pattern (seen in Gremlin, and achievable with any tool via automation tied to alarms as in the AWS FIS `stopConditions` example in [chaos-engineering-tools.md](chaos-engineering-tools.md)) needs to be something the team has *seen work*, not just something documented. Consider deliberately testing the abort mechanism itself as an early exercise.
5. **Expand scope only after each stage is boring** — "boring" is the actual signal of readiness to progress: if the last five experiments at a given blast radius produced no surprises and no incidents, that's when it's reasonable to expand, not before.
6. **Blameless culture has to be real, not aspirational** — see §2. If the first time an experiment reveals a genuine weakness there's any hint of blame directed at whoever wrote the fragile code or ran the experiment, buy-in for future experiments evaporates immediately. The org has to treat "we found a real weakness safely" as a categorical win, every time, without exception.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
