# Chef

Ruby-based configuration management tool that turns infrastructure into code via a pull-based client-server (or masterless) model. This is the index file for all Chef notes in this folder.

---

## 1. What Is Chef

Chef is a configuration management and automation platform that describes infrastructure as Ruby code ("cookbooks"). A node (server, VM, container) runs an agent (`chef-client`) that pulls its configuration from a central server (or a local repo, in masterless mode), compares desired state vs. actual state, and converges the system to match the desired state.

Key properties:
- **Idempotent**: running the same cookbook twice produces the same result — resources check current state before acting.
- **Declarative-ish, but backed by imperative Ruby**: you write resources (declarative "what") inside recipes, which are plain Ruby files, so you have the full power of a real programming language (conditionals, loops, custom logic) available when the declarative primitives aren't enough.
- **Convention-driven repo layout**: cookbooks, roles, environments, data bags all live in predictable directories (`chef-repo`).

---

## 2. Architecture

Chef ships as several distinct components:

| Component | Role |
|---|---|
| **Chef Workstation** | Local dev machine tooling: `chef` CLI, `knife` CLI, Test Kitchen, ChefSpec, Cookstyle, InSpec — where you author and test cookbooks |
| **Chef Infra Server** | Central repository holding cookbooks, roles, environments, data bags, and node/client registration data (Erchef/PostgreSQL/Solr-backed) |
| **Chef Infra Client (`chef-client`)** | Agent installed on every managed node; runs periodically, pulls its run-list + cookbooks from the server, converges the node to desired state |
| **Ohai** | Detection tool bundled with chef-client that gathers system facts (IP, OS, CPU, memory, platform) into automatic attributes on every run |
| **Chef Solo / Chef Zero** | Masterless modes — run cookbooks straight from the local filesystem without a Chef Infra Server; Chef Zero spins up an in-memory Chef server for a run then discards it |

### Client-server flow (pull model)

```
 ┌────────────────────┐        1. chef-client run starts on a schedule/cron/systemd timer
 │   Managed Node      │────────────────────────────────────────────┐
 │  (chef-client)      │                                            │
 └─────────┬──────────┘                                            │
           │ 2. Ohai gathers facts (automatic attributes)           │
           ▼                                                       ▼
 ┌────────────────────┐   3. authenticates with client key,   ┌───────────────┐
 │  Build node object  │   requests its run-list + cookbooks    │ Chef Infra    │
 │  (facts + run-list) │◄───────────────────────────────────────┤ Server        │
 └─────────┬──────────┘   4. server resolves cookbook deps      └───────────────┘
           │              (via environment cookbook_versions)
           ▼
 ┌────────────────────┐
 │  Compile phase      │  5. loads recipes, builds in-memory resource collection
 └─────────┬──────────┘
           ▼
 ┌────────────────────┐
 │  Converge phase     │  6. executes each resource, only changing what's needed
 └─────────┬──────────┘
           ▼
 ┌────────────────────┐
 │  Report + exception  │ 7. optional handlers ship run data to reporting/monitoring
 │  handlers            │
 └────────────────────┘
```

The node **pulls** its configuration — it initiates the connection to the server on its own schedule. Nothing is pushed to it on demand (unlike Ansible, which pushes over SSH).

---

## 3. Chef vs. Ansible vs. Puppet — Push vs. Pull

| Aspect | Chef | Ansible | Puppet |
|---|---|---|---|
| Model | **Pull** — chef-client polls the server on an interval | **Push** — control node SSHes out and runs modules on demand | **Pull** — puppet agent polls the Puppet Server on an interval |
| Agent required | Yes (chef-client) unless using Chef Solo/Zero (masterless) | No (agentless, just needs SSH + Python) | Yes (puppet agent) unless using `puppet apply` masterless |
| Language | Ruby DSL (full Ruby available) | YAML | Puppet DSL (declarative, not a general-purpose language) |
| Execution order | Two-phase: compile then converge (see [advanced-and-production-patterns.md](advanced-and-production-patterns.md)) | Top-to-bottom, task by task | Compiles a full dependency graph, then applies (non-linear by default) |
| Best fit | Complex, code-heavy infra logic; teams comfortable with Ruby | Ad hoc orchestration, agentless simplicity, quick onboarding | Strong desired-state guarantees, large fleets with strict compliance |
| Convergence | Continuous (interval-driven daemon) | On-demand only (unless using AWX/Tower schedules) | Continuous (interval-driven daemon) |

