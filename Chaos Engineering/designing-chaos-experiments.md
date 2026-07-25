# Designing Chaos Experiments

How to structure a real chaos experiment — steady state, hypothesis, blast radius, fault categories, and a fully worked experiment design document.

---

## 1. The Scientific-Method Structure

A chaos experiment is not "let's kill something and see what happens." It follows the same structure every time:

```
1. Define a measurable steady-state metric — BEFORE you start
   e.g. "checkout success rate stays above 99.5%"
   e.g. "p99 API latency stays under 300ms"
   e.g. "order processing throughput stays above 500 req/s"
        |
        v
2. Form a hypothesis
   "If the primary DB read replica becomes unreachable,
    the app will fail over to the secondary replica within 5s
    and checkout success rate will remain above 99.5%."
        |
        v
3. Design the smallest possible experiment that can test the hypothesis
   - smallest blast radius that still produces a meaningful signal
   - clear abort conditions defined in advance
        |
        v
4. Run it, and measure the steady-state metric throughout
        |
        v
5. Learn
   - hypothesis held -> real confidence gained, document it
   - hypothesis failed -> you just found a real weakness safely,
     before it found you during a real incident
```

The critical discipline is step 1 happening **before** step 3. If you don't know what "healthy" looks like in hard numbers, you have no way to tell whether your experiment actually broke anything, or whether an observed dip was even caused by your experiment at all versus unrelated noise.

A weak hypothesis ("the system should be resilient") is not a hypothesis — it can't be disproven. A good hypothesis is specific, measurable, and falsifiable: *this specific metric will stay above this specific threshold, for this specific failure, within this specific time window.*

---

## 2. Start Small, Expand Blast Radius Gradually

The single most important operational discipline in chaos engineering: **never start with "kill everything in prod" as your first experiment.** Confidence is built incrementally, in both the system's resilience and the team's trust in the practice itself.

```
Maturity progression (each stage only after the previous one is boring/reliable):

Stage 1: Non-production / staging environment
  -> validate the mechanism works and the hypothesis is even plausible,
     with zero risk to real users

Stage 2: Production, smallest possible blast radius
  -> a single non-critical instance, or a tiny % of production traffic,
     during low-traffic hours, with an engineer watching dashboards live

Stage 3: Production, wider blast radius
  -> a larger % of traffic/instances, business hours, still bounded
     and abortable

Stage 4: Production, realistic/large-scale failure
  -> e.g. simulate a full AZ outage (Netflix's "Chaos Gorilla" scale)
     — only attempted once smaller experiments have built real
     confidence AND organizational trust

Stage 5: Continuous, automated chaos
  -> fault injection running unattended, continuously, in production
     (e.g. a scheduled Chaos Monkey) — the highest maturity level,
     see game-days-and-organizational-practice.md for the distinction
     between this and a scheduled Game Day
```

Skipping stages is how chaos engineering gets a bad reputation inside an organization — one poorly-scoped experiment that causes a real customer-facing outage can set back adoption by years. Blast radius discipline is not overcaution, it's what makes the practice sustainable.

### Concrete blast-radius controls

- **Percentage of traffic**: inject the fault only for a small % of requests (e.g., via a service mesh fault rule with `percentage: 5`), not 100%.
- **Percentage of instances/pods**: target one pod out of twenty, not the whole Deployment.
- **Single AZ/region at a time**, never all simultaneously.
- **Time-boxing**: run for a fixed, short duration (minutes, not hours) and auto-revert.
- **Business hours + engineers watching**: never run a novel experiment overnight or unattended until it's been run successfully, attended, multiple times.
- **Abort conditions defined in code/tooling**, not just "someone will notice and stop it manually" — see the worked example in §4.

---

## 3. Categories of Faults Worth Testing

| Category | Example faults | What it validates |
|---|---|---|
| **Network** | Latency injection, packet loss, DNS failure, connection resets | Timeout configuration, retry logic, DNS fallback behavior |
| **Infrastructure** | Instance termination, pod eviction, AZ failure, region failure | Auto-scaling, self-healing (Kubernetes reconciliation), failover, multi-AZ/region redundancy |
| **Resource** | CPU exhaustion, memory pressure/OOM, disk fill, disk I/O saturation | Resource limits/requests correctness, autoscaling triggers, graceful degradation under load |
| **Dependency** | A downstream service returns 5xx errors, times out, or returns malformed data | Circuit breaking, retries, fallback/cached responses, graceful degradation |

