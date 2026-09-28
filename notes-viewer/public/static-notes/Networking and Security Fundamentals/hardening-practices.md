# Hardening Practices — Complete Notes

## 1. Beginner

### What is Hardening?
**Hardening** is the process of reducing a system's attack surface by removing unnecessary functionality, tightening configuration defaults, and applying the principle of **least privilege** — everything gets only the access it strictly needs, nothing more. It's a continuous discipline (patching, config drift correction), not a one-time checklist you run once and forget.

### Why Hardening Matters (The Layered Defense Argument)
Firewalls and TLS ([firewalls.md](firewalls.md), [tls-and-certificates.md](tls-and-certificates.md)) control what can *reach* a system and whether traffic *in transit* is protected. Hardening is the last line of defense — **assuming an attacker does get through**, how much damage can they actually do? A hardened host with a compromised service still limits lateral movement, data exposure, and persistence.

### The CIS Benchmarks
The **Center for Internet Security (CIS) Benchmarks** are the industry-standard, freely available hardening checklists for operating systems (Ubuntu, RHEL, Windows), cloud platforms (AWS, Azure, GCP), container runtimes (Docker, Kubernetes), and major applications. Structured into numbered, testable controls (e.g., "5.2.1 Ensure permissions on /etc/ssh/sshd_config are configured") — most automated hardening tools (below) implement CIS Benchmark checks directly.