Chef's pull model means drift correction happens automatically on every scheduled run without anyone triggering it — the trade-off is you need infrastructure to run and secure the Chef Infra Server (or lean on masterless mode).

---

## 4. Installing Chef Workstation

```bash
# macOS
brew install --cask chef-workstation

# Linux (Debian/Ubuntu) - via the omnitruck installer script
curl -L https://omnitruck.chef.io/install.sh | sudo bash -s -- -P chef-workstation

# Verify installation
chef --version
knife --version
kitchen --version
```

Chef Workstation bundles: `chef` (cookbook generator, cookbook exec), `knife` (server/node management CLI), `kitchen` (Test Kitchen), `chefspec`/`rspec`, `cookstyle` (linter), and `inspec`.

---

## 5. Core Concepts Glossary

| Term | Definition |
|---|---|
| **Cookbook** | The fundamental unit of configuration distribution — a directory containing recipes, attributes, templates, files, custom resources, and metadata |
| **Recipe** | A Ruby file (`recipes/*.rb`) that declares a list of resources to converge; the smallest unit you add to a run-list |
| **Resource** | A statement of desired state for one piece of the system (a package installed, a file present, a service running) |
| **Provider** | The platform-specific code that knows *how* to achieve a resource's desired state (e.g., the `apt_package` provider vs. `yum_package` provider both back the `package` resource) |
| **Run-list** | An ordered list of recipes and/or roles assigned to a node, defining what gets applied on each chef-client run |
| **Node object** | The JSON representation of a managed machine on the Chef Infra Server: its run-list, attributes (automatic + custom), and metadata |
| **Ohai** | The system-profiling library bundled with chef-client that populates automatic attributes every run |
| **Attribute** | A setting/value associated with a node, with a strict precedence order (see [attributes-and-templates.md](attributes-and-templates.md)) |
| **Data bag** | A global, cookbook-independent store of structured JSON data on the Chef Infra Server (optionally encrypted) |
| **Role** | A reusable named bundle of a run-list + default/override attributes, applied to nodes that share a function |
| **Environment** | A named tier (dev/staging/prod) that pins cookbook version constraints and environment-scoped attribute overrides |
| **Policyfile** | The modern replacement for roles + environments + Berkshelf — a single file pinning exact cookbook versions and run-list per policy group |
| **chef-repo** | The top-level directory structure holding cookbooks/, roles/, environments/, data_bags/ that you version-control |
| **knife** | The CLI for talking to a Chef Infra Server — bootstrapping nodes, uploading cookbooks, managing roles/environments/data bags |
| **Chef Solo / Chef Zero** | Masterless execution modes that run cookbooks from local disk without a real Chef Infra Server |

---

## 6. chef-repo Layout (Quick Preview)

```
chef-repo/
├── .chef/                 # knife.rb / config.rb + private keys (never commit keys!)
├── cookbooks/             # all cookbooks live here
├── data_bags/             # global JSON data, optionally encrypted
├── roles/                 # role definitions (.rb or .json)
├── environments/          # environment definitions (.rb or .json)
└── policyfiles/           # Policyfile.rb + generated Policyfile.lock.json
```

Full breakdown of cookbook internals is in [cookbooks-and-recipes.md](cookbooks-and-recipes.md).

---

## 7. Table of Contents

| File | Covers |
|---|---|
| [chef.md](chef.md) | This file — overview, architecture, glossary |
| [cookbooks-and-recipes.md](cookbooks-and-recipes.md) | Cookbook structure, recipes, resources deep dive, notifications, custom resources |
| [attributes-and-templates.md](attributes-and-templates.md) | Attribute precedence, Ohai, ERB templates, data bags, search API |
| [roles-environments-and-orgs.md](roles-environments-and-orgs.md) | Roles, environments, knife CLI, Policyfiles |
| [testing-and-dev-workflow.md](testing-and-dev-workflow.md) | Test Kitchen, ChefSpec, InSpec, Berkshelf, Cookstyle, local dev loop |
| [advanced-and-production-patterns.md](advanced-and-production-patterns.md) | Compile vs. converge phases, library helpers, handlers, HA, CI/CD, gotchas |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
