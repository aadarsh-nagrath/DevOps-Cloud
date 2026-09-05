# Ansible & Configuration Management — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. See also [`Configuration Management/`](../Configuration%20Management) in this repo (Ansible, Chef, Puppet). Grouped **Junior → Mid → Senior**, focused on Ansible with a Chef/Puppet comparison for breadth.

---

## Table of Contents
- [Junior Level (0–2 yrs)](#junior-level-02-yrs)
- [Mid Level (2–5 yrs)](#mid-level-25-yrs)
- [Senior Level (5+ yrs)](#senior-level-5-yrs)

---

## Junior Level (0–2 yrs)

### 1. What is Ansible, and what problem does it solve?
Ansible is an open-source configuration management, application deployment, and orchestration tool. It solves the problem of consistently configuring and managing many servers — instead of manually SSH-ing into each machine and running commands, you describe desired configuration declaratively in YAML ("playbooks") and Ansible applies it consistently across as many hosts as you target, in parallel.

### 2. What makes Ansible "agentless," and why does that matter?
Ansible requires no persistent agent/daemon installed on managed hosts — it connects over standard SSH (or WinRM for Windows) and pushes small Python modules to execute remotely, then removes them. This lowers the operational burden (nothing extra to install, patch, or keep running on every managed node) compared to agent-based tools like Chef/Puppet, at the cost of Ansible needing network/SSH access to every host at run time rather than each host independently pulling its own configuration on a schedule.

### 3. What is a playbook, and what is a task?
A playbook is a YAML file defining an ordered set of automation to run against a group of hosts. A task is a single unit of work within a playbook — typically a call to a module with specific parameters (e.g. "install nginx," "copy this file," "restart this service"), executed in the order written, top to bottom.

### 4. What is an inventory in Ansible?
An inventory lists the hosts Ansible manages, optionally organized into groups (`[webservers]`, `[dbservers]`) — either a static file (INI or YAML format) or dynamically generated (a script/plugin querying a cloud provider's API for current instances, essential when hosts are ephemeral/auto-scaled rather than fixed).

### 5. What is a module in Ansible, and give a few common examples.
A module is a discrete unit of functionality Ansible executes on a target host — the actual "verb" of a task. Common examples: `apt`/`yum` (package management), `copy`/`template` (file management), `service`/`systemd` (service management), `user` (user account management), `command`/`shell` (running arbitrary commands, used as a last resort), `git` (repository management).

### 6. What does "idempotent" mean, and why is it central to how Ansible modules are designed?
Idempotent means running the same operation multiple times produces the same end result as running it once — no unintended side effects from repetition. Ansible's built-in modules are specifically designed this way: `apt: name=nginx state=present` checks whether nginx is already installed and does nothing if it is, rather than blindly re-running an install command every time — this is what makes it safe to run the same playbook repeatedly (e.g. on a schedule, or after adding one new host) without worrying about accumulating side effects on hosts that were already compliant.

### 7. What's the difference between `ansible` (ad-hoc command) and `ansible-playbook`?
`ansible <group> -m <module> -a "<args>"` runs a single, one-off module invocation against a group of hosts directly from the command line — useful for quick checks or one-time actions ("is uptime consistent across these 20 hosts"). `ansible-playbook playbook.yml` executes a full playbook (potentially many ordered tasks, multiple plays, roles, handlers) — the standard way to run any actual, repeatable automation rather than one-off commands.

### 8. What is a variable in Ansible, and where can variables come from?
Variables parameterize playbooks/roles (e.g. a package version, an environment name) so the same automation can be reused with different values. They can come from many places with a defined precedence order: command-line `-e` (highest precedence), playbook/role `vars:`, `group_vars/`/`host_vars/` files (scoped per inventory group/host), inventory variables, and role defaults (`defaults/main.yml`, lowest precedence) — understanding this precedence order matters once a variable seems to have "the wrong value" and you need to find which source is winning.

### 9. What is a handler, and how is it different from a regular task?
A handler is a task that only runs when explicitly *notified* by another task (via `notify:`), and only runs once at the end of the play even if notified multiple times — the classic use case is "restart the service, but only if its configuration file actually changed," triggered by the `copy`/`template` task that manages that config file notifying a `restart nginx` handler, rather than unconditionally restarting the service on every single playbook run regardless of whether anything changed.

### 10. What is `ansible.cfg`, and what's a commonly configured setting in it?
`ansible.cfg` is Ansible's configuration file (checked in order: environment variable, current directory, home directory, `/etc/ansible/`), controlling defaults like the inventory file location, default remote user, SSH connection settings, and parallelism (`forks`, how many hosts Ansible connects to simultaneously) — commonly tuned in CI/production use to increase `forks` for faster runs against large fleets, or to point at a specific inventory file by default.

---

## Mid Level (2–5 yrs)

### 11. What is an Ansible role, and why structure playbooks as roles instead of one large playbook?
A role is a standardized directory structure (`tasks/`, `handlers/`, `templates/`, `files/`, `vars/`, `defaults/`, `meta/`) bundling a reusable, self-contained piece of automation (e.g. an "nginx" role, a "postgresql" role) that can be applied to any playbook by simply referencing its name. Roles enable reuse across projects/playbooks, a clear separation of concerns, easier testing in isolation, and sharing via Ansible Galaxy — a single large, flat playbook becomes unmaintainable and non-reusable well before a project reaches production scale.

### 12. What's the difference between `vars/main.yml` and `defaults/main.yml` in a role, given both define variables?
`defaults/main.yml` holds the *lowest-precedence* variable values — sensible defaults meant to be easily overridden by whoever consumes the role. `vars/main.yml` holds *higher-precedence* values, meant as role-internal constants not intended to be casually overridden by a caller. This distinction lets a role author clearly signal "these are safe/expected to customize" (defaults) vs. "these are internal implementation details" (vars).

### 13. What is Jinja2 templating in Ansible, and where is it used?
Jinja2 is the templating engine Ansible uses throughout — inside playbook YAML for variable interpolation (`{{ variable_name }}`) and conditionals/loops, and in `.j2` template files (deployed via the `template` module) to generate configuration files dynamically with variable substitution, conditionals (`{% if %}`), and loops (`{% for %}`) — e.g. generating an nginx config with a dynamically-populated list of upstream servers from an inventory group.

### 14. What's the difference between the `command`, `shell`, and `raw` modules, and why are they generally discouraged compared to purpose-built modules?
`command` runs a command directly without invoking a shell (no pipes, redirects, or environment variable expansion). `shell` runs it through an actual shell, enabling pipes/redirects but also shell injection risk if inputs aren't sanitized. `raw` bypasses Ansible's module system entirely, sending the command directly over SSH (used only for bootstrapping hosts too minimal to have Python installed yet, which most modules require). All three are generally discouraged versus purpose-built modules (`apt`, `copy`, `service`) because they are **not** idempotent by default — running `shell: apt-get install nginx` every time will "succeed" every time regardless of prior state, and won't correctly report "changed" vs. "ok" the way a proper module does, undermining `--check` mode and accurate change reporting.

### 15. What is Ansible's "check mode" (`--check`), and what's a `--diff` flag used for alongside it?
`--check` (dry-run mode) reports what *would* change without actually making any changes — useful for validating a playbook against production before committing to a real run. `--diff` shows the actual before/after content differences for modules that support it (like `template`/`copy`), which combined with `--check` lets you review exactly what configuration file changes a playbook would make before it makes them — though not every module fully supports accurate check-mode prediction, particularly ones wrapping arbitrary `shell`/`command` calls.

### 16. What is Ansible Vault, and what problem does it solve?
Ansible Vault encrypts sensitive data (passwords, API keys, entire variable files) at rest within your playbook/role source code, so secrets can be safely committed to version control alongside the rest of your automation. `ansible-vault encrypt secrets.yml` encrypts a file; `ansible-vault view`/`edit` work with the encrypted file transparently (decrypting only in memory); running a playbook that references vaulted variables requires supplying the vault password (`--ask-vault-pass`, a password file, or an external vault-password script integrating with a secrets manager) at execution time.

### 17. How would you manage different variable values for different environments (dev/staging/prod) in Ansible?
The standard pattern uses separate inventory files (or inventory groups) per environment, each with its own `group_vars/<environment>.yml` defining environment-specific values (different database hostnames, different resource sizing) — the same roles/playbooks then run unchanged against whichever environment's inventory you target, with Ansible resolving the correct variable values automatically based on which inventory group the targeted hosts belong to, rather than needing separate playbook logic per environment.

### 18. What are Ansible facts, and how do you gather custom facts beyond the built-in ones?
Facts are system information Ansible automatically collects from managed hosts at the start of a play (OS, IP addresses, CPU/memory, mounted filesystems) via the `setup` module, referenceable as variables (`ansible_facts['os_family']` or the shorthand `ansible_os_family`). Custom facts can be added via `fact_caching`-compatible custom fact scripts/files placed in `/etc/ansible/facts.d/` on managed hosts (returning JSON/INI), or gathered dynamically within a playbook using `set_fact` — useful for making playbooks conditionally branch on application-specific state, not just OS-level facts.

### 19. How do you run tasks conditionally, and how do you loop over a list of items in a task?
Conditionals use `when:` (e.g. `when: ansible_os_family == "Debian"`). Loops use `loop:` (the modern preferred syntax, replacing the older `with_items`) — e.g. `loop: "{{ user_list }}"` with `name: "{{ item }}"` inside the task to create multiple users from one task definition instead of duplicating the task per user.

### 20. What's the difference between Ansible, Chef, and Puppet at an architectural level?
Ansible is **agentless and push-based** — a control node connects out to managed hosts via SSH and pushes configuration on demand. Chef and Puppet are traditionally **agent-based and pull-based** — an agent daemon runs persistently on each managed node and periodically pulls its configuration from a central server (Chef Server / Puppet Master) on its own schedule, self-correcting drift automatically between runs without needing an external trigger. Chef configurations are written in a Ruby-based DSL ("recipes/cookbooks"); Puppet uses its own declarative DSL ("manifests"). The push/pull distinction matters operationally: pull-based tools continuously self-heal drift on their own schedule even if nobody manually triggers a run, while Ansible only corrects drift when a playbook is actually executed against a host.

---

## Senior Level (5+ yrs)

### 21. Design a configuration management strategy for a large, heterogeneous fleet (mixed OS versions, cloud and on-prem, some hosts ephemeral/auto-scaled). What role does Ansible play versus immutable infrastructure (baking configuration into images)?
For ephemeral, auto-scaled cloud infrastructure, the modern preferred pattern is largely **immutable infrastructure** — bake configuration into a machine image (via Packer, often itself using Ansible as the *provisioner* for the image-build step) so instances launch already fully configured, rather than being configured in-place after boot; this eliminates configuration-drift risk entirely for that fleet, since a "misconfigured" instance is simply terminated and replaced by a fresh one from the golden image rather than patched in place. Ansible's ongoing, in-place configuration management role becomes most valuable for **long-lived, harder-to-replace infrastructure** (on-prem hardware, legacy VMs that can't simply be replaced, or bootstrapping the images themselves) and for **orchestration tasks that aren't really "configuration"** at all (rolling restarts, coordinated multi-host deployments, running a one-off fleet-wide command). A dynamic inventory (querying the cloud provider's API, or a CMDB, for current hosts) is essential for the heterogeneous/ephemeral part of the fleet, since a static inventory file goes stale immediately in an auto-scaled environment.

### 22. How would you test Ansible roles/playbooks before they run against production, and what tools support this?
Layer testing similarly to application code: lint playbooks/roles with `ansible-lint` (catches style issues and known-bad patterns, like using `shell` where a proper module exists) as a fast, cheap first gate in CI. Use **Molecule** (the standard Ansible role-testing framework) to spin up an ephemeral test target (Docker container, or a VM via a cloud/Vagrant driver), apply the role, and assert on the resulting state (often via `testinfra`/`pytest`) — critically, also re-run the role a *second* time in the same test and assert nothing reports "changed" the second time, directly verifying idempotency rather than just assuming it. Stage real playbook runs through a non-production environment matching production as closely as feasible before ever targeting production inventory, and use `--check --diff` as an additional pre-flight sanity check for genuinely risky changes even after automated testing passes.

### 23. A playbook run against 500 hosts partially failed — some hosts succeeded, some failed mid-task, and you need to safely re-run against only the failed ones without re-running everything or risking hosts already updated. How do you handle this?
Ansible automatically writes a `.retry` file listing the hosts that failed on the last run (when `retry_files_enabled` is set, the default in many configurations) — `ansible-playbook playbook.yml --limit @playbook.retry` re-targets only those hosts. Because well-written Ansible tasks are idempotent, safely re-running the *entire* playbook against the previously-successful hosts as well generally causes no harm (they'll simply report "ok"/no-change for already-applied tasks) — but for tasks that are *not* naturally idempotent (a `shell`/`command` step with side effects, a one-time migration task), explicit safeguards are needed regardless (a `creates:`/`removes:` guard, or an idempotency check built into the task itself) — the real lesson from this scenario for a senior engineer is that a playbook with non-idempotent steps is exactly what turns "partial failure across 500 hosts" from a minor inconvenience into a genuinely risky cleanup problem, so idempotency discipline during initial playbook design is what actually prevents this class of pain, not just knowing the retry-file recovery mechanism after the fact.

### 24. How do you scale Ansible execution performance and reliability against a very large fleet (thousands of hosts), where a naive playbook run becomes impractically slow or unreliable?
Increase `forks` (parallel host connections) well beyond the low default, bounded by control-node resources (CPU/memory/network) and target-side SSH connection limits. Use **Ansible pull mode** (`ansible-pull`, where each host independently pulls and applies its own configuration from a Git repo on its own schedule via cron, rather than a single control node pushing to all of them serially/semi-parallel) for very large fleets where a single control node pushing to thousands of hosts becomes a real bottleneck and single point of coordination. Enable **fact caching** (Redis/JSON file-backed) so repeated runs don't re-gather the full facts payload from every host every single time if facts haven't meaningfully changed. Use `strategy: free` (instead of the default `linear`, which waits for every host to complete each task before any host proceeds to the next) when hosts don't need to stay in lockstep, letting faster hosts proceed independently rather than being bottlenecked by the slowest host in the batch — and for genuinely massive, frequent configuration management at scale, seriously evaluate whether a pull-based/agent-based tool (or immutable image-based infrastructure, per the earlier question) is actually a better architectural fit than continuing to push a single control node's Ansible runs harder.
