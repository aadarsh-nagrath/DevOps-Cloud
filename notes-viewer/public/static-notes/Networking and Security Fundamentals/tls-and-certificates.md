# TLS & Certificates — Complete Notes

## 1. Beginner

### What is TLS?
**Transport Layer Security** encrypts and authenticates data in transit between two parties (e.g., a browser and a server). It's the successor to SSL (SSL 1/2/3 and TLS 1.0/1.1 are all deprecated/insecure — **TLS 1.2 and 1.3 are the only versions that should be in use today**). "SSL" is still used colloquially/in product names (e.g., "SSL certificate") even though the actual protocol running is TLS.

### What TLS Provides
1. **Confidentiality**: data is encrypted, can't be read by anyone intercepting it.
2. **Integrity**: any tampering with data in transit is detectable.
3. **Authentication**: the client can cryptographically verify the server's identity (and optionally vice versa — see mTLS below) via a certificate signed by a trusted authority.

### Symmetric vs Asymmetric Encryption (Why TLS Uses Both)
| | Symmetric | Asymmetric (Public-Key) |
|---|---|---|
| Keys | One shared secret key, same for encrypt/decrypt | A key pair — public key encrypts, private key decrypts (or vice versa for signing) |
| Speed | Fast | Much slower (100-1000x) |
| Key distribution problem | Both sides need the same secret — how do you share it securely first? | No shared secret needed — public key can be broadcast openly |
| TLS usage | Bulk data encryption after the handshake (AES, ChaCha20) | Used only during the handshake to authenticate + establish the symmetric key |

**Why both**: asymmetric crypto solves the "how do two strangers agree on a secret over an insecure channel" problem, but it's too slow for bulk data. So TLS uses asymmetric crypto briefly during the handshake to establish a shared symmetric key, then switches to fast symmetric encryption for the actual data.

### Certificates — What They Actually Are
An X.509 certificate binds a **public key** to an **identity** (a domain name), signed by a **Certificate Authority (CA)** that vouches for that binding. Key fields:
- **Subject**: who the cert is for (Common Name / Subject Alternative Names — the actual domain(s) covered).
- **Issuer**: the CA that signed it.
- **Validity period**: `notBefore` / `notAfter` — modern CA/Browser Forum rules cap public certs at **398 days max**.
- **Public key**: the server's public key.
- **Signature**: the CA's cryptographic signature over the above, provable against the CA's own public key.

