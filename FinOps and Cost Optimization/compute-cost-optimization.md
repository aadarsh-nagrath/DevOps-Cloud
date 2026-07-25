# Compute Cost Optimization

Right-sizing, committed-use discounts, spot/preemptible capacity, autoscaling as a cost lever, and Kubernetes-specific tuning — the "Optimize" phase applied to compute, usually the largest line item on a cloud bill.

---

## 1. Right-Sizing: Match Capacity to Actual Usage

Right-sizing is the practice of setting instance/pod size based on **observed** utilization rather than a guess made at provisioning time. Over-provisioning "just in case" is one of the single biggest sources of cloud waste, precisely because it's invisible day-to-day — an oversized instance doesn't crash or alert on anything, it just quietly costs more every hour.

### Worked example

```
Instance: prod-api-07 (m5.2xlarge — 8 vCPU, 32 GiB RAM) — $0.384/hr on-demand ($280/mo)

CloudWatch/Prometheus utilization over trailing 30 days:
  CPU:    avg 15%,  p99 42%
  Memory: avg 28%,  p99 51%

Reasoning: this instance is provisioned for 8 vCPU but averages 15% CPU
utilization and never exceeds 42% even at peak. It is oversized by roughly
4x relative to its actual peak demand.

Right-sized target: m5.xlarge (4 vCPU, 16 GiB) — $0.192/hr ($140/mo)
  -> still leaves headroom above the observed 42% p99 CPU peak
  -> 50% cost reduction on this instance with no expected performance impact
```

The pattern to look for: **low average AND low peak** utilization means the instance is oversized, full stop. Low average with high peak (bursty workloads) is a different case — that's a candidate for autoscaling (section 4) rather than a permanently smaller fixed instance, since a permanently smaller instance would choke during the burst.

Right-sizing is not a one-time exercise — usage patterns drift as traffic and code change, so it belongs in the "Operate" phase as a recurring review, not a single cleanup pass (see [finops-culture-and-governance.md](finops-culture-and-governance.md)).

---

## 2. Reserved Instances / Savings Plans / Committed Use Discounts

The trade-off across all three major clouds is structurally the same: **commit to a term (1 or 3 years) and/or a spend level, in exchange for a substantial discount off on-demand pricing.**

| Mechanism | Cloud | Typical discount vs on-demand | Flexibility |
|---|---|---|---|
| Reserved Instances (RIs) | AWS | 30-60% (1yr), up to ~72% (3yr, all-upfront) | Tied to instance family/region (Standard RIs) or more flexible (Convertible RIs, lower discount) |
| Savings Plans | AWS | 30-66% | More flexible — commit to $/hour of compute spend, applies across instance families/sizes automatically |
| Reserved VM Instances | Azure | 30-65% | Tied to VM series/region, with instance size flexibility within a series |
| Committed Use Discounts (CUDs) | GCP | 30-57% (1yr), up to ~70% (3yr) | Resource-based (specific machine type) or spend-based (flexible across types) |

### The core decision rule

**Predictable, steady-state workloads should almost always be committed.** If you know a fleet of API servers will run 24/7 for the next two years regardless of anything else, paying on-demand rates for that entire time is pure waste — you're paying a premium for flexibility you're never actually going to use. On-demand pricing exists to cover the *uncertainty* of not knowing if/when you'll need the capacity; once that uncertainty is gone (because the workload is known to be permanent), the premium buys nothing.

```
Example: 20 x c5.xlarge running 24/7/365 for a known-permanent service

On-demand: $0.17/hr x 20 x 8,760 hrs/yr = $29,784/yr
1-yr No-Upfront Savings Plan (~28% discount): ~$21,444/yr  -> saves ~$8,340/yr
3-yr All-Upfront Savings Plan (~52% discount): ~$14,296/yr  -> saves ~$15,488/yr

The only real risk: committing to capacity you later don't need (the service
gets deprecated, or you migrate to smaller instances). Savings Plans (spend-based,
not instance-type-locked) largely de-risk this vs classic Standard RIs.
```

Practical guidance: commit the baseline/floor of your usage (the level of traffic that never goes away, even at 3am on a slow Sunday), and let anything above that floor run on-demand or spot. Don't commit 100% of peak capacity — that guarantees paying for idle commitment during troughs.

---

## 3. Spot / Preemptible Instances

Spot instances (AWS/Azure terminology) and Preemptible VMs (GCP terminology) are spare cloud capacity sold at a steep discount — commonly **60-90% off on-demand** — with the catch that the provider can reclaim the instance with little notice (AWS: 2-minute warning; GCP Preemptible: 30-second warning; Azure Spot: 30-second warning, or no warning on eviction due to capacity).

### What's actually suitable

| Suitable for spot/preemptible | NOT suitable for spot/preemptible |
|---|---|
| Stateless web/API servers behind a load balancer with health checks | Primary databases (RDS/Cloud SQL primaries, self-managed DB masters) |
| CI/CD runners and build agents | Anything holding session state with no external persistence |
| Batch processing / data pipeline jobs (Spark, ETL) that checkpoint or can restart | Single-instance services with no redundancy |
| Rendering, ML training/inference jobs designed for checkpointing | Anything where a sudden 30-second-notice termination causes a user-facing outage |
| Non-prod / dev / test environments | Payment processing or anything requiring strict transactional guarantees mid-request |

The unifying criterion: the workload must be **stateless and fault-tolerant**, or **fault-tolerant enough that a mid-job interruption just means "retry,"** not "corrupt state" or "dropped customer request."

