# Advanced and Production Patterns

Compile vs. converge internals, library helpers, handlers, HA, masterless operation, CI/CD integration, and the gotchas that bite experienced Chef users. See [cookbooks-and-recipes.md](cookbooks-and-recipes.md) and [testing-and-dev-workflow.md](testing-and-dev-workflow.md) for foundational context.

---

## 1. chef-client Run Phases in Depth

Every chef-client run has two conceptually distinct phases, and confusing them is the single biggest source of "why did my resource run in the wrong order" bugs.

| Phase | What happens |
|---|---|
| **Compile phase** | Chef loads and executes every recipe in the run-list **top to bottom, as plain Ruby**, building an in-memory "resource collection." Any Ruby code *outside* a resource block (variable assignments, `if` conditions on attributes, `Chef::Log.info`, library method calls) runs immediately here, in file order. Resources themselves are just added to the collection — their `action` blocks are **not** executed yet. |
| **Converge phase** | Chef walks the fully-built resource collection **in the order it was compiled** and actually executes each resource's action (checking current state, applying changes if needed, firing notifications). |

### Why this matters

```ruby
# recipes/default.rb

# This runs during COMPILE, immediately, in file order:
Chef::Log.info("Compiling recipe for #{node['hostname']}")
some_flag = node['myapp']['enabled']   # plain Ruby, evaluated at compile time

# This resource is only ADDED to the collection during compile;
# its actual package-check-and-install runs later, during converge:
package 'nginx' do
  action :install
end

# BUG: this `if` is evaluated at COMPILE time, before the package resource
# above has actually converged - so checking file existence here can be
# stale/wrong if the package resource is what would create that file.
if ::File.exist?('/etc/nginx/nginx.conf')
  Chef::Log.info('config exists')   # this check ran before nginx was even installed!
end
```

The fix for logic that must see **post-converge** state is to move it inside a `ruby_block` resource (which itself gets queued and executed during the converge phase, in its proper position) or to use `lazy { }` for a resource attribute that must be evaluated at converge time instead of compile time:

```ruby
file '/etc/motd' do
  content lazy { "Rendered at converge time: #{Time.now}" }  # lazy defers evaluation to converge phase
end

ruby_block 'check config after install' do
  block do
    Chef::Log.info('exists now') if ::File.exist?('/etc/nginx/nginx.conf')
  end
  action :run   # this block itself is a queued resource, so it executes in converge-phase order
end
```

**Practical rule**: resource declarations describe *what should exist*, evaluated in the order written but *executed* later — any Ruby logic that depends on another resource having already converged must be wrapped in `ruby_block` or use `lazy`.

---

## 2. Custom Resources vs. Legacy LWRP/HWRP

| | Custom Resource (modern, Chef 12.5+) | LWRP (legacy) | HWRP (legacy) |
|---|---|---|---|
| Files | Single file: `resources/name.rb` | Two files: `resources/name.rb` (properties/actions) + `providers/name.rb` (imperative logic) | Plain Ruby class overriding `Chef::Resource`/`Chef::Provider` directly |
| Declaring properties | `property :name, Type, default: x` | `attribute :name, kind_of: String` | Manual `attr_accessor` + `attribute` calls |
| Action implementation | `action :create do ... end` block, uses ordinary resources | `action :create do ... end` in the separate provider file | Full imperative Ruby, `run_action` calls |
| Compile/converge unification | `unified_mode true` (default since Chef 16) makes property compilation and action execution behave consistently | Split model can cause confusing compile-time vs. converge-time properties evaluation | Same split concern, worse since it's raw Ruby |
| Status | Recommended for all new code | Supported for backward compatibility, avoid for new work | Effectively deprecated |

```ruby
# Modern custom resource with unified_mode (default in current Chef, but explicit is clearer in older cookbooks)
resource_name :my_cookbook_site
unified_mode true

property :port, Integer, default: 80

action :create do
  # ...
end
```

`unified_mode true` ensures properties are resolved consistently regardless of whether they're accessed during compile or converge — a subtlety that caused hard-to-reproduce bugs in pre-unified-mode custom resources when a property's value depended on another resource's converge-time state.

---

## 3. Library Helpers

`libraries/*.rb` files are plain Ruby, auto-loaded before recipes run, and typically used to extend the Chef recipe DSL (`Chef::Recipe`, `Chef::Resource`) with reusable helper methods — keeping recipes declarative and pushing imperative logic into testable Ruby.

