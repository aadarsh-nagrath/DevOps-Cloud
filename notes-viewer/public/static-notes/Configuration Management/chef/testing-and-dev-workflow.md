# Testing and Dev Workflow

Test Kitchen, ChefSpec, InSpec, dependency management, linting, and the full local development loop for cookbooks. See [cookbooks-and-recipes.md](cookbooks-and-recipes.md) for the resources/custom resources being tested here.

---

## 1. The Testing Pyramid for Chef

| Layer | Tool | Tests | Speed |
|---|---|---|---|
| Lint | Cookstyle (Foodcritic's successor) | Ruby style, deprecated Chef patterns | Fastest (seconds) |
| Unit | ChefSpec | "Would resource X converge with action Y given these attributes?" — no real machine | Fast (seconds), no VM/container boot |
| Integration | Test Kitchen + InSpec | "Does a real VM/container actually end up in the right state after converge?" | Slow (minutes) — boots real infra |

Run them in that order locally, and again in CI, before ever pushing a cookbook to the Chef Infra Server.

---

## 2. Test Kitchen

Test Kitchen provisions ephemeral VMs/containers, converges your cookbook on them, runs InSpec verification, then tears them down — giving you a real integration test without touching production infrastructure.

### `.kitchen.yml`

```yaml
---
driver:
  name: vagrant             # or 'dokken' for Docker-based, much faster runs

provisioner:
  name: chef_zero            # masterless convergence for testing - no real Chef Infra Server needed
  product_name: chef
  product_version: 18

verifier:
  name: inspec

platforms:
  - name: ubuntu-22.04
  - name: centos-8

suites:
  - name: default
    run_list:
      - recipe[my_cookbook::default]
    attributes:
      nginx:
        listen_port: 8080
  - name: webserver
    run_list:
      - recipe[my_cookbook::webserver]
    verifier:
      inspec_tests:
        - test/integration/webserver
    attributes: {}
```

### Drivers

| Driver | Backing | Notes |
|---|---|---|
| `kitchen-vagrant` | VirtualBox/VMware VMs | Full-fidelity OS testing, slow to boot (~30-60s+) |
| `kitchen-dokken` | Docker containers | Much faster (~5-10s), but not all resources behave identically in a container (e.g., systemd quirks) |

### Full command cycle

```bash
kitchen list                # show all suite/platform combos and their state
kitchen create default-ubuntu-2204   # provision the VM/container, no converge yet
kitchen converge default-ubuntu-2204  # run chef-client against it (idempotent - safe to re-run)
kitchen verify default-ubuntu-2204    # run InSpec tests against the converged instance
kitchen login default-ubuntu-2204     # SSH/docker exec in to poke around manually
kitchen destroy default-ubuntu-2204   # tear down

kitchen test                # create + converge + verify + destroy, for every suite/platform - the CI command
```

---

## 3. ChefSpec — Unit Testing Recipes

ChefSpec runs recipes through a **fake converge** (`ChefSpec::SoloRunner`) — no real machine involved — and lets you assert which resources *would* have been applied, with what actions and properties, given a set of node attributes/platform.

```ruby
# spec/unit/recipes/default_spec.rb
require 'chefspec'

describe 'my_cookbook::default' do
  # Run the recipe as if converging on Ubuntu 22.04
  let(:chef_run) { ChefSpec::SoloRunner.new(platform: 'ubuntu', version: '22.04').converge(described_recipe) }

  it 'installs nginx' do
    expect(chef_run).to install_package('nginx')
  end

  it 'enables and starts the nginx service' do
    expect(chef_run).to enable_service('nginx')
    expect(chef_run).to start_service('nginx')
  end

  it 'creates the nginx config from a template' do
    expect(chef_run).to create_template('/etc/nginx/nginx.conf').with(
      owner: 'root',
      mode: '0644'
    )
  end

  it 'restarts nginx when the config template changes' do
    template = chef_run.template('/etc/nginx/nginx.conf')
    expect(template).to notify('service[nginx]').to(:reload).delayed
  end

  context 'when running on CentOS' do
    let(:chef_run) { ChefSpec::SoloRunner.new(platform: 'centos', version: '8').converge(described_recipe) }

    it 'installs httpd instead of apache2' do
      expect(chef_run).to install_package('httpd')
    end
  end
end
```

```bash
chef exec rspec spec/unit/recipes/default_spec.rb   # run inside Chef Workstation's Ruby env
```

ChefSpec is fast precisely because it stubs out the actual providers — it verifies *what Chef would try to do*, not that the machine ends up correct. That's what InSpec/Test Kitchen is for.

---

## 4. InSpec — Compliance / Integration Testing

InSpec asserts on **actual observed system state** — files, packages, services, ports, users — independent of how that state was achieved (works equally well for auditing manually-configured machines).

```ruby
# test/integration/default/default_test.rb (or a standalone InSpec profile)

describe package('nginx') do
  it { should be_installed }
end

describe service('nginx') do
  it { should be_enabled }
  it { should be_running }
end

describe port(80) do
  it { should be_listening }
end

describe file('/etc/nginx/nginx.conf') do
  it { should exist }
  its('mode') { should cmp '0644' }
  its('content') { should match(/worker_processes 4/) }
end

describe command('curl -s http://localhost') do
  its('stdout') { should include 'Hello from Chef' }
  its('exit_status') { should eq 0 }
end
```

```bash
inspec exec test/integration/default        # run a profile standalone against localhost
inspec exec test/integration/default -t ssh://user@host   # run against a remote target
inspec exec supermarket://dev-sec/cis-docker-benchmark    # run a published compliance profile
```

Test Kitchen's `verifier: inspec` block wires this in automatically as part of `kitchen verify`.

---

## 5. Dependency Management: Berkshelf vs. Policyfile

Covered in depth in [roles-environments-and-orgs.md](roles-environments-and-orgs.md#5-policyfiles--the-modern-alternative). For local dev:

```bash
# Berkshelf workflow
berks install       # resolve deps from Berksfile into local cache
berks update nginx   # bump one dependency

# Policyfile workflow (preferred for new cookbooks)
chef install         # resolve deps from Policyfile.rb, writes Policyfile.lock.json
```
Test Kitchen respects whichever is present — if a `Policyfile.rb` exists, `provisioner: chef_zero` will use it automatically; otherwise it falls back to `metadata.rb`/`Berksfile` resolution.

---

## 6. Linting: Cookstyle (successor to Foodcritic)

Cookstyle is a RuboCop wrapper preloaded with Chef-specific cops that catch deprecated resource syntax, unsafe patterns, and style violations.

```bash
cookstyle cookbooks/my_cookbook            # lint one cookbook
cookstyle --auto-correct cookbooks/my_cookbook   # auto-fix what's safe to fix
cookstyle --display-cop-names cookbooks/my_cookbook  # show which rule triggered, for suppressing false positives
```

Example finding: `ChefDeprecations/ResourceWithoutUnifiedMode` flags a custom resource missing `unified_mode true`, a required declaration since Chef 15+ that unifies compile/converge behavior for custom resources (see [advanced-and-production-patterns.md](advanced-and-production-patterns.md) for why compile vs. converge timing matters).

**Foodcritic** was the predecessor linter (pre-Chef 14 era) — you may still see `.foodcritic` config files in legacy cookbooks, but it's unmaintained; migrate to Cookstyle.

---

## 7. The Full Local Dev Loop

```bash
# 1. Scaffold
chef generate cookbook my_cookbook
cd my_cookbook

# 2. Write a recipe/resource, then lint continuously
cookstyle .

# 3. Fast unit-test feedback loop
chef exec rspec spec/

# 4. Resolve dependencies
chef install            # or: berks install

# 5. Boot a real instance and converge
kitchen converge default-ubuntu-2204

# 6. Verify actual system state
kitchen verify default-ubuntu-2204

# 7. Iterate: edit recipe -> re-converge (idempotent, fast after first boot)
kitchen converge default-ubuntu-2204

# 8. Tear down when done
kitchen destroy default-ubuntu-2204

# 9. CI runs the whole matrix non-interactively
kitchen test
```

A typical CI pipeline stage order: `cookstyle` -> `rspec` (ChefSpec) -> `kitchen test` (Test Kitchen + InSpec) -> on success, `chef push`/`knife cookbook upload` to promote.

---

Continue to [advanced-and-production-patterns.md](advanced-and-production-patterns.md) for compile/converge internals and production operational concerns.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
