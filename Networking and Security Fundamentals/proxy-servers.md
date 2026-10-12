# Proxy Servers (HTTP & TCP, Forward & Reverse) — Complete Notes

> Part of [Networking & Security Fundamentals](./index.md). Related: [`Load Balancing/software-load-balancers.md`](../Load%20Balancing/software-load-balancers.md), [`Load Balancing/l4-vs-l7-load-balancing.md`](../Load%20Balancing/l4-vs-l7-load-balancing.md), [Firewalls](./firewalls.md).

## 1. Beginner

### What is a proxy?
A proxy is an intermediary that receives a connection or request from a client and makes a separate connection to the destination on the client's behalf.

| Type | Sits in front of | Who configures it | Typical uses | Examples |
|---|---|---|---|---|
| **Forward proxy** | **Clients** (going out) | Client/OS/app (`HTTP_PROXY`) or network | Egress control, URL filtering, caching, audit, hiding internal IPs, reaching the internet from private subnets | **Squid**, corporate proxies, Zscaler |
| **Reverse proxy** | **Servers** (coming in) | Server owner, transparent to clients | TLS termination, load balancing, caching, WAF, routing by host/path | **Nginx**, **HAProxy**, Envoy, Traefik, AWS ALB |
| **Transparent proxy** | Clients, but intercepted | Network (iptables redirect / WCCP), not the client | Enforced filtering without client config | Squid in intercept mode |

### HTTP proxy vs TCP proxy
| | **HTTP (L7) proxy** | **TCP (L4) proxy** |
|---|---|---|
| Understands | HTTP requests (method, host, path, headers) | Only bytes on a TCP connection (IP:port) |
| Can do | Route by host/path, rewrite headers, cache, auth, WAF rules, add `X-Forwarded-For` | Forward any TCP protocol (DB, SMTP, SIP-over-TCP, TLS passthrough), simple LB |
| Can't do | Arbitrary non-HTTP protocols | Anything content-aware |
| Examples | Nginx `http {}`, HAProxy `mode http`, Squid | HAProxy `mode tcp`, Nginx `stream {}`, AWS NLB, `socat` |

---

## 2. Intermediate

### How HTTPS goes through a forward proxy: `CONNECT`
For `https://` URLs the client sends `CONNECT api.example.com:443 HTTP/1.1` to the proxy. The proxy opens a TCP tunnel and returns `200 Connection established`, and then the client does TLS **end to end** through the tunnel. The proxy only sees the hostname and the number of bytes, not the content (unless it does TLS interception; see below).

### Proxy environment variables (Linux, containers, tools)
```bash
export HTTP_PROXY=http://proxy.corp.local:3128
export HTTPS_PROXY=http://proxy.corp.local:3128     # proxy URL is usually http:// even for HTTPS traffic
export NO_PROXY=localhost,127.0.0.1,169.254.169.254,.svc,.cluster.local,10.0.0.0/8,.internal.corp
# Many tools only read lowercase: also set http_proxy / https_proxy / no_proxy
```
Where else proxies must be configured (a classic source of "works in my shell, fails in the service"):
| Component | Where |
|---|---|
| systemd services | `Environment=` in a drop-in, e.g. `/etc/systemd/system/docker.service.d/http-proxy.conf`, then `systemctl daemon-reload && systemctl restart docker` |
| Docker daemon (image pulls) | systemd drop-in above, or `daemon.json` `"proxies"` |
| Docker build / containers | `--build-arg HTTP_PROXY=...` / `~/.docker/config.json` `proxies` |
| yum/dnf (RHEL/CentOS) | `proxy=http://proxy:3128` in `/etc/yum.conf` or `/etc/dnf/dnf.conf` |
| apt | `/etc/apt/apt.conf.d/95proxy`: `Acquire::http::Proxy "http://proxy:3128";` |
| git | `git config --global http.proxy http://proxy:3128` |
| pip / npm | `pip --proxy ...` / `npm config set proxy ...` |
| Jenkins | Manage Jenkins → Plugins → Advanced (proxy) + agent env vars |
| Kubernetes nodes/containerd | containerd systemd drop-in; pod env vars; **NO_PROXY must include the cluster/service CIDRs and `.svc`** or in-cluster calls go to the proxy and fail |
| AWS SDK/CLI | Honors `HTTPS_PROXY`; add `169.254.169.254` (IMDS) and VPC endpoints to `NO_PROXY` |