```ruby
# libraries/helpers.rb
module MyCookbook
  module Helpers
    def app_environment_tier
      # Reusable logic, callable from any recipe as a mixed-in method
      case node.chef_environment
      when 'production' then 'prod'
      when 'staging'    then 'stage'
      else 'dev'
      end
    end
  end
end

Chef::Recipe.include MyCookbook::Helpers     # mix into recipes
Chef::Resource.include MyCookbook::Helpers   # mix into custom resources too
```

```ruby
# recipes/default.rb
tier = app_environment_tier   # calls the library helper directly
template '/etc/myapp/config.yml' do
  variables(tier: tier)
end
```

Library code is ordinary Ruby, so it's the natural place to put anything ChefSpec-testable in isolation without spinning up a full recipe converge — pure functions belong here, not sprinkled as inline logic across recipes.

---

## 4. Handlers (Report / Exception)

Handlers hook into the end of a chef-client run (success or failure) to ship telemetry — to Slack, PagerDuty, a metrics backend, or just structured logs.

```ruby
# libraries/slack_handler.rb
require 'chef/handler'

class SlackNotifyHandler < Chef::Handler
  def report
    if run_status.success?
      Chef::Log.info("Run succeeded on #{node.name} in #{run_status.elapsed_time}s")
    else
      # run_status.exception holds the actual error for failed runs
      notify_slack("chef-client FAILED on #{node.name}: #{run_status.exception.message}")
    end
  end

  private

  def notify_slack(message)
    # ... POST to a Slack webhook
  end
end
```

```ruby
# In client.rb (Chef Infra Client config) or a recipe:
report_handlers << SlackNotifyHandler.new     # runs after every successful OR failed run
exception_handlers << SlackNotifyHandler.new  # runs specifically on unhandled exceptions
```

Report handlers are the standard mechanism for feeding chef-client run data into external observability (Chef Automate uses this exact mechanism internally).

---

## 5. Chef Infra Server HA Considerations

For fleets beyond a few hundred nodes, a single Chef Infra Server becomes both a scaling and availability risk:

- **Tiered/HA topology**: separate the API frontend, PostgreSQL (object storage), and search index (Elasticsearch/Solr) onto dedicated, independently-scalable/replicated tiers rather than a single all-in-one box.
- **Backend replication**: PostgreSQL streaming replication + regular `knife-ec-backup` (or Automate's backup tooling) snapshots — losing the server shouldn't mean losing cookbook/node history.
- **Bootstrap resilience**: since chef-client runs are pull-based on an interval, a brief server outage doesn't immediately break running nodes (they just skip a scheduled converge) — but new node bootstraps and cookbook uploads block until the server is back.
- **Caching cookbook artifacts**: a local mirror/cache (e.g., an S3-backed proxy in front of cookbook downloads) reduces load on the primary server for large fleets converging on similar schedules.
- **Rate-limit convergence**splay**: stagger chef-client's scheduled run times (`splay` in the client config) across nodes so thousands of nodes don't all hit the server in the same minute.

```ruby
# /etc/chef/client.rb on managed nodes
interval 1800    # run every 30 minutes
splay 300        # randomize actual start time by up to 5 minutes to avoid thundering herd
```

---

## 6. chef-client Daemon/Interval Runs vs. Chef Solo/Zero (Masterless)

| | chef-client (server mode) | Chef Solo / Chef Zero (masterless) |
|---|---|---|
| Requires Chef Infra Server | Yes | No |
| Node registration | Yes (client key + node object on server) | No — no central node object exists |
| Scheduling | systemd timer / cron / daemonized `chef-client -d`, on an interval | Typically invoked manually or via an external scheduler (cron calling `chef-client -z`) |
| Search API | Works (`search()` queries the server's index) | Does not work — no index to query |
| Data bags / encrypted data bags | Fetched from server | Must be present as local JSON files under `data_bags/` in the repo |
| Use case | Fleets needing central visibility, RBAC, reporting, drift correction at scale | Small/simple setups, bootstrapping images (Packer), CI ephemeral runners, air-gapped environments |

```bash
# Chef Zero: spins up an in-memory, ephemeral Chef server for the duration of this run
chef-client -z -o 'recipe[my_cookbook::default]'

# Chef Solo (older, more limited than Zero - no full server API emulation)
chef-solo -c solo.rb -o 'recipe[my_cookbook::default]'

# Daemonized server-mode client, running continuously with its own interval/splay
chef-client -d
```

Test Kitchen's default `provisioner: chef_zero` (see [testing-and-dev-workflow.md](testing-and-dev-workflow.md)) is exactly this masterless mode — that's why kitchen tests don't need a real Chef Infra Server.

---

## 7. Integrating Chef in CI/CD

Typical pipeline stages for a cookbook repo:

```yaml
# Example CI stages (tool-agnostic pseudo-pipeline)
stages:
  - lint:        cookstyle .
  - unit_test:   chef exec rspec spec/
  - integration: kitchen test                 # boots real VMs/containers, runs InSpec
  - dependency_resolve: chef install           # or berks install
  - publish:
      only: main branch, on success
      run:
        - chef push production policyfiles/webserver.rb   # Policyfile workflow
        # or: knife cookbook upload my_cookbook            # legacy roles/environments workflow
  - promote:
      manual_approval: true
      run: chef update-policy-group production webserver 1.4.0   # promote a specific pinned version
```

Key CI principles:
- Never let `knife cookbook upload`/`chef push` run automatically from a feature branch — gate publishing to `main` merges (or a manual approval step) so the server always reflects a reviewed state.
- Run `kitchen test` against the same platforms you actually run in production (matching `platforms:` in `.kitchen.yml` to your real fleet's OS versions) — passing tests on Ubuntu 22.04 tells you nothing about a CentOS 7 fleet.
- Use `dokken` driver in CI for speed; reserve `vagrant`/nested-virtualization drivers for local development or specific tests that need real VM behavior.

---

## 8. Common Real-World Gotchas

| Gotcha | What happens | Fix |
|---|---|---|
| **Attribute precedence confusion** | An `override` set in a cookbook attribute file gets silently beaten by an environment's `override_attributes` — engineers expect cookbook-level overrides to always win | Memorize the full 15-tier order in [attributes-and-templates.md](attributes-and-templates.md#1-attribute-precedence--the-full-order); prefer Policyfiles to collapse the number of override sources |
| **Notification timing bugs** | Using `:immediately` where `:delayed` was intended causes a service to restart multiple times mid-converge instead of once at the end; using `:delayed` where `:immediately` was needed means a later resource reads stale state | Default to `:delayed` unless a specific later resource in the *same run* needs the change to have already happened |
| **Ruby version / gem conflicts in cookbooks** | A cookbook's `libraries/` code requires a gem not present in the embedded Chef Ruby (Chef ships its own Ruby + gemset, isolated from system Ruby) | Declare gem dependencies via the `chef_gem` resource (installs into Chef's own gemset) rather than assuming system gems are available |
| **Resource cloning deprecation** | Declaring two resources with the same type+name silently "clones" the first resource's properties onto the second in older Chef — this was deprecated and removed because it caused confusing, implicit property inheritance | Never declare duplicate `type 'name'` resources; if you need to modify an already-declared resource, use `edit_resource`/find it explicitly instead of re-declaring |
| **why-run / `--why-run` dry-mode limitations** | `chef-client --why-run` predicts what *would* change without applying it, but many resources (`execute`, custom resources with imperative Ruby inside `action` blocks) can't accurately predict their effects without actually running — why-run output can be simply wrong for these | Don't treat `--why-run` as a reliable "plan" the way `terraform plan` is; validate via Test Kitchen + InSpec instead of trusting dry-run predictions for anything beyond simple built-in resources |
| **Compile-phase side effects** | Code outside resource blocks (e.g., calling an external API to fetch config) runs on *every* compile, even if nothing converges — surprising when it causes network calls or slow recipes on every single run regardless of drift | Keep compile-phase Ruby cheap and side-effect-free; push anything expensive/stateful into a `ruby_block` so it only executes when explicitly triggered as part of convergence |
| **`only_if`/`not_if` string vs. block guards silently using the wrong shell** | A string guard (`only_if 'test -f /path'`) runs via `sh`, not `bash` — bashisms silently fail or behave differently | Use a Ruby block guard (`only_if { ::File.exist?('/path') }`) instead of shelling out where possible; it's faster and avoids shell semantics entirely |

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