### Worked example: CI runner fleet on spot

```yaml
# Example: GitHub Actions self-hosted runners / GitLab CI runners on a
# GKE node pool backed entirely by Spot VMs — CI jobs are inherently
# retriable and stateless, making them one of the safest spot use cases.

# gcloud: create a GKE node pool of Spot VMs dedicated to CI workloads
# gcloud container node-pools create ci-spot-pool \
#   --cluster=my-cluster \
#   --spot \
#   --machine-type=e2-standard-4 \
#   --num-nodes=0 \
#   --enable-autoscaling --min-nodes=0 --max-nodes=20 \
#   --node-taints=workload=ci:NoSchedule   # keep non-CI pods off this pool

apiVersion: v1
kind: Pod
metadata:
  name: ci-build-job
spec:
  tolerations:
    - key: "workload"
      operator: "Equal"
      value: "ci"
      effect: "NoSchedule"
  nodeSelector:
    cloud.google.com/gke-spot: "true"
  restartPolicy: OnFailure   # if the node is preempted mid-job, retry rather than fail permanently
  containers:
    - name: build
      image: my-ci-image
```

If a spot node is reclaimed mid-build, the CI job simply retries on a new node — a few minutes of delay, zero cost to correctness, and the fleet runs at maybe 20-30% of what the same capacity would cost on-demand. This is the canonical "safe" spot use case: nothing user-facing is affected by an interruption.

Contrast with a primary database: a reclaimed spot instance mid-transaction risks data loss or corruption and takes down the one thing every other service depends on — this is why databases (especially single-writer primaries) are the standard example of what NOT to run on spot.

---

## 4. Autoscaling as a Cost Lever, Not Just a Performance Lever

Autoscaling is usually framed purely in terms of handling traffic spikes without manual intervention. That's half the story — **scaling down during low-traffic periods is a direct cost optimization**, not a side effect. A fleet that's sized for peak traffic 24/7 is paying peak-capacity prices during every off-peak hour, which for most consumer/business-hours-driven traffic patterns is the majority of the day.

```
Example: a fleet handling business-hours traffic (9am-6pm heavy, overnight light)

Fixed-size fleet (sized for peak, 20 instances, 24/7):
  20 x $0.10/hr x 24hr = $48/day

Autoscaled fleet (20 instances peak, scales to 4 overnight):
  Weighted average ~9 instances x $0.10/hr x 24hr = ~$21.60/day
  -> ~55% reduction with zero impact on peak-hour capacity/performance
```

For Kubernetes specifically, this is the combined effect of the **Horizontal Pod Autoscaler** (scales pod replica count based on load) and the **Cluster Autoscaler** (scales the underlying node count based on how many nodes are actually needed to satisfy pending/running pod resource requests). When traffic drops and HPA scales pods down, the Cluster Autoscaler notices nodes are underutilized and removes them — which is what actually stops you from paying for idle compute, since removing pods alone doesn't reduce the bill if the underlying nodes are still running.

---

## 5. Kubernetes-Specific Cost Optimization

For the basic YAML syntax of `resources.requests` and `resources.limits`, see [../Kubernetes/K-pods.md](../Kubernetes/K-pods.md) — this section covers the **cost angle** specifically, not the syntax.

### Why requests directly determine cost

The Kubernetes scheduler places pods based on their `requests`, not their actual runtime usage — it reserves that much CPU/memory on a node for the pod regardless of whether the pod ever uses it. This has two failure modes, both of which cost real money:

- **Unset requests** — the scheduler has no basis for bin-packing efficiently, and the pod can be scheduled anywhere regardless of actual node capacity, leading to unpredictable overcommit or, more commonly in cost terms, the Cluster Autoscaler being unable to make good decisions about how many nodes are actually needed.
- **Wildly overestimated requests** — a pod that requests 4 CPU / 8Gi but only uses 200m / 512Mi still reserves the full 4 CPU / 8Gi on its node. That reserved-but-unused capacity can't be bin-packed with other workloads, so the cluster ends up needing more nodes than the actual aggregate usage requires — and the Cluster Autoscaler scales up based on *pending pod requests*, not real usage, so inflated requests directly and mechanically cause extra nodes to be provisioned.

```yaml
# Cost-conscious resource sizing — based on observed usage (see right-sizing, section 1),
# not a guessed round number.
resources:
  requests:
    cpu: "250m"      # set close to steady-state observed usage, not a padded guess
    memory: "256Mi"
  limits:
    cpu: "500m"       # headroom for bursts, not unlimited
    memory: "512Mi"
```

```
Example: a namespace with 30 pods each requesting 2 CPU "to be safe,"
but averaging 300m actual usage.

Requested (drives scheduling/autoscaling): 30 x 2 CPU = 60 CPU
Actually used:                              30 x 0.3 CPU = 9 CPU

The cluster autoscaler provisions nodes to satisfy 60 CPU of requests, even
though only 9 CPU is ever used -> roughly 6-7x more node capacity (and cost)
than the workload actually needs. Bringing requests down to ~500m (still with
headroom above the 300m average) would let the same nodes host far more pods,
directly reducing node count.
```

Use a Kubernetes-cost tool (Kubecost/OpenCost — see [cost-visibility-and-allocation.md](cost-visibility-and-allocation.md)) or `kubectl top pod` / VPA (Vertical Pod Autoscaler) recommendation mode over a representative time window to find the gap between requested and actual usage per workload — this is the single highest-leverage Kubernetes cost fix in most clusters, because it's rarely reviewed after the initial YAML was written.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
