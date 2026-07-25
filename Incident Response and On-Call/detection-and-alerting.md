# Detection and Alerting

Where incident signal comes from, what separates a good alert from a bad one, why alert fatigue is a serious failure mode, SLIs/SLOs/error budgets, and how paging escalation works.

---

## 1. Where Signal Comes From

An incident can be *detected* through several channels, roughly in order of how early/cheaply they catch a problem:

- **Metrics-based alerts from a monitoring stack** — a threshold or rate-of-change on a time series (error rate, latency, saturation) crosses a defined condition and fires an alert. The most common and most automatable detection path. In a meshed environment, a large share of this signal (request success rate, latency percentiles, per-service traffic) is available automatically with zero application instrumentation — see [../Service Mesh/observability-in-service-mesh.md](../Service%20Mesh/observability-in-service-mesh.md).
- **Synthetic checks / health checks** — proactive probes that simulate real usage on a schedule, independent of whether real traffic happens to be hitting the broken path right now. The mechanics of health checks (active vs. passive, endpoint design, failover behavior) are covered in depth in [../Load Balancing/health-checks-and-failover.md](../Load%20Balancing/health-checks-and-failover.md) — that file covers *how* a check works; this section is about what it means as an incident-detection signal specifically.
- **Automated anomaly detection** — statistical/ML-based systems that flag a metric deviating from its normal pattern without a human having pre-defined a fixed threshold. Useful for catching problems nobody thought to write an explicit alert rule for, at the cost of being noisier and harder to tune than a simple threshold.
- **User reports** — support tickets, social media, a customer emailing directly. This is the slowest and most expensive detection path (a human already experienced the problem before anyone on the engineering side knew), and its presence at all is usually a sign that automated detection has a coverage gap worth closing.
- **A team member noticing something while working on something else** — happens, not a strategy to rely on.

The general principle: the earlier and more automatically you detect a problem, the smaller the blast radius and user impact by the time a human gets involved. A monitoring stack with good coverage detects things in seconds; a support ticket means real users already suffered and cared enough to write in.

---

## 2. What Makes a Good Alert

The single biggest determinant of whether an alert is useful is whether it's **actionable and tied to actual user/business impact** — not tied to an arbitrary threshold that seemed reasonable when someone set it up once and never revisited.

### Bad: alerting on a cause-adjacent metric with an arbitrary threshold
```
ALERT: CPU usage > 80% on checkout-service
```
This might be completely fine. Plenty of services run at 80%+ CPU by design — that's efficient utilization, not a problem. An alert like this fires constantly during normal peak traffic, teaches the on-call engineer that this particular alert is noise, and gives zero information about whether users are actually affected.

### Good: alerting on the thing users actually experience
```
ALERT: checkout error rate > 1% (5xx responses / total checkout requests, 5-minute window)
```
This is **directly tied to user impact** — if it's firing, real checkout attempts are actually failing. It's unambiguous what "resolved" looks like (the rate drops back under 1%), and there's no interpretation required about whether it matters.

The general test for any alert: *if this fires and I wake up, will I be able to tell within 30 seconds whether users are actually being hurt right now?* If the answer requires additional investigation just to determine whether it's worth caring about, it's the wrong kind of alert to page on — it might still be worth a dashboard or a low-priority ticket, just not a 3am page.

---

## 3. Alert Fatigue

Alert fatigue is not a minor annoyance — it's a well-documented, serious failure mode with a specific mechanism: **too many low-value alerts trains the on-call engineer to reflexively ignore, snooze, or delay-react to alerts in general** — including, critically, the one alert that actually matters when it eventually fires. The brain doesn't distinguish "this specific alert has cried wolf 40 times" from "alerts from this system in general are noise" nearly as cleanly as you'd hope; fatigue generalizes.

This is the same underlying dynamic as literally alerting on CPU>80% and training everyone to ignore that pager — except once trained, that ignoring reflex doesn't stay contained to the one bad alert. A team that pages on noisy, non-actionable conditions is actively degrading its own ability to respond to real incidents, not just wasting the on-call engineer's sleep.

**Practical response**: every alert that fires and turns out not to require action should be treated as a bug in the alerting configuration, not tolerated as background noise. Track a "false positive" or "did not require action" rate per alert rule the same way you'd track any other quality metric, and prune/retune aggressively. An alerting system with fewer, higher-signal alerts is strictly better than one with more coverage that nobody trusts.

