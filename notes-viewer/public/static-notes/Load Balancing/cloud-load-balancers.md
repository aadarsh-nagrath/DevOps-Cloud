# Cloud Load Balancers: AWS, Azure, GCP

Managed load balancing services from the three major cloud providers — no infrastructure to patch/scale yourself, deep integration with the rest of each provider's ecosystem (auto scaling groups, Kubernetes, WAF, certificates). This file compares the actual products you'll configure day to day.

---

## 1. AWS

AWS offers four distinct load balancer products under the "Elastic Load Balancing" (ELB) umbrella — picking the wrong one is a common mistake, since they aren't interchangeable.

### Application Load Balancer (ALB) — L7
- HTTP/HTTPS/gRPC only.
- Path-based and host-based routing, header/query-string/cookie-based routing rules.
- Native integration with AWS WAF, AWS Certificate Manager (free managed TLS certs), Cognito for authentication.
- Native support for target types: EC2 instances, IP addresses, Lambda functions (yes — an ALB can invoke a Lambda function directly as a target).
```bash
aws elbv2 create-load-balancer \
  --name my-alb \
  --subnets subnet-abc subnet-def \
  --security-groups sg-123 \
  --type application

aws elbv2 create-target-group \
  --name my-targets \
  --protocol HTTP --port 8080 \
  --vpc-id vpc-123 \
  --health-check-path /healthz \
  --health-check-interval-seconds 15
```

### Network Load Balancer (NLB) — L4
- TCP/UDP/TLS (passthrough), extremely high throughput, ultra-low and consistent latency.
- Preserves the client's source IP by default (ALB requires reading the `X-Forwarded-For` header instead, since it's a proxy that establishes its own connection to the backend).
- Supports static IP addresses / Elastic IPs per Availability Zone — useful when a client needs to allowlist a fixed IP.
- Use for: non-HTTP protocols, extreme performance requirements, or when you need TLS passthrough for end-to-end encryption.

### Gateway Load Balancer (GLB)
- A specialized product for inserting third-party virtual appliances (firewalls, intrusion detection/prevention systems) transparently into the traffic path — distributes traffic across a fleet of appliances and ensures traffic flows through them before reaching its destination.
- Not something you'd choose for typical app-tier load balancing — this is a network/security infrastructure tool.

### Classic Load Balancer (CLB)
- The original (2009-era) ELB product. Legacy — AWS recommends ALB or NLB for anything new. You'll still encounter it in older accounts/infrastructure.

### AWS Comparison Table
| | ALB | NLB | GLB | CLB |
|---|---|---|---|---|
| OSI Layer | 7 | 4 | 3/4 (Gateway) | 4 & 7 (limited) |
| Protocols | HTTP/HTTPS/gRPC | TCP/UDP/TLS | IP | TCP/HTTP/HTTPS |
| Preserves client IP natively | No (uses X-Forwarded-For) | Yes | Yes | No |
| Path/host-based routing | Yes | No | No | No |
| Static IP support | No (use NLB in front, or Global Accelerator) | Yes | Yes | No |
| Typical use | Web apps, microservices, APIs | High-perf TCP, gaming, DBs, TLS passthrough | Third-party network appliances | Legacy — avoid for new builds |

---

## 2. Azure

### Azure Load Balancer — L4
- Regional or global (cross-region) options.
- Public (internet-facing) or internal (private VNet-only) SKUs.
- Basic vs Standard SKU — Standard is what you should use for anything production-grade (Basic lacks availability zone support and has a less robust SLA).
```bash
az network lb create \
  --resource-group myRG \
  --name myLoadBalancer \
  --sku Standard \
  --public-ip-address myPublicIP \
  --frontend-ip-name myFrontEnd \
  --backend-pool-name myBackEndPool
```

### Azure Application Gateway — L7
- Path-based routing, SSL termination, cookie-based session affinity, WAF integration (Azure WAF).
- Autoscaling built in (v2 SKU) — scales the gateway's own capacity based on traffic, not just the backend pool.
- Roughly Azure's equivalent of AWS's ALB.

### Azure Front Door — Global L7 + CDN
- Global entry point: combines global HTTP(S) load balancing across regions, a CDN, and a WAF in one service.
- Anycast-based — users connect to the nearest Microsoft edge point of presence, and Front Door then routes to the healthiest/nearest backend region.
- Roughly Azure's equivalent of a combined AWS CloudFront + Global Accelerator + ALB.

### Azure Comparison Table
| | Azure Load Balancer | Application Gateway | Front Door |
|---|---|---|---|
| OSI Layer | 4 | 7 | 7 (global) |
| Scope | Regional | Regional | Global |
| WAF | No | Yes (add-on) | Yes (built-in) |
| CDN capability | No | No | Yes |
| Typical use | Internal/regional TCP load balancing, VM scale sets | Regional web app ingress with path routing | Global multi-region entry point |

---

## 3. Google Cloud Platform (GCP)

GCP's load balancing is built on Google's own global network backbone, which is genuinely architecturally different from AWS/Azure — a single **global anycast IP** can front backends in multiple regions worldwide, with Google's network routing users to the nearest healthy region, rather than requiring a separate DNS-based GSLB layer on top.

### External HTTP(S) Load Balancer — Global L7
- One global anycast IP, backends can be spread across multiple regions.
- Integrates with Google Cloud Armor (WAF/DDoS protection), Cloud CDN.
- Automatically handles cross-region failover — if backends in one region become unhealthy, traffic is routed to the next nearest healthy region, without needing separate DNS-based failover logic.
```bash
gcloud compute backend-services create my-backend-service \
  --protocol=HTTP \
  --health-checks=my-health-check \
  --global

gcloud compute url-maps create my-url-map \
  --default-service=my-backend-service
```

### Network Load Balancer (L4, regional, passthrough)
- Preserves client source IP, TCP/UDP, regional (not global like the HTTPS LB above).
- Used for non-HTTP traffic or when you need to see the real client IP at the backend.

### Internal Load Balancers (L4 and L7 variants)
- For service-to-service traffic within a VPC, not internet-facing — GCP has both an internal TCP/UDP LB and an internal HTTP(S) LB.

### GCP Comparison Table
| | External HTTP(S) LB | Network LB | Internal LB |
|---|---|---|---|
| OSI Layer | 7 | 4 | 4 or 7 (variant-dependent) |
| Scope | Global (anycast) | Regional | Regional/VPC-internal |
| Preserves client IP | No (proxy-based) | Yes | Varies |
| Typical use | Public web apps/APIs needing global reach | High-perf regional TCP/UDP | Internal microservice-to-microservice traffic |

---

## 4. Cross-Cloud Comparison at a Glance

| Concept | AWS | Azure | GCP |
|---|---|---|---|
| L7 regional | Application Load Balancer | Application Gateway | (regional not typical — GCP's HTTPS LB is usually global) |
| L7 global | CloudFront + Global Accelerator (composed) | Front Door | External HTTP(S) Load Balancer (native global) |
| L4 | Network Load Balancer | Azure Load Balancer | Network Load Balancer |
| WAF | AWS WAF (attaches to ALB/CloudFront) | Azure WAF (attaches to App Gateway/Front Door) | Cloud Armor (attaches to HTTPS LB) |
| Native global anycast entry point | Global Accelerator (separate product) | Front Door | Built into the HTTPS Load Balancer itself |

**Key architectural difference worth internalizing**: GCP's global HTTP(S) load balancer is *natively* global — one anycast IP, one config, backends anywhere. AWS and Azure achieve the equivalent by *composing* a regional L7 balancer with a separate global product (Global Accelerator, Front Door, or DNS-based GSLB — see [dns-and-global-load-balancing.md](dns-and-global-load-balancing.md)). Neither approach is "better" outright, but it changes how you architect multi-region failover on each platform.

---

## 5. General Guidance Across All Three Clouds

- **Default to the managed L7 offering** (ALB / Application Gateway / HTTPS LB) for web/API traffic unless you have a specific reason to need L4 (non-HTTP protocol, extreme performance, client-IP preservation, TLS passthrough).
- **Always attach a WAF** for anything internet-facing in production — it's a small additional cost against a very common class of attack.
- **Health check tuning matters as much as the LB choice itself** — see [health-checks-and-failover.md](health-checks-and-failover.md); a poorly tuned health check (too lenient or too aggressive) undermines any load balancer regardless of vendor.
- **Understand your provider's client-IP-preservation behavior** before you need real client IPs for rate limiting, geolocation, or audit logging — L7 proxies generally require `X-Forwarded-For`, L4 passthrough LBs generally preserve it natively.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
