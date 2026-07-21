# Classes, Modules & Templates

How Puppet code is organized into reusable, shareable units — classes, modules, the Forge, r10k, and the two templating languages (ERB/EPP).

Back to [Puppet overview](puppet.md).

---

## 1. Classes

A **class** is a named container for a group of related resources, defined once and included wherever needed.

### Defining a class
```puppet
# manifests/init.pp inside a module named 'nginx' defines the class 'nginx'
class nginx {
  package { 'nginx':
    ensure => installed,
  }
  service { 'nginx':
    ensure  => running,
    enable  => true,
    require => Package['nginx'],
  }
}
```

### Declaring/including a class

| Method | Behavior |
|---|---|
| `include nginx` | Idempotent — safe to call multiple times from different places; does NOT let you set parameters at the call site (must come from Hiera or defaults). Does not enforce ordering relative to the calling context. |
| `contain nginx` | Like `include`, but the class is "contained" — relationships to/from the containing class also apply to everything inside `nginx`. Used inside module classes to make internal ordering deterministic. |
| `require nginx` | Like `include`, but also adds an implicit ordering dependency: the current resource/class will not be applied until `nginx` is applied first. |
| `class { 'nginx': param => value }` | **Resource-like declaration** — lets you pass parameters directly, but can only be declared ONCE per catalog (a second `class { 'nginx': }` anywhere causes a duplicate declaration error). |

```puppet
# Safe to include from multiple classes/modules — no conflict
include nginx
include nginx   # no-op, already included

# Resource-like: sets parameters, but only callable once in the whole catalog
class { 'nginx':
  worker_processes => 4,
  listen_port       => 8080,
}
```
**Best practice**: prefer `include` (or `contain` inside modules) with parameters coming from Hiera via automatic parameter lookup (see [hiera-and-data.md](hiera-and-data.md)) — this avoids the single-declaration restriction and keeps data out of code.

