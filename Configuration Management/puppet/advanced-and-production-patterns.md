# Advanced & Production Patterns

Catalog compilation internals, PuppetDB and exported resources, scaling Puppet Server, PE vs open source, and the gotchas that bite real fleets.

Back to [Puppet overview](puppet.md).

---

## 1. Catalog Compilation Deep Dive

A **catalog** is the fully-resolved, node-specific, dependency-ordered graph of resources that gets applied. Compilation happens once per agent run, entirely before any change is made to the system.

### The compile pipeline (agent/master)
```
1. Agent connects to master, sends its FACTS (from facter) over HTTPS (port 8140)
2. Master authenticates the agent via its signed certificate
3. Master determines the agent's ENVIRONMENT (from ENC, node config, or default)
4. Master's compiler:
     a. Parses site.pp -> determines classes for this node (node block / ENC / role)
     b. Evaluates each class body: resource declarations, conditionals branch based on FACTS
     c. Resolves class parameters via Hiera automatic parameter lookup (compile-time data)
     d. Builds the full resource graph, applies metaparameter relationships (before/require/notify/subscribe, -> ~>)
     e. Validates: no duplicate resource declarations, no dependency cycles
5. Master serializes the result as a CATALOG (JSON) and returns it to the agent
6. Agent applies the catalog LOCALLY:
     a. For each resource (in dependency order), the RAL provider checks current vs desired state
     b. Only resources with drift are changed
     c. Agent sends a REPORT (what changed, what failed) back to the master / PuppetDB
```

### Compile-time vs apply-time
This distinction trips up a lot of people:
- **Compile-time**: manifest logic, `if`/`case`, Hiera lookups, `$facts[...]` references — all evaluated ONCE on the master (or locally, for `puppet apply`) to produce the catalog. Nothing on the actual system has changed yet.
- **Apply-time**: the agent walks the already-compiled, static catalog and enforces it. No further manifest logic runs here — the catalog is just a fixed list of resources with attributes and relationships.

```puppet
# This exec's shell command runs at APPLY time (on the agent, against the real system)
exec { 'check-disk-space':
  command => '/usr/bin/df -h > /tmp/disk.txt',
}

# But the DECISION of whether this resource exists in the catalog at all
# was made at COMPILE time, based on a fact known before any command ran:
if $facts['memory']['system']['total_bytes'] > 8589934592 {
  exec { 'check-disk-space': command => '/usr/bin/df -h > /tmp/disk.txt' }
}
```
A common mistake: trying to make compile-time logic depend on apply-time results (e.g., "if this exec's output was X, then declare resource Y") — that's backwards; the catalog is already fixed by the time any exec runs. Multi-step, order-dependent apply logic that reacts to intermediate results belongs in Bolt plans or exec chains with guards, not manifest conditionals.

---

## 2. PuppetDB

PuppetDB is the storage and query backend for facts, catalogs, and reports — turning "what's out there" into queryable data instead of scattered log files.

### What it stores
| Data | Use |
|---|---|
| Facts | Every agent run's Facter output — queryable inventory ("all nodes with `os.family = RedHat`") |
| Catalogs | The compiled resource graph per node per run — diffing catalogs across runs |
| Reports | Per-run change/failure logs — dashboards, alerting on failed runs |
| Exported resources | Cross-node resource declarations (see below) |

### Querying PuppetDB (PQL / API)
```bash
# Find all nodes with a given fact value
puppet query 'inventory[certname] { facts.os.family = "RedHat" }'

# Via the HTTP API directly
curl -X GET http://puppetdb.example.com:8080/pdb/query/v4 \
  --data-urlencode 'query=["=", ["fact", "os.family"], "Debian"]'
```

### Exported Resources — cross-node resource sharing
Exported resources let one node **declare** a resource that another node **collects and realizes** — the classic use case is a web server "publishing" itself into a load balancer's config without the LB manifest needing to hardcode every web node.