### Baseline Hardening Steps for a Fresh Linux Server
1. **Apply all security updates immediately** and enable automated patching for critical updates (`unattended-upgrades` on Debian/Ubuntu, `dnf-automatic` on RHEL).
2. **Create a non-root user** for daily operations; disable direct root login.
3. **Disable password authentication for SSH**, use key-based auth only.
4. **Change the default SSH port** only as defense-in-depth noise reduction (NOT a real security control — don't rely on it alone).
5. **Enable a host firewall** (ufw/firewalld/nftables) with default-deny inbound — see [firewalls.md](firewalls.md).
6. **Remove/disable unused services and packages** — every running service is attack surface.
7. **Set up centralized logging** so host compromise attempts are visible — see [Monitoring & Logging](../Monitoring%20and%20Loggin/index.md).

---

## 2. Intermediate

### SSH Hardening (`/etc/ssh/sshd_config`)
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
X11Forwarding no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers deploy admin
Protocol 2
```
- **Key-based auth only**: SSH keys (ideally Ed25519, not older RSA-1024/2048) are effectively immune to brute force compared to passwords.
- **`AllowUsers`/`AllowGroups`**: explicit allowlist instead of "any valid account can SSH in."
- Consider **SSH certificate authorities** (Vault SSH secrets engine, `step-ca`) for fleets — short-lived signed certs instead of long-lived static keys distributed to every host, so revocation/rotation doesn't mean touching every `authorized_keys` file.
- **Fail2ban / CrowdSec**: monitor auth logs, automatically firewall-block IPs after repeated failed login attempts — cheap, effective noise reduction against automated scanning/brute-force.

### Linux Kernel & Sysctl Hardening
```
# /etc/sysctl.d/99-hardening.conf
net.ipv4.conf.all.rp_filter = 1          # reverse-path filtering (anti-spoofing)
net.ipv4.tcp_syncookies = 1              # SYN flood protection
net.ipv4.conf.all.accept_redirects = 0   # ignore ICMP redirects (spoofing vector)
net.ipv4.conf.all.send_redirects = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1 # smurf attack mitigation
kernel.randomize_va_space = 2            # full ASLR
fs.suid_dumpable = 0                     # no core dumps from setuid processes (info leak)
```

### File System & Permissions
- **umask**: default `022` gives world-readable files; tighten to `027` in sensitive environments so new files aren't group/world-readable by default.
- Set correct ownership/permissions on sensitive files: `chmod 600` on private keys, `chmod 644` + root ownership on config files that shouldn't be world-writable.
- **`noexec`/`nosuid`/`nodev`** mount options on `/tmp`, `/var/tmp`: prevents executing binaries or exploiting setuid binaries staged in world-writable temp directories — a common privilege-escalation vector.
- See [Linux Permissions](../scripting/linux-permissions.md) for the full chmod/chown/ACL reference this builds on.

### Least Privilege — IAM & Service Accounts
- Every service/process should run as its own dedicated, minimally-privileged user — never run application processes as `root` unless a specific, unavoidable capability requires it (and even then, prefer granting just that Linux **capability** via `setcap` instead of full root).
- Cloud IAM: scope roles to exactly the actions/resources needed (no `*:*`), use workload identity (IRSA/Workload Identity Federation) instead of long-lived static credentials — full treatment in [IAM & Least Privilege](../Security%20in%20DevOps/iam-and-least-privilege.md).
- Kubernetes: `securityContext.runAsNonRoot: true`, drop all Linux capabilities and add back only what's needed (`capabilities: drop: [ALL]`), `readOnlyRootFilesystem: true` where the app allows it — see [Container & Image Security](../Security%20in%20DevOps/container-and-image-security.md).

### Patch Management Strategy
- **Critical/security patches**: apply fast, ideally automated, on a short cadence (days, not months).
- **Regular patches**: scheduled maintenance windows, tested in staging first.
- Track EOL (end-of-life) dates for OS versions/major dependencies proactively — running unsupported software with no security patch stream at all is a much bigger risk than any single missed CVE.
- Vulnerability scanning feeds this process — see [SAST, DAST & Code Scanning](../Security%20in%20DevOps/sast-dast-and-code-scanning.md) and [Container & Image Security](../Security%20in%20DevOps/container-and-image-security.md) for the scanning tooling (Trivy, Grype, Clair) that surfaces what needs patching.

---

## 3. Advanced

### Automated Hardening & Compliance Tooling
| Tool | What it does |
|---|---|
| **OpenSCAP** | Scans hosts against SCAP/CIS/STIG profiles, generates compliance reports, can auto-remediate |
| **Lynis** | Lightweight, agentless Linux security auditing — quick actionable hardening suggestions |
| **CIS-CAT** | Official CIS Benchmark assessment tool |
| **Ansible/Chef/Puppet hardening roles** | Codify CIS Benchmark controls as reusable, idempotent configuration — see [Ansible](../Configuration%20Management/ansible/ansible.md), [Puppet](../Configuration%20Management/puppet/puppet.md), [Chef](../Configuration%20Management/chef/chef.md) |
| **AWS Config / Azure Policy / GCP Security Command Center** | Continuous cloud-resource compliance drift detection against benchmarks |

Baking hardening into **golden images** (Packer-built AMIs with CIS controls pre-applied) and configuration management roles applied at boot means every new instance starts hardened by default, instead of hardening being a manual post-provisioning step that drifts over time.

### Mandatory Access Control: SELinux & AppArmor
Beyond standard Unix permissions (discretionary access control — the file owner decides), **Mandatory Access Control (MAC)** enforces system-wide policy that even root can't easily override:
- **SELinux** (RHEL/Fedora/CentOS default): label-based, extremely granular, notoriously complex to author policy for — `setenforce 0` to temporarily disable for debugging (never leave disabled in production), `audit2allow` to help generate policy from denial logs.
- **AppArmor** (Ubuntu/Debian default): path-based, simpler profile syntax than SELinux, easier to reason about and adopt incrementally per-application.
- Both confine what a compromised process can actually *do* even if it escapes its intended logic — e.g., a compromised web server process denied from reading `/etc/shadow` or spawning a shell, regardless of the Unix permissions on those paths.

### Container & Kubernetes Hardening (Cross-Reference)
This repo already has dedicated deep-dives — the summary connective tissue:
- [Docker Security](../docker/docker-security.md): non-root containers, dropped capabilities, seccomp/AppArmor profiles, image scanning, read-only root filesystems, secrets handling.
- [Container & Image Security](../Security%20in%20DevOps/container-and-image-security.md): base image minimization (distroless/scratch), SBOM generation, image signing (cosign), admission control (Kyverno/Gatekeeper) enforcing hardening policy at deploy time.
- Kubernetes-specific: **Pod Security Standards** (`restricted` profile), disabling the default service account token auto-mount where unneeded, RBAC least privilege, NetworkPolicy default-deny (see [firewalls.md](firewalls.md#kubernetes-networkpolicy)), and etcd encryption at rest.

### Audit Logging & Runtime Integrity
- **auditd** (Linux): kernel-level audit trail of security-relevant events (file access, privilege escalation, syscalls) — the forensic backbone for incident investigation.
- **File Integrity Monitoring (FIM)**: tools like AIDE/Tripwire baseline critical system files' checksums and alert on unexpected changes — detects tampering/persistence mechanisms that bypass normal logging.
- **Runtime security** (Falco, Cilium Tetragon): eBPF-based detection of anomalous *runtime* behavior (unexpected shell spawned in a container, unexpected outbound connection) — catches what static hardening/scanning can't, because it observes actual behavior instead of configuration.

### Immutable Infrastructure as a Hardening Strategy
Rather than patching a live, long-running server (which accumulates configuration drift and ad-hoc manual fixes over time), **immutable infrastructure** rebuilds instances from a fresh, hardened, patched image and replaces old ones entirely — drift becomes structurally impossible because nothing is ever mutated in place. This is the same principle underlying [Blue-Green Deployment](../Deployment/Blue-Green%20Deployment/blue-green-deployment.md) and golden-image pipelines, applied specifically as a security control rather than just a deployment strategy.

### Secrets & Credential Hygiene
- Never bake secrets into images/AMIs/container layers — inject at runtime via a secrets manager (Vault, AWS Secrets Manager, external-secrets-operator) — full treatment in [Secrets Management](../Security%20in%20DevOps/secrets-management.md).
- Rotate credentials on a schedule and immediately on suspected exposure; prefer short-lived dynamic credentials over long-lived static ones wherever the tooling supports it (matches the [TLS cert rotation](tls-and-certificates.md#rotation-automation-checklist) philosophy — shorter lifetime forces automation and shrinks blast radius).

### Hardening Checklist Summary (Host-Level)
- [ ] All security patches applied; automated patching enabled for critical updates.
- [ ] Root login disabled; SSH key-only auth; `AllowUsers` scoped.
- [ ] Host firewall default-deny inbound.
- [ ] Unused services/packages removed.
- [ ] Non-root service accounts; capabilities dropped to minimum needed.
- [ ] `/tmp`, `/var/tmp` mounted `noexec,nosuid,nodev`.
- [ ] SELinux/AppArmor enforcing (not disabled/permissive) in production.
- [ ] Centralized logging + auditd enabled and shipped off-host (so a compromised host can't erase its own trail).
- [ ] Secrets injected at runtime, never baked into images.
- [ ] Golden image/config-management pipeline applies hardening automatically to every new instance — no manual post-boot hardening step.

---

## Quick Revision — Hardening
- Hardening = least privilege + minimal attack surface + defense assuming perimeter controls eventually fail.
- CIS Benchmarks are the industry-standard checklist; OpenSCAP/Lynis/CIS-CAT automate assessment, Ansible/Puppet/Chef codify remediation.
- SSH: keys only, no root login, `AllowUsers`, consider SSH CAs for fleets instead of static distributed keys.
- SELinux/AppArmor = Mandatory Access Control — confines what even a compromised/root process can do, beyond standard Unix permissions.
- `noexec/nosuid/nodev` on `/tmp` blocks a classic privilege-escalation staging pattern.
- Immutable infrastructure (rebuild, don't patch-in-place) structurally prevents configuration drift.
- Runtime security (Falco/Tetragon) catches anomalous behavior that static config hardening and scanning both miss.
- Bake hardening into golden images/config management so every new instance starts hardened — don't rely on manual post-provisioning steps.

## Related Notes
- [Networking & Security Fundamentals — Index](index.md)
- [Firewalls](firewalls.md)
- [DevSecOps Overview](../Security%20in%20DevOps/devsecops-overview.md)
- [IAM & Least Privilege](../Security%20in%20DevOps/iam-and-least-privilege.md)
- [Container & Image Security](../Security%20in%20DevOps/container-and-image-security.md)
- [Docker Security](../docker/docker-security.md)
- [Secrets Management](../Security%20in%20DevOps/secrets-management.md)
- [Linux Permissions](../scripting/linux-permissions.md)
