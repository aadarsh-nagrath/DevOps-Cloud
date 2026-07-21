# Testing & CI

ansible-lint, yamllint, Molecule testing framework, check/diff dry runs, idempotency testing, CI pipeline integration, and version pinning.

---

## 1. `ansible-lint`

Static analysis for playbooks/roles — catches deprecated syntax, style violations, and known-bad patterns beyond what YAML syntax checking alone would catch.

```bash
pip install ansible-lint
ansible-lint site.yml
ansible-lint roles/nginx/
ansible-lint --profile production        # stricter ruleset intended for production-grade repos
```

```yaml
# .ansible-lint - project config
profile: production
exclude_paths:
  - .cache/
  - molecule/
skip_list:
  - yaml[line-length]     # allow long lines, handled separately by yamllint if desired
```

Common findings: unnamed tasks, use of `command`/`shell` where a proper module exists, missing `mode:` on file-creating tasks (security), use of deprecated `include` instead of `include_tasks`/`import_tasks`, `latest` version pins.

---

## 2. `yamllint`

Pure YAML syntax/style linting (indentation, line length, trailing spaces) — complements `ansible-lint`, which focuses on Ansible-specific semantics.

```bash
pip install yamllint
yamllint .
```

```yaml
# .yamllint
extends: default
rules:
  line-length:
    max: 160
  truthy:
    allowed-values: ["true", "false"]   # disallow yes/no/True/False, enforce consistent booleans
  indentation:
    spaces: 2
```

Run both together in CI/pre-commit:
```bash
yamllint . && ansible-lint
```

---

## 3. Molecule — Testing Framework

Molecule tests roles (or whole scenarios) in isolated, ephemeral environments (Docker, Podman, Vagrant, cloud) instead of against real infra.

```bash
pip install molecule molecule-plugins[docker]
cd roles/nginx
molecule init scenario --driver-name docker    # scaffolds molecule/default/
```

### Scenario structure
```
roles/nginx/molecule/default/
├── molecule.yml         # driver, platforms, provisioner, verifier config
├── converge.yml          # the playbook that applies the role under test
├── verify.yml             # assertions (or delegates to testinfra/inspec)
└── prepare.yml            # optional pre-converge setup (e.g., install deps)
```

```yaml
# molecule.yml
driver:
  name: docker
platforms:
  - name: instance-ubuntu
    image: "geerlingguy/docker-ubuntu2204-ansible:latest"
    pre_build_image: true
  - name: instance-rhel
    image: "geerlingguy/docker-rockylinux9-ansible:latest"
    pre_build_image: true
provisioner:
  name: ansible
  playbooks:
    converge: converge.yml
verifier:
  name: ansible          # or testinfra / inspec for external verifiers
```

```yaml
# converge.yml
- name: Converge
  hosts: all
  become: true
  roles:
    - role: nginx
```

```yaml
# verify.yml (ansible verifier style)
- name: Verify
  hosts: all
  tasks:
    - name: Check nginx is running
      ansible.builtin.service_facts:

    - name: Assert nginx service is active
      ansible.builtin.assert:
        that:
          - "'nginx.service' in ansible_facts.services"
          - "ansible_facts.services['nginx.service'].state == 'running'"
```

### Molecule lifecycle commands
```bash
molecule create     # spin up test instances
molecule converge   # apply the role/playbook (idempotent-testable)
molecule verify     # run verification assertions
molecule idempotence  # run converge twice, fail if 2nd run reports any changes
molecule destroy    # tear down test instances
molecule test       # full sequence: lint -> destroy -> create -> converge -> idempotence -> verify -> destroy
```

### testinfra / inspec verifiers

`testinfra` (pytest-based) example:
```python
# molecule/default/tests/test_default.py
def test_nginx_running_and_enabled(host):
    nginx = host.service("nginx")
    assert nginx.is_running
    assert nginx.is_enabled

def test_nginx_listening(host):
    assert host.socket("tcp://0.0.0.0:80").is_listening
```
```yaml
verifier:
  name: testinfra
```

