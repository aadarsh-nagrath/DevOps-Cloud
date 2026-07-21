# Vault & Security

ansible-vault full workflow, vault password files, multiple vault IDs, encrypting single strings, CI/CD integration, `no_log`, and privilege escalation (`become`) deep dive.

---

## 1. `ansible-vault` — Full Workflow

Vault encrypts YAML files (or single values) with AES256 so secrets can be committed to git safely.

```bash
# Create a new encrypted file (opens $EDITOR)
ansible-vault create group_vars/prod/vault.yml

# Edit an existing encrypted file (decrypts to a temp file, re-encrypts on save)
ansible-vault edit group_vars/prod/vault.yml

# View contents without editing
ansible-vault view group_vars/prod/vault.yml

# Encrypt an existing plaintext file in place
ansible-vault encrypt secrets.yml

# Decrypt a file back to plaintext (careful in shared repos!)
ansible-vault decrypt secrets.yml

# Change the vault password (re-encrypts with a new password)
ansible-vault rekey group_vars/prod/vault.yml
```

Running a playbook that references vaulted variables:
```bash
ansible-playbook site.yml --ask-vault-pass         # prompts interactively
ansible-playbook site.yml --vault-password-file ~/.vault_pass.txt
ansible-playbook site.yml --vault-password-file ./get_vault_pass.sh   # executable script that prints the password
```

---

## 2. Vault Password Files

A password file avoids interactive prompts — required for any automation/CI use.

```bash
echo "MySuperSecretVaultPassword" > ~/.vault_pass.txt
chmod 600 ~/.vault_pass.txt      # restrict permissions - this file IS the key
```

Or, better for CI, an **executable script** that fetches the password from a secrets manager instead of storing it in plaintext on disk:
```bash
#!/usr/bin/env bash
# get_vault_pass.sh - fetches vault password from AWS Secrets Manager
aws secretsmanager get-secret-value --secret-id ansible/vault-password --query SecretString --output text
```
```bash
chmod +x get_vault_pass.sh
ansible-playbook site.yml --vault-password-file ./get_vault_pass.sh
```

Set a default so you don't need the flag every time:
```ini
# ansible.cfg
[defaults]
vault_password_file = ~/.vault_pass.txt
```

---

## 3. Multiple Vault IDs

Use different passwords for different environments/teams — e.g., `dev` and `prod` secrets encrypted with different keys so a dev-only contributor can't decrypt prod secrets.

```bash
# Encrypt with a labeled vault ID
ansible-vault encrypt --vault-id prod@prompt group_vars/production/vault.yml
ansible-vault encrypt --vault-id dev@~/.vault_pass_dev.txt group_vars/dev/vault.yml
```

```bash
# Running with multiple vault IDs available - Ansible tries each until one decrypts successfully
ansible-playbook site.yml \
  --vault-id dev@~/.vault_pass_dev.txt \
  --vault-id prod@~/.vault_pass_prod.txt
```

```ini
# ansible.cfg - default vault ids, avoids repeating flags
[defaults]
vault_identity_list = dev@~/.vault_pass_dev.txt, prod@~/.vault_pass_prod.txt
```

Each vault ID's ciphertext is tagged (`$ANSIBLE_VAULT;1.2;AES256;prod`), so Ansible knows which password to try — critical when multiple vault-encrypted files with different keys coexist in one run.

---

## 4. Encrypting Single Strings vs Whole Files

| Approach | Command | Use when |
|---|---|---|
| Whole file | `ansible-vault encrypt file.yml` | Every variable in the file is sensitive |
| Single string | `ansible-vault encrypt_string 'value' --name 'var_name'` | Only a few variables are sensitive, rest of the file should stay readable/diffable in git |

```bash
ansible-vault encrypt_string 'S3cr3tDbPass!' --name 'db_password'
```
Output (paste directly into a YAML file):
```yaml
db_password: !vault |
  $ANSIBLE_VAULT;1.1;AES256
  66386439653236336462626566653063336164663966303231363934653561363...
```

This keeps the surrounding file (`group_vars/prod/vars.yml`) fully readable and diff-friendly in PRs, with only the actual secret value opaque — the recommended default over encrypting entire files unless nearly everything in the file is sensitive.

```bash
# Read from stdin instead of typing the secret on the command line (avoids shell history leakage)
echo -n 'S3cr3tDbPass!' | ansible-vault encrypt_string --stdin-name 'db_password'
```

---

## 5. Integrating Vault with CI/CD

CI runners can't interactively type a vault password — provide it non-interactively:

```yaml
# GitHub Actions example
- name: Run Ansible playbook
  env:
    ANSIBLE_VAULT_PASSWORD: ${{ secrets.ANSIBLE_VAULT_PASSWORD }}
  run: |
    echo "$ANSIBLE_VAULT_PASSWORD" > /tmp/vault_pass.txt
    chmod 600 /tmp/vault_pass.txt
    ansible-playbook -i inventory/production site.yml \
      --vault-password-file /tmp/vault_pass.txt
    rm -f /tmp/vault_pass.txt          # clean up even on the runner's ephemeral disk
```

```groovy
// Jenkins declarative pipeline example
pipeline {
  agent any
  environment {
    VAULT_PASS = credentials('ansible-vault-password')   // Jenkins credential, masked in logs
  }
  stages {
    stage('Deploy') {
      steps {
        sh '''
          echo "$VAULT_PASS" > vault_pass.txt
          chmod 600 vault_pass.txt
          ansible-playbook -i inventory/production site.yml --vault-password-file vault_pass.txt
          rm -f vault_pass.txt
        '''
      }
    }
  }
}
```

Never `echo`/print the raw vault password to logs, never commit `vault_pass.txt`, and prefer pulling the password from the CI platform's own secrets store (GitHub Secrets, Jenkins Credentials, Vault/SSM) rather than a static repo file.

---

## 6. Secrets Management Best Practices

- Encrypt at the **variable** level (`encrypt_string`) by default; encrypt whole files only when nearly everything in them is sensitive.
- Never commit an unencrypted vault password file.
- Rotate vault passwords periodically with `ansible-vault rekey`.
- Use separate vault IDs per environment/team boundary — don't let a dev laptop hold the prod key.
- Prefer pulling secrets from a real secrets manager (AWS Secrets Manager, HashiCorp Vault, Azure Key Vault) at runtime via lookup plugins where feasible, using Ansible Vault mainly for bootstrap secrets and CI convenience:
  ```yaml
  db_password: "{{ lookup('amazon.aws.aws_secret', 'prod/db/password') }}"
  ```
- Add `*.vault.yml` patterns to a pre-commit hook or CI check that fails the build if a vault-tagged file doesn't actually start with `$ANSIBLE_VAULT` (catches "oops, committed plaintext" mistakes).

---

## 7. `no_log`

Prevents a task's arguments and results from being printed to console/logs — essential for anything handling secrets, even when vault is used, because task output can still leak the *decrypted* value.

```yaml
- name: Set a database password
  ansible.builtin.mysql_user:
    name: app_user
    password: "{{ db_password }}"
    state: present
  no_log: true          # suppresses all task output, including on failure

- name: Debug output that must stay hidden even in verbose mode
  ansible.builtin.debug:
    msg: "{{ api_token }}"
  no_log: true
```
Apply `no_log: true` at the **play level** to blanket-suppress logging for an entire play handling secrets, if the whole play is sensitive.

---

## 8. `become` — Privilege Escalation Deep Dive

```yaml
- hosts: web
  become: true                  # escalate for every task in this play
  become_method: sudo           # sudo (default), su, pbrun, doas, pfexec, runas (Windows), etc.
  become_user: root             # user to become (default root)
  become_flags: "-H -S -n"       # extra flags passed to the become method
  tasks:
    - name: Task-level override - become a different user just for this task
      ansible.builtin.command: whoami
      become: true
      become_user: postgres
```

CLI equivalents:
```bash
ansible-playbook site.yml --become                        # -b shorthand also works
ansible-playbook site.yml --become --become-user=deploy
ansible-playbook site.yml --become --ask-become-pass       # -K, prompts for the sudo password interactively
```

### Passwordless sudo (recommended for automation)
Configure `NOPASSWD` in `/etc/sudoers.d/` on managed nodes for the automation user, so CI never needs an interactive become-password prompt:
```
# /etc/sudoers.d/deploy-ansible
deploy ALL=(ALL) NOPASSWD: ALL
```

### Become gotchas
- If `become_ask_pass` is unset but sudo actually requires a password, Ansible will hang waiting for interactive input — deadly in CI (see [Advanced & Production Patterns](advanced-and-production-patterns.md) gotchas section). Always confirm passwordless sudo is configured before wiring a playbook into CI, or pass `--vault-password-file`-style non-interactive credentials.
- `become_method: su` requires the su password, not sudo — different credential entirely.
- Some modules (e.g., ones touching another user's home directory) need `become_user` set explicitly even when `become: true` is already set at the play level, since the play-level `become_user` defaults to root.

---

See [Testing & CI](testing-and-ci.md) for wiring vault-protected playbooks into pipelines end-to-end, and [Advanced & Production Patterns](advanced-and-production-patterns.md) for become-related CI hangs and fixes.

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
