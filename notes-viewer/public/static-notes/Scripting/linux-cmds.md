Linux, with its robust command-line interface, offers a plethora of powerful tools and commands that can enhance productivity and efficiency for both beginners and advanced users. Understanding and mastering these commands can significantly improve your Linux experience. In this guide, we will explore various essential commands across different categories.

## File Commands

### Directory Listing
- `ls`: Displays directory contents.
- `ls -al`: Formats the listing to include hidden files.

### Navigation
- `cd directory`: Changes the current directory to the specified one.
- `cd`: Changes the current directory to the home directory.
- `pwd`: Shows the current directory.

### File Manipulation
- `mkdir directory`: Creates a new directory.
- `rm file`: Deletes a file.
- `rm -r directory`: Deletes a directory recursively.
- `cp file1 file2`: Copies file1 to file2.
- `mv file1 file2`: Renames or moves file1 to file2.
- `touch file`: Updates the access and modification timestamps of a file.
- `cat > file`: Redirects standard input into a file.
- `more file` / `less file`: Displays file content page by page.
- `head file` / `tail file`: Displays the first/last part of a file.
- `tail -f file`: Outputs contents of a file as it grows.
- `grep -i pattern file`: Searches for a pattern in a file, ignoring case.
 - `find directory -name filename`: Searches for files in a directory with a specific name.

## SSH

Secure Shell (SSH) allows secure remote access to systems.

- `ssh user@host`: Connects to a host as a specific user.
- `ssh -p port user@host`: Connects using a specific port.
- `ssh -D port user@host`: Sets up dynamic application-level port forwarding.

## Installation

The process of installing software on Linux usually involves these steps:

- `./configure`: Configures the source code.
- `make`: Compiles the source code.
- `make install`: Installs the compiled software.

## Networking

Various networking commands are essential for network troubleshooting and management:

- `ping host`: Tests network connectivity to a host.
- `whois domain`: Retrieves WHOIS information for a domain.
- `dig domain`: Performs DNS queries.
- `wget file`: Downloads files from the internet.
- `wget -c file`: Continues a stopped download.
- `wget -r url`: Recursively downloads files from a URL.
- `netstat`: Displays network connections, routing tables, interface statistics, masquerade connections, and multicast memberships.
- `traceroute host`: Traces the route that packets take to reach a host.

## System Information

Understanding system status and configurations is crucial for system administrators:

- `date`: Displays the current date and time.
- `cal`: Shows the calendar for the current month.
- `uptime`: Displays the system uptime.
- `w`: Shows who is online.
- `uname -a`: Displays kernel information.
- `df`: Shows disk usage.
- `du`: Shows directory space usage.
- `free`: Shows memory and swap usage.
- `top`: Displays real-time information about running processes, CPU, and memory usage.
- `htop`: Interactive process viewer for system monitoring.

## Disk Usage (`df`, `du`, inodes)

`df` reports usage **per filesystem** (what the kernel sees mounted). `du` walks **files and directories** and adds up their sizes. When the two disagree, that's usually a clue (see "Gotchas" below).

### `df` — filesystem space
- `df`: Usage per mounted filesystem, in 1K blocks (hard to read).
- `df -h`: Human-readable sizes (`K`, `M`, `G`) — the one you'll type 90% of the time.
- `df -H`: Human-readable using powers of 1000 instead of 1024 (matches what disk vendors print).
- `df -h /var`: Show only the filesystem that holds `/var`.
- `df -hT`: Add the filesystem **type** column (`ext4`, `xfs`, `overlay`, `tmpfs`, `nfs`).
- `df -h -x tmpfs -x devtmpfs -x overlay`: Hide pseudo/container filesystems so only real disks show.
- `df -t ext4 -h`: Show only filesystems of a given type.
- `df -P`: POSIX output — one line per filesystem, never wrapped. Use this when piping to `awk` in scripts.
- `df -h --output=source,fstype,size,used,avail,pcent,target`: Pick exactly the columns you want (GNU coreutils).
- `df -l`: Local filesystems only (skip NFS/SMB mounts that may hang).