### Parameterized classes
```puppet
class nginx (
  Integer $worker_processes = 2,        # typed parameter with a default
  Integer $listen_port      = 80,
  String  $package_ensure   = 'installed',
) {
  package { 'nginx':
    ensure => $package_ensure,
  }

  file { '/etc/nginx/nginx.conf':
    ensure  => file,
    content => epp('nginx/nginx.conf.epp', {
      'worker_processes' => $worker_processes,
      'listen_port'      => $listen_port,
    }),
    notify  => Service['nginx'],
  }

  service { 'nginx':
    ensure => running,
    enable => true,
  }
}
```
Parameter values are resolved, in order, from: (1) an explicit `class { }` declaration, (2) **Hiera automatic parameter lookup**, (3) the in-code default. See [hiera-and-data.md](hiera-and-data.md#3-automatic-parameter-lookup) for the full resolution order.

---

## 2. Modules

A module is a self-contained, shareable unit of Puppet code — the packaging boundary for reuse (locally or via the Forge).

### Standard module directory structure
```
nginx/                          # module name = directory name
├── manifests/
│   ├── init.pp                 # defines class 'nginx' (must match module name)
│   ├── config.pp               # class 'nginx::config' (namespaced by directory)
│   └── install.pp              # class 'nginx::install'
├── templates/
│   └── nginx.conf.erb          # ERB templates, referenced via template('nginx/nginx.conf.erb')
├── files/
│   └── ssl-params.conf         # static files, referenced via puppet:///modules/nginx/ssl-params.conf
├── lib/
│   ├── facter/                 # custom facts (Ruby)
│   ├── puppet/parser/functions/# legacy custom functions
│   └── puppet/functions/       # modern custom functions (Puppet 4+ API)
├── data/
│   └── common.yaml             # module-level Hiera data (module data provider)
├── hiera.yaml                  # module's own hierarchy for data/ lookups
├── spec/
│   └── classes/nginx_spec.rb   # rspec-puppet tests, see testing-and-ci.md
├── examples/
│   └── init.pp                 # example usage, run manually with `puppet apply`
├── metadata.json               # name, version, dependencies, supported OSes
└── README.md
```

### Naming and namespacing
- The module directory name becomes the top namespace: module `nginx` → class `nginx`, `nginx::config`, `nginx::params`, defined type `nginx::vhost`.
- File path mirrors namespace: `manifests/config.pp` → `nginx::config`; `manifests/vhost.pp` (a `define`) → `nginx::vhost`.

### `metadata.json`
```json
{
  "name": "mycompany-nginx",
  "version": "1.4.0",
  "author": "mycompany",
  "summary": "Manages nginx web server",
  "dependencies": [
    { "name": "puppetlabs-stdlib", "version_requirement": ">= 6.0.0 < 9.0.0" }
  ],
  "operatingsystem_support": [
    { "operatingsystem": "Ubuntu", "operatingsystemrelease": ["20.04", "22.04"] }
  ]
}
```

---

## 3. The Puppet Forge

The Forge (forge.puppet.com) is Puppet's public module registry, analogous to Ansible Galaxy or the Chef Supermarket.

```bash
# Install a module from the Forge into the current environment's modules/ dir
puppet module install puppetlabs-apache

# Search the Forge
puppet module search mysql

# List installed modules and their dependency tree
puppet module list
```
Widely-used Forge modules worth knowing: `puppetlabs-stdlib` (utility functions almost every module depends on), `puppetlabs-apache`, `puppetlabs-mysql`, `puppet-nginx`, `puppetlabs-firewall`, `richardc-datacat`.

In production, Forge modules are almost never installed ad-hoc onto a master — they're pinned in a `Puppetfile` and vendored in via r10k (below), so every environment resolves the exact same versions from version control.

---

## 4. r10k / Code Manager

`r10k` (open source) and **Code Manager** (Puppet Enterprise's managed equivalent) implement the **control-repo pattern**: a single git repository (`control-repo`) whose branches map 1:1 to Puppet **environments**, plus a `Puppetfile` declaring which Forge/git modules to vendor into each environment.

### `Puppetfile`
```ruby
# Puppetfile — lives at the root of the control-repo
forge 'https://forgeapi.puppet.com'

mod 'puppetlabs-stdlib', '9.4.0'
mod 'puppetlabs-apache', '11.1.0'

# Pull a module directly from a git repo/branch instead of the Forge
mod 'mycompany-app',
  git: 'git@github.com:mycompany/puppet-app.git',
  ref: 'v2.3.1'
```

### r10k workflow
```bash
# r10k.yaml — tells r10k where the control-repo lives and where to deploy environments
cat /etc/puppetlabs/r10k/r10k.yaml
# ---
# cachedir: '/var/cache/r10k'
# sources:
#   corp:
#     remote: 'git@github.com:mycompany/control-repo.git'
#     basedir: '/etc/puppetlabs/code/environments'

# Deploy ALL environments (branches) — clones/updates them and installs Puppetfile modules
r10k deploy environment -pv

# Deploy just one environment (branch), e.g. after a feature-branch push
r10k deploy environment feature_new_datacenter -pv
```
- Each control-repo branch (`production`, `staging`, `feature/x`) becomes a Puppet directory environment of the same name.
- Typically wired to a git webhook so pushing to a branch triggers `r10k deploy environment <branch>` automatically (Code Manager does this natively in Puppet Enterprise).
- See [nodes-environments-and-roles-profiles.md](nodes-environments-and-roles-profiles.md#2-environments) for how nodes get pinned to environments.

---

## 5. Templating: ERB vs EPP

Both let you interpolate variables/logic into generated file content; EPP is Puppet-native and preferred for new code.

| Aspect | ERB | EPP |
|---|---|---|
| Syntax base | Ruby (`<%= %>`, `<% %>`) | Puppet DSL (`<%= %>`, `<% %>`, same tags but Puppet expressions) |
| File extension | `.erb` | `.epp` |
| Function to render | `template('module/file.erb')` | `epp('module/file.epp', {params})` |
| Variable access | Bare Puppet variables auto-available (`<%= @worker_processes %>` or `<%= scope['worker_processes'] %>`) | Explicit typed parameters declared at top of file, passed explicitly |
| Can execute arbitrary Ruby | Yes (any Ruby expression) | No — Puppet expression language only, safer/more constrained |
| Recommended for new code | Legacy support | **Yes** — explicit params make templates self-documenting and safer |

### ERB example
```erb
# templates/nginx.conf.erb
worker_processes <%= @worker_processes %>;

events {
  worker_connections 1024;
}

http {
  server {
    listen <%= @listen_port %>;
    <% if @enable_ssl -%>
    ssl_certificate /etc/nginx/ssl/cert.pem;
    <% end -%>
  }
}
```
```puppet
file { '/etc/nginx/nginx.conf':
  content => template('nginx/nginx.conf.erb'),  # pulls @worker_processes etc from calling scope
}
```

### EPP example
```epp
<%- | Integer $worker_processes,
      Integer $listen_port,
      Boolean $enable_ssl = false,
| -%>
worker_processes <%= $worker_processes %>;

events {
  worker_connections 1024;
}

http {
  server {
    listen <%= $listen_port %>;
    <% if $enable_ssl { -%>
    ssl_certificate /etc/nginx/ssl/cert.pem;
    <% } -%>
  }
}
```
```puppet
file { '/etc/nginx/nginx.conf':
  content => epp('nginx/nginx.conf.epp', {
    'worker_processes' => $worker_processes,
    'listen_port'       => $listen_port,
    'enable_ssl'        => true,
  }),
}
```
`<%- ... -%>` / `<% ... -%>` trims surrounding whitespace/newlines — important for generating clean config files.

---

## 6. Defined Resource Types (`define`) vs Classes

A **defined type** (`define`) is like a class, but can be declared **multiple times per node** with different titles/parameters — it's a resource-like, instantiable template. A **class** is a singleton per node (declared once, conceptually "this class either applies to the node or it doesn't").

```puppet
# manifests/vhost.pp — defines nginx::vhost, instantiable many times
define nginx::vhost (
  Integer $port          = 80,
  String  $document_root = "/var/www/${title}",   # $title = the resource title at call site
) {
  file { "/etc/nginx/sites-available/${title}.conf":
    ensure  => file,
    content => epp('nginx/vhost.conf.epp', {
      'server_name'    => $title,
      'port'           => $port,
      'document_root'  => $document_root,
    }),
    notify  => Service['nginx'],
  }

  file { "/etc/nginx/sites-enabled/${title}.conf":
    ensure => link,
    target => "/etc/nginx/sites-available/${title}.conf",
  }
}
```
```puppet
# Called multiple times — each with a distinct title, exactly like a resource
nginx::vhost { 'app.example.com':
  port          => 80,
  document_root => '/var/www/app',
}

nginx::vhost { 'api.example.com':
  port          => 8080,
  document_root => '/var/www/api',
}
```

### When to use which

| Use a **class** when... | Use a **defined type** when... |
|---|---|
| The thing applies once per node (installing a package, one main service) | You need multiple instances with different parameters (vhosts, cron jobs, users, firewall rules) |
| You want automatic parameter lookup from Hiera per-node/role | You're modeling a repeatable "resource-like" concept |
| Composing profiles/roles (see [nodes-environments-and-roles-profiles.md](nodes-environments-and-roles-profiles.md)) | Wrapping a group of resources behind a clean, reusable interface, callable like `nginx::vhost { title: }` |

A `define` cannot use automatic parameter lookup from Hiera by class name in the same way top-level classes can (each instance is titled, not a singleton), though you can still call `lookup()` explicitly inside one.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
