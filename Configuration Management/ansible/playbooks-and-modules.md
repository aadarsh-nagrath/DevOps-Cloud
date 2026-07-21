# Playbooks & Modules

Playbook YAML syntax, tasks, handlers, the most-used built-in modules, conditionals, loops, tags, error handling, and idempotency principles.

---

## 1. Playbook Anatomy

A playbook is a list of **plays**. Each play maps hosts to tasks.

```yaml
---
- name: Configure web servers                # play name, shows in output
  hosts: web                                 # target group from inventory
  become: true                               # escalate privileges for all tasks in this play
  vars:
    http_port: 80
  tasks:
    - name: Install nginx                    # task name — always name your tasks
      ansible.builtin.package:
        name: nginx
        state: present

    - name: Start and enable nginx
      ansible.builtin.service:
        name: nginx
        state: started
        enabled: true
```

Run it:
```bash
ansible-playbook -i inventory/hosts.ini site.yml
ansible-playbook site.yml --limit web1.example.com   # restrict to one host
ansible-playbook site.yml --tags "nginx"             # run only tagged tasks
ansible-playbook site.yml -e "env=prod"              # pass extra vars
ansible-playbook site.yml --check --diff             # dry run + show changes
```

Use fully-qualified collection names (`ansible.builtin.package`) rather than bare `package` — required in newer Ansible, and unambiguous when multiple collections provide similarly-named modules.

---

## 2. Handlers & `notify`

Handlers run **once**, at the **end of the play**, only if notified, and only once even if notified multiple times.

```yaml
tasks:
  - name: Deploy nginx config
    ansible.builtin.template:
      src: nginx.conf.j2
      dest: /etc/nginx/nginx.conf
    notify: Restart nginx        # fires the handler below, but only if this task changed something

  - name: Deploy site config
    ansible.builtin.template:
      src: site.conf.j2
      dest: /etc/nginx/conf.d/site.conf
    notify: Restart nginx        # notifying twice still only restarts once

handlers:
  - name: Restart nginx
    ansible.builtin.service:
      name: nginx
      state: restarted
```

Force handlers to run even if a later task fails, with `--force-handlers`, or set `force_handlers: true` at the play level — useful so a mid-play failure doesn't leave a service un-restarted after config changed.

To run a handler immediately instead of at play end: `meta: flush_handlers`.

---

## 3. Common Modules Reference

### File & content management

```yaml
- name: Copy a static file
  ansible.builtin.copy:
    src: files/app.conf          # local file on control node
    dest: /etc/app/app.conf
    owner: root
    group: root
    mode: "0644"

- name: Render a Jinja2 template
  ansible.builtin.template:
    src: templates/app.conf.j2   # processed through Jinja2 before copying
    dest: /etc/app/app.conf
    mode: "0644"
  notify: Restart app

- name: Ensure a directory exists
  ansible.builtin.file:
    path: /var/log/app
    state: directory
    owner: app
    mode: "0750"

- name: Remove a file
  ansible.builtin.file:
    path: /tmp/old.log
    state: absent

- name: Create a symlink
  ansible.builtin.file:
    src: /opt/app/releases/v2
    dest: /opt/app/current
    state: link
```

### Packages & services

```yaml
- name: Install package (cross-distro)
  ansible.builtin.package:       # picks apt/yum/dnf automatically
    name: git
    state: present

- name: Install on Debian/Ubuntu specifically
  ansible.builtin.apt:
    name: nginx
    state: present
    update_cache: true          # runs apt-get update first

- name: Install on RHEL/CentOS/Fedora specifically
  ansible.builtin.yum:           # or ansible.builtin.dnf on modern RHEL/Fedora
    name: nginx
    state: latest

- name: Manage a service
  ansible.builtin.service:
    name: nginx
    state: started
    enabled: true                # start on boot
```

### Users & cron

```yaml
- name: Create a user
  ansible.builtin.user:
    name: deploy
    groups: sudo
    shell: /bin/bash
    create_home: true

- name: Add a cron job
  ansible.builtin.cron:
    name: "nightly backup"
    minute: "0"
    hour: "2"
    job: "/opt/scripts/backup.sh"
```

### Downloads & archives

```yaml
- name: Download a file
  ansible.builtin.get_url:
    url: https://example.com/app-1.2.0.tar.gz
    dest: /tmp/app-1.2.0.tar.gz
    checksum: sha256:abcdef1234...   # verify integrity

- name: Extract an archive
  ansible.builtin.unarchive:
    src: /tmp/app-1.2.0.tar.gz
    dest: /opt/app
    remote_src: true              # the archive is already on the managed node (not the control node)
```

