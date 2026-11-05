# Text-Processing Lab (sample data for grep / sed / awk)

Every exercise in the [grep](grep-mastery.md), [sed](sed-mastery.md) and [awk](awk-mastery.md) guides runs against the files below. Paste this block into a terminal once. It creates `~/textlab/`, and you can recreate it at any time to start over (handy after an exercise uses `sed -i`).

```bash
mkdir -p ~/textlab && cd ~/textlab

cat > access.log <<'EOF'
192.168.1.10 - - [18/Oct/2026:10:00:01 +0000] "GET /index.html HTTP/1.1" 200 5120 "-" "curl/8.0" 0.012
10.0.0.5 - - [18/Oct/2026:10:00:03 +0000] "POST /api/login HTTP/1.1" 401 312 "-" "Mozilla/5.0" 0.230
10.0.0.5 - - [18/Oct/2026:10:00:04 +0000] "POST /api/login HTTP/1.1" 200 845 "-" "Mozilla/5.0" 0.198
172.16.0.7 - - [18/Oct/2026:10:00:09 +0000] "GET /api/users HTTP/1.1" 200 20480 "-" "python-requests/2.31" 0.540
192.168.1.10 - - [18/Oct/2026:10:01:15 +0000] "GET /images/logo.png HTTP/1.1" 304 0 "-" "Mozilla/5.0" 0.003
203.0.113.9 - - [18/Oct/2026:10:01:22 +0000] "GET /wp-admin.php HTTP/1.1" 404 153 "-" "sqlmap/1.7" 0.004
203.0.113.9 - - [18/Oct/2026:10:01:23 +0000] "GET /.env HTTP/1.1" 404 153 "-" "sqlmap/1.7" 0.002
10.0.0.5 - - [18/Oct/2026:10:01:40 +0000] "GET /api/orders HTTP/1.1" 500 98 "-" "Mozilla/5.0" 2.310
172.16.0.7 - - [18/Oct/2026:10:02:02 +0000] "GET /api/users HTTP/1.1" 200 20480 "-" "python-requests/2.31" 0.610
192.168.1.22 - - [18/Oct/2026:10:02:30 +0000] "DELETE /api/users/42 HTTP/1.1" 403 210 "-" "curl/8.0" 0.020
10.0.0.5 - - [18/Oct/2026:10:02:45 +0000] "GET /api/orders HTTP/1.1" 200 7700 "-" "Mozilla/5.0" 0.880
203.0.113.9 - - [18/Oct/2026:10:02:50 +0000] "GET /admin HTTP/1.1" 404 153 "-" "sqlmap/1.7" 0.003
192.168.1.10 - - [18/Oct/2026:10:03:05 +0000] "GET /index.html HTTP/1.1" 200 5120 "-" "curl/8.0" 0.011
172.16.0.7 - - [18/Oct/2026:10:03:30 +0000] "PUT /api/users/7 HTTP/1.1" 201 512 "-" "python-requests/2.31" 0.300
10.0.0.5 - - [18/Oct/2026:10:03:59 +0000] "GET /api/orders HTTP/1.1" 502 0 "-" "Mozilla/5.0" 5.001
EOF

cat > app.log <<'EOF'
2026-10-18 10:00:01 INFO  [auth] user=alice action=login status=ok latency=120ms
2026-10-18 10:00:02 WARN  [db] slow query table=orders latency=950ms
2026-10-18 10:00:05 ERROR [db] connection timeout host=db-1 retry=1
2026-10-18 10:00:06 ERROR [db] connection timeout host=db-1 retry=2
2026-10-18 10:00:07 INFO  [db] connection restored host=db-1
2026-10-18 10:01:00 INFO  [auth] user=bob action=login status=failed latency=80ms
2026-10-18 10:01:30 ERROR [payment] charge failed order=1001 code=CARD_DECLINED
2026-10-18 10:02:00 INFO  [auth] user=carol action=login status=ok latency=95ms
2026-10-18 10:02:10 DEBUG [cache] miss key=user:42
2026-10-18 10:02:11 DEBUG [cache] hit key=user:7
2026-10-18 10:03:00 ERROR [payment] charge failed order=1002 code=TIMEOUT
2026-10-18 10:03:05 WARN  [auth] user=bob action=login status=failed latency=85ms
2026-10-18 10:04:00 INFO  [auth] user=alice action=logout status=ok latency=10ms
EOF

cat > employees.csv <<'EOF'
id,name,dept,salary,start_date
1,Alice,Engineering,120000,2019-03-15
2,Bob,Engineering,95000,2021-07-01
3,Carol,Sales,70000,2018-11-20
4,Dave,Sales,62000,2023-02-14
5,Eve,Security,135000,2017-05-30
6,Frank,Engineering,105000,2020-09-09
7,Grace,Security,118000,2021-12-01
EOF

cat > depts.txt <<'EOF'
Engineering Bangalore
Sales Mumbai
Security Pune
EOF

cat > users.txt <<'EOF'
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
alice:x:1000:1000:Alice Dev:/home/alice:/bin/bash
bob:x:1001:1001:Bob Ops:/home/bob:/bin/zsh
deploy:x:1002:1002::/home/deploy:/bin/sh
nginx:x:998:998:nginx user:/var/lib/nginx:/usr/sbin/nologin
EOF

cat > app.conf <<'EOF'
# Application config
[server]
host = 0.0.0.0
port = 8080
debug = true

[database]
host = localhost
port = 5432
user = admin
password = changeme

[cache]
enabled = false
ttl = 300
EOF

cat > deployment.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: web
          image: registry.example.com/web:1.4.2
          env:
            - name: LOG_LEVEL
              value: "debug"
        - name: sidecar
          image: registry.example.com/proxy:0.9.1
EOF

printf 'line one  \n\n\nline two\t\n\n  line three\n\n\n' > messy.txt

mkdir -p src/api src/web && cat > src/api/server.py <<'EOF'
import os
API_KEY = "AKIAABCDEFGHIJKLMNOP"   # TODO: move to vault
DB_URL = os.getenv("DB_URL")
def handler(req):
    # FIXME handle timeouts
    return {"status": 200}
EOF
cat > src/web/app.js <<'EOF'
const token = process.env.TOKEN;
// TODO: add retries
fetch("https://api.example.com/v1/users");
console.log("debug", token);
EOF
printf 'node_modules\n*.log\n' > .gitignore
```

