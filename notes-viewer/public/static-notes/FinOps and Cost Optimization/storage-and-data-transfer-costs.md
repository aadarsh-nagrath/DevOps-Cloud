# Storage and Data Transfer Costs

Storage tiering across AWS/Azure/GCP, the often-overlooked cost of data transfer and egress, snapshot/backup accumulation, and CDN caching as a cost lever.

---

## 1. Storage Tiering

Moving infrequently-accessed data to a cheaper storage tier is one of the **highest-ROI, lowest-effort** cost optimizations available — the data doesn't need to change, the access pattern doesn't need to change, only the storage class does, and it can be fully automated with lifecycle policies.

| Access pattern | AWS S3 | Azure Blob | GCP Cloud Storage | Typical relative cost |
|---|---|---|---|---|
| Frequent (hot) | S3 Standard | Hot tier | Standard | Baseline (1x) |
| Infrequent (~monthly) | S3 Standard-IA / One Zone-IA | Cool tier | Nearline | ~40-50% of hot |
| Rare (~quarterly) | S3 Glacier Instant/Flexible Retrieval | Cool/Cold tier | Coldline | ~10-20% of hot |
| Archival (~yearly or compliance-only) | S3 Glacier Deep Archive | Archive tier | Archive | ~2-5% of hot |

(See [gcp.md](../Cloud/GCP/gcp.md) and [azure.md](../Cloud/AZURE/azure.md) for the general service descriptions of each tier — this section is specifically about the cost trade-off of tier choice.)

The trade-off moving down the table: storage cost drops sharply, but **retrieval cost and latency go up** — archive tiers can take hours to rehydrate a file and charge a per-GB retrieval fee. Tiering only pays off when the access pattern genuinely matches; moving actively-read data to Glacier Deep Archive to save on storage costs will blow the "savings" many times over in retrieval fees and latency the first time something needs to read it back.

### Automate with lifecycle policies — don't manage this manually

Manually reviewing and moving objects between tiers doesn't scale and gets forgotten. Lifecycle policies apply the transition automatically based on object age.

```json
// AWS S3 lifecycle policy: move to IA after 30 days, Glacier after 90, delete after 365
{
  "Rules": [
    {
      "ID": "tiered-lifecycle",
      "Status": "Enabled",
      "Filter": { "Prefix": "logs/" },
      "Transitions": [
        { "Days": 30, "StorageClass": "STANDARD_IA" },
        { "Days": 90, "StorageClass": "GLACIER" }
      ],
      "Expiration": { "Days": 365 }
    }
  ]
}
```

```bash
# GCP: lifecycle rule via gsutil — same concept, applied to a bucket
cat > lifecycle.json <<'EOF'
{
  "rule": [
    { "action": {"type": "SetStorageClass", "storageClass": "NEARLINE"},
      "condition": {"age": 30} },
    { "action": {"type": "SetStorageClass", "storageClass": "COLDLINE"},
      "condition": {"age": 90} },
    { "action": {"type": "Delete"},
      "condition": {"age": 365} }
  ]
}
EOF
gsutil lifecycle set lifecycle.json gs://my-bucket
```

```bash
# Azure: lifecycle management policy — move to Cool after 30 days, Archive after 90
az storage account management-policy create \
  --account-name mystorageaccount \
  --policy @lifecycle-policy.json
```

---

## 2. The Often-Overlooked Cost of Data Transfer / Egress

Compute and storage get most of the attention in cost reviews because they're the biggest, most visible line items — but **data transfer/egress is frequently a bigger and more surprising cost than compute** for data-heavy or chatty architectures, precisely because it's easy to overlook when nobody is specifically watching for it.

Three distinct transfer cost categories, roughly increasing in typical rate:

| Transfer type | Typical cost | Why it's easy to miss |
|---|---|---|
| Same-AZ traffic | Usually free | N/A — this is the "safe" baseline everyone assumes |
| Cross-AZ traffic (same region) | ~$0.01-0.02/GB **each direction** (so effectively ~$0.02-0.04/GB round trip) | Looks like "internal" traffic, easy to assume it's free like same-AZ |
| Cross-region traffic | ~$0.02-0.09/GB depending on region pair | Only shows up when architecture spans regions, often added later without a cost review |
| Internet egress | ~$0.05-0.09/GB (drops at higher volume tiers) | The most commonly budgeted-for one, but volumes are frequently underestimated |

### Concrete example: chatty multi-AZ microservices

