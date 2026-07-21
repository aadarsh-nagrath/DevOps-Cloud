# Nodes, Environments & Roles/Profiles

How Puppet decides which classes apply to which nodes, how environments isolate code, the roles-and-profiles design pattern, and Puppet Bolt for ad-hoc orchestration.

Back to [Puppet overview](puppet.md).

---

## 1. Node Classification

"Node classification" = deciding which classes/data apply to a given node. Puppet supports two mechanisms, often used together.

### `site.pp` node definitions
```puppet
# manifests/site.pp
node 'web01.prod.example.com' {
  include roles::webserver
}

node 'db01.prod.example.com' {
  include roles::db_primary
}

# Regex matching multiple nodes
node /^web\d+\.prod\.example\.com$/ {
  include roles::webserver
}

# Fallback for anything not explicitly matched
node default {
  include roles::base   # baseline hardening/monitoring/ntp applied to every node
}
```
Explicit per-node blocks in `site.pp` don't scale past a handful of hosts — they require a code change (and a git commit/PR) for every new node, and can't express "classify based on cloud tags" or "look up from a CMDB." Most production setups replace this with an **ENC**, or classify purely via facts + roles (see §3), keeping `site.pp` down to just:
```puppet
node default {
  include role   # 'role' resolves per-node via a fact + Hiera, see roles/profiles below
}
```

### External Node Classifiers (ENC)
An ENC is any executable that Puppet Server calls (per catalog compile) with the node's certname, returning YAML describing which classes and top-level (global) variables apply:
```bash
#!/usr/bin/env bash
# /etc/puppetlabs/puppet/enc.sh — a trivial ENC backed by a lookup service
# Puppet Server calls this passing the node's certname as $1, expects YAML on stdout
NODE="$1"
curl -s "https://cmdb.example.com/api/nodes/${NODE}/classification"
```
```yaml
# Example ENC output
classes:
  roles::webserver: {}
parameters:
  datacenter: us-east-1
environment: production
```
Configure it in `puppet.conf` on the master:
```ini
[master]
node_terminus = exec
external_nodes = /etc/puppetlabs/puppet/enc.sh
```
Common real ENCs: Puppet Enterprise's built-in node classifier (web UI + API, group-based rules on facts), Foreman, or a thin custom script backed by a CMDB/inventory system. An ENC's classes are merged with (and layered under/over, depending on config) `site.pp` node blocks.

---

## 2. Environments

