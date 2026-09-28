# SPIRE — Complete Notes

## 1. Beginner

### What is SPIRE?
- **SPIRE** (the SPIFFE Runtime Environment) is the production-ready, **CNCF graduated** implementation of **SPIFFE** — the Secure Production Identity Framework For Everyone.
- SPIFFE is a *specification*: it defines a standard way to identify workloads (services, not humans) cryptographically. SPIRE is the software that actually implements that spec — issues identities, verifies workloads, rotates credentials.
- Originally built at Scytale, donated to CNCF, graduated in 2022.

### The Core Problem It Solves
Traditional service-to-service auth relies on **static, long-lived secrets**:
```
payment-service --[API key: "sk_live_xJ8..."]--> inventory-service
```
Problems with this model:
- The key can leak (logged by accident, committed to git, exposed in a crash dump) and keeps working until someone manually rotates it.
- It proves nothing about *where* the request actually came from — anything holding the key can impersonate `payment-service`.
- Rotating it across every consumer without downtime is genuinely hard, so in practice it rarely happens on a healthy cadence.
- It doesn't scale across clusters, clouds, VMs, and bare metal — each environment ends up with its own bespoke secret-distribution mechanism.

SPIRE replaces "prove who you are with a secret you were handed" with "prove who you are by having SPIRE **independently verify** what you actually are, then issue you a short-lived cryptographic identity":
```
payment-service pod starts
        |
        v
SPIRE Agent (on the same node) asks the kernel/runtime:
  "what process is this, really? what k8s ServiceAccount, namespace, pod labels?"
        |
        v
Agent verifies this against a Registration Entry on SPIRE Server
        |
        v
SPIRE issues an SVID (a short-lived X.509 cert) encoding:
  spiffe://example.org/ns/prod/sa/payment-service
        |
        v
payment-service presents this SVID to inventory-service for mTLS —
no static secret ever existed
```

### SPIFFE ID
A **SPIFFE ID** is a URI that names a workload's identity:
```
spiffe://<trust-domain>/<path>
spiffe://example.org/ns/production/sa/payment-service
```
- **Trust domain** (`example.org`): the administrative boundary — usually one org, one SPIRE Server deployment (or federation of them).
- **Path**: however you want to structure identity — commonly derived from Kubernetes namespace + ServiceAccount, or a custom scheme (`/region/us-east/service/checkout`).
- It's an *identity*, not a network address — it doesn't resolve to an IP, it just names "this workload."

### SVID — SPIFFE Verifiable Identity Document
The actual credential that proves a SPIFFE ID. Two forms:

| Type | What it is | Typical use |
|---|---|---|
| **X.509-SVID** | A short-lived X.509 certificate with the SPIFFE ID embedded in the `URI SAN` field | mTLS between services (the mainstream case) |
| **JWT-SVID** | A short-lived signed JWT with the SPIFFE ID as the `sub` claim | Cases where mTLS isn't practical — e.g. calling through an L7 proxy/API gateway that terminates TLS |