### In-place text edits

```yaml
- name: Ensure a config line exists (single line)
  ansible.builtin.lineinfile:
    path: /etc/sysctl.conf
    line: "net.ipv4.ip_forward = 1"
    regexp: "^net.ipv4.ip_forward"   # replace this line if it matches, else append
    state: present

- name: Manage a block of config
  ansible.builtin.blockinfile:
    path: /etc/ssh/sshd_config
    block: |
      Match User deploy
        PasswordAuthentication no
    marker: "# {mark} ANSIBLE MANAGED BLOCK - deploy user"
  notify: Restart sshd
```
`blockinfile` wraps its content in marker comments so re-running updates the block cleanly instead of duplicating it.

---

## 4. `command` vs `shell` vs `script`

| Module | Shell features (pipes, redirects, env vars, globbing) | Runs via `/bin/sh` | Typical use |
|---|---|---|---|
| `command` | No | No | Safest default for running a binary with args — no shell injection risk |
| `shell` | Yes | Yes | When you need pipes, `&&`, redirection, or shell built-ins |
| `script` | Depends on script | N/A (runs a local script remotely) | Push a local script to the node and execute it there |

```yaml
- name: Safe - no shell interpretation needed
  ansible.builtin.command: /usr/bin/systemctl status nginx

- name: Needs a pipe, must use shell
  ansible.builtin.shell: "ps aux | grep nginx | wc -l"

- name: Run a local script on the remote host
  ansible.builtin.script: files/setup.sh
```

Prefer `command` over `shell` whenever no shell feature is actually needed — it avoids shell-injection surface and is easier to reason about for idempotency. Neither `command` nor `shell` is idempotent by default (they always report `changed`); guard them with `creates:`/`removes:` or `when:` + `register`.

```yaml
- name: Only run if the marker file doesn't exist yet
  ansible.builtin.command: /opt/app/install.sh
  args:
    creates: /opt/app/.installed     # skips task (and reports "ok") if this path already exists
```

---

## 5. Conditionals — `when`

```yaml
- name: Install Apache only on RedHat family
  ansible.builtin.package:
    name: httpd
    state: present
  when: ansible_facts['os_family'] == "RedHat"

- name: Only run for prod, and only if a var is set
  ansible.builtin.debug:
    msg: "Deploying to prod"
  when:
    - env == "prod"                 # multiple items in a list = AND
    - deploy_enabled | default(false)

- name: OR condition
  ansible.builtin.debug:
    msg: "Debian family"
  when: ansible_facts['os_family'] == "Debian" or ansible_facts['os_family'] == "Suse"
```

---

## 6. Loops

```yaml
# Modern loop syntax (preferred since Ansible 2.5+)
- name: Install multiple packages
  ansible.builtin.package:
    name: "{{ item }}"
    state: present
  loop:
    - git
    - curl
    - vim

# Looping over a list of dicts
- name: Create multiple users
  ansible.builtin.user:
    name: "{{ item.name }}"
    groups: "{{ item.groups }}"
  loop:
    - { name: alice, groups: sudo }
    - { name: bob,   groups: developers }

# Legacy with_items (still common in older codebases)
- name: Install packages (legacy syntax)
  ansible.builtin.package:
    name: "{{ item }}"
  with_items: [git, curl, vim]

# Looping over a dictionary
- name: Print each key/value
  ansible.builtin.debug:
    msg: "{{ item.key }} = {{ item.value }}"
  with_dict: "{{ my_config_dict }}"

# Loop control - custom loop var name and reduced verbosity
- name: Install packages, custom loop var
  ansible.builtin.package:
    name: "{{ pkg }}"
  loop: "{{ packages }}"
  loop_control:
    loop_var: pkg          # avoids clashing with an outer 'item' in nested loops
    label: "{{ pkg.name }}"  # shortens per-item output
    pause: 1                 # seconds to pause between iterations
```

`loop` (with filters like `| flatten`, `| dict2items`, `| product`) is preferred over the various `with_*` lookups for anything new — it's more consistent and easier to reason about.

---

## 7. Tags

```yaml
tasks:
  - name: Install nginx
    ansible.builtin.package:
      name: nginx
    tags:
      - install
      - nginx

  - name: Restart nginx
    ansible.builtin.service:
      name: nginx
      state: restarted
    tags:
      - nginx
      - never          # special tag: only runs if explicitly requested with --tags never
```