A Puppet **environment** is an isolated set of manifests + modules + Hiera data — a full "version" of your entire codebase, most often mapped 1:1 to a git branch via r10k (see [classes-modules-and-templates.md](classes-modules-and-templates.md#4-r10k--code-manager)).

### Directory environments layout
```
/etc/puppetlabs/code/environments/
├── production/
│   ├── environment.conf
│   ├── manifests/site.pp
│   ├── modules/            # environment-specific + r10k-vendored modules
│   ├── data/
│   └── hiera.yaml
├── staging/
│   └── ...                 # same structure, different branch/content
└── feature_new_lb/
    └── ...                 # ephemeral environment for a feature branch, torn down after merge
```

### `environment.conf`
```ini
# environments/production/environment.conf
modulepath = modules:$basemodulepath   # search this env's modules/, then the shared basemodulepath
manifest = manifests/site.pp
environment_timeout = 0                # 0 = always recompile from disk; production usually caches (e.g. 3m)
```

### Pinning a node to an environment
```bash
# One-off override for a single agent run — useful for testing a feature branch
puppet agent --test --environment feature_new_lb

# Persistent pin, stored in the agent's config
puppet config set environment staging --section agent
```
Or, more commonly, environment is set by the ENC/classifier per-node so it's centrally controlled rather than left to each host's local config.

### The control-repo pattern (recap)
1. One git repo (`control-repo`), branches = environments.
2. `Puppetfile` in each branch pins Forge/git module versions for that environment.
3. r10k/Code Manager syncs branches → `/etc/puppetlabs/code/environments/<branch>/`.
4. Promote code prod-ward by merging `staging` → `production` (a normal git merge/PR), not by hand-editing on the master.

---

## 3. Roles & Profiles Pattern

The **roles and profiles** pattern is the de-facto standard way to organize Puppet code at any non-trivial scale. It exists to solve a specific problem: without it, `site.pp` node blocks accumulate long, duplicated, ad-hoc lists of `include` statements per node, and business logic ("this is a webserver") gets tangled with technology wiring ("here's how nginx is configured on this OS").

### The two layers

| Layer | Answers | Contains | Cardinality |
|---|---|---|---|
| **Profile** | "How do I configure *this technology* for us?" | Technology-specific class composition — wires together one or more Forge/vendor modules with our Hiera data, our conventions | One profile per technology/concern (`profile::nginx`, `profile::monitoring`, `profile::base`) |
| **Role** | "What *business function* does this node serve?" | Composition of profiles only — no resources of its own | One role per node (a node includes exactly one role) |

Rule of thumb: **modules** manage individual technologies generically (reusable across companies) → **profiles** wire modules together the way *your org* wants (site-specific, opinionated) → **roles** compose profiles into "what this machine's job is" → **node** gets exactly one role.

### Example file tree
```
site-modules/
├── profile/
│   └── manifests/
│       ├── base.pp           # profile::base     — ntp, users, monitoring agent, hardening
│       ├── nginx.pp          # profile::nginx     — wraps puppetlabs-nginx w/ our conventions
│       ├── app_server.pp     # profile::app_server— our app's runtime + config
│       └── mysql_primary.pp  # profile::mysql_primary
└── role/
    └── manifests/
        ├── webserver.pp      # role::webserver    — profile::base + profile::nginx + profile::app_server
        └── db_primary.pp     # role::db_primary   — profile::base + profile::mysql_primary
```

### Profile example
```puppet
# site-modules/profile/manifests/nginx.pp
class profile::nginx (
  Integer $worker_processes = 4,      # resolved via Hiera automatic parameter lookup
) {
  include ::nginx                     # the generic Forge/vendor module does the heavy lifting

  # Company-specific wiring on top of the generic module:
  nginx::vhost { $facts['fqdn']:
    port          => 80,
    document_root => '/var/www/app',
  }

  file { '/etc/nginx/conf.d/company-hardening.conf':
    ensure  => file,
    content => epp('profile/nginx-hardening.conf.epp'),
    require => Package['nginx'],
    notify  => Service['nginx'],
  }
}
```

### Role example
```puppet
# site-modules/role/manifests/webserver.pp
class role::webserver {
  # A role ONLY composes profiles — never declares raw resources directly.
  contain profile::base
  contain profile::nginx
  contain profile::app_server

  # 'contain' (not 'include') so ordering relationships placed on role::webserver
  # correctly apply to everything nested inside these profiles too.
  Class['profile::base'] -> Class['profile::nginx'] -> Class['profile::app_server']
}
```
```puppet
# site.pp becomes almost empty — classification reduces to "assign one role"
node default {
  include role   # 'role' itself resolves from Hiera per-node/per-fact, see below
}
```
```yaml
# data/nodes/web01.prod.example.com.yaml
role: role::webserver
```

### Why this pattern
- **Change isolation** — swapping the web server technology means editing `profile::nginx` (or writing `profile::apache` and repointing one role), never touching every node definition.
- **Testability** — profiles are the natural unit for rspec-puppet tests (see [testing-and-ci.md](testing-and-ci.md)); roles are thin enough to barely need testing beyond "does it contain the right profiles."
- **Reuse across roles** — `profile::base` is shared by every role without duplication.
- **Clean separation of "generic" vs "ours"** — vendor/Forge modules stay swappable and upgradable; profiles hold all org-specific opinions.

---

## 4. Puppet Bolt — Orchestration & Ad-Hoc Tasks

Bolt runs commands, scripts, tasks, and multi-step plans over SSH/WinRM (or via PCP against Puppet-agent-enrolled nodes) **without** requiring a persistent agent — useful for one-off remediation, orchestration across a fleet, or bootstrapping before Puppet itself is installed.

### `inventory.yaml`
```yaml
# inventory.yaml — defines named targets/groups, like an Ansible inventory
config:
  ssh:
    user: deploy
    private-key: ~/.ssh/id_bolt

groups:
  - name: webservers
    targets:
      - web01.example.com
      - web02.example.com
  - name: databases
    targets:
      - db01.example.com
    config:
      ssh:
        user: dbadmin   # per-group override of global config
```

### Running ad-hoc commands
```bash
# Run a raw shell command across a group
bolt command run 'systemctl status nginx' --targets webservers --inventoryfile inventory.yaml

# Run a script file
bolt script run ./check_disk.sh --targets webservers

# Run a packaged Bolt task (ships with modules, e.g. puppetlabs-package)
bolt task run package name=nginx action=status --targets webservers
```

### Tasks
A task is a single executable (any language) plus a JSON metadata file describing its parameters:
```
mymodule/
└── tasks/
    ├── restart_service.sh
    └── restart_service.json
```
```json
{
  "description": "Restart a systemd service",
  "parameters": {
    "service_name": { "type": "String", "description": "Name of the service" }
  }
}
```
```bash
bolt task run mymodule::restart_service service_name=nginx --targets webservers
```

### Plans — reusable multi-step orchestration
Plans are Puppet-language (or YAML) files that sequence multiple tasks/commands, handle failures, and orchestrate across targets — e.g., "drain node from load balancer, restart app, run smoke test, re-add to load balancer":
```puppet
# mymodule/plans/rolling_restart.pp
plan mymodule::rolling_restart (
  TargetSpec $targets,
) {
  $target_list = get_targets($targets)

  $target_list.each |$target| {
    run_task('mymodule::lb_drain', $target)
    run_task('mymodule::restart_service', $target, service_name => 'app')
    run_command('curl -sf localhost:8080/health', $target)
    run_task('mymodule::lb_add', $target)
  }
}
```
```bash
bolt plan run mymodule::rolling_restart targets=webservers
```
Bolt complements (not replaces) agent/master Puppet: use the agent/master pull model for continuous drift enforcement, and Bolt for imperative, one-time, ordered operations that don't fit the "converge to desired state" model (restarts, deployments, emergency fixes).

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
