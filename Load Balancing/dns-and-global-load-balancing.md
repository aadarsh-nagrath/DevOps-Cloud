# DNS & Global Load Balancing

Everything covered so far load balances across servers within one location. This file covers load balancing across **regions/data centers** — where DNS plays a surprisingly central role, alongside anycast networking and dedicated GSLB (Global Server Load Balancing) products.

---

## 1. DNS Round Robin — the Simplest (and Weakest) Form

A single DNS name resolves to multiple IP addresses; clients (or their resolvers) pick one, spreading load across them.

```
$ dig example.com
example.com.  300  IN  A  192.0.2.1
example.com.  300  IN  A  192.0.2.2
example.com.  300  IN  A  192.0.2.3
```
Most DNS servers rotate the order of returned records on each query, and most clients simply pick the first one — over many clients, this roughly balances load.

### Why this is weak as a *load balancing* mechanism
- **No health awareness**: DNS has no idea if `192.0.2.2` is currently down. It'll keep handing out that IP to new clients regardless, until someone manually updates the DNS record.
- **Caching defeats fast failover**: DNS responses are cached by resolvers and clients for the TTL duration. A short TTL (e.g., 30-60s) allows reasonably fast failover by updating the record, but many resolvers and clients (especially older ones, or ones that ignore TTL) cache far longer than instructed — you cannot guarantee fast propagation of a DNS change the way you can with a real load balancer's instant rerouting.
- **No algorithm sophistication**: no least-connections, no weighting based on real backend load — just rotation.
- **Uneven in practice**: some resolvers (and especially some client libraries) don't rotate at all, always picking the first record — leading to uneven real-world distribution despite the DNS server rotating correctly.

**Where it's still used**: as a coarse, cheap first layer — e.g., rotating across a handful of regional load balancer IPs — but essentially never as the *only* load balancing mechanism for anything serious. It's typically layered on top of real load balancers (each DNS-returned IP is itself the address of a fully capable regional/cloud load balancer, not a single backend server).

---

## 2. GeoDNS — Routing by Geography

