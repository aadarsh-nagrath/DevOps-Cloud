# Variables & Templating

Variable precedence, group_vars/host_vars, facts, Jinja2 templating deep dive, and magic variables.

---

## 1. Variable Precedence (Highest to Lowest)

Ansible merges variables from many sources. When the same variable is defined in more than one place, this order decides which value wins (most authoritative first):

| # | Source | Notes |
|---|---|---|
| 1 | `-e`/`--extra-vars` on the CLI | Always wins, including over vault-encrypted vars |
| 2 | Task-level `vars:` | Defined directly on the task |
| 3 | Block-level `vars:` | Applies to all tasks in the block |
| 4 | Role and include `vars:` (`include_role`/`import_role` with `vars:`) | Passed at inclusion point |
| 5 | Task `set_fact` / `register` | Registered at runtime, persists for the rest of the play |
| 6 | `role` (and include) `params:` | |
| 7 | Play `vars_files:` | |
| 8 | Play `vars_prompt:` | |
| 9 | Play `vars:` | |
| 10 | Host facts / cached facts (`ansible_facts`) | Gathered via `setup` module |
| 11 | `playbook host_vars/*` | host_vars adjacent to the playbook |
| 12 | `playbook group_vars/*` (most specific group, e.g. child before parent) | |
| 13 | `inventory host_vars/*` | host_vars inside the inventory directory |
| 14 | `inventory group_vars/*` | |
| 15 | Inventory file/script group vars | e.g. `[web:vars]` in INI |
| 16 | Inventory file/script host vars | e.g. `ansible_host=...` next to a host |
| 17 | Playbook `group_vars/all` | |
| 18 | Inventory `group_vars/all` | |
| 19 | Role `defaults/main.yml` | Lowest-priority "sane default," meant to be overridden |
| 20 | Command-line values (`ansible_user` from `-u`, etc.) | |

**Practical rule of thumb** (fewer than 20 things to remember day to day):

```
role defaults  <  inventory vars  <  playbook/group_vars/host_vars  <  play vars  <  set_fact/register  <  include/role vars  <  block/task vars  <  extra-vars (-e)
```

- `role defaults` (`roles/x/defaults/main.yml`) — the loosest, easiest to override, meant to be sensible fallbacks.
- `role vars` (`roles/x/vars/main.yml`) — much higher precedence, meant to be constants the role relies on and generally shouldn't be casually overridden.
- `-e` is the escape hatch for CI/ad-hoc overrides and should be used sparingly in normal playbook design — over-reliance makes behavior hard to predict from the repo alone.

Check what Ansible actually resolved for a host:
```bash
ansible-inventory --host web1.example.com --vars
```

---

## 2. `group_vars` and `host_vars`

Directory-based variable files, automatically loaded based on inventory group/host names — no explicit `vars_files:` needed.

```
inventory/
├── hosts.ini
├── group_vars/
│   ├── all.yml          # applies to every host
│   ├── web.yml          # applies to hosts in the [web] group
│   └── db.yml
└── host_vars/
    ├── web1.example.com.yml
    └── db1.example.com.yml
```

```yaml
# group_vars/web.yml
http_port: 80
app_env: production

# host_vars/web1.example.com.yml
ansible_host: 10.0.1.11
node_id: 1
```

For large var sets, `group_vars/web/` can be a **directory** of multiple files (merged together) instead of a single `web.yml` — useful for splitting secrets (vault-encrypted) from plaintext vars:
```
group_vars/
└── web/
    ├── vars.yml        # plaintext
    └── vault.yml        # ansible-vault encrypted, referenced via vars.yml as {{ vault_db_password }}
```

---

## 3. Facts

Facts are data Ansible automatically discovers about a managed node before running tasks (unless disabled).

```yaml
- hosts: web
  gather_facts: true      # default is true; set false to skip and speed up runs that don't need facts
  tasks:
    - name: Show OS family
      ansible.builtin.debug:
        msg: "{{ ansible_facts['os_family'] }} - {{ ansible_facts['distribution_version'] }}"
```

Common facts:

| Fact | Example value |
|---|---|
| `ansible_facts['os_family']` | `Debian`, `RedHat` |
| `ansible_facts['distribution']` | `Ubuntu`, `CentOS` |
| `ansible_facts['default_ipv4']['address']` | `10.0.1.11` |
| `ansible_facts['memtotal_mb']` | `7975` |
| `ansible_facts['processor_vcpus']` | `4` |
| `ansible_facts['hostname']` | `web1` |
| `ansible_facts['mounts']` | list of mounted filesystems |

Manually gather/inspect facts:
```bash
ansible web1.example.com -m setup                        # dump all facts
ansible web1.example.com -m setup -a "filter=ansible_distribution*"  # filter subset
```

### Custom facts

Drop a script or `.fact` (INI/JSON) file on the managed node under `/etc/ansible/facts.d/`, and Ansible automatically includes it under `ansible_facts['ansible_local']`:

```ini
# /etc/ansible/facts.d/app.fact  (on the managed node)
[general]
version = 2.3.1
deployed_by = ansible
```

```yaml
- name: Use a custom fact
  ansible.builtin.debug:
    msg: "App version: {{ ansible_facts['ansible_local']['app']['general']['version'] }}"
```

### Fact caching

