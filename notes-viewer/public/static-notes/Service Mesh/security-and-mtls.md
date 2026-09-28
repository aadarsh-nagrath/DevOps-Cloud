# Security & mTLS in a Service Mesh

A service mesh's most commonly cited security benefit is automatic mutual TLS between every service — but understanding *why* this matters, how certificate issuance/rotation actually works, and how authorization policies layer on top is where the real value (and the real complexity) lives.

---

## 1. The Problem: Unencrypted, Unauthenticated Internal Traffic

A very common (and risky) assumption in microservices architectures: "internal" traffic between services, inside a private network/VPC, doesn't need encryption or authentication — only traffic crossing the public internet does.

```
checkout-service --[plain HTTP, no auth]--> payment-service --[plain HTTP, no auth]--> fraud-detection-service
```

**Why this assumption is dangerous**:
- **Anyone who gets a foothold inside the network** (a compromised Pod, a misconfigured network policy, a malicious insider, a supply-chain-compromised dependency) can read *and modify* all internal traffic in plain text.
- **There's no way to verify which service is actually calling you** — any Pod on the network can pretend to be `checkout-service` calling `payment-service`, since there's no cryptographic identity involved, just IP addresses (which are trivially spoofable or simply not verified at all in a typical setup).
- This directly contradicts the **zero-trust security model** — the principle that you should never implicitly trust traffic just because of where it came from on the network (see §5).

---

## 2. What mTLS Actually Provides