## What each file is

| File | Shape | Used for |
|---|---|---|
| `access.log` | Nginx-style access log. `$1`=IP, `$4`=`[timestamp`, `$6`=`"METHOD`, `$7`=path, `$9`=status, `$10`=bytes, `$NF`=response time (s) | grouping, counting, percentiles, security triage |
| `app.log` | Application log: `date time LEVEL [component] key=value...` | level filtering, key=value extraction, multi-line context |
| `employees.csv` | CSV with header | field math, group-by, reports |
| `depts.txt` | `dept city` (space-separated) | two-file joins |
| `users.txt` | `/etc/passwd` format | `-F:`, field selection |
| `app.conf` | INI file with `[sections]` | section-aware edits (sed/awk) |
| `deployment.yaml` | Kubernetes Deployment | image tag bumps, indentation-aware parsing |
| `messy.txt` | trailing spaces, tabs, repeated blank lines | whitespace cleanup |
| `src/` | tiny code tree with TODOs, a fake AWS key, URLs | recursive grep, secret scanning |

## GNU vs BSD (macOS) note

The guides target **GNU** tools (what you get on Linux servers, in CI runners and in containers). macOS ships BSD `sed`, BSD `grep` and BWK `awk`, and these differ. Each guide has a portability table. To follow along on a Mac:

```bash
brew install gawk gnu-sed grep        # gives gawk, gsed, ggrep
# or run everything inside a container:
docker run --rm -it -v "$HOME/textlab":/lab -w /lab debian:stable-slim bash
#   then: apt-get update && apt-get install -y gawk
```

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