The DNS server answers differently depending on where the query appears to originate from (based on the resolver's IP, approximated to a geographic region).

```
Query from a US resolver     -> returns US region's load balancer IP
Query from a European resolver -> returns EU region's load balancer IP
```
- **Benefit**: routes users to the nearest region, reducing latency, and is a common building block for multi-region deployments.
- **Limitation**: geography is inferred from the *resolver's* location, not the actual end client — with public DNS resolvers (like 8.8.8.8) potentially located far from the actual user, this approximation can be inaccurate. EDNS Client Subnet (ECS) is an extension that lets resolvers pass along partial client IP information to improve this accuracy, though not universally supported.
- Still fundamentally has the same **no health awareness** and **caching/propagation delay** problems as basic DNS round robin — GeoDNS solves the *routing decision*, not the *failover speed* problem.

---

## 3. DNS-Based Failover

Combine health checking with DNS: monitor each region's health, and update DNS records to stop pointing at (or deprioritize) an unhealthy region.

```
Normal:  example.com -> Region A IP (primary)
Region A fails health checks
Failover: example.com -> Region B IP (DNS record updated to point here instead)
```
Managed DNS services often bundle this capability directly:
- **AWS Route 53**: health checks + failover routing policy, weighted routing, latency-based routing, geolocation routing — all natively.
- **Azure Traffic Manager**: DNS-based global traffic routing with health probes and several routing methods (priority, weighted, performance/latency-based, geographic).
- **Google Cloud DNS** + external health checking, or more commonly, GCP's native global load balancer (see below) which sidesteps needing DNS-based failover in the first place.

```bash
# AWS Route 53 example: failover routing policy
aws route53 change-resource-record-sets --hosted-zone-id Z123456 --change-batch '{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "example.com",
      "Type": "A",
      "SetIdentifier": "primary",
      "Failover": "PRIMARY",
      "TTL": 60,
      "ResourceRecords": [{"Value": "192.0.2.1"}],
      "HealthCheckId": "abc-123-health-check-id"
    }
  }]
}'
```

**The propagation delay problem remains fundamental to DNS-based failover**: even a well-configured 60-second TTL means some clients/resolvers will keep trying the failed IP for up to 60 seconds (and some caching resolvers ignore TTL and hold on longer) — DNS-based failover is measured in tens of seconds to minutes, not the near-instant failover a real load balancer achieves within one data center (see [health-checks-and-failover.md](health-checks-and-failover.md)).

---

## 4. Anycast — Solving the Propagation Delay Problem

Anycast routes traffic at the **network layer (BGP)**, not DNS — the same IP address is announced from multiple physical locations, and internet routing (BGP) naturally sends each client's traffic to the topologically nearest announcing location.

```
Same IP: 203.0.113.1, announced from:
   - US data center
   - EU data center
   - Asia data center

A user in Germany's traffic to 203.0.113.1 is routed by BGP to the EU data center automatically
A user in Japan's traffic to the SAME IP is routed to the Asia data center automatically
```

- **No DNS involved in the routing decision at all** — it's the internet's own routing infrastructure making the choice, which means:
  - **No caching/propagation delay problem**: if a data center goes down, BGP withdraws its announcement of that IP, and traffic reroutes to the next nearest location typically within seconds — much faster than DNS TTL-based failover.
  - **Automatic latency optimization**: users are inherently routed to whichever location is network-topologically closest, no geolocation database/heuristic needed.
- This is the mechanism behind Cloudflare's edge network, GCP's global load balancer (mentioned in [cloud-load-balancers.md](cloud-load-balancers.md) as natively global), AWS Global Accelerator, and most major CDNs.
- **Limitation**: requires owning/announcing your own IP space via BGP (or using a provider that does this for you) — not something you configure with a simple DNS record; it's a network engineering capability, typically only available through your cloud provider's specific anycast product or a CDN.

---

## 5. GSLB (Global Server Load Balancing) — the Umbrella Term

"GSLB" refers to the general practice of load balancing across multiple sites/regions/data centers, implemented via *any* combination of the mechanisms above (DNS-based, anycast-based, or a hybrid). The term itself doesn't mandate a specific mechanism — when someone says "we use GSLB," they usually mean one of:

| Implementation | Mechanism | Failover speed | Examples |
|---|---|---|---|
| DNS-based GSLB | Health-checked DNS failover/weighting | Seconds to minutes (TTL-bound) | Route 53, Azure Traffic Manager, NS1 |
| Anycast-based | BGP routing, no DNS decision involved | Seconds (BGP convergence) | Cloudflare, GCP global LB, AWS Global Accelerator |
| Hybrid | Anycast entry point + DNS for finer-grained routing decisions underneath | Varies by layer | Many CDN + GSLB combined offerings |

---

## 6. Practical Multi-Region Architecture Pattern

```
Users worldwide
   |
   v
[Anycast IP or GeoDNS]                <- gets users to the nearest healthy region fast
   |
   v
[Regional L7 Load Balancer]           <- see l4-vs-l7-load-balancing.md
   |
   v
[Regional Ingress/Service mesh]       <- see kubernetes-load-balancing.md
   |
   v
[Regional backend Pods/instances]
```
Health checking exists at *every* layer independently: the regional load balancer health-checks its own backends (fast, local failover — seconds), while the GSLB layer health-checks entire regions (whether via DNS or anycast withdrawal) for the rarer, larger-blast-radius case of an entire region going down. Both matter; neither substitutes for the other.

---

## 7. Key Takeaways

- **DNS round robin alone is not a serious load balancing or failover mechanism** for production traffic — it lacks health awareness and has real propagation delay.
- **Combine DNS with health checking** (Route 53 health checks, Traffic Manager probes) if you need DNS-based failover — bare round robin is not enough.
- **Anycast solves the propagation-delay problem DNS can't**, but requires a provider/product that offers it — it isn't a plain DNS record you can set up yourself in the same way.
- **GSLB is a pattern, not a single product** — understand which underlying mechanism (DNS vs anycast) any "global load balancer" you're evaluating actually uses, since it directly determines real-world failover speed.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
