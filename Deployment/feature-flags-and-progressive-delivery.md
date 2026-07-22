# Feature Flags & Progressive Delivery

Decouple **deploying code** from **releasing a feature**. Ship the new code to 100% of production behind a flag that defaults to "off" (or "old behavior"), then control who sees the new behavior — gradually, by segment, or instantly — entirely through configuration, without another deploy.

---

## 1. The Core Idea: Deploy ≠ Release

Every other strategy in this folder controls risk by controlling **which version of the deployed artifact** serves traffic (infrastructure-level control: instances, target groups, service mesh routing). Feature flags take a different axis entirely: **one deployed version, with runtime-configurable behavior inside it.**

```
Traditional deploy:  new code merged --> built --> deployed --> live for everyone (all at once, tied to the deploy)

Feature-flagged:      new code merged --> built --> deployed --> flag OFF (dark) --> flag on for 1% --> 10% --> 100%
                                                                   ^ all of this is config changes, zero redeploys
```

This decoupling is what unlocks:
- **Instant rollback with no redeploy** — flip the flag off; the old code path is still right there in the running binary.
- **Trunk-based development** — merge incomplete/in-progress features to main behind a flag, without a long-lived feature branch, because the flag keeps it invisible to users until ready.
- **Targeted rollout** by user segment (internal employees → beta users → 10% of free-tier → everyone), independent of infrastructure topology.
- **Kill switches** for operational safety — instantly disable an expensive/misbehaving feature under load without any deployment pipeline in the loop.

---

## 2. Types of Feature Flags

| Flag type | Lifespan | Purpose |
|---|---|---|
| **Release flag** | Short (days–weeks), removed after full rollout | Gate a new feature during progressive rollout; deleted once at 100% and stable |
| **Experiment flag** | Medium (weeks), removed after test concludes | Power an A/B test — see [ab-testing-deployment.md](ab-testing-deployment.md) |
| **Ops / kill-switch flag** | Long-lived, sometimes permanent | Ability to instantly disable a feature/dependency under operational stress (e.g., disable a non-critical third-party integration during an incident) |
| **Permission / entitlement flag** | Permanent | Gate features by plan tier, license, or user role — not really a "deployment" flag, more a product/business rule, but uses the same infrastructure |

Release and experiment flags are temporary by design — the biggest operational risk with feature flags is letting them accumulate indefinitely (see §5).

---

## 3. Progressive Delivery: Flags as a Rollout Mechanism

"Progressive delivery" is the general term for combining flags with staged, metrics-gated rollout — essentially applying canary-style discipline to a flag instead of to infrastructure:

```
Ring 0: Internal employees only           (validate nothing is obviously broken)
Ring 1: Opt-in beta users                 (validate with real external users, small blast radius)
Ring 2: 1% of general population           (statistically meaningful, still small)
Ring 3: 10% -> 50% -> 100%                (gradual ramp, same metric-gating discipline as canary)
```

The mechanism differs from canary/blue-green (it's a config/flag evaluation inside one running version, not infrastructure-level traffic routing to *different* deployed versions), but the *discipline* is the same: ramp gradually, watch metrics, roll back instantly if something looks wrong.

---

## 4. Example: Flag Evaluation in Application Code

```javascript
// Using a flag SDK (LaunchDarkly / Split / GrowthBook / homegrown all follow this shape)
const showNewCheckout = flagClient.isEnabled('new-checkout-flow', {
  userId: currentUser.id,
  attributes: { plan: currentUser.plan, country: currentUser.country },
});

if (showNewCheckout) {
  return renderNewCheckout();
} else {
  return renderLegacyCheckout();
}
```

```yaml
# Example flag targeting rule (conceptual — exact schema varies by platform)
flag: new-checkout-flow
default: false
rules:
  - if: user.email ends_with "@mycompany.com"
    serve: true                     # dogfood internally first
  - if: user.segment == "beta"
    serve: true
  - rollout:
      true: 10%                    # 10% of remaining users get the new flow
      false: 90%
```

### Server-side vs client-side flags
- **Server-side evaluation**: flag logic runs on the backend; the client just receives the resulting behavior/data. Safer — flag rules and unreleased feature code never reach the client bundle.
- **Client-side evaluation**: flag SDK runs in the browser/mobile app. Faster to toggle UI without a backend round-trip, but the flag rules (and sometimes unreleased feature code paths) are visible in client-side bundles/network traffic — be mindful of shipping sensitive logic behind a client-evaluated flag.

## 5. Operational Discipline (this is where most teams struggle)

- **Every flag needs an owner and an expiry plan.** A flag with no removal plan becomes permanent branching complexity — the codebase accumulates `if (flag) { ... } else { ... }` branches indefinitely, and eventually nobody remembers which flags are safe to remove.
- **Flag debt cleanup should be a normal, scheduled part of engineering work**, not an afterthought — many teams fail a build or flag a PR if a release-type flag has been at 100% for more than N weeks without being removed.
- **Flags multiply combinatorially.** Ten independent flags is 2^10 possible runtime states — most untested. Keep the number of *simultaneously active* release flags small, and be wary of flags that interact (two flags that both alter the same code path).
- **Flag evaluation must be fast and available.** If your flag service is down, does the app fail open (default behavior) or fail closed (errors)? Design for the flag backend being unavailable — cache the last known flag state locally, with a safe default.
- **Testing needs to cover both flag states**, not just "flag on" in a feature branch and never again — regressions in the "flag off" / legacy path are common because it stops getting attention once the new path ships.

---

## 6. Feature Flags vs Canary vs Blue-Green — When Each Applies

| | Feature Flags | Canary | Blue-Green |
|---|---|---|---|
| Control axis | Application logic branching | Infrastructure traffic routing | Infrastructure traffic routing |
| Granularity | Per-user/segment, extremely fine | Per-request percentage | All-or-nothing |
| Needs new infra to roll out? | No — same deployed artifact | Often yes (mesh, weighted routing) | Yes (duplicate environment) |
| Good for | Frontend features, gradual product rollout, kill switches | Backend service releases, infra-level risk mitigation | High-stakes releases needing instant full rollback |
| Rollback mechanism | Flip flag (instant, no deploy) | Shift weight to 0% (fast, may need automation) | Flip router back to other environment (instant) |

In mature engineering orgs, these are **complementary, not competing**: a backend service change goes through canary/blue-green to validate the infrastructure-level release is safe, while a user-facing feature built on top of it is separately gated by a flag that controls the progressive *product* rollout — independent timelines, independent rollback levers.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
