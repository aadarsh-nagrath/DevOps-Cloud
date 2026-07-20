# Comprehensive Linux Permissions & Commonly Used Linux Commands in DevOps

Linux permissions and command-line utilities are fundamental in managing systems, especially for DevOps tasks. Below are detailed notes on common Linux permissions and essential commands frequently used in development and operations.

---

## **1. Basic Linux Permissions**

### `chmod 775`
The `chmod 775` command is used to modify file or directory permissions. It grants **read**, **write**, and **execute** permissions to the **owner** and **group**, and **read** and **execute** permissions to **others**.

#### **Detailed Breakdown**
- `7` (Owner): **Read** (4) + **Write** (2) + **Execute** (1) = **7** (full access)
- `7` (Group): **Read** (4) + **Write** (2) + **Execute** (1) = **7** (full access)
- `5` (Others): **Read** (4) + **Execute** (1) = **5** (limited access)

### **Command Syntax**:
```bash
chmod 775 <filename or directory>
```

#### **Example**:
To set `775` permissions on `example.sh`:
```bash
chmod 775 example.sh
```

#### **Effect**:
- **Owner**: Read, write, and execute.
- **Group**: Read, write, and execute.
- **Others**: Read and execute, but **no write** access.

### **Verify Permissions**:
Use `ls -l` to check file permissions:
```bash
ls -l example.sh
```
Output:
```
-rwxrwxr-x 1 user group 1234 Jan 24 10:00 example.sh
```
- **`rwx` (Owner)**: Full permissions.
- **`rwx` (Group)**: Full permissions.
- **`r-x` (Others)**: Limited permissions (read and execute).

---

## **2. Understanding Linux File Permissions**

### Permission Types:
1. **Read (`r`)**: Allows reading of the file.
2. **Write (`w`)**: Allows modification of the file.
3. **Execute (`x`)**: Allows running the file (if it’s executable).

### Owner, Group, and Others:
- **Owner**: The user who owns the file.
- **Group**: Users in the same group as the file's owner.
- **Others**: All other users not part of the file's owner or group.

---

## **3. `chown` (Change Owner)**
The `chown` command changes the ownership of a file or directory.

### Syntax:
```bash
chown <user>:<group> <filename or directory>
```

### Example:
To change the ownership of `example.sh` to user `alice` and group `devs`:
```bash
chown alice:devs example.sh
```

---

## **4. `chgrp` (Change Group)**
The `chgrp` command changes the group of a file or directory.

### Syntax:
```bash
chgrp <group> <filename or directory>
```

### Example:
To change the group of `example.sh` to `devs`:
```bash
chgrp devs example.sh
```

---

## **5. Special Permissions: SUID, SGID, and Sticky Bit**

### **SUID (Set User ID)**
- Applies to executable files.
- When a user runs an executable with SUID, the program runs with the permissions of the file's owner.
- Example: If a file with SUID set is owned by `root`, it runs with `root` permissions.

**Set SUID**:
```bash
chmod u+s <filename>
```

### **SGID (Set Group ID)**
- Works similarly to SUID but applies to group permissions.
- When applied to a directory, files created within that directory inherit the group of the directory rather than the user's current group.

**Set SGID**:
```bash
chmod g+s <filename or directory>
```

### **Sticky Bit**
- Applied to directories, ensuring that only the file's owner, the directory's owner, or `root` can delete files within the directory.
- Commonly used for shared directories like `/tmp`.

**Set Sticky Bit**:
```bash
chmod +t <directory>
```

---

## **6. Commonly Used Linux Commands for DevOps**

### **a. `ls` (List Files)**
- Lists files and directories in the current directory.

**Example**:
```bash
ls -l
```
Shows detailed file information (permissions, owner, group, size, timestamp).

### **b. `ps` (Process Status)**
- Lists running processes.

**Example**:
```bash
ps aux
```
Shows all running processes.

### **c. `top` (Real-time System Monitor)**
- Displays system processes in real-time, along with CPU and memory usage.

**Example**:
```bash
top
```

### **d. `grep` (Search Text in Files)**
- Used to search for text patterns within files.

**Example**:
```bash
grep "search_term" filename
```

### **e. `kill` (Terminate Process)**
- Sends a signal to terminate a process.

**Example**:
```bash
kill <PID>
```

### **f. `tar` (Archive Files)**
- Used to create compressed archives of files or directories.

**Example**:
```bash
tar -czvf archive.tar.gz /path/to/directory
```

### **g. `find` (Search Files)**
- Finds files based on various criteria.

**Example**:
```bash
find /path/to/search -name "*.txt"
```

### **h. `df` (Disk Space Usage)**
- Displays disk space usage for file systems.

**Example**:
```bash
df -h
```

---

## **7. Linux Networking Commands**

### **a. `ifconfig`**
- Displays or configures network interfaces.

**Example**:
```bash
ifconfig
```

### **b. `ping`**
- Sends ICMP Echo Request packets to a network host.

**Example**:
```bash
ping google.com
```

### **c. `netstat` (Network Statistics)**
- Displays network connections, routing tables, and network interface statistics.

**Example**:
```bash
netstat -tuln
```

### **d. `curl` (Transfer Data)**
- Transfers data from or to a server using various protocols (HTTP, FTP, etc.).

**Example**:
```bash
curl http://example.com
```

---

## **8. Disk Management and Partitioning**

### **a. `fdisk`**
- Used for managing disk partitions.

**Example**:
```bash
fdisk /dev/sda
```

### **b. `mount` and `umount`**
- Mounts or unmounts a file system to a specific directory.

**Example**:
```bash
mount /dev/sda1 /mnt
umount /mnt
```

---

## **9. Working with Logs**

### **a. `tail`**
- Displays the last few lines of a file, often used with log files.

**Example**:
```bash
tail -f /var/log/syslog
```

### **b. `journalctl` (Systemd Logs)**
- Used for querying logs from the systemd journal.

**Example**:
```bash
journalctl -u nginx
```

---

## **10. Managing Services in Linux (Systemd)**

### **a. `systemctl` (Manage System Services)**

- **Start a service**:
  ```bash
  systemctl start <service-name>
  ```

- **Stop a service**:
  ```bash
  systemctl stop <service-name>
  ```

- **Check service status**:
  ```bash
  systemctl status <service-name>
  ```

- **Enable service to start at boot**:
  ```bash
  systemctl enable <service-name>
  ```

- **Disable service from starting at boot**:
  ```bash
  systemctl disable <service-name>
  ```

---

## **11. Using Package Managers**

### **a. `apt` (Debian/Ubuntu)**
- Install a package:
  ```bash
  sudo apt install <package-name>
  ```

- Update package list:
  ```bash
  sudo apt update
  ```

### **b. `yum` (CentOS/RHEL)**
- Install a package:
  ```bash
  sudo yum install <package-name>
  ```

- Update package list:
  ```bash
  sudo yum update
  ```

---

These are essential Linux concepts and commands used in DevOps, ranging from file permissions and process management to systemd service control and networking commands. Mastery of these commands helps streamline DevOps tasks like managing servers, automating deployments, and monitoring systems.