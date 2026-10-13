# Cloud Load Balancers: AWS, Azure, GCP

Managed load balancing services from the three major cloud providers — no infrastructure to patch/scale yourself, deep integration with the rest of each provider's ecosystem (auto scaling groups, Kubernetes, WAF, certificates). This file compares the actual products you'll configure day to day.

---

## 1. AWS — Elastic Load Balancing (ELB)

**Elastic Load Balancing (ELB)** is the AWS service that distributes incoming traffic across multiple **targets**: EC2 instances, containers (ECS tasks / EKS pods), IP addresses (including on-prem over VPN/Direct Connect), and Lambda functions. It improves **availability, scalability and fault tolerance** by making sure no single server gets overloaded.

- **Spreads requests** across multiple **healthy** targets. Health checks remove failing targets automatically and add them back when they recover.
- **Keeps the app available when individual targets fail**: it runs across multiple Availability Zones, so even a whole AZ going down doesn't take the app offline.
- **Works with Auto Scaling**: an Auto Scaling Group registers new instances in the **target group** as it scales out and deregisters them (after **connection draining / deregistration delay**) as it scales in. The ALB metric `RequestCountPerTarget` can itself drive scaling.
- **Fully managed**: AWS scales the load balancer itself, patches it, and makes it highly available.
- **Building blocks**: **Load balancer** → **Listener** (protocol + port, e.g. HTTPS:443, with TLS certs from ACM) → **Rules** (ALB only) → **Target group** (targets + health check settings).

AWS offers **four** load balancer types under ELB, each built for a different OSI layer and use case. Picking the wrong one is a common mistake, because they aren't interchangeable.

### 1) Application Load Balancer (ALB) — Layer 7
- **Best for**: modern web applications, microservices, container-based apps (ECS/EKS via the AWS Load Balancer Controller).
- **How it works**: operates at the **Application Layer (HTTP/HTTPS, plus HTTP/2, gRPC and WebSockets)**. It terminates the connection, **inspects the request** (URL path, host, headers, query string, cookies, source IP) and routes it according to listener rules. Because it opens a new connection to the backend, the client IP is passed in the `X-Forwarded-For` header.
- **Key features**:
  - **Path-based routing**: `/api/*` → API target group, `/images/*` → static/image service.
  - **Host-based routing**: `api.example.com` and `www.example.com` → different backends on the same ALB.
  - Header/query/method-based rules, **weighted target groups** (blue/green and canary at the LB), redirects (HTTP→HTTPS) and fixed responses.
  - **Integrations**: **AWS WAF** (OWASP rules, rate limiting), **ACM** (free TLS certs, SNI for multiple certs), **Lambda** as a target, **Cognito/OIDC authentication** at the LB.
  - Sticky sessions (cookie-based), slow start, least-outstanding-requests algorithm.
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

# path-based rule: /api/* → api target group
aws elbv2 create-rule --listener-arn $LISTENER_ARN --priority 10 \
  --conditions Field=path-pattern,Values='/api/*' \
  --actions Type=forward,TargetGroupArn=$API_TG_ARN
```

### 2) Network Load Balancer (NLB) — Layer 4
- **Best for**: high-performance, low-latency workloads such as gaming, financial/trading systems, IoT, databases, and any raw **TCP/UDP** traffic.
- **How it works**: operates at the **Transport Layer (Layer 4)**. It forwards connections/packets based on IP + port **without inspecting the request content**, so it's extremely fast. It **preserves the client's source IP** by default.
- **Key features**:
  - **Extreme performance**: handles **millions of requests per second** with ultra-low, consistent latency, and absorbs sudden spikes without "pre-warming".
  - **Static IP per Availability Zone** (or your own **Elastic IPs**). Useful when clients or partners must **allowlist fixed IPs** in their firewalls. A common pattern puts an NLB in front of an ALB to get static IPs plus L7 routing.
  - **TCP, UDP, TLS** (TLS termination or passthrough for end-to-end encryption).
  - Exposes services privately to other VPCs/accounts via **AWS PrivateLink** (endpoint services are fronted by NLBs).
  - Security groups are supported on NLBs (since 2023). Long-lived connections are fine.

### 3) Gateway Load Balancer (GWLB) — Layer 3
- **Best for**: deploying, scaling and managing **third-party virtual appliances** such as firewalls (Palo Alto, Fortinet, Check Point), intrusion detection/prevention systems (IDS/IPS) and deep packet inspection tools.
- **How it works**: operates at the **Network Layer (Layer 3)**. It listens for **all IP packets on all ports** and forwards them to a fleet of security appliances, encapsulated with the **GENEVE protocol (UDP port 6081)**. Once an appliance inspects and approves a packet, it goes back through the GWLB to its destination (the application). Traffic is steered to it through **GWLB Endpoints** (a VPC endpoint type) placed in route tables, so it acts as a **"bump in the wire"**.
- **Key features**:
  - **Transparent inspection**: the source/destination IPs are unchanged, so apps and clients don't need any reconfiguration.
  - **Auto-scaling of security appliances**: appliances sit in a target group behind the GWLB, with health checks and Auto Scaling. Unhealthy appliances are removed.
  - **Flow stickiness**: all packets of one flow go to the same appliance (needed for stateful firewalls).
  - Used for **centralized inspection** in a security/inspection VPC shared by many VPCs via Transit Gateway.
- Not something you'd choose for app-tier load balancing. It's network/security infrastructure.

### 4) Classic Load Balancer (CLB) — Layer 4/7 (legacy)
- The original (2009-era) ELB, from the EC2-Classic network days. Basic L4/L7 support only: no path/host routing, no target groups.
- **Legacy**: AWS recommends ALB or NLB for anything new. You'll still see it in older accounts, and AWS provides a migration wizard to ALB/NLB.

### AWS Comparison Table
| | ALB | NLB | GWLB | CLB |
|---|---|---|---|---|
| OSI Layer | 7 (Application) | 4 (Transport) | 3 (Network) | 4 & 7 (limited) |
| Protocols | HTTP/HTTPS/HTTP2/gRPC/WebSocket | TCP/UDP/TLS | IP (all ports, GENEVE to appliances) | TCP/SSL/HTTP/HTTPS |
| Targets | Instances, IPs, Lambda, (containers via IP/instance) | Instances, IPs, ALB | Appliance instances/IPs | Instances only |
| Inspects request content | Yes (path, host, headers, cookies) | No | No (appliances do) | Minimal |
| Preserves client IP natively | No (uses X-Forwarded-For) | Yes | Yes (transparent) | No |
| Path/host-based routing | Yes | No | No | No |
| Static IP support | No (use NLB in front, or Global Accelerator) | Yes (per AZ / Elastic IP) | N/A (reached via GWLB endpoints) | No |
| WAF integration | Yes | No | N/A | No |
| Performance | High | **Highest** (millions of RPS, lowest latency) | High | Moderate |
| Typical use | Web apps, microservices, APIs, containers | Gaming, finance, IoT, TCP/UDP, static IPs, PrivateLink | Third-party firewalls, IDS/IPS | Legacy — avoid for new builds |

**How to choose (interview one-liner)**: HTTP(S) and smart routing → **ALB**. Raw TCP/UDP, extreme performance or static IPs → **NLB**. Inserting firewalls/IDS transparently → **GWLB**. Never pick CLB for new work.

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
