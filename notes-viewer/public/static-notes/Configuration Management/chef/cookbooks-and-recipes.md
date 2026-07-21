# Cookbooks and Recipes

Deep dive into cookbook directory structure, recipe syntax, the core resource types, notifications, and writing custom resources. See [chef.md](chef.md) for the overview and glossary.

---

## 1. Cookbook Directory Structure

```
my_cookbook/
├── metadata.rb            # name, version, depends, supports (platforms)
├── README.md
├── recipes/
│   ├── default.rb          # loaded when cookbook is added to run-list with no ::recipe suffix
│   ├── webserver.rb         # referenced as "my_cookbook::webserver"
│   └── database.rb
├── attributes/
│   └── default.rb          # default attribute values, merged per precedence rules
├── templates/
│   └── default/
│       └── nginx.conf.erb  # ERB templates rendered onto the node
├── files/
│   └── default/
│       └── motd            # static files copied verbatim via cookbook_file
├── libraries/
│   └── helpers.rb           # plain Ruby modules/classes, mixed into recipes
├── resources/
│   └── site.rb              # custom resource definitions (modern LWRP replacement)
├── providers/                # legacy LWRP provider code (rare in modern cookbooks)
├── spec/                      # ChefSpec unit tests
└── test/
    └── integration/
        └── default/           # InSpec integration tests run by Test Kitchen
```

| Directory | Purpose |
|---|---|
| `recipes/` | Ruby files declaring resources; the unit added to a run-list |
| `attributes/` | Cookbook-level default attribute values (lowest precedence tier within "default") |
| `templates/` | ERB (`.erb`) files rendered with node context via the `template` resource |
| `files/` | Static, non-templated files distributed via `cookbook_file` |
| `libraries/` | Plain Ruby — helper methods, custom Chef DSL extensions |
| `resources/` | Custom resource definitions (the modern way to write reusable abstractions) |
| `providers/` | Legacy HWRP-style provider implementations (pre-custom-resources) |

### metadata.rb

```ruby
name             'my_cookbook'
maintainer       'DevOps Team'
maintainer_email 'devops@example.com'
license          'Apache-2.0'
description      'Installs and configures a webserver stack'
version          '1.2.0'

depends          'apt', '~> 7.0'          # declare dependencies + version constraints
supports         'ubuntu'
supports         'centos'
```

---

## 2. Generating a Cookbook

```bash
chef generate cookbook my_cookbook          # scaffolds the full directory + metadata.rb + a default test
chef generate recipe my_cookbook webserver  # adds recipes/webserver.rb
chef generate template my_cookbook nginx.conf.erb
chef generate attribute my_cookbook default
chef generate resource my_cookbook site     # scaffolds a custom resource under resources/
```

---

## 3. Recipe Syntax

A recipe is just Ruby. Resources are declared as `resource_type "name" do ... end` blocks:

```ruby
# recipes/default.rb

package 'nginx' do
  action :install
end

service 'nginx' do
  action [:enable, :start]   # multiple actions run in order
end

file '/var/www/html/index.html' do
  content '<h1>Hello from Chef</h1>'
  mode '0644'
  action :create
end
```

Because it's Ruby, you can use conditionals, loops, and variables freely:

```ruby
# Loop to install a list of packages
%w(git curl wget vim htop).each do |pkg|
  package pkg
end

# Conditional logic based on node attributes (see attributes-and-templates.md)
if node['platform_family'] == 'debian'
  package 'apache2'
else
  package 'httpd'
end
```

---

## 4. Resources Deep Dive

Every resource shares a common shape: a **type**, a **name**, a block of **properties**, and one or more **actions**. Guards (`only_if` / `not_if`) make a resource conditionally execute.

### Common resource attributes

| Attribute | Meaning |
|---|---|
| `action` | Which action(s) to run (defaults to a sensible one per resource, e.g. `:create` for `file`) |
| `only_if` | Resource only executes if the given block/command returns true / exit 0 |
| `not_if` | Resource only executes if the given block/command returns false / non-zero exit |
| `notifies` | Trigger another resource's action when this resource makes a change |
| `subscribes` | The inverse of `notifies` — declared on the *listening* resource |
| `guard_interpreter` | Which shell interprets string guards (defaults to `:default`, i.e. `sh`) |

### `package`

```ruby
package 'nginx' do
  version '1.18.0-0ubuntu1'   # pin a specific version
  action :install             # :install, :upgrade, :remove, :purge, :reconfig, :lock, :unlock
end
```

### `service`

```ruby
service 'nginx' do
  supports status: true, restart: true, reload: true
  action [:enable, :start]    # :start, :stop, :restart, :reload, :enable, :disable, :nothing
  only_if { ::File.exist?('/etc/nginx/nginx.conf') }
end
```

### `file`

```ruby
file '/etc/motd' do
  content "Welcome to #{node['hostname']}\n"
  owner 'root'
  group 'root'
  mode '0644'
  action :create               # :create, :create_if_missing, :delete, :touch
end
```

### `template` (ERB rendering — see attributes-and-templates.md for ERB syntax)

```ruby
template '/etc/nginx/nginx.conf' do
  source 'nginx.conf.erb'       # looked up in templates/default/
  owner 'root'
  group 'root'
  mode '0644'
  variables(
    worker_processes: node['nginx']['worker_processes'],
    listen_port: 80
  )
  notifies :reload, 'service[nginx]', :delayed
end
```

