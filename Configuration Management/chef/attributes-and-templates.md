# Attributes and Templates

Attribute precedence, Ohai automatic attributes, ERB templating, data bags, and the search API. See [chef.md](chef.md) for the overview and [cookbooks-and-recipes.md](cookbooks-and-recipes.md) for the `template`/`file` resources these attributes feed into.

---

## 1. Attribute Precedence — The Full Order

Chef merges attributes from multiple sources into a single node object at the start of every chef-client run. Attributes are set at a **precedence level** (default, force_default, normal, override, force_override, automatic) and can additionally come from different **sources** (cookbook attribute file, role, environment, recipe, or Ohai). The final value a resource sees is whichever source/level combination wins.

### Precedence levels (lowest to highest)

| Level | Set via | Typical use |
|---|---|---|
| `default` | `default['key'] = value` in attribute file/recipe; role/environment `default_attributes` | Cookbook-supplied sane defaults, safe to override |
| `force_default` | `force_default['key'] = value` | Rarely used; forces a default even over role/env defaults |
| `normal` | `normal['key'] = value`; also `node.normal['key']` set via `knife node edit` | Persisted node-specific facts that should stick between runs |
| `override` | `override['key'] = value` in attribute file/recipe; role/environment `override_attributes` | Values that must win over cookbook defaults (e.g., env-specific ports) |
| `force_override` | `force_override['key'] = value` | Highest manually-settable level; wins over everything except automatic |
| `automatic` | Set exclusively by **Ohai** each run | Facts about the actual machine (IP, platform, memory) — never set this yourself |

### Combined precedence order (full 15-way resolution Chef actually performs)

Within `default`, `override`, and `normal`, the **source** also matters — attributes set at the cookbook level are the weakest, node-level (`normal`) are attribute-file-independent, and role/environment attributes interact with cookbook attributes at the same precedence tier. The full resolution order, lowest to highest:

```
1.  default          (attribute file in a cookbook)
2.  default          (attribute set in a recipe)
3.  default          (role default_attributes)
4.  default          (environment default_attributes)
5.  force_default     (attribute file in a cookbook)
6.  force_default     (attribute set in a recipe)
7.  normal            (attribute file in a cookbook)
8.  normal            (attribute set in a recipe)
9.  override          (attribute file in a cookbook)
10. override          (attribute set in a recipe)
11. override          (role override_attributes)
12. override          (environment override_attributes)
13. force_override     (attribute file in a cookbook)
14. force_override     (attribute set in a recipe)
15. automatic          (Ohai — always wins over everything above)
```

**Rule of thumb**: `automatic` (Ohai) always wins. Among manually-set attributes, `override` beats `default`, and within each tier, environment beats role beats recipe beats cookbook attribute file. `force_*` variants exist specifically to jump ahead of role/environment attributes at the same base tier — use sparingly, they make precedence harder to reason about.

```ruby
# attributes/default.rb (cookbook attribute file)
default['nginx']['worker_processes'] = 2
default['nginx']['listen_port'] = 80

# recipes/default.rb — override for this run only, still 'override' tier
override['nginx']['listen_port'] = 8080 if node.chef_environment == 'staging'
```

---

## 2. Ohai Automatic Attributes

Ohai runs at the start of every chef-client run and populates the `automatic` precedence level with real facts about the machine. These are read-only from a cookbook author's perspective (attempting to set them at a lower tier has no effect since `automatic` always wins).

```ruby
node['platform']            # "ubuntu", "centos", "redhat"...
node['platform_family']      # "debian", "rhel"...
node['platform_version']
node['ipaddress']
node['fqdn']
node['hostname']
node['memory']['total']
node['cpu']['total']
node['filesystem']
node['kernel']['machine']    # "x86_64", "aarch64"
node['os']                   # "linux", "windows", "darwin"
```

```bash
# Inspect all Ohai facts for the current machine
ohai

# Inspect just one plugin's output
ohai platform
```

Use Ohai attributes to branch logic per-OS/platform:

```ruby
package_name = case node['platform_family']
               when 'debian' then 'apache2'
               when 'rhel'   then 'httpd'
               else raise "Unsupported platform: #{node['platform_family']}"
               end
package package_name
```

---

## 3. ERB Templates Deep Dive

Templates live in `templates/default/*.erb` and are rendered by the `template` resource with full access to node attributes plus any `variables()` passed in.

### `<%= %>` vs `<% %>`