**TLS** (regular HTTPS) authenticates the *server* to the client (your browser verifies it's really talking to `example.com`, not an imposter) — the server doesn't verify who the client is beyond that.

**mTLS (mutual TLS)** authenticates **both sides**: the client proves its identity to the server, and the server proves its identity to the client, using certificates on both ends.

```
Regular TLS (one-way):                     Mutual TLS (two-way):
  Client -> verifies server's cert           Client -> verifies server's cert
  Server -> does NOT verify client            Server -> ALSO verifies client's cert
                                              Both sides now know exactly who they're talking to
```

In a service mesh, this means: `payment-service` doesn't just accept a connection because it arrived on the right port — it cryptographically verifies the connection really is coming from `checkout-service` (or whichever specific service identity the certificate proves), not from an arbitrary Pod on the network pretending to be it.

---

## 3. How Certificate Issuance & Rotation Works (Istio Example)

This is the part that would be a massive operational burden to do manually per-service — the control plane automates all of it.

```
                    +------------------+
                    |     istiod        |   <- acts as a Certificate Authority (CA)
                    |  (Certificate      |
                    |   Authority)       |
                    +------------------+
                       |            |
          (issues short-lived     (issues short-lived
           cert + key)             cert + key)
                       v            v
              +----------+   +----------+
              |  Envoy    |   |  Envoy    |
              |  sidecar  |   |  sidecar  |
              | (checkout)|   |(payment)  |
              +----------+   +----------+
```

1. Each Envoy sidecar requests a certificate from `istiod` on startup (via the **SDS — Secret Discovery Service** protocol, part of the same xDS family covered in [service-mesh-architecture-and-sidecar-pattern.md](service-mesh-architecture-and-sidecar-pattern.md)).
2. `istiod` issues a **short-lived certificate** (default validity is measured in hours, not the months/years typical of a manually managed cert) tied to the service's identity — encoded using the **SPIFFE** standard (`spiffe://cluster.local/ns/default/sa/checkout-service` — identity is based on the Kubernetes ServiceAccount, not an IP address).
3. The sidecar **automatically rotates** the certificate well before it expires — this happens continuously and transparently, with zero manual certificate management, and critically, zero downtime (unlike a manually managed cert expiring and causing an outage, a classic real-world incident category).
4. When `checkout-service`'s sidecar connects to `payment-service`'s sidecar, both present their certificates and verify each other — the connection is only established if both sides' identities check out.

### Why short-lived, auto-rotated certificates matter
A stolen long-lived certificate is a long-lived security problem. A stolen short-lived certificate (expiring in hours) drastically shrinks the window an attacker can actually use it — this is a meaningfully stronger security posture than typical manually-issued, long-lived internal certificates, achieved specifically *because* automation makes frequent rotation practical (nobody would manually rotate certs every few hours).

---

## 4. Enabling and Enforcing mTLS

### PeerAuthentication — controlling mTLS enforcement
```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system    # applies mesh-wide when placed in the root/system namespace
spec:
  mtls:
    mode: STRICT              # reject any connection that isn't mTLS-encrypted
```

| Mode | Behavior |
|---|---|
| `STRICT` | Only accepts mTLS connections — plaintext connections are rejected outright |
| `PERMISSIVE` | Accepts both mTLS and plaintext — the default during migration, so services not yet meshed can still talk to meshed ones |
| `DISABLE` | No mTLS enforcement at all |

**Migration pattern**: real clusters are rarely 100% meshed on day one. `PERMISSIVE` mode is specifically designed for this — it lets you onboard services onto the mesh gradually (which get mTLS automatically once meshed) while still-unmeshed services keep working over plaintext in the meantime, then flip to `STRICT` mesh-wide once everything is onboarded.

### AuthorizationPolicy — controlling *who* can call *what*
mTLS answers "is this really `checkout-service` calling?" — `AuthorizationPolicy` answers "is `checkout-service` actually *allowed* to call this?" These are separate, complementary layers.

```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: payment-service-policy
  namespace: default
spec:
  selector:
    matchLabels:
      app: payment-service
  action: ALLOW
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/default/sa/checkout-service"]  # only THIS identity may call
      to:
        - operation:
            methods: ["POST"]
            paths: ["/charge"]
```
**Example scenario**: `payment-service` should only ever be called by `checkout-service` — not by `fraud-detection-service`, not by some other team's unrelated microservice that happens to know the internal DNS name. This policy enforces that at the network layer, cryptographically, regardless of what any application-level authorization code does or doesn't do — a genuine defense-in-depth layer, not a replacement for application-level checks, but a strong backstop if application logic has a bug or is bypassed.

### Default-deny (a zero-trust best practice)
```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: deny-all-default
  namespace: default
spec:
  {}   # empty spec with no rules = deny everything by default
```
Then add explicit `ALLOW` policies (like the `payment-service-policy` example above) for exactly the communication paths that should be permitted. This is the zero-trust posture: **nothing is allowed unless explicitly permitted**, rather than the more common but weaker default of "everything internal is allowed unless explicitly blocked."

---

## 5. Zero-Trust Networking — the Underlying Principle

"Zero trust" means: **never trust a connection just because of where it came from on the network** (internal VPC, same cluster, same namespace) — always verify identity and authorization explicitly, every time, regardless of network location.

| Traditional ("perimeter") security model | Zero-trust model |
|---|---|
| Strong firewall at the network edge; internal traffic implicitly trusted | Every connection, internal or external, is authenticated and authorized explicitly |
| A compromised internal Pod can often talk to anything else internal, freely | A compromised Pod's sidecar still enforces mTLS + AuthorizationPolicy — it can only reach what it's explicitly allowed to |
| Relies on network segmentation (VLANs, subnets, firewall rules) as the primary control | Relies on cryptographic identity (SPIFFE/mTLS) as the primary control, with network segmentation as a secondary layer |

A service mesh is one of the most practical ways to actually implement zero-trust principles at the microservices layer, because it makes the "hard" parts (issuing/rotating certificates for every service, enforcing per-service authorization) automatic rather than something every team has to build themselves.

---

## 6. Practical Considerations

- **`PERMISSIVE` mode is your migration friend, not a long-term end state** — plan to reach `STRICT` mesh-wide; a mesh stuck in `PERMISSIVE` indefinitely doesn't actually give you the enforcement guarantee, just the *capability*.
- **Health check / liveness probe traffic from the kubelet is NOT mTLS-encrypted** (the kubelet itself isn't part of the mesh) — this is exactly why the port-exclusion annotation shown in [service-mesh-architecture-and-sidecar-pattern.md](service-mesh-architecture-and-sidecar-pattern.md) exists; without it, `STRICT` mode can break kubelet health checks.
- **Authorization policies should default-deny and explicitly allow**, not the reverse — an accidentally-too-permissive default is a much easier mistake to make (and a much worse one) than an accidentally-too-restrictive one that simply breaks a call and gets noticed immediately.
- **mTLS is not a substitute for application-level authentication/authorization** (user login, API keys, OAuth) — it secures and authenticates *service-to-service* traffic; a user-facing API still needs its own separate auth layer for actual end-user identity.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
