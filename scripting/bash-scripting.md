# Bash Scripting

Core reference for writing robust Bash scripts — syntax, variables, control flow, functions, and error handling. Paired with [Shell Scripting for DevOps](shell-scripting-devops.md) for real-world automation examples.

---

## 1. Script Basics

### Shebang
Every script should start with a shebang so it runs with the intended interpreter regardless of how it's invoked:
```bash
#!/usr/bin/env bash
```
Prefer `#!/usr/bin/env bash` over `#!/bin/bash` — it resolves `bash` from `PATH`, which is more portable across systems (e.g., macOS where `/bin/bash` is an old 3.2).

### Making a script executable
```bash
chmod +x script.sh
./script.sh
```

### Running with explicit interpreter (no chmod needed)
```bash
bash script.sh
sh script.sh   # runs under POSIX sh semantics, not full bash
```

---

## 2. Variables

```bash
name="DevOps"
echo "Hello, $name"
echo "Hello, ${name}"      # braces avoid ambiguity, e.g. ${name}_prod
```

- No spaces around `=` when assigning.
- Variables are untyped strings by default; use `declare -i` for integers.
- **Always quote variable expansions** (`"$var"`) to prevent word-splitting and globbing bugs — this is the single most common source of bash bugs.

### Variable scope
```bash
GLOBAL_VAR="visible everywhere"

my_func() {
  local LOCAL_VAR="only inside this function"
}
```
Always use `local` inside functions unless you intentionally want to leak into global scope.

### Readonly / constants
```bash
readonly MAX_RETRIES=5
```

### Environment variables
```bash
export API_KEY="secret"     # available to child processes
echo "$HOME" "$USER" "$PWD" "$PATH"
```

### Default values / parameter expansion
```bash
echo "${NAME:-default}"      # use "default" if NAME unset or empty
echo "${NAME:=default}"      # same, but also assigns NAME=default
echo "${NAME:?error msg}"    # exit with error msg if NAME unset
echo "${NAME:+alt}"          # use "alt" only if NAME is set
```

### String manipulation
```bash
str="Hello-World"
echo "${#str}"          # length -> 11
echo "${str,,}"          # lowercase -> hello-world
echo "${str^^}"          # uppercase -> HELLO-WORLD
echo "${str/World/Bash}" # replace first match -> Hello-Bash
echo "${str//o/0}"       # replace all matches -> Hell0-W0rld
echo "${str%-World}"     # strip suffix -> Hello
echo "${str#Hello-}"     # strip prefix -> World
```

---

## 3. Command-Line Arguments

```bash
#!/usr/bin/env bash
echo "Script name: $0"
echo "First arg:   $1"
echo "All args:    $@"
echo "Arg count:   $#"
echo "Exit status of last command: $?"
echo "PID of script: $$"
```

- `"$@"` expands each argument as a separate quoted word (correct for passing args through) — prefer this over `$*`, which joins all args into a single word.

### Parsing flags with `getopts`
```bash
while getopts "n:e:h" opt; do
  case $opt in
    n) name="$OPTARG" ;;
    e) env="$OPTARG" ;;
    h) echo "Usage: $0 -n <name> -e <env>"; exit 0 ;;
    \?) echo "Invalid option: -$OPTARG" >&2; exit 1 ;;
  esac
done
```
Usage: `./script.sh -n myapp -e prod`

---

## 4. Conditionals

```bash
if [ "$env" == "prod" ]; then
  echo "Production deployment"
elif [ "$env" == "staging" ]; then
  echo "Staging deployment"
else
  echo "Unknown environment"
fi
```

Prefer `[[ ]]` (bash builtin, supports regex/pattern matching, no word-splitting surprises) over `[ ]` (POSIX test):
```bash
if [[ "$env" =~ ^(prod|staging)$ ]]; then
  echo "Valid environment"
fi
```

### Common test operators
| Test | Meaning |
|---|---|
| `-z "$s"` | string is empty |
| `-n "$s"` | string is non-empty |
| `"$a" == "$b"` | string equality |
| `-eq -ne -lt -le -gt -ge` | numeric comparisons |
| `-f file` | file exists and is a regular file |
| `-d dir` | directory exists |
| `-e path` | path exists (any type) |
| `-x file` | file is executable |
| `-r file` / `-w file` | file is readable / writable |
| `-s file` | file exists and is non-empty |

### Logical operators
```bash
if [[ -f "$file" && -x "$file" ]]; then ...
if [[ "$a" == "x" || "$b" == "y" ]]; then ...
command1 && command2   # run command2 only if command1 succeeds
command1 || command2   # run command2 only if command1 fails
```

---

## 5. Loops

### For loop
```bash
for i in 1 2 3 4 5; do
  echo "Number: $i"
done

for i in {1..10}; do echo "$i"; done
for i in {1..10..2}; do echo "$i"; done   # step by 2

for file in *.log; do
  echo "Processing $file"
done

# C-style
for ((i=0; i<5; i++)); do
  echo "$i"
done
```

