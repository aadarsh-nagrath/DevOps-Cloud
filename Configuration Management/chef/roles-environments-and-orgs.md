# Roles, Environments, Organizations, and Policyfiles

Roles, environments, the Chef Infra Server object model, `knife` CLI reference, and Policyfiles as the modern replacement workflow. See [attributes-and-templates.md](attributes-and-templates.md) for the attribute precedence rules roles/environments plug into.

---

## 1. Roles

A role bundles a **run-list** plus **default/override attributes** under one reusable name, so you can assign "this node is a webserver" instead of hand-listing every recipe per node.

```ruby
# roles/webserver.rb
name 'webserver'
description 'Web server role: nginx + app deploy'

run_list(
  'recipe[nginx]',
  'recipe[my_cookbook::webserver]',
  'recipe[my_cookbook::deploy]'
)

default_attributes(
  'nginx' => { 'worker_processes' => 4 }
)

override_attributes(
  'nginx' => { 'listen_port' => 80 }
)
```

```bash
# Upload the role definition to the Chef Infra Server
knife role from file roles/webserver.rb

# Assign the role to a node's run-list
knife node run_list add my-node-01 'role[webserver]'
```

Roles can also be defined as raw JSON (`roles/webserver.json`) if you prefer not to use the Ruby DSL — functionally identical.

Roles can nest other roles inside their run-list (`role[base]`), enabling a "base role -> function role" composition pattern common in older Chef codebases.

---

## 2. Environments

An environment represents a deployment tier (dev/staging/prod) and constrains which cookbook versions are allowed plus environment-scoped attribute overrides.

```ruby
# environments/production.rb
name 'production'
description 'Production environment'

cookbook_versions(
  'nginx'       => '= 7.2.0',   # pin an exact version in prod for stability
  'my_cookbook' => '>= 1.2.0'
)

default_attributes(
  'app' => { 'log_level' => 'warn' }
)

override_attributes(
  'nginx' => { 'listen_port' => 443 }
)
```

```bash
knife environment from file environments/production.rb
knife node environment set my-node-01 production
```

Every node belongs to exactly one environment (`_default` if unset). When chef-client resolves cookbooks for a run, the server enforces the environment's `cookbook_versions` constraints — a run fails fast if no cookbook version on the server satisfies the constraint, rather than silently applying a mismatched version.

### Why environments+roles fell out of favor

Both roles and environments store attribute overrides *outside* version control in a way that's easy to drift (edited live via `knife role edit`), and dependency resolution across many cookbooks with loose version constraints (`~> 1.0`) can non-deterministically produce different results between runs. **Policyfiles** (below) solve both problems by pinning an exact, versioned, testable snapshot.

---

## 3. Organizations and the Chef Infra Server Object Model

A Chef Infra Server (particularly Chef Automate / hosted Chef) partitions data into **organizations** — isolated tenants each with their own cookbooks, nodes, roles, environments, and data bags. Within an org, the object model is:

```
Organization
├── Nodes           # one object per managed machine: run-list + attributes + environment
├── Clients         # API identities (a node's client key authenticates chef-client runs)
├── Cookbooks        # versioned cookbook artifacts uploaded via `knife cookbook upload`
├── Roles
├── Environments
├── Data Bags        # + data bag items, optionally encrypted
└── Users             # human accounts with RBAC permissions on the above
```

Authentication uses RSA key pairs: each node/client and each user has a private key (kept local) whose public counterpart is registered on the server; every API request is signed.

---

## 4. `knife` CLI Deep Dive

`knife` is the primary CLI for interacting with a Chef Infra Server from your workstation.

### Bootstrap — install chef-client on a new node and register it

```bash
knife bootstrap 192.0.2.10 \
  --ssh-user ubuntu \
  --sudo \
  --node-name web-01 \
  --run-list 'role[webserver]' \
  --environment production
# SSHes in, installs chef-client, registers the node with the server, runs it once with the given run-list
```

### Node management

```bash
knife node list                          # list all registered nodes
knife node show web-01                   # show a node's full object (attributes, run-list)
knife node show web-01 -a ipaddress      # show a single attribute
knife node run_list add web-01 'recipe[my_cookbook::default]'
knife node run_list set web-01 'role[webserver],recipe[monitoring]'
knife node edit web-01                   # opens node JSON in $EDITOR for manual attribute edits
knife node delete web-01
```