| Syntax | Purpose |
|---|---|
| `<%= expr %>` | Evaluates `expr` and **inserts its result** into the rendered output |
| `<% code %>` | Evaluates `code` for control flow (if/each/etc.) — **produces no output itself** |
| `<%- code -%>` | Same as `<% %>` but trims surrounding whitespace/newlines — keeps rendered files clean |
| `<%# comment %>` | Template comment, stripped entirely from output |

### Example template: `templates/default/nginx.conf.erb`

```erb
# Managed by Chef - do not edit by hand
worker_processes <%= @worker_processes %>;

events {
    worker_connections <%= node['nginx']['worker_connections'] %>;
}

http {
    server {
        listen <%= @listen_port %>;
        server_name <%= node['fqdn'] %>;

<% if @enable_gzip -%>
        gzip on;
<% end -%>

<% @upstream_servers.each do |srv| -%>
        # upstream: <%= srv %>
<% end -%>
    }
}
```

### Passing data with `variables()`

Templates can read `node[...]` directly, but explicit `variables()` is preferred for anything not already a node attribute — it makes the template's inputs explicit and testable:

```ruby
template '/etc/nginx/nginx.conf' do
  source 'nginx.conf.erb'
  variables(
    worker_processes: node['nginx']['worker_processes'],
    listen_port: 8080,
    enable_gzip: true,
    upstream_servers: %w(10.0.1.10 10.0.1.11)
  )
  notifies :reload, 'service[nginx]', :delayed
end
```
Inside the `.erb` file, each key becomes an instance variable (`@worker_processes`, `@listen_port`, etc.) — note the `@` prefix, unlike node attributes which are accessed via `node['key']`.

---

## 4. Data Bags

Data bags are global, cookbook-independent JSON stores on the Chef Infra Server — the right place for cross-cutting structured data (a list of users, service credentials, feature flags) that isn't tied to any one node's attributes.

### Plain data bag

```bash
# Create the data bag and an item
knife data bag create users
knife data bag from file users alice.json
```

```json
// data_bags/users/alice.json
{
  "id": "alice",
  "full_name": "Alice Smith",
  "ssh_keys": ["ssh-ed25519 AAAA..."]
}
```

```ruby
# recipes/default.rb - reading a plain data bag item
user_data = data_bag_item('users', 'alice')
user user_data['id'] do
  comment user_data['full_name']
end
```

### Encrypted data bag (for secrets)

```bash
# Generate a shared secret file once, distribute it securely to nodes/workstation
openssl rand -base64 512 | tr -d '\r\n' > encrypted_data_bag_secret

# Create an encrypted item
knife data bag create secrets db_password --secret-file encrypted_data_bag_secret
```

```ruby
# recipes/default.rb - reading an encrypted data bag item
secret = Chef::EncryptedDataBagItem.load_secret('/etc/chef/encrypted_data_bag_secret')
db_creds = Chef::EncryptedDataBagItem.load('secrets', 'db_password', secret)

template '/etc/myapp/database.yml' do
  source 'database.yml.erb'
  variables(password: db_creds['password'])
  sensitive true   # suppress this resource's diff output from logs (avoid leaking secrets)
end
```
Encrypted data bags use per-item shared-secret symmetric encryption (AES) — every node that needs to decrypt an item needs the same secret file distributed out-of-band (e.g., via a secrets manager, not committed to git).

---

## 5. Search API

Chef Infra Server indexes node objects (and data bags) in Solr/Elasticsearch, queryable via the `search()` method — this lets one node's recipe discover facts about other nodes (a classic use: a load balancer recipe enumerating all web nodes by role).

```ruby
# Find all nodes with "web" in their run-list/role, in the production environment
web_nodes = search(:node, 'role:web AND chef_environment:production')

web_nodes.each do |web_node|
  puts "Web node: #{web_node['fqdn']} - #{web_node['ipaddress']}"
end
```

```ruby
# Build an nginx upstream block dynamically from search results
template '/etc/nginx/conf.d/upstream.conf' do
  source 'upstream.conf.erb'
  variables(
    upstream_ips: search(:node, 'role:web').map { |n| n['ipaddress'] }
  )
end
```

```ruby
# Search a data bag
search(:users, 'full_name:Alice*')
```

Search queries use Lucene syntax (`field:value`, `AND`/`OR`, wildcards). Search always hits the Chef Infra Server, so it only works in server mode — not under Chef Solo/Zero (masterless), which has no index to query.

---

Continue to [roles-environments-and-orgs.md](roles-environments-and-orgs.md) for how roles/environments layer attributes on top of what's covered here.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