Repeated fact-gathering across many hosts/runs is slow; cache it (see [Advanced & Production Patterns](advanced-and-production-patterns.md) for redis/jsonfile backends):
```ini
# ansible.cfg
[defaults]
gathering = smart          # skip re-gathering if cached facts are fresh
fact_caching = jsonfile
fact_caching_connection = /tmp/ansible_fact_cache
fact_caching_timeout = 86400   # seconds before cache is considered stale
```

---

## 4. Jinja2 Templating Deep Dive

Ansible uses Jinja2 for all `{{ }}` variable expressions and for the `template` module's `.j2` files.

### Basic expressions
```jinja2
{{ variable_name }}
{{ ansible_facts['hostname'] }}
{{ 1 + 2 }}
{{ "hello " + "world" }}
```

### Filters (`|`)
```jinja2
{{ name | upper }}                     {# HELLO #}
{{ name | lower }}
{{ my_list | join(", ") }}
{{ my_list | length }}
{{ my_dict | to_json }}
{{ my_dict | to_nice_yaml }}
{{ path | basename }}
{{ path | dirname }}
{{ value | default("fallback") }}      {# use "fallback" if value is undefined #}
{{ items | select("match", "^web") | list }}
{{ items | map(attribute="name") | list }}
{{ number | int }}
{{ string_value | bool }}
{{ my_list | unique }}
{{ my_list | sort }}
{{ password | password_hash("sha512") }}
{{ config_dict | combine(override_dict) }}   {# merge two dicts, override_dict wins #}
```

### Tests (`is`)
```jinja2
{{ 'yes' if my_var is defined else 'no' }}
{% if ansible_facts['os_family'] is match("RedHat") %} ... {% endif %}
{{ value is none }}
{{ value is number }}
{{ my_list is iterable }}
{{ result is succeeded }}
{{ result is failed }}
{{ result is skipped }}
```

### Conditionals in templates
```jinja2
{% if ansible_facts['os_family'] == "Debian" %}
apt-based-config-line
{% elif ansible_facts['os_family'] == "RedHat" %}
yum-based-config-line
{% else %}
generic-config-line
{% endif %}
```

### Loops in templates
```jinja2
{% for host in groups['web'] %}
server {{ host }}:8080;
{% endfor %}

{% for user in users %}
User: {{ user.name }}, Role: {{ user.role | default("guest") }}
{% endfor %}
```

### Example: nginx upstream template
```jinja2
{# templates/nginx-upstream.conf.j2 #}
upstream backend {
{% for host in groups['web'] %}
    server {{ hostvars[host]['ansible_host'] | default(host) }}:{{ http_port | default(80) }};
{% endfor %}
}
```

---

## 5. `template` vs `copy`

| | `copy` | `template` |
|---|---|---|
| Source content | Static, copied byte-for-byte | Rendered through Jinja2 before being placed |
| Use when | File never changes per-host/environment | File needs variable substitution (hostnames, ports, secrets, loops over inventory) |
| File extension convention | Any | `.j2` by convention (not required) |
| Can use `{{ }}` in source | No — treated literally | Yes — fully evaluated |

```yaml
- name: Static file, identical everywhere
  ansible.builtin.copy:
    src: files/motd
    dest: /etc/motd

- name: Per-host rendered config
  ansible.builtin.template:
    src: templates/app.conf.j2
    dest: /etc/app/app.conf
    mode: "0644"
    backup: true       # keep a timestamped .bak of the previous version if content changes
```

---

## 6. Vaulting Sensitive Vars (Intro)

Never store plaintext secrets in `group_vars`/`host_vars` committed to git. Encrypt them with `ansible-vault`:

```bash
ansible-vault encrypt_string 'S3cr3tPass!' --name 'db_password'
# paste the resulting !vault block into group_vars/db/vault.yml
```

```yaml
# group_vars/db/vault.yml (encrypted)
db_password: !vault |
  $ANSIBLE_VAULT;1.1;AES256
  663864396...
```
```yaml
# group_vars/db/vars.yml (plaintext, references the vault var)
db_connection_password: "{{ db_password }}"
```

Full vault workflow (create/edit/rekey/multiple vault IDs/CI integration) is covered in [Vault & Security](vault-and-security.md).

---

## 7. Magic Variables

Automatically available in every play, without declaring them:

| Variable | Meaning |
|---|---|
| `hostvars` | Dict of all variables for every host Ansible knows about — `hostvars['web1.example.com']['ansible_host']` |
| `groups` | Dict of all inventory groups and their member hosts — `groups['web']` is a list |
| `group_names` | List of groups the *current* host belongs to |
| `inventory_hostname` | The name of the current host as known to inventory (not necessarily its IP) |
| `inventory_hostname_short` | Just the short hostname portion |
| `inventory_dir` | Path to the directory holding the inventory file |
| `inventory_file` | Path to the inventory file itself |
| `play_hosts` | List of hosts in the current play's batch |
| `ansible_play_batch` | Hosts in the current serial batch |
| `ansible_version` | Dict with Ansible's own version info |
| `environment` | Reserved keyword for setting env vars on tasks, not a magic fact source |

```yaml
- name: Show every web host's IP
  ansible.builtin.debug:
    msg: "{{ item }} -> {{ hostvars[item]['ansible_host'] | default('n/a') }}"
  loop: "{{ groups['web'] }}"
```

---

See [Playbooks & Modules](playbooks-and-modules.md) for how `template`/`copy` fit into tasks, and [Vault & Security](vault-and-security.md) for the complete secrets workflow.

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