```bash
ansible-playbook site.yml --tags "nginx"        # run only tasks tagged nginx
ansible-playbook site.yml --skip-tags "install" # run everything except install-tagged tasks
ansible-playbook site.yml --tags "tagged"       # run only tasks that have any tag
ansible-playbook site.yml --list-tags           # show all tags in the playbook
```

Special tags: `always` (always runs unless explicitly skipped), `never` (only runs when named explicitly).

---

## 8. Blocks — `block` / `rescue` / `always`

Groups tasks for shared error handling and shared directives (`when`, `become`, tags applied to the whole block).

```yaml
tasks:
  - name: Deployment with rollback
    block:
      - name: Copy new release
        ansible.builtin.copy:
          src: releases/v2/
          dest: /opt/app/current/

      - name: Run migrations
        ansible.builtin.command: /opt/app/current/migrate.sh
    rescue:                                # runs only if a task in 'block' failed
      - name: Roll back to previous release
        ansible.builtin.command: /opt/app/rollback.sh

      - name: Notify on failure
        ansible.builtin.debug:
          msg: "Deployment failed, rolled back"
    always:                                # runs whether block succeeded or failed
      - name: Send deployment status
        ansible.builtin.uri:
          url: https://hooks.example.com/deploy-status
          method: POST
```

---

## 9. `register` + `debug`

Capture a task's result and inspect/act on it.

```yaml
- name: Check if a file exists
  ansible.builtin.stat:
    path: /etc/app/installed.marker
  register: marker_file

- name: Show the result
  ansible.builtin.debug:
    var: marker_file            # dumps the full registered variable
    # msg: "Exists: {{ marker_file.stat.exists }}"   # alternative: a formatted message

- name: Only run if the marker doesn't exist
  ansible.builtin.command: /opt/app/install.sh
  when: not marker_file.stat.exists

- name: Run a command and check its output
  ansible.builtin.command: /usr/bin/some-check
  register: check_result
  changed_when: false           # this command never changes state, don't report "changed"
  failed_when: "'ERROR' in check_result.stdout"   # custom failure condition
```

---

## 10. `delegate_to` & `run_once`

```yaml
- name: Add all web hosts to a load balancer, run from the LB host
  community.general.haproxy:
    state: enabled
    host: "{{ inventory_hostname }}"
  delegate_to: lb1.example.com      # this task executes on lb1, not on the current play host

- name: Run a single notification task once, not once per host
  ansible.builtin.debug:
    msg: "Deployment finished"
  run_once: true                    # only executes on the first host in the batch, still visible to all
```

`delegate_to: localhost` is common for tasks that should hit an API or local tool from the control node rather than the target (e.g., registering with a load balancer, calling a Slack webhook).

---

## 11. Check Mode & Diff Mode

```bash
ansible-playbook site.yml --check           # dry run - reports what WOULD change, makes no changes
ansible-playbook site.yml --check --diff    # also shows a diff of file/template changes
```

- Most built-in modules support check mode correctly; `command`/`shell` do not know how to "simulate," so they're skipped in check mode unless `check_mode: false` is forced on them (dangerous — defeats the point).
- Per-task override: `check_mode: false` forces a task to actually run even during a `--check` invocation; `check_mode: true` on a task forces it to only simulate even in a normal run.

---

## 12. Idempotency Principles

Idempotency = running the same playbook N times produces the same result as running it once, with no side effects on repeat runs.

- Built-in modules (`package`, `service`, `file`, `copy`, `template`, `user`, `lineinfile`) are idempotent by design — they check current state before acting and report `ok` (not `changed`) when nothing needed to change.
- `command` and `shell` are **not** idempotent by default — they run every time and always report `changed`. Make them idempotent yourself:
  ```yaml
  - name: Idempotent shell task via creates guard
    ansible.builtin.shell: /opt/app/install.sh
    args:
      creates: /opt/app/.installed     # skip if this file already exists
  ```
- Always test idempotency: run a playbook twice in a row — the second run should report `changed=0` (see [Testing & CI](testing-and-ci.md) for automated idempotency checks).
- Avoid tasks with side effects unconditionally tied to `changed_when: true` defaults (e.g. raw `command` calls that hit an API) — pair with `register` + `changed_when`/`failed_when` to make the result accurate.

---

See [Variables & Templating](variables-and-templating.md) for Jinja2 details used inside `template`, and [Roles & Collections](roles-and-collections.md) for organizing tasks/handlers into reusable roles.

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
