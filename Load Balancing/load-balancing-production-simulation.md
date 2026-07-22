# Production Simulation: Load Balancing in Action

A hands-on walkthrough using HAProxy in front of a few real backend servers, so you can actually see load balancing behavior rather than just reading about it — backend selection, a backend dying mid-traffic, connection draining during a deploy, and health check flapping. Mirrors the style of the [Kubernetes Pods production simulation](../Kubernetes/K-pods.md#production-simulation-how-pods-actually-behave-in-the-real-world) — small, runnable, and focused on what you'd actually observe.

---

## 1. The Setup

Three simple backend servers (just `netcat`/Python one-liners standing in for real app instances, so you can run this on a laptop with nothing but Docker) behind an HAProxy load balancer.

```bash
# Backend 1, 2, 3 — each just replies with its own name, so you can SEE which backend served each request
docker run -d --name backend1 -p 8081:80 -e RESPONSE="I am backend-1" ealen/echo-server
docker run -d --name backend2 -p 8082:80 -e RESPONSE="I am backend-2" ealen/echo-server
docker run -d --name backend3 -p 8083:80 -e RESPONSE="I am backend-3" ealen/echo-server
```

```haproxy
# haproxy.cfg
global
    maxconn 100

defaults
    mode http
    timeout connect 5s
    timeout client  30s
    timeout server  30s

frontend web_frontend
    bind *:8080
    default_backend web_servers

backend web_servers
    balance roundrobin
    option httpchk GET /
    server backend1 host.docker.internal:8081 check inter 3s fall 2 rise 2
    server backend2 host.docker.internal:8082 check inter 3s fall 2 rise 2
    server backend3 host.docker.internal:8083 check inter 3s fall 2 rise 2

listen stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 2s
```
```bash
docker run -d --name haproxy -p 8080:8080 -p 8404:8404 \
  -v $(pwd)/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro \
  haproxy:2.9
```

---

## 2. Simulation: Round Robin in Action

```bash
for i in {1..6}; do curl -s http://localhost:8080/ | grep -o "I am backend-[0-9]"; done
```
```
I am backend-1
I am backend-2
I am backend-3
I am backend-1
I am backend-2
I am backend-3
```
Exactly the round-robin rotation described in [load-balancing-algorithms.md](load-balancing-algorithms.md) — each request cycles to the next backend in order. Open `http://localhost:8404/stats` in a browser to watch the per-backend request counters increment live as you curl.

---

## 3. Simulation: A Backend Dies Mid-Traffic

```bash
# Simulate backend2 crashing (as if the process/container died unexpectedly)
docker stop backend2
```
Immediately after stopping it, keep sending requests:
```bash
for i in {1..6}; do curl -s http://localhost:8080/ | grep -o "I am backend-[0-9]"; sleep 1; done
```
```
I am backend-1
I am backend-3          <- backend2's turn was skipped, HAProxy already knows it's down
I am backend-1
I am backend-3
I am backend-1
I am backend-3
```
Check the HAProxy logs / stats page and you'll see `backend2` transition to `DOWN` after `fall 2` (2 consecutive failed health checks, ~6 seconds given `inter 3s`). **This is the core behavior to internalize**: HAProxy didn't wait for a real client request to fail against backend2 — its own active health check (`option httpchk`, hitting `/` every 3 seconds) detected the outage independently and removed it from rotation automatically. See [health-checks-and-failover.md](health-checks-and-failover.md) for why this timing (`inter`/`fall`/`rise`) is a genuine tuning trade-off, not a "set and forget" default.

```bash
# Bring it back
docker start backend2
```
```bash
for i in {1..6}; do curl -s http://localhost:8080/ | grep -o "I am backend-[0-9]"; sleep 1; done
```
After `rise 2` (2 consecutive successful health checks, ~6 seconds), `backend2` rejoins rotation automatically — no manual reconfiguration needed. This whole detect-and-recover cycle happened without touching HAProxy's config at all.

---

## 4. Simulation: Rolling Deploy Behind a Load Balancer (connection draining)

This demonstrates why **connection draining** (from the glossary in [load-balancing-overview.md](load-balancing-overview.md)) matters — without it, in-flight requests get cut off mid-response during a deploy.

```python
# slow-backend.py — simulates a real request that takes 5 seconds to respond
# (standing in for something like a slow DB query or report generation)
from http.server import BaseHTTPRequestHandler, HTTPServer
import time

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        time.sleep(5)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Slow response completed successfully\n")

HTTPServer(("0.0.0.0", 9000), Handler).serve_forever()
```
```bash
python3 slow-backend.py &
```
```haproxy
# Add to haproxy.cfg backend, and reload HAProxy
server slowbackend host.docker.internal:9000 check inter 3s fall 2 rise 2
```

**Without draining** — kill the backend process while a 5-second request is mid-flight:
```bash
curl http://localhost:8080/ &     # this request is now in-flight, will take 5s
sleep 1
kill %1                            # kill slow-backend.py after 1 second — mid-request
```
The `curl` immediately errors out (`curl: (52) Empty reply from server` or similar) — the in-flight request was simply cut off, exactly what a real user would experience if you deployed a new version by abruptly killing the old instance.

**With draining** — the correct production pattern is to first mark the backend for graceful removal (stop sending it *new* requests) while letting existing requests finish naturally, then terminate it:
```bash
# HAProxy: put the backend into "drain" state via the admin socket — stops NEW connections,
# but lets already-in-flight requests on it complete normally
echo "set server web_servers/slowbackend state drain" | socat stdio tcp-connect:127.0.0.1:9999
```
Real load balancers implement this same concept under different names — AWS Target Group **deregistration delay**, Kubernetes' `preStop` hook + `terminationGracePeriodSeconds` (see the graceful shutdown example in [rolling-deployment.md](../Deployment/rolling-deployment.md)), NGINX's `server ... down;` reload pattern. The principle is identical everywhere: **stop routing new traffic to an instance before you kill it, not simultaneously with killing it.**

---

## 5. Simulation: Health Check Flapping

This shows why the `fall`/`rise` thresholds from [health-checks-and-failover.md](health-checks-and-failover.md) matter, using an intentionally too-aggressive configuration.

```haproxy
# Deliberately too aggressive: fall=1 means ONE missed check removes the backend
server backend1 host.docker.internal:8081 check inter 1s fall 1 rise 1
```
```bash
# Simulate a brief, transient network blip (not a real outage) by pausing the container momentarily
docker pause backend1
sleep 0.5
docker unpause backend1
```
Watch the HAProxy stats page: with `fall 1`, that single momentary blip was enough to mark `backend1` fully DOWN, even though it recovered a fraction of a second later — real traffic briefly lost a third of your capacity over a non-event. Compare against the original config (`fall 2 rise 2`, `inter 3s`) doing the same pause/unpause — a single transient blip is far less likely to trip a 2-consecutive-failure threshold. This is the flapping trade-off made concrete: aggressive thresholds react fast to real failures, but also overreact to non-failures.

---

## 6. Simulation: Weighted Traffic Shifting (canary-style)

```haproxy
backend web_servers
    balance roundrobin
    server backend1 host.docker.internal:8081 weight 90 check   # "stable" version, 90% of traffic
    server backend3 host.docker.internal:8083 weight 10 check   # "canary" version, 10% of traffic
```
```bash
for i in {1..20}; do curl -s http://localhost:8080/ | grep -o "I am backend-[0-9]"; done | sort | uniq -c
```
```
     18 I am backend-1
      2 I am backend-3
```
Roughly 90/10, matching the configured weights — this is mechanically the exact same technique used to implement the gradual traffic percentages in [Canary Deployment](../Deployment/Canary%20Deployment/canary-deployment.md), just demonstrated here at the load balancer config level instead of via Argo Rollouts/Istio automation. Bumping `weight 10` up to `weight 50`, then `weight 100` (and dropping `backend1` to 0), is literally what a canary promotion pipeline does under the hood, one config change (or API call) at a time.

---

## 7. Key Takeaways From Running This Yourself

| What you observed | Why it matters in real production |
|---|---|
| Round robin cycles predictably across healthy backends | Confirms the basic mechanism before reasoning about failures on top of it |
| A stopped backend gets removed from rotation automatically, without any manual step | This is what makes a load balancer resilient to real crashes — same self-healing spirit as the Kubernetes Deployment reconciliation in [K-pods.md](../Kubernetes/K-pods.md) |
| An in-flight request gets cut off if you kill a backend without draining first | This is exactly the failure mode zero-downtime deploys are designed to prevent — see [Rolling Deployment](../Deployment/rolling-deployment.md) |
| Aggressive health check thresholds cause a transient blip to look like a real outage | The `fall`/`rise`/`interval` tuning trade-off from [health-checks-and-failover.md](health-checks-and-failover.md) is real, not theoretical |
| Weighted routing produces roughly proportional traffic split | The exact mechanism behind canary traffic percentage promotion |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
