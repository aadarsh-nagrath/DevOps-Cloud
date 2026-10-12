# Running VoIP on AWS & Kubernetes — Complete Notes

> Part of [`VoIP and Unified Communications/`](./). Ties VoIP to the cloud notes in [`Cloud/`](../Cloud) and [`Kubernetes/`](../Kubernetes).

## 1. Beginner: why VoIP is "different" in the cloud
Typical web apps are TCP/HTTP on one port behind an L7 load balancer. VoIP is:
- **UDP-heavy**: SIP is often UDP and RTP is always UDP.
- **Port-range heavy**: thousands of RTP ports per server.
- **IP-in-payload**: SIP/SDP contain IP addresses, so NAT and load balancers that hide the real IP break things.
- **Long-lived and stateful**: a call can last hours; killing a node kills its calls.
- **Latency/jitter sensitive**: noisy neighbours, CPU steal, and cross-region hops hurt quality.

So the usual web tools (ALB, Ingress, quick rolling restarts, aggressive autoscaling) need care.

---

## 2. Intermediate: AWS building blocks

### EC2
- Use **Elastic IPs** for SIP/RTP-facing instances. Carriers whitelist your IPs, and the IP must not change.
- An Elastic IP is **1:1 NAT**: the instance only sees its *private* IP. You **must** configure the PBX with the public IP (`external_media_address` / `ext-rtp-ip`) or SDP will advertise the private one.
- Instance choice: compute-optimized (c6i/c7g…) with **enhanced networking (ENA)**; watch the per-instance **PPS limits**, since RTP is many small packets (~50 pps per stream at 20 ms ptime).
- Spread nodes across **AZs**; use placement and Auto Scaling Groups, but with **lifecycle hooks** so scale-in waits for calls to drain.

### Security Groups & NACLs for VoIP
| Rule | Protocol/Port | Source |
|---|---|---|
| SIP | UDP/TCP 5060 | Carrier IPs, customer/SBC ranges (avoid `0.0.0.0/0` if you can) |
| SIP TLS | TCP 5061 | Same |
| WebRTC signaling | TCP 443/8089 (WSS) | Clients |
| RTP | UDP 10000–20000 (match `rtp.conf`) | Usually `0.0.0.0/0` (media comes from anywhere) |
| Management | SSH 22, AMI 5038, ESL 8021 | **Only** VPN/bastion. Never public |

- **Security Groups are stateful**, so return traffic is allowed automatically.
- **NACLs are stateless**: you must allow the **inbound RTP range AND the outbound RTP range**, plus ephemeral ports for return traffic. A forgotten NACL rule is a classic cause of one-way audio in AWS.

