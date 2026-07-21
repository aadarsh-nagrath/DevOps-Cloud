# Ansible

Agentless configuration management, application deployment, and orchestration tool — the overview and index for the Ansible notes in this folder.

---

## 1. What Is Ansible

Ansible is an open-source automation engine (originally by Michael DeHaan, now owned by Red Hat/IBM) used for:

- **Configuration management** — enforcing desired state on servers (packages, files, services, users).
- **Application deployment** — rolling out code, configs, and restarts across fleets of machines.
- **Orchestration** — coordinating multi-step, multi-host workflows (e.g., rolling upgrades, blue/green cutovers).
- **Provisioning** — bootstrapping VMs/cloud resources (weaker than Terraform here, but capable via cloud modules).

Ansible describes desired state in human-readable **YAML** (playbooks) and pushes that state out over **SSH** (or WinRM for Windows), with no persistent agent required on the target.

---

## 2. Agentless Architecture

```
+------------------+          SSH / WinRM           +------------------+
|  Control Node    |  ------------------------------>|  Managed Node 1  |
|  (ansible CLI,   |                                  |  (just needs     |
|   playbooks,     |  ------------------------------>|   Python + SSH)  |
|   inventory)     |                                  +------------------+
+------------------+          ------------------------>+------------------+
                                                          |  Managed Node N  |
                                                          +------------------+
```

- **Control node**: the machine where Ansible is installed and playbooks are run from. Must be Linux/macOS/WSL (no native Windows control node).
- **Managed node**: the target host. Requires only SSH access and a Python interpreter (no agent, no daemon, no open extra ports).
- Ansible connects over SSH, copies small Python scripts (modules) to the target, executes them, collects JSON results, then cleans up — this happens per task, per host.
- Because there's no persistent agent, there's nothing to keep patched, no agent-to-master handshake/cert to manage, and no extra open port beyond SSH (22).

---

## 3. Ansible vs Chef vs Puppet vs SaltStack

| Feature | Ansible | Chef | Puppet | SaltStack |
|---|---|---|---|---|
| Architecture | Agentless (SSH/WinRM) | Agent-based (or chef-solo) | Agent-based (agent + master) | Agent-based (minion + master), or agentless via SSH |
| Language | YAML (declarative-ish) | Ruby DSL | Puppet DSL (declarative) | YAML + Jinja (states), Python underneath |
| Learning curve | Low — YAML is approachable | Higher — real Ruby code | Medium — custom DSL | Medium |
| Push/Pull | Push (control node pushes to targets) by default; pull via `ansible-pull` | Pull (agent polls Chef server) | Pull (agent polls Puppet master, ~30 min cycles) | Push (ZeroMQ, near-instant) or pull |
| Master required | No (control node is not persistent infra) | Yes (Chef Server) | Yes (Puppet Master) | Yes (Salt Master), unless masterless |
| Speed at scale | Good, SSH overhead per host (mitigated by pipelining/forks) | Good (agents run locally) | Good (agents run locally) | Very fast (persistent ZeroMQ bus) |
| Idempotency | Yes, per-module | Yes | Yes, strongly enforced | Yes |
| Windows support | Yes (WinRM) | Yes | Yes | Yes |
| Typical fit | General automation, ad-hoc ops, mixed fleets, teams wanting fast onboarding | Large orgs already invested in Ruby, complex convergence logic | Enterprises wanting strict declarative state + strong reporting | Large-scale, event-driven, real-time infra automation |

**Why teams pick Ansible**: nothing to install on targets, YAML is easy to read/review in PRs, huge module ecosystem, works equally well for one-off ad-hoc commands and full orchestration.

---

## 4. Installation

```bash
# macOS
brew install ansible

# Debian/Ubuntu
sudo apt update && sudo apt install -y ansible

# RHEL/CentOS/Fedora
sudo dnf install -y ansible

# Via pip (any OS with Python, gives latest release, isolated via venv recommended)
python3 -m pip install --user ansible

# Verify
ansible --version
```

Managed nodes need only:
- SSH server running and reachable.
- A Python 3 interpreter present (Ansible auto-discovers it; see gotchas in [Advanced & Production Patterns](advanced-and-production-patterns.md)).

---

## 5. `ansible.cfg` — Configuration File

Ansible reads config in this precedence order (first found wins): `ANSIBLE_CONFIG` env var → `./ansible.cfg` (current dir) → `~/.ansible.cfg` → `/etc/ansible/ansible.cfg`.

```ini
# ansible.cfg
[defaults]
inventory      = ./inventory/hosts.ini   # default inventory file/dir
remote_user    = deploy                  # SSH user used unless overridden
host_key_checking = False                # skip known_hosts prompts (fine for ephemeral/lab, risky for prod)
retry_files_enabled = False              # don't write .retry files on failure
roles_path     = ./roles                 # where to look for roles
forks          = 10                      # parallel hosts processed at once (default 5)
timeout        = 30                      # SSH connection timeout in seconds
interpreter_python = auto_silent         # suppress interpreter-discovery warnings

[privilege_escalation]
become         = True                    # sudo by default
become_method  = sudo
become_user    = root
become_ask_pass = False

[ssh_connection]
pipelining     = True                    # fewer SSH ops per task, faster (see advanced notes)
control_path   = /tmp/ansible-ssh-%%h-%%p-%%r
```