### The Certificate Chain
```
Root CA (self-signed, in OS/browser trust store)
   └── Intermediate CA (signed by Root)
          └── Leaf/Server Certificate (signed by Intermediate, this is YOUR cert)
```
- Browsers/OSes ship with a built-in trust store of **Root CA** certificates. Root CAs almost never sign leaf certs directly — they sign **intermediate CAs**, which sign the actual server certs. This lets a Root CA's highly-sensitive private key stay offline while intermediates do the day-to-day signing (and can be revoked/rotated without touching the root).
- Servers must present the **full chain** (leaf + intermediates) — missing the intermediate is one of the most common real-world TLS misconfigurations ("works in my browser, fails from curl/mobile app" is a classic symptom, because some clients have cached the intermediate and others don't).

---

## 2. Intermediate

### The TLS 1.2 Handshake (Classic, still widely deployed)
```
Client                                          Server
  |------- ClientHello (supported ciphers) ----->|
  |<------ ServerHello + Certificate ------------|
  |<------ ServerKeyExchange, ServerHelloDone ----|
  |------- ClientKeyExchange -------------------->|
  |------- [ChangeCipherSpec], Finished --------->|
  |<------ [ChangeCipherSpec], Finished ----------|
  |======= Encrypted Application Data ===========|
```
- 2 round trips before any application data flows.
- Client verifies the server's certificate chain against its trust store, checks the hostname matches, checks expiry, checks revocation (OCSP/CRL).

### The TLS 1.3 Handshake (Current Standard, Faster & Simpler)
```
Client                                          Server
  |-- ClientHello + key_share (guessed cipher) -->|
  |<- ServerHello + key_share + Certificate + Finished -|
  |------- Finished ------------------------------>|
  |======= Encrypted Application Data ============|
```
- **1-RTT** (one round trip) instead of 2 — client guesses the key exchange parameters upfront instead of negotiating first.
- **0-RTT resumption**: for a server the client has connected to before, data can be sent on the very first flight (trades a small replay-attack risk for latency — only used for idempotent requests).
- Removes legacy/weak ciphers entirely (no more RC4, no static RSA key exchange) — every TLS 1.3 handshake provides **forward secrecy** by design (compromising the server's long-term private key later can't decrypt past recorded traffic).

### Cipher Suites
A cipher suite specifies the algorithms used for each part of the connection, e.g. `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256`:
- **ECDHE**: key exchange (Elliptic Curve Diffie-Hellman Ephemeral) — provides forward secrecy.
- **RSA**: authentication (the signature algorithm proving the server owns the cert).
- **AES_128_GCM**: bulk symmetric encryption + integrity (AEAD cipher).
- **SHA256**: hash function used in the handshake's key derivation.
- TLS 1.3 simplified this dramatically to a small fixed set of AEAD ciphers (AES-GCM, ChaCha20-Poly1305) — no more mixing/matching weak combinations.

### Certificate Verification Checklist (What a Client Actually Checks)
1. Chain builds up to a trusted root in the client's trust store.
2. Each signature in the chain is cryptographically valid.
3. None of the certs in the chain are expired.
4. The leaf cert's Subject Alternative Name matches the requested hostname.
5. None of the certs have been revoked (OCSP stapling or CRL check).
6. Key usage / extended key usage extensions permit this use (e.g., `serverAuth`).

### OCSP vs CRL (Revocation Checking)
- **CRL (Certificate Revocation List)**: CA publishes a full list of revoked cert serial numbers — clients download and check against it. Grows large, infrequently updated.
- **OCSP (Online Certificate Status Protocol)**: client (or server, via **OCSP stapling**) asks the CA in real time "is this specific cert still valid?" — smaller, faster, but a live OCSP query from every client leaks browsing metadata to the CA and adds latency; **OCSP stapling** fixes both by having the server periodically fetch and "staple" a signed, time-stamped OCSP response onto its own handshake.

### mTLS (Mutual TLS)
Standard TLS only authenticates the **server** to the client. mTLS adds the reverse: the **client also presents a certificate**, and the server verifies it — mutual, cryptographic, two-way identity verification. This is the backbone of zero-trust service-to-service auth in a service mesh — see [Service Mesh Security & mTLS](../Service%20Mesh/security-and-mtls.md) for the full Istio/Envoy implementation, cert rotation via SPIFFE/sidecar injection, and AuthorizationPolicy layered on top.

---

## 3. Advanced

### ACME & Let's Encrypt (Automated Certificate Issuance)
- **ACME (Automatic Certificate Management Environment)**: a protocol for automating certificate issuance/renewal without human interaction — the mechanism behind Let's Encrypt (free, automated, 90-day certs) and now widely supported by paid CAs too.
- **Domain validation flow (HTTP-01)**: CA gives you a random token → you serve it at `http://yourdomain/.well-known/acme-challenge/<token>` → CA fetches it to prove you control the domain → issues the cert.
- **DNS-01 challenge**: prove domain control by publishing a specific TXT record instead — the only option for wildcard certs (`*.example.com`) and works even for services with no public HTTP endpoint.
- **cert-manager** (Kubernetes): automates this entire lifecycle inside a cluster — watches Ingress/Certificate resources, requests certs from an ACME issuer, stores them as Secrets, and auto-renews before expiry. See [Kubernetes Ingress Deep Dive](../Service%20Mesh/kubernetes-ingress-deep-dive.md) for how it plugs into Ingress TLS termination.

### Certificate Pinning
Hardcoding (in a mobile app or client) which specific certificate/public key/CA is expected, rejecting connections even if a *different, otherwise-valid* cert is presented. Protects against a compromised or coerced CA issuing a rogue cert for your domain, at the cost of an operational hazard: **pinning to a cert that then expires or is rotated bricks the app** unless pin rotation is planned for in advance (multiple pins, backup pins).

### Forward Secrecy
A property where each session uses **ephemeral** key material (via ECDHE) that's discarded after the session — so even if an attacker later steals the server's long-term private key, they cannot decrypt previously recorded traffic (no way to derive the old session keys after the fact). Mandatory in TLS 1.3, optional-but-standard-practice in TLS 1.2.

### SNI (Server Name Indication)
The `ClientHello` includes the target hostname **in plaintext** so the server can present the correct certificate when hosting multiple TLS domains behind one IP (essential for cloud load balancers/CDNs serving thousands of domains off shared IPs). This plaintext hostname leak is exactly what **Encrypted Client Hello (ECH)**, an emerging TLS 1.3 extension, aims to close.

### Common TLS Failure Modes in Production
| Symptom | Likely Cause |
|---|---|
| Works in browser, fails via `curl`/API client | Missing intermediate certificate in the server's chain |
| Sudden total outage, no code change | Certificate expired (the #1 most common self-inflicted TLS outage) |
| Intermittent handshake failures under load | Handshake CPU cost (RSA key exchange) overwhelming server — mitigate with ECDHE + session resumption/tickets |
| Works for most clients, fails for old devices | Server dropped TLS 1.0/1.1 or weak ciphers that old clients still require — a deliberate, correct security trade-off, but needs a compatibility decision |
| MITM warning in corporate network | Corporate TLS-inspecting proxy re-signing traffic with its own CA — expected behavior on managed corporate devices, alarming everywhere else |

### Session Resumption (Performance)
- **Session IDs / Session Tickets**: let a returning client skip the full asymmetric handshake by resuming a previous session's negotiated key material — major latency win for repeat connections (keep-alive, CDNs).
- **TLS 1.3 PSK (Pre-Shared Key) resumption**: the modern mechanism, also what enables 0-RTT.

### Rotation Automation Checklist
- Automate renewal (ACME/cert-manager) well before expiry — never rely on a human remembering a calendar date.
- Alert on certs approaching expiry (e.g., 30/14/7 days out) as a safety net even with automation — see [Monitoring & Logging](../Monitoring%20and%20Loggin/index.md).
- Use short-lived certs (Let's Encrypt's 90-day default, or even shorter in service-mesh mTLS via SPIFFE, often hours) — shorter lifetime shrinks the blast radius of a leaked key and forces automation (a human can't manually renew hourly, so it *has* to be automated correctly).

---

## Quick Revision — TLS & Certificates
- TLS = confidentiality + integrity + authentication; asymmetric crypto sets up the handshake, symmetric crypto does the bulk encryption.
- Certificate chain: Root CA (trusted, offline) → Intermediate CA → Leaf cert — servers must send the full chain minus the root.
- TLS 1.3: 1-RTT handshake, forward secrecy by default, only strong AEAD ciphers, optional 0-RTT resumption.
- OCSP stapling > live OCSP > CRL for revocation checking (speed + privacy).
- mTLS = server AND client both present certs — the backbone of zero-trust service mesh auth.
- ACME automates issuance/renewal (HTTP-01 or DNS-01 challenge); DNS-01 is required for wildcard certs.
- Expired certificates are the single most common self-inflicted TLS production outage — automate renewal, alert well before expiry.
- SNI leaks the target hostname in plaintext during the handshake; ECH is the emerging fix.

## Related Notes
- [Networking & Security Fundamentals — Index](index.md)
- [Service Mesh: Security & mTLS](../Service%20Mesh/security-and-mtls.md)
- [Kubernetes Ingress Deep Dive](../Service%20Mesh/kubernetes-ingress-deep-dive.md)
- [Secrets Management](../Security%20in%20DevOps/secrets-management.md)
- [DNS Deep Dive](dns-deep-dive.md) — CAA records restricting which CAs may issue for a domain