### Load balancers (ELB)
| ELB type | VoIP fit |
|---|---|
| **ALB** (L7 HTTP/HTTPS) | Only for web portals, APIs, and WebSocket (WSS) signaling. **Not for SIP over UDP or RTP** |
| **NLB** (L4 TCP/UDP/TLS) | Can front **SIP signaling** (UDP/TCP/TLS 5060/5061) with **client IP preservation**; health checks via TCP or a sidecar HTTP check. **RTP is normally NOT load-balanced** (media goes directly to the media node's public IP advertised in SDP) |
| **CLB** | Legacy; avoid |

A common design is **DNS (Route 53 SRV/NAPTR + health checks) → Kamailio nodes with Elastic IPs**, rather than an LB at all. Kamailio's `dispatcher` then balances to the media servers.

### Other AWS pieces
- **Route 53**: A/SRV records for SIP domains, health-check-based failover, latency-based routing to the nearest region.
- **S3**: call recordings and voicemail (lifecycle to Glacier, encryption, retention policy), CDR exports.
- **AWS WAF**: protects the HTTP side (admin portals, provisioning APIs, WebRTC web apps). WAF does **not** inspect SIP/UDP; use Kamailio pike/ratelimit, an SBC, and Shield for that.
- **CloudWatch / Prometheus**: instance metrics, custom metrics (active calls, CPS).
- **Global Accelerator**: anycast static IPs with UDP support; can reduce jitter for global users.

---

## 3. Advanced: VoIP on Kubernetes / EKS

### Why it's tricky
- A K8s **Service** exposing 10,000 RTP ports is impractical, and kube-proxy SNAT hides the client IP.
- Pod IPs are private and ephemeral, while SDP needs a stable, reachable IP.
- Rolling updates kill pods with active calls.

### Patterns that work
| Concern | Approach |
|---|---|
| Media/SIP networking | **`hostNetwork: true`** for Kamailio/rtpengine/media pods so they bind directly to the node's IPs and port ranges; one such pod per node (DaemonSet, or Deployment with anti-affinity) |
| Stable public IPs | Dedicated **managed node group** for VoIP, nodes in public subnets with **Elastic IPs** attached (via a launch-template script or a controller); advertise the node's public IP in SDP (read from instance metadata at startup) |
| Isolation | **Taints/tolerations + nodeSelector** so only VoIP pods land on VoIP nodes; separate node group from the web apps |
| Client IP preservation | NLB with `externalTrafficPolicy: Local` for SIP Services, or hostNetwork directly |
| Config | **ConfigMaps** for `kamailio.cfg`/`pjsip.conf`/dispatcher lists, **Secrets** for trunk credentials; changing a ConfigMap does **not** restart pods, so trigger a controlled reload or use a checksum annotation |
| Packaging | **Helm charts** per component (kamailio, rtpengine, asterisk), values per environment; deployed via **Argo CD** (GitOps) |
| Graceful shutdown | `preStop` hook stops accepting new calls (remove from dispatcher / fail OPTIONS) and waits for active calls to drain; long `terminationGracePeriodSeconds`; **PodDisruptionBudgets** so node drains don't take down all media pods |
| Autoscaling | **HPA on custom metrics** (active calls/CPS via Prometheus Adapter or KEDA) rather than CPU only; Cluster Autoscaler/Karpenter for nodes, with **scale-in protection** while calls are active; scale up early, scale down slowly |
| Storage | Recordings to S3 (not node disk); **Volumes** (PVC/EBS) only for things like local spool, and avoid stateful media pods where possible |
| Health | Readiness probe = "SIP OPTIONS answered / registered to backend"; liveness kept conservative (restarting a media pod drops calls) |
| Observability | Prometheus exporters, HOMER HEP from every component, logs with Call-ID to Loki/ELK, Grafana dashboards (CPS, ASR, MOS, registrations) |

### Example: rtpengine DaemonSet (sketch)
```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata: { name: rtpengine, namespace: voip }
spec:
  selector: { matchLabels: { app: rtpengine } }
  template:
    metadata: { labels: { app: rtpengine } }
    spec:
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet
      nodeSelector: { node-role/voip: "true" }
      tolerations: [ { key: voip, operator: Exists, effect: NoSchedule } ]
      terminationGracePeriodSeconds: 3600
      containers:
        - name: rtpengine
          image: registry.example.com/rtpengine:12.5
          command: ["/bin/sh", "-c"]
          args:
            - |
              # Look up this node's Elastic IP from EC2 instance metadata (IMDSv2) at startup
              TOKEN=$(curl -s -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
              PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
              exec rtpengine --foreground --interface="${PRIVATE_IP}!${PUBLIC_IP}" --port-min=30000 --port-max=40000
          env:
            - name: PRIVATE_IP
              valueFrom: { fieldRef: { fieldPath: status.hostIP } }
          securityContext: { capabilities: { add: ["NET_ADMIN"] } }
```

### Release practices for voice platforms
- **Canary by traffic share**: add the new media server version to the Kamailio dispatcher with a low weight, watch ASR/MOS/5xx, then shift more.
- **Blue-green**: bring up a new pool, switch the dispatcher/DNS, and drain the old pool (never hard-kill).
- **Maintenance windows** in low-traffic hours; announce to support; have a rollback ready (previous Helm release / `argocd app rollback`).
- **Regression tests with SIPp** in the CI/CD pipeline (Jenkins/GitHub Actions) before promotion.
