# Windows Administration, Proxies, VAPT & Jira — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Notes: [Windows Administration](../Windows%20Administration/windows-administration-for-devops.md), [Proxy Servers](../Networking%20and%20Security%20Fundamentals/proxy-servers.md), [VAPT](../Security%20in%20DevOps/vapt.md). Grouped **Junior → Mid → Senior**.

---

## Table of Contents
- [Junior Level (0–2 yrs)](#junior-level-02-yrs)
- [Mid Level (2–5 yrs)](#mid-level-25-yrs)
- [Senior Level (5+ yrs)](#senior-level-5-yrs)

---

## Junior Level (0–2 yrs)

### 1. What's the difference between CMD and PowerShell?
CMD is the legacy shell with text output. PowerShell is an object-oriented shell and scripting language: cmdlets (`Get-Service`, `Get-Process`) output .NET objects that you can filter (`Where-Object`), sort, and select without parsing text, which makes it the right tool for automation. Windows PowerShell 5.1 ships with Windows, and PowerShell 7 (`pwsh`) is the cross-platform successor.

### 2. Give Windows equivalents of common Linux troubleshooting commands.
`ps`/`top` → `tasklist` / `Get-Process`; `kill` → `taskkill /PID x /F` / `Stop-Process`; `systemctl` → `sc query` / `Get-Service` / `Restart-Service`; `ss -tulpn` → `netstat -ano` / `Get-NetTCPConnection`; `ip a` → `ipconfig /all`; `dig` → `nslookup` / `Resolve-DnsName`; `nc -zv host port` → `Test-NetConnection host -Port 443`; `traceroute` → `tracert`; `grep` → `findstr` / `Select-String`; `tail -f` → `Get-Content -Wait -Tail`; `journalctl` → Event Viewer / `Get-WinEvent`; `cron` → Task Scheduler / `schtasks`.

### 3. What is a forward proxy vs a reverse proxy?
A **forward proxy** sits in front of *clients* and makes outbound requests for them. It's used for egress control, filtering, caching, and audit (Squid, corporate proxies), and clients are configured to use it (`HTTP_PROXY`). A **reverse proxy** sits in front of *servers* and receives inbound requests for them. It's used for TLS termination, load balancing, routing, caching, and WAF (Nginx, HAProxy, ALB), and clients don't know it's there.

### 4. What's the difference between an HTTP proxy and a TCP proxy?
An HTTP (L7) proxy understands HTTP. It can route by host or path, add headers like `X-Forwarded-For`, cache, authenticate, and apply WAF rules. A TCP (L4) proxy just forwards bytes between IP:port pairs, so it works for any TCP protocol (databases, SMTP, SIP over TCP, TLS passthrough) but can't see content. Examples: HAProxy `mode http` vs `mode tcp`, Nginx `http {}` vs `stream {}`, and ALB vs NLB in AWS.

### 5. What is VAPT? How is a vulnerability assessment different from a penetration test?
VAPT is Vulnerability Assessment plus Penetration Testing. A **VA** is broad and mostly automated (Nessus, OpenVAS, Qualys): it lists known weaknesses with severities. A **PT** is deep and manual: an ethical hacker actually exploits and chains weaknesses to prove impact (Burp Suite, Metasploit). VA runs continuously; PT runs periodically, after major changes, or for compliance, and always under signed rules of engagement.

### 6. What is Jira, and how does a DevOps team use it?
Jira is Atlassian's issue and project tracker. DevOps teams use it for sprint and Kanban boards, for tracking stories, bugs, and tasks, for incident and problem tickets, for change requests (often via Jira Service Management with approvals), and for tracking VAPT and security findings with SLAs. Key concepts: projects, issue types (Epic → Story/Task/Bug → Sub-task), workflows (To Do → In Progress → In Review → Done), sprints, components, labels, and **JQL** for queries.

---

## Mid Level (2–5 yrs)

### 7. A Windows server's application is slow. How do you troubleshoot?
Start with **Task Manager / Resource Monitor** or `Get-Process | Sort CPU -Desc` to find the hot process across CPU, memory, disk, and network. Use **perfmon** counters (Processor Time, Available MBytes, Disk Queue Length, Network) for trends. Check **Event Viewer** System and Application logs for errors and crashes. Check whether Windows Update or Defender scans are running, disk space (`Get-Volume`), paging, and app pool recycling for IIS apps. On AWS, also check CloudWatch for CPU credit exhaustion on T-series instances and EBS throughput limits.

### 8. A Windows service won't start. Steps?
Check `Get-Service x` and the System event log (IDs 7000/7009/7023 give the error). Common causes: the service account password expired or the account is locked (`Get-ADUser`/`net user`), a dependency service is stopped (`sc qc x`), the port is already in use (`netstat -ano | findstr :8080`, then map the PID with `tasklist`), missing permissions on files or folders (`icacls`), or a bad config file. After fixing, set recovery options (restart on failure) and add monitoring.

### 9. How do you manage Windows servers with Ansible?
Ansible connects over **WinRM** (5985/5986, with NTLM, Kerberos, or CredSSP) or OpenSSH. No Python is needed on the target, because Ansible uses PowerShell-based modules from the `ansible.windows` and `community.windows` collections: `win_service`, `win_feature`, `win_package`, `win_updates`, `win_copy`, `win_regedit`, `win_user`. Use HTTPS WinRM with certificate validation in production, keep credentials in Ansible Vault, and keep playbooks idempotent like Linux ones.

### 10. Your app on a server behind a corporate proxy can't reach the internet, but `curl` works in your shell. Why?
The proxy environment variables are probably set in your shell but not for the service. Set them in a systemd drop-in (`Environment=HTTPS_PROXY=...`, then `daemon-reload`), for the Docker daemon, for containerd on Kubernetes nodes, and in the container environment. Also check case (some tools only read lowercase `https_proxy`), `NO_PROXY` (internal domains, `169.254.169.254`, `.svc`, cluster CIDRs), proxy auth (`407`), domain allow-lists (Squid `TCP_DENIED/403`), and TLS interception requiring the corporate CA in the trust store (`x509: unknown authority`). On Windows, system services use the **WinHTTP** proxy (`netsh winhttp show proxy`), not the user's browser proxy.

### 11. How does HTTPS work through a forward proxy?
The client sends `CONNECT host:443` to the proxy, the proxy opens a TCP tunnel and replies `200 Connection established`, and the client does the TLS handshake end to end through the tunnel. The proxy sees only the destination host (and SNI), not the content, unless it performs TLS interception with its own CA, which requires that CA to be trusted on clients and breaks certificate pinning.

### 12. How do you preserve the real client IP through proxies and load balancers?
At L7, use `X-Forwarded-For` / `X-Forwarded-Proto` (or the standard `Forwarded` header), and only trust them from known proxy IPs (Nginx `set_real_ip_from` + `real_ip_header`). At L4, use the **PROXY protocol** (enabled on both the sender and receiver, e.g. HAProxy `send-proxy`, Nginx `proxy_protocol`, or an NLB target-group attribute), or NLB client-IP preservation. In Kubernetes, `externalTrafficPolicy: Local` avoids kube-proxy SNAT.

### 13. A pentest report lists "TLS 1.0 enabled, weak ciphers, missing HSTS, SSH open to 0.0.0.0/0, outdated OpenSSL." How do you handle it?
Triage and validate each finding (reproduce with `testssl.sh`, `nmap --script ssl-enum-ciphers`, and SG review), assign an owner and severity, and create Jira tickets with SLAs. Fix through code and IaC, not by hand: set the ALB/NLB TLS policy to TLS 1.2+ only (e.g. `ELBSecurityPolicy-TLS13-1-2-2021-06`) and the modern Nginx `ssl_protocols`/ciphers; add HSTS and the other security headers at the ingress; restrict SSH in the Security Group to VPN/bastion, or remove it entirely in favour of SSM Session Manager; patch OpenSSL through the patch cycle or a base-image rebuild. Then request a **retest** and a closure report. Finally, prevent recurrence with config scanning in CI and posture checks (Prowler/Security Hub).

### 14. What are useful JQL queries and Jira integrations for DevOps?
JQL examples: `project = OPS AND status != Done AND priority in (Highest, High) ORDER BY created DESC`; `assignee = currentUser() AND sprint in openSprints()`; `labels = vapt AND resolution = Unresolved AND created <= -30d` (overdue security findings). For integrations, include the issue key in branch names, commits, and PR titles (`OPS-123-fix-tls`) so GitHub/Bitbucket link them automatically. **Smart Commits** (`OPS-123 #comment fixed #time 1h #done`) update issues from commit messages. Jenkins and GitHub Actions plugins post build and deployment info to issues. Jira Automation rules transition tickets on PR merge or deploy. Release versions in Jira map to Git tags.

---

## Senior Level (5+ yrs)

### 15. How would you design controlled internet egress for private workloads in AWS?
Private subnets have no direct internet route. For AWS APIs, use **VPC endpoints** (S3/DynamoDB gateway endpoints; ECR, STS, SSM, and Secrets Manager interface endpoints), which cuts NAT costs and keeps traffic private. For third-party internet access, route through a **filtering layer**: AWS **Network Firewall** with domain allow-lists (stateful rules on SNI/Host), or a highly available **Squid proxy** fleet behind an NLB with domain ACLs and access logs, then a NAT Gateway. Log everything (VPC Flow Logs, proxy logs) to the SIEM, alert on denied or unknown destinations, and manage the allow-list as code with PR review. This limits data exfiltration and malware call-home, and it satisfies compliance auditors.

### 16. How do you integrate VAPT into the DevOps lifecycle instead of treating it as a once-a-year event?
Shift left so that the yearly pentest confirms rather than discovers:
- In CI: SAST, SCA/dependency scanning, secret scanning, image scanning (Trivy), and IaC scanning (Checkov/tfsec).
- Against staging: DAST (ZAP baseline/full scans).
- Continuously: authenticated vulnerability scanning of hosts (Nessus/Inspector), cloud posture management (Security Hub/Prowler), and TLS/header checks in synthetic monitoring.
- For findings: one intake in Jira with severity-based SLAs, owners, and dashboards of overdue items; fixes delivered through IaC/Ansible so they don't drift; documented risk acceptance with expiry dates and compensating controls.
- Pentests: on a schedule and after major architecture changes, with retests and closure evidence for auditors.

### 17. Your organization runs mixed Linux and Windows fleets. How do you keep operations consistent?
- **One configuration tool across both**: Ansible (WinRM/SSH), with shared roles where possible and a common inventory.
- **One patching process**: SSM Patch Manager or WSUS/Intune for Windows and dnf-automatic or SSM for Linux, with the same staged waves and reporting.
- **One access model**: SSO; SSM Session Manager instead of open SSH/RDP; LAPS or a secrets manager for local admin passwords.
- **One observability stack**: CloudWatch agent or OpenTelemetry/Prometheus `windows_exporter` alongside `node_exporter`, and Windows Event Logs shipped to the same ELK/Loki as syslog.
- **One CI/CD**: Jenkins with Linux and Windows agents or GitHub Actions runners.
- **Shared hardening baselines**: CIS benchmarks for both, enforced as code.
- Shared runbooks that show Linux and Windows commands side by side.

### 18. How do you use Jira (or similar) to run change management for production releases without slowing teams down?
Use risk-based change classes:
- **Standard changes** (pre-approved, low risk, automated, such as routine deploys via Argo CD/Jenkins with passing tests) are auto-created or auto-approved from the pipeline, with deploy info attached.
- **Normal changes** (schema migrations, network changes, carrier or VoIP routing changes) go through a lightweight approval in Jira Service Management, with the rollback plan, the test evidence, and a maintenance window.
- **Emergency changes** follow a fast path with retrospective review.

Link changes to incidents so you can measure change failure rate (a DORA metric), and use that data to keep moving more changes into the "standard" class. The goal is an audit trail and risk control without a manual CAB meeting for every deploy.
