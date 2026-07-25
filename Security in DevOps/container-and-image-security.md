# Container and Image Security

Image vulnerability scanning, base image strategy, SBOMs, signing/verification, and Kubernetes admission control to enforce it all. For Dockerfile-level hardening (non-root, capabilities, seccomp, AppArmor, `--privileged`), see [Docker Security](../docker/docker-security.md) — this file goes broader, covering the image supply chain rather than the container runtime.

---

## 1. Image Vulnerability Scanning in Depth

Scanning finds known-vulnerable packages (OS packages and language dependencies) baked into an image's layers. The tools below are the SCA concept from [sast-dast-and-code-scanning.md](sast-dast-and-code-scanning.md) applied specifically to container images rather than a source repo's dependency manifest.

### Trivy

```bash
# Basic scan — prints every finding across all severities
trivy image myapp:1.4.0

# CI-appropriate: only fail on HIGH/CRITICAL, exit non-zero to block the pipeline
trivy image --severity HIGH,CRITICAL --exit-code 1 myapp:1.4.0

# Scan and ignore vulnerabilities with no fix available yet (common noise reducer)
trivy image --severity HIGH,CRITICAL --ignore-unfixed myapp:1.4.0

# Scan a filesystem or IaC directory, not just a built image
trivy fs ./
trivy config ./terraform/
```

### Grype

```bash
grype myapp:1.4.0
grype myapp:1.4.0 --fail-on high     # CI gate equivalent to Trivy's --exit-code
```

### Snyk Container

```bash
snyk container test myapp:1.4.0 --severity-threshold=high
```

### Interpreting scan output

A typical Trivy finding looks like:

```
myapp:1.4.0 (alpine 3.18.4)
==========================
Total: 3 (HIGH: 2, CRITICAL: 1)

┌─────────────┬────────────────┬──────────┬──────────┬───────────────┬───────────────┐
│   Library    │ Vulnerability  │ Severity │  Status  │ Installed Ver │  Fixed Ver    │
├─────────────┼────────────────┼──────────┼──────────┼───────────────┼───────────────┤
│ openssl     │ CVE-2023-5678  │ CRITICAL │ fixed    │ 3.1.2-r0      │ 3.1.4-r0      │
│ libcurl     │ CVE-2023-38545 │ HIGH     │ fixed    │ 8.2.1-r0      │ 8.4.0-r0      │
│ busybox     │ CVE-2022-48174 │ HIGH     │ affected │ 1.36.1-r2     │ (none)        │
└─────────────┴────────────────┴──────────┴──────────┴───────────────┴───────────────┘
```

How to triage this:
- **`Status: fixed`** means upgrading the package resolves it — usually as simple as bumping the base image tag or re-running the package manager at build time. Prioritize these; they're free wins.
- **`Status: affected` with `Fixed Ver: (none)`** means no upstream fix exists yet — you can't "fix" your way out today. Options: assess actual exploitability (is the vulnerable code path even reachable in your usage?), suppress with a documented justification and expiry (`.trivyignore` with a comment and a re-review date), or switch base image/package entirely if the risk is unacceptable.
- **Severity alone isn't the whole picture** — a CRITICAL in a package your app never invokes is lower real-world risk than a MEDIUM in your actual request-handling path. CVSS is a starting point for triage, not a final verdict.

---

## 2. Base Image Selection Strategy

The base image is the foundation of your entire attack surface — every package it ships is something a scanner can flag and an attacker can potentially exploit, whether your application uses it or not.

| Base image type | Attack surface | Debuggability | Typical use |
|---|---|---|---|
| Full OS (`ubuntu`, `debian`) | Large — full package manager, shell, many utilities | Easy — shell access, standard tools available | Avoid for production runtime images; fine for build stages |
| `-slim` variants (`node:20-slim`) | Reduced — trims docs, some utilities | Still has a shell | Reasonable middle ground when you need occasional shell access |
| Alpine (`node:20-alpine`) | Small — musl libc, minimal package set | Has `sh`, `apk` | Popular default; note musl-vs-glibc can occasionally break native dependencies compiled against glibc |
| Distroless (`gcr.io/distroless/*`) | Minimal — no shell, no package manager, no coreutils | Hard — no shell to exec into; debug via ephemeral debug containers | Strong default for production runtime images once you no longer need a shell |
| `scratch` | Effectively zero — no OS at all, just your binary | Hardest — nothing but your process | Statically compiled binaries (Go, Rust) with no OS dependencies at all |

### Trade-off in practice

```dockerfile
# Multi-stage: full toolchain for building, minimal image for running
FROM golang:1.22 AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /app ./cmd/server

# Final stage ships almost nothing an attacker (or scanner) can find
FROM gcr.io/distroless/static-debian12
COPY --from=build /app /app
USER nonroot:nonroot   # distroless images ship a built-in nonroot user
ENTRYPOINT ["/app"]
```

Distroless/scratch trade debuggability for attack surface — you can't `docker exec` in and run `curl` or `ps` because those binaries don't exist. For production, that's usually the right trade: fewer packages means fewer CVEs to track and a smaller platform for a compromised process to pivot from. For local development or images you need to actively troubleshoot inside, `-slim`/Alpine remain more convenient.

---

## 3. Software Bill of Materials (SBOM)

An SBOM is a **machine-readable inventory of every component in a piece of software** — every OS package, every language dependency, direct and transitive, with exact versions. Think of it as an ingredients label for your image.

### Why it matters

