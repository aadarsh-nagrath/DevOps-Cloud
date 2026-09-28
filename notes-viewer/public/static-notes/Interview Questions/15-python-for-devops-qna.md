# Python for DevOps — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Companies increasingly ask DevOps candidates to write real Python — not just Bash — for automation, cloud SDK work (`boto3`), and tooling. Pairs with [Linux & Shell Scripting](./01-linux-and-scripting-qna.md) and [Practical Scripting Challenges](./18-practical-scripting-challenges-qna.md). Grouped **Junior → Mid → Senior**.

---

## Table of Contents
- [Junior Level (0–2 yrs)](#junior-level-02-yrs)
- [Mid Level (2–5 yrs)](#mid-level-25-yrs)
- [Senior Level (5+ yrs)](#senior-level-5-yrs)

---

## Junior Level (0–2 yrs)

### 1. Why has Python become so common in DevOps tooling, alongside Bash?
Python offers real data structures (lists, dicts, classes), proper error handling (`try`/`except`), a huge standard library plus a massive ecosystem of third-party packages (cloud SDKs, HTTP clients, YAML/JSON parsing), and is far more maintainable than Bash once a script grows past a simple sequence of commands. Bash remains better for quick, glue-level shell command orchestration; Python is generally preferred once a task needs real logic, error handling, or API/SDK interaction — most infrastructure tools themselves (Ansible, much of the AWS CLI ecosystem, `pytest`-based test suites) are written in Python for exactly this reason.

### 2. How do you run a shell command from within a Python script, and what's the modern recommended way?
The `subprocess` module is the modern standard: `subprocess.run(["ls", "-la"], capture_output=True, text=True, check=True)` runs a command, captures stdout/stderr as text, and raises `CalledProcessError` automatically if it exits non-zero (`check=True`). Older approaches (`os.system`, `os.popen`) are discouraged — they either give no easy access to output, or (especially `os.system` with string commands built from variables) are a shell-injection risk if any part of the command incorporates untrusted input.

### 3. What's the difference between passing a command to `subprocess.run` as a list vs. as a string with `shell=True`?
Passing a list (`["ls", "-la", path]`) runs the program directly without invoking a shell — safer, since arguments aren't subject to shell interpretation/injection, and works correctly even if `path` contains spaces or special characters. Passing a string with `shell=True` invokes an actual shell to parse and run it, enabling shell features (pipes, globbing) but reintroducing shell-injection risk if any part of that string is built from untrusted/external input — the list form without `shell=True` is the recommended default unless you specifically need shell features.

### 4. How do you read and parse a JSON file in Python?
```python
import json
with open("config.json") as f:
    data = json.load(f)
print(data["key"])
```
`json.load(file_object)` parses from an open file; `json.loads(string)` parses from a string already in memory. `json.dump(data, file_object)` / `json.dumps(data)` do the reverse (serialize back to JSON).

### 5. How do you parse a YAML file in Python, and why isn't YAML support in the standard library?
YAML isn't in Python's standard library, so you install a third-party package — `PyYAML` (`import yaml`) is the most common:
```python
import yaml
with open("config.yaml") as f:
    data = yaml.safe_load(f)
```
Use `yaml.safe_load` (not the plain `yaml.load`) by default — `safe_load` restricts parsing to basic Python types, while plain `load` can, depending on the loader, construct arbitrary Python objects from the YAML content, which is a genuine code-execution risk when parsing YAML from an untrusted source.

### 6. What's the difference between a Python list and a dictionary, and when do you use each?
A list is an ordered, index-accessed collection (`servers[0]`), used when order matters or you just need a simple sequence. A dictionary is an unordered (technically insertion-ordered since Python 3.7+) key-value mapping (`config["region"]`), used when you need to look values up by a meaningful name/key rather than position — the vast majority of parsed JSON/YAML configuration naturally becomes nested dicts and lists.

### 7. How do you handle exceptions in Python, and why not just let a script crash on error?
```python
try:
    response = requests.get(url, timeout=5)
    response.raise_for_status()
except requests.exceptions.RequestException as e:
    print(f"Request failed: {e}")
    sys.exit(1)
```
Explicit exception handling lets a script fail gracefully with a clear, actionable error message and a meaningful exit code, rather than dumping a raw traceback that's harder to act on in an automated pipeline — and lets you distinguish recoverable conditions (retry a flaky network call) from truly fatal ones (missing required configuration) instead of treating every failure identically.

### 8. What is a virtual environment (`venv`), and why is it important for Python automation scripts?
A virtual environment is an isolated Python installation with its own independently-installed packages, separate from the system Python and from other projects' virtual environments. It prevents dependency conflicts between different scripts/projects needing different (possibly incompatible) versions of the same package, and avoids polluting or depending on the system-wide Python installation, which other unrelated tools on the same machine may also depend on. `python -m venv .venv` creates one; `pip install -r requirements.txt` (after activating it) installs pinned dependencies reproducibly.

### 9. How do you accept and parse command-line arguments in a Python script?
The standard library's `argparse` module:
```python
import argparse
parser = argparse.ArgumentParser(description="Deploy a service")
parser.add_argument("--env", required=True, choices=["dev", "staging", "prod"])
parser.add_argument("--dry-run", action="store_true")
args = parser.parse_args()
```
This automatically generates `--help` output, validates required arguments and allowed choices, and gives clear errors for malformed input — far more robust than manually parsing `sys.argv`.

### 10. What is `pip`, and what's the purpose of a `requirements.txt` file?
`pip` is Python's package installer, fetching packages from PyPI (or a private index). `requirements.txt` lists a project's dependencies (ideally pinned to exact versions, e.g. `requests==2.31.0`) so `pip install -r requirements.txt` reproducibly installs the same dependency versions across different machines/environments — without pinning, "works on my machine" bugs from different installed versions become a real risk, the same underlying problem dependency lockfiles solve in other ecosystems.

---

## Mid Level (2–5 yrs)

### 11. How do you use `boto3` to interact with AWS, and how does it typically get its credentials?
`boto3` is the official AWS SDK for Python. A basic example:
```python
import boto3
ec2 = boto3.client("ec2", region_name="us-east-1")
instances = ec2.describe_instances()
```
By default, `boto3` resolves credentials through a well-defined chain: explicit parameters in code (discouraged — hardcoding credentials), environment variables (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`), the shared `~/.aws/credentials` file, and — the recommended approach for code running *on* AWS infrastructure — an IAM role attached to the EC2 instance/Lambda/ECS task/EKS pod (via instance profile or IAM Roles for Service Accounts), which needs no stored credentials at all and rotates automatically.

### 12. What's the difference between `boto3`'s `client` and `resource` interfaces?
The `client` interface is a low-level, direct mapping to the AWS API — every operation and every response field matches the API exactly, giving full control but requiring more verbose code (`response["Reservations"][0]["Instances"][0]["InstanceId"]`). The `resource` interface is a higher-level, more Pythonic, object-oriented abstraction over the same APIs (`instance.id`, `bucket.objects.all()`) — more convenient for common tasks, but not every AWS service has a `resource` interface (many newer services only expose `client`), and it's often considered on a slower update cadence than `client`, so production tooling frequently uses `client` directly for anything beyond simple cases.

### 13. How would you make an HTTP API call with retries and a timeout in Python, and why does a naive `requests.get(url)` call risk hanging a script indefinitely?
`requests.get(url)` with no `timeout` argument will, by default, wait indefinitely for a response if the server never responds (as opposed to actively refusing the connection) — a single unresponsive dependency can hang an entire automation script/pipeline step forever with no visible error. Always pass an explicit `timeout=`, and use a retry strategy for transient failures:
```python
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

session = requests.Session()
retries = Retry(total=3, backoff_factor=1, status_forcelist=[502, 503, 504])
session.mount("https://", HTTPAdapter(max_retries=retries))
response = session.get(url, timeout=10)
```

### 14. How do you write a simple unit test for a Python automation script, and what's the role of mocking?
`pytest` is the de facto standard testing framework. For automation code that calls external systems (AWS APIs, a subprocess, an HTTP endpoint), you generally don't want tests to actually make real calls — slow, flaky, requires real credentials/infrastructure, and can have real side effects. **Mocking** (`unittest.mock`, or `moto` specifically for mocking `boto3`/AWS calls) replaces the real external call with a controlled fake that returns predetermined responses, letting you test your own logic (does the script correctly handle a given API response, does it retry on failure) in complete isolation from the real external dependency.

### 15. What's the difference between a Python script using `print()` for output vs. using the `logging` module, and why does it matter for production automation?
`print()` sends everything to stdout unconditionally, with no severity levels, no timestamps, and no easy way to control verbosity or redirect output differently based on context. The `logging` module provides severity levels (`DEBUG`/`INFO`/`WARNING`/`ERROR`/`CRITICAL`), configurable output destinations (console, file, a log aggregation system), consistent formatting (timestamps, module names), and the ability to change verbosity at runtime without editing code — essential for any automation script that will run unattended in production, where you need structured, filterable output rather than an undifferentiated stream of `print()` statements.

### 16. How would you safely handle secrets (API keys, passwords) needed by a Python automation script?
Never hardcode them in source code. Read them from environment variables (`os.environ["API_KEY"]`, ideally with a clear error if missing rather than a silent `None`), or better, fetch them at runtime from a dedicated secrets manager (`boto3` client for AWS Secrets Manager, the `hvac` library for HashiCorp Vault) — and ensure secrets are never accidentally logged (a common real bug: logging an entire config dict or API request/response that happens to include a credential field) or written to a file that isn't properly access-controlled.

### 17. What's the difference between a Python script that's "idempotent" and one that isn't, and why does this matter for infrastructure automation specifically?
An idempotent script produces the same end state regardless of how many times it's run (checking "does this resource already exist / is this already in the desired state" before acting, rather than blindly performing an action every time). This matters enormously for infrastructure automation because scripts are frequently re-run (after a partial failure, as part of a scheduled job, re-triggered in CI) — a non-idempotent script that, say, unconditionally creates a new resource every run will accumulate duplicate resources over repeated runs, while an idempotent one safely converges to the same correct state no matter how many times or in what order it's invoked.

### 18. How do you package a Python automation script/tool so it can be easily installed and run by others, rather than shared as a raw `.py` file?
Define a `pyproject.toml` (the modern standard, superseding `setup.py` for most new projects) declaring the package's metadata and dependencies, structure the code as an importable package, and optionally define console-script entry points so installing it (`pip install .`, or publishing to an internal/PyPI index) gives users a proper command-line tool (`mytool deploy --env prod`) rather than needing to know to run `python script.py` with the right working directory and manually-installed dependencies.

---

## Senior Level (5+ yrs)

### 19. Design a Python-based CLI tool that wraps common infrastructure operations (e.g. deploying a service, rotating a credential) for use by many teams. What design choices matter for making it safe and maintainable at scale?
Structure it as a real installable package (not a loose collection of scripts) with a proper CLI framework (`argparse`/`click`/`typer`) providing consistent help text, subcommands, and input validation across every operation. Build in a `--dry-run` mode for any state-changing operation as a first-class, consistently-implemented feature (not an afterthought bolted onto one command) so users can safely preview impact before committing. Centralize cross-cutting concerns (authentication/credential resolution, structured logging, consistent error handling/exit codes, retry logic for transient failures) in shared internal library code used by every subcommand, rather than each command reimplementing them slightly differently. Version and publish it through an internal package index with semantic versioning, and add automated tests (including tests against a mocked/sandboxed version of any real infrastructure API it touches) as a required CI gate before any release — treating the tool with the same engineering rigor as a production service, since a bug in a widely-used internal deployment/ops tool can have blast radius across every team that depends on it.

### 20. How would you diagnose and fix a Python automation script that works fine for small inputs but becomes extremely slow or memory-hungry at production scale (e.g. processing millions of log lines or API results)?
Profile before optimizing blindly — `cProfile`/`py-spy` for CPU time, `tracemalloc`/`memory_profiler` for memory — to find the actual bottleneck rather than guessing, since intuition about "what's slow" in Python is frequently wrong. Common real culprits at scale: loading an entire large dataset into memory at once instead of streaming/processing incrementally (reading a huge file line-by-line or in chunks instead of `.read()`-ing it whole; using a generator instead of building a full list in memory); making API calls one-at-a-time in a loop instead of using available batch/pagination APIs (`boto3` operations frequently support pagination via paginators specifically to avoid this); and inefficient data structures (repeatedly searching a list — O(n) per lookup — where a `set`/`dict` would give O(1) lookup). For genuinely CPU-bound work (not I/O-bound, which benefits more from concurrency/async), consider whether Python is even the right tool for that specific hot path, or whether it should call out to a faster compiled implementation for just that piece — but this optimization work should always follow actual profiling data, not precede it.

### 21. What's your approach to deciding when a piece of infrastructure automation should be a Python script vs. a proper Terraform/Ansible construct vs. a small standalone service?
Terraform/Ansible are purpose-built for *declarative, idempotent state management* of infrastructure/configuration and should be preferred whenever the task genuinely fits that model — reaching for a hand-rolled Python script to manage infrastructure state that a mature IaC tool already handles well (with drift detection, a proper execution plan, community-tested providers/modules) usually means reinventing a worse, less-tested version of functionality that already exists. Python scripting is the better fit for **imperative, one-off, or complex-logic** automation that doesn't map cleanly to a declarative model — a migration script, a custom validation/reporting tool, gluing together multiple APIs with conditional logic that IaC tools express awkwardly, or the actual implementation *behind* a Terraform provisioner or Ansible module when neither's built-in capabilities suffice. A standalone, persistently-running service is warranted once the automation needs to react continuously to events in real time (a webhook receiver, a controller reconciling state on an ongoing basis) rather than running as a one-shot or scheduled task — at that point it has different operational requirements entirely (uptime, its own deployment/monitoring, likely its own on-call ownership) that a script invoked by cron or a CI job doesn't carry, and that distinction should genuinely drive the architecture choice, not just which language the author happens to be most comfortable in.