---

## 4. SLIs, SLOs, and Error Budgets

These three terms are related but distinct, and conflating them is common:

| Term | Meaning | Example |
|---|---|---|
| **SLI** (Service Level Indicator) | The actual metric you measure — a number, continuously observed | Request latency; the proportion of requests returning a successful status code |
| **SLO** (Service Level Objective) | The target you've set for that metric | 99.9% of requests complete under 300ms, measured over a rolling 30-day window |
| **Error budget** | The amount of "badness" you're allowed before you've breached the SLO | If the SLO is 99.9% success, the error budget is the other 0.1% — a fixed, spendable allowance of failed/slow requests over the window |

An error budget reframes reliability from a binary pass/fail into something you can spend deliberately: if you have budget left, you can afford to take some risk (ship a risky change, run an experiment); if you're close to exhausting it, that's a signal to slow down and prioritize stability work over new features. This is also a natural, non-adversarial way to balance a "ship fast" team against an "keep things stable" team — the budget is the shared, objective arbiter.

### Error-budget-burn-rate alerting — a smarter, less noisy signal

Alerting on a raw SLO breach ("we're now below 99.9% over the last 30 days") is a *lagging* indicator — by the time the 30-day rolling average has actually dropped below target, a lot of damage is already done, and the alert doesn't distinguish between a severe fast-moving problem and something that's technically breaching but barely.

**Burn rate** measures *how fast* you're consuming your error budget right now, relative to a sustainable pace. This lets you alert much faster on severe problems while staying quiet on minor, sustainable degradation.

**Worked example**: say your error budget for the month allows 0.1% of requests to fail. That budget, spent evenly, would last the full 30 days.

- **Fast burn**: if the current error rate would exhaust the *entire month's* error budget in about 1 hour, that's a severe, high-urgency problem — page immediately. This is a burn rate of roughly 720x the sustainable pace (30 days / 1 hour ≈ 720).
- **Slow burn**: if the current error rate would exhaust the budget over, say, 10 days instead of 30, that's real degradation worth knowing about, but not an emergency — a ticket or a lower-urgency notification is appropriate, not a 3am page.

Both scenarios can correspond to the exact same instantaneous error rate depending on how long they've been happening — burn rate alerting is specifically about *rate of consumption*, which is what lets it distinguish "brief severe spike, will burn the whole budget by lunch" from "mild, ongoing degradation, we have weeks to address it" using the same underlying SLI. Most modern alerting on SLOs (e.g., Google's SRE workbook multi-window, multi-burn-rate approach) uses exactly this pattern: a short time window at a high burn-rate threshold for fast pages, a longer window at a lower threshold for slower-building problems.

---

## 5. Routing and Escalation

Detecting a problem and getting the right human's attention on it are two different steps — an alert that fires into a channel nobody's watching, or pages someone who's asleep with no follow-up, has effectively not been detected at all from a response standpoint.

- **On-call schedule**: defines who is the primary responder at any given moment. See rotation design in [on-call-practices-and-sustainability.md](on-call-practices-and-sustainability.md) §1.
- **Escalation policy**: defines what happens if the primary on-call doesn't acknowledge within a defined window — e.g., "page primary; if not acknowledged within 5 minutes, page secondary; if not acknowledged within another 5 minutes, page the team lead and escalate to a phone call." This prevents a single unavailable/asleep responder from silently stalling the entire detection-to-response pipeline.
- **Paging tools** (conceptually — PagerDuty, Opsgenie, and similar): these tools own the routing/escalation logic described above, typically integrating with the monitoring stack on one side (receiving alert webhooks) and phone/SMS/push notification on the other (actually waking someone up, with escalation timers built in). The specific tool matters less than having *some* system that enforces "an unacknowledged page doesn't just sit there" rather than relying on a human to notice they got paged.

Acknowledgment time here is exactly what **MTTA** (Mean Time To Acknowledge, defined in [incident-response-overview.md](incident-response-overview.md) §4) measures — a high MTTA is often an escalation-policy problem (too long before secondary is paged) rather than a "the on-call engineer is slow" problem, worth checking before assuming the latter.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