```puppet
# On EACH web server node — export (declare with @@) rather than apply directly
@@haproxy::balancermember { $facts['networking']['fqdn']:
  listening_service => 'app_cluster',
  server_name       => $facts['networking']['hostname'],
  ipaddress         => $facts['networking']['ip'],
  port              => 8080,
}
# The '@@' means: don't apply this resource on THIS node — just store it in PuppetDB
# tagged so another node's collector can pick it up.
```
```puppet
# On the load balancer node — collect all exported balancermember resources
Haproxy::Balancermember <<| listening_service == 'app_cluster' |>>
# The '<<| |>>' spaceship/collector syntax pulls in every matching exported
# resource from PuppetDB and realizes (applies) it HERE, on the LB node.
```
This requires PuppetDB (exported resources are stored/queried there) — it does not work in pure `puppet apply` standalone mode without PuppetDB configured. Common real uses: dynamic load balancer pools, Nagios/monitoring host registration, SSH known_hosts distribution, NFS export lists.

| Syntax | Meaning |
|---|---|
| `@resource { }` | Virtual resource — declared but not applied unless later *realized* with `realize()` or a plain collector `Resource <\| \|>` (same-node only, no PuppetDB needed) |
| `@@resource { }` | Exported resource — declared, stored in PuppetDB, applied only where collected on another node |
| `<<\| \|>>` | Collector — pulls matching exported resources from PuppetDB and realizes them here |
| `<\| \|>` | Collector for virtual (non-exported) resources, same node only |

---

## 3. Puppet Server Performance & Scaling

Puppet Server runs on the JVM via JRuby — most tuning revolves around the JRuby interpreter pool and JVM heap.

```hocon
# /etc/puppetlabs/puppetserver/conf.d/puppetserver.conf
jruby-puppet: {
    max-active-instances: 4   # number of JRuby interpreters (roughly: 1 per CPU core, min 2)
    # Each JRuby instance compiles catalogs single-threaded; too few = queued/slow agent runs,
    # too many = JVM heap pressure, GC pauses. Rule of thumb: (CPU cores) with headroom for OS.
}
```
```bash
# /etc/default/puppetserver — JVM heap sizing
JAVA_ARGS="-Xms4g -Xmx4g"
# Set Xms = Xmx to avoid heap resize pauses. Size roughly 1-2GB per max-active-instance,
# plus overhead — undersized heap is the #1 cause of Puppet Server OOM/slow compiles at scale.
```

### Agent run interval tuning
```ini
# /etc/puppetlabs/puppet/puppet.conf on agents, or set centrally via an ENC/class
[agent]
runinterval = 30m   # default; large fleets often stagger this via splay to avoid thundering-herd
splaylimit  = 10m
splay       = true  # randomize actual run time within splaylimit to spread load on the master
```
```bash
# Manual/ad-hoc single run, verbose — the single most common troubleshooting command
puppet agent --test
# --test implies: --verbose --no-daemonize --onetime --no-usecacheonfailure --show_diff --detailed-exitcodes

# Exit codes with --detailed-exitcodes (useful in CI/monitoring):
#   0 = no changes, no errors
#   1 = failure during transaction
#   2 = changes were successfully applied
#   4 = failures occurred during the run
#   6 = changes AND failures both occurred
```