- **Supply chain transparency**: when a new CVE is disclosed (e.g., a Log4Shell-style event), you can grep every SBOM you've generated and know *immediately* which images are affected, without re-scanning everything from scratch.
- **Audit and compliance**: many regulatory/contractual requirements (and an increasing number of enterprise procurement processes) now require an SBOM be provided with delivered software.
- **Incident response speed**: "are we affected by CVE-X" becomes a lookup instead of a fire drill.

### Generating one

```bash
# Syft — generates an SBOM in several standard formats
syft myapp:1.4.0 -o spdx-json > sbom.spdx.json
syft myapp:1.4.0 -o cyclonedx-json > sbom.cyclonedx.json

# Docker's built-in SBOM command (wraps Syft)
docker sbom myapp:1.4.0
```

Example trimmed SPDX output:

```json
{
  "packages": [
    { "name": "openssl", "versionInfo": "3.1.2-r0", "SPDXID": "SPDXRef-Package-openssl" },
    { "name": "express", "versionInfo": "4.18.2", "SPDXID": "SPDXRef-Package-express" }
  ]
}
```

The two dominant formats are **SPDX** (Linux Foundation, broader legal/licensing metadata) and **CycloneDX** (OWASP, security-focused, native vulnerability-linking support) — most scanners consume either. Generate the SBOM as a CI artifact alongside the image build and store it (attached to the image as an attestation, or in an artifact registry) so it's available for the lifetime of that image, not just at build time.

---

## 4. Image Signing and Verification (cosign / Sigstore)

### Why signing matters

Without signing, anything that can write to your registry (a compromised CI credential, a malicious registry admin, or a MITM on an unauthenticated pull) can **replace a legitimate image with a tampered one**, and nothing downstream would notice — the tag still says `myapp:1.4.0`, it just isn't the image your pipeline actually built. Signing binds a cryptographic proof of origin to the image digest, so a deploy-time check can refuse anything that doesn't verify.

### Worked example: keyless signing with cosign

```bash
# Sign — keyless signing uses your CI identity (OIDC token) instead of a long-lived private key,
# so there's no signing key to steal or rotate
cosign sign myregistry/myapp:1.4.0

# Under the hood: cosign requests a short-lived certificate from Sigstore's Fulcio CA,
# binds it to your OIDC identity (e.g. "this GitHub Actions workflow, this repo, this ref"),
# signs the image digest, and publishes the signature + a transparency log entry to Rekor.

# Verify — anyone can check the signature without needing your private key
cosign verify \
  --certificate-identity=https://github.com/your-org/your-repo/.github/workflows/build.yml@refs/heads/main \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  myregistry/myapp:1.4.0
```

If someone swaps `myapp:1.4.0` in the registry for a tampered image, `cosign verify` fails — the new image's digest doesn't match what was signed, and there's no valid signature for it under the trusted identity. This is exactly the scenario described in [Docker Security §8](../docker/docker-security.md) — this file adds the Kubernetes-side enforcement in §5 below so an unsigned/tampered image can't just be deployed anyway even if someone forgets to check manually.

---

## 5. Admission Control — Enforcing These Policies in Kubernetes

Scanning and signing are only useful if something actually **enforces** them at deploy time — otherwise they're advisory, and a rushed or bypassed deploy can still ship a vulnerable or unsigned image. Kubernetes admission controllers intercept resource creation (e.g., a Pod being scheduled) and can reject it before it ever runs.

### Kyverno — block unsigned images

```yaml
# ClusterPolicy: reject any Pod whose image isn't signed by a trusted identity
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-signed-images
spec:
  validationFailureAction: Enforce   # Enforce = block; Audit = log only, useful for initial rollout
  rules:
    - name: verify-image-signature
      match:
        any:
          - resources:
              kinds: ["Pod"]
      verifyImages:
        - imageReferences:
            - "myregistry/*"          # scope enforcement to your own registry, not every public image
          attestors:
            - entries:
                - keyless:
                    subject: "https://github.com/your-org/*"
                    issuer: "https://token.actions.githubusercontent.com"
```

### OPA Gatekeeper — block images with critical CVEs (conceptual constraint)

```yaml
# ConstraintTemplate defines the rule; the Constraint below applies it.
# (Deeper Rego/Conftest patterns live in this repo's IaC Testing / Policy-as-Code notes —
# this is the container-security-specific instance of that broader pattern.)
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8sblockcriticalcve
spec:
  crd:
    spec:
      names:
        kind: K8sBlockCriticalCVE
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8sblockcriticalcve
        violation[{"msg": msg}] {
          input.review.object.metadata.annotations["scan.trivy.io/critical-count"] != "0"
          msg := "image has unresolved CRITICAL vulnerabilities — deployment blocked"
        }
---
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sBlockCriticalCVE
metadata:
  name: block-critical-cve-images
spec:
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]
```

This pattern assumes a scan result (e.g., a Trivy Operator scanning images already in-cluster, or a scan result written as an annotation by CI) is available for the admission controller to check against — the admission controller itself doesn't run the scan, it enforces a policy over the scan's *result*.

### Practical rollout

Both Kyverno and Gatekeeper support an **Audit/dry-run mode** before `Enforce`. Just as with CI severity gates (see [security-in-cicd-pipelines.md](security-in-cicd-pipelines.md)), start new admission policies in audit-only mode against real cluster traffic, review what *would* have been blocked, fix the legitimate backlog, and only then flip to enforcing — flipping straight to `Enforce` on day one against an unaudited cluster reliably breaks existing deployments.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
