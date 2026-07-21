# Advanced & Production Patterns

Performance tuning, error handling at scale, ansible-pull, AWX/Tower/AAP, network automation, plugins, and real-world gotchas.

---

## 1. Performance Tuning

### Forks
Controls how many hosts Ansible processes in parallel per task (default: 5 — usually too low for large fleets).
```ini
# ansible.cfg
[defaults]
forks = 50
```
```bash
ansible-playbook site.yml --forks 50
```
Higher forks = more parallel SSH connections = faster runs, bounded by control node CPU/memory/file descriptors and target-side load.

### Pipelining
Reduces the number of SSH operations per task by executing modules over a single connection instead of copying-then-executing separately.
```ini
[ssh_connection]
pipelining = True
```
Requires `requiretty` to be disabled in `/etc/sudoers` on managed nodes (`Defaults !requiretty` or removing the line), otherwise sudo will refuse non-interactive execution over the pipelined connection.

### SSH multiplexing / ControlPersist
Reuses a single SSH TCP connection across multiple tasks instead of reconnecting every time — one of the biggest speed wins available.
```ini
[ssh_connection]
control_path = /tmp/ansible-ssh-%%h-%%p-%%r
ssh_args = -o ControlMaster=auto -o ControlPersist=60s
```

### Fact caching
Avoid re-gathering facts (a slow, per-host operation) on every run.
```ini
[defaults]
gathering = smart
fact_caching = jsonfile
fact_caching_connection = /tmp/ansible_facts_cache
fact_caching_timeout = 86400
```
For multi-user/CI environments, a shared backend works better than local jsonfile:
```ini
[defaults]
fact_caching = redis
fact_caching_connection = localhost:6379:0
fact_caching_timeout = 3600
```
Requires `pip install redis` on the control node and a reachable Redis instance.

### Strategy plugins
| Strategy | Behavior |
|---|---|
| `linear` (default) | All hosts complete each task before any host moves to the next task — safest, most predictable |
| `free` | Each host runs through the whole play as fast as it can, independent of other hosts — much faster for heterogeneous/large fleets, but output ordering is non-deterministic and you lose "all hosts in lockstep" guarantees |
| `debug` | Drops into an interactive debugger on task failure — useful when developing/troubleshooting a playbook |

```yaml
- hosts: web
  strategy: free      # or set globally: [defaults] strategy = free in ansible.cfg
  tasks: ...
```

Combine `forks` + `pipelining` + `ControlPersist` + `strategy: free` for the biggest realistic speedup on large inventories; measure with `ANSIBLE_CALLBACKS_ENABLED=timer ansible-playbook ...` (or the `profile_tasks` callback) to see per-task timing.

---

## 2. Error Handling Patterns at Scale

```yaml
- hosts: web
  max_fail_percentage: 20     # abort the whole play if more than 20% of hosts fail a task
  serial: "10%"                # rolling batches - only touch 10% of hosts at a time (canary-style rollout)
  tasks:
    - name: Deploy release
      block:
        - ansible.builtin.include_tasks: deploy.yml
      rescue:
        - ansible.builtin.include_tasks: rollback.yml
      always:
        - ansible.builtin.include_tasks: notify.yml
```

- `serial` combined with `max_fail_percentage` gives a basic canary/rolling-deploy safety net: deploy to a small batch first, halt automatically if failures exceed the threshold, before touching the rest of the fleet.
- `any_errors_fatal: true` makes a single host's failure abort the entire play immediately, across all hosts — useful when a shared dependency step (e.g., "provision the load balancer") must succeed everywhere or not proceed at all.
- Use `ignore_errors: true` sparingly and always pair it with `register` + a later explicit check — silently swallowing errors hides real problems.

---

## 3. `ansible-pull` — Masterless Pull-Based Config

Instead of a control node pushing to targets over SSH, each managed node pulls and applies its own configuration from a git repo — useful for large fleets, autoscaling groups, or environments where inbound SSH from a central control node isn't desirable.

```bash
# Run on the managed node itself (often via cron or systemd timer)
ansible-pull -U https://github.com/org/ansible-repo.git -C main local.yml
```
```bash
# Typical cron entry on each node
*/30 * * * * ansible-pull -U https://github.com/org/ansible-repo.git local.yml >> /var/log/ansible-pull.log 2>&1
```

Trade-offs vs push: no need for the control node to reach every host over SSH (great for ephemeral cloud instances that bootstrap themselves at launch via `ansible-pull` in cloud-init), but harder to get a single "this run finished across the whole fleet" signal, and secrets distribution (vault password) still needs a solution on every node.

---

## 4. AWX / Ansible Tower / Ansible Automation Platform (AAP)

AWX is the open-source upstream project; **Ansible Tower** was Red Hat's commercial product built on it; **Ansible Automation Platform (AAP)** is the current Red Hat commercial offering (Tower is effectively superseded by AAP).

Core concepts:

| Concept | Purpose |
|---|---|
| **Job Template** | A saved, reusable definition: which playbook, which inventory, which credentials, extra vars — click "Launch" or trigger via API/webhook |
| **Workflow** | Chains multiple job templates together (including conditional branches on success/failure) into one orchestrated pipeline |
| **Survey** | A form presented to a user launching a job template, capturing input vars (e.g., "which version to deploy?") without editing YAML |
| **Credentials** | Centrally stored SSH keys, vault passwords, cloud API creds — injected into jobs without ever exposing raw secrets to the end user launching them |
| **RBAC** | Role-based access control — teams/users granted specific permissions (e.g., "can launch job template X" without "can edit inventory") |
| **Execution Environments** | Container images bundling Ansible + collections + Python deps, ensuring consistent, reproducible execution per project |
| **Scheduling** | Cron-like recurring job template runs, e.g. nightly compliance scans |