### Scaling beyond one Puppet Server
- Put multiple Puppet Server instances behind a load balancer, all pointed at a shared PuppetDB (itself often backed by a PostgreSQL cluster for HA).
- Use a CA-only master (or Puppet Enterprise's dedicated CA service) separate from compile masters at very large scale, so cert signing isn't contending with catalog compilation.
- `environment_timeout` (in `environment.conf`) caches compiled environment data in memory — set above `0` (e.g. `3m` or higher) in production once code stability is proven, since re-parsing the entire environment from disk on every single agent request is expensive at scale.

---

## 4. Reporting & Orchestration: PE vs Open Source

| Capability | Puppet (open source) | Puppet Enterprise (PE) |
|---|---|---|
| Agent/master core, catalog compilation | Yes | Yes |
| PuppetDB | Yes (self-hosted) | Yes (bundled, managed) |
| Web console / dashboard | No (community tools like Foreman fill this gap) | Yes, built-in |
| Node classifier (GUI-based ENC) | No (roll your own ENC) | Yes, built-in |
| Code Manager (r10k-as-a-service) | No (use r10k yourself) | Yes, integrated with webhooks |
| RBAC | No | Yes |
| Orchestrator (run Puppet/tasks on-demand from GUI/API, live job status) | Partial via Bolt (CLI-only) | Yes, full orchestration service + GUI |
| Support / SLA | Community | Commercial support contract |

Most personal/small-team setups run pure open-source Puppet + r10k + Bolt; PE becomes attractive at the scale where GUI-based RBAC, a managed dashboard, and vendor support outweigh its cost and operational footprint.

---

## 5. Common Real-World Gotchas

### Ordering bugs without explicit relationships
```puppet
# WRONG — no relationship; Puppet may apply these in either order,
# causing an intermittent "service not found" failure on first run.
package { 'nginx': ensure => installed }
service { 'nginx': ensure => running }
```
```puppet
# RIGHT — explicit chaining removes the ambiguity
package { 'nginx': ensure => installed }
-> service { 'nginx': ensure => running }
```
This is the single most common source of "works on re-run, fails on first apply" bugs — Puppet's graph has no implicit ordering from file position.

### Duplicate resource declaration errors
```
Error: Duplicate declaration: File[/etc/nginx/nginx.conf] is already declared
in file /etc/puppetlabs/code/environments/production/modules/nginx/manifests/config.pp:10;
cannot redeclare at /etc/puppetlabs/code/environments/production/modules/app/manifests/init.pp:22
```
Caused by two different classes/modules both trying to manage the same resource title (often the same file path) — Puppet catches this at compile time (a feature, not a bug: this is exactly the kind of conflict a catalog compile step is designed to surface before it touches disk). Fix: manage each resource in exactly one place; if truly two things need to influence the same file, use `concat` (Forge module) to let multiple classes contribute fragments instead of both declaring the whole `file` resource.

### Class parameter / Hiera lookup precedence confusion
Forgetting the resolution order (see [hiera-and-data.md](hiera-and-data.md#4-automatic-parameter-lookup)) causes "why isn't my Hiera value taking effect?" — usually because:
- A `class { 'foo': param => 'x' }` resource-like declaration elsewhere in the codebase is overriding Hiera (resource-like declarations win over Hiera APL).
- The Hiera key doesn't match `<full::class::name>::<parameter>` exactly (typos, wrong namespace).
- The value lives in a hierarchy level that isn't matched for this node (e.g., a fact used in the hierarchy path is unset/nil for that node — check with `puppet lookup <key> --node <certname> --explain`, which is the single best tool for debugging Hiera).

```bash
# Best debugging tool for "why did I get this value" — shows the full search path
puppet lookup nginx::worker_processes --node web01.example.com --explain
```

### Environment caching issues
After merging code and running `r10k deploy environment production`, agents sometimes still apply stale catalogs — caused by:
- `environment_timeout` on the master still serving a cached, pre-deploy version of the environment (mitigate: keep short timeouts in fast-moving environments, or trigger an environment cache flush after deploys).
- The **agent's own** cached catalog/environment (`puppet agent --test --noop` still hits the master fresh; but `useradd`-style local caching of the last-known-good catalog can mask a master-side change if the master is unreachable — check `/opt/puppetlabs/puppet/cache/state/`).

### Agent certificate signing workflow problems
```bash
# Symptom: agent run hangs/fails with "Server hostname does not match cert" or waiting for cert
puppet agent --test
# Warning: Puppet agent certificate is waiting on certificate ... to be signed

# On the master: list pending requests, sign explicitly (never mass-autosign in prod)
puppetserver ca list
puppetserver ca sign --certname web01.example.com

# If a node is rebuilt/reimaged and its cert needs regenerating (common with immutable infra
# where hostnames are reused for new instances):
puppetserver ca revoke --certname web01.example.com
puppetserver ca clean --certname web01.example.com
# then on the agent, remove its local cert/keys and re-run to generate a fresh CSR
rm -rf /etc/puppetlabs/puppet/ssl
puppet agent --test
```
Autosigning (`autosign.conf` with `*.example.com` wildcard patterns) trades security for convenience — fine in ephemeral/cloud-autoscaled fleets behind a private network, risky on anything internet-reachable since it lets any host claiming that hostname get a signed cert and pull your catalogs/secrets.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
