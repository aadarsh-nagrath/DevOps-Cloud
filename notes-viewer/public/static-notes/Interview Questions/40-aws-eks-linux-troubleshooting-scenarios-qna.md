# AWS / EKS / Linux Troubleshooting Scenarios (2–3 yrs) — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Five scenario questions that come up often in interviews for 2–3 years of experience. Each answer covers the investigation steps, the commands, and what the output tells you, and ends with an **interview-ready answer** you can say out loud. Background notes: [Processes & Performance](../scripting/processes-and-performance.md), [Disk Usage](../scripting/linux-cmds.md#disk-usage-df-du-inodes), [Reverse Proxy vs Load Balancer](../Load%20Balancing/load-balancing-overview.md#4-reverse-proxy-vs-load-balancer).

**Answer every scenario in this order:** identify the symptom → gather metrics → isolate the root cause → apply a safe fix → verify recovery → prevent recurrence. Interviewers want to know which commands you'd run, what their output tells you, and what you'd do next. Definitions alone aren't enough.

---

## Table of Contents
1. [Production EC2 instance at 100% CPU](#01-a-production-ec2-instance-is-at-100-cpu-how-would-you-investigate)
2. [EKS worker node running out of disk](#02-an-eks-worker-node-is-running-out-of-disk-space-how-would-you-safely-recover-space)
3. [App behind an AWS ALB returns 502 / 503](#03-an-application-behind-an-aws-alb-returns-http-502-or-503-how-would-you-troubleshoot)
4. [Java app using 90% RAM — leak or not?](#04-a-java-application-is-using-90-of-ram-how-would-you-tell-whether-its-a-memory-leak)
5. [NGINX load balancing across backends](#05-how-would-you-configure-nginx-to-distribute-traffic-between-multiple-backend-applications)
6. [Quick revision cheat sheet](#quick-revision-cheat-sheet)

---

### 01. A production EC2 instance is at 100% CPU. How would you investigate?

**Step 1: Which process is using the CPU?**
```bash
top                               # then P (sort by CPU), 1 (per-core view)
htop
ps aux --sort=-%cpu | head -10
```
```
USER    PID    %CPU   %MEM   COMMAND
root    1234   95.0   15.0   java
ubuntu  2345   25.0    5.0   python
```
`%CPU` is measured per core, so a multi-threaded process on a multi-core box can show more than 100% (200% = two full cores).

**Step 2: Is the box actually saturated?**
```bash
uptime        # load average: 8.50, 7.20, 6.10
nproc         # 2
```
A load of 8.5 on 2 vCPUs means about 4 tasks are queued for every core, so the box is heavily overloaded. Look at the trend too. 1-minute > 15-minute means the load is still climbing.

**Step 3: Is CPU really the bottleneck?**
```bash
vmstat 1 5
mpstat -P ALL 1 3     # one core at 100% and the rest idle = a single-threaded hot loop
```
| Field | High value means |
|---|---|
| `r` | Tasks waiting for CPU. Consistently greater than `nproc` means CPU-bound |
| `us` | Application code is burning CPU |
| `sy` | Kernel time: syscalls, context switches, networking |
| `wa` | Waiting on disk. **The real problem is I/O**, not CPU |
| `st` | Steal: the hypervisor is taking your CPU time. On AWS, usually a T-family instance that has used up its CPU credits |

**CloudWatch** (also useful when you can't SSH in):
- `CPUUtilization`: when did it start, and does it line up with a deploy or a traffic spike?
- `CPUCreditBalance` / `CPUSurplusCreditsCharged`: for **T2/T3/T4g**. If the balance is 0, the instance is throttled to its baseline (for example 20% on a t3.medium). Fix this with unlimited mode or a non-burstable instance type, not by changing the app.
- `StatusCheckFailed_System` / `_Instance`: host or OS problems.
- Load balancer `RequestCount`: is this simply more traffic?

**Step 4: Go into the application.** For Java:
```bash
top -H -p 1234                    # per-thread CPU → note the hottest TID, e.g. 1301
printf '%x\n' 1301                # → 515
jstack 1234 > /tmp/td.txt         # or: jcmd 1234 Thread.print
grep -A 20 'nid=0x515' /tmp/td.txt   # what that thread is executing
jstat -gcutil 1234 1000           # is it the GC? FGC/GCT climbing = GC thrash (really a memory problem)
```
Take 3 thread dumps about 5 seconds apart. A thread stuck in the same frame in all of them is your hot loop. For Python use `py-spy top --pid`. For anything else use `perf top -p <pid>`. Also check the logs:
```bash
journalctl -u myapp --since "30 minutes ago"
```
Common causes: an infinite loop or regex backtracking, GC thrash from a memory leak, a bad deploy, a traffic spike or bot traffic, a cron job (backup or compression) running at peak time, crypto-mining malware (an unknown process name, or outbound connections to mining pools).

**Step 5: Fix, then prevent.**
- Capture evidence first (thread dumps, a `top -b -n1` snapshot). A restart destroys it.
- Short term: roll back a bad deploy, `renice` or limit a batch job, or restart only if the service is down and you already have the evidence.
- Long term: fix the code or query, scale **vertically** (a bigger or non-burstable instance) or **horizontally** (an Auto Scaling Group with a target-tracking CPU policy behind the ALB), and alarm on CPU, credit balance and load per core.

> **Interview-ready answer:** "I'd confirm it in CloudWatch and see when it started and whether it lines up with a deploy or traffic. On the box, I'd use `top` and `ps aux --sort=-%cpu` to find the process, and `uptime` against `nproc` plus `vmstat` to see whether it's really CPU or I/O wait or steal. On T instances I check the CPU credit balance first. For a Java process, I'd find the hot thread with `top -H`, match it in a `jstack` dump, and check GC with `jstat`. I'd collect that evidence before restarting anything, then fix the root cause or roll back, scale with an ASG if it's real load, and add alarms."

**See also:** [28 Q01](./28-production-scenarios-rapid-round-qna.md#01-how-would-you-troubleshoot-high-cpu-memory-usage-and-disk-io-on-a-linux-server), [Processes & Performance](../scripting/processes-and-performance.md).

---

### 02. An EKS worker node is running out of disk space. How would you safely recover space?
EKS nodes keep container **images** (`/var/lib/containerd`), **writable container layers**, **emptyDir volumes** (`/var/lib/kubelet/pods`) and **container logs** (`/var/log/pods`) on the root volume. The default 20 GB volume fills up quickly.

**Step 1: Find the affected node.**
```bash
kubectl get nodes
kubectl describe node <node> | grep -A8 Conditions     # DiskPressure  True
kubectl get events -A --field-selector reason=Evicted   # pods already being evicted?
```
`DiskPressure=True` means the kubelet crossed its eviction threshold (by default `nodefs.available<10%`, `imagefs.available<15%`, or `nodefs.inodesFree<5%`). The node gets the `node.kubernetes.io/disk-pressure:NoSchedule` taint, and the kubelet starts **evicting pods** and garbage-collecting images.

**Step 2: Get onto the node.** Use an approved method: SSM Session Manager (`aws ssm start-session --target <instance-id>`), or `kubectl debug node/<node> -it --image=busybox`, where the host filesystem is mounted at `/host`.
```bash
df -h; df -i                                  # bytes AND inodes
sudo du -xhd1 /var | sort -hr
sudo du -sh /var/log/pods/* | sort -hr | head
sudo du -sh /var/lib/kubelet/pods/* | sort -hr | head    # emptyDir hogs
```

**Step 3: Images (containerd).**
```bash
sudo crictl images
sudo crictl ps -a
sudo crictl rmi --prune          # removes images no container uses; safe, goes through the runtime
```
The kubelet garbage-collects images on its own between `imageGCHighThresholdPercent` (85) and `imageGCLowThresholdPercent` (80). **Never `rm` files under `/var/lib/containerd`**, because that corrupts the runtime's metadata.

**Step 4: Logs.**
```bash
sudo find /var/log/pods -type f -size +500M -exec ls -lh {} +
```
A single noisy pod writing gigabytes means the application needs fixing (debug logging left on, or an error loop). Kubelet log rotation is configured in the kubelet config:
```yaml
containerLogMaxSize: 10Mi
containerLogMaxFiles: 5
```
Don't `rm` an active log file. The runtime keeps it open, so the space isn't freed and the log just disappears. If you have to, truncate it (`: > file`). Also check `journalctl --disk-usage` on the node.

**Step 5: Cordon, drain, replace.** On a managed node group, replacing the node is usually safer than cleaning it by hand:
```bash
kubectl cordon <node>                                 # stop new pods landing here
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data
```
Check **PodDisruptionBudgets** and replica counts before you drain, and check whether any workload depends on emptyDir data (`--delete-emptydir-data` deletes it). Then terminate the instance and let the ASG or Karpenter replace it.

**Step 6: Prevent it happening again.**
- Bigger root volume (gp3, 50–100 GB) in the launch template or Karpenter `EC2NodeClass`.
- Set `resources.requests/limits.ephemeral-storage` on pods so a disk hog gets evicted instead of taking down the node.
- Configure kubelet log rotation, and lower application log levels.
- Alert on node filesystem bytes **and inodes** (node-exporter `node_filesystem_avail_bytes`, `node_filesystem_files_free`, or Container Insights).
- Use smaller images, and fewer distinct image versions per node.

> **Interview-ready answer:** "I'd find the node with `kubectl describe node` and confirm `DiskPressure`. Then I'd get onto it through SSM and check `df -h`, `df -i` and `du` on `/var/log/pods`, `/var/lib/containerd` and `/var/lib/kubelet`. Images I'd clean through the runtime with `crictl rmi --prune`, never by deleting containerd files. Oversized logs point to an app that needs fixing. If the node is unhealthy, I'd cordon and drain it after checking PDBs and emptyDir use, and let the node group replace it. To stop it recurring: log rotation, ephemeral-storage limits, larger volumes, and disk and inode alerts."

**See also:** [Disk Usage + safe cleanup](../scripting/linux-cmds.md#disk-usage-df-du-inodes), [38](./38-vpc-terraform-grafana-linux-scenarios-qna.md) (node pressure).

---

### 03. An application behind an AWS ALB returns HTTP 502 or 503. How would you troubleshoot?

| Code | Meaning at the ALB |
|---|---|
| **502 Bad Gateway** | The ALB reached a target but got an invalid response, or the connection broke: reset or closed, malformed HTTP, TLS handshake failure, or a Lambda error |
| **503 Service Unavailable** | The ALB has nowhere to send the request: no registered targets, all targets unhealthy (and fail-open isn't triggered), or a listener rule pointing at an empty target group |
| **504 Gateway Timeout** | The target didn't answer within the ALB idle timeout (default 60 s) |

**First question: did the ALB generate the error, or did the app?** The app can return its own 502 or 503, for example NGINX inside the pod, or an upstream it depends on.

**Step 1: CloudWatch (AWS/ApplicationELB).**
| Metric | Tells you |
|---|---|
| `HTTPCode_ELB_502_Count` / `_503_Count` | Errors **generated by the ALB** |
| `HTTPCode_Target_5XX_Count` | 5xx **returned by the targets** (an app problem) |
| `HealthyHostCount` / `UnHealthyHostCount` | Whether any targets are available. 0 healthy means a 503 |
| `TargetResponseTime` | Backend latency. Rising toward the idle timeout leads to 504s |
| `TargetConnectionErrorCount` | ALB couldn't connect at all (security group or port problem) |

ALB **access logs** (to S3; query them with Athena) show `elb_status_code` and `target_status_code` side by side. `elb=502, target=-` means the target never returned a valid response.

**Step 2: Target health.**
```bash
aws elbv2 describe-target-health --target-group-arn <tg-arn> \
  --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State,TargetHealth.Reason]' --output table
```
Reason codes: `Target.ResponseCodeMismatch` (health path returns 301/404/500), `Target.Timeout`, `Target.FailedHealthChecks`, `Target.NotRegistered`, `Target.NotInUse` (target's AZ isn't enabled on the ALB), `Elb.InitialHealthChecking`.

**Step 3: Health check configuration.** Check the path (`/health`), port, protocol, success codes (`200` vs `200-399`), and timeout and interval. Then test from inside the VPC:
```bash
curl -v http://<target-ip>:8080/health
```
A common trap is a health endpoint that checks the database. When the database has a blip, *every* target goes unhealthy and you get a 503 for everything. Keep health checks shallow.

**Step 4: Network.** The ALB security group must allow 443/80 from clients. The **target security group must allow the target port from the ALB security group** (reference the SG, not CIDRs). NACLs need the ephemeral return ports allowed. Path: `Client → ALB:443 → target:8080`.

**Step 5: Application logs.**
```bash
sudo journalctl -u myapp -n 100                         # EC2
kubectl get pods -n production -o wide                   # EKS
kubectl describe pod <pod> -n production                 # OOMKilled? readiness failing? restarts?
kubectl logs <pod> -n production --previous
kubectl get endpoints <svc> -n production                # empty = no ready pods = 503
```

**Step 6: 502-specific causes.**
- **Keep-alive mismatch (the classic one):** the app's keep-alive timeout is shorter than the ALB idle timeout (60 s), so the app closes an idle connection just as the ALB reuses it, causing intermittent 502s. Set the app's keep-alive to more than 60 s (Node `server.keepAliveTimeout = 65000`, gunicorn `--keep-alive 65`, NGINX `keepalive_timeout 75s`).
- Protocol mismatch: target group set to HTTPS while the app speaks HTTP (or the other way round), or a bad or expired certificate on an HTTPS target.
- The app crashing or being OOM-killed mid-request, or response headers too large or malformed.
- **During deploys:** pods killed before the ALB deregisters them. Add a `preStop` sleep, set `terminationGracePeriodSeconds` longer than the deregistration delay, and use readiness gates with the AWS Load Balancer Controller.

**503-specific causes:** the target group is empty (an ASG scaled to 0, a selector mismatch in EKS), every target is failing health checks, or a listener rule forwards to the wrong or empty target group.

> **Interview-ready answer:** "First I'd use CloudWatch and the access logs to tell whether the ALB generated the error (`HTTPCode_ELB_5XX`) or the target did (`HTTPCode_Target_5XX`). For a 503, I'd check `describe-target-health` and the reason codes, which usually point to health check path, port or success-code problems or to no registered targets. For a 502, I'd look at connection resets, protocol or TLS mismatches, the app crashing, and the keep-alive timeout being shorter than the ALB idle timeout. I'd also verify that the target security group allows traffic from the ALB security group, and read the app or pod logs. Then I'd fix the config or app and watch the metrics recover."

**See also:** [08 Q17](./08-networking-and-security-fundamentals-qna.md) (502 after deploy), [Health checks](../Load%20Balancing/health-checks-and-failover.md), [Cloud LBs](../Load%20Balancing/cloud-load-balancers.md).

---

### 04. A Java application is using 90% of RAM. How would you tell whether it's a memory leak?
**High memory alone isn't a leak.** The JVM reserves its heap up to `-Xmx` and rarely gives it back to the OS, so 90% RSS can be completely normal. A leak means **live memory keeps growing after each GC** until you get an OOM. JVM memory = heap + metaspace + thread stacks + code cache + direct buffers + GC overhead + native/JNI.

**Step 1: The process and the box.**
```bash
ps aux --sort=-%mem | head
free -h                      # "available" column, plus swap
top -p 1234                  # RES over time
dmesg -T | grep -i oom       # has the kernel already OOM-killed anything?
```

**Step 2: Heap configuration.**
```bash
jcmd 1234 VM.flags | tr ' ' '\n' | grep -E 'MaxHeapSize|InitialHeapSize|MaxRAMPercentage'
ps -ef | grep java           # e.g. java -Xms512m -Xmx4g -jar app.jar
```
If `-Xmx` is about equal to the instance or container memory, 90% usage is expected, and you risk an OOM kill because the non-heap memory has no room. In containers, use `-XX:MaxRAMPercentage=70-75` instead of a fixed `-Xmx`.

**Step 3: Watch the GC.**
```bash
jstat -gcutil 1234 1000      # sample every 1s
#  S0  S1   E     O     M    YGC  YGCT  FGC  FGCT   GCT
```
- `O` (old gen %) **after each full GC** is the key number. A sawtooth that returns to the same baseline is healthy. A baseline that keeps rising means a **leak**.
- `FGC`/`GCT` climbing fast with `O` stuck near 100% means the JVM is GC-thrashing: high CPU, long pauses, and `OutOfMemoryError: GC overhead limit exceeded` next.
- Also check `jcmd 1234 GC.heap_info` and the GC log (`-Xlog:gc*`).

**Step 4: Heap dump.**
```bash
jcmd 1234 GC.class_histogram | head -30      # cheap first look: which classes have the most instances/bytes
jcmd 1234 GC.heap_dump /tmp/heap.hprof       # full dump
```
A heap dump **pauses the JVM** (seconds to minutes), is about the size of the heap (check `df -h` first), and **contains sensitive data** (tokens, PII), so handle it like a secret. Take it on one instance after removing it from the load balancer. Set `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/dumps` ahead of time so the next OOM produces a dump automatically. Analyze it in **Eclipse MAT** (Leak Suspects report, dominator tree), VisualVM, or JMC/JFR. Look for objects that keep huge amounts of memory alive, ever-growing `HashMap`s or `List`s, or caches without size limits.

**Step 5: Heap stable but RSS still growing? That's native memory.**
```bash
# requires -XX:NativeMemoryTracking=summary at JVM start
jcmd 1234 VM.native_memory baseline
jcmd 1234 VM.native_memory summary.diff     # later: which area grew
grep Threads /proc/1234/status              # thread leak? each thread ≈ 1 MB of stack
```
Suspects: direct `ByteBuffer`s (Netty; cap with `-XX:MaxDirectMemorySize`), thread leaks, metaspace growth from classloader leaks (redeploys, dynamic proxies), JNI libraries, and glibc malloc arenas (try `MALLOC_ARENA_MAX=2`).

**Step 6: Fix and confirm.** Bound collections and caches (size plus TTL, for example Caffeine), close streams, connections and `ThreadLocal`s, size the heap for the box, add JVM metrics (Micrometer/JMX: heap after GC, GC pause time, thread count) with alerts, and compare memory curves before and after the fix over several hours under load.

> **Interview-ready answer:** "High RAM alone doesn't prove a leak, because the JVM keeps its heap up to `-Xmx`. I'd first check the heap settings with `jcmd VM.flags` and compare them with the box or container limit. Then I'd watch `jstat -gcutil`: if old-gen usage after full GCs keeps climbing, that's a leak, so I'd take a class histogram and a heap dump on an instance pulled out of rotation and analyze it in Eclipse MAT. If the heap is stable but RSS keeps growing, it's native memory, so I'd use Native Memory Tracking and check threads, direct buffers and metaspace. After the fix, I'd compare memory before and after and add GC and heap alerts."

**See also:** [38](./38-vpc-terraform-grafana-linux-scenarios-qna.md) (JVM sizing in containers), [28 Q03](./28-production-scenarios-rapid-round-qna.md#03-how-do-you-troubleshoot-container-crashes-oomkilled-events-and-image-pull-failures) (OOMKilled).

---

### 05. How would you configure NGINX to distribute traffic between multiple backend applications?
NGINX acts as a reverse proxy, and once an `upstream` has several servers it is also a load balancer.

```
Clients → NGINX :80/:443 ──► 10.0.1.10:8080
                         ├─► 10.0.1.11:8080
                         └─► 10.0.1.12:8080
```

**Step 1: Upstream + proxy_pass** (`/etc/nginx/conf.d/app.conf`):
```nginx
upstream backend_servers {
    # algorithm goes here (default: round robin)
    server 10.0.1.10:8080 max_fails=3 fail_timeout=30s;
    server 10.0.1.11:8080 max_fails=3 fail_timeout=30s;
    server 10.0.1.12:8080 max_fails=3 fail_timeout=30s;
    keepalive 32;                         # reuse upstream connections
}

server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name example.com;
    ssl_certificate     /etc/ssl/certs/example.com.crt;
    ssl_certificate_key /etc/ssl/private/example.com.key;

    location / {
        proxy_pass http://backend_servers;
        proxy_http_version 1.1;           # needed for upstream keepalive
        proxy_set_header Connection "";
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 5s;
        proxy_read_timeout    60s;
        proxy_next_upstream error timeout http_502 http_503;   # retry on another backend
        proxy_next_upstream_tries 2;
    }
}
```

**Step 2: Pick an algorithm.**
| Directive | Behaviour | Use when |
|---|---|---|
| *(none)* | Round robin, in rotation | Identical, stateless backends |
| `least_conn;` | Fewest active connections (weights are taken into account) | Requests of very different lengths, long-lived connections |
| `server … weight=3;` | Proportional. With weights 3 and 1, about 75% / 25% | Backends of different sizes, canary releases |
| `ip_hash;` | Same client IP goes to the same backend | Simple stickiness (breaks behind NAT or a CDN, where many users share an IP) |
| `hash $request_uri consistent;` | Consistent hashing on any key | Cache locality; keys move minimally when the pool changes |
| `server … backup;` | Used only when all the others are down | Cold standby |

**Step 3: Failure handling.** `max_fails=3 fail_timeout=30s` is a **passive** health check: after 3 failed attempts within 30 s, NGINX skips that server for 30 s. `proxy_next_upstream` retries the request on another server. Open-source NGINX has **no active health checks** (`health_check` is NGINX Plus only). For active checks, use HAProxy, Envoy, or put the backends behind a cloud LB.

**Step 4: Test and reload.**
```bash
sudo nginx -t                         # syntax check, always before reload
sudo systemctl reload nginx           # graceful: old workers finish their in-flight requests
for i in {1..12}; do curl -s http://example.com/whoami; echo; done | sort | uniq -c   # each backend returns its hostname
```
Then stop one backend, check that traffic moves to the others with no client-visible errors, and watch `/var/log/nginx/error.log` for `upstream timed out` or `no live upstreams`. Adding `$upstream_addr` and `$upstream_response_time` to the `log_format` shows which backend served each request.

**Different apps on different paths** (routing rather than balancing):
```nginx
location /api/  { proxy_pass http://api_servers; }
location /auth/ { proxy_pass http://auth_servers; }
location /      { proxy_pass http://web_servers; }
```

> **Interview-ready answer:** "I'd define an `upstream` block with the backend servers and point `proxy_pass` at it. That gives round robin by default, and I can switch to `least_conn`, weights or `ip_hash` depending on the workload. I'd set the forwarded headers, timeouts, `proxy_next_upstream` for retries, `max_fails` and `fail_timeout` for passive health checks, upstream keepalive, and TLS termination on 443. Then `nginx -t`, a graceful `systemctl reload`, and a curl loop against an endpoint that returns each backend's hostname to confirm the distribution, plus a test where I stop one backend."

**See also:** [Reverse Proxy vs Load Balancer](../Load%20Balancing/load-balancing-overview.md#4-reverse-proxy-vs-load-balancer), [Algorithms](../Load%20Balancing/load-balancing-algorithms.md), [Software LBs](../Load%20Balancing/software-load-balancers.md).

---

## Quick revision cheat sheet

| Scenario | First commands / checks | Goal |
|---|---|---|
| EC2 100% CPU | CloudWatch (+ `CPUCreditBalance`), `top`, `ps aux --sort=-%cpu`, `uptime` vs `nproc`, `vmstat` | Find the process; rule out I/O wait, steal and credits |
| EKS disk full | `kubectl describe node` (DiskPressure), `df -h`, `df -i`, `du`, `crictl rmi --prune` | Recover space without corrupting the runtime; cordon/drain/replace |
| ALB 502/503 | `HTTPCode_ELB_*` vs `HTTPCode_Target_*`, `describe-target-health`, SGs, logs | Isolate ALB vs target; health check, network, keep-alive |
| Java 90% RAM | `jcmd VM.flags`, `jstat -gcutil`, class histogram, heap dump → MAT, NMT | Tell a heap leak from native growth from normal JVM behaviour |
| NGINX LB | `upstream`, `proxy_pass`, `least_conn`/`weight`, `max_fails`, `nginx -t`, reload | Distribute traffic and survive a backend failure |

**Approach:** Symptom → Metrics → Root cause → Safe fix → Verify → Prevent.

---

*Part of the [Interview Questions](./README.md) hub. See [`../Index.md`](../Index.md) for the full repository index.*
