# Puppet

Declarative, model-driven configuration management: define the desired end-state of a system and let Puppet's agent converge nodes toward it on a recurring schedule.

---

## 1. What Puppet Is

Puppet is a **declarative** configuration management tool: you describe *what* the end state of a machine should look like (a package installed, a service running, a file with specific contents), not the imperative steps to get there. Puppet's agent compares the described state against the current state of the system and only makes changes where drift exists — this is the core of **idempotency**.

Key characteristics:
- **Declarative DSL** (`.pp` manifest files), not a general-purpose scripting language.
- **Model + simulate + enforce** workflow: Puppet builds a model (the *catalog*) of the target state, can simulate changes (`--noop`), then enforces them.
- **Pull-based by default**: agents check in with a master (or run standalone) on an interval, rather than a controller pushing changes out on demand.
- Written in Ruby (agent and legacy server); Puppet Server runs on the JVM (JRuby) for performance.

---

## 2. Architecture: Agent/Master vs Standalone

### Client-Server (Agent/Master) mode
```
 ┌────────────┐   1. Sends facts (facter)    ┌────────────┐
 │ Puppet      │ ───────────────────────────▶ │ Puppet      │
 │ Agent       │                              │ Server      │
 │ (node)      │ ◀─────────────────────────── │ (master)    │
 └────────────┘   2. Returns compiled catalog └────────────┘
        │                                            │
        │ 3. Applies catalog locally,                │ compiles catalog from:
        │    reports back results                    │  - manifests (site.pp, modules)
        ▼                                            │  - Hiera data
 ┌────────────┐                                       │  - facts from the agent
 │ System      │                                      ▼
 │ state       │                              ┌────────────┐
 └────────────┘                              │ PuppetDB    │ (facts, catalogs, reports)
                                              └────────────┘
```
- Agents run on a schedule (default **every 30 minutes**), pulling their catalog from the master, applying it, and reporting results.
- The master (Puppet Server) never pushes to nodes uninvited — nodes initiate the connection (pull model), which scales well and works through NAT/firewalls (agent only needs outbound 8140/TCP).
- Authentication is via a PKI/certificate system: each agent has a cert signed by the master's CA.

### Standalone mode (`puppet apply`)
No master required — a single node compiles and applies its own manifest locally:
```bash
# Apply a manifest directly on the local machine, no server needed
puppet apply /etc/puppetlabs/code/environments/production/manifests/site.pp

# Dry run (no changes made, just show what would happen)
puppet apply --noop site.pp
```
Common for masterless setups, ephemeral CI runners, bootstrapping, or small fleets managed via `r10k` + cron/systemd-timer pulling manifests from git and applying locally.

---

## 3. Puppet vs Ansible vs Chef

| Aspect | Puppet | Ansible | Chef |
|---|---|---|---|
| Model | Declarative DSL, compiled to a **catalog** | Declarative-ish YAML playbooks, procedural execution order | Imperative Ruby DSL ("recipes"), but idempotent resources |
| Execution model | **Pull**-based agent, scheduled runs (default 30 min) | **Push**-based, ad-hoc or scheduled via cron/AWX/Tower | Pull-based agent (chef-client) similar to Puppet |
| Agent required | Yes (or masterless `puppet apply`) | No agent — SSH/WinRM only | Yes (chef-client), or `chef-solo`/`chef-zero` |
| Language | Custom Ruby-like DSL (`.pp`) | YAML | Pure Ruby |
| Idempotency | Built into resource abstraction layer (RAL) | Built into modules, but easier to write non-idempotent tasks | Built into resources, Ruby gives more escape hatches |
| Data separation | Hiera | group_vars/host_vars | Data bags, roles/environments |
| Best fit | Large, long-lived server fleets needing strict drift enforcement | Ad-hoc orchestration, agentless environments, quick wins | Ruby-heavy shops wanting full programming power |

Puppet's defining trait vs. both: **catalog compilation** — before anything is applied, Puppet compiles the *entire* set of resources for a node into a static catalog (a dependency-ordered graph), validates it, and only then applies it. This catches conflicts (e.g., duplicate resource declarations) before touching the system, unlike Ansible/Chef which largely execute top-to-bottom as they go.

---

## 4. Installation

