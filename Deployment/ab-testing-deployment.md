# A/B Testing (as a Deployment Pattern)

Run two (or more) versions of a feature simultaneously, split traffic between them, and measure which one performs better against a business metric — not just "is it technically healthy," but "does it convert/engage/retain better." A/B testing borrows the *mechanism* of canary deployments (traffic splitting) but has a fundamentally different *goal*.

---

## 1. Canary vs A/B Testing — the Distinction That Matters

It's easy to conflate these because both split traffic between two versions. The difference is what question you're answering:

| | Canary | A/B Test |
|---|---|---|
| Question being answered | "Is the new code safe to run in production?" | "Which version do users prefer / convert better on?" |
| Metric type | Technical (error rate, latency, crashes) | Business/behavioral (click-through, conversion, revenue, retention) |
| Duration | Minutes–hours, ends as soon as confidence is reached | Days–weeks, ends when statistically significant |
| Population split | Random, doesn't need to be balanced or persistent | Must be consistent per-user (same user always sees the same variant) and often needs to exclude bots/internal traffic for clean data |
| What happens after | Fully promote or fully roll back — a binary release decision | Pick a winner based on a statistical test, then that variant becomes the new 100% baseline (or a new test starts) |
| Owned by | SRE / platform / on-call engineers | Product managers, growth/data teams (with engineering support) |

A release can (and often does) go through **both**: canary first to confirm the new code is technically safe, *then* a longer-running A/B test on the feature behavior once you know it isn't going to crash or error out.

---

## 2. Requirements for a Valid A/B Test

Technically running two versions is the easy part — running a *statistically valid* test is the hard part:

- **Consistent bucketing**: a given user must always see the same variant for the test's duration (usually via a stable hash of user ID or a persistent cookie), or their behavior data is meaningless.
- **Random, representative assignment**: assignment must not correlate with anything that also affects the outcome metric (e.g., don't accidentally put all mobile users in variant A).
- **Sample size / statistical power calculated up front**: decide before the test how many users/conversions you need to detect a meaningful effect size, or you'll be tempted to stop early on noise ("peeking problem").
- **A single, pre-declared primary metric**: define what "winning" means before you start. Testing 10 metrics and reporting whichever one showed significance after the fact is a classic statistics error (multiple comparisons problem).
- **Exclude bots/internal traffic** from the analysis — synthetic/QA/monitoring traffic pollutes real user behavior data.

---

## 3. Example: Feature-Flag-Based A/B Test

Most A/B tests today are implemented via a feature-flag/experimentation platform (LaunchDarkly, Split, Optimizely, GrowthBook, or a homegrown flag service) rather than infrastructure-level traffic splitting, because you need consistent per-user bucketing and rich analytics integration, not just raw request routing.

```javascript
// Pseudocode: client requests a variant assignment, consistently per user
const variant = experimentClient.getVariant('checkout-button-color', {
  userId: currentUser.id,   // stable bucketing key
});

if (variant === 'treatment') {
  renderGreenCheckoutButton();
} else {
  renderBlueCheckoutButton(); // control
}

// Track the outcome event tied to this user's assigned variant
analytics.track('checkout_completed', {
  userId: currentUser.id,
  experiment: 'checkout-button-color',
  variant,
});
```

## 4. Example: Infrastructure-Level Split (simpler, coarser)

When you don't need per-user consistency (e.g., testing a backend algorithm change where the user never perceives which variant they got), plain traffic-splitting infrastructure works, same as canary:

```yaml
# Istio VirtualService splitting traffic 50/50 for an A/B test on a backend service
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: recommendation-service
spec:
  hosts: [recommendation-service]
  http:
    - route:
        - destination: { host: recommendation-service, subset: algorithm-a }
          weight: 50
        - destination: { host: recommendation-service, subset: algorithm-b }
          weight: 50
```
This works for backend-only experiments but is the wrong tool when you need consistent per-user experience or rich event tracking — reach for a proper experimentation platform in that case.

---

## 5. Operational Considerations

- **Cleanup discipline**: A/B tests accumulate flag/branching logic in the codebase. Every experiment needs an owner and an end date — remove the losing variant's code once the test concludes, don't let dead flag branches pile up indefinitely (this is one of the most common sources of long-term codebase complexity in teams that run many experiments).
- **Interaction effects**: running multiple A/B tests concurrently on overlapping user populations can produce misleading results if the tests interact (e.g., a pricing test and a UI test both affecting the same conversion funnel). Coordinate experiment scheduling with whoever owns the experimentation platform.
- **This is still a deployment, and it still needs the same safety net as any other**: the new code path (whichever variant introduces it) still needs to pass the same testing/observability bar as any production release — an A/B test is not a substitute for a canary/safety check on new code, it's an additional layer on top of it.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
