# VAPT (Vulnerability Assessment & Penetration Testing) — Complete Notes

> Part of [`Security in DevOps/`](./). Related: [SAST/DAST & Code Scanning](./sast-dast-and-code-scanning.md), [Container & Image Security](./container-and-image-security.md), [Hardening Practices](../Networking%20and%20Security%20Fundamentals/hardening-practices.md), [TLS & Certificates](../Networking%20and%20Security%20Fundamentals/tls-and-certificates.md).

## 1. Beginner

### VA vs PT
| | **Vulnerability Assessment (VA)** | **Penetration Testing (PT)** |
|---|---|---|
| Question answered | "What weaknesses exist?" (breadth) | "Can an attacker actually exploit them, and how far can they get?" (depth) |
| Method | Mostly automated scanning + validation | Manual, attacker-style exploitation, chaining issues |
| Output | List of vulnerabilities with severity | Proven attack paths, impact, evidence |
| Frequency | Continuous / weekly / monthly | Periodic (yearly, after major changes, for compliance) |
| Risk to systems | Low | Higher; needs rules of engagement |

**VAPT** = both together. It's often required by compliance (PCI-DSS, ISO 27001, SOC 2, and customer security questionnaires).

### Types of testing
- **By knowledge**: **black box** (no info, like an external attacker), **grey box** (some info/credentials), **white box** (full access to code/architecture).
- **By target**: external network (internet-facing IPs), internal network, **web application**, **API**, mobile app, **cloud configuration** (AWS IAM/S3/SG review), containers/Kubernetes, wireless, social engineering, and **VoIP** (SIP enumeration, toll fraud, eavesdropping).

### Severity: CVSS
CVSS scores 0–10: **Critical 9.0–10, High 7.0–8.9, Medium 4.0–6.9, Low 0.1–3.9**. Real prioritization also weighs exploitability (CISA **KEV** list, **EPSS** score), exposure (internet-facing?), and asset criticality.

---

## 2. Intermediate

### Methodology (PTES / OWASP WSTG / NIST SP 800-115)
1. **Scoping & Rules of Engagement**: targets (IPs, domains, apps), out-of-scope systems, test windows, allowed techniques (no DoS?), contacts, emergency stop, written authorization.
2. **Reconnaissance**: DNS/subdomains, exposed services, tech fingerprinting, leaked credentials.
3. **Scanning & enumeration**: ports/services/versions, known CVEs, misconfigurations.
4. **Vulnerability analysis**: validate findings and remove false positives.
5. **Exploitation**: prove impact safely.
6. **Post-exploitation**: privilege escalation, lateral movement, data access (within scope).
7. **Reporting**: executive summary plus technical findings (evidence, CVSS, reproduction steps, remediation).
8. **Remediation & retest**: fix, then verify closure.

### Common tools
| Area | Tools |
|---|---|
| Network discovery / ports | **Nmap**, Masscan |
| Vulnerability scanners | **Nessus**, **OpenVAS/Greenbone**, **Qualys**, Rapid7 InsightVM |
| Web/API | **Burp Suite**, **OWASP ZAP**, Nikto, sqlmap, ffuf/gobuster |
| Exploitation | Metasploit |
| TLS | **testssl.sh**, sslyze, `nmap --script ssl-enum-ciphers` |
| Cloud | **Prowler**, ScoutSuite, AWS Inspector, Security Hub |
| Containers/K8s | Trivy, kube-bench (CIS), kube-hunter |
| VoIP | SIPVicious (`svmap`, `svwar`), sngrep, Wireshark |

Some safe commands DevOps engineers often run themselves:
```bash
nmap -sV -sC -p- -T4 app.example.com            # all ports, versions, default scripts
nmap -sU -p 5060,10000-10010 voip.example.com     # UDP SIP/RTP exposure check
nmap --script ssl-enum-ciphers -p 443 app.example.com
./testssl.sh https://app.example.com              # protocols, ciphers, cert, known TLS vulns
curl -sI https://app.example.com | grep -iE 'strict-transport|content-security|x-frame|x-content-type'
prowler aws --severity critical high              # AWS config review
```

### Typical findings and the DevOps fix
| Finding | Fix |
|---|---|
| TLS 1.0/1.1 enabled, weak ciphers | TLS 1.2+ only, modern cipher suites (ELB security policy `ELBSecurityPolicy-TLS13-1-2-2021-06`), HSTS |
| Expired/self-signed certs | ACM / cert-manager with automatic renewal, expiry monitoring |
| Missing security headers | Add HSTS, CSP, X-Frame-Options, X-Content-Type-Options at the ingress/reverse proxy |
| Open management ports (22, 3389, 5038, 8021, DB ports) | Restrict Security Groups to VPN/bastion; use SSM Session Manager instead of public SSH/RDP |
| Outdated packages / known CVEs | Patch cycle (yum/dnf update, base image rebuilds), automated scanning in CI |
| Default credentials / weak passwords | Rotate, enforce policy, secrets manager |
| Directory listing / verbose errors / server version banners | `autoindex off`, `server_tokens off`, generic error pages |
| Public S3 buckets / over-permissive IAM | Block Public Access, least-privilege IAM, access analyzer |
| SQLi / XSS / IDOR | App code fix (dev team), WAF rule as a temporary virtual patch |
| SIP exposed to the world, no rate limiting | IP ACLs, Kamailio pike/ratelimit, fail2ban, strong SIP passwords, TLS/SRTP |

---

## 3. Advanced: the DevOps engineer's role in VAPT

- **Before the test**: agree scope; provide a **prod-like staging environment** where possible; whitelist the tester IPs in WAF/IDS (or not, if the goal is to test detection); take snapshots/backups; notify on-call and support; check the cloud provider's policy. **AWS allows pentesting of most services without pre-approval but prohibits DoS/flooding tests** (those need a separate request).
- **During**: monitor for impact, keep a contact channel open, and be ready to stop the test.
- **After**: **triage** findings (validate, remove false positives, assign an owner and severity), track each as a **Jira ticket** with an SLA (e.g. Critical 7 days, High 30, Medium 90), and fix through the normal change process (IaC/Ansible change, not a manual hotfix that drifts).
- **Retest** and get a **closure report** for auditors.
- **Shift left**: make VAPT a confirmation, not a discovery. Add SAST/SCA/secret scanning, image scanning, IaC scanning (Checkov/tfsec), DAST (ZAP baseline) in CI, and continuous cloud posture checks (Security Hub/Prowler), so the yearly pentest finds only the hard things.
- **Risk acceptance**: when a finding can't be fixed (legacy system), document the compensating controls (network isolation, WAF rule, monitoring) with sign-off and an expiry date.
