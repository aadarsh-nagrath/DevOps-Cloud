# On-Prem & Banking Infrastructure (Linux Admin, VPN, Firewalls, Proxies, SSL/TLS, DR, Compliance) — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Written for DevOps roles at banks, NBFCs, payment companies and other regulated organizations, where much of the estate is still on-prem or hybrid. Basics are in [01 Linux](./01-linux-and-scripting-qna.md), [08 Networking & Security](./08-networking-and-security-fundamentals-qna.md), [22 Proxy/VAPT](./22-windows-proxy-vapt-jira-qna.md) and [12 DevSecOps](./12-security-devsecops-qna.md). This file adds the hands-on admin and regulated-environment questions.

---

## Table of Contents
- [Linux Administration](#linux-administration)
- [VPNs & Hybrid Connectivity](#vpns--hybrid-connectivity)
- [Firewalls & Network Segmentation](#firewalls--network-segmentation)
- [Proxy Servers](#proxy-servers)
- [SSL/TLS & Certificate Operations](#ssltls--certificate-operations)
- [Disaster Recovery](#disaster-recovery)
- [Compliance & Security Standards](#compliance--security-standards)
- [Running DevOps in a Regulated / Air-Gapped Environment](#running-devops-in-a-regulated--air-gapped-environment)

---

## Linux Administration

### 1. Walk through the Linux boot process, and how you'd recover a server that won't boot.
**Boot order:** firmware (BIOS/UEFI) → bootloader (**GRUB2**) loads the kernel and **initramfs** → the kernel starts, initramfs loads the drivers needed to mount the real root filesystem (LVM, RAID, storage drivers) → root is mounted and **systemd** (PID 1) starts → systemd brings up `default.target` (multi-user or graphical).

**Recovery, by where it fails:**
- **GRUB prompt or "no bootable device"**: boot from rescue ISO, `chroot` into the system, reinstall GRUB (`grub2-install`, `grub2-mkconfig -o /boot/grub2/grub.cfg`).
- **Kernel panic after an update**: choose the previous kernel in the GRUB menu, then fix or remove the bad kernel and set the default with `grubby --set-default`.
- **Drops into emergency mode**: almost always a bad `/etc/fstab` entry (a disk or UUID that no longer exists). Log in, `mount -o remount,rw /`, fix fstab (add `nofail` for non-critical mounts), then `systemctl daemon-reload` and reboot.
- **Forgotten root password or broken PAM**: at GRUB, edit the kernel line, add `rd.break` (RHEL), `mount -o remount,rw /sysroot`, `chroot /sysroot`, `passwd`, and `touch /.autorelabel` if SELinux is enforcing.
- Then read `journalctl -b -1 -p err` (errors from the previous boot) to find the cause.

### 2. How do you extend a filesystem with LVM when a disk fills up?
LVM layers: **physical volumes** (disks or partitions) → **volume group** (a pool) → **logical volumes** (what you format and mount). That's why you can grow storage online.

```bash
lsblk                                   # find the new disk, e.g. /dev/sdc
pvcreate /dev/sdc
vgextend vg_data /dev/sdc
lvextend -r -L +50G /dev/vg_data/lv_app # -r resizes the filesystem too (xfs_growfs / resize2fs)
df -h /app
```

If the disk was only *enlarged* (e.g. a VMware or EBS resize): `growpart /dev/sdb 1` (when partitioned), then `pvresize /dev/sdb1`, then `lvextend -r`. **XFS can grow but can't shrink.** ext4 can shrink, but only while unmounted. LVM snapshots (`lvcreate -s`) are handy for a quick rollback before risky changes, but they slow writes, so remove them afterwards.

### 3. What is SELinux, and how do you troubleshoot an app that SELinux is blocking?
SELinux is mandatory access control. Every process and file has a label (context), and policy decides which labels can talk to which, on top of normal Unix permissions. A typical symptom: nginx returns 403 on files that are clearly chmod 755, or a service can't bind a non-standard port.

```bash
getenforce                                  # Enforcing / Permissive / Disabled
ausearch -m AVC -ts recent | audit2why      # what was denied and why
ls -Z /data/www                             # check the file context
semanage fcontext -a -t httpd_sys_content_t "/data/www(/.*)?"
restorecon -Rv /data/www                    # apply the correct label
semanage port -a -t http_port_t -p tcp 8443 # allow a custom port
setsebool -P httpd_can_network_connect on   # allow nginx to proxy to upstreams
```

The answer interviewers at banks want: **never `setenforce 0` or disable SELinux in prod**. CIS benchmarks and auditors check it. Fix the label, the port or the boolean instead. For a debugging window only, make a single domain permissive (`semanage permissive -a httpd_t`).

### 4. How do you harden a Linux server?
Start from the **CIS Benchmark** for the OS, automated with Ansible or OpenSCAP so it's repeatable and auditable:
- **SSH**: `PermitRootLogin no`, `PasswordAuthentication no` (keys or certificates only), `AllowGroups`, idle timeout, login banner, and access only from bastion or PAM jump-host IPs.
- **Accounts**: named accounts only (no shared logins), `sudo` through groups with command restrictions and logging, password and lockout policy through PAM (`pam_faillock`), and remove unused accounts.
- **Minimal install**: remove unneeded packages and services (`systemctl list-unit-files --state=enabled`), close unused ports (`ss -tulpn`).
- **Patching**: regular cycle, kernel included.
- **Kernel settings**: `sysctl` for `net.ipv4.ip_forward=0` (unless it's a router), `rp_filter`, `tcp_syncookies`, no ICMP redirects.
- **Logging and audit**: `auditd` rules for privileged commands and changes to `/etc/passwd`, `/etc/sudoers`, and so on; forward logs to the SIEM with rsyslog; time synced with chrony.
- **Filesystem**: separate `/tmp`, `/var` and `/var/log` with `nodev,nosuid,noexec` where it makes sense; AIDE for file-integrity monitoring (a PCI requirement).
- **Host firewall** (firewalld/nftables) as defence in depth, even behind network firewalls.

### 5. How do you patch hundreds of production Linux servers without downtime?
- Have a **repository you control** (Satellite, Spacewalk, or Nexus/Artifactory mirroring the vendor repos), so every server gets the exact same tested package set. This is essential in banks with no direct internet.
- **Rings**: dev → UAT → a prod canary group → the rest of prod, with soak time in between.
- **Rolling in HA pairs**: take one node out of the load balancer or cluster, patch, reboot, health-check, put it back, then do the next. Ansible with `serial: 1` or `serial: "10%"`, plus pre and post health-check tasks.
- **Change management**: a CR or CAB approval with a maintenance window, a rollback plan (previous kernel in GRUB, VM snapshot, `dnf history undo`), and evidence of completion for audit.
- **Kernel live patching** (kpatch, Ksplice, Livepatch) for critical CVEs on servers that can't reboot quickly. You still need a full reboot eventually.
- Report patch compliance (vulnerability scanner or `dnf updateinfo list security`) to the security team.

### 6. Why does time synchronization matter so much, and how do you configure it?
TLS certificate validation, Kerberos/AD authentication (fails beyond a 5-minute skew), log correlation during an incident, distributed databases and consensus (etcd), TOTP MFA and **transaction timestamps** all depend on accurate clocks. In banking, a skewed timestamp can also be an audit finding. Use **chrony** pointed at internal NTP servers, which sync to a trusted upstream or GPS source:

```bash
# /etc/chrony.conf
server ntp1.corp.local iburst
server ntp2.corp.local iburst
makestep 1.0 3
chronyc tracking      # offset, stratum
chronyc sources -v
```

### 7. `df` shows the disk is full, but `du` doesn't add up. What's happening?
A process still has a **deleted file open**, usually a log rotated with `rm` instead of a copytruncate or reload, so the space isn't freed until the process closes it.

```bash
lsof +L1 | grep deleted           # open files with link count 0
# fix: restart or reload the process, or truncate through its fd without a restart
: > /proc/<pid>/fd/<fd>
```

Other causes: files hidden under a mount point (written before something was mounted on top of that directory), reserved blocks on ext4 (5% for root), and **inode exhaustion** (`df -i`, from millions of tiny files like session files). Permanent fix: correct `logrotate` config (`postrotate` reload or `copytruncate`) and disk alerts at 80/90%. See also [13 Q26](./13-sre-incident-loadbalancing-servicemesh-qna.md).

### 8. How do you troubleshoot "the server is slow"?
Work through the resources in order, using the **USE method** (utilization, saturation, errors):
```bash
uptime                          # load average trend vs CPU count
top / htop                      # %us vs %sy vs %wa (I/O wait) vs %st (steal on VMs)
vmstat 1 5                      # r (run queue), si/so (swapping), wa
iostat -xz 1                    # %util, await per disk, i.e. slow storage
free -h ; dmesg -T | tail       # memory pressure, OOM killer, disk or NIC errors
ss -s ; ss -tanp state time-wait | wc -l   # connection pile-up
sar -A                          # history: what changed and when (sysstat)
```
Then go deeper on the hot resource: `pidstat`, `perf top`, `strace -p` for a stuck process. Most importantly, ask **what changed** (a deploy, patching, backup jobs, a batch run at month-end).

### 9. How do you manage users and access across a fleet of Linux servers?
Never create local accounts by hand on each box. Join servers to central identity: **AD through SSSD/realmd**, or **FreeIPA/IdM**, with `sudo` rules managed centrally per AD group and host group. Privileged access goes through a **PAM** tool (CyberArk, BeyondTrust, HashiCorp Boundary/Teleport) that brokers sessions, rotates the real root and service passwords, records sessions, and enforces approval workflows. Auditors expect this. Service accounts are non-interactive (`nologin` shell) with keys managed by the PAM vault.

---

## VPNs & Hybrid Connectivity

### 10. Explain how an IPsec site-to-site VPN works.
IPsec sets up an encrypted tunnel between two gateways in two phases:
- **Phase 1 (IKE SA)**: the peers authenticate each other (pre-shared key or certificates) and agree on encryption, hash, DH group and lifetime, creating a secure channel for negotiation. IKEv2 is preferred over IKEv1.
- **Phase 2 (IPsec/Child SA)**: over that channel they negotiate the SAs that actually carry data. That includes the **traffic selectors** (local and remote subnets, i.e. the "interesting traffic"), the ESP encryption and hash, PFS, and lifetime.
- Data then travels as **ESP** (protocol 50). With NAT in the path it's wrapped in UDP 4500 (**NAT-T**). IKE uses UDP 500.
- **Policy-based** VPNs encrypt by matching subnet pairs. **Route-based** VPNs use a tunnel interface (VTI) and normal routing, often BGP, which is easier to scale and needed for failover.

### 11. A site-to-site VPN is "up," but traffic doesn't pass. How do you troubleshoot?
1. **Is phase 2 actually up?** Phase 1 can be up while phase 2 fails. Check the SAs and counters on both ends: are encaps/decaps counters increasing on both sides?
2. **Traffic selector or proxy-ID mismatch**: the subnets must match exactly, mirrored, on both sides. This is the most common cause with mixed vendors (Cisco ↔ Palo Alto ↔ AWS).
3. **Routing**: does each side route the remote subnet into the tunnel, and does the *return* route exist? For AWS, check the VPC route table or route propagation, and that the VGW/TGW learned the BGP routes.
4. **Firewalls and security groups**: the tunnel being up doesn't mean the traffic is allowed. Check firewall policy on both ends, security groups and NACLs.
5. **NAT**: traffic must be NAT-exempted before it enters the tunnel, or its source address no longer matches the selectors.
6. **MTU/MSS**: small pings work but large transfers or TLS handshakes hang. IPsec overhead pushes packets past 1500 bytes. Clamp TCP MSS (around 1350–1379) on the tunnel interface.
7. **Lifetimes and DPD** mismatch, which shows up as the tunnel dropping every hour.
Tools: `ping` with packet size and DF bit (`ping -M do -s 1400`), `tcpdump` on both sides of the gateway, `traceroute`, and the vendor's SA and debug commands.

### 12. How do you connect an on-prem data center to AWS for a bank, and how do you make it resilient?
- **AWS Site-to-Site VPN**: IPsec over the internet. Each connection has **two tunnels** to different AWS endpoints, so configure both and use BGP. It's quick to set up, but bandwidth is limited (about 1.25 Gbps per tunnel) and latency varies.
- **Direct Connect (DX)**: a dedicated private circuit through a DX location with consistent latency and high bandwidth. Banks usually need it for core traffic. DX isn't encrypted by default, so add **MACsec** (on supported dedicated connections) or run IPsec over DX if policy requires encryption in transit.
- **Resilience**: two DX connections at **two different DX locations**, terminated on different on-prem routers, with Site-to-Site VPN as a backup path. Use BGP for failover (AS-path prepending or local preference to prefer DX).
- Terminate on a **Transit Gateway** (through a DX gateway) for many VPCs and accounts, with route-table segmentation (prod and non-prod separate).
- Resolve DNS both ways with Route 53 Resolver inbound and outbound endpoints, so on-prem names resolve in AWS and the reverse.
See also [07 Q26](./07-aws-cloud-qna.md) and [25 Q34](./25-azure-deep-dive-qna.md).

### 13. Client (remote-access) VPN vs Zero Trust access: what's the difference?
A traditional **client VPN** (OpenVPN, Cisco AnyConnect, GlobalProtect, AWS Client VPN) puts the user's laptop *on the network*. After authentication they can often reach far more than they need, which is a lateral-movement risk. **Zero Trust Network Access** (ZTNA: Zscaler Private Access, Cloudflare Access, Teleport) brokers access **per application** after checking identity, MFA and device posture on every request, and never exposes the network. Banks increasingly use ZTNA for vendors and admins, with access through a PAM or jump host for production.

---

## Firewalls & Network Segmentation

### 14. Stateful vs stateless firewalls?
A **stateful** firewall tracks connections. Once an outbound connection is allowed, the return traffic is allowed automatically (connection tracking). Examples: AWS security groups, iptables/nftables with `conntrack`, Palo Alto, Fortinet. A **stateless** filter evaluates each packet on its own, so you have to allow return traffic explicitly, including ephemeral ports 1024–65535. Examples: AWS NACLs, router ACLs. Stateless is faster and simpler but easy to get wrong.

### 15. Explain iptables chains and tables, and the modern replacements.
- **Tables**: `filter` (allow/deny, the default), `nat` (SNAT/DNAT/MASQUERADE), `mangle` (alter packets), `raw` (bypass conntrack).
- **Chains**: `INPUT` (to this host), `OUTPUT` (from this host), `FORWARD` (routed through it), plus `PREROUTING`/`POSTROUTING` for NAT.
- Rules are evaluated top-down, **first match wins**, and the chain's default policy applies at the end.

```bash
iptables -L -n -v --line-numbers                     # list with hit counters
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -s 10.10.0.0/24 -j ACCEPT
iptables -P INPUT DROP                               # default deny (add allow rules FIRST)

# RHEL family: firewalld (zones) on top of nftables
firewall-cmd --zone=internal --add-service=https --permanent
firewall-cmd --zone=internal --add-source=10.20.0.0/16 --permanent
firewall-cmd --reload
```
**nftables** replaces iptables in modern distros (one framework for IPv4, IPv6 and ARP, with better performance). On Kubernetes nodes, kube-proxy and the CNI program these rules, so don't flush them by hand.

### 16. How do you tell whether a connectivity issue is a firewall problem?
```bash
nc -zv db.corp.local 1521          # or: timeout 3 bash -c '</dev/tcp/host/1521'
```
- **"Connection refused"** (immediate): the packet *reached* the host, but nothing listens on that port (or a firewall actively rejected it). Check `ss -tlnp` on the target.
- **Timeout (hangs)**: packets are **dropped** somewhere, typically by a firewall, a security group, a missing route or an asymmetric return path.
- **"No route to host"**: routing, or an ICMP-unreachable reject.
Then `traceroute -T -p 1521` (TCP traceroute gets through where ICMP is blocked) and `tcpdump -ni any host <ip> and port 1521` on both ends: do SYNs leave, and does a SYN-ACK come back? Check the firewall's traffic logs for the session. In banks, you then raise a **firewall rule request** with source, destination, port and business justification, approved by security.

### 17. How is a banking network typically segmented?
A layered **zone model**, with firewalls between every zone and default-deny:
- **Internet → DMZ**: WAF and reverse proxies, load balancers, internet banking web tier. Nothing in the DMZ holds data.
- **DMZ → application zone**: app servers and API gateways.
- **Application → database zone**: databases accept connections only from specific app servers on specific ports.
- **Core banking / CDE (card data environment)** isolated, to keep PCI scope small.
- **Management zone**: jump or PAM hosts, monitoring and backup networks. Admin access goes only through here.
- Separate **UAT/non-prod** that never connects to prod data, and partner/third-party zones (NPCI, SWIFT, card networks) on dedicated, tightly controlled links.
Microsegmentation (NSX, Kubernetes NetworkPolicies, security groups per tier) gives east-west control inside a zone. Firewall rules are reviewed regularly; PCI DSS requires at least every six months.

### 18. What's a WAF, and how does it differ from a network firewall?
A network firewall decides on **L3/L4** (IP, port, protocol, connection state). A **WAF** inspects **L7 HTTP** content: SQL injection, XSS, path traversal, bad bots, rate limits per IP or session, and virtual patching of a known CVE before the app is fixed. Examples: AWS WAF, Azure Application Gateway WAF, F5 ASM, Cloudflare, ModSecurity with the OWASP Core Rule Set. Roll out new rules in **count/detection mode** first, check false positives against real traffic, then switch to block. PCI DSS 6.4.2 requires an automated solution such as a WAF in front of public-facing web apps. See also [30 Q08](./30-azure-production-scenarios-qna.md).

---

## Proxy Servers

### 19. How does a forward proxy like Squid work in a bank, and how do you configure it?
Servers in a bank usually have **no direct internet access**. Any outbound call (OS updates if there's no internal mirror, partner APIs, cloud APIs) goes through a forward proxy that enforces an **allow-list of destinations**, authenticates the caller, and logs every request for audit.

```conf
# /etc/squid/squid.conf (minimal allow-list proxy)
acl internal src 10.0.0.0/8
acl allowed_sites dstdomain .amazonaws.com .github.com .partner-bank.com
acl SSL_ports port 443
acl CONNECT method CONNECT
http_access deny CONNECT !SSL_ports
http_access allow internal allowed_sites
http_access deny all
http_port 3128
```
For HTTPS, the client sends `CONNECT host:443`, and the proxy opens a TCP tunnel without seeing the content, unless SSL inspection is on (next question). See [22 Q3, Q11](./22-windows-proxy-vapt-jira-qna.md).

### 20. What is SSL inspection, and what breaks because of it?
The proxy decrypts HTTPS by acting as a man-in-the-middle. It presents a certificate for the destination signed by a **corporate CA** that company machines trust, inspects the traffic (DLP, malware), and re-encrypts it upstream. What breaks:
- Containers, JVMs, Python and Node apps that don't use the OS trust store fail with `x509: certificate signed by unknown authority` or `PKIX path building failed`. Fix: add the corporate CA to the image (`/usr/local/share/ca-certificates/` then `update-ca-certificates`), the Java truststore (`keytool -importcert -cacerts`), `REQUESTS_CA_BUNDLE`/`SSL_CERT_FILE`, or `NODE_EXTRA_CA_CERTS`.
- **Certificate pinning** and **mTLS** to partners fail, because the client certificate can't pass through an intercepting proxy. Those destinations have to be on a bypass list.
So the usual policy: inspect user browsing, but bypass server-to-server traffic to known destinations.

### 21. Apps on Kubernetes or Docker can't reach the internet through the corporate proxy. What do you set?
Proxy settings have to go to **each layer separately**:
- **Container runtime** (to pull images): a systemd drop-in for containerd or Docker, e.g. `/etc/systemd/system/containerd.service.d/http-proxy.conf` with `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY`, then `daemon-reload` and restart.
- **Pods** (application traffic): environment variables in the Deployment. Many apps also need language-level settings (Java ignores the env vars and needs `-Dhttps.proxyHost`, `-Dhttp.nonProxyHosts`).
- **`NO_PROXY` is where most incidents come from.** It must include `localhost,127.0.0.1`, the **pod and service CIDRs**, `.svc`, `.cluster.local`, the API server address, internal domains (`.corp.local`) and the metadata IP `169.254.169.254`. Otherwise in-cluster calls go to the proxy and fail.
- Lowercase and uppercase variables are both read by different tools, so set both.
On AWS, prefer **VPC endpoints** (S3, ECR, STS, Secrets Manager) so AWS API traffic never needs the proxy.

### 22. How do you configure NGINX as a reverse proxy with TLS termination?
```nginx
upstream app_backend {
    server 10.0.2.11:8080 max_fails=3 fail_timeout=10s;
    server 10.0.2.12:8080 max_fails=3 fail_timeout=10s;
    keepalive 32;
}
server {
    listen 443 ssl;
    http2 on;
    server_name netbanking.corp.com;
    ssl_certificate     /etc/nginx/tls/fullchain.pem;   # leaf + intermediates
    ssl_certificate_key /etc/nginx/tls/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
server { listen 80; server_name netbanking.corp.com; return 301 https://$host$request_uri; }
```
Test the config with `nginx -t` before `systemctl reload nginx` (a reload is graceful and doesn't drop connections).

---

## SSL/TLS & Certificate Operations

### 23. Walk through issuing a certificate for a new internal service.
```bash
# 1. Private key + CSR (with SANs: browsers ignore CN alone)
openssl req -new -newkey rsa:2048 -nodes -keyout api.key -out api.csr \
  -subj "/C=IN/O=Corp Bank/CN=api.corp.local" \
  -addext "subjectAltName=DNS:api.corp.local,DNS:api-dr.corp.local"
openssl req -in api.csr -noout -text        # verify the SANs before submitting

# 2. Submit the CSR to the internal CA (AD CS / Vault PKI / Venafi), get back the cert + chain
# 3. Verify the key matches the cert
openssl x509 -noout -modulus -in api.crt | openssl md5
openssl rsa  -noout -modulus -in api.key | openssl md5
# 4. Deploy cert + intermediate chain, keep the key at 0600, record the expiry in monitoring
```
The private key never leaves the server, or the HSM. Only the CSR goes to the CA.

### 24. Clients get "unable to get local issuer certificate" but browsers work. Why?
The server is sending **only the leaf certificate, without the intermediate**. Browsers often hide this by caching intermediates or fetching them through AIA, but curl, Java, Python and partner systems fail. Check what the server actually sends:

```bash
openssl s_client -connect api.corp.com:443 -servername api.corp.com -showcerts </dev/null
# look at "Certificate chain": you need leaf (0) AND intermediate (1)
# "Verify return code: 0 (ok)" is the goal
```
Fix: configure the **full chain** (leaf followed by intermediates, in order; the root isn't needed) in nginx `ssl_certificate`, the load balancer or the keystore. Other causes of verify errors: the client doesn't trust the private root CA (add it to the client truststore), expired cert, hostname not in the SAN (`-servername` matters with SNI), or clock skew.

### 25. Explain certificate formats and how to convert between them.
- **PEM**: Base64 text (`-----BEGIN CERTIFICATE-----`), used by Linux, nginx and Apache. `.pem`, `.crt`, `.key`.
- **DER**: the same content in binary, common on Windows and Java. `.der`, `.cer`.
- **PKCS#12 / PFX**: one password-protected file holding the key, cert and chain. Windows/IIS, imports into Java, F5 and Azure. `.pfx`, `.p12`.
- **JKS**: the legacy Java keystore. PKCS12 is the Java default now.

```bash
openssl x509 -in cert.der -inform der -out cert.pem                      # DER → PEM
openssl pkcs12 -export -inkey key.pem -in cert.pem -certfile chain.pem -out bundle.pfx  # PEM → PFX
openssl pkcs12 -in bundle.pfx -nodes -out all.pem                        # PFX → PEM
keytool -importkeystore -srckeystore bundle.pfx -srcstoretype pkcs12 -destkeystore app.jks  # PFX → JKS
keytool -importcert -alias corp-root -file root.pem -keystore truststore.jks  # trust a CA in Java
openssl x509 -in cert.pem -noout -subject -issuer -dates -ext subjectAltName  # inspect
```
Java and Spring Boot apps are common in banks, so the **keystore** (my identity: key + cert) vs **truststore** (CAs I trust) distinction comes up a lot.

### 26. How do you prevent certificate-expiry outages across hundreds of certificates?
Certificate expiry is one of the most common avoidable outages, and public certificate lifetimes are shrinking (CA/Browser Forum ballot SC-081 reduces the maximum to 200 days from March 2026, falling to 47 days by 2029), so manual renewal no longer scales.
- **Inventory**: a single list of every cert, its owner, location and expiry (from Venafi, AppViewX or Keyfactor, or by scanning endpoints).
- **Automate issuance and renewal**: **cert-manager** in Kubernetes (ACME for public certs, Vault or a private CA issuer for internal ones), ACM for AWS load balancers (auto-renews), Vault PKI with short-lived certs for services.
- **Monitor expiry** from outside: blackbox_exporter `probe_ssl_earliest_cert_expiry` with alerts at 30, 14 and 7 days, or a script like [18 Q13](./18-practical-scripting-challenges-qna.md).
- **Rotate without downtime**: hot reload (`nginx -s reload`), or rolling restarts that pick up new Kubernetes secrets.

### 27. What TLS configuration would a bank's security team expect, and how do you verify it?
TLS **1.2 and 1.3 only** (1.0, 1.1 and SSLv3 disabled, as PCI and RBI expect); strong AEAD ciphers with forward secrecy (ECDHE + AES-GCM/ChaCha20; no RC4, 3DES, CBC-SHA1 or export ciphers); certificates with 2048-bit+ RSA or ECDSA P-256 and SHA-256; **HSTS**; OCSP stapling; secure renegotiation; no TLS compression. Verify with `nmap --script ssl-enum-ciphers -p 443 host`, `testssl.sh host`, or SSL Labs for public endpoints. Internal service-to-service traffic in the CDE also has to be encrypted, so use mTLS or a service mesh. See [22 Q13](./22-windows-proxy-vapt-jira-qna.md) for working through a VAPT report.

### 28. What is an HSM, and why do banks use them?
A **Hardware Security Module** is tamper-resistant hardware (FIPS 140-2/140-3 Level 3) that generates and stores cryptographic keys and performs crypto operations **inside the device**. The keys can't be exported. Banks use HSMs for card PIN processing and PIN blocks, EMV keys, payment-network keys, CA root keys, code signing, and database TDE master keys, because standards (PCI PIN, PCI DSS key management) require it. In cloud: **AWS CloudHSM** (a dedicated, single-tenant HSM you control) or **KMS** (multi-tenant, FIPS-validated HSMs where AWS manages the hardware), and AWS Payment Cryptography for payment-specific HSM functions. Key concepts: key hierarchy (master key → data keys, i.e. **envelope encryption**), split knowledge and dual control for key ceremonies, and key rotation.

---

## Disaster Recovery

### 29. How is DR typically set up for a bank's on-prem data center?
Usually **DC + DR**, often with a **near-DR** site as a third site:
- **DC (primary)** runs production.
- **Near-DR**: a nearby site (tens of km) with **synchronous** replication, so committed transactions are never lost (RPO ≈ 0). Distance is limited because each write waits for the remote acknowledgement.
- **Far DR**: a site in a different seismic zone or city with **asynchronous** replication (RPO of seconds to minutes). It survives a regional disaster.
- Replication layers: database (Oracle Data Guard, SQL Server Always On, PostgreSQL streaming replication), storage array replication (SRDF, SnapMirror), VM replication (Zerto, SRM).
- Regulators expect the CBS (core banking), payment systems and internet/mobile banking to have documented RTO/RPO and **regular DR drills**, often with production actually running from DR for a period. RBI guidance expects DR drills for critical systems at least every six months, so check the current master direction for the exact rules that apply.

### 30. Walk through planning and running a DR drill.
1. **Scope and objectives**: which applications, the target RTO and RPO, and success criteria (transactions working end-to-end from DR).
2. **Runbook**: step-by-step failover with owners, order of dependencies (network and DNS → databases → middleware → apps → integrations like the payment switch and SMS gateway), and the rollback (fail-back) plan.
3. **Approvals and communication**: CAB, business sign-off, notifying partners and NPCI where relevant, and a customer communication plan if there's downtime.
4. **Execute**: stop or switch writes at DC, confirm replication has caught up (lag = 0), promote DR databases, repoint DNS/GSLB, start apps, run smoke tests and real test transactions.
5. **Measure** the actual RTO and RPO against targets, and log every deviation.
6. **Fail back** (the hardest and most often skipped part: reverse the replication direction and resync).
7. **Report**: gaps found, action items and owners, plus evidence for auditors. A drill that "passed" with no findings usually didn't test enough.

### 31. What is split brain, and how do you prevent it?
**Split brain** happens when a network partition makes *both* sites believe they are primary and accept writes. The result is two diverging datasets, which is very hard to reconcile in a banking ledger. Prevention:
- A **quorum or witness** in a third location (tie-breaker), so only the side that can see a majority becomes primary (Data Guard Fast-Start Failover observer, Patroni with etcd, Windows cluster witness).
- **Fencing / STONITH**: forcibly cut off the old primary (power off, revoke storage access) before the new one is promoted.
- For core systems, **controlled (manual) failover**: a human decides, because automatic failover on a flapping link can do more harm than a few minutes of downtime.

### 32. How do you protect backups against ransomware?
- **3-2-1-1-0**: 3 copies, on 2 types of media, 1 offsite, **1 immutable or air-gapped**, and **0** errors on restore verification.
- **Immutability**: S3 Object Lock in compliance mode, WORM storage, or immutable repositories in Veeam or Commvault. Even an admin with stolen credentials can't delete or encrypt backups during the retention period.
- **Separate credentials and accounts**: the backup system authenticates separately from AD (ransomware usually takes over domain admin first). In AWS, use a separate backup account with AWS Backup vault lock.
- **Regular restore tests**: an untested backup is only an assumption.
- Detect anomalies (sudden changes in backup size or data entropy) as an early sign of encryption.

### 33. RPO and RTO: how do you choose a DR strategy for each application?
Classify applications by business impact:
- **Tier 0/1** (core banking, payments, UPI): RTO in minutes, RPO near zero. Active-active or hot standby with synchronous replication to near-DR.
- **Tier 2** (internet banking, CRM): RTO under 1–4 hours. Warm standby.
- **Tier 3** (reporting, internal tools): RTO under 24 hours. Restore from backups or pilot light.
Lower RTO and RPO cost far more (duplicate capacity and licenses), so the business owner signs off on each target. In AWS terms, the options are backup & restore → pilot light → warm standby → multi-site active-active. See [07](./07-aws-cloud-qna.md) and [27](./27-cloud-architecture-scenarios-qna.md) for cloud DR patterns.

---

## Compliance & Security Standards

### 34. What is PCI DSS, and which requirements affect DevOps day to day?
PCI DSS is the card industry's security standard for anyone who stores, processes or transmits cardholder data (the **CDE**, cardholder data environment). The current version is **v4.0.1**. Its "future-dated" requirements became mandatory on 31 March 2025. The 12 requirements, grouped, with what they mean for DevOps:
- **Network security controls and segmentation (Req 1)**: firewall and security-group rules documented and reviewed. Segmentation reduces how much of the estate is "in scope", which is the biggest lever on cost.
- **Secure configuration (Req 2)**: no vendor defaults, hardened images (CIS).
- **Protect stored data (Req 3)**: don't store the PAN at all if you can avoid it (tokenization). If you must, render it unreadable (strong encryption, truncation, hashing). Never store CVV or the PIN after authorization. Key management with split knowledge and dual control.
- **Encryption in transit (Req 4)**: TLS 1.2+ over public networks.
- **Malware protection (Req 5)** and **patching and secure development (Req 6)**: critical patches within a month, secure SDLC, code review, SAST/DAST, a WAF for public web apps (6.4.2), and an inventory and integrity checks for payment-page scripts (6.4.3).
- **Access control (Req 7–8)**: least privilege, unique IDs (no shared accounts), **MFA for all access to the CDE**, and controls on service and system accounts (no hardcoded passwords).
- **Logging and monitoring (Req 10)**: audit logs of all access, time-synced, tamper-protected, reviewed (automated), and kept for **12 months, with the last 3 months immediately available**.
- **Testing (Req 11)**: quarterly internal and ASV external vulnerability scans, annual penetration tests plus a test after significant changes, segmentation tests, and file-integrity monitoring.
- **Policy and incident response (Req 12)**.
In practice: put card data in a small, isolated zone; pipelines create change records and evidence automatically; secrets go in Vault or an HSM; logs go to an immutable SIEM.

### 35. What RBI regulations should a DevOps engineer at an Indian bank know about?
Talk about them at the level of "what they require from engineering," and say you'd confirm the current text with the compliance team:
- **Cyber Security Framework for Banks (2016)**: a board-approved cyber security policy, a **Cyber Security Operations Centre (C-SOC)**, reporting cyber incidents to RBI within tight timelines (incidents must be reported within hours), and baseline controls such as network segmentation, patching, secure configuration, application security and vendor risk management.
- **Master Direction on IT Governance, Risk, Controls and Assurance Practices (2023, in effect from April 2024)**: IT governance, change management, BCP and DR with **periodic DR drills**, information-security audits, capacity management, and controls on access and logs.
- **Storage of payment system data (2018)**: data for payment systems must be **stored only in India**, which shapes cloud region choice (e.g. ap-south-1 Mumbai and ap-south-2 Hyderabad, with DR also in India).
- **Outsourcing of IT services (2023 Master Direction)**: cloud providers and vendors count as outsourcing, so you need due diligence, audit and access rights for RBI, an exit strategy, and data localization.
- **Digital payment security controls**: MFA, fraud monitoring, secure mobile and internet banking.
For engineering this means: Indian regions only, DR in a second Indian region, full audit trails, change records for every prod change, regular VAPT, and logs available to auditors.

### 36. What is ISO 27001, and how does SOC 2 differ?
- **ISO/IEC 27001:2022**: an international standard for an **ISMS** (information security management system). It covers risk assessment, a Statement of Applicability, and 93 Annex A controls in four themes: organizational, people, physical, technological. The organization gets certified by an accredited body, with yearly surveillance audits.
- **SOC 2** (AICPA, common with US customers): a **CPA's attestation report** against the Trust Services Criteria (security, plus optionally availability, confidentiality, processing integrity and privacy). A **Type I** report covers design at a point in time; a **Type II** report covers operating effectiveness over a period, typically 6–12 months.
For DevOps, both come down to evidence: access reviews, change approvals, vulnerability management, backups and restore tests, incident records, and encryption. **Automate evidence collection** (AWS Config, Security Hub conformance packs, CI change logs) instead of collecting screenshots. See also [12 Q22](./12-security-devsecops-qna.md).

### 37. How do you implement change management that satisfies auditors without slowing delivery?
Auditors want: every prod change is **approved**, **tested**, made by an authorized person, **traceable** and **reversible**, with **segregation of duties** (the developer who wrote the code can't approve or deploy it alone; often called maker-checker).
Implement it in the pipeline instead of in spreadsheets:
- Branch protection plus **required PR reviews** (CODEOWNERS) count as the code-level approval.
- The pipeline **creates or updates the change record** (ServiceNow or Jira) automatically, with commit, tests, scan results and approver.
- **Environment gates** for prod (GitHub environments, Jenkins `input` restricted to a release-manager group).
- **Standard changes** (low-risk, pre-approved, such as a routine deploy through the standard pipeline) skip the CAB. **Normal and emergency changes** go to the CAB.
- No direct prod access for engineers (GitOps with Argo CD `selfHeal` enforces it), and break-glass access is logged and reviewed.
The pipeline is then the audit evidence.

### 38. How do you manage secrets in a regulated environment?
A central **secrets manager** (HashiCorp Vault, CyberArk Conjur, or AWS Secrets Manager / Azure Key Vault in cloud) with:
- **Dynamic, short-lived credentials** where possible (Vault database secrets engine: each app instance gets a unique DB user that expires), so a leaked secret is useless within hours.
- **Identity-based authentication** to the vault (Kubernetes service account auth, AWS IAM auth, AppRole), not another static secret.
- **Automatic rotation** of static secrets, with the app reloading them.
- The master or unseal keys protected by an **HSM/KMS** (auto-unseal).
- **Audit device** logs every read, forwarded to the SIEM.
- Secrets never in Git, images, env files or CI logs. Run secret scanning (gitleaks, GitHub push protection) as a pipeline gate.
In Kubernetes: External Secrets Operator or the Vault Agent/CSI driver, with Secrets encrypted in etcd using a KMS provider. See [20 Q24](./20-devops-roadmap-gap-fill-qna.md).

### 39. What logs must be collected and retained, and how do you make them tamper-proof?
Collect: authentication (success and failure), privileged and sudo commands, access to sensitive data, config and permission changes, firewall, VPN and proxy logs, application transaction logs, database audit logs, Kubernetes API audit logs, and cloud control-plane logs (CloudTrail).
- **Centralize** in a SIEM (Splunk, QRadar, Sentinel, Elastic) quickly, so an attacker on a box can't delete the evidence.
- **Tamper protection**: write-once storage (S3 Object Lock, WORM), CloudTrail log-file integrity validation, restricted delete permissions, and a separate log-archive account.
- **Time sync** (chrony) so events across systems line up.
- **Retention** as policy requires (PCI: 1 year, 3 months hot; many banks keep longer for regulators and legal holds).
- **Mask PII and PAN** before logs leave the app. Logging a card number puts the whole logging system in PCI scope.

---

## Running DevOps in a Regulated / Air-Gapped Environment

### 40. How do you run Kubernetes and CI/CD in an air-gapped or restricted network?
- **Artifact mirrors inside the network**: a container registry (Harbor, Artifactory, Nexus) that mirrors approved public images after scanning; OS package mirrors; language package proxies (Maven, npm, PyPI) that cache approved versions; Helm charts in an internal OCI registry.
- **Install media brought in through a controlled transfer** (a scanned, approved bundle): Kubernetes distributions with air-gap support (RKE2, OpenShift, Kubespray offline, EKS Anywhere), and container images mirrored with `skopeo copy` or `oras` to the internal registry.
- **Configure everything to use internal endpoints**: containerd registry mirrors, `imagePullSecrets`, a private CA trusted everywhere, internal NTP and DNS.
- **Admission policies** (Kyverno or Gatekeeper) that only allow images from the internal registry, ideally **signed** (cosign) and scanned.
- **Updates**: a regular, documented process to bring in patches and CVE databases (Trivy offline DB) so the environment doesn't fall behind.
- CI runners and Argo CD run inside the network and pull from internal Git.

### 41. How does DevOps practice change in a bank compared with a startup?
The principles don't change (automation, small changes, fast feedback), but the controls are formal:
- **Change management and CAB**, segregation of duties, and approvals in the pipeline instead of "merge and deploy".
- **No direct prod access**: deploy only through pipelines and GitOps; break-glass through PAM with session recording.
- **Evidence everywhere**: every deploy traceable to a ticket, approver, test results and scans.
- **Security gates** that block a release (SAST, SCA, image scan, IaC scan, DAST before release, VAPT before go-live).
- **Hybrid estate**: mainframe or CBS (Finacle, Flexcube, T24) on-prem, newer services on Kubernetes or cloud, linked by MQ, API gateways and ESBs. Integration and network rules take a lot of the time.
- **Data residency and privacy** (RBI localization, the DPDP Act 2023).
A good interview line: *"My job is to make the compliant path the easiest path, so controls are built into the platform rather than added as manual steps."*

### 42. A regulator or auditor asks, "Show me who changed this production firewall rule or config, when, and who approved it." How do you make that answerable?
Build the trail before anyone asks:
- **Infrastructure and config as code**: firewall rules, security groups, Kubernetes manifests and server config live in Git. The commit history records who and what, and the PR records who approved it and why (linked ticket).
- **Only pipelines apply changes**, using a deploy identity, and pipeline logs are kept.
- **Platform audit logs** catch anything done outside the pipeline: CloudTrail, Kubernetes audit logs, firewall manager audit logs and PAM session recordings, all in the SIEM.
- **Drift detection** (AWS Config, Terraform plan in a scheduled job, Argo CD OutOfSync alerts) flags any manual change for review.
So the answer is a Git commit linked to a change ticket and a pipeline run, with logs proving nothing else touched it.