Check effective config and where it's loaded from:
```bash
ansible-config view              # print the fully resolved config
ansible-config dump --only-changed   # show only settings that differ from defaults
```

---

## 6. Inventory Basics

Inventory tells Ansible which hosts exist and how to group them. Two formats — INI and YAML — describe the same thing.

### INI format
```ini
# inventory/hosts.ini
[web]
web1.example.com
web2.example.com ansible_host=10.0.1.12   # override the connection address

[db]
db1.example.com ansible_user=postgres ansible_port=2222

[web:vars]                  # vars applied to every host in the [web] group
http_port=8080

[prod:children]             # a group made of other groups
web
db
```

### YAML format
```yaml
# inventory/hosts.yml
all:
  children:
    web:
      hosts:
        web1.example.com:
        web2.example.com:
          ansible_host: 10.0.1.12
      vars:
        http_port: 8080
    db:
      hosts:
        db1.example.com:
          ansible_user: postgres
          ansible_port: 2222
    prod:
      children:
        web:
        db:
```

Full depth (dynamic inventory, cloud plugins, multi-env layouts) is in [Inventory & Dynamic Inventory](inventory-and-dynamic-inventory.md).

---

## 7. Ad-Hoc Commands

One-off tasks without writing a playbook — useful for quick checks and firefighting.

```bash
ansible all -m ping                                   # connectivity + Python check
ansible web -m command -a "uptime"                    # run a raw command
ansible web -m shell -a "df -h | grep /dev/sda1"      # shell needed for pipes/redirection
ansible db -m service -a "name=postgresql state=restarted" --become
ansible all -m setup                                  # dump gathered facts for every host
ansible web -m copy -a "src=./nginx.conf dest=/etc/nginx/nginx.conf" --become
ansible all -m package -a "name=curl state=present" --become
ansible web -i inventory/hosts.ini --limit "web1.example.com" -m ping   # target one host
ansible all -m ping --check                           # dry-run where the module supports it
```

Common flags: `-i <inventory>`, `-m <module>`, `-a "<args>"`, `-u <user>`, `-b`/`--become`, `-K` (ask become password), `-f <forks>`, `--limit`.

---

## 8. Core Concepts Glossary

| Term | Meaning |
|---|---|
| **Control node** | The machine running `ansible`/`ansible-playbook`. |
| **Managed node** | A target host being configured. |
| **Inventory** | The list of managed nodes and their groupings/variables. |
| **Module** | A unit of work (e.g., `copy`, `apt`, `service`) — small Python program shipped to the target and executed. |
| **Task** | A single module invocation with arguments, inside a play. |
| **Play** | Maps a group of hosts to a set of tasks/roles to run against them. |
| **Playbook** | A YAML file containing one or more plays — the top-level automation unit. |
| **Role** | A reusable, structured bundle of tasks/handlers/templates/vars/files for a piece of functionality. |
| **Facts** | Auto-discovered data about a managed node (OS, IP, memory, etc.), gathered via the `setup` module. |
| **Handler** | A task that only runs when notified by another task (typically service restarts). |
| **Idempotency** | Running the same playbook repeatedly produces the same end state without unintended side effects — a core Ansible design goal enforced per-module. |
| **Become** | Privilege escalation (like `sudo`) to run tasks as another user. |
| **Vault** | Ansible's built-in encryption for secrets in variables/files. |
| **Collection** | A distributable package of roles, modules, plugins, and playbooks. |

---

## 9. Notes in This Folder

| File | Covers |
|---|---|
| [Playbooks & Modules](playbooks-and-modules.md) | Playbook YAML syntax, tasks, handlers, common modules, conditionals, loops, tags, blocks, error handling, idempotency |
| [Variables & Templating](variables-and-templating.md) | Variable precedence, group_vars/host_vars, facts, Jinja2 deep dive, magic variables |
| [Roles & Collections](roles-and-collections.md) | Role structure, ansible-galaxy, role dependencies, import/include semantics, Collections, production project layout |
| [Inventory & Dynamic Inventory](inventory-and-dynamic-inventory.md) | Static/dynamic inventory, cloud inventory plugins, multi-environment layouts |
| [Vault & Security](vault-and-security.md) | ansible-vault workflows, vault IDs, CI/CD secrets integration, become/privilege escalation |
| [Testing & CI](testing-and-ci.md) | ansible-lint, yamllint, Molecule, check/diff mode, CI pipeline integration, version pinning |
| [Advanced & Production Patterns](advanced-and-production-patterns.md) | Performance tuning, ansible-pull, AWX/Tower/AAP, network automation, plugins, real-world gotchas |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
