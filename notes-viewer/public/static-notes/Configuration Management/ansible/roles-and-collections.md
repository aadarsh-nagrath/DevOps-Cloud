# Roles & Collections

Role directory structure, ansible-galaxy, role dependencies, import/include semantics, Ansible Collections, and organizing large multi-role projects.

---

## 1. Role Directory Structure

A role is a self-contained, reusable bundle of automation for one piece of functionality (e.g., "nginx", "postgres", "app-deploy").

```
roles/
└── nginx/
    ├── defaults/
    │   └── main.yml        # lowest-precedence default vars, meant to be overridden
    ├── vars/
    │   └── main.yml         # higher-precedence "constants" for the role
    ├── tasks/
    │   └── main.yml         # the role's task list (entry point)
    ├── handlers/
    │   └── main.yml         # handlers notified from this role's tasks
    ├── templates/
    │   └── nginx.conf.j2     # Jinja2 templates used by this role
    ├── files/
    │   └── favicon.ico       # static files copied as-is
    ├── meta/
    │   └── main.yml          # role metadata + dependencies on other roles
    ├── tests/
    │   ├── inventory
    │   └── test.yml           # a minimal playbook to exercise the role
    └── README.md
```

Only the directories you actually use need to exist — Ansible silently skips missing ones.

---

## 2. Creating a Role — `ansible-galaxy init`

```bash
ansible-galaxy init roles/nginx     # scaffolds the full directory structure above
```

Using a role in a playbook:
```yaml
---
- name: Configure web servers
  hosts: web
  roles:
    - nginx                          # shorthand — runs roles/nginx/tasks/main.yml
    - role: app_deploy
      vars:
        app_version: "2.3.1"          # vars passed only to this role invocation
      tags: [deploy]
```

---

## 3. Role Dependencies — `meta/main.yml`

```yaml
# roles/webapp/meta/main.yml
galaxy_info:
  author: aadarsh-nagrath
  description: Deploys the webapp service
  license: MIT
  min_ansible_version: "2.14"
  platforms:
    - name: Ubuntu
      versions: [focal, jammy]

dependencies:                        # roles that must run BEFORE this role's tasks
  - role: common
  - role: nginx
    vars:
      nginx_worker_processes: 4
```

Roles listed under `dependencies` run automatically, once per unique parameter set, before the role's own `tasks/main.yml` — useful for enforcing "always configure the base OS/firewall/monitoring agent before app-specific roles."

---

## 4. Importing vs Including — Static vs Dynamic

| Directive | Parsing | Behavior |
|---|---|---|
| `import_playbook` | Static (parse time) | Playbook is pulled in as if inlined; all conditionals/tags evaluated up front |
| `import_role` | Static (parse time) | Role's tasks are pulled in at parse time; can't use loops on it |
| `import_tasks` | Static (parse time) | Task file included at parse time |
| `include_role` | Dynamic (run time) | Role is loaded and executed as tasks run; supports `loop`, runtime `when` per-iteration |
| `include_tasks` | Dynamic (run time) | Task file loaded at runtime; supports `loop` |

```yaml
# Static - resolved before the play starts, tags/when apply to all tasks inside as a whole
- import_playbook: webservers.yml

- name: Import a role statically
  import_role:
    name: nginx

# Dynamic - resolved during execution, can be looped, conditional per-iteration
- name: Include a role dynamically, once per item
  include_role:
    name: app_module
  loop:
    - auth-service
    - billing-service
  loop_control:
    loop_var: module_name

- name: Include a task file conditionally at runtime
  include_tasks: "{{ ansible_facts['os_family'] }}.yml"   # e.g. Debian.yml or RedHat.yml, chosen at runtime
```

**Rule of thumb**: use `import_*` when the structure is static and known ahead of time (simpler, tags/when propagate predictably, better for `--list-tasks`); use `include_*` when you need to loop over a role/task file, or choose it dynamically based on runtime facts.

---

## 5. Ansible Collections

A Collection is the modern distribution format bundling roles, modules, plugins, and playbooks together, namespaced as `namespace.collection`.

### Structure
```
my_namespace/
└── my_collection/
    ├── galaxy.yml              # collection metadata (name, version, dependencies)
    ├── README.md
    ├── plugins/
    │   ├── modules/
    │   ├── filter/
    │   └── inventory/
    ├── roles/
    │   └── some_role/
    └── playbooks/
```