`inspec` is the Chef-ecosystem equivalent, usable via the `inspec` verifier plugin when a team already maintains InSpec profiles elsewhere.

---

## 4. `--check` / `--diff` Dry Runs (Recap + CI Usage)

```bash
ansible-playbook site.yml --check --diff       # simulate, show what would change, make no changes
```
In CI, run `--check` as a gate on pull requests **before** merging into a branch that auto-deploys — surfaces unexpected drift or destructive changes for human review without touching real infra.

```yaml
# GitHub Actions - PR check job
- name: Dry-run playbook against staging inventory
  run: ansible-playbook -i inventory/staging site.yml --check --diff
```

---

## 5. Idempotency Testing

Beyond Molecule's `idempotence` command, this pattern works generically in any CI runner:

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "First run..."
ansible-playbook -i inventory/test site.yml

echo "Second run - must report zero changes..."
output=$(ansible-playbook -i inventory/test site.yml)
echo "$output"

if echo "$output" | grep -qE "changed=[1-9]"; then
  echo "IDEMPOTENCY FAILURE: second run reported changes" >&2
  exit 1
fi
echo "Idempotency confirmed."
```

Run this as a required CI check on every role/playbook change — it's the single highest-value automated Ansible test, catching `command`/`shell` tasks missing `creates:`/`changed_when:` guards, template tasks with nondeterministic content (timestamps, random values), and similar drift-causing bugs.

---

## 6. CI Pipeline Examples

### GitHub Actions
```yaml
# .github/workflows/ansible-ci.yml
name: Ansible CI
on: [pull_request]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: |
          pip install ansible ansible-lint yamllint molecule molecule-plugins[docker]
          ansible-galaxy collection install -r requirements.yml

      - name: Lint
        run: |
          yamllint .
          ansible-lint

      - name: Molecule test (per role)
        run: |
          for role in roles/*/; do
            if [ -d "${role}molecule" ]; then
              (cd "$role" && molecule test)
            fi
          done

      - name: Dry-run against staging
        run: ansible-playbook -i inventory/staging site.yml --check --diff
```

### Jenkins declarative pipeline
```groovy
pipeline {
  agent any
  stages {
    stage('Lint') {
      steps {
        sh 'yamllint .'
        sh 'ansible-lint'
      }
    }
    stage('Molecule Test') {
      steps {
        sh 'cd roles/nginx && molecule test'
      }
    }
    stage('Deploy to ephemeral test infra') {
      steps {
        sh 'ansible-playbook -i inventory/ci-ephemeral site.yml'
      }
    }
    stage('Idempotency check') {
      steps {
        sh './scripts/check_idempotency.sh'
      }
    }
  }
  post {
    always {
      sh 'ansible-playbook -i inventory/ci-ephemeral teardown.yml || true'   // always clean up ephemeral infra
    }
  }
}
```

---

## 7. Version Pinning Strategies

Unpinned collections/roles are a common source of "it worked yesterday" CI breakage.

```yaml
# requirements.yml - pin everything explicitly
collections:
  - name: community.general
    version: "8.3.0"          # exact pin - most reproducible
  - name: amazon.aws
    version: ">=7.0.0,<8.0.0"  # range pin - allows patch/minor updates, blocks majors

roles:
  - name: geerlingguy.nginx
    version: "3.1.4"
```

```ini
# ansible.cfg or requirements - pin Ansible core itself too
# requirements.txt (pip)
ansible-core==2.16.3
ansible-lint==24.2.0
molecule==24.2.1
```

- Pin **exact versions** for anything deployed to production; use range pins only in scratch/experimental repos.
- Commit a lockfile-equivalent (`requirements.yml` + `requirements.txt`) and update it deliberately via a PR, never implicitly during a deploy.
- Re-run the full lint + Molecule + idempotency suite whenever a pin changes — a "minor" collection bump can silently change module defaults.

---

See [Roles & Collections](roles-and-collections.md) for `requirements.yml` structure, and [Vault & Security](vault-and-security.md) for handling vault passwords inside these same CI pipelines.

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
