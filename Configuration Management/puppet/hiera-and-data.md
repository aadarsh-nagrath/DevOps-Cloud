# Hiera & Data Separation

Puppet's built-in hierarchical key/value lookup system — how to keep environment-, role-, and node-specific data out of manifest code entirely.

Back to [Puppet overview](puppet.md).

---

## 1. Why Hiera Exists

Without Hiera, environment differences end up as `if`/`case` branches scattered through manifests (`if $facts['datacenter'] == 'us-east' { ... }`). Hiera externalizes that data into YAML/JSON/eyaml files organized in a **hierarchy**, and Puppet looks up keys by walking the hierarchy top to bottom, returning the first match (or merging matches, depending on the merge strategy).

---

## 2. `hiera.yaml` — Hierarchy Levels

`hiera.yaml` lives at the environment root (`environments/production/hiera.yaml`) and defines the search order.

```yaml
# environments/production/hiera.yaml
version: 5   # v5 is current; v3 is legacy syntax, avoid in new code

defaults:
  datadir: "data"          # base directory data source paths are relative to
  data_hash: yaml_data       # default backend for all levels unless overridden

hierarchy:
  # 1. Most specific: per-node overrides (rare, emergency overrides only)
  - name: "Per-node data"
    path: "nodes/%{trusted.certname}.yaml"

  # 2. Per-role (business function) — see roles-and-profiles pattern
  - name: "Per-role data"
    path: "roles/%{facts.role}.yaml"

  # 3. Per-datacenter / region
  - name: "Per-datacenter data"
    path: "datacenter/%{facts.datacenter}.yaml"

  # 4. Per-environment (prod vs staging get different defaults)
  - name: "Per-environment data"
    path: "environment/%{server_facts.environment}.yaml"

  # 5. Per-OS-family (common across roles, still OS specific)
  - name: "Per-OS-family data"
    path: "os/%{facts.os.family}.yaml"

  # 6. Encrypted secrets layer, separate backend
  - name: "Encrypted secrets"
    lookup_key: eyaml_lookup_key
    path: "secrets.eyaml"
    options:
      pkcs7_private_key: /etc/puppetlabs/puppet/eyaml/private_key.pkcs7.pem
      pkcs7_public_key: /etc/puppetlabs/puppet/eyaml/public_key.pkcs7.pem

  # 7. Least specific: global fallback, always present
  - name: "Common data"
    path: "common.yaml"
```

| Hierarchy level (top → bottom = most → least specific) | Typical use |
|---|---|
| Per-node | Emergency/temporary single-host override |
| Per-role | "webserver", "db-primary" style business-function data |
| Per-datacenter/region | NTP servers, DNS resolvers, mirrors that differ by location |
| Per-environment | `production` vs `staging` vs `dev` defaults (e.g. debug flags) |
| Per-OS-family | Package names/paths that differ across Debian vs RedHat |
| Common | Fleet-wide defaults, the catch-all bottom layer |

