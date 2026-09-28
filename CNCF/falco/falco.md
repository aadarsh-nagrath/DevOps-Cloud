# Falco — Complete Notes

## 1. Beginner

### What is Falco?
- Open-source **runtime security / threat detection** engine for containers, Kubernetes, and Linux hosts. Originally built at Sysdig, donated to CNCF, **graduated** in 2022.
- Solves a problem that's fundamentally different from admission control: it answers **"what is actually happening on this system right now"**, not "should this deployment be allowed to be created." Falco watches live kernel activity and flags behavior that looks malicious or anomalous, in real time, as it happens.
- Named after Falco the peregrine falcon — fast detection of things flying where they shouldn't.

### The Core Problem It Solves
```
Admission control (Kyverno, OPA/Gatekeeper) answers:
  "Is this Pod spec allowed to be created?"  <-- checked ONCE, at deploy time

Falco answers:
  "A shell was just spawned inside a running 'payment-api' container
   that has never spawned a shell before — is that expected?"  <-- checked
   CONTINUOUSLY, for the life of the workload

Attack timeline without runtime detection:
  [Pod deployed, passes all policy checks] --> [weeks later, app gets compromised
  via a vulnerable dependency] --> [attacker spawns a shell, reads secrets,
  opens a reverse connection] --> nothing sees this happen --> discovered
  months later, if ever

With Falco running:
  [Pod deployed] --> [compromised] --> [attacker spawns shell] --> Falco alert
  fires within milliseconds, before the attacker gets far
```
This is why Falco and admission controllers are **complementary, not competing** — a perfectly-configured Pod spec (least privilege, read-only root filesystem, no privileged flag) can still get exploited through the application itself; Falco is the layer that catches what happens *after* that.

### Core Concepts
| Term | Meaning |
|---|---|
| **Syscall** | A request a process makes to the Linux kernel (open a file, exec a process, make a network connection) — Falco's entire detection surface is built on observing these |
| **eBPF probe** | The modern way Falco taps the kernel's syscall stream — safe, verified in-kernel programs (see [Cilium notes](../cilium/cilium.md) for more on eBPF generally) |
| **Kernel module driver** | The older way Falco taps syscalls — a loadable kernel module (`falco.ko`); still supported but eBPF is now the default/preferred driver |
| **Rule** | A condition + output format that defines what to detect and how to report it |
| **Macro** | A named, reusable condition fragment referenced inside rules — keeps rule definitions DRY |
| **List** | A named, reusable set of values (e.g., a list of trusted binary names) referenced inside rules/macros |
| **Priority** | Severity level of a rule (`emergency` down to `debug`) — controls alert urgency and routing |
| **Falcosidekick** | A companion service that fans Falco's alerts out to Slack, PagerDuty, webhooks, SIEMs, etc. |

### Architecture
```
                    Linux Kernel
                         |
              syscalls happen constantly
                         |
                         v
          +-----------------------------+
          |     eBPF probe (or kmod)     |  <-- taps the raw syscall stream
          +-----------------------------+
                         |
                         v
          +-----------------------------+
          |          Falco engine        |
          |  - parses syscall events     |
          |  - enriches with container/  |
          |    k8s metadata              |
          |  - evaluates against loaded  |
          |    rules (rules.yaml)        |
          +-----------------------------+
                         |
             match found -> alert
                         |
        +----------------+----------------+
        v                v                 v
    stdout/log        gRPC output      Falcosidekick
    (simplest)      (for integrations)  -> Slack/PagerDuty/
                                            webhook/SIEM/etc.
```
- Falco runs **once per node** (kernel syscalls are per-host, not per-pod), enriches each syscall event with container and Kubernetes metadata (pod name, namespace, image) by talking to the container runtime and the Kubernetes API, then evaluates the event against the loaded rule set.

### Basic Rule Example
```yaml
- rule: Terminal shell in container
  desc: A shell was used as the entrypoint/exec point into a container
  condition: >
    spawned_process and container
    and shell_procs and proc.tty != 0
    and container.id != host
  output: >
    A shell was spawned in a container
    (user=%user.name container_id=%container.id container_name=%container.name
    shell=%proc.name parent=%proc.pname cmdline=%proc.cmdline)
  priority: WARNING
  tags: [container, shell, mitre_execution]
```
This is (a simplified version of) one of Falco's actual default rules — it fires the instant `bash`, `sh`, `zsh`, etc. is spawned with an interactive TTY inside any container.