Why teams adopt AWX/AAP over raw CLI+cron: centralized audit log of every run (who launched what, with what vars, what changed), a UI non-engineers can safely use via Surveys, and RBAC preventing broad prod access.

---

## 5. Ansible for Network Devices (Brief)

Ansible manages network gear (Cisco IOS/NX-OS, Juniper, Arista) via collections rather than raw SSH-and-Python (most network OSes don't run Python):

```yaml
- hosts: switches
  gather_facts: false               # network devices need network-specific fact modules instead
  connection: network_cli            # or netconf/httpapi depending on the platform
  tasks:
    - name: Gather network facts
      cisco.ios.ios_facts:

    - name: Configure a VLAN
      cisco.ios.ios_vlans:
        config:
          - vlan_id: 100
            name: app-tier
        state: merged
```
`connection: network_cli` (or `ansible_connection: network_cli` in inventory) replaces the normal SSH+Python execution model since there's no Python interpreter on the device itself; modules speak the device's CLI/API directly instead of pushing a Python script.

---

## 6. Callback Plugins

Hook into Ansible's execution lifecycle (task start, play end, stats, etc.) to customize output or integrate with external systems.

```ini
# ansible.cfg
[defaults]
callbacks_enabled = ansible.posix.profile_tasks, community.general.slack
```
```yaml
# example: send a Slack notification on play completion via a callback whitelist entry
# (requires community.general and SLACK_TOKEN/SLACK_WEBHOOK_URL env vars or config)
```
Common built-in/community callbacks: `profile_tasks` (per-task timing, essential for perf tuning), `timer` (total run time), `json`/`yaml` (machine-readable output for pipelines), `slack`/`mail` (notifications).

---

## 7. Custom Modules & Filter Plugins (Basics)

### Minimal custom module
```python
#!/usr/bin/env python
# library/my_module.py
from ansible.module_utils.basic import AnsibleModule

def main():
    module = AnsibleModule(argument_spec=dict(
        name=dict(type="str", required=True),
    ))
    result = dict(changed=False, message=f"Hello {module.params['name']}")
    module.exit_json(**result)

if __name__ == "__main__":
    main()
```
Place under `library/` next to the playbook (or `roles/<role>/library/`) and it's usable immediately as `my_module:` with no extra registration.

### Custom filter plugin
```python
# filter_plugins/custom_filters.py
def to_slug(value):
    return value.lower().replace(" ", "-")

class FilterModule(object):
    def filters(self):
        return {"to_slug": to_slug}
```
```jinja2
{{ "My App Name" | to_slug }}   {# -> my-app-name #}
```
Custom modules/filters are the escape hatch when no existing module/collection covers a need — keep them small and well-tested, since they bypass the Ansible community's own idempotency/check-mode guarantees unless you implement those yourself.

---

## 8. Common Real-World Gotchas

| Gotcha | Symptom | Fix |
|---|---|---|
| **SSH multiplexing / ControlPersist not configured** | Every task pays full SSH handshake cost — runs are much slower than they should be | Set `ControlMaster=auto`, `ControlPersist=60s` in `ssh_args`, enable `pipelining = True` |
| **become password prompt hangs in CI** | Job hangs indefinitely with no output, eventually times out | Configure passwordless sudo (`NOPASSWD`) for the automation user on managed nodes; never rely on `--ask-become-pass` in a non-interactive pipeline |
| **Fact gathering slowness on large inventories** | `gather_facts` step alone takes minutes across hundreds of hosts | Enable fact caching (`jsonfile`/`redis`), raise `forks`, or set `gather_facts: false` + `gather_subset: min` when full facts aren't needed |
| **Python interpreter discovery issues on modern distros** | `"Failed to find required executable python"` or discovers wrong Python (e.g. Python 2 on old Debian, or the wrong venv) | Pin explicitly: `ansible_python_interpreter: /usr/bin/python3` in inventory/group_vars, or set `interpreter_python = auto_silent` and verify with `ansible host -m setup -a "filter=ansible_python*"` |
| **`host_key_checking` prompts blocking automation** | First connection to a new host hangs asking to confirm the SSH fingerprint | Set `host_key_checking = False` in `ansible.cfg` for ephemeral/lab infra (accept the tradeoff), or pre-populate `known_hosts` properly for anything security-sensitive |
| **`command`/`shell` breaking idempotency** | Playbook reports `changed` on every run even though nothing actually changed | Add `creates:`/`removes:` args, or `register` + `changed_when` to make the report accurate |
| **Vault password prompt hangs in CI** | Same class of issue as become — pipeline stalls waiting for input | Always use `--vault-password-file` pointing at a file or executable script, never `--ask-vault-pass` in CI |
| **Inconsistent collection/role versions across machines** | "Works on my machine" playbook failures | Pin everything in `requirements.yml`, install via CI before every run, never rely on whatever happens to be globally installed |
| **Serial/rolling deploys with shared state** | A `serial` batch deploy fails partway, leaving a fleet in mixed old/new version state indefinitely | Combine `serial` + `max_fail_percentage` + a rollback `rescue` block so partial failures are handled explicitly, not left dangling |
| **Long-running `async` tasks blocking playbook completion** | A task that legitimately takes 10+ minutes (e.g. a big migration) times out or blocks all other progress | Use `async: <seconds>` + `poll: 0` to fire-and-forget, then `async_status:` + `until:`/`retries:` to poll for completion later in the play |

---

See [Testing & CI](testing-and-ci.md) for catching idempotency and become/vault CI issues before they reach production, and [Inventory & Dynamic Inventory](inventory-and-dynamic-inventory.md) for inventory-scale considerations feeding into the fact-gathering and forks tuning above.

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