### `requirements.yml` — pinning collections and roles

```yaml
# requirements.yml
collections:
  - name: community.general
    version: ">=7.0.0,<8.0.0"      # pin a version range
  - name: amazon.aws
    version: "7.1.0"
  - name: ansible.posix

roles:
  - name: geerlingguy.nginx        # roles from Galaxy
    version: "3.1.4"
  - src: https://github.com/org/custom-role.git   # roles from git
    scm: git
    version: main
    name: custom_role
```

```bash
ansible-galaxy collection install -r requirements.yml         # install pinned collections
ansible-galaxy role install -r requirements.yml                # install pinned roles
ansible-galaxy install -r requirements.yml                      # installs both, older combined syntax

ansible-galaxy collection install community.general              # install a single collection ad hoc
ansible-galaxy collection list                                    # show installed collections + versions
```

Reference a module from a collection with its fully-qualified name:
```yaml
- name: Use a module from community.general
  community.general.ufw:
    rule: allow
    port: "22"
    proto: tcp
```

---

## 6. Best Practices for Large Multi-Role Projects

- **One role per logical service/concern** (`nginx`, `postgres`, `app_deploy`, `monitoring_agent`) — avoid a single monolithic "everything" role.
- **`common`/`base` role** applied to all hosts first for OS hardening, package baselines, users, SSH config.
- **Environment separation via inventory, not roles** — keep the same roles for dev/staging/prod, vary only inventory vars (see [Inventory & Dynamic Inventory](inventory-and-dynamic-inventory.md)).
- **`site.yml` as the top-level entry point** that composes environment-specific playbooks:
  ```yaml
  # site.yml
  - import_playbook: webservers.yml
  - import_playbook: databases.yml
  - import_playbook: monitoring.yml
  ```
- **Pin all external roles/collections** in `requirements.yml` with explicit versions — never float on `latest` in CI.
- **Keep `defaults/main.yml` genuinely overridable** — anything environment-specific belongs there, not in `vars/main.yml`.
- **Idempotency-test every role** in isolation (see [Testing & CI](testing-and-ci.md) — Molecule scenarios per role).
- **Document role variables** in each role's `README.md` — required vars, optional vars + defaults, example usage.

### Example project layout
```
inventory/
├── production/
│   ├── hosts.yml
│   └── group_vars/
├── staging/
│   ├── hosts.yml
│   └── group_vars/
roles/
├── common/
├── nginx/
├── postgres/
└── app_deploy/
collections/
└── requirements.yml
site.yml
webservers.yml
databases.yml
ansible.cfg
```

---

## 7. Example: Production-Style `nginx` Role

```
roles/nginx/
├── defaults/main.yml
├── handlers/main.yml
├── meta/main.yml
├── tasks/main.yml
└── templates/nginx.conf.j2
```

```yaml
# defaults/main.yml
nginx_worker_processes: auto
nginx_worker_connections: 1024
nginx_listen_port: 80
nginx_server_name: "_"
```

```yaml
# tasks/main.yml
- name: Install nginx
  ansible.builtin.package:
    name: nginx
    state: present

- name: Deploy main nginx config
  ansible.builtin.template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
    mode: "0644"
  notify: Reload nginx

- name: Ensure nginx is running and enabled
  ansible.builtin.service:
    name: nginx
    state: started
    enabled: true
```

```yaml
# handlers/main.yml
- name: Reload nginx
  ansible.builtin.service:
    name: nginx
    state: reloaded
```

```jinja2
{# templates/nginx.conf.j2 #}
worker_processes {{ nginx_worker_processes }};

events {
    worker_connections {{ nginx_worker_connections }};
}

http {
    server {
        listen {{ nginx_listen_port }};
        server_name {{ nginx_server_name }};
    }
}
```

Usage:
```yaml
- hosts: web
  become: true
  roles:
    - role: nginx
      vars:
        nginx_listen_port: 8080
        nginx_server_name: "app.example.com"
```

---

See [Playbooks & Modules](playbooks-and-modules.md) for task-level syntax used inside roles, and [Testing & CI](testing-and-ci.md) for Molecule-based role testing.

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