Both are deliberately **short-lived** (SPIRE's default is about 1 hour for X.509-SVIDs) and auto-rotated — same rationale as Istio's cert rotation: a stolen SVID is only useful for a short window.

### Core Concepts

| Term | Meaning |
|---|---|
| **Trust Domain** | The administrative/security boundary a set of identities belongs to, e.g. `example.org` |
| **SPIFFE ID** | URI-based workload identity: `spiffe://trust-domain/path` |
| **SVID** | The cryptographic proof of a SPIFFE ID — X.509 cert or JWT |
| **SPIRE Server** | Central authority: holds registration entries, signs SVIDs, acts as the trust domain's CA |
| **SPIRE Agent** | Runs on every node, attests the node itself, then attests and serves workloads on that node |
| **Attestation** | The process of independently verifying a claim ("this node is really EC2 instance i-0abc", "this process is really running as ServiceAccount payment-service") rather than trusting a self-declared identity |
| **Registration Entry** | A rule on SPIRE Server mapping a selector (e.g. k8s ServiceAccount) to a SPIFFE ID to issue |
| **Workload API** | The local (usually Unix domain socket) API a workload calls to fetch its own SVID — no credentials needed to call it, because the call itself is attested by *who's calling* |

---

## 2. Intermediate

### Architecture
```
                        +---------------------+
                        |    SPIRE Server      |  <- CA for the trust domain
                        |  - Registration       |
                        |    Entries (DB)       |
                        |  - Signs SVIDs         |
                        +---------------------+
                             ^        ^
                     (node attestation,
                      SVID signing requests)
                             |        |
        +--------------------+        +--------------------+
        |                                                    |
+---------------+                                   +---------------+
| SPIRE Agent    |  (node A)                         | SPIRE Agent    |  (node B)
| - Node          |                                   | - Node          |
|   attestation    |                                   |   attestation    |
| - Workload       |                                   | - Workload       |
|   attestation    |                                   |   attestation    |
| - Local SVID     |                                   | - Local SVID     |
|   cache          |                                   |   cache          |
+---------------+                                   +---------------+
        ^                                                    ^
        | Workload API (Unix domain socket)                  |
        |                                                    |
+---------------+                                   +---------------+
| payment-service|                                   | inventory-svc  |
|  Pod            |                                   |  Pod            |
+---------------+                                   +---------------+
```

- **SPIRE Server**: the root of trust for the trust domain. Holds an internal CA (or integrates with an external one via a `UpstreamAuthority` plugin — e.g. Vault, AWS ACM PCA). Stores **Registration Entries** that say "a workload matching selector X should get SPIFFE ID Y." Does not talk directly to workloads.
- **SPIRE Agent**: a daemon on every node (DaemonSet in Kubernetes). Does two levels of attestation:
  1. **Node attestation** (once, at agent startup): proves the *node itself* is legitimate — e.g. "this node really is EC2 instance i-0abc123 in this AWS account" (via the `aws_iid` plugin), or "this node really is a valid Kubernetes node with this kubelet identity" (`k8s_psat` plugin using a projected ServiceAccount token).
  2. **Workload attestation** (continuous, per local process): proves a *specific process on this node* is really what it claims — e.g. "this PID really belongs to Kubernetes Pod `payment-service-7f9d`, in namespace `prod`, running as ServiceAccount `payment-service`" (via the `k8s` workload attestor, which inspects the container's cgroup to map PID → Pod).
- **Workload**: the actual application. It never holds a long-lived credential. It calls the **Workload API** over a local Unix domain socket; SPIRE Agent identifies the caller by inspecting the OS-level connection (which process/PID/UID opened the socket), matches it against registration entries, and streams back a fresh SVID — no bearer token or password is exchanged in that call.

### Why Attestation Is the Key Mechanic
This is the part that distinguishes SPIRE from "just handing out certs":

SPIRE never trusts a workload's *self-declared* identity ("I am payment-service, please give me a cert for that"). Instead:
1. The workload calls the Workload API with **no identity claim at all** — just "give me my SVID."
2. SPIRE Agent independently inspects the OS/runtime to determine facts about the calling process — its PID, its cgroup, and from the cgroup (in Kubernetes) which Pod and ServiceAccount that maps to.
3. Those independently-observed facts (called **selectors**) are matched against Registration Entries on SPIRE Server: "if selector = `k8s:ns:prod` AND `k8s:sa:payment-service`, issue `spiffe://example.org/ns/prod/sa/payment-service`."
4. Only if a match is found does SPIRE issue the SVID for that specific identity.

The workload can't lie about who it is, because it never gets to assert an identity in the first place — SPIRE derives the identity from verified, kernel/runtime-level ground truth. This is what makes SPIRE meaningfully stronger than "here's a shared secret, present it to prove who you are."

### Registration Entry Example (registering a workload)
```bash
spire-server entry create \
  -parentID spiffe://example.org/ns/spire/sa/spire-agent \
  -spiffeID spiffe://example.org/ns/prod/sa/payment-service \
  -selector k8s:ns:prod \
  -selector k8s:sa:payment-service
```
- `-parentID`: which attested SPIRE Agent (identified by its own node SPIFFE ID) is allowed to serve this entry — ties workload identity to a specific trusted node population.
- `-selector`: the independently-verifiable facts that must match (namespace + ServiceAccount here; could also select on pod labels, container image, etc.).
- `-spiffeID`: the identity issued when the selectors match.

### Fetching an SVID from Inside a Workload
```bash
# exec into the workload's container (assuming spire-agent's socket is mounted in)
spire-agent api fetch x509 \
  -socketPath /run/spire/sockets/agent.sock
```
This returns the current X.509-SVID, its private key, and the trust bundle (CA certs needed to verify *other* workloads' SVIDs) — everything needed to establish mTLS with another SPIFFE-identified peer.

### SPIRE and mTLS in a Service Mesh
SPIRE doesn't replace a service mesh's mTLS — it can **underpin** it. A mesh like Istio has its own built-in CA (`istiod`) issuing SPIFFE-formatted identities (see [security-and-mtls.md](../../Service%20Mesh/security-and-mtls.md) — Istio's certs already embed `spiffe://cluster.local/ns/default/sa/checkout-service`-style URIs). The difference: Istio's CA is scoped to that one mesh/cluster. SPIRE is designed to be the **identity provider across the whole estate** — VMs, bare metal, multiple Kubernetes clusters, multiple clouds — with Istio (or Envoy directly, via `istiod`'s pluggable CA support, or SPIRE's own Envoy SDS integration) consuming SPIRE-issued identities instead of minting its own. This matters once "the mesh" isn't the only place workloads live.

---

## 3. Advanced

### Federation Across Trust Domains
Two organizations, or two independently-operated clusters, each with their own SPIRE Server/trust domain, can **federate**: each side's SPIRE Server exchanges and trusts the other's root CA bundle.
```
Trust Domain A (example.org)  <--federation-->  Trust Domain B (partner.io)

spiffe://example.org/ns/prod/sa/checkout
   can now be verified by workloads in partner.io,
   and vice versa, without merging the two trust domains into one.
```
- Configured via `federates_with` on registration entries plus a `bundle endpoint` each server exposes for the other to fetch its trust bundle from.
- Use case: multi-cluster, multi-cloud, or cross-company workload identity (e.g. a partner's service calling into yours) without falling back to shared static secrets or VPN-level trust.

### Node Attestation Plugins (choose based on environment)
| Plugin | Verifies |
|---|---|
| `k8s_psat` | Node is a legitimate kubelet in a specific cluster, via a projected ServiceAccount token bound to the node |
| `aws_iid` | Node is a real EC2 instance, via the AWS Instance Identity Document |
| `gcp_iit` | Node is a real GCE instance, via GCP's Instance Identity Token |
| `azure_msi` | Node is a real Azure VM, via Azure Managed Service Identity |
| `join_token` | Manual one-time bootstrap token — for environments without a native attestation source (bare metal, on-prem) |
| `tpm_devid` | Hardware root of trust via TPM — highest assurance, for bare-metal/edge |

### Workload Attestation Plugins
| Plugin | Verifies (selectors produced) |
|---|---|
| `k8s` | Pod namespace, ServiceAccount, labels, image, owner (Deployment/StatefulSet) — via cgroup-to-Pod mapping |
| `docker` | Container labels/image, for non-Kubernetes Docker workloads |
| `unix` | Unix UID/GID/path of the calling process — for plain VM/bare-metal workloads |

### Storage and High Availability
- SPIRE Server's Registration Entries and signed data live in a backing datastore — SQLite for small/dev setups, **PostgreSQL/MySQL** for production, shared across a highly-available Server cluster.
- Multiple SPIRE Server replicas can run behind a load balancer, all reading/writing the same datastore, for HA — Agents fail over between them transparently.
- The signing key itself (the trust domain's root CA key) is the highest-value secret in the whole system — production deployments typically use an `UpstreamAuthority` plugin (HashiCorp Vault, AWS Private CA, or an existing enterprise PKI) rather than SPIRE Server's self-signed default, so the private key material is managed by dedicated KMS/HSM-backed infrastructure instead of living on the SPIRE Server's disk.

### Security Properties Worth Internalizing
- **Short SVID TTLs (minutes-to-hours) are the default posture**, not an advanced hardening step — this is what actually neutralizes credential theft as a durable attack, since a leaked SVID expires almost immediately and can't be manually "revoked" fast enough to matter anyway at that timescale.
- **Attestation, not possession, is the root of trust.** Nothing a workload can say about itself is trusted — SPIRE always re-derives identity from the environment (kernel/cgroup/cloud metadata) at every SVID issuance.
- **The Workload API socket's local-only exposure is load-bearing.** It must never be exposed over the network — its entire security model depends on SPIRE Agent being able to introspect the literal OS-level connection to identify the caller. Exposing it remotely would let anyone claim to be any locally-attested workload.
- **SPIRE Agent's cache is also sensitive**: agents cache SVIDs in memory (and optionally on disk, encrypted) to survive brief SPIRE Server outages — worth knowing when reasoning about blast radius if a node is compromised.

### Common Failure Modes
| Symptom | Likely cause |
|---|---|
| Workload gets no SVID / times out on Workload API call | No matching Registration Entry for that workload's selectors — check `spire-server entry show` |
| Agent won't join the server | Node attestation failing — wrong node attestor plugin config, or clock skew invalidating attestation tokens |
| SVID issued but wrong SPIFFE ID | Selector too broad/narrow, or multiple entries matching unexpectedly — entries are matched by selector set, review overlaps |
| Federation not working | Bundle endpoint unreachable, or `federates_with` not set on the relevant registration entries on both sides |
| Cross-cluster calls failing mTLS validation | Trust bundle not refreshed/propagated to the peer trust domain after a CA rotation |

### Integration with the Wider CNCF Ecosystem
- **Istio**: can be configured to use SPIRE as its CA (instead of `istiod`'s built-in one) via the `istio-agent`/SDS integration, unifying mesh identity with fleet-wide SPIFFE identity.
- **Envoy**: consumes SVIDs directly via SDS (Secret Discovery Service) — SPIRE ships an SDS-compatible agent socket precisely so Envoy sidecars can fetch identity without app-level code changes.
- **cert-manager**: complementary, not competing — cert-manager typically manages *ingress/external-facing* TLS certs; SPIRE is for *workload-to-workload* identity. Some setups use `cert-manager-csi-driver-spiffe` to expose SPIFFE identities as regular Kubernetes-mounted certs for apps that can't speak the Workload API directly.
- **OPA/Kyverno**: SPIFFE IDs from validated SVIDs are a strong, unspoofable input for policy decisions ("only `spiffe://example.org/ns/ci/sa/deployer` may call this admission webhook").

---

## Quick Revision — SPIRE
- SPIRE = production implementation of the SPIFFE spec: cryptographic, non-static workload identity.
- SPIFFE ID: `spiffe://trust-domain/path` — a URI naming an identity, not an address.
- SVID: the proof — X.509-SVID (mTLS) or JWT-SVID (bearer, for proxies/gateways). Always short-lived, auto-rotated.
- Architecture: SPIRE Server (CA + registration entries) + SPIRE Agent (per node: node attestation once, workload attestation continuously) + Workload API (local socket, no credentials needed to call it).
- **Attestation is the core mechanic**: SPIRE independently verifies what a workload *is* (via kernel/cgroup/cloud-metadata facts) rather than trusting what it *claims* to be.
- Registration Entry = selector(s) → SPIFFE ID mapping, scoped to a parent (trusted agent/node).
- Federation lets two trust domains (clusters, clouds, companies) trust each other's identities without merging into one.
- Underpins mTLS in a service mesh (Istio) but scopes wider — across clusters/clouds/VMs/bare metal, not just inside one mesh.
- Workload API socket must stay local-only — that's the entire basis of its security model.
- Production key management goes through an `UpstreamAuthority` (Vault, AWS Private CA) rather than SPIRE Server's self-signed default.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