### Squid (forward proxy) basics
```conf
# /etc/squid/squid.conf
http_port 3128
acl localnet src 10.0.0.0/8
acl allowed_sites dstdomain .github.com .amazonaws.com .docker.io .pypi.org
acl SSL_ports port 443
acl CONNECT method CONNECT
http_access deny CONNECT !SSL_ports
http_access allow localnet allowed_sites
http_access deny all
access_log /var/log/squid/access.log squid
```
Use `squid -k parse` to check the config, `squid -k reconfigure` to reload, and `tail -f /var/log/squid/access.log` to see `TCP_DENIED/403` vs `TCP_TUNNEL/200`.

### Reverse proxy / TCP proxy snippets
```nginx
# Nginx L7 reverse proxy
server {
  listen 443 ssl;
  server_name app.example.com;
  ssl_certificate     /etc/ssl/app.crt;
  ssl_certificate_key /etc/ssl/app.key;
  location / {
    proxy_pass http://app_backend;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
}
# Nginx L4 TCP proxy (stream module)
stream {
  upstream pg { server 10.0.1.10:5432; server 10.0.1.11:5432 backup; }
  server { listen 5432; proxy_pass pg; proxy_connect_timeout 3s; }
}
```
```haproxy
# HAProxy TCP mode with TLS passthrough
frontend fe_tls
  bind :443
  mode tcp
  tcp-request inspect-delay 5s
  tcp-request content accept if { req_ssl_hello_type 1 }
  use_backend be_api if { req_ssl_sni -i api.example.com }
backend be_api
  mode tcp
  server api1 10.0.2.10:443 check
```

### Preserving the client IP
- **L7**: `X-Forwarded-For` / `Forwarded` headers. Only trust them from known proxies, or clients can spoof them.
- **L4**: the **PROXY protocol** (v1 text / v2 binary) prepends the original client IP:port; both sides must enable it (`send-proxy` in HAProxy, `proxy_protocol on` in Nginx, an NLB target-group attribute).
- **NLB** can preserve the client IP natively for instance targets.

---

## 3. Advanced

### Troubleshooting proxied traffic
```bash
curl -v -x http://proxy:3128 https://example.com      # force via proxy, see CONNECT + TLS
curl -v --noproxy '*' https://example.com             # bypass proxy to compare
env | grep -i proxy                                   # what the process actually sees
systemctl show docker --property=Environment          # what a service actually sees
```
| Error | Meaning |
|---|---|
| `407 Proxy Authentication Required` | Proxy needs credentials (`http://user:pass@proxy:3128`; URL-encode special characters) |
| `403` from the proxy (Squid `TCP_DENIED`) | ACL blocks the domain; get it allow-listed |
| `502 Bad Gateway` (reverse proxy) | Backend refused/reset the connection, wrong upstream port, backend down |
| `504 Gateway Timeout` | Backend too slow vs `proxy_read_timeout` / LB idle timeout |
| `x509: certificate signed by unknown authority` | Corporate **TLS interception**: install the proxy's CA in the OS/container trust store |
| In-cluster calls fail after setting a proxy | Missing `NO_PROXY` entries for service/pod CIDRs, `.svc`, `.cluster.local` |

### TLS interception (SSL bump)
Corporate forward proxies may decrypt HTTPS by issuing their own certificates (Squid `ssl_bump`, Zscaler). That requires distributing the proxy CA to every client. It breaks **certificate pinning** and mTLS clients, so pinned or sensitive domains are usually excluded ("splice" instead of "bump").

### Egress design in AWS
- **NAT Gateway**: simple outbound for private subnets, but no domain filtering.
- **Forward proxy (Squid on EC2/ECS)** or **AWS Network Firewall** with domain allow-lists: control and audit egress, which helps compliance and limits data exfiltration and malware call-home.
- **VPC endpoints** (S3, ECR, STS, SSM…) keep AWS API traffic private, cut NAT costs, and should be in `NO_PROXY`.

### Proxy timeouts that bite long-lived connections
WebSockets, gRPC streams, SIP over TCP/TLS, and DB connections get killed by idle timeouts on the proxy or LB (ALB default 60s idle; NLB TCP idle ~350s). Tune the timeouts and use application keepalives.