### Puppet Server + Puppet Agent (agent/master)
```bash
# On the master (Debian/Ubuntu example, from Puppet's apt repo)
curl -O https://apt.puppet.labs/puppet7-release-focal.deb
sudo dpkg -i puppet7-release-focal.deb
sudo apt update
sudo apt install -y puppetserver

# Tune JVM heap for Puppet Server (JRuby needs real memory)
sudo vi /etc/default/puppetserver     # set JAVA_ARGS="-Xms2g -Xmx2g"
sudo systemctl enable --now puppetserver

# On each agent node
sudo apt install -y puppet-agent
sudo /opt/puppetlabs/bin/puppet config set server puppet-master.example.com --section main

# First run: generates a cert signing request (CSR) and sends it to the master
sudo /opt/puppetlabs/bin/puppet agent --test

# On the master: list and sign pending certificate requests
sudo /opt/puppetlabs/bin/puppetserver ca list
sudo /opt/puppetlabs/bin/puppetserver ca sign --certname agent01.example.com
```

### Standalone (no master)
```bash
sudo apt install -y puppet-agent
sudo /opt/puppetlabs/bin/puppet apply my_manifest.pp
```

### Puppet Bolt (agentless, ad-hoc)
For one-off tasks and orchestration without installing a persistent agent — connects over SSH/WinRM like Ansible:
```bash
brew install puppetlabs/puppet/puppet-bolt      # macOS
# or: apt install puppet-bolt

bolt command run 'uptime' --targets ssh://web01.example.com
bolt task run package name=nginx action=install --targets web01.example.com
```
See [Nodes, Environments, Roles & Profiles](nodes-environments-and-roles-profiles.md#4-puppet-bolt-orchestration--ad-hoc-tasks) for Bolt inventory, tasks, and plans in depth.

---

## 5. Core Concepts Glossary

| Term | Definition |
|---|---|
| **Manifest** | A `.pp` file containing Puppet DSL code that declares resources. `site.pp` is the entry point. |
| **Resource** | The fundamental unit of configuration — a single thing to manage (a package, file, service, user, etc.), declared with a type, title, and attributes. |
| **Class** | A named, reusable block of Puppet code grouping related resources; included into a node's catalog with `include`. |
| **Module** | A self-contained, shareable directory of manifests, templates, files, and metadata implementing a piece of functionality (e.g., the `puppetlabs-apache` module). |
| **Catalog** | The compiled, node-specific, dependency-ordered set of resources that the agent will enforce. Compiled once per run from manifests + facts + Hiera data. |
| **Facter** | Puppet's fact-gathering tool; returns system facts (OS, IP, memory, hostname, custom facts) used to make manifests conditional/dynamic. |
| **Fact** | A discrete piece of system information from Facter, e.g. `$facts['os']['family']`, `$facts['networking']['ip']`. |
| **RAL (Resource Abstraction Layer)** | Puppet's abstraction between *what* a resource should look like (declared in DSL) and *how* to make it so on a given OS (implemented by a **provider**, e.g. `apt` vs `yum` provider for the `package` type). |
| **Provider** | The OS/tool-specific implementation backing a resource type (e.g., the `package` type has `apt`, `yum`, `dnf`, `chocolatey` providers). |
| **Node** | A managed machine — identified in Puppet by its certname (usually the FQDN). |
| **Environment** | An isolated set of manifests/modules/data (e.g. `production`, `staging`) that a node can be pinned to. |
| **Hiera** | Puppet's built-in hierarchical key/value data lookup system, separating data from code. |
| **ENC** | External Node Classifier — a script/service that tells Puppet which classes/parameters apply to a node, external to `site.pp`. |
| **PuppetDB** | Stores facts, catalogs, and reports; enables exported resources and `puppet query`. |

---

## 6. Contents of This Folder

| File | Covers |
|---|---|
| [puppet.md](puppet.md) | This file — overview, architecture, installation, glossary |
| [manifests-and-resources.md](manifests-and-resources.md) | DSL syntax, resource types, metaparameters, relationships, conditionals, idempotency |
| [classes-modules-and-templates.md](classes-modules-and-templates.md) | Classes, modules, Puppet Forge, r10k/Code Manager, ERB/EPP templates, defined types |
| [hiera-and-data.md](hiera-and-data.md) | Hiera hierarchy, backends, automatic parameter lookup, `lookup()`, hiera-eyaml |
| [nodes-environments-and-roles-profiles.md](nodes-environments-and-roles-profiles.md) | Node classification, ENC, environments/control-repo, roles & profiles pattern, Puppet Bolt |
| [testing-and-ci.md](testing-and-ci.md) | rspec-puppet, puppet-lint/PDK, Litmus/Test Kitchen, `--noop`, CI pipeline example |
| [advanced-and-production-patterns.md](advanced-and-production-patterns.md) | Catalog compilation internals, PuppetDB & exported resources, scaling Puppet Server, common gotchas |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