### `cookbook_file` (static file, no templating)

```ruby
cookbook_file '/usr/local/bin/healthcheck.sh' do
  source 'healthcheck.sh'       # looked up in files/default/
  mode '0755'
  action :create
end
```

### `directory`

```ruby
directory '/opt/myapp/logs' do
  owner 'appuser'
  group 'appuser'
  mode '0750'
  recursive true                # create parent dirs too (like mkdir -p)
  action :create
end
```

### `execute`

```ruby
execute 'run migrations' do
  command 'bundle exec rake db:migrate'
  cwd '/opt/myapp'
  environment 'RAILS_ENV' => 'production'
  user 'deploy'
  not_if 'test -f /opt/myapp/.migrated'   # idempotency guard - crucial for execute!
  action :run
end
```
`execute` is the escape hatch for anything without a dedicated resource — but it is **not idempotent by default**, so always pair it with `only_if`/`not_if` or `creates`.

### `cron`

```ruby
cron 'nightly_backup' do
  minute  '0'
  hour    '2'
  command '/opt/scripts/backup.sh >> /var/log/backup.log 2>&1'
  user    'root'
  action  :create               # :create, :delete
end
```

### `user` / `group`

```ruby
group 'deploy' do
  gid 2001
  action :create
end

user 'deploy' do
  comment 'Deployment user'
  uid 2001
  gid 2001
  home '/home/deploy'
  shell '/bin/bash'
  manage_home true
  action :create                # :create, :remove, :modify, :manage, :lock, :unlock
end
```

### `remote_file`

```ruby
remote_file '/opt/downloads/app.tar.gz' do
  source 'https://example.com/releases/app-1.2.0.tar.gz'
  checksum 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'  # verify integrity
  mode '0644'
  action :create
end
```

---

## 5. Notifications: `notifies` / `subscribes`

Notifications let one resource trigger an action on another **only when the notifying resource actually makes a change** — this is central to correct converge-phase ordering.

```ruby
template '/etc/nginx/nginx.conf' do
  source 'nginx.conf.erb'
  notifies :reload, 'service[nginx]', :delayed     # queued, runs once at end of converge phase
end

service 'nginx' do
  action [:enable, :start]
end
```

`subscribes` is the mirror image — declared on the resource that wants to *listen*:

```ruby
service 'nginx' do
  action [:enable, :start]
  subscribes :reload, 'template[/etc/nginx/nginx.conf]', :delayed
end
```

### `:immediately` vs. `:delayed`

| Timing | Behavior |
|---|---|
| `:delayed` (default) | Notification is queued and fires **once** at the very end of the converge phase, after de-duplication — the safe default; multiple templates notifying the same service only restart it once |
| `:immediately` | Fires **right after** the notifying resource completes, before the next resource in the compiled list runs — use when subsequent resources in the *same* recipe depend on the change (e.g., a package must be reinstalled before a following resource inspects its files) |

```ruby
package 'nginx' do
  action :install
  notifies :run, 'execute[verify nginx binary]', :immediately  # must happen before the next resource
end
```

---

## 6. Custom Resources (modern LWRP replacement)

Custom resources (introduced in Chef 12.5+) replace the old LWRP/HWRP (`resources/` + `providers/` two-file split) with a single file that declares both properties and actions. They are the standard way to build reusable, parameterized abstractions.

`resources/site.rb`:

```ruby
# my_cookbook/resources/site.rb
# Usage in a recipe:  my_cookbook_site 'example.com' do
#                        port 8080
#                        docroot '/var/www/example'
#                      end

property :port, Integer, default: 80
property :docroot, String, required: true
property :server_name, String, name_property: true   # defaults to the resource's name if not set

action :create do
  directory new_resource.docroot do
    recursive true
    action :create
  end

  template "/etc/nginx/sites-available/#{new_resource.server_name}" do
    source 'site.conf.erb'
    variables(
      server_name: new_resource.server_name,
      port: new_resource.port,
      docroot: new_resource.docroot
    )
    notifies :reload, 'service[nginx]', :delayed
  end

  link "/etc/nginx/sites-enabled/#{new_resource.server_name}" do
    to "/etc/nginx/sites-available/#{new_resource.server_name}"
  end
end

action :delete do
  file "/etc/nginx/sites-enabled/#{new_resource.server_name}" do
    action :delete
  end
end
```

Using it from a recipe:

```ruby
# recipes/default.rb
my_cookbook_site 'example.com' do
  port 8080
  docroot '/var/www/example'
  action :create
end
```

Key points:
- `property` declares a typed, validated input; `name_property: true` means it falls back to the resource's name string.
- `new_resource` inside an `action` block refers to the properties as configured by the caller.
- Custom resources compose ordinary resources (`directory`, `template`, `link`) — they are just reusable recipe fragments with a clean interface.
- Legacy **LWRP** (Lightweight Resource/Provider) used a separate `resources/*.rb` (actions/attributes only) + `providers/*.rb` (imperative `action :create do ... end` using `def whyrun_supported?` etc.) split — still supported for backward compatibility but custom resources are the documented modern approach for all new code.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
