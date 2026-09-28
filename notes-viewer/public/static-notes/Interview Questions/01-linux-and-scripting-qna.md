# Linux & Shell Scripting — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub in this repo. Covers Linux fundamentals, the filesystem, processes, permissions, systemd, networking basics, and Bash scripting — the toolkit every DevOps/SRE role is built on. Questions are grouped **Junior → Mid → Senior**; each answer is written to be interview-ready, not just a definition.

**How to use this file:** skim the Junior section even if you're experienced (interviewers often start there to calibrate), then focus on the tier matching your target role. Senior questions favor "how would you debug/design this" over "define X".

---

## Table of Contents
- [Junior Level (0–2 yrs)](#junior-level-02-yrs)
- [Mid Level (2–5 yrs)](#mid-level-25-yrs)
- [Senior Level (5+ yrs)](#senior-level-5-yrs)

---

## Junior Level (0–2 yrs)

### 1. What is Linux, and why is it so widely used in DevOps/cloud environments?
Linux is an open-source, Unix-like operating system kernel, typically packaged with GNU tools into distributions (Ubuntu, RHEL/CentOS/Rocky, Debian, Amazon Linux, Alpine). It dominates servers and cloud/DevOps tooling because it's free, stable, highly configurable, scriptable end-to-end (everything is a file, everything can be automated via shell), has a massive package ecosystem, and is the base image for the vast majority of containers and cloud VM images.

### 2. Explain the Linux filesystem hierarchy (FHS) — what lives in `/etc`, `/var`, `/usr`, `/opt`, `/bin`, `/tmp`?
- `/etc` — system-wide configuration files (non-binary).
- `/var` — variable data: logs (`/var/log`), spool files, caches, that grow/change at runtime.
- `/usr` — user-space programs and libraries (`/usr/bin`, `/usr/lib`, `/usr/share`) — the bulk of installed software.
- `/opt` — optional/third-party software packages, often self-contained.
- `/bin`, `/sbin` — essential user and system binaries needed even in single-user/recovery mode (on modern distros these are usually symlinked into `/usr/bin`, `/usr/sbin`).
- `/tmp` — world-writable temporary storage, often cleared on reboot or via `tmpwatch`/`systemd-tmpfiles`.
- Also worth knowing: `/home` (user data), `/root` (root's home), `/proc` and `/sys` (virtual filesystems exposing kernel/process state), `/dev` (device files).

### 3. What's the difference between a hard link and a symbolic (soft) link?
A **hard link** is another directory entry pointing to the *same inode* — same data, same permissions, indistinguishable from the "original"; deleting one name leaves the data intact as long as the link count > 0. Hard links can't cross filesystems and can't point to directories. A **symlink** is a separate file that stores a *path* to another file; it can cross filesystems and point to directories, but breaks ("dangling link") if the target is removed or moved. Create with `ln target linkname` (hard) or `ln -s target linkname` (soft).

### 4. What do Linux file permissions `rwx` mean, and how does `chmod 755` translate?
`r` (read), `w` (write), `x` (execute), applied to three classes: owner, group, others. Each class's three bits map to an octal digit: r=4, w=2, x=1. `755` = owner `rwx` (7), group `r-x` (5), others `r-x` (5) — typical for an executable script others can run but not modify. `644` is the common default for a non-executable file (owner read/write, others read-only).

### 5. What's the difference between `chmod`, `chown`, and `chgrp`?
`chmod` changes permission bits (rwx) on a file/directory. `chown` changes the owning user (and optionally group, via `chown user:group file`). `chgrp` changes only the owning group. All three commonly take `-R` for recursive application to a directory tree.

### 6. How do you find a file by name, and how do you find files modified in the last 24 hours?
`find /path -name "*.log"` for a name pattern (`-iname` for case-insensitive). For recently modified files: `find /path -mtime -1` (modified within the last 1 day) or `find /path -mmin -60` (last 60 minutes). Combine with `-type f` to restrict to regular files.

### 7. What's the difference between `grep`, `egrep`, and `grep -E`?
`grep` uses basic regular expressions (BRE) by default, where `+`, `?`, `|`, `()` need escaping (`\+`). `egrep` (and the equivalent `grep -E`) uses extended regular expressions (ERE), where those metacharacters work unescaped. `grep -P` (GNU grep) enables Perl-compatible regex for even more power (lookahead/lookbehind).

### 8. How do you view, follow, and search log files from the command line?
`cat file.log` for the whole file, `less file.log` to page through it (searchable with `/pattern`), `tail -n 100 file.log` for the last 100 lines, and `tail -f file.log` (or `tail -F` to survive log rotation) to follow it live. To search while following: `tail -f file.log | grep --line-buffered ERROR`.

### 9. What is a process, and what's the difference between a process and a thread?
A process is an independently executing program instance with its own memory address space, file descriptors, and at least one thread of execution. A thread is a unit of execution *within* a process that shares that process's memory and resources with other threads in the same process, making threads lighter-weight to create/switch but requiring care around shared-state concurrency.

### 10. How do you list running processes, and what do the columns in `ps aux` mean?
`ps aux` lists all processes for all users in BSD-style format: `USER`, `PID`, `%CPU`, `%MEM`, `VSZ`/`RSS` (virtual/resident memory), `TTY`, `STAT` (process state, e.g. `S` sleeping, `R` running, `Z` zombie, `D` uninterruptible sleep), `START`, `TIME`, `COMMAND`. `top` or `htop` give a live, sortable, auto-refreshing view of the same information.

### 11. What's the difference between killing a process with `SIGTERM` vs `SIGKILL`?
`kill -15 <pid>` (SIGTERM, the default) asks the process to terminate gracefully — it can catch the signal, flush buffers, close connections, and exit cleanly. `kill -9 <pid>` (SIGKILL) cannot be caught, blocked, or ignored — the kernel terminates the process immediately, which risks corrupted state (unflushed writes, orphaned locks/child processes). Always try SIGTERM first; reach for SIGKILL only when a process is hung and unresponsive.

### 12. What is a zombie process, and how do you clean it up?
A zombie (`Z` state) is a process that has finished executing but still has an entry in the process table because its parent hasn't yet called `wait()` to read its exit status. Zombies consume a PID slot but no real resources, so a few are harmless; a large accumulation usually means a buggy parent process. You can't `kill` a zombie directly (it's already dead) — you either fix/restart the parent, or if the parent has itself died, `init`/`systemd` (PID 1) reaps it automatically.

### 13. What does `nohup` do, and how is it different from running a job with `&`?
`&` backgrounds a job in the current shell, but the process still receives `SIGHUP` and dies if the terminal/shell session closes. `nohup command &` additionally makes the process ignore `SIGHUP`, so it survives logout — output is redirected to `nohup.out` by default unless you redirect it yourself. In practice, `systemd` services, `screen`/`tmux`, or `disown` are more robust alternatives for long-running work.

### 14. What is a shebang (`#!/bin/bash`) and why does it matter?
The shebang is the first line of a script telling the kernel which interpreter to execute the rest of the file with. Without it (or when run via `sh script.sh` instead of `./script.sh`), the script may be interpreted by the wrong shell, silently breaking bash-specific syntax like arrays or `[[ ]]`. `#!/usr/bin/env bash` is often preferred over `#!/bin/bash` for portability across systems where bash isn't at a fixed path.

### 15. What's the difference between `>`, `>>`, and `2>&1` in shell redirection?
`>` redirects stdout to a file, truncating it. `>>` appends stdout instead of truncating. `2>&1` redirects file descriptor 2 (stderr) to wherever file descriptor 1 (stdout) currently points — order matters: `cmd > file.log 2>&1` sends both stdout and stderr to `file.log`, while `cmd 2>&1 > file.log` would not (because at the time `2>&1` runs, stdout is still the terminal).

### 16. What is a pipe (`|`) and how is it different from redirection?
A pipe connects the stdout of one command directly to the stdin of the next, letting you chain tools (`ps aux | grep nginx | awk '{print $2}'`) without intermediate files. Redirection (`>`, `<`) connects a command's stdin/stdout to a *file*, not to another process.

### 17. How do environment variables work, and what's the difference between `export FOO=bar` and just `FOO=bar`?
`FOO=bar` sets a shell variable visible only in the current shell. `export FOO=bar` marks it as an environment variable, which is inherited by child processes spawned from that shell. Common ones: `PATH` (executable search path), `HOME`, `USER`, `SHELL`. `env` or `printenv` lists exported variables; `set` lists all shell variables including non-exported ones.

### 18. What does `PATH` do, and what happens if a command "isn't found"?
`PATH` is a colon-separated list of directories the shell searches, in order, when you type a bare command name. "Command not found" means the binary either isn't installed, isn't executable, or isn't in any directory listed in `PATH` — you can run it directly with a full/relative path (`./script.sh`, `/usr/local/bin/tool`) to bypass `PATH` entirely.

### 19. What's the difference between a Linux distribution's package managers — `apt`, `yum`/`dnf`, `apk`?
`apt`/`apt-get` (Debian/Ubuntu) and `yum`/`dnf` (RHEL/CentOS/Fedora, `dnf` being the modern successor to `yum`) manage `.deb`/`.rpm` packages with dependency resolution against remote repositories. `apk` is Alpine Linux's lightweight package manager, popular in minimal container base images. Interviewers care that you know the *concept* transfers even if the exact commands differ (`apt install`, `dnf install`, `apk add`).

### 20. How do you check disk usage and free space in Linux?
`df -h` shows filesystem-level free/used space per mount point (human-readable). `du -sh /path/*` shows how much space a directory's contents use, which is useful for hunting down what's filling a disk. A classic gotcha: `df` can show a filesystem as full while `du` on visible files doesn't add up — usually caused by a deleted-but-still-open file held by a running process (check `lsof | grep deleted`).

### 21. What is `/proc`, and what's an example of something useful you can learn from it?
`/proc` is a virtual (in-memory) filesystem exposing kernel and process information as "files" — nothing is actually stored on disk. `/proc/cpuinfo` and `/proc/meminfo` show hardware/memory info, `/proc/<pid>/status` and `/proc/<pid>/fd` show a specific process's state and open file descriptors, and `/proc/loadavg` shows system load — all readable with plain `cat`.

### 22. What is a Bash variable, and how do you use command substitution?
A variable is assigned with `NAME=value` (no spaces around `=`) and referenced with `$NAME` or `${NAME}`. Command substitution captures a command's output into a variable or string: `NOW=$(date +%F)` (preferred modern syntax) or the older backtick form `` NOW=`date +%F` ``.

### 23. What's the difference between single quotes, double quotes, and no quotes in Bash?
Single quotes (`'...'`) preserve everything literally — no variable expansion, no command substitution. Double quotes (`"..."`) allow variable (`$VAR`) and command (`$(cmd)`) expansion but suppress word-splitting/globbing on the result. No quotes lets the shell word-split on whitespace and expand globs (`*`), which is a common source of bugs with filenames containing spaces — as a rule, always quote variable expansions (`"$VAR"`) unless you specifically want word-splitting.

### 24. How do you write an `if` statement and a `for` loop in Bash?
```bash
if [ "$STATUS" = "ok" ]; then
  echo "healthy"
elif [ "$STATUS" = "degraded" ]; then
  echo "warning"
else
  echo "unhealthy"
fi

for f in /var/log/*.log; do
  echo "Processing $f"
done
```
`[[ ... ]]` (Bash-specific) is generally preferred over `[ ... ]` (POSIX `test`) for conditionals — it supports `&&`/`||`/pattern matching directly and avoids word-splitting/glob pitfalls with unquoted variables.

### 25. What's the difference between `$*`, `$@`, `$#`, and `$0` in a shell script?
`$0` is the script's own name/path. `$#` is the number of positional arguments passed in. `$@` and `$*` both expand to "all arguments", but `"$@"` expands each argument as a separate quoted word (preserving spaces inside individual args) while `"$*"` expands to a single string joined by the first character of `IFS` — `"$@"` is almost always what you want when forwarding arguments to another command.

### 26. How do you compare strings and numbers in a Bash `if` condition?
Strings: `[ "$a" = "$b" ]` (equal), `[ "$a" != "$b" ]`. Numbers: `[ "$a" -eq "$b" ]`, `-ne`, `-lt`, `-le`, `-gt`, `-ge` — using `=`/`<`/`>` on `[ ]` compares strings lexically, a classic bug when comparing numbers like `"10" < "9"`. Inside `(( ))` you can use normal math operators: `if (( a > b )); then`.

### 27. What is `cron`, and how do you read a crontab line like `0 2 * * 1 /opt/backup.sh`?
`cron` is the Linux daemon that runs scheduled jobs defined in crontabs (`crontab -e` per-user, or `/etc/cron.d/`, `/etc/crontab` system-wide). The five fields are minute, hour, day-of-month, month, day-of-week. `0 2 * * 1` means "at 02:00, every day-of-month, every month, on Monday" — i.e., every Monday at 2 AM. `*/15 * * * *` means "every 15 minutes".

### 28. What's the difference between `systemctl start`, `enable`, and `status`?
`systemctl start <service>` starts it now, for this boot only. `systemctl enable <service>` creates the symlinks so it starts automatically on future boots, without starting it immediately (use `enable --now` to do both). `systemctl status <service>` shows whether it's active, its recent log lines, and its PID — usually the first command to run when something isn't working.

### 29. How do you check what port a process is listening on?
`ss -tulpn` (modern, replaces the deprecated `netstat`) lists TCP/UDP listening sockets with the owning process/PID. `sudo lsof -i :8080` shows what's bound to a specific port. `netstat -tulpn` still works on many systems but is considered legacy.

### 30. What's the difference between `su` and `sudo`?
`su` (substitute user) switches to another user's full shell session, typically requiring *that user's* password (`su -` for a full login shell with their environment). `sudo` runs a single command as another user (root by default) using *your own* password, governed by rules in `/etc/sudoers`, and logs who ran what — generally preferred for auditability and for not sharing the root password.

### 31. How do you copy files/directories to a remote server securely?
`scp -r /local/dir user@host:/remote/path` for a straightforward recursive copy over SSH. `rsync -avz /local/dir/ user@host:/remote/path/` is generally preferred for anything repeated or large, since it only transfers changed data, can resume, and preserves permissions/timestamps (`-a`), compresses in transit (`-z`), and shows progress (`-v`, or `--progress`).

### 32. What is SSH, and what's the difference between password auth and key-based auth?
SSH (Secure Shell) is an encrypted protocol for remote login and command execution. Password auth sends a password (over an encrypted channel, but still guessable/brute-forceable and phishable). Key-based auth uses an asymmetric key pair: your private key stays on your machine, your public key is placed in the server's `~/.ssh/authorized_keys`; the server challenges your client to prove possession of the private key without it ever being transmitted — stronger, and scriptable/automatable (which is why virtually all DevOps tooling uses SSH keys, not passwords).

### 33. What does `ssh-keygen` do, and where are the resulting keys typically stored?
`ssh-keygen -t ed25519` (or `-t rsa -b 4096`) generates a new key pair, by default at `~/.ssh/id_ed25519` (private, keep secret, `chmod 600`) and `~/.ssh/id_ed25519.pub` (public, safe to share/distribute). `ed25519` is the modern recommended default over RSA for new keys — smaller, faster, and equally or more secure.

### 34. What's the difference between `tar`, `gzip`, and `tar.gz`?
`tar` (tape archive) bundles multiple files/directories into a single archive file *without compression*. `gzip` compresses a single file. `tar.gz`/`.tgz` combines both: `tar` bundles, then `gzip` compresses the bundle — created with `tar -czvf archive.tar.gz dir/` and extracted with `tar -xzvf archive.tar.gz`. `-c` create, `-x` extract, `-z` gzip, `-v` verbose, `-f` specify filename.

### 35. What's the difference between `wget` and `curl`?
Both fetch content over HTTP(S)/FTP. `wget` is optimized for simply downloading files (recursion, resuming interrupted downloads by default with `-c`). `curl` is more of a general-purpose HTTP client — better for scripting API calls, inspecting headers (`-I`), setting custom methods/headers/bodies (`-X POST -H ... -d ...`), and is the default choice for testing REST endpoints or webhooks.

### 36. What is `awk` typically used for, and what does `awk '{print $1}'` do?
`awk` is a pattern-scanning/text-processing language built around records (default: lines) and fields (default: whitespace-separated). `awk '{print $1}'` prints the first whitespace-separated field of every line — e.g., `ps aux | awk '{print $2}'` extracts just the PID column. `awk -F: '{print $1}' /etc/passwd` changes the field separator to `:` to extract usernames.

### 37. What is `sed` typically used for, and what does `sed 's/foo/bar/g'` do?
`sed` (stream editor) applies text transformations line by line. `sed 's/foo/bar/g'` substitutes every occurrence (`g` = global, otherwise only the first per line) of `foo` with `bar`. `sed -i` edits a file in place (`-i.bak` keeps a backup). It's also used for deleting lines (`sed '/pattern/d'`) and printing ranges (`sed -n '10,20p'`).

### 38. How do you check system uptime, load average, and what does "load average" actually mean?
`uptime` shows how long the system has been running plus the 1/5/15-minute load averages. Load average roughly represents the average number of processes wanting CPU time (running or waiting on uninterruptible I/O) over that window. A load average of 4.0 on a 4-core machine means it's fully utilized on average; on a 2-core machine, it means processes are queuing. Compare load average against `nproc` (core count), not against an absolute number.

### 39. What's the difference between RAM usage shown by `free -h` — used, free, buff/cache, available?
`used` is memory actively allocated to processes. `free` is truly untouched memory. `buff/cache` is memory the kernel is using for disk buffers/page cache — this is *reclaimable* and not a sign of a problem; Linux deliberately uses "spare" RAM to cache disk data for speed. `available` is the more meaningful number for "how much can a new process actually get" — it accounts for reclaimable cache.

### 40. How would you troubleshoot "no space left on device" when `df -h` shows free space?
This classic mismatch is almost always **inode exhaustion**, not byte exhaustion — check with `df -i`. If inodes are at 100% (common with millions of tiny files, e.g. session files or mail queues), you need to delete files, not free up bytes. The other classic cause is a large file that's been deleted but is still open by a running process (`lsof +L1` or `lsof | grep deleted`) — restarting/reloading that process releases the space.

---

## Mid Level (2–5 yrs)

### 41. Walk through what happens, step by step, when you run a command like `ls -la` in Bash.
The shell parses the command line (tokenizing, expanding variables/globs/aliases), checks if `ls` is a builtin or function (it isn't) then searches `PATH` for an executable named `ls`. It `fork()`s a child process, and in the child calls `exec()` to replace that child's memory image with the `ls` binary, passing `-la` as `argv`. The parent shell `wait()`s for the child to exit and captures its exit status into `$?`, then prints the next prompt.

### 42. Explain Linux file descriptors and what `0`, `1`, `2` represent.
A file descriptor is a small integer handle a process uses to reference an open file, socket, or pipe. By convention every process starts with fd `0` = stdin, `1` = stdout, `2` = stderr, all typically connected to the controlling terminal unless redirected. `ls -la /proc/<pid>/fd` shows every fd a running process currently holds open, which is invaluable for debugging "too many open files" errors.

### 43. What is an inode, and what information does it (and does it not) store?
An inode is a data structure storing all metadata about a file — permissions, owner/group, size, timestamps, and pointers to the data blocks on disk — *except* the filename, which lives only in the directory entry that points to the inode. This is exactly why hard links work (multiple names, one inode) and why renaming a file is instant regardless of size (only the directory entry changes, not the data).

### 44. What's the difference between a bind mount and a regular mount, and where would you use one?
A regular mount attaches a filesystem (a disk partition, an ISO, a tmpfs) to a directory. A bind mount (`mount --bind /source/dir /target/dir`) instead makes an *existing directory* accessible at a second path on the *same* filesystem — no new filesystem involved, just another entry point to the same data. Docker volumes ("bind mounts") use exactly this mechanism to expose host paths inside a container's mount namespace.

### 45. Explain Linux process states in more depth (`R`, `S`, `D`, `T`, `Z`) — why is `D` state dangerous?
`R` running/runnable, `S` interruptible sleep (waiting for an event, can be woken by a signal), `D` uninterruptible sleep (usually waiting on I/O — disk, NFS), `T` stopped (e.g. by `Ctrl+Z` or `SIGSTOP`), `Z` zombie. `D` state is dangerous because it *cannot* be interrupted by a signal, not even `SIGKILL` — a process stuck in `D` (e.g. an NFS mount that's hung, or a failing disk) can't be killed until the underlying I/O completes or times out, and a pile-up of `D`-state processes is a strong signal of a storage subsystem problem.

### 46. What is the OOM killer, and how does it decide which process to kill?
When the kernel can't satisfy a memory allocation and has no more reclaimable memory (and swap is exhausted or disabled), the Out-Of-Memory killer selects a process to kill to free memory rather than let the whole system deadlock. It scores processes via a heuristic (`oom_score`, influenced by memory usage and an adjustable `oom_score_adj`) and kills the highest-scoring one — in containers/Kubernetes this shows up as `OOMKilled`/exit code 137, and you can bias which processes are protected via `oom_score_adj` or cgroup memory limits.

### 47. What are Linux capabilities, and why are they preferable to running as root?
Capabilities split the traditionally all-or-nothing power of `root` into discrete units (e.g. `CAP_NET_BIND_SERVICE` to bind ports below 1024, `CAP_SYS_TIME` to change the clock, `CAP_NET_ADMIN` for network config). A process/binary can be granted just the capabilities it needs (`setcap`) without running as full root, dramatically shrinking the blast radius if it's compromised — this is exactly the principle Docker/Kubernetes `securityContext.capabilities` build on.

### 48. What is a Linux namespace, and how many kinds are there? Why do they matter for containers?
Namespaces isolate a specific type of system resource so a process only sees its own view of it. Kernel namespace types include: PID (own process tree), Network (own interfaces/routes/ports), Mount (own filesystem view), UTS (own hostname), IPC (own inter-process communication objects), User (own UID/GID mapping), and Cgroup. Containers are, at their core, just regular Linux processes launched into a fresh set of namespaces (isolation) combined with cgroups (resource limits) — there's no special "container" kernel feature.

### 49. What is a cgroup, and how is it different from a namespace?
Where namespaces control *what a process can see*, control groups (cgroups) control *how much of a resource a process can use* — CPU shares/quota, memory limits, block I/O bandwidth, PIDs count. Docker/Kubernetes resource `requests`/`limits` are implemented as cgroup settings (cgroup v2 is standard on modern kernels/distros).

### 50. Explain the Bash script execution flow with `set -euo pipefail` — what does each flag do, and why use it?
`set -e` exits the script immediately if any command returns non-zero (unless it's part of a condition, `||`, or `&&`). `set -u` treats referencing an unset variable as an error instead of silently expanding to empty string. `set -o pipefail` makes a pipeline's exit status the *last non-zero* exit status in it, instead of only the exit status of the final command (without it, `false | true` "succeeds"). Together, this is close to a defensive default for production automation scripts, catching whole classes of silent failures — though `set -e` has well-known edge cases (it doesn't fire inside functions called in a condition, or for commands in `&&`/`||` chains) that experienced scripters know to work around.

### 51. How do you write a Bash function, and how do you return a value from it?
```bash
get_disk_usage() {
  local path="$1"
  df -h "$path" | awk 'NR==2 {print $5}'
}
usage=$(get_disk_usage /var)
```
Bash functions don't have a real "return value" mechanism for data — `return` only sets an integer exit status (0–255). To get data out, you either `echo`/`printf` it and capture with command substitution (as above), or write to a variable (best done via `local -n` nameref in Bash 4.3+, or a global variable) if you specifically need to avoid a subshell.

### 52. How do arrays work in Bash, and what's the difference between an indexed array and an associative array?
Indexed arrays: `arr=(a b c)`, accessed via `${arr[0]}`, all elements via `${arr[@]}`, length via `${#arr[@]}`. Associative arrays (Bash 4+) use string keys: `declare -A map; map[env]="prod"; echo "${map[env]}"`. Always quote `"${arr[@]}"` when iterating to preserve elements containing spaces, same rationale as `"$@"`.

### 53. What's the difference between `.bashrc`, `.bash_profile`, `.profile`, and `/etc/profile`?
`/etc/profile` and `/etc/profile.d/*` apply system-wide, sourced for login shells. `~/.bash_profile` (or `~/.profile` as a fallback) is sourced once for a user's *login* shell (e.g. SSH-ing in) and typically sets environment variables, then often sources `~/.bashrc`. `~/.bashrc` is sourced for every *interactive non-login* shell (e.g. opening a new terminal tab) and typically sets aliases, functions, and shell options (prompt, history). Getting `PATH` changes to "not show up" in scripts is a classic symptom of setting them in the wrong file (or a non-interactive script not sourcing any of them at all).

### 54. How would you debug a Bash script that isn't behaving as expected?
`bash -x script.sh` (or `set -x` inside it) prints each command with its expanded arguments before executing it, which is the single most useful debugging tool for shell scripts. `bash -n script.sh` does a syntax-only check without executing anything. `shellcheck script.sh` is a static analyzer that catches quoting bugs, unset-variable use, and dozens of other common Bash mistakes before you even run it — strongly recommended in CI for any repo with non-trivial shell scripts.

### 55. What's the difference between `$(command)` and `` `command` ``, and why is `$()` preferred?
Both perform command substitution, but `$()` nests cleanly (`$(echo $(date))`) while backticks require escaping nested backticks (`` `echo \`date\`` ``), are visually ambiguous with single quotes in some fonts, and are considered legacy/deprecated style by most style guides and linters (including ShellCheck).

### 56. How do you safely handle a script argument that might be missing, and provide a default value?
`ENV="${1:-staging}"` uses the first positional argument if set and non-empty, otherwise defaults to `staging`. `${VAR:?error message}` instead aborts with an error if the variable is unset/empty — useful for required arguments in scripts run with `set -u`.

### 57. What is `xargs`, and why would you use it instead of piping directly into a command?
Many commands (`rm`, `chmod`) don't read filenames from stdin — they expect them as arguments. `xargs` bridges this: `find . -name "*.tmp" | xargs rm` converts each line of stdin into arguments for the given command, batching multiple items per invocation for efficiency. `xargs -I{} cmd {}` runs the command once per input line, substituting `{}`; `-P4` parallelizes across 4 processes; `-print0`/`xargs -0` (paired with `find -print0`) safely handles filenames containing spaces or newlines.

### 58. How do you monitor real-time network connections and bandwidth usage on a Linux host?
`ss -s` for a socket summary, `ss -tunap` for detailed active connections with process info. `iftop` or `nload` show live per-connection/per-interface bandwidth. `iotop` (analogous, for disk I/O) shows which processes are generating disk I/O in real time — all essential when a host is "slow" and you need to know if it's network, disk, or CPU bound.

### 59. What is `strace`, and give an example of when you'd reach for it.
`strace` traces the system calls a process makes to the kernel (file opens, reads/writes, network calls, signals) in real time — `strace -f -e trace=open,read command` or `strace -p <pid>` to attach to a running process. Classic use case: a service fails to start with a vague error; `strace` reveals it's trying (and failing with `ENOENT`/`EACCES`) to open a config file at an unexpected path or without the right permissions — something application logs never mentioned.

### 60. What's the difference between `strace` and `ltrace`, and between both of those and `perf`?
`strace` traces *system calls* (kernel boundary). `ltrace` traces *library calls* (e.g. calls into `libc`, `malloc`, `strcpy`) — useful for userspace logic bugs rather than kernel interaction, though less commonly available/maintained today. `perf` is a full profiling toolkit that can sample CPU usage, cache misses, and more at low overhead — the right tool when you need to know *where* CPU time is going inside a hot process rather than what syscalls it's making.

### 61. How do you set resource limits (max open files, max processes) for a user or process?
`ulimit -n` shows/sets the max open file descriptors for the current shell session; `ulimit -a` lists all limits. Persistent, per-user limits are set in `/etc/security/limits.conf` (soft/hard limits per user or group, e.g. `nginx soft nofile 65536`), which requires the `pam_limits` module to be active in the login flow. For `systemd`-managed services, use `LimitNOFILE=` etc. directly in the unit file instead — it takes precedence and is the modern recommended approach.

### 62. What's the difference between a soft limit and a hard limit (`ulimit`)?
The soft limit is the currently enforced ceiling and can be raised by the (unprivileged) user up to the hard limit. The hard limit is the absolute ceiling only root can raise. This two-tier design lets administrators set a sane hard ceiling while letting applications/users adjust their own soft limit within it as needed (e.g. a database process raising its own `nofile` soft limit at startup).

### 63. How would you find which process is consuming the most CPU or memory right now?
`top` or `htop`, sorted by `%CPU` (default) or `%MEM` (press `M` in top/htop). Non-interactively: `ps aux --sort=-%mem | head` or `ps aux --sort=-%cpu | head`. For a longer-running investigation, `pidstat` (from `sysstat`) gives per-process time-series data you can log and review after the fact.

### 64. What is `systemd`, and what problem did it solve compared to SysV init?
`systemd` is the modern init system (PID 1) and service manager on most major distributions, replacing sequential SysV init scripts. It offers parallelized service startup (faster boot), declarative unit files instead of imperative shell scripts, built-in dependency management (`Requires=`, `After=`), socket/timer/path-based activation, automatic restart policies, resource control via cgroups, and centralized logging via `journald` — trading some simplicity for much richer service lifecycle management.

### 65. How do you write a basic systemd unit file for a custom application?
```ini
[Unit]
Description=My App
After=network.target

[Service]
ExecStart=/usr/local/bin/myapp --config /etc/myapp/config.yaml
Restart=on-failure
RestartSec=5
User=myapp
WorkingDirectory=/opt/myapp

[Install]
WantedBy=multi-user.target
```
Place it at `/etc/systemd/system/myapp.service`, run `systemctl daemon-reload`, then `systemctl enable --now myapp`.

### 66. How do you view and filter logs with `journalctl`?
`journalctl -u myapp.service` shows logs for a specific unit. `journalctl -f` follows in real time (like `tail -f`). `journalctl --since "1 hour ago"` or `--since "2026-01-01" --until "2026-01-02"` filters by time. `journalctl -p err` filters by priority (err and above). `journalctl -b` shows logs since the last boot; `journalctl -b -1` shows the previous boot — invaluable when debugging a crash/reboot.

### 67. What's the difference between log rotation tools like `logrotate` and just letting logs grow?
Unbounded logs eventually fill the disk (which can crash unrelated services) and become unwieldy to search. `logrotate` (config in `/etc/logrotate.d/`) periodically rotates, compresses, and prunes log files based on size/age/count rules, often triggering an app-specific `postrotate` hook (e.g. sending `SIGHUP` to a daemon so it reopens its log file handle) — critical to configure for anything writing directly to files instead of stdout/a log shipper.

### 68. What is DNS resolution order on a Linux host, and how do you inspect/change it?
`/etc/nsswitch.conf`'s `hosts:` line defines lookup order (commonly `files dns`, meaning `/etc/hosts` is checked before actual DNS queries). `/etc/resolv.conf` lists the DNS resolvers to query (often managed dynamically by `systemd-resolved` or `NetworkManager` rather than edited directly on modern distros). `getent hosts example.com` shows what the *whole* resolution chain returns (including `/etc/hosts` overrides), which is more accurate for debugging than `dig`/`nslookup` alone, since those bypass NSS and query DNS directly.

### 69. How would you debug "connection refused" vs "connection timed out" when calling a remote service?
"Connection refused" means a TCP packet reached the target host and something actively rejected it — usually nothing is listening on that port (check with `ss -tlnp` on the target), or a firewall sent back a `RST`. "Connection timed out" means packets are going nowhere and getting no response at all — a firewall silently dropping the packet, a routing problem, or a security group/NACL blocking the path (common in cloud environments) — `traceroute`/`mtr` and `tcpdump` on both ends help localize where in the path the traffic disappears.

### 70. What's the difference between `TCP` states `TIME_WAIT`, `CLOSE_WAIT`, and `ESTABLISHED`, and why might a server accumulate thousands of `CLOSE_WAIT` sockets?
`ESTABLISHED` is an active, open connection. `TIME_WAIT` is a normal, brief post-close state on the side that initiated the close, ensuring stray packets are drained (a large but *stable* number is usually fine and tunable via `net.ipv4.tcp_tw_reuse`). A large and *growing* number of `CLOSE_WAIT` sockets, however, indicates the remote peer closed the connection but the local application never called `close()` on its end — a classic file-descriptor/connection leak in application code, eventually leading to "too many open files".

---

## Senior Level (5+ yrs)

### 71. A production host's load average is high but CPU utilization (`%us` + `%sy` in `top`) looks low. How do you investigate?
High load with low CPU usually points to processes stuck in uninterruptible sleep (`D` state) waiting on I/O, since load average counts both runnable *and* uninterruptible-sleep processes. Check `ps aux | awk '$8=="D"'` or `vmstat 1` (watch the `b` column, blocked processes). From there, `iostat -x 1` shows per-disk `%util` and `await` to confirm disk saturation, and `iotop` identifies the offending process. Root causes in the wild: a failing/degrading disk, an overwhelmed NFS/EBS/network-attached volume, or swap thrashing on `D`-state page-ins.

### 72. Explain, at a systems level, how a container achieves isolation without a hypervisor — and what that implies for the "blast radius" of a kernel-level vulnerability.
A container is a normal Linux process, isolated via namespaces (PID/net/mount/UTS/IPC/user) and resource-bounded via cgroups, running against the *same host kernel* as every other container and the host itself. Unlike a VM, there's no hardware-level (hypervisor-enforced) isolation boundary — a kernel vulnerability, a misconfigured/missing user-namespace remap, or an unnecessary capability grant can potentially let a compromised container process escape to the host or affect co-located containers. This is exactly why gVisor/Kata Containers (adding a sandboxing/lightweight-VM layer), seccomp profiles, dropping unneeded capabilities, and running as non-root all matter operationally, and why "container isolation" and "VM isolation" are not equivalent security boundaries.

### 73. Walk through diagnosing a memory leak in a long-running Linux service in production, without restarting it (since a restart would hide the evidence).
Confirm growth is real (not just page-cache noise) via `RSS`/`VSZ` trend in `ps`/`smem` over time, cross-checked against `/proc/<pid>/status` (`VmRSS`, `VmSwap`). For a compiled/native process, attach `pmap -x <pid>` to inspect the memory map for a specific growing segment (heap vs a specific mapped library/mmap region), or use `valgrind --leak-check` / language-specific profilers (`pprof` for Go, heap dumps for JVM, `tracemalloc` for Python) in a staging replica under similar load rather than production. For containerized workloads, correlate with cgroup memory accounting (`memory.current`, `memory.stat`) to distinguish real leaks from expected cache growth the kernel would reclaim under pressure — don't conflate "RSS keeps climbing" with "leak" until you've ruled out legitimate caching behavior.

### 74. How would you design a Bash automation script meant to run unattended in production (e.g. a nightly backup job), covering error handling, idempotency, locking, and observability?
Key elements: `set -euo pipefail` plus a `trap 'cleanup' EXIT ERR` to guarantee cleanup (temp files, locks) runs even on failure; a lock file (`flock` on a fixed path) to prevent overlapping runs if the previous invocation is still running; structured, timestamped logging to both stdout (captured by the process supervisor/journald) and a dedicated log file; explicit exit codes distinguishing failure classes (so alerting/monitoring can differentiate "nothing to do" from "partial failure" from "hard failure"); idempotency (safe to re-run after a partial failure without double-applying effects — e.g. checking whether today's backup already exists before creating another); and a final step that emits a machine-checkable success signal (a heartbeat file with a timestamp, a metric push to Prometheus Pushgateway, or a "dead man's switch" check-in to a monitoring service) so *absence* of a run is detected, not just failures within a run.

### 75. What's the practical difference between statically and dynamically linked binaries, and why does this matter for building minimal container images?
A dynamically linked binary depends on shared libraries (`libc`, etc.) present on the host/image at runtime (`ldd binary` lists them) — smaller binary, shared memory across processes using the same library, but it breaks if the target environment lacks a compatible library version (a common cause of "works on my machine" when moving from a full distro base image to a minimal one like `scratch` or `distroless`). A statically linked binary bundles all its dependencies into a single self-contained executable — larger, no runtime dependency surprises, and is exactly why Go binaries (commonly built with `CGO_ENABLED=0`) are popular for `FROM scratch` container images with zero OS layer at all.

### 76. A `kubectl exec` into a container shows the process is "up" but the app is unresponsive, and there's no useful application log. How do you get a stack trace / diagnose a hang without restarting the pod?
For a process that supports it, send `SIGQUOEA`... more concretely: many runtimes dump goroutine/thread state on a specific signal — Go programs dump all goroutine stacks on `SIGQUIT` (`kill -QUIT <pid>`), JVMs support `jstack <pid>` (or `kill -3` for a thread dump to stdout/log), and for anything else `gdb -p <pid>` (or `py-spy dump --pid <pid>` for Python) can attach non-invasively and print native/interpreter stack traces. This requires the container to have the relevant debug tooling (or a debug/ephemeral container attached via `kubectl debug` in newer Kubernetes versions) since minimal/distroless images intentionally ship without a shell or these utilities.

### 77. How does the Linux page cache interact with container memory limits, and why might a container get OOM-killed even though its "actual" application memory usage looks low?
The kernel opportunistically caches file reads/writes in RAM (page cache) system-wide for performance, and under cgroup v1, page cache attributable to a cgroup counted toward that cgroup's memory limit in ways that could surprise you (e.g., a container doing heavy file I/O accumulating cache that pushes it over `limits.memory` and gets OOM-killed, even though `heap`/`RSS` for the app itself was small). cgroup v2's memory accounting and reclaim behavior improved this (page cache is reclaimed under pressure before triggering OOM in more cases), but it's still essential to understand that "container memory usage" as reported by `docker stats`/`kubectl top` typically includes reclaimable cache, not just live application heap — and to set memory limits based on actual observed working-set behavior under realistic I/O load, not just app-level heap profiling.

### 78. Explain copy-on-write (COW) filesystems (overlayfs) as used by container image layers, and a real operational implication of it.
Container images are built from read-only layers stacked with a union filesystem (overlayfs is the modern default) — writes inside a running container go into a thin writable layer on top, and only the changed bytes/files are copied "up" into that writable layer the moment a lower-layer file is modified (copy-on-write). Operational implication: a container that writes/deletes large files during its lifetime bloats that ephemeral writable layer and can silently pressure the host's disk, since that layer's storage typically isn't reflected in the image size and doesn't show up until `docker system df -v` or the host's actual disk usage is checked — this is exactly why stateful/high-churn data should go in a mounted volume, not the container's writable layer.

### 79. You need to safely rotate SSH host keys / user keys across a fleet of hundreds of servers with zero downtime and no lockouts. What's your approach?
Never remove old keys before new ones are verified working everywhere — treat it as an additive-then-subtractive rollout. Push new public keys to `authorized_keys` (or update the CA-signed short-lived certificate issuer if using SSH certificate authorities, which is the more scalable pattern at fleet scale — see HashiCorp Vault's SSH secrets engine) via configuration management (Ansible/Salt) across the fleet first; validate connectivity with the new key from a canary set of hosts; only *then* remove old keys in a second, separate change. For host keys specifically, update `known_hosts` distribution (or better, use SSHFP DNS records or a centrally managed `known_hosts` via config management) before rotating server-side host keys, to avoid mass "host key verification failed" lockouts across your automation/CI systems the moment the old host key stops being presented.

### 80. How would you harden a Linux server baseline for production (beyond "install a firewall"), and how do you keep that hardening from drifting over time?
Practical baseline: disable root SSH login and password auth (key-only), enforce `AllowUsers`/`AllowGroups` and non-default SSH port where policy requires it, apply CIS Benchmark-derived sysctl hardening (disable IP forwarding on non-routers, SYN cookies, disable ICMP redirects), enable and configure `auditd` for security-relevant syscall auditing, apply SELinux/AppArmor in enforcing mode rather than disabling it for convenience, minimize installed packages/attack surface, enforce automatic security patching for critical CVEs, and centralize logs off-host so an attacker can't erase evidence by compromising the box itself. Preventing drift means encoding all of this as code (Ansible role / hardened base AMI / Packer image built from an OpenSCAP or CIS-benchmark-validated profile) rebuilt and reapplied on a cadence, plus continuous compliance scanning (OpenSCAP, Chef InSpec, or a cloud security posture tool) that alerts on configuration drift rather than relying on a one-time manual hardening pass that nobody revisits.