### Role / environment management

```bash
knife role list
knife role from file roles/webserver.rb   # create/update from local file
knife role show webserver
knife role delete webserver

knife environment list
knife environment from file environments/production.rb
knife environment show production
```

### Data bag management

```bash
knife data bag list
knife data bag create secrets
knife data bag from file secrets db_password.json --secret-file encrypted_data_bag_secret
knife data bag show secrets db_password
knife data bag delete secrets db_password
```

### Cookbook upload

```bash
knife cookbook upload my_cookbook             # upload one cookbook
knife cookbook upload --all                   # upload every cookbook in cookbooks/
knife cookbook list                            # list cookbooks + versions on the server
knife cookbook delete my_cookbook 1.2.0        # delete a specific version
```

### Misc useful commands

```bash
knife ssh 'role:webserver' 'sudo chef-client'   # run chef-client on every node matching a search query, over SSH
knife status                                      # last check-in time for all nodes
knife diff roles/                                 # diff local files vs. what's on the server
```

---

## 5. Policyfiles — The Modern Alternative

Policyfiles replace the roles + environments + community Berkshelf combo with a single versioned, lockfile-backed definition of "exactly which cookbooks, at exactly which versions, run in exactly this order, for this group of nodes."

### `Policyfile.rb`

```ruby
# policyfiles/webserver.rb

# Where to fetch community cookbooks from
default_source :supermarket

# Cookbooks not in Supermarket - path or git source
cookbook 'my_cookbook', path: '../cookbooks/my_cookbook'
cookbook 'nginx', '~> 7.2'

# The run-list this policy applies (replaces role run_lists)
run_list 'my_cookbook::webserver', 'nginx::default'

# Default/override attributes (replaces role/environment attribute blocks)
default['nginx']['worker_processes'] = 4
override['nginx']['listen_port'] = 80

# Named policy group (replaces "environment" as the deployment-tier concept)
# groups are set at push time, not declared here
```

### Workflow commands

```bash
# Resolve dependencies and write Policyfile.lock.json (the exact pinned versions - commit this!)
chef install

# Push the compiled policy + all its cookbooks to a named policy group on the Chef Infra Server
chef push production policyfiles/webserver.rb

# Point a node at a policy + policy group instead of a run-list/environment
knife bootstrap 192.0.2.10 \
  --policy-name webserver \
  --policy-group production \
  --node-name web-01
```

### Roles/environments vs. Policyfiles

| Concern | Roles + Environments | Policyfile |
|---|---|---|
| Run-list | Stored in role, mutable live on server via `knife role edit` | Stored in `Policyfile.rb`, compiled into an immutable lock file |
| Cookbook versions | Loose constraints (`~> 1.0`) resolved at *run* time per environment | Exact versions resolved at *push* time, identical on every node in the group |
| Attribute overrides | Split across role + environment + cookbook attribute files (see precedence table) | Centralized in one file, still layered under Ohai `automatic` |
| Dependency resolution tool | Berkshelf (`Berksfile` + `berks install`) | Built into `chef install` — no separate Berkshelf needed |
| Reproducibility | Can drift — same environment can resolve different cookbook versions over time as new versions get uploaded | Deterministic — lock file pins exact versions, promoted between policy groups explicitly |
| Recommended for | Legacy cookbooks, existing large estates already using roles/environments | All new Chef work |

### Berkshelf (legacy dependency management, still seen in older cookbooks)

```ruby
# Berksfile
source 'https://supermarket.chef.io'

metadata               # pulls dependencies declared in this cookbook's metadata.rb
cookbook 'nginx', '~> 7.2'
```

```bash
berks install    # resolve + download dependencies into ~/.berkshelf
berks upload     # upload this cookbook + all its dependencies to the Chef Infra Server
```
Policyfiles supersede Berkshelf for new work, but many production cookbooks written before ~2018 still use a `Berksfile` — expect to encounter both in the wild.

---

Continue to [testing-and-dev-workflow.md](testing-and-dev-workflow.md) for how to test cookbooks and Policyfiles locally before pushing to a server.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
