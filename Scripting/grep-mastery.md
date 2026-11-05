# GREP: Beginner → Moderate → Advanced → Master

> `grep` searches text for lines that match a pattern. It's the first tool in almost every troubleshooting session: *"which pod logged the error?"*, *"where is this env var used?"*, *"did anyone commit a secret?"*. Mastering grep is mostly **mastering regular expressions** plus knowing the flags that make it fast and script-safe.

**Before you start:** create the sample files from the [Text-Processing Lab](text-processing-lab.md). Every example below was run on **GNU grep 3.11**. BSD/macOS differences are flagged with 🍎.

**Related:** [sed in depth](sed-mastery.md) · [awk in depth](awk-mastery.md) · [Bash scripting](bash-scripting.md)

---

## Table of Contents

- [Level 0: The Mental Model](#level-0-the-mental-model)
- [Level 1: Beginner](#level-1-beginner)
- [Level 2: Moderate (regex for real)](#level-2-moderate-regex-for-real)
- [Level 3: Advanced](#level-3-advanced)
- [Level 4: Master](#level-4-master)
- [Pitfalls That Bite in Production](#pitfalls-that-bite-in-production)
- [GNU vs BSD grep, and ripgrep / git grep](#gnu-vs-bsd-grep-and-ripgrep--git-grep)
- [Exercises with Answers](#exercises-with-answers)
- [One-Liner Cheat Sheet](#one-liner-cheat-sheet)

---

## Level 0: The Mental Model

```mermaid
flowchart LR
    IN[(files / stdin)] --> L[read line]
    L --> M{pattern matches?<br/>-G / -E / -F / -P}
    M -->|"yes (or no with -v)"| O["print<br/>(-n, -o, -c, -l shape the output)"]
    M -->|no| L
    O --> L
    L -->|EOF| X{any match?}
    X -->|yes| E0[exit 0]
    X -->|no| E1[exit 1]
    L -->|error| E2[exit 2]
```

```
grep [options] PATTERN [FILE...]
```

- grep reads input **line by line** and prints every line where PATTERN matches **anywhere** in the line.
- The pattern is a **regular expression** unless you say otherwise (`-F`).
- With no files (or `-`), grep reads stdin, so it slots into pipelines: `kubectl logs pod | grep ERROR`.
- The **exit status** is part of the API. Scripts depend on it:

| Exit code | Meaning |
|---|---|
| `0` | at least one line matched |
| `1` | no lines matched (not an error!) |
| `2` | an error: missing file, bad regex, ... (even if other files matched) |

Three engines, chosen by flag:

| Flag | Engine | Notes |
|---|---|---|
| `-G` (default) | Basic regex (BRE) | `+ ? \| ( ) { }` need a backslash |
| `-E` | Extended regex (ERE) | `+ ? \| ( ) { }` are operators: **use this by default** |
| `-F` | Fixed strings | no regex at all; fastest; safest for user input |
| `-P` | Perl-compatible (PCRE) | lookarounds, `\d`, lazy `*?`, `\K` (GNU only; 🍎 BSD lacks it) |

---

## Level 1: Beginner

### 1.1 The everyday flags

```bash
grep ERROR app.log                 # lines containing ERROR
grep -i error app.log              # case-insensitive
grep -v DEBUG app.log              # invert: lines NOT matching
grep -n '" 404 ' access.log        # prefix line numbers
grep -c ERROR app.log              # COUNT matching lines (4)
grep -m2 ERROR app.log             # stop after 2 matches (fast on huge files)
grep -w cat file                   # whole word: matches "the cat sat", not "catalog" or "bobcat"
grep -x 'Sales Mumbai' depts.txt   # the whole line must match exactly
grep -o 'latency=[0-9]*' app.log   # print ONLY the matched part, one per line
grep -q CARD_DECLINED app.log      # quiet: no output, just the exit code
grep -s pattern maybe-missing.txt  # suppress "No such file" errors
```

### 1.2 Multiple patterns

```bash
grep -e WARN -e ERROR app.log      # OR: either pattern
grep -E 'WARN|ERROR' app.log       # same, with alternation
grep -f patterns.txt app.log       # one pattern per line, read from a file
grep ERROR app.log | grep -F '[db]'   # AND: chain greps
```

### 1.3 Context around matches

```bash
grep -A2 'retry=2' app.log         # 2 lines After
grep -B1 CARD_DECLINED app.log     # 1 line Before
grep -C1 -n TIMEOUT app.log        # 1 line of Context on both sides
# 10-2026-10-18 10:02:11 DEBUG ...    ← "-" after the number marks a context line
# 11:2026-10-18 10:03:00 ERROR ...    ← ":" marks a matching line
# 12-2026-10-18 10:03:05 WARN  ...
```

Separate groups of context are divided by a `--` line.

### 1.4 Searching many files

```bash
grep -r TODO src/                  # recursive
grep -rn TODO src/                 # ... with line numbers (file:line:text)
grep -rl TODO src/                 # only the NAMES of files that match
grep -rL TODO src/                 # names of files that DON'T match
grep -rc TODO src/                 # count per file (includes 0s)
grep -h ERROR *.log                # hide file names (the default with multiple files is to show them)
grep -H ERROR app.log              # force file names, even with one file
grep -R pattern dir/               # like -r but also follows symlinks
```

### 1.5 grep in `if` statements

Use `-q` and the exit code. Don't capture output just to test whether it's empty.

```bash
if grep -q 'CARD_DECLINED' app.log; then
    echo "payment failures found"
fi

grep -qx 'nameserver 10.0.0.2' /etc/resolv.conf || echo 'nameserver 10.0.0.2' >> /etc/resolv.conf   # idempotent "ensure line"
```

---

## Level 2: Moderate (regex for real)

### 2.1 Regex building blocks

| Token | Matches | Example |
|---|---|---|
| `.` | any single character | `h.st` → host, hast |
| `^` / `$` | start / end of line | `^#` comment lines, `;$` lines ending in `;` |
| `[abc]` | one of a, b, c | `[Ee]rror` |
| `[^abc]` | any char **except** a, b, c | `[^ ]+` a run of non-spaces |
| `[a-z0-9]` | ranges | |
| `*` | 0 or more of the previous item | |
| `+` (ERE) | 1 or more | `[0-9]+` |
| `?` (ERE) | 0 or 1 | `https?://` |
| `{n}` `{n,}` `{n,m}` (ERE) | repetition counts | `[0-9]{3}` |
| `(...)` (ERE) | group | `(ab)+` |
| `a\|b` (ERE: `a|b`) | alternation | `GET|POST` |
| `\1` | backreference to group 1 | `([a-z]+) \1` repeated word |
| `\b` / `\<` `\>` | word boundary / start / end of word (GNU) | `\bcat\b` |
| `\w` / `\W` | word char `[[:alnum:]_]` / non-word (GNU) | |
| `\s` / `\S` | whitespace / non-whitespace (GNU) | |

**POSIX character classes** (portable, locale-aware) go *inside* brackets:

| Class | Same as |
|---|---|
| `[[:digit:]]` | `[0-9]` |
| `[[:alpha:]]` / `[[:alnum:]]` | letters / letters + digits |
| `[[:upper:]]` / `[[:lower:]]` | case |
| `[[:space:]]` | space, tab, newline, CR, FF, VT |
| `[[:punct:]]` | punctuation |
| `[[:xdigit:]]` | hex digits |

```bash
grep -E '^[[:space:]]*$' file          # blank or whitespace-only lines
grep -E '[[:upper:]]{4,}' app.log      # runs of 4+ capitals (INFO, ERROR, ...)
```

### 2.2 Special characters: the `[auth]` trap

`[...]` is a *character class*, so `grep '[auth]'` means "any line containing a, u, t **or** h". That's almost every line:

```bash
grep -c '[auth]' app.log      # 13  ❌ every line
grep -c '\[auth\]' app.log    # 5   ✅ escaped
grep -cF '[auth]' app.log     # 5   ✅ fixed string: no escaping needed
```

Characters to escape for a literal match in BRE/ERE: `. * [ ] ^ $ \`, plus `+ ? ( ) { } |` in ERE. **When you're searching for a literal string, use `-F`.**

### 2.3 Extracting data with `-o`

```bash
grep -oE '^[0-9.]+' access.log | sort -u                 # unique client IPs
grep -oE '" [0-9]{3} ' access.log | grep -oE '[0-9]{3}' | sort | uniq -c   # status code histogram
grep -o ERROR app.log | wc -l                            # count OCCURRENCES (-c counts LINES)
grep -oE 'https?://[^" ]+' src/web/app.js                # URLs
```

`-c` counts **lines**. A line with three matches counts once. Use `grep -o ... | wc -l` to count matches.

### 2.4 Strict patterns for common data

```bash
# IPv4: each octet 0-255 (a lazy [0-9.]+ also matches "999.1.1.1")
grep -oE '\b((25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\b'

# ISO date (format only; it can't know Feb has no 30th, so validate with `date -d`)
grep -E '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'

# semver
grep -E '^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'

# email (pragmatic, not RFC-perfect)
grep -oE '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'

# repeated word typo ("the the")
grep -E '\b([a-z]+) \1\b'
```

### 2.5 Filtering recursive searches

```bash
grep -rn --include='*.yaml' 'image:' .                  # only YAML files
grep -rn --include='*.yaml' --include='*.yml' 'image:' . # several globs: repeat the flag (braces inside --include don't work)
grep -rn --exclude='*.min.js' TODO .                    # skip a file pattern
grep -rn --exclude-dir=node_modules --exclude-dir=.git TODO .
grep -rn --exclude-dir={node_modules,.git,vendor} TODO .   # bash brace expansion
grep -rnI TODO .                                        # -I: skip binary files
```

### 2.6 Pattern files and blocklists

```bash
printf '10.0.0.5\n203.0.113.9\n' > bad_ips.txt
grep -Ff bad_ips.txt access.log        # lines containing ANY listed IP
grep -wFf bad_ips.txt access.log       # ... as whole words, so 10.0.0.5 doesn't match 10.0.0.50
grep -vFf bad_ips.txt access.log       # requests from everyone else
grep -vxFf old.txt new.txt             # lines in new.txt that aren't in old.txt (a set difference)
```

`-F -f` uses the Aho–Corasick algorithm. Matching against thousands of fixed strings stays fast.

---

## Level 3: Advanced

### 3.1 PCRE (`-P`): lookarounds, `\K`, lazy quantifiers

```bash
grep -oP 'latency=\K[0-9]+' app.log                  # \K: "match this but don't output it" → 120 950 80 ...
grep -oP '(?<=order=)\d+' app.log                    # lookbehind → 1001, 1002
grep -oP '\d+(?=ms)' app.log                         # lookahead: numbers followed by "ms"
grep -P '^(?=.*\[auth\])(?=.*status=failed)' app.log # AND, in any order, in one regex
grep -P '^(?!.*DEBUG)' app.log                       # lines NOT containing DEBUG (inline -v)
echo 'a "x" b "y"' | grep -oE '".*"'                 # greedy  → "x" b "y"
echo 'a "x" b "y"' | grep -oP '".*?"'                # lazy    → "x"   and   "y"
echo '{"status": "ok"}' | grep -oP '"status":\s*"\K[^"]+'   # quick JSON value (use jq for real JSON)
```

| PCRE | Meaning |
|---|---|
| `\d \w \s` | digit, word char, whitespace |
| `(?=x)` / `(?!x)` | followed by / not followed by x |
| `(?<=x)` / `(?<!x)` | preceded by / not preceded by x (fixed width) |
| `\K` | reset the match start: everything before is required but not printed |
| `*? +? ??` | lazy (shortest) quantifiers |
| `(?i)` | inline case-insensitive |
| `(?s)` | `.` also matches newline (with `-z`) |

### 3.2 Matching across lines: `-z`

`-z` makes grep read NUL-separated records. A normal text file has no NULs, so the **whole file is one record**, and with `-P` you can match newlines:

```bash
grep -Pzo '(?s)retry=2\n[^\n]*restored[^\n]*' app.log | tr '\0' '\n'
# retry=2
# 2026-10-18 10:00:07 INFO  [db] connection restored host=db-1
```

Each `-o` match ends with a NUL byte, so pipe through `tr '\0' '\n'`. This works on files that fit in memory. For anything bigger, use awk.

### 3.3 Script-safe grep

```bash
set -euo pipefail
n=$(grep -c NOPE app.log)            # ❌ no match → exit 1 → script dies silently right here
n=$(grep -c NOPE app.log || true)    # ✅ n=0
if grep -q x file; then ...          # ✅ `if` absorbs the non-zero exit

grep -e '-v' file                    # pattern starting with "-": use -e ...
grep -- '--color' file               # ... or end options with --

grep -rl --null TODO . | xargs -0 sed -i 's/TODO/DONE/'   # -Z/--null: NUL-terminate file names (spaces safe)

grep -qs 'x' maybe.txt; echo $?      # 2 if the file is missing; -s just hides the message
```

Treat exit code `2` differently from `1`: "file missing" is not the same as "no match".

```bash
grep -q ERROR "$log"; rc=$?
case $rc in
  0) echo "errors present" ;;
  1) echo "clean" ;;
  *) echo "grep failed (missing file / bad regex)" >&2; exit 2 ;;
esac
```

### 3.4 Binary files and encodings

```bash
grep ERROR bin.dat          # grep: bin.dat: binary file matches
grep -a ERROR bin.dat       # -a: treat as text and show the line anyway
grep -rI pattern .          # -I: skip binaries entirely (great for repo searches)
grep -rlI $'\r' .           # find files with Windows CRLF line endings
grep -ob 'Sales' depts.txt  # -b: byte offset of each match → 22:Sales
```

### 3.5 Live logs

```bash
tail -f app.log | grep --line-buffered ERROR | awk '{print $1, $2, $4}'
kubectl logs -f deploy/web | grep --line-buffered -E 'ERROR|panic'
```

When grep writes to a pipe instead of a terminal, it **buffers output in 4 KB blocks**, so downstream tools see nothing for a long time. `--line-buffered` flushes after every line.

### 3.6 Processes: don't grep `ps` naively

```bash
ps aux | grep nginx              # ❌ also matches the "grep nginx" process itself
ps aux | grep '[n]ginx'          # ✅ the regex [n]ginx matches "nginx", but grep's own command line contains "[n]ginx"
pgrep -fa nginx                  # ✅ the right tool: PIDs + command lines
```

### 3.7 Compressed and rotated logs

```bash
zgrep -c ERROR app.log.gz                  # grep inside .gz without unpacking
zgrep -h ERROR /var/log/syslog*            # current + rotated (.1, .2.gz ...)
journalctl -u nginx --since -1h | grep -i upstream
```

---

## Level 4: Master

### 4.1 Performance

1. **`-F` when you don't need a regex.** Fixed-string search uses Boyer–Moore and skips through the text.
2. **`LC_ALL=C`**: byte-wise matching avoids UTF-8 decoding. It can be dramatically faster on large ASCII logs, especially with `-i` or character classes.
3. **`-m N` and `-q`** stop reading early.
4. **Anchor the pattern** (`^2026-10-18 10:0`) so failed lines are rejected quickly.
5. **Narrow the file set first**: `--include`, `--exclude-dir`, or `git ls-files`.
6. Avoid **backreferences** on big inputs. They disable the fast DFA matcher.
7. For code trees, use **ripgrep (`rg`)**. It's parallel, respects `.gitignore` and skips binaries by default.

```bash
LC_ALL=C grep -F -c 'sqlmap' huge-access.log
```

### 4.2 Secret scanning (pre-commit / CI gate)

```bash
#!/usr/bin/env bash
# scan.sh — fail (exit 1) if likely secrets are present in the given paths
set -uo pipefail
patterns=(
  'AKIA[0-9A-Z]{16}'                               # AWS access key id
  '-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----'   # private keys
  'gh[pousr]_[A-Za-z0-9]{36}'                      # GitHub tokens
  '(api[_-]?key|secret|token|passw(or)?d)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{8,}'
)
args=()
for p in "${patterns[@]}"; do args+=(-e "$p"); done
if grep -rnIE --exclude-dir={.git,node_modules,vendor} "${args[@]}" "${@:-.}"; then
  echo "❌ possible secrets found" >&2; exit 1
fi
echo "✅ clean"
```

```bash
bash scan.sh src        # src/api/server.py:2:API_KEY = "AKIA..."  ❌ possible secrets found (exit 1)
bash scan.sh depts.txt  # ✅ clean (exit 0)
```

Things to notice:
- The patterns go in via `-e` because one of them starts with `-----`.
- Requiring a quoted value of 8+ characters cuts false positives like `const token = process.env.TOKEN`. A naive `grep -i token` flags that line.
- In real pipelines, use a dedicated scanner (gitleaks, trufflehog). This script is what you write in an interview or for a quick gate.

### 4.3 `git grep`: grep that knows about git

```bash
git grep -n TODO                          # tracked files only, honours .gitignore, fast
git grep -n 'image:' -- '*.yaml'          # pathspec filter
git grep -n 'AKIA' $(git rev-list --all)  # search EVERY commit (finds secrets that were "deleted")
git grep -c 'TODO' v1.0 -- src/           # search a tag/branch without checking it out
git log -G 'API_KEY' --oneline            # commits whose diff added or removed a matching line
```

### 4.4 Combining with the rest of the toolbox

```bash
# scanner IPs: ≥3 404s
grep -E '" 404 ' access.log | grep -oE '^[^ ]+' | sort | uniq -c | awk '$1 >= 3 {print $2}'    # 203.0.113.9

# which pods logged errors in the last 10 minutes
for p in $(kubectl get pods -o name); do
  kubectl logs "$p" --since=10m | grep -q ERROR && echo "$p"
done

# files that contain BOTH words (in any position)
grep -rlZ 'DB_URL' src | xargs -0 grep -l 'getenv'

# word frequency of error codes
grep -oP 'code=\K\w+' app.log | sort | uniq -c | sort -rn
```

### 4.5 Exotic but useful flags

| Flag | Use |
|---|---|
| `--color=always` | keep colours through a pipe: `grep --color=always ERR f \| less -R` |
| `-T` | align output with a tab after the prefix |
| `--label=NAME` | file name to show for stdin (`... \| grep -H --label=pod-1 ERR`) |
| `-U` | binary mode: don't strip CR on some platforms |
| `--exclude-from=FILE` | skip globs listed in a file |
| `-D skip` | skip devices, FIFOs and sockets during `-r` |
| `GREP_COLORS='mt=01;32'` | change the highlight colour |

---

## Pitfalls That Bite in Production

| Pitfall | Symptom | Fix |
|---|---|---|
| `grep '[auth]'` | Matches nearly everything | Escape `\[auth\]`, or `-F` |
| Unescaped `.` | `10.0.0.5` also matches `10a0b0c5` | `-F`, or `10\.0\.0\.5` |
| `-F -f` without `-w` | `10.0.0.5` matches `10.0.0.50` | `-wFf` |
| `set -e` + no match | Script exits silently | `\|\| true`, or `if grep -q` |
| `ps \| grep x` | Matches itself | `grep '[x]'`, or `pgrep` |
| Pipe buffering | `tail -f \| grep \| ...` shows nothing | `--line-buffered` |
| `-c` vs occurrences | Undercounts | `grep -o \| wc -l` |
| Pattern begins with `-` | "invalid option" | `-e PATTERN` or `--` |
| "binary file matches" | Lines hidden | `-a`, or `-I` to skip |
| `-P` on macOS | `invalid option -- P` | `brew install grep` (`ggrep`), or use `-E` |
| CRLF files | `grep 'x$'` fails | `grep $'x\r$'`, or `dos2unix` first |
| Greedy `.*` | Matches too much | `[^"]*`, or `-P` with `.*?` |

---

## GNU vs BSD grep, and ripgrep / git grep

| Feature | GNU grep | BSD/macOS grep | ripgrep `rg` |
|---|---|---|---|
| `-E -F -i -v -c -l -L -o -w -x -r` | ✅ | ✅ | ✅ (`-F`, `-i` ...; recursive by default) |
| `-P` PCRE | ✅ | ❌ | ✅ (`-P`; default engine is Rust regex) |
| `\b \w \s \< \>` | ✅ | partial | ✅ |
| `--include/--exclude-dir` | ✅ | ✅ | `-g '*.yaml'`, `-g '!vendor'` |
| Respects `.gitignore` | ❌ | ❌ | ✅ by default |
| `-z` NUL-separated input | ✅ | ⚠️ `-z` exists but behaves differently; test first | `--null-data` |
| Parallel search | ❌ | ❌ | ✅ |
| `--line-buffered` | ✅ | ✅ | ✅ (`--line-buffered`) |

---

## Exercises with Answers

Run them in `~/textlab` (see the [lab setup](text-processing-lab.md)).

### 🟢 Beginner

**GB1.** Count the lines in `app.log` that contain "error" in any letter case.
<details><summary>Answer</summary>

```bash
grep -ic error app.log     # 4
```
</details>

**GB2.** Count the lines that are **not** DEBUG.
<details><summary>Answer</summary>

```bash
grep -vc DEBUG app.log     # 11
```
</details>

**GB3.** Show the line numbers of all 404 responses in `access.log`.
<details><summary>Answer</summary>

```bash
grep -n '" 404 ' access.log     # lines 6, 7, 12
```
Including the closing quote and spaces stops `404` from matching inside a byte count or a path.
</details>

**GB4.** From the input `cat`, `catalog`, `the cat sat`, `bobcat`, print only the lines with the **word** "cat".
<details><summary>Answer</summary>

```bash
printf 'cat\ncatalog\nthe cat sat\nbobcat\n' | grep -w cat
# cat
# the cat sat
```
</details>

**GB5.** Check whether `depts.txt` has a line that is exactly `Sales`. What's the exit code?
<details><summary>Answer</summary>

```bash
grep -x 'Sales' depts.txt; echo $?     # prints nothing, exit 1 (the line is "Sales Mumbai")
```
</details>

**GB6.** Find every TODO under `src/` with file names and line numbers. Then list only the file names.
<details><summary>Answer</summary>

```bash
grep -rn TODO src/
# src/api/server.py:2:API_KEY = "AKIA..."   # TODO: move to vault
# src/web/app.js:2:// TODO: add retries
grep -rl TODO src/
```
</details>

**GB7.** Show the 2 lines **after** the line with `retry=2`.
<details><summary>Answer</summary>

```bash
grep -A2 'retry=2' app.log
```
The output shows the database recovering (`connection restored`).
</details>

**GB8.** Show each `CARD_DECLINED` line with the line before it.
<details><summary>Answer</summary>

```bash
grep -B1 CARD_DECLINED app.log
```
</details>

**GB9.** Count the 5xx responses in `access.log`.
<details><summary>Answer</summary>

```bash
grep -cE '" 5[0-9]{2} ' access.log     # 2
```
</details>

**GB10.** Print only the first 2 ERROR lines.
<details><summary>Answer</summary>

```bash
grep -m2 ERROR app.log
```
</details>

**GB11.** Write an `if` that prints "payment failures found" when `CARD_DECLINED` appears in `app.log`, with no grep output.
<details><summary>Answer</summary>

```bash
if grep -q CARD_DECLINED app.log; then echo "payment failures found"; fi
```
</details>

**GB12.** Count the non-empty and the empty lines in `messy.txt`.
<details><summary>Answer</summary>

```bash
grep -c .  messy.txt      # 3  (lines with at least one character)
grep -c '^$' messy.txt    # 5
```
</details>

### 🟡 Moderate

**GI1.** List the unique client IPs in `access.log`.
<details><summary>Answer</summary>

```bash
grep -oE '^[0-9.]+' access.log | sort -u
```
</details>

**GI2.** Build a histogram of HTTP status codes.
<details><summary>Answer</summary>

```bash
grep -oE '" [0-9]{3} ' access.log | grep -oE '[0-9]{3}' | sort | uniq -c
#   6 200
#   3 404 ...
```
</details>

**GI3.** Extract only **valid** IPv4 addresses from: `10.0.0.5`, `999.1.1.1`, `192.168.1.300`, `ip=172.16.0.7;`.
<details><summary>Answer</summary>

```bash
printf '10.0.0.5\n999.1.1.1\n192.168.1.300\nip=172.16.0.7;\n' |
  grep -oE '\b((25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\b'
# 10.0.0.5
# 172.16.0.7
```
</details>

**GI4.** Find every `image:` line, searching only YAML files under the current directory.
<details><summary>Answer</summary>

```bash
grep -rn --include='*.yaml' 'image:' .
```
</details>

**GI5.** Search for TODO recursively but skip `node_modules`.
<details><summary>Answer</summary>

```bash
grep -rln --exclude-dir=node_modules TODO .
```
</details>

**GI6.** Why does `grep -c '[auth]' app.log` return 13 when only 5 lines contain `[auth]`? Give two fixes.
<details><summary>Answer</summary>

`[auth]` is a character class meaning "a, u, t or h", and every line has one of those letters. Fixes: `grep -c '\[auth\]'` or `grep -cF '[auth]'`. Both return 5.
</details>

**GI7.** `bad_ips.txt` lists `10.0.0.5` and `203.0.113.9`. Count the lines in a log from those IPs, without also matching `10.0.0.50`.
<details><summary>Answer</summary>

```bash
grep -cwFf bad_ips.txt access.log
```
Without `-w`, `10.0.0.5` also matches `10.0.0.50`.
</details>

**GI8.** Print the lines that are ERROR **and** from the `[db]` component.
<details><summary>Answer</summary>

```bash
grep ERROR app.log | grep -F '[db]'
grep -E 'ERROR.*\[db\]' app.log                     # works because the order is fixed
grep -P '^(?=.*ERROR)(?=.*\[db\])' app.log          # order-independent
```
</details>

**GI9.** List the files under `src/` that do **not** contain TODO.
<details><summary>Answer</summary>

```bash
grep -rL TODO src
```
</details>

**GI10.** Show what grep's exit code is for a match, for no match, and for a missing file.
<details><summary>Answer</summary>

```bash
grep -q ERROR app.log;   echo $?   # 0
grep -q NOPE app.log;    echo $?   # 1
grep -q x nofile.txt;    echo $?   # 2 (and an error message)
grep -qs x nofile.txt;   echo $?   # 2 (message suppressed)
```
</details>

**GI11.** Find lines with a repeated word ("the the").
<details><summary>Answer</summary>

```bash
grep -E '\b([a-z]+) \1\b' file
```
</details>

**GI12.** `grep -c db app.log` prints 4. How many times does `db` actually occur?
<details><summary>Answer</summary>

```bash
grep -o db app.log | wc -l     # 7: "[db]" and "host=db-1" on the same lines
```
</details>

**GI13.** Print the line numbers of the ERROR lines as one comma-separated list.
<details><summary>Answer</summary>

```bash
grep -n ERROR app.log | cut -d: -f1 | paste -sd,     # 3,4,7,11
```
</details>

### 🟠 Advanced

**GA1.** Extract just the latency numbers (no `latency=`, no `ms`) in a single grep.
<details><summary>Answer</summary>

```bash
grep -oP 'latency=\K[0-9]+' app.log     # 120 950 80 95 85 10
```
</details>

**GA2.** Extract the order IDs using a lookbehind.
<details><summary>Answer</summary>

```bash
grep -oP '(?<=order=)\d+' app.log      # 1001 1002
```
</details>

**GA3.** Print the `[auth]` lines with `status=failed` using a **single** regex that doesn't depend on the order of the two terms.
<details><summary>Answer</summary>

```bash
grep -P '^(?=.*\[auth\])(?=.*status=failed)' app.log
```
</details>

**GA4.** Given `a "x" b "y"`, show the difference between greedy and lazy matching.
<details><summary>Answer</summary>

```bash
echo 'a "x" b "y"' | grep -oE '".*"'     # "x" b "y"
echo 'a "x" b "y"' | grep -oP '".*?"'    # "x"  then  "y"
echo 'a "x" b "y"' | grep -oE '"[^"]*"'  # portable lazy-equivalent: "x" then "y"
```
</details>

**GA5.** Match `retry=2` and the following `restored` line as **one** multi-line match.
<details><summary>Answer</summary>

```bash
grep -Pzo '(?s)retry=2\n[^\n]*restored[^\n]*' app.log | tr '\0' '\n'
```
</details>

**GA6.** Find AWS access key IDs anywhere under `src/`.
<details><summary>Answer</summary>

```bash
grep -rnE 'AKIA[0-9A-Z]{16}' src
# src/api/server.py:2:API_KEY = "AKIAABCDEFGHIJKLMNOP" ...
```
</details>

**GA7.** Under `set -euo pipefail`, `n=$(grep -c NOPE app.log)` kills the script. Why, and what's the fix?
<details><summary>Answer</summary>

When nothing matches, grep exits 1, and `set -e` treats that as a failure. (The output `0` is still printed, but the assignment's status is 1.) Fix: `n=$(grep -c NOPE app.log || true)`, or use `if grep -q`.
</details>

**GA8.** Search for the literal text `-v` in a file.
<details><summary>Answer</summary>

```bash
grep -e '-v' file
grep -- '-v' file
```
</details>

**GA9.** `grep ERROR bin.dat` prints `binary file matches`. Show the line, and then skip binaries in a recursive search instead.
<details><summary>Answer</summary>

```bash
grep -a ERROR bin.dat
grep -rI ERROR .
```
</details>

**GA10.** Why does `tail -f app.log | grep ERROR | awk '{print $4}'` show nothing for a long time? Fix it.
<details><summary>Answer</summary>

When grep's stdout is a pipe it block-buffers its output. Use `grep --line-buffered ERROR`.
</details>

**GA11.** Find the IPs that requested 3 or more non-existent pages (404), which suggests a scanner.
<details><summary>Answer</summary>

```bash
grep -E '" 404 ' access.log | grep -oE '^[^ ]+' | sort | uniq -c | awk '$1 >= 3 {print $2}'    # 203.0.113.9
```
</details>

### 🔴 Master

**GM1.** From `v1.2.3`, `1.0.0-rc.1`, `1.02.3`, `v2.0` and `10.20.30+build.5`, keep only the valid semver strings.
<details><summary>Answer</summary>

```bash
printf 'v1.2.3\n1.0.0-rc.1\n1.02.3\nv2.0\n10.20.30+build.5\n' |
  grep -E '^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'
# v1.2.3
# 1.0.0-rc.1
# 10.20.30+build.5
```
`1.02.3` fails because of the leading zero, and `v2.0` has only two parts.
</details>

**GM2.** Validate the format of `YYYY-MM-DD` dates. Why does `2026-02-30` still pass, and how do you catch it?
<details><summary>Answer</summary>

```bash
grep -E '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
```
A regex checks *shape*, not calendar rules. Validate with `date -d 2026-02-30 >/dev/null 2>&1 || echo invalid` (GNU date).
</details>

**GM3.** Extract the email addresses from `contact ops@example.com or sre.team+alerts@corp.example.io now`.
<details><summary>Answer</summary>

```bash
grep -oE '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
```
</details>

**GM4.** Find all files under the current directory with Windows line endings.
<details><summary>Answer</summary>

```bash
grep -rlI $'\r' .
```
</details>

**GM5.** Write `scan.sh`, a secret scanner that exits 1 when it finds AWS keys, private keys, GitHub tokens, or quoted `password`/`token`/`api_key` assignments, and skips `.git` and `node_modules`.
<details><summary>Answer</summary>

See section 4.2. Ask yourself why `const token = process.env.TOKEN;` is **not** flagged.
</details>

**GM6.** Search every commit in a repo's history for an AWS key that may have been "deleted".
<details><summary>Answer</summary>

```bash
git grep -n 'AKIA[0-9A-Z]\{16\}' $(git rev-list --all)
git log -G 'AKIA[0-9A-Z]{16}' --oneline -p
```
If you find one, **rotate the key**. Rewriting history doesn't un-leak it.
</details>

**GM7.** Pull the value of `"status"` out of a one-line JSON response with grep only (and say when this is acceptable).
<details><summary>Answer</summary>

```bash
echo '{"status": "ok", "code": 200}' | grep -oP '"status":\s*"\K[^"]+'    # ok
```
It's acceptable for quick health checks against a known, flat response. Use `jq -r .status` for anything nested or untrusted.
</details>

**GM8.** Print the 3 most common upper-case tokens (log levels, error codes) in `app.log`.
<details><summary>Answer</summary>

```bash
grep -oE '[[:upper:]]{4,}' app.log | sort | uniq -c | sort -rn | head -3
#   5 INFO
#   4 ERROR
#   2 WARN
```
</details>

---

## One-Liner Cheat Sheet

```bash
grep -rnI --exclude-dir={.git,node_modules} 'pattern' .   # the everyday code search
grep -c '' file                                           # line count (like wc -l)
grep -v '^\s*\(#\|$\)' file                               # strip comments and blank lines (GNU BRE)
grep -oE '[0-9]+(\.[0-9]+)?ms' app.log                    # all durations
grep -E '^[^:]+:[^:]*:0:' /etc/passwd                     # UID-0 accounts (security audit)
grep -E 'Failed password|Invalid user' /var/log/auth.log | grep -oE 'from [0-9.]+' | sort | uniq -c | sort -rn   # SSH brute force
grep -rL 'set -euo pipefail' --include='*.sh' .           # scripts missing strict mode
grep -rn 'latest' --include='*.yaml' k8s/                 # floating image tags
kubectl get events -A | grep -iE 'oom|backoff|failed'
docker logs app 2>&1 | grep -i --line-buffered -E 'error|exception'
grep -h '^[^#]' requirements*.txt | sort -u               # merge dependency lists
dmesg -T | grep -iE 'oom-killer|segfault|i/o error'
```

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