---

## 2. Intermediate

### Rules, Macros, and Lists in Depth
```yaml
# A list: reusable set of values
- list: shell_binaries
  items: [bash, sh, zsh, ksh, csh, tcsh, dash]

# A macro: reusable condition fragment
- macro: shell_procs
  condition: proc.name in (shell_binaries)

- macro: spawned_process
  condition: evt.type = execve and evt.dir = <

# A rule composing both
- rule: Shell spawned in container (custom)
  desc: Detect any shell spawned inside a container, excluding known debug pods
  condition: >
    spawned_process
    and container
    and shell_procs
    and not k8s.ns.name = "debug-tools"
  output: >
    Shell spawned in container (user=%user.name command=%proc.cmdline
    container=%container.name namespace=%k8s.ns.name pod=%k8s.pod.name)
  priority: WARNING
```
This is exactly how you'd customize Falco in practice — reuse the built-in macros/lists (`shell_procs`, `spawned_process`, etc. all ship in Falco's default rule file) and layer exceptions (`and not k8s.ns.name = "debug-tools"`) rather than writing detection logic from scratch.

### Default Rule Set — What It Catches Out of the Box
Falco ships with `falco_rules.yaml` containing dozens of rules covering common attacker behavior:

| Category | Example default rule |
|---|---|
| Shell access | "Terminal shell in container" — interactive shell spawned inside a container |
| Filesystem tampering | "Write below etc" — any write under `/etc` inside a container |
| Privilege escalation | "Change thread namespace" / "Non sudo setuid" |
| Suspicious network | "Unexpected outbound connection" to a port/destination not in an allowed list |
| Package management | "Launch package management process in container" — `apt`, `yum`, `apk` run inside a running container (usually means someone is live-patching a compromised container) |
| Sensitive file reads | "Read sensitive file untrusted" — reading `/etc/shadow` or similar from an unexpected process |
| Container drift | "Drop and execute new binary in container" — a binary appears and runs that wasn't in the original image |

### Output and Alerting Options
```yaml
# falco.yaml (main config)
stdout_output:
  enabled: true

file_output:
  enabled: true
  filename: /var/log/falco/events.log

grpc_output:
  enabled: true

http_output:
  enabled: true
  url: "http://falcosidekick:2801"
```
| Output | Use case |
|---|---|
| **stdout** | Simplest — good for local testing, container logs, log aggregators reading stdout |
| **File** | Persistent local log |
| **gRPC** | Structured, programmatic consumption — feeds `falcoctl`, custom integrations |
| **HTTP/webhook (Falcosidekick)** | Fan-out to dozens of destinations: Slack, Teams, PagerDuty, Elasticsearch, Loki, S3, SIEM tools — the standard way to operationalize Falco alerts beyond "look at logs" |