### Network and dependency faults in a service mesh

If you're running a service mesh, the dependency-failure category above is exactly what fault injection at the mesh layer is built for — you don't need a separate chaos tool to make a downstream service "fail" from the caller's perspective; the mesh can inject the failure directly at the traffic-routing layer. See the `fault` block worked example in [../Service Mesh/traffic-management.md](../Service%20Mesh/traffic-management.md) — injecting a fixed delay or an error percentage into a `VirtualService` is literally how you'd run this category of experiment in a meshed environment, and it composes directly with the retry/timeout/circuit-breaking configuration described in [../Service Mesh/resilience-patterns.md](../Service%20Mesh/resilience-patterns.md) — those are the resilience mechanisms you're testing when you inject a dependency fault.

### Infrastructure faults and Kubernetes self-healing

Instance/pod-level infrastructure faults are testing exactly the reconciliation behavior demonstrated in [../Kubernetes/K-pods.md](../Kubernetes/K-pods.md)'s production simulation — a chaos experiment that kills a pod is deliberately, hypothesis-first, exercising the same self-healing loop that file shows happening "by accident" when a pod crashes. The difference is intent: a chaos experiment defines a hypothesis and measures against it; an accidental crash is just an incident.

---

## 4. Worked Example: Full Experiment Design Document

**Scenario**: What happens if our primary database read replica becomes unreachable?

```markdown
# Chaos Experiment: Primary Read Replica Unreachable

## Steady State (measured for 10 minutes before the experiment, as baseline)
- Checkout success rate: >= 99.5%
- API p99 read latency: <= 300ms
- Read replica connection pool error rate: 0%

## Hypothesis
If the primary read replica becomes unreachable, the application's
connection pooler will detect the failure within 5 seconds and fail
over reads to the secondary replica. Checkout success rate will remain
>= 99.5% throughout the experiment, with a transient p99 latency spike
not exceeding 1.5s during the failover window (should recover to
baseline within 15s of failover completing).

## Blast Radius
- Environment: production
- Scope: ONLY the primary read replica in us-east-1 (secondary replicas
  in us-east-1 and other regions remain untouched and continue serving)
- Traffic affected: read-only queries only (writes are unaffected —
  this replica is not in the write path)
- Duration: 5 minutes maximum, hard-stopped regardless of outcome

## Method
1. Announce the experiment in #incidents-watch 15 minutes prior
2. Confirm on-call engineer is actively watching the dashboard below
3. Capture 10 minutes of steady-state baseline metrics
4. Use AWS FIS (see chaos-engineering-tools.md) to simulate replica
   unreachability: revoke network access from the app's security group
   to the primary read replica's ENI for exactly 5 minutes
5. Watch the dashboard continuously for the duration of the experiment
6. At 5 minutes, FIS automatically restores network access
   (this is the experiment's built-in, time-based abort mechanism)

## Abort Conditions (any ONE of these triggers an immediate manual abort,
## in addition to the automatic 5-minute time-based stop above)
- Checkout success rate drops below 98% for more than 30 consecutive seconds
- API p99 latency exceeds 3s for more than 30 consecutive seconds
- Any 5xx error rate spike above 1% sustained for 15+ seconds
- On-call engineer's judgment call, no threshold required — anyone
  watching can call an abort at any time, no approval needed

## Rollback Plan
- Automatic: FIS restores network access to the replica after 5 minutes
- Manual abort: revert the FIS network ACL change via the FIS console
  or `aws fis stop-experiment` — takes effect within seconds
- No data changes are made by this experiment (read-only replica,
  no schema/data touched) — rollback is purely a network-access revert,
  nothing to reconcile afterward

## Dashboard to Watch
[link to steady-state metrics dashboard: checkout success rate,
p99 latency, replica connection pool errors, 5xx rate]

## Expected Outcome vs What We're Actually Testing
We expect the connection pooler's health-checking and automatic
failover (already configured) to handle this transparently. This
experiment exists to VERIFY that assumption is actually true in
production, under real traffic, rather than trusting it because
"that's what the config says it should do."

## Postmortem
[filled in after the experiment — see game-days-and-organizational-practice.md
for the blameless postmortem format used]
```

This document is the artifact that separates chaos engineering from recklessness — every field forces a decision that has to be made *before* the failure is injected, not improvised while it's happening.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