Interpolation tokens: `%{facts.xxx}` (Facter facts), `%{trusted.certname}` (verified node identity from cert, safer than plain facts for security-sensitive paths), `%{server_facts.environment}` (facts set by the server, not the agent — can't be spoofed by the node).

---

## 3. Data Sources / Backends

| Backend | Format | Notes |
|---|---|---|
| `yaml_data` | YAML files | Default, most common, human-editable |
| `json_data` | JSON files | Same idea, JSON syntax |
| `hiera-eyaml` | Encrypted YAML (`.eyaml`) | For secrets — see §5 |
| Custom data providers | Ruby (`lib/puppet/functions/module/data.rb`) or module `data/` dir | Modules can ship their own Hiera data as sane defaults |

Example YAML data file:
```yaml
# data/roles/webserver.yaml
nginx::worker_processes: 4
nginx::listen_port: 80
apache::mpm_module: 'event'

# Automatic parameter lookup matches keys to <class>::<parameter> — see below
```

---

## 4. Automatic Parameter Lookup (APL)

When a **parameterized class** is declared via `include`/`contain`/`require` (not the resource-like `class { }` syntax), Puppet automatically looks up each parameter in Hiera using the key `<class name>::<parameter name>` before falling back to the in-code default.

```puppet
class nginx (
  Integer $worker_processes = 2,   # in-code default, lowest precedence
  Integer $listen_port      = 80,
) {
  # ...
}
```
```yaml
# data/roles/webserver.yaml — automatically supplies these params when nginx is included
nginx::worker_processes: 8
nginx::listen_port: 8080
```
```puppet
include nginx   # worker_processes resolves to 8, listen_port to 8080 — no code change needed
```

### Full resolution order (highest to lowest precedence)
1. Explicit `class { 'nginx': worker_processes => 4 }` resource-like declaration (if used anywhere).
2. Hiera automatic parameter lookup (`nginx::worker_processes` key, walking the hierarchy top to bottom, first match wins by default).
3. The parameter's default value in the class definition.
4. If none of the above resolve and the parameter has no default, catalog compilation **fails**.

---

## 5. The `lookup()` Function

Use `lookup()` for anything that isn't a class parameter — arbitrary data lookups from manifest code, or merged lookups across hierarchy levels.

```puppet
# Simple lookup with a default
$ntp_servers = lookup('ntp::servers', Array[String], 'first', ['pool.ntp.org'])
#                key                  type            merge   default

# Merge behavior options:
#   'first'   — return the first match found walking the hierarchy (default)
#   'unique'  — merge arrays from ALL hierarchy levels into one deduplicated array
#   'hash'    — merge hashes from ALL levels (deep or shallow, configurable)
#   'deep'    — recursively merge nested hashes/arrays across all levels

$firewall_rules = lookup({
  'name'                     => 'firewall::rules',
  'merge'                    => 'deep',
  'default_value'            => {},
})
```

`hiera()` (old v3-era function) is deprecated in favor of `lookup()` — use `lookup()` in all new code.

Merge behavior can also be set per-key in `hiera.yaml` under `hierarchy.*.options` or globally, so callers don't need to specify it every time.

---

## 6. Hiera-eyaml for Encrypted Secrets

`hiera-eyaml` encrypts individual YAML *values* (not whole files) with a PKCS7 keypair, so secret files remain diffable/committable to git while the sensitive strings stay encrypted at rest.

```bash
# Install the eyaml gem (into Puppet's own Ruby environment)
/opt/puppetlabs/puppet/bin/gem install hiera-eyaml

# Generate a keypair — do this ONCE per environment/hierarchy, store the private key securely
eyaml createkeys
# creates: keys/private_key.pkcs7.pem (keep secret, deploy only to Puppet Server)
#          keys/public_key.pkcs7.pem  (safe to distribute, used to encrypt)

# Encrypt a value — outputs an ENC[PKCS7,...] blob to paste into a data file
eyaml encrypt -s 'SuperSecretDbPassword123!'
```
```yaml
# data/secrets.eyaml
mysql::root_password: >
  ENC[PKCS7,MIIBiQYJKoZIhvcNAQcDMIIBejCCAXYCAQAxggEhMIIBHQIBADAFMAACAQEwDQYJ...]
```
```bash
# Decrypt to verify (requires the private key present, e.g. run on the master)
eyaml decrypt -f data/secrets.eyaml

# Edit in place — decrypts, opens $EDITOR, re-encrypts on save
eyaml edit data/secrets.eyaml
```
Workflow notes:
- The **private key** must exist only on Puppet Server (or wherever catalogs are compiled) — never on agents, never in the git repo.
- The **public key** can be distributed to anyone who needs to author secrets (e.g., laptop of an engineer) without letting them decrypt existing ones.
- Rotate keys by re-encrypting all `.eyaml` files with `eyaml recrypt` when a keypair is compromised.

---

## 7. Environment-Specific Data

Each Puppet environment can have its own `hiera.yaml` and `data/` directory, letting `production` and `staging` diverge entirely in hierarchy structure, not just values:
```
environments/
├── production/
│   ├── hiera.yaml          # production's own hierarchy
│   ├── data/
│   │   ├── common.yaml
│   │   └── roles/webserver.yaml
│   └── manifests/site.pp
└── staging/
    ├── hiera.yaml          # can differ — e.g. staging skips the datacenter layer
    ├── data/
    │   └── common.yaml       # staging::debug: true, smaller defaults, etc.
    └── manifests/site.pp
```
Additionally, there's a **global** `hiera.yaml` at `/etc/puppetlabs/puppet/hiera.yaml` consulted before environment-level hierarchies — used sparingly, for truly global settings that must apply regardless of environment.

---

## 8. Worked Example: Facts-Driven Hierarchy

Goal: nginx worker count and TLS behavior should vary by role, datacenter, and environment, with a global fallback.

```yaml
# hiera.yaml
version: 5
defaults:
  datadir: data
  data_hash: yaml_data
hierarchy:
  - name: "Node"
    path: "nodes/%{trusted.certname}.yaml"
  - name: "Role"
    path: "roles/%{facts.role}.yaml"
  - name: "Datacenter"
    path: "datacenter/%{facts.datacenter}.yaml"
  - name: "Environment"
    path: "environment/%{server_facts.environment}.yaml"
  - name: "Common"
    path: "common.yaml"
```
```yaml
# data/common.yaml — fleet-wide fallback
nginx::worker_processes: 2
nginx::enable_ssl: false

# data/environment/production.yaml
nginx::enable_ssl: true

# data/datacenter/us-east-1.yaml
ntp::servers:
  - '169.254.169.123'   # AWS us-east-1 Amazon Time Sync

# data/roles/webserver.yaml
nginx::worker_processes: 8

# data/nodes/web01.prod.example.com.yaml   (rare — emergency single-node override)
nginx::worker_processes: 16   # this one node is temporarily overloaded, bump workers
```
For a node with `role=webserver`, `datacenter=us-east-1`, running in the `production` environment, and certname `web01.prod.example.com`:
- `nginx::worker_processes` resolves to **16** (Node layer wins — most specific, first match).
- `nginx::enable_ssl` resolves to **true** (no Node/Role/Datacenter override, falls through to Environment layer).
- `ntp::servers` resolves from the Datacenter layer.

See [nodes-environments-and-roles-profiles.md](nodes-environments-and-roles-profiles.md) for how `facts.role` typically gets set (either a custom fact, an ENC, or node classification in `site.pp`) and how this pairs with the roles/profiles design pattern.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