### Falco in Kubernetes — DaemonSet Deployment
Falco must run on **every node** because syscalls are host-level events — there's no way to observe them from a central place. Helm install:
```bash
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm repo update

helm install falco falcosecurity/falco \
  --namespace falco --create-namespace \
  --set driver.kind=ebpf \
  --set falcosidekick.enabled=true
```
This deploys Falco as a `DaemonSet` (one pod per node, with access to the host's kernel via the eBPF probe, mounted with elevated privileges/`hostPID` to see container processes) plus, optionally, Falcosidekick as a separate Deployment for alert fan-out.

---

## 3. Advanced

### Falco vs Admission Controllers (Kyverno / OPA Gatekeeper) — Genuinely Different Layers
| Aspect | Admission Controller (Kyverno, OPA/Gatekeeper) | Falco |
|---|---|---|
| **When it acts** | At the Kubernetes API server, before an object is persisted (`kubectl apply` time) | Continuously, for the entire runtime lifetime of the workload |
| **What it sees** | The declared spec (YAML) of the resource | Actual kernel-level behavior (syscalls) — what the process really does, regardless of what the spec claimed |
| **Can it stop a deploy with a bad spec?** | Yes — that's its whole job | No — it doesn't gate deployment at all |
| **Can it catch a compromised app doing something unexpected at 3am?** | No — it already approved the spec once, it has no visibility after that | Yes — this is its whole job |
| **Typical question answered** | "Does this Pod run as root / mount the host filesystem / lack resource limits?" | "Is this specific running container doing something it's never done before?" |

See [Kyverno notes](../../IaC%20Testing%20and%20Policy%20as%20Code/kyverno.md) for the admission-control side of this pairing. In a mature security posture, both layers run together: Kyverno/Gatekeeper reduces the attack surface at deploy time (deny privileged containers, require read-only root FS, etc.), Falco catches what still gets through despite that (0-days in dependencies, supply-chain compromise, insider misuse).

### Performance Considerations
- The eBPF driver has materially lower overhead than the older kernel-module driver and doesn't require compiling/loading a `.ko` file matched to the exact kernel version — this is why eBPF is now the default.
- Rule evaluation happens per-syscall-event, so an overly broad rule set (or rules with expensive conditions evaluated on very hot syscalls like `open`/`read`) can add measurable CPU load on busy nodes — tune by disabling unused default rules and avoiding rules on extremely high-frequency syscalls unless necessary.
- Falco supports **rate limiting** per rule (`rate` conditions with sliding windows via `evttype` counters) to avoid alert storms from a single noisy source.

### Rule Tuning and False Positive Management
- Real production rollouts almost always start noisy — legitimate tooling (debug sidecars, package installers in init containers, CI runners) trips default rules constantly.
- Standard approach: run Falco in **detection-only/log mode** first, review a week of alerts, then add targeted exceptions (like the `debug-tools` namespace exclusion above) rather than disabling whole rule categories.
- `falcoctl` (the companion CLI) manages rule and plugin distribution — pulling curated/versioned rule bundles from an OCI registry rather than hand-maintaining one giant YAML file.

### Falco Plugins
- Falco's detection surface extends beyond syscalls via a **plugin system** — plugins can feed Falco events from cloud provider audit logs (AWS CloudTrail, Okta, GitHub audit log) and evaluate them with the same rule engine, unifying "what happened on this host" with "what happened in my cloud account" under one detection pipeline.

### Common Failure Modes / Debugging
| Symptom | Likely cause |
|---|---|
| No alerts ever fire | Driver not loaded correctly — check `falco --version` output and pod logs for probe load errors; confirm `hostPID`/privileged access is actually granted in the DaemonSet spec |
| Falco pod CrashLoopBackOff on a specific node | Kernel version mismatch for the (legacy) kernel-module driver — switch to the eBPF driver, which is far more portable |
| Massive alert volume, unusable | Default rule set running unfiltered against normal cluster activity (CI runners, package installs in build pods) — needs the tuning pass described above |
| Alerts missing Kubernetes metadata (no pod/namespace name) | Falco can't reach the Kubernetes API or container runtime socket — check RBAC and the mounted container runtime socket path |

---

## Quick Revision — Falco

- Runtime security: watches live kernel syscalls via an eBPF probe (or legacy kernel module), evaluates them against rules in real time.
- Fundamentally different layer from admission control (Kyverno/OPA Gatekeeper) — Falco detects what's *actually happening*, continuously, not what a spec *declares* at deploy time. Complementary, not competing — see [Kyverno notes](../../IaC%20Testing%20and%20Policy%20as%20Code/kyverno.md).
- Rules = condition + output; built from reusable **macros** and **lists** — customize by composing existing ones, not rewriting from scratch.
- Default rule set catches: shell-in-container, writes under `/etc`, privilege escalation, unexpected outbound connections, package managers run inside live containers, sensitive file reads.
- Runs as a **DaemonSet, one pod per node** — syscalls are host-level, there's no central vantage point.
- Output options: stdout, file, gRPC, and **Falcosidekick** for fan-out to Slack/PagerDuty/SIEM/etc.
- eBPF driver is the modern default — lower overhead, no kernel-version-specific compiled module needed.
- Expect false-positive tuning as a real, ongoing operational task — start in log-only mode, tune before alerting on-call.
- `falcoctl` manages versioned rule/plugin distribution via OCI registries.
- Plugins extend detection beyond syscalls to cloud audit logs (CloudTrail, etc.) under the same rule engine.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
