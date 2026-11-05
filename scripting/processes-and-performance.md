# Processes, Threads & Performance (`ps`, `top`, `htop`, `free`)

Interview-focused notes: what a process and a thread are, how to read `top` properly, and the order of commands to run when a server is slow. Disk space (`df`, `du`, inodes) lives in [Linux Commands → Disk Usage](linux-cmds.md#disk-usage-df-du-inodes).

---

## 1. Process vs Thread

A **process** is a running program with its own address space, PID, open file descriptors and resources. Two `python3 app.py` runs are two processes.

A **thread** is a unit of execution *inside* a process. All threads of a process share its memory, file descriptors and PID (each thread has its own TID, stack and registers). A Java/Go/Node server handling many requests at once is usually one process with many threads.

| | Process | Thread |
|---|---|---|
| Memory | Own address space | Shares the process's memory |
| Creation cost | Higher (`fork`/`exec`, new page tables) | Lower (`clone` sharing memory) |
| Communication | IPC: pipes, sockets, shared memory, signals | Directly through shared variables (needs locks) |
| Crash impact | Usually isolated to that process | A segfault/fatal error in one thread kills the whole process |
| Context switch | Heavier (address-space switch, TLB flush) | Lighter (same address space) |
| Identity | PID | TID (same PID/TGID as its process) |
| Example | nginx master + worker *processes* | JVM worker *threads*, Tomcat thread pool |

On Linux the kernel schedules both as "tasks" (`clone()` with different sharing flags) — a thread is a task that shares memory with its siblings. That's why `top -H` and `ps -L` can list threads like processes.

**When to pick which:** processes for isolation (one crash shouldn't take down the rest — nginx workers, PostgreSQL backends, gunicorn workers); threads for cheap concurrency with shared state (Java app servers). Python's GIL is why Python services often scale with *processes* (gunicorn `-w 4`) rather than threads for CPU-bound work.

### Process states (`STAT` column in `ps`, `S` in `top`)
| State | Meaning |
|---|---|
| `R` | Running or runnable (on CPU or waiting in the run queue) |
| `S` | Interruptible sleep (waiting for an event — most idle processes) |
| `D` | Uninterruptible sleep — usually blocked on disk/NFS I/O. Can't be killed, even with `-9` |
| `Z` | Zombie — exited, but the parent hasn't `wait()`ed for it. Fix the parent (or kill it so `init` reaps) |
| `T` | Stopped (Ctrl+Z, `SIGSTOP`) or being traced |

### Process commands
```bash
ps aux                         # all processes, BSD style (USER, %CPU, %MEM, VSZ, RSS, STAT)
ps -ef                         # all processes with PPID (parent) — good for process trees
ps -ef --forest                # tree view;  pstree -p  is the same idea
pgrep -a nginx                 # PIDs + command lines matching "nginx"
pidof nginx                    # PIDs only, exact name
ps -o pid,ppid,stat,etime,cmd -p 1234   # pick columns for one PID

kill -15 1234                  # SIGTERM: ask nicely (default for `kill`), app can clean up
kill -9 1234                   # SIGKILL: forced, no cleanup — last resort
kill -1 1234                   # SIGHUP: many daemons reload config on this (nginx, sshd)
pkill -f 'python3 app1.py'     # kill by full command line
killall nginx                  # kill by name

nice -n 10 ./backup.sh         # start with lower priority
renice +10 -p 1234             # lower priority of a running process
ionice -c3 -p 1234             # idle I/O class — only gets disk when nobody else wants it
```

### Seeing threads
```bash
ps -T -p 1234                  # threads of PID 1234 (SPID column = TID)
ps -eLf | grep java            # all threads system-wide (LWP = TID, NLWP = thread count)
top -H -p 1234                 # live per-thread CPU for one process
ls /proc/1234/task | wc -l     # thread count
grep Threads /proc/1234/status
```
**Java hot-thread trick:** `top -H -p <pid>` → note the busiest TID → `printf '%x\n' <tid>` → find that `nid=0x...` in `jstack <pid>` to see what code the thread is running.

---

## 2. Reading `top`

```
top - 11:30:00 up 5 days,  2 users,  load average: 3.10, 2.45, 1.80
Tasks: 210 total,   2 running, 208 sleeping,   0 stopped,   0 zombie
%Cpu(s): 25.0 us,  5.0 sy,  0.0 ni, 68.0 id,  2.0 wa,  0.0 hi,  0.0 si,  0.0 st
MiB Mem :   8192.0 total,   1200.0 free,   6500.0 used,    492.0 buff/cache
MiB Swap:   2048.0 total,   2048.0 free,      0.0 used.   1400.0 avail Mem

  PID USER   PR  NI    VIRT    RES    SHR S  %CPU  %MEM   TIME+ COMMAND
 1234 root   20   0   6.2g   1.6g   20m S  85.0  20.0  120:03 java
 2345 ubuntu 20   0   900m   410m   12m S  12.0   5.0    3:10 python
```

### Header
| Field | Meaning |
|---|---|
| `load average: 1m, 5m, 15m` | Average number of tasks **running or waiting to run, plus tasks in `D` state** (I/O wait). Compare against core count (`nproc`): load 4 on 4 cores = fully busy; 16 on 4 = queueing |
| `us` | CPU in user space — your application code |
| `sy` | CPU in the kernel — syscalls, networking, context switches |
| `ni` | User CPU for niced (low-priority) processes |
| `id` | Idle |
| `wa` | Idle while waiting for I/O — high = disk/NFS bottleneck, not a CPU problem |
| `hi` / `si` | Hardware / software interrupts (high `si` often = heavy network traffic) |
| `st` | Steal — the hypervisor gave your vCPU to someone else (noisy neighbour, AWS T-instance out of CPU credits) |
| `avail Mem` | What can actually be given to new apps without swapping — **use this, not `free`** |

### Process columns
| Column | Meaning |
|---|---|
| `VIRT` | Total virtual memory mapped (includes reserved-but-unused, shared libs, mmapped files). Usually large and mostly harmless |
| `RES` | Resident memory — physical RAM the process is using right now. **The one to watch for leaks** |
| `SHR` | Part of `RES` that may be shared with other processes (shared libs, shared memory) |
| `%MEM` | `RES` as a % of total physical RAM |
| `%CPU` | CPU since last refresh; can exceed 100% for multi-threaded processes (200% = two full cores) |
| `S` | Process state (see table above) |
| `TIME+` | Total CPU time consumed since start |
| `PR` / `NI` | Kernel priority / nice value (−20 highest priority, 19 lowest) |

### Keys inside `top`
| Key | Action |
|---|---|
| `P` / `M` / `T` | Sort by CPU / memory / CPU time |
| `1` | Show each CPU core separately — spot a single pegged core (single-threaded hot loop) |
| `H` | Toggle thread view |
| `c` | Show full command line |
| `k` | Kill a PID (prompts for signal) |
| `r` | Renice a PID |
| `u` | Filter by user |
| `f` | Choose columns |
| `W` | Save current layout to `~/.toprc` |
| `q` | Quit |

Non-interactive: `top -b -n 1 | head -20` (batch mode, for scripts/tickets), `top -o %MEM`, `top -p 1234,2345`.

### `htop`
Same data, friendlier: per-core bars, scrolling, mouse support, tree view (`F5`), search (`F3`), filter (`F4`), sort (`F6`), kill (`F9`, choose signal), nice (`F7`/`F8`). Shows threads by default in a different colour (`H` hides user threads). Not installed by default on most servers — `top` always is.

### One-shot alternatives (good for scripts)
```bash
ps aux --sort=-%cpu | head -6        # top 5 CPU consumers (+ header)
ps aux --sort=-%mem | head -6        # top 5 memory consumers
ps -eo pid,comm,rss --sort=-rss | head   # by resident memory in KB
free -h                              # memory: read the "available" column
vmstat 1 5                           # r (run queue), b (blocked), si/so (swap), wa, st
mpstat -P ALL 1 3                    # per-core CPU (sysstat)
pidstat -u -r -d 1 5                 # per-process CPU, memory, disk (sysstat)
iostat -xz 1 3                       # per-disk %util and await (sysstat)
```

### `free -h`
```
               total        used        free      shared  buff/cache   available
Mem:            7.7Gi       5.1Gi       400Mi       120Mi       2.2Gi       2.3Gi
Swap:           2.0Gi          0B       2.0Gi
```
Linux uses spare RAM as page cache (`buff/cache`) and gives it back on demand, so **low `free` is normal**. Low **`available`** plus non-zero swap activity (`si`/`so` in `vmstat`) is the real "out of memory" signal. Check `dmesg -T | grep -i oom` for OOM-killer victims. In containers, the cgroup limit matters, not host RAM: `cat /sys/fs/cgroup/memory.max memory.current`.

---

## 3. "The server is slow" — troubleshooting order

```bash
uptime                 # 1. load vs nproc — is the box saturated at all? trending up or down?
dmesg -T | tail -30    # 2. OOM kills, disk errors, hung tasks
top  (then 1, P, M)    # 3. who is using CPU / memory; check us vs sy vs wa vs st
free -h                # 4. available memory, swap in use?
vmstat 1 5             # 5. r > cores = CPU-bound; b > 0 + high wa = I/O-bound; si/so > 0 = swapping
iostat -xz 1 3         # 6. disk %util ~100% and high await = saturated volume (or EBS IOPS cap)
df -h; df -i           # 7. full disk or out of inodes breaks apps in odd ways
journalctl -u <svc> --since "30 min ago"   # 8. app logs — find the cause before restarting
```

How to read the result:
- **High load + high `us`** → app code is CPU-bound. Find the PID/thread (`top -H`), profile (`perf top -p`, `jstack`, `py-spy dump`).
- **High load + low CPU usage** → tasks stuck in `D` state waiting on disk/NFS: `ps -eo state,pid,cmd | grep '^D'`. **High load average does not always mean high CPU.**
- **High `wa`** → disk bottleneck: `iotop -oPa`, `pidstat -d 1`.
- **High `st`** → the problem is the host/instance type, not your app (move off burstable instances, resize).
- **High `sy`** → syscall storm or lots of context switches: `pidstat -w 1`, `strace -c -p <pid>`.
- **RES of one process keeps growing over hours** → likely a memory leak: track with `pidstat -r 1` or `ps -o rss= -p <pid>` in a loop; for the JVM compare heap (`jstat -gc`) vs total RSS.

Fix only after you've captured evidence (top snapshot, thread dump, logs) — a restart destroys it. Deeper walkthrough: [Interview Q&A 28 → Q01](../Interview%20Questions/28-production-scenarios-rapid-round-qna.md).

---

## 4. Virtual Memory, OOM Killer, Disk I/O, Zombies & Orphans

### Virtual memory in one page
- Every process sees its own private **virtual address space**. The kernel maps virtual pages (4 KB) to physical RAM frames through **page tables**, and the CPU's MMU/TLB does the translation.
- Memory is allocated **lazily**. `malloc` reserves address space (VIRT grows), and a physical page is only assigned on first touch (a **minor page fault**). That's why VIRT ≫ RES is normal.
- **Major page fault** = the page has to be read from disk (swap, or a file being mmapped). Lots of these means memory pressure. See them with `ps -o min_flt,maj_flt -p <pid>`, `sar -B`, or `vmstat` `si`/`so`.
- **Page cache**: file data cached in otherwise free RAM (`buff/cache`). It's reclaimable, which is why `available` matters more than `free`.
- **Swap**: anonymous memory pushed to disk under pressure. A little swap use is fine. Continuous `si`/`so` (thrashing) kills latency. `vm.swappiness` (0–200) controls how readily the kernel swaps compared with dropping page cache. Kubernetes nodes historically ran with swap off.
- **Overcommit**: Linux hands out more virtual memory than exists, betting that not all of it gets touched (`vm.overcommit_memory` 0 = heuristic, 1 = always, 2 = strict). If the bet fails, the OOM killer runs.

### The OOM killer
When the kernel can't reclaim enough memory, it kills a process instead of letting the system freeze.
- **Who dies:** the process with the highest `oom_score` (`/proc/<pid>/oom_score`), which is roughly its share of RAM plus swap, adjusted by `oom_score_adj` (−1000 = never kill, +1000 = kill first).
- **Protect critical daemons:** `echo -1000 > /proc/<pid>/oom_score_adj`, or `OOMScoreAdjust=-900` in a systemd unit.
- **Find kills:** `dmesg -T | grep -iE 'killed process|out of memory'` or `journalctl -k | grep -i oom`.
- **Container / cgroup OOM:** in a container, hitting `memory.max` (the K8s `limits.memory`) triggers a cgroup-local OOM even if the host has free RAM. K8s shows `OOMKilled` with exit code **137** (128 + SIGKILL). Kubelet sets `oom_score_adj` by QoS class: Guaranteed −997, BestEffort 1000, Burstable in between, so BestEffort pods die first under node pressure.
- **Fixes:** a real leak needs a code fix. Otherwise raise the limit or right-size it, cap the runtime (`-XX:MaxRAMPercentage`, Node `--max-old-space-size`), and add swap or `earlyoom`/`systemd-oomd` on desktops and small VMs to fail more predictably.

### Debugging disk I/O
```bash
iostat -xz 1            # per device: r/s w/s, rkB/s wkB/s, r_await w_await (ms), aqu-sz, %util
iotop -oPa              # which processes are doing I/O (accumulated)
pidstat -d 1            # per-process kB_rd/s kB_wr/s, iodelay
vmstat 1                # wa% and b (tasks blocked on I/O)
ps -eo state,pid,cmd | awk '$1=="D"'      # tasks stuck in uninterruptible I/O
cat /proc/pressure/io   # PSI: % of time tasks stalled on I/O (some/full)
lsof -p <pid> | grep REG                 # which files a process has open
```
How to read it:
- `await` rising with `aqu-sz` > 1 means requests are queuing, so the device is saturated.
- `%util` near 100% means busy, but on SSD/NVMe/EBS (parallel devices), 100% util doesn't necessarily mean maxed out. Trust **await and IOPS against the provisioned limit** instead.
- On AWS, compare with the EBS volume's **IOPS/throughput limits** (gp3 baseline 3000 IOPS / 125 MB/s), the burst balance on gp2/st1/sc1, and the instance's EBS bandwidth cap (CloudWatch `VolumeQueueLength`, `VolumeReadOps`, `EBSIOBalance%`).
- Common culprits: verbose logging and `fsync`-heavy writes, DB full-table scans or missing indexes, swap thrashing (it looks like disk I/O), backup or log-compression cron jobs, noisy neighbours on a shared volume.
- Fixes: `ionice -c3` for batch jobs, move logs or temp files to another volume, add DB indexes or memory for cache, raise gp3 IOPS, use instance-store NVMe for scratch data.

### Zombie vs orphan processes
| | Zombie (`Z`, `<defunct>`) | Orphan |
|---|---|---|
| What | The child has **exited**, but the parent hasn't called `wait()` to collect its exit status | The **parent exited** while the child is still running |
| Uses resources? | No CPU or memory. Only a process-table entry (PID) | Yes, it's a normal running process |
| What happens | Stays until the parent reaps it, or the parent dies | Re-parented to PID 1 (`init`/`systemd`) or the nearest *subreaper*, which reaps it when it exits |
| Problem when | Thousands pile up and exhaust PIDs (`pid_max`, K8s `podPidsLimit`) | Usually not a problem. Daemons deliberately double-fork to become orphans |
| Fix | Fix or restart the **parent** (`kill -9` on a zombie does nothing, it's already dead). Find it with `ps -o ppid= -p <zombie-pid>` | Nothing, unless it's a runaway you need to kill |

```bash
ps -eo pid,ppid,stat,cmd | awk '$3 ~ /Z/'     # list zombies and their parent PIDs
```
**Containers:** if your app runs as PID 1 and spawns children (shell scripts, Chrome, etc.), nothing reaps orphaned grandchildren, so zombies pile up. PID 1 also ignores SIGTERM unless it installs a handler. Fix: `docker run --init`, `tini`/`dumb-init` as the entrypoint, or `shareProcessNamespace` in K8s.

---

## 5. Rapid-fire interview answers

| Question | Answer |
|---|---|
| Process vs thread? | Own address space vs shares the process's memory; thread crash can kill the process |
| How to find high CPU? | `top` (`P`), `htop`, `ps aux --sort=-%cpu \| head`, then `top -H -p <pid>` for the thread |
| How to check RAM? | `free -h` → **available** column; `vmstat` for swapping |
| What is load average? | Avg runnable + uninterruptible (`D`) tasks over 1/5/15 min; compare to `nproc` |
| VIRT vs RES? | Mapped virtual memory vs physical RAM actually in use |
| `us` vs `sy` vs `wa` vs `st`? | App code / kernel / waiting on I/O / stolen by hypervisor |
| `kill -15` vs `kill -9`? | Graceful (catchable, cleanup) vs forced (uncatchable, no cleanup) |
| Can't kill a process with `-9`? | It's in `D` state (blocked in kernel I/O) or a zombie (already dead — kill/fix its parent) |
| Zombie process? | Exited child not reaped by its parent; shows `Z`/`<defunct>` |
| `df -h` vs `df -i`? | Block (byte) capacity vs inode (file count) capacity |
| `df` vs `du`? | Filesystem-level usage vs walking files/dirs |
| Disk full but `du` is small? | Deleted file still open → `lsof +L1`; or space hidden under a mount point |
