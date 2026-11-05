# Linux Internals, Coding & DSA for DevOps/SRE — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Fills gaps from the common "SRE / DevOps interview topic list": Linux memory and I/O internals, HTTP versions, concurrency in Go and Python, and the data-structure problems SRE coding rounds actually ask (LRU, top-K, rate limiter, sliding window). Code is Python unless noted, written to be typed out in an interview.

Already answered elsewhere, not repeated here:
| Topic | Where |
|---|---|
| Process vs thread, high CPU/memory | [01 Q9](./01-linux-and-scripting-qna.md), [28 Q01](./28-production-scenarios-rapid-round-qna.md), [40 Q01](./40-aws-eks-linux-troubleshooting-scenarios-qna.md) |
| Browser → server request flow | [31 Q01](./31-core-devops-scenarios-gap-fill-qna.md) |
| DNS resolution · TLS handshake | [23 Q14](./23-how-it-works-internals-qna.md) · [08 Q13](./08-networking-and-security-fundamentals-qna.md) |
| Load balancer vs reverse proxy · latency | [Load-balancing overview §4](../Load%20Balancing/load-balancing-overview.md#4-reverse-proxy-vs-load-balancer) · [35 Q14](./35-observability-rca-scripting-go-qna.md) |
| CPU alert script (Bash) · log parsing (Bash/awk) | [18 Q21](./18-practical-scripting-challenges-qna.md) · [35 Q24](./35-observability-rca-scripting-go-qna.md), [18 Q5](./18-practical-scripting-challenges-qna.md) |
| Goroutines/channels/WaitGroup · retry with backoff | [35 Q29, Q30](./35-observability-rca-scripting-go-qna.md) · [35 Q23](./35-observability-rca-scripting-go-qna.md) |
| Java memory leak | [40 Q04](./40-aws-eks-linux-troubleshooting-scenarios-qna.md) |

---

## Table of Contents
**Linux & OS**
1. [Virtual memory, swap and the OOM killer](#01-explain-virtual-memory-and-how-the-linux-oom-killer-decides-what-to-kill)
2. [Debugging disk I/O](#02-how-do-you-debug-a-disk-io-bottleneck)
3. [Zombie vs orphan processes](#03-whats-the-difference-between-a-zombie-and-an-orphan-process)

**Networking**

4. [HTTP/1.1 vs HTTP/2 vs HTTP/3](#04-compare-http11-http2-and-http3)

**Programming**

5. [Go: goroutines, channels and mutexes](#05-go-when-do-you-use-channels-vs-a-mutex-show-both)
6. [Python: multiprocessing vs multithreading](#06-python-multiprocessing-vs-multithreading-vs-asyncio)
7. [Exponential backoff with jitter](#07-implement-exponential-backoff-with-jitter)
8. [Detect memory leaks (Python / Go / any service)](#08-how-do-you-detect-a-memory-leak-in-a-python-or-go-service)
9. [CPU monitoring script (Python)](#09-write-a-cpu-monitoring-script-that-alerts-on-sustained-high-usage)
10. [Automate log analysis (Python)](#10-automate-analysis-of-an-nginx-access-log-in-python)

**Data Structures & Algorithms**

11. [LRU cache](#11-implement-an-lru-cache)
12. [Top K frequent elements](#12-top-k-frequent-elements-eg-top-k-client-ips)
13. [Detect a linked-list cycle](#13-detect-a-cycle-in-a-linked-list)
14. [Implement a rate limiter](#14-implement-a-rate-limiter-token-bucket-and-sliding-window)
15. [Hash maps and collision handling](#15-how-do-hash-maps-work-and-how-are-collisions-handled)
16. [Sliding window and two pointers](#16-sliding-window-and-two-pointer-problems)

---

## 🔹 Linux & OS

### 01. Explain virtual memory, and how the Linux OOM killer decides what to kill.
Each process gets its own **virtual address space**. The kernel maps virtual pages to physical RAM through page tables, which gives isolation (one process can't read another's memory), lets the kernel allocate lazily (a physical page is assigned on first write, as a *minor fault*), and allows sharing (shared libraries, copy-on-write after `fork`). That's why `VIRT` is much larger than `RES`. Pages can be backed by files (page cache, reclaimable) or be *anonymous* (heap and stack, which can only be reclaimed by swapping). Linux **overcommits**, handing out more virtual memory than exists (`vm.overcommit_memory`), on the bet that not all of it gets used.

When the kernel can't reclaim enough memory (page cache dropped, swap full or absent), the **OOM killer** chooses a victim by **`oom_score`**, roughly the process's share of RAM plus swap, adjusted by **`oom_score_adj`** (−1000 to +1000). It sends SIGKILL and logs `Out of memory: Killed process 1234 (java)` (see `dmesg -T`). In containers, the **cgroup limit** triggers its own OOM even when the host has free memory: K8s shows `OOMKilled`, exit code **137**. Under node pressure, kubelet's QoS-based `oom_score_adj` means **BestEffort pods die first and Guaranteed pods last**.

Before an OOM you usually see swapping (`vmstat` `si/so`), major faults, `available` near zero, and PSI memory pressure rising (`/proc/pressure/memory`). Fixes: fix leaks, right-size limits, cap runtimes so they fit (`-XX:MaxRAMPercentage`), protect critical daemons with a negative `oom_score_adj`, and alert on memory working set against the limit. Notes: [Processes & Performance §4](../scripting/processes-and-performance.md#4-virtual-memory-oom-killer-disk-io-zombies--orphans).

### 02. How do you debug a disk I/O bottleneck?
1. **Confirm it's I/O:** `top`/`vmstat 1` shows high `wa` and `b` > 0, load average high while CPU is mostly idle, tasks in `D` state (`ps -eo state,pid,cmd | awk '$1=="D"'`), and rising `/proc/pressure/io`.
2. **Which device:** `iostat -xz 1`. Look at `r_await`/`w_await` (ms per request), `aqu-sz` (queue depth), r/s and w/s (IOPS), and rkB/s and wkB/s (throughput). Rising await with a deep queue means saturation. Don't trust `%util` alone on SSD/NVMe/EBS.
3. **Which process / file:** `iotop -oPa`, `pidstat -d 1`, then `lsof -p <pid>` or `strace -f -e trace=file,write,fsync -p <pid>` to see what it's writing.
4. **Cloud limits:** an EBS volume at its provisioned IOPS/throughput, an exhausted gp2/st1 burst balance, or the instance's EBS bandwidth cap. Check CloudWatch `VolumeQueueLength`, `BurstBalance`, `EBSIOBalance%`.
5. **Typical causes and fixes:**
   - Chatty logging or `fsync`-per-write: buffer writes, lower the log level.
   - DB scans: add indexes, give it more buffer-pool memory.
   - Swap thrashing: this is really a memory problem.
   - Backup or compression jobs at peak: reschedule them, run with `ionice -c3`.
   - An undersized volume: raise gp3 IOPS or throughput, or use io2.
   - Logs and data on the same disk: split them.

### 03. What's the difference between a zombie and an orphan process?
A **zombie** has *finished*, but its parent hasn't called `wait()` to read the exit status, so only its process-table entry (the PID) remains. It uses no CPU or memory and can't be killed (it's already dead). Fix the parent, or kill it so PID 1 inherits and reaps the zombie. Large numbers matter because they can exhaust PIDs. An **orphan** is *still running* after its parent exited. The kernel re-parents it to PID 1 (or a subreaper), which reaps it later. That's harmless, and daemons do it on purpose (double fork). The container gotcha: if your app is PID 1 and doesn't reap children, orphans that exit become zombies that never go away. Use `tini` / `docker run --init`. Find zombies with `ps -eo pid,ppid,stat,cmd | awk '$3 ~ /Z/'`.

---

## 🔹 Networking

### 04. Compare HTTP/1.1, HTTP/2 and HTTP/3.
**HTTP/1.1** is text over TCP, one in-flight request per connection, so browsers open about 6 connections per host. Headers are resent uncompressed on every request. **HTTP/2** keeps TCP but switches to binary frames, **multiplexes** many streams over one connection, and compresses headers (HPACK). It's negotiated through **ALPN** during TLS. It fixes head-of-line (HOL) blocking at the HTTP layer, but **TCP HOL blocking remains**: one lost packet stalls every stream until it's retransmitted. **HTTP/3** runs over **QUIC on UDP**. Streams are independent at the transport level (no TCP HOL), TLS 1.3 is built into the handshake (1-RTT, 0-RTT on resume), and connections survive IP changes (connection IDs), which helps mobile users. Ops implications:
- gRPC needs end-to-end HTTP/2. Long-lived h2 connections make L4 balancing uneven, so use L7 (Envoy, ALB with gRPC) or client-side balancing.
- HTTP/3 needs UDP 443 open and is usually terminated at the CDN or edge.
- Servers advertise h3 through `Alt-Svc`.
- Check with `curl -w '%{http_version}'`.

Details: [networking-fundamentals.md](../Networking%20and%20Security%20Fundamentals/networking-fundamentals.md#http11-vs-http2-vs-http3).

---

## 🔹 Programming

### 05. Go: when do you use channels vs a mutex? Show both.
Rule of thumb: **channels to pass ownership of data or coordinate work** (pipelines, worker pools, fan-out/fan-in, cancellation), **a mutex to protect a small piece of shared state** (a counter, a map, a cache). "Don't communicate by sharing memory; share memory by communicating", but a mutex is simpler and faster for plain shared state.

```go
// Mutex: protect shared state
type Counter struct {
    mu sync.Mutex
    m  map[string]int
}
func (c *Counter) Inc(k string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.m[k]++
}
// sync.RWMutex when reads dominate (RLock/RUnlock for readers); sync/atomic for a single int.
```

```go
// Channels: bounded worker pool health-checking URLs
func checkAll(ctx context.Context, urls []string, workers int) map[string]int {
    jobs := make(chan string)
    type res struct{ url string; code int }
    results := make(chan res)
    var wg sync.WaitGroup

    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for u := range jobs {                       // exits when jobs is closed
                req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
                code := 0
                if resp, err := http.DefaultClient.Do(req); err == nil {
                    code = resp.StatusCode
                    resp.Body.Close()
                }
                results <- res{u, code}
            }
        }()
    }
    go func() {                                         // producer
        defer close(jobs)
        for _, u := range urls {
            select {
            case jobs <- u:
            case <-ctx.Done():
                return
            }
        }
    }()
    go func() { wg.Wait(); close(results) }()           // close results when all workers finish

    out := map[string]int{}
    for r := range results {
        out[r.url] = r.code
    }
    return out
}
```
Things to mention:
- An unbuffered channel is a sync point; a buffered channel decouples sender and receiver (a bounded queue gives **backpressure**).
- Only the sender closes a channel. Sending on a closed channel panics.
- `select` with `ctx.Done()` or `time.After` handles timeouts and cancellation.
- **Goroutine leaks** come from goroutines blocked forever on a channel nobody reads.
- Run tests with `go test -race` to catch data races.
- `errgroup` gives you WaitGroup plus first-error cancellation.

### 06. Python: multiprocessing vs multithreading (vs asyncio)?
CPython's **GIL** lets only one thread run Python bytecode at a time. So:
| Workload | Use | Why |
|---|---|---|
| **I/O-bound** (HTTP calls, AWS APIs, DB, SSH) | `ThreadPoolExecutor` or **asyncio** | Threads release the GIL while waiting on I/O; asyncio handles thousands of connections on one thread |
| **CPU-bound** (parsing huge logs, compression, hashing) | `ProcessPoolExecutor` / `multiprocessing` | Separate processes, each with its own GIL, so you use all cores. The cost: process startup, and arguments/results must be pickled |

```python
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed
import boto3, hashlib

def instance_count(region):                     # I/O-bound → threads
    ec2 = boto3.client("ec2", region_name=region)
    return region, sum(len(r["Instances"]) for p in ec2.get_paginator("describe_instances").paginate()
                       for r in p["Reservations"])

def sha256_file(path):                          # CPU-bound → processes
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return path, h.hexdigest()

if __name__ == "__main__":                      # required for multiprocessing on macOS/Windows (spawn)
    regions = ["us-east-1", "eu-west-1", "ap-south-1"]
    with ThreadPoolExecutor(max_workers=10) as ex:
        for fut in as_completed(ex.submit(instance_count, r) for r in regions):
            print(*fut.result())
    with ProcessPoolExecutor() as ex:           # defaults to os.cpu_count() workers
        for path, digest in ex.map(sha256_file, ["a.tar", "b.tar"]):
            print(path, digest)
```
Notes:
- Threads share memory, so you need `threading.Lock` for shared state. Processes don't share memory, so use queues or `multiprocessing.Manager` to communicate.
- In containers, `os.cpu_count()` returns the *host's* cores, not the CPU limit, so set the worker count explicitly.
- CPython 3.13+ has an optional **free-threaded (no-GIL) build**, but standard builds still have the GIL, so this answer holds for normal deployments.
- Web servers: gunicorn `-w` workers are processes (multiprocessing); `--threads` or uvicorn async handle I/O concurrency.

### 07. Implement exponential backoff with jitter.
```python
import random, time

class RetryableError(Exception): ...

def retry(fn, *, attempts=5, base=0.5, cap=30.0, retry_on=(ConnectionError, TimeoutError, RetryableError)):
    """Full-jitter exponential backoff: sleep = uniform(0, min(cap, base * 2**n))."""
    for n in range(attempts):
        try:
            return fn()
        except retry_on as e:
            if n == attempts - 1:
                raise                                    # out of attempts: surface the real error
            delay = random.uniform(0, min(cap, base * 2 ** n))
            print(f"attempt {n + 1} failed ({e!r}); retrying in {delay:.2f}s")
            time.sleep(delay)
```
What interviewers want to hear:
- **Why exponential:** it gives a struggling dependency room to recover.
- **Why jitter:** without it, every client retries at the same moment, causing synchronized retry storms (thundering herd).
- **Cap** the delay and the **attempt count**, and keep the total under the caller's timeout.
- **Only retry transient errors** (timeouts, 429, 502/503/504, connection reset), never 400/401/403/404. Honour `Retry-After`.
- **Only retry idempotent operations**, or make them idempotent with an idempotency key.
- Use a **retry budget** (e.g. retries ≤ 10% of requests) and **don't retry at every layer**, or 3 layers × 3 retries = 27× load.

Libraries: Python `tenacity`, AWS SDK built-in retries (`retries={"mode": "adaptive"}`), Go `backoff`/`retry-go`. A Bash version is in [35 Q23](./35-observability-rca-scripting-go-qna.md).

### 08. How do you detect a memory leak in a Python or Go service?
**First prove there's a leak, not just high usage.** A leak shows as memory (RSS or the container's `working_set`) climbing steadily **after warm-up and under steady load**, never levelling off, often with a sawtooth of OOMKill restarts (`kube_pod_container_status_restarts_total`, `container_memory_working_set_bytes` approaching the limit). High but flat memory is usually caches or the runtime holding on to freed memory.

**Python:**
```python
import tracemalloc
tracemalloc.start(25)
snap1 = tracemalloc.take_snapshot()
# ... let it serve traffic for a while ...
snap2 = tracemalloc.take_snapshot()
for stat in snap2.compare_to(snap1, "lineno")[:10]:
    print(stat)                       # top 10 lines whose allocations grew
```
Also useful: `memray` (native and Python allocations, flame graphs), `objgraph.show_growth()`, `gc.get_objects()` counts, and `py-spy dump` for a live process. Common causes: module-level dicts or lists used as unbounded caches (use `functools.lru_cache(maxsize=…)` or `cachetools.TTLCache`), objects held by global registries or listeners, reference cycles involving `__del__`, C-extension leaks (which grow RSS but not tracemalloc).

**Go:** expose `net/http/pprof` (on an internal port only), then:
```bash
go tool pprof -top http://localhost:6060/debug/pprof/heap            # inuse_space by function
go tool pprof -base heap1.pb.gz heap2.pb.gz                          # diff two snapshots
curl -s localhost:6060/debug/pprof/goroutine?debug=1 | head          # goroutine leak? count keeps growing
```
Common Go causes: **goroutine leaks** (blocked on a channel or a request with no timeout; watch `runtime.NumGoroutine()`), unbounded maps used as caches, sub-slices that keep a huge backing array alive, tickers never stopped, `resp.Body` never closed.

**Any language:** compare memory before and after a deploy (a leak introduced by a release is easy to bisect), take a heap snapshot at two points and diff them, and fix by bounding caches, closing resources, adding timeouts, and alerting on the memory growth trend, not just the absolute value. Java: [40 Q04](./40-aws-eks-linux-troubleshooting-scenarios-qna.md).

### 09. Write a CPU monitoring script that alerts on sustained high usage.
```python
#!/usr/bin/env python3
"""Alert when CPU stays above THRESHOLD for SUSTAIN consecutive samples; alert again on recovery."""
import os, socket, subprocess, time, json, urllib.request
import psutil

THRESHOLD = float(os.getenv("CPU_THRESHOLD", 85))
INTERVAL  = int(os.getenv("INTERVAL", 10))      # seconds per sample
SUSTAIN   = int(os.getenv("SUSTAIN", 3))        # 3 x 10s = 30s above threshold
WEBHOOK   = os.getenv("SLACK_WEBHOOK")

def alert(msg):
    print(msg, flush=True)
    if WEBHOOK:
        req = urllib.request.Request(WEBHOOK, json.dumps({"text": msg}).encode(),
                                     {"Content-Type": "application/json"})
        try:
            urllib.request.urlopen(req, timeout=5)
        except Exception as e:
            print(f"webhook failed: {e}")

def top_procs(n=5):
    return subprocess.run(["ps", "-eo", "pid,comm,%cpu,%mem", "--sort=-%cpu"],
                          capture_output=True, text=True).stdout.splitlines()[: n + 1]

breaches, alerting, host = 0, False, socket.gethostname()
while True:
    cpu = psutil.cpu_percent(interval=INTERVAL)          # blocks INTERVAL seconds, averaged over all cores
    breaches = breaches + 1 if cpu > THRESHOLD else 0
    if breaches >= SUSTAIN and not alerting:
        alerting = True
        load1, _, _ = os.getloadavg()
        alert(f":fire: {host} CPU {cpu:.0f}% for {SUSTAIN * INTERVAL}s (load {load1:.1f}, {psutil.cpu_count()} cores)\n"
              + "\n".join(top_procs()))
    elif alerting and cpu < THRESHOLD - 10:              # hysteresis: avoids flapping alerts
        alerting = False
        alert(f":white_check_mark: {host} CPU recovered: {cpu:.0f}%")
```
What makes it production-quality: a **sustained** threshold (one spike doesn't page anyone), **hysteresis** on recovery, alerts only on **state change**, context in the alert (load, core count, top processes), config from env vars, and running it under systemd (`Restart=always`). In real life node-exporter + Prometheus alerting does this job; the script shows you understand it. A no-dependency Bash version reading `/proc/stat` is in [18 Q21](./18-practical-scripting-challenges-qna.md).

### 10. Automate analysis of an nginx access log in Python.
```python
#!/usr/bin/env python3
"""Usage: python3 logstats.py /var/log/nginx/access.log [top_n]  — streams the file, constant memory per key."""
import re, sys
from collections import Counter, defaultdict

LINE = re.compile(r'(?P<ip>\S+) \S+ \S+ \[(?P<ts>[^\]]+)\] "(?P<method>\S+) (?P<path>[^ ?"]+)[^"]*" '
                  r'(?P<status>\d{3}) (?P<bytes>\d+|-)(?: "[^"]*" "[^"]*")?(?: (?P<rt>[\d.]+))?')

ips, statuses, errors_by_path, per_minute = Counter(), Counter(), Counter(), Counter()
latency = defaultdict(list)
total = bad = 0

with open(sys.argv[1], errors="replace") as f:
    for line in f:                                    # stream: never load a multi-GB file into memory
        m = LINE.match(line)
        if not m:
            bad += 1
            continue
        total += 1
        ips[m["ip"]] += 1
        statuses[m["status"]] += 1
        per_minute[m["ts"][:17]] += 1                 # "10/Oct/2025:13:55"
        if m["status"].startswith("5"):
            errors_by_path[m["path"]] += 1
        if m["rt"]:                                   # needs $request_time at the end of log_format
            latency[m["path"]].append(float(m["rt"]))

n = int(sys.argv[2]) if len(sys.argv) > 2 else 10
print(f"lines={total} unparsed={bad} 5xx_rate={sum(v for k, v in statuses.items() if k[0] == '5') / max(total, 1):.2%}")
print("status:", dict(sorted(statuses.items())))
print(f"top {n} IPs:", ips.most_common(n))
print(f"top {n} 5xx paths:", errors_by_path.most_common(n))
print("peak minute:", per_minute.most_common(1))
for path, xs in sorted(latency.items(), key=lambda kv: -len(kv[1]))[:n]:
    xs.sort()
    print(f"{path:40} n={len(xs):6} p50={xs[len(xs)//2]:.3f}s p99={xs[min(len(xs) - 1, int(len(xs) * 0.99))]:.3f}s")
```
Talking points:
- **Stream** line by line rather than calling `readlines()`.
- **Count unparsed lines** rather than crashing on them.
- `Counter.most_common` gives top-K.
- For huge files: `zcat`/`gzip.open` for rotated logs, multiprocessing over files, or push the logs to Loki/Athena instead.
- Make it useful operationally: run it from cron and alert when the 5xx rate crosses a threshold.

Bash/awk versions: [35 Q24](./35-observability-rca-scripting-go-qna.md), [18 Q5](./18-practical-scripting-challenges-qna.md), [awk-mastery](../scripting/awk-mastery.md).

---

## 🔹 Data Structures & Algorithms
SRE coding rounds usually pick problems with an ops flavour (caches, rate limiting, top talkers, log windows). Always state the **time and space complexity** and talk through edge cases.

### 11. Implement an LRU cache.
`get` and `put` in **O(1)**: a **hash map** for lookup plus a **doubly linked list** for recency order (most recent at the head, evict from the tail).
```python
class Node:
    __slots__ = ("key", "val", "prev", "next")
    def __init__(self, key=None, val=None):
        self.key, self.val, self.prev, self.next = key, val, None, None

class LRUCache:
    def __init__(self, capacity: int):
        self.cap = capacity
        self.map = {}
        self.head, self.tail = Node(), Node()          # sentinels: no None checks needed
        self.head.next, self.tail.prev = self.tail, self.head

    def _unlink(self, n):
        n.prev.next, n.next.prev = n.next, n.prev

    def _push_front(self, n):
        n.prev, n.next = self.head, self.head.next
        self.head.next.prev = n
        self.head.next = n

    def get(self, key):
        n = self.map.get(key)
        if n is None:
            return -1
        self._unlink(n)
        self._push_front(n)                            # mark as most recently used
        return n.val

    def put(self, key, val):
        if key in self.map:
            self._unlink(self.map[key])
        n = self.map[key] = Node(key, val)
        self._push_front(n)
        if len(self.map) > self.cap:
            lru = self.tail.prev                       # least recently used
            self._unlink(lru)
            del self.map[lru.key]
```
Shortcut version (mention it, but expect to be asked for the version above): `collections.OrderedDict` with `move_to_end(key)` on access and `popitem(last=False)` to evict. Follow-ups:
- **Thread safety:** wrap it in a `threading.Lock`.
- **TTL:** store an expiry timestamp per entry.
- **Real world:** Redis `maxmemory-policy allkeys-lru` (approximated by sampling), CPU caches, CDN eviction, `functools.lru_cache`.

### 12. Top K frequent elements (e.g. top K client IPs).
```python
from collections import Counter
import heapq

def top_k(items, k):
    counts = Counter(items)                                  # O(n)
    return heapq.nlargest(k, counts.items(), key=lambda kv: kv[1])   # O(m log k), m = distinct

def top_k_bucket(items, k):                                  # O(n): bucket sort by frequency
    counts = Counter(items)
    buckets = [[] for _ in range(len(items) + 1)]
    for x, c in counts.items():
        buckets[c].append(x)
    out = []
    for c in range(len(buckets) - 1, 0, -1):
        for x in buckets[c]:
            out.append((x, c))
            if len(out) == k:
                return out
    return out
```
Complexity: Counter is O(n). A heap of size k is O(m log k), better than sorting everything (O(m log m)) when k ≪ m. Bucket sort is O(n). Follow-ups:
- **Streaming or too large for memory:** use **Count-Min Sketch** plus a heap (approximate), or the *Space-Saving / Misra-Gries* algorithms.
- **Distributed:** compute top-K per shard and merge, or a map-reduce count by key.
- **One-liner equivalents:** `sort | uniq -c | sort -rn | head`, and PromQL `topk(10, sum by (client_ip) (rate(...)))`.

### 13. Detect a cycle in a linked list.
**Floyd's tortoise and hare**: O(n) time, **O(1) space**. (A hash set of visited nodes is O(n) space.)
```python
def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
        if slow is fast:
            return True
    return False

def cycle_start(head):
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
        if slow is fast:                      # they met inside the cycle
            slow = head                       # reset one pointer to head; move both one step at a time
            while slow is not fast:
                slow, fast = slow.next, fast.next
            return slow                       # meeting point = start of the cycle
    return None
```
Why it works: if there's a cycle, the fast pointer gains one node per step on the slow one, so it must catch up. The math (distance from head to cycle start = distance from meeting point to cycle start, mod cycle length) gives the start node. Ops analogies: detecting dependency cycles (Terraform's `Cycle:` error, Helm/K8s ownerReferences), redirect loops, routing loops (that's what IP TTL protects against).

### 14. Implement a rate limiter (token bucket and sliding window).
```python
import time, threading
from collections import deque, defaultdict

class TokenBucket:
    """Allows bursts up to `capacity`, refills at `rate` tokens/sec. O(1) time and memory per key."""
    def __init__(self, rate: float, capacity: int):
        self.rate, self.capacity = rate, capacity
        self.tokens, self.last = float(capacity), time.monotonic()
        self.lock = threading.Lock()

    def allow(self, cost: float = 1) -> bool:
        with self.lock:
            now = time.monotonic()
            self.tokens = min(self.capacity, self.tokens + (now - self.last) * self.rate)
            self.last = now
            if self.tokens >= cost:
                self.tokens -= cost
                return True
            return False

class SlidingWindowLog:
    """Exactly `limit` requests per `window` seconds per key. O(limit) memory per key."""
    def __init__(self, limit: int, window: float):
        self.limit, self.window = limit, window
        self.hits = defaultdict(deque)
        self.lock = threading.Lock()

    def allow(self, key: str) -> bool:
        with self.lock:
            now, q = time.monotonic(), self.hits[key]
            while q and q[0] <= now - self.window:      # drop timestamps outside the window
                q.popleft()
            if len(q) < self.limit:
                q.append(now)
                return True
            return False

buckets = defaultdict(lambda: TokenBucket(rate=5, capacity=10))   # per-client: 5 req/s, bursts of 10
if not buckets["api-key-123"].allow():
    print("429 Too Many Requests")
```
| Algorithm | Pros | Cons |
|---|---|---|
| Fixed window counter (`INCR key:minute`) | Simplest, O(1) | Allows a 2× burst at the window boundary |
| Sliding window log | Exact | Memory grows with the limit |
| Sliding window counter (weighted previous + current window) | O(1), close to exact | Approximate |
| **Token bucket** | Allows controlled bursts, O(1), the most common (AWS API Gateway, Envoy, NGINX-like) | Bursts may not suit every backend |
| Leaky bucket | Smooth constant output rate | Adds queueing delay |

Use `time.monotonic()`, not `time.time()`, so clock changes can't break it. Return **429** with `Retry-After`. This version is **single-process**; the multi-instance version with Redis and Lua is in [42 Q02](./42-system-design-staff-sre-qna.md#02-design-a-distributed-rate-limiter). NGINX: `limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s; limit_req zone=api burst=20 nodelay;`.

### 15. How do hash maps work, and how are collisions handled?
A hash map stores key→value pairs in an array of **buckets**: `index = hash(key) mod capacity`. Lookup, insert and delete average **O(1)**. When two keys land in the same bucket (a **collision**, which is unavoidable given the pigeonhole principle), there are two main strategies:
- **Separate chaining:** each bucket holds a list of entries. Java's `HashMap` does this, and converts a long chain (≥ 8 entries) into a balanced tree, so the worst case is O(log n) instead of O(n).
- **Open addressing:** on a collision, probe for another free slot (linear probing, quadratic probing, double hashing). It's cache-friendly, but needs tombstones for deletes and a lower load factor. **Python's `dict`** uses open addressing with a perturbed probe sequence (plus a compact insertion-ordered entries array).

**Load factor** (entries / buckets) drives performance. Past a threshold (Java 0.75, Python about 2/3) the table **resizes**, usually doubling, and rehashes every entry. That's an O(n) step, but **amortized O(1)** per insert. Worst case: all keys collide and operations become O(n). Attackers can force this deliberately (**hash-flooding DoS**), which is why Python, Go, Ruby and others use **randomized hash seeds** (`PYTHONHASHSEED`) and SipHash. Keys must be immutable and hashable, with consistent `__eq__`/`__hash__`.

Infra connections: **consistent hashing** (adding or removing a node remaps only about 1/n of keys) is how load balancers (`hash … consistent`), Cassandra/DynamoDB partitioning and memcached clients spread keys. Redis Cluster uses 16384 hash slots (CRC16). See [load-balancing-algorithms.md](../Load%20Balancing/load-balancing-algorithms.md).

### 16. Sliding window and two-pointer problems.
Both turn an O(n²) "check every subarray or pair" approach into **O(n)** by moving pointers forward only.

**Sliding window, ops flavour:** "Given sorted request timestamps, what is the peak number of requests in any 60-second window?"
```python
def peak_in_window(ts, window=60):
    left = best = 0
    for right, t in enumerate(ts):           # expand right
        while t - ts[left] >= window:         # shrink left until the window is valid
            left += 1
        best = max(best, right - left + 1)
    return best
```
**Variable window:** longest substring without repeating characters.
```python
def longest_unique(s):
    last, left, best = {}, 0, 0
    for right, ch in enumerate(s):
        if ch in last and last[ch] >= left:
            left = last[ch] + 1               # jump past the previous occurrence
        last[ch] = right
        best = max(best, right - left + 1)
    return best
```
**Two pointers** on sorted input: find two numbers that add up to a target, e.g. two log-file sizes that exactly fill a quota.
```python
def pair_with_sum(nums, target):            # nums sorted
    i, j = 0, len(nums) - 1
    while i < j:
        s = nums[i] + nums[j]
        if s == target:
            return i, j
        if s < target:
            i += 1
        else:
            j -= 1
    return None
```
Other two-pointer classics: merging two sorted lists (merging sorted log streams), removing duplicates in place, reversing, and Floyd's cycle detection (Q13). **When to use which:** use a window when the question asks about a **contiguous range** (subarray, substring, time window); use two pointers for **pairs in sorted data** or in-place partitioning. Real systems use the same ideas: a sliding-window rate limiter (Q14), and PromQL `rate()`/`increase()` over a `[5m]` window.

---

*Part of the [Interview Questions](./README.md) hub. See [`../Index.md`](../Index.md) for the full repository index.*
