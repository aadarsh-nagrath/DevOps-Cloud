# Inventory & Dynamic Inventory

Static inventory patterns, groups/children, dynamic inventory, cloud inventory plugins, and multi-environment layouts.

---

## 1. Static Inventory Patterns

```ini
# inventory/hosts.ini
[web]
web1.example.com
web2.example.com

[db]
db1.example.com
db2.example.com

[cache]
redis1.example.com

[prod:children]      # a "parent" group composed of other groups
web
db
cache

[prod:vars]           # vars applied to every host in every child group of prod
ansible_user=deploy
env=production
```

Ranges and patterns save typing for large fleets:
```ini
[web]
web[01:20].example.com          # web01 ... web20
db-[a:f].example.com            # db-a ... db-f
```

### Host and group variables inline
```ini
[web]
web1.example.com ansible_host=10.0.1.11 ansible_user=ubuntu ansible_port=22
web2.example.com ansible_host=10.0.1.12

[web:vars]
http_port=8080
```

### Patterns for targeting hosts on the CLI
```bash
ansible web -m ping                       # all hosts in group 'web'
ansible 'web:!web2.example.com' -m ping    # web group, excluding web2
ansible 'web:&prod' -m ping                # intersection: hosts in both web AND prod
ansible 'web1.example.com,db1.example.com' -m ping   # explicit list
ansible 'web*' -m ping                     # wildcard
ansible all -m ping --limit "web1.example.com,web2.example.com"
```

---

## 2. Dynamic Inventory Concept

Static files don't scale for cloud environments where instances are created/destroyed constantly. Dynamic inventory queries a live source (cloud API, CMDB) at runtime instead of reading a fixed file.

Modern Ansible uses **inventory plugins** (YAML-configured) rather than the older executable inventory scripts.

```bash
ansible-inventory -i aws_ec2.yml --graph     # visualize resolved groups as a tree
ansible-inventory -i aws_ec2.yml --list       # dump full resolved inventory as JSON
```

---

## 3. Cloud Inventory Plugins

### AWS EC2 — `amazon.aws.aws_ec2`

```yaml
# inventory/aws_ec2.yml
plugin: amazon.aws.aws_ec2
regions:
  - us-east-1
  - eu-west-1
filters:
  instance-state-name: running
  tag:Environment: production
keyed_groups:
  - key: tags.Role                 # creates groups named tag_Role_<value>, e.g. tag_Role_web
    prefix: tag_Role
  - key: placement.region
    prefix: region
hostnames:
  - tag:Name                        # use the Name tag as the inventory hostname
compose:
  ansible_host: public_ip_address   # connect using the public IP
```
Requires: `pip install boto3 botocore` and `ansible-galaxy collection install amazon.aws`, plus AWS credentials resolved the normal boto way (env vars, `~/.aws/credentials`, IAM role).

### Azure — `azure.azcollection.azure_rm`

```yaml
# inventory/azure_rm.yml
plugin: azure.azcollection.azure_rm
include_vm_resource_groups:
  - my-resource-group
auth_source: auto                 # uses az CLI login, env vars, or managed identity
keyed_groups:
  - key: tags.role
    prefix: tag_role
```

### GCP — `google.cloud.gcp_compute`

```yaml
# inventory/gcp_compute.yml
plugin: google.cloud.gcp_compute
projects:
  - my-gcp-project
zones:
  - us-central1-a
filters:
  - "status = RUNNING"
auth_kind: serviceaccount
service_account_file: /path/to/service-account.json
hostnames:
  - name
```

Use any of these directly:
```bash
ansible-playbook -i inventory/aws_ec2.yml site.yml
```
Or combine static and dynamic sources by pointing `-i` at a directory containing both a `hosts.ini` and an `aws_ec2.yml`.

---

## 4. Legacy Inventory Scripts

Before inventory plugins, dynamic inventory was an executable script (any language) that printed JSON matching a specific contract:

```bash
./inventory_script.py --list     # must output JSON: {"web": {"hosts": [...]}, "_meta": {"hostvars": {...}}}
./inventory_script.py --host web1.example.com   # per-host vars (rarely used now, --list + _meta preferred)
```
Still works (`ansible-playbook -i ./inventory_script.py site.yml`), but inventory plugins are preferred for anything new — less boilerplate, built-in caching, officially maintained.

---

## 5. `ansible-inventory` — Inspecting Resolved Inventory

```bash
ansible-inventory -i inventory/hosts.ini --graph          # tree view of groups/hosts
ansible-inventory -i inventory/hosts.ini --graph --vars     # tree view including vars
ansible-inventory -i inventory/hosts.ini --list             # full JSON dump
ansible-inventory -i inventory/hosts.ini --host web1.example.com   # vars for one host
```

Example `--graph` output:
```
@all:
  |--@prod:
  |  |--@web:
  |  |  |--web1.example.com
  |  |  |--web2.example.com
  |  |--@db:
  |  |  |--db1.example.com
  |--@ungrouped:
```

---

## 6. Multi-Environment Inventory Layout (dev / staging / prod)

Keep roles/playbooks identical across environments; vary only inventory + vars.

```
inventory/
├── dev/
│   ├── hosts.ini
│   └── group_vars/
│       ├── all.yml
│       └── web.yml
├── staging/
│   ├── hosts.ini
│   └── group_vars/
│       ├── all.yml
│       └── web.yml
└── production/
    ├── hosts.ini
    └── group_vars/
        ├── all.yml
        └── web.yml
```

```ini
# inventory/dev/hosts.ini
[web]
dev-web1.internal

[web:vars]
http_port=8080
app_replicas=1
```

```ini
# inventory/production/hosts.ini
[web]
prod-web1.internal
prod-web2.internal
prod-web3.internal

[web:vars]
http_port=80
app_replicas=3
```

Run against a specific environment explicitly — never rely on a default to avoid accidentally hitting prod:
```bash
ansible-playbook -i inventory/dev/hosts.ini site.yml
ansible-playbook -i inventory/production/hosts.ini site.yml --check --diff   # always dry-run prod first
```

For cloud-dynamic environments, mirror the same idea with per-environment plugin config files (`inventory/production/aws_ec2.yml` filtering on `tag:Environment: production`, etc.), and consider requiring `--check` or an explicit `-e confirm=yes` extra-var gate in CI pipelines that target production inventories.

---

See [Vault & Security](vault-and-security.md) for encrypting environment-specific secrets in `group_vars`, and [Advanced & Production Patterns](advanced-and-production-patterns.md) for fact-gathering performance at scale across large dynamic inventories.

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