```
Setup: 15 microservices deployed across 3 AZs for HA, calling each other
synchronously in a request chain (API gateway -> auth -> orders -> inventory
-> pricing -> ...), with no AZ-affinity routing — each call has a random
chance of crossing an AZ boundary.

Assume: 500 req/sec average, each request fans out to ~6 downstream calls,
average payload ~50KB per call, ~66% of calls cross an AZ boundary (random
routing across 3 AZs).

Cross-AZ bytes/sec = 500 x 6 x 50KB x 0.66 ≈ 99 MB/sec ≈ 8.3 TB/day
At ~$0.02/GB round-trip: 8.3TB x 1024 x $0.02 ≈ $170/day ≈ ~$5,100/month

This entire cost is invisible in the compute or storage line items — it only
shows up as "data transfer" in the bill, and it exists purely because of a
lack of AZ-affinity routing, not because of any actual capacity need.
```

Mitigations, in order of typical effort/impact:
- **Topology-aware / zone-aware routing** — prefer same-AZ service endpoints when available (Kubernetes: `trafficDistribution: PreferClose` / topology-aware routing on Services; service mesh locality load balancing).
- **Reduce call chain depth / payload size** — fewer network hops, smaller payloads, less to transfer regardless of AZ.
- **Batch/aggregate calls** instead of many small chatty requests.
- Accept that **some** cross-AZ cost is the unavoidable price of the high-availability architecture itself — the goal is eliminating the *accidental, unbudgeted* portion, not chasing it to zero at the expense of HA.

Internet egress deserves the same scrutiny for any data-heavy product (large file downloads, video, API responses with big payloads, data exports) — it's worth explicitly modeling "cost per GB served" as a unit economic (see glossary in [finops-overview.md](finops-overview.md)) for any feature whose usage scales with data volume.

---

## 3. Snapshot and Backup Cost Accumulation

A very common silent cost leak: **old snapshots and backups that nobody is pruning.** Unlike a running instance, a forgotten snapshot doesn't show up in any uptime dashboard or get noticed during an incident — it just sits there, accruing storage cost indefinitely, often long after the volume/database it was backing up has been deleted or replaced.

```
Example: automated daily EBS snapshots with no retention/expiration policy,
running for 3 years on a 500GB volume with ~5% daily change rate.

Without pruning: 3 years x 365 snapshots, incremental but still accumulating
-> often several times the size of the source volume in aggregate storage,
   continuing to bill every month with zero operational value beyond a
   handful of recent restore points anyone would ever actually use.

With a 30-day retention policy: same restore protection for any realistic
recovery scenario, a small fraction of the accumulated storage cost.
```

This is fundamentally a **retention policy** problem — how long backups/snapshots need to be kept is a decision that should be driven by actual recovery requirements (RPO/RTO) and any compliance mandates, not by "automation was turned on once and never revisited." The mechanics of designing a sound backup retention policy (how many restore points you actually need, compliance-driven retention minimums, etc.) are covered in more depth in this repo's Backup & Disaster Recovery notes — the point to internalize here is specifically the **cost** angle: every retention policy decision is also, directly, a storage cost decision, and an unbounded or "keep forever" default retention setting is one of the easiest ways to accumulate pure waste with zero corresponding benefit.

Practical minimum: any automated snapshot/backup job should have an explicit, deliberately-chosen expiration — never leave it as "no expiration" by default.

---

## 4. CDN / Caching as a Cost Optimization

A CDN is usually framed as a performance/latency optimization — serving content from an edge location near the user is faster. It's worth internalizing that it's **also, independently, a cost optimization**: every request served from a cached edge copy is a request that never hits origin compute or triggers an origin egress charge.

```
Example: a media/asset-heavy site with 10M requests/day, average 200KB
response, previously served entirely from origin (S3 + EC2 behind an ALB).

Without CDN: 10M x 200KB/day ≈ 2TB/day of origin egress + full request-count
             load on origin compute, sized to handle 100% of traffic directly.

With CDN + a 90% cache hit rate: only ~1M requests/day (the cache misses)
reach origin -> origin egress drops to ~200GB/day, and origin compute can be
sized for a fraction of total traffic rather than 100% of it.

CDN edge delivery is also typically priced lower per GB than direct origin
internet egress at volume, compounding the saving on top of the reduced
origin load.
```

The mechanism is simple: caching converts repeated identical requests for the same content into a single origin fetch plus many cheap edge serves, instead of paying full compute + egress cost on every single request. This applies not just to CDNs for static assets, but to any caching layer (application-level cache, API response cache) sitting in front of expensive origin compute or a paid upstream API — the cost benefit compounds with the performance benefit, they are not competing concerns.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
