# Manifests & Resources

Puppet DSL syntax, the core resource types, metaparameters, relationship chaining, conditionals, and why everything in Puppet is designed to be idempotent.

Back to [Puppet overview](puppet.md).

---

## 1. Manifest Basics (`.pp` files)

A manifest is a plain text file with a `.pp` extension containing Puppet DSL. `site.pp` is the main entry point Puppet Server reads to classify nodes.

```puppet
# /etc/puppetlabs/code/environments/production/manifests/site.pp

# Every resource declaration follows: type { 'title': attribute => value, ... }
package { 'nginx':
  ensure => installed,   # 'ensure' controls the resource's desired state
}

service { 'nginx':
  ensure => running,     # keep the service running
  enable => true,        # and enabled to start on boot
}
```

Puppet code is **declarative** — order in the file does NOT imply execution order. Relationships must be explicit (see §5) unless resources naturally have no dependency.

---

## 2. Resource Declaration Syntax Deep Dive

```puppet
<type> { '<title>':
  <attribute> => <value>,
  <attribute> => <value>,
}
```

- **type** — the resource type, e.g. `package`, `file`, `service` (lowercase).
- **title** — a unique (per type) string identifying this resource instance; used for referencing in relationships (`Package['nginx']`, note capitalized type when referencing).
- **attributes** — key/value pairs configuring the resource; most types have an implicit `namevar` (usually `name`, defaults to the title if `name` isn't set explicitly).

### Multiple titles, shared attributes
```puppet
# Declare several resources of the same type with identical attributes
package { ['git', 'curl', 'wget', 'vim']:
  ensure => installed,
}
```

### Referencing a resource elsewhere (capitalized type + title)
```puppet
File['/etc/nginx/nginx.conf']
Package['nginx']
Service['nginx']
```

### Resource defaults
```puppet
# Applies ensure => installed to every 'package' resource in this scope
# unless a resource explicitly overrides it
Package {
  ensure => installed,
}
```

### Arrays and hashes as attribute values
```puppet
file { '/etc/motd':
  ensure  => file,
  content => "Managed by Puppet\n",
  mode    => '0644',
}

user { 'deploy':
  ensure     => present,
  groups     => ['sudo', 'docker'],   # array attribute
  managehome => true,
}
```

---

## 3. Core Resource Types

### `package`
```puppet
package { 'nginx':
  ensure => '1.18.0-0ubuntu1',  # pin an exact version; or 'installed', 'latest', 'absent', 'purged'
}
```

### `service`
```puppet
service { 'nginx':
  ensure     => running,   # or 'stopped'
  enable     => true,      # start on boot
  hasrestart => true,      # use init script's restart command instead of stop+start
  hasstatus  => true,      # trust the init script's status command
}
```

### `file`
```puppet
file { '/etc/nginx/nginx.conf':
  ensure  => file,
  owner   => 'root',
  group   => 'root',
  mode    => '0644',
  source  => 'puppet:///modules/nginx/nginx.conf',   # copy static file from module's files/
  # OR, mutually exclusive with source:
  # content => template('nginx/nginx.conf.erb'),      # render from a template
}

file { '/var/www/app':
  ensure => directory,
  owner  => 'www-data',
  mode   => '0755',
  recurse => true,       # manage contents recursively
}

file { '/opt/old-app':
  ensure => absent,      # deletes the file/directory if present
  force  => true,        # required to recursively delete a non-empty directory
}
```

### `user` / `group`
```puppet
group { 'deploy':
  ensure => present,
  gid    => 2000,
}

user { 'deploy':
  ensure     => present,
  uid        => 2000,
  gid        => 'deploy',
  shell      => '/bin/bash',
  home       => '/home/deploy',
  managehome => true,
  require    => Group['deploy'],   # explicit ordering, see §5
}
```

### `exec` — the escape hatch (use sparingly!)
```puppet
exec { 'run-migration':
  command => '/usr/bin/rails db:migrate',
  cwd     => '/var/www/app',
  path    => ['/usr/bin', '/bin', '/usr/local/bin'],  # required unless full path given in 'command'
  # Guard against re-running every catalog apply — exec has NO built-in idempotency:
  unless  => '/usr/bin/rails runner "exit Schema.exists?"',
  # 'onlyif' is the inverse of 'unless' — run only if the given command succeeds
}
```
`exec` is the one resource type that is NOT idempotent by default — you must supply `unless`/`onlyif`/`creates` guards yourself. Overuse of `exec` is a common Puppet code smell; prefer a real resource type or a custom type/provider when one exists.

### `cron`
```puppet
cron { 'nightly-backup':
  ensure  => present,
  command => '/usr/local/bin/backup.sh',
  user    => 'root',
  hour    => 2,
  minute  => 30,
  weekday => ['1-5'],   # Mon-Fri
}
```

### `notify` — logging / debugging output
```puppet
notify { 'Deploying version 2.3.1 to this node': }
```

---

## 4. Metaparameters

Metaparameters are attributes available on **every** resource type, primarily controlling ordering, notification, and application logic.

| Metaparameter | Purpose |
|---|---|
| `before` | This resource is applied **before** the referenced resource(s). |
| `require` | This resource is applied **after** the referenced resource(s) (its dependency). |
| `notify` | Like `before`, plus: if this resource changes, refresh the target resource (e.g. restart a service after a config file changes). |
| `subscribe` | Like `require`, plus: if the referenced resource changes, refresh *this* resource. |
| `alias` | An additional name to refer to the resource by. |
| `tag` | Attach arbitrary tags for use with `puppet apply --tags` filtering. |
| `audit` | Track a specific property for changes without managing it. |
| `loglevel` | Override the log level Puppet uses when reporting on this resource. |

```puppet
file { '/etc/nginx/nginx.conf':
  ensure => file,
  source => 'puppet:///modules/nginx/nginx.conf',
  notify => Service['nginx'],   # restart nginx whenever this file changes
}

service { 'nginx':
  ensure    => running,
  subscribe => File['/etc/nginx/nginx.conf'],  # equivalent relationship, declared on the other side
}

package { 'nginx':
  ensure => installed,
  before => File['/etc/nginx/nginx.conf'],  # install package before managing its config file
}
```

`notify`/`subscribe` are the *only* metaparameters that trigger a refresh event (e.g., restarting a service); `before`/`require` establish ordering only, with no refresh.

---

## 5. Chaining Arrows: `->` and `~>`

Chaining arrows are a terser alternative to `before`/`require`/`notify`/`subscribe`, read left-to-right.

| Arrow | Meaning |
|---|---|
| `->` | Ordering only ("then"): left resource applied before right resource. |
| `~>` | Ordering **+ notify**: left resource applied before right, and if left changes, right is refreshed. |

```puppet
# Classic package -> config -> service pattern
package { 'nginx': ensure => installed }
-> file { '/etc/nginx/nginx.conf':
     ensure => file,
     source => 'puppet:///modules/nginx/nginx.conf',
   }
~> service { 'nginx':
     ensure => running,
     enable => true,
   }
# Reads as: install package, THEN manage config file,
# THEN (and restart nginx IF the config file changed) ensure service running.
```

Chaining also works between resource *references* (useful when resources are declared elsewhere, e.g. in different classes):
```puppet
Package['nginx'] -> File['/etc/nginx/nginx.conf'] ~> Service['nginx']
```

And between whole classes:
```puppet
class { 'nginx': }
-> class { 'app': }   # ensure the nginx class is fully applied before the app class
```

---

## 6. Conditionals

### `if` / `elsif` / `else`
```puppet
if $facts['os']['family'] == 'Debian' {
  $package_name = 'apache2'
} elsif $facts['os']['family'] == 'RedHat' {
  $package_name = 'httpd'
} else {
  fail("Unsupported OS family: ${facts['os']['family']}")
}

package { $package_name: ensure => installed }
```

### `unless`
```puppet
# Inverse of if — runs the block only when the condition is false
unless $facts['os']['family'] == 'windows' {
  file { '/etc/motd': ensure => file, content => "Linux/Unix host\n" }
}
```

### `case`
```puppet
case $facts['os']['name'] {
  'Ubuntu', 'Debian': {
    $service_name = 'apache2'
  }
  'CentOS', 'RedHat', 'Fedora': {
    $service_name = 'httpd'
  }
  default: {
    fail("Unrecognized OS: ${facts['os']['name']}")
  }
}
```

### Selectors (inline, expression form of `case`)
```puppet
# Selector: '?' operator, returns a value rather than executing a block
$service_name = $facts['os']['family'] ? {
  'Debian' => 'apache2',
  'RedHat' => 'httpd',
  default  => fail("Unsupported OS family"),
}
```
Use `case`/`if` for branching *logic* (declaring different resources per branch); use selectors only for choosing a *value* to assign to a variable.

---

## 7. Relationships & Ordering — Deep Dive

Puppet manifests describe a graph, not a script. Two resources with **no** explicit relationship (`before`/`require`/`notify`/`subscribe`/arrows) may be applied in **any order**, including in parallel conceptually — Puppet does not guarantee file order reflects apply order.

```puppet
# BUG: no relationship declared — Puppet may try to start the service
# before the package is installed, causing a failed run.
package { 'nginx': ensure => installed }
service { 'nginx': ensure => running }

# FIX: explicit relationship
package { 'nginx': ensure => installed }
-> service { 'nginx': ensure => running }
```

Containment rule: relationships declared on a **class** apply to *all* resources contained within that class (i.e. classes act as a single node in the dependency graph for that relationship). This is why `include`-ing classes in the right order, or chaining classes with `->`, is often cleaner than wiring every individual resource.

Puppet detects **dependency cycles** at catalog-compile time and fails loudly rather than silently looping — a good safety net compared to hand-written scripts.

---

## 8. Idempotency Principles

Idempotency means: running the same manifest against a system already in the desired state produces **no changes** ("Puppet run: 0 changes"). This is the entire point of the RAL (Resource Abstraction Layer):

1. Puppet **checks current state** first (e.g., is the package installed at the target version?).
2. Only if current state ≠ desired state does Puppet invoke the provider to make a change.
3. This check-then-act pattern is built into almost every resource type automatically — you don't write the "check" logic yourself for `package`, `file`, `service`, `user`, etc.

```puppet
# Idempotent by design: running this 100 times in a row only changes
# the system on the FIRST run (assuming nothing else touches nginx).
package { 'nginx': ensure => installed }
file { '/etc/nginx/nginx.conf':
  ensure  => file,
  content => "server { listen 80; }\n",
}
service { 'nginx': ensure => running, enable => true }
```

The exception: `exec`, which runs its `command` unconditionally unless you provide `creates`, `onlyif`, or `unless` guards:
```puppet
exec { 'download-app-binary':
  command => '/usr/bin/curl -o /opt/app/bin/app https://example.com/app-2.3.1',
  creates => '/opt/app/bin/app',   # skip this exec if this file already exists — makes it idempotent
}
```

See also: [Classes, Modules & Templates](classes-modules-and-templates.md) for packaging these resources into reusable units, and [Advanced & Production Patterns](advanced-and-production-patterns.md#5-common-real-world-gotchas) for ordering bugs that slip through in practice.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