### `df -i` — inodes
Every file, directory, symlink and socket uses one **inode**. A filesystem can run out of inodes while still having plenty of free bytes — and then `touch`, `mkdir` and app writes fail with `No space left on device` even though `df -h` shows space.

- `df -i`: Inode usage per filesystem (`Inodes`, `IUsed`, `IFree`, `IUse%`).
- `df -ih`: Same, with counts shortened (`1.2M` instead of `1234567`).
- `df -i /var`: Inodes for the filesystem holding `/var`.

Typical causes of inode exhaustion: millions of tiny files in session/cache dirs (PHP sessions, mail queues, `/tmp`), unrotated small log files, container image layers under `/var/lib/docker`, build artifacts.

```bash
# Which directories hold the most files (inodes)? GNU du:
du --inodes -x / 2>/dev/null | sort -n | tail -20

# Portable fallback: count files per top-level dir
for d in /var/*; do echo "$(find "$d" -xdev 2>/dev/null | wc -l) $d"; done | sort -n | tail
```

Note: `xfs` and `btrfs` allocate inodes dynamically, so inode exhaustion is mostly an `ext4` problem (inode count is fixed at `mkfs` time — `mkfs.ext4 -i <bytes-per-inode>` or `-N <count>`).

### `du` — directory/file space
- `du -sh /var/log`: Total size of one directory (`-s` summary, `-h` human-readable).
- `du -sh *`: Size of each item in the current directory.
- `du -sh .[!.]* *`: Same, including hidden files/dirs.
- `du -h --max-depth=1 /var` (or `du -h -d 1 /var`): One level deep — the fastest way to drill down.
- `du -ah /var/log`: Include files, not just directories.
- `du -xh -d 1 /`: `-x` stays on one filesystem (don't descend into `/proc`, other mounts, NFS).
- `du -ch *.log`: Sizes plus a grand total line (`-c`).
- `du -sh --apparent-size file`: Logical size instead of blocks on disk (differs for sparse files like VM images).
- `du -h --exclude='*.gz' /var/log`: Skip matching paths.

```bash
# Top 10 biggest directories under /var (sort -h understands K/M/G)
du -xh -d 1 /var 2>/dev/null | sort -rh | head -10

# Biggest files on the root filesystem
find / -xdev -type f -size +500M -exec ls -lh {} + 2>/dev/null | sort -k5 -rh | head

# Interactive explorer (if installed) — much nicer than chaining du
ncdu -x /
```

### Disk-full troubleshooting flow
```bash
df -hT                      # 1. which filesystem is full? bytes or...
df -i                       # 2. ...inodes?
du -xh -d 1 / | sort -rh    # 3. drill down level by level
sudo lsof +L1               # 4. deleted-but-still-open files (see below)
```

### Safe cleanup (production)
Check what you're about to delete before you delete it, and prefer tools that know their own data over `rm`.

```bash
# systemd journal
sudo journalctl --disk-usage
sudo journalctl --vacuum-time=7d          # or --vacuum-size=500M

# Rotated/compressed logs
sudo du -sh /var/log/* | sort -rh | head
sudo find /var/log -name '*.gz' -mtime +14 -delete
sudo logrotate -f /etc/logrotate.conf     # force rotation if a log was never rotated

# Docker
docker system df                          # what's using space: images, containers, volumes, build cache
docker image prune                        # dangling images only (safe)
docker system prune                       # + stopped containers, unused networks, dangling images
docker system prune -a --volumes          # also unused images AND volumes — data loss risk, review first

# Kubernetes node (containerd)
sudo crictl rmi --prune                   # remove images no container is using
# kubelet also garbage-collects images at imageGCHighThresholdPercent (default 85%)

# Package caches
sudo apt-get clean      # Debian/Ubuntu
sudo dnf clean all      # RHEL/Amazon Linux

df -h                                     # verify the space came back
```

If the space doesn't come back after deleting, a process still has the file open — see `lsof +L1` below.

### Gotchas
- **`df` says full, `du` says small** → a process is still holding a **deleted** file open (classic with logs deleted instead of rotated). Space isn't freed until the process closes it. Find with `lsof +L1` or `lsof | grep '(deleted)'`, then restart the process or truncate via `: > /proc/<pid>/fd/<fd>`.
- **Files hidden under a mount point**: data written to `/data` *before* a disk was mounted there still uses space on the root fs but is invisible to `du`. Check with a bind mount: `mount --bind / /mnt && du -sh /mnt/data`.
- **Reserved blocks**: `ext4` reserves ~5% for root, so `Used + Avail < Size` and non-root users hit "full" early. View/change with `tune2fs -l /dev/sdX | grep -i reserved` / `tune2fs -m 1 /dev/sdX`.
- **Never truncate a log with `rm`** on a live service — use `: > app.log` or `truncate -s 0 app.log` so the file handle stays valid.
- **macOS/BSD**: `du` uses `-d 1` (no `--max-depth`), no `--inodes`; `df -i` works but is shown by default on macOS `df`.

### In scripts
```bash
# Alert on any filesystem > 80% bytes or inodes (use -P so lines never wrap)
df -P  | awk 'NR>1 && $5+0 > 80 {print "DISK  ", $6, $5}'
df -Pi | awk 'NR>1 && $5+0 > 80 {print "INODES", $6, $5}'

# Get just the % used for /, as a number
used=$(df --output=pcent / | tail -1 | tr -dc '0-9')
[ "$used" -gt 90 ] && echo "root fs at ${used}%"
```

## Searching

Efficiently search for files and patterns within files:

- `grep pattern files`: Searches for a pattern in files.
- `grep -r pattern directory`: Searches recursively for a pattern in a directory.
- `command | grep pattern`: Searches for a pattern in the output of a command.
- `locate file`: Finds all instances of a file.

## Process Management

Control and manage running processes:

- `ps`: Displays currently active processes.
- `kill PID`: Terminates a process with a specific PID.
- `killall process_name`: Terminates all processes with a specific name.
- `bg`: Lists stopped or background jobs.
- `fg`: Brings the most recent job to the foreground.

## File Permissions

Manage file permissions:

- `chmod octal file`: Changes the permission of a file.
- `4` (read), `2` (write), `1` (execute).
- `777` (rwx for everyone), `755` (rw for owner, rx for group/world).

Access Control Lists (ACL)
- `getfacl file`: Displays the Access Control List (ACL) of a file.
- `setfacl -m u:user: permissions file`: Modifies the ACL of a file to grant specific permissions to a user.

## Compression

Compress and decompress files:

- `tar cf file.tar files`: Creates a tar archive.
- `tar xf file.tar`: Extracts a tar archive.
- `gzip file`: Compresses a file.
- `gzip -d file.gz`: Decompresses a file.
- `zip file.zip files`: Creates a zip archive.
- `unzip file.zip`: Extracts files from a zip archive.

## Shortcuts

Useful keyboard shortcuts for the command line:

- `Ctrl+A`: Moves the cursor to the beginning of the line.
- `Ctrl+E`: Moves the cursor to the end of the line.
- `Ctrl+C`: Halts the current command.
- `Ctrl+Z`: Stops the current command, putting it in the background.
- `Ctrl+D`: Logs out of the current session.
- `Ctrl+E`: Erases one word in the current line.
- `Ctrl+U`: Erases the entire line.
- `Ctrl+R`: Reverse lookup of previous commands.
- `!!`: Repeats the last command.

Mastering these commands will empower you to navigate and manipulate your Linux system efficiently, whether you are a beginner or an experienced user.

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