### While loop
```bash
count=0
while [[ $count -lt 5 ]]; do
  echo "$count"
  ((count++))
done

# Read a file line by line (preferred pattern — preserves whitespace, avoids subshell issues)
while IFS= read -r line; do
  echo "Line: $line"
done < input.txt
```

### Until loop
```bash
count=0
until [[ $count -ge 5 ]]; do
  echo "$count"
  ((count++))
done
```

### Loop control
```bash
for i in {1..10}; do
  [[ $i -eq 3 ]] && continue   # skip iteration
  [[ $i -eq 7 ]] && break       # exit loop
  echo "$i"
done
```

---

## 6. Functions

```bash
greet() {
  local name="$1"
  echo "Hello, $name"
}
greet "DevOps"

# Return values via exit status (0-255) or stdout
is_even() {
  (( $1 % 2 == 0 ))   # returns 0 (true) or 1 (false) as exit status
}
if is_even 4; then echo "even"; fi

get_version() {
  echo "1.2.3"    # "return" a value by echoing and capturing it
}
version=$(get_version)
```

---

## 7. Arrays

```bash
arr=("apple" "banana" "cherry")
echo "${arr[0]}"         # apple
echo "${arr[@]}"         # all elements
echo "${#arr[@]}"        # length -> 3
arr+=("date")            # append

for item in "${arr[@]}"; do
  echo "$item"
done

# Associative arrays (bash 4+)
declare -A env_map
env_map["dev"]="10.0.0.1"
env_map["prod"]="10.0.0.2"
for key in "${!env_map[@]}"; do
  echo "$key -> ${env_map[$key]}"
done
```

---

## 8. Command Substitution & Pipes

```bash
today=$(date +%Y-%m-%d)          # preferred over legacy backticks `date`
files=$(ls *.txt | wc -l)

cat access.log | grep "ERROR" | sort | uniq -c | sort -rn | head -5
```

Avoid unnecessary `cat` piping ("useless use of cat") when the command accepts a file argument directly:
```bash
grep "ERROR" access.log   # instead of: cat access.log | grep "ERROR"
```

---

## 9. Error Handling

### Strict mode (put this near the top of every serious script)
```bash
set -euo pipefail
```
- `-e`: exit immediately if any command fails (non-zero exit).
- `-u`: error on use of an unset variable.
- `-o pipefail`: a pipeline's exit status is the last non-zero exit code (not just the last command's).

Combine with `IFS=$'\n\t'` to avoid unexpected word-splitting on spaces:
```bash
set -euo pipefail
IFS=$'\n\t'
```

### Checking exit codes explicitly
```bash
if ! command; then
  echo "Command failed" >&2
  exit 1
fi

command
if [[ $? -ne 0 ]]; then
  echo "Command failed" >&2
  exit 1
fi
```

### trap — cleanup and signal handling
```bash
cleanup() {
  echo "Cleaning up temp files..."
  rm -f "$tmpfile"
}
trap cleanup EXIT              # runs on any script exit (success, error, or signal)
trap 'echo "Interrupted"; exit 130' INT   # Ctrl+C

tmpfile=$(mktemp)
```

### Custom error function
```bash
die() {
  echo "ERROR: $*" >&2
  exit 1
}
[[ -f "$config" ]] || die "Config file not found: $config"
```

### Debugging
```bash
bash -x script.sh        # trace every command as it executes
set -x                   # turn tracing on mid-script
set +x                   # turn it back off
```

---

## 10. Input/Output & Redirection

```bash
command > file.txt        # redirect stdout, overwrite
command >> file.txt        # redirect stdout, append
command 2> error.log       # redirect stderr
command &> all.log         # redirect both stdout and stderr
command > /dev/null 2>&1   # discard all output

read -p "Enter name: " name
read -sp "Enter password: " password; echo   # -s hides input

# Heredoc — multi-line input
cat <<EOF
Line 1
Line 2 with $variable
EOF

# Heredoc without variable expansion
cat <<'EOF'
$this is literal
EOF
```

---

## 11. Practical Patterns

### Idempotent directory setup
```bash
mkdir -p "$dir"          # -p: no error if it already exists, creates parents too
```

### Check if a command exists
```bash
if ! command -v docker &> /dev/null; then
  die "docker is required but not installed"
fi
```

### Safe script directory resolution
```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
```

### Argument validation template
```bash
#!/usr/bin/env bash
set -euo pipefail

usage() { echo "Usage: $0 <environment>"; exit 1; }
[[ $# -eq 1 ]] || usage

env="$1"
[[ "$env" =~ ^(dev|staging|prod)$ ]] || die "Invalid environment: $env"
```

---

## 12. Style & Best Practices

- Always quote variables: `"$var"`, not `$var`.
- Use `[[ ]]` over `[ ]` in bash-specific scripts.
- Use `set -euo pipefail` unless you have a specific reason not to.
- Prefer `$(...)` over legacy backtick command substitution.
- Use `local` for function-scoped variables.
- Name constants in `UPPER_CASE`, locals in `lower_case`.
- Lint scripts with [ShellCheck](https://www.shellcheck.net/) — catches quoting bugs, unused vars, and portability issues before they bite in production.
- Keep scripts single-purpose; compose small scripts rather than writing monoliths.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
