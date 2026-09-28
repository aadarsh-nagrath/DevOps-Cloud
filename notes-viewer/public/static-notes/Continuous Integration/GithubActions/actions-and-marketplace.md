# Actions and the Marketplace

What an "Action" actually is, how to consume marketplace actions safely, and how to write your own. See [github-actions.md](github-actions.md) for how actions fit into steps/jobs/workflows.

---

## 1. What an "Action" Actually Is

An action is a **packaged, reusable unit of automation** you invoke with `uses:` in a step — the GitHub Actions equivalent of a Jenkins plugin, except distributed as a plain GitHub repo rather than installed server-wide. There are three kinds:

| Type | How it's implemented | Example | When to use |
|---|---|---|---|
| **Composite action** | A YAML file (`action.yml`) that wraps a sequence of other steps (`run:` commands and/or `uses:` calls) | Your own internal "checkout + setup + install" bundle | Bundling repeated step sequences without needing a full programming language |
| **JavaScript action** | `action.yml` + a Node.js script, run directly on the runner (no container overhead) | `actions/checkout`, `actions/github-script` | When you need real logic, API calls, or fast startup |
| **Docker container action** | `action.yml` + a `Dockerfile` — GitHub builds/pulls the image and runs your step inside it | Actions needing a specific OS toolchain not on the base runner | When the action needs a very specific environment (only runs on Linux runners) |

An action is defined by an `action.yml` (or `action.yaml`) manifest at the root of its repo:
```yaml
# action.yml — the manifest that makes a repo usable via `uses:`
name: 'My Action'
description: 'Does a thing'
inputs:
  who-to-greet:
    description: 'Name to greet'
    required: true
    default: 'World'
outputs:
  greeting:
    description: 'The greeting produced'
runs:
  using: 'node20'      # or 'docker', or 'composite'
  main: 'index.js'
```

---

## 2. Using Marketplace Actions

```yaml
steps:
  - uses: actions/checkout@v4              # clones the repo onto the runner
    with:
      fetch-depth: 0                       # 0 = full history (needed for e.g. `git log`/tags); default is 1 (shallow)

  - uses: actions/setup-node@v4            # installs a Node.js version, adds it to PATH
    with:
      node-version: '20'
      cache: 'npm'                         # built-in dependency caching, keyed on lockfile automatically

  - uses: actions/cache@v4                 # generic cache action — see matrix-builds-and-caching.md for depth
    with:
      path: ~/.cache/pip
      key: pip-${{ hashFiles('requirements.txt') }}

  - uses: actions/upload-artifact@v4       # save files from this job for later download
    with:
      name: build-output
      path: dist/

  - uses: actions/download-artifact@v4     # pull a previously uploaded artifact into this job
    with:
      name: build-output
      path: dist/
```

| Action | Purpose |
|---|---|
| `actions/checkout` | Clones the repo (almost every workflow's first step) |
| `actions/setup-node`, `setup-python`, `setup-java`, `setup-go` | Install/configure a language toolchain |
| `actions/cache` | Generic key-based caching of any directory |
| `actions/upload-artifact` / `download-artifact` | Move files between jobs or out to a human downloader |
| `actions/github-script` | Run inline JS with an authenticated Octokit client — handy for small API interactions without writing a full custom action |
| `docker/build-push-action`, `docker/login-action` | Build and push Docker images |

---

## 3. Pinning Actions — SHA vs Tag (Supply-Chain Security)

`uses:` accepts a Git ref: a branch, a tag, or a commit SHA. **What you pin to determines your supply-chain exposure.**

```yaml
# Progressively worse to progressively better:

- uses: someone/some-action@main
  # WORST: a mutable branch. The action's maintainer (or anyone who compromises
  # their account/repo) can push new code to `main` at any time, and your workflow
  # picks it up on the VERY NEXT RUN with zero warning — no diff review, no version bump.

- uses: someone/some-action@v1
  # RISKY: tags are ALSO mutable by default in git — a compromised or malicious
  # maintainer can force-push a tag to point at different code while keeping the
  # same version number. Most reputable actions don't do this, but nothing
  # technically prevents it, and it's exactly the supply-chain attack pattern
  # seen in real incidents (a popular action's tag was repointed to inject a
  # secrets-exfiltration payload into thousands of consuming workflows).

- uses: someone/some-action@a1b2c3d4e5f6...   # full 40-char commit SHA
  # SAFEST: a commit SHA is immutable — it references exact, specific, reviewable
  # content that cannot change under you. This is the equivalent of a lockfile
  # entry for your CI supply chain.
```

**Why this matters concretely**: a workflow with access to `secrets.*` that pulls in a mutable-tag action is one compromised upstream maintainer account away from silently leaking every secret in scope, on your very next CI run, with no code change on your end to review or approve. This is not theoretical — it has happened to widely-used actions.

**Practical guidance:**
- Pin third-party actions (anything outside your own org) to a full commit SHA.
- Add a `# v4.1.2` comment next to the SHA so humans can still tell what version it is:
  ```yaml
  - uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3 # v4.1.7
  ```
- Use Dependabot to keep pinned SHAs current (Dependabot understands SHA-pinned actions and opens PRs bumping both the SHA and the version comment — see [secrets-and-security.md](secrets-and-security.md)).
- For actions you own within the same org, tag-pinning (`@v1`) is a reasonable tradeoff since you control the repo directly — but SHA-pin anything external, especially in workflows that touch secrets or deploy credentials.

---

## 4. Writing Your Own Composite Action

Composite actions are the easiest way to eliminate copy-pasted step sequences across multiple workflows. Worked example: a "checkout + setup Node + install deps" bundle used by every workflow in a repo.

```yaml
# .github/actions/setup-project/action.yml
#
# Usage from any workflow in this repo:
#   - uses: ./.github/actions/setup-project
#     with:
#       node-version: '20'

name: 'Setup Project'
description: 'Checks out the repo, installs Node, and installs dependencies with caching'

inputs:
  node-version:
    description: 'Node.js version to install'
    required: false
    default: '20'

outputs:
  cache-hit:
    description: 'Whether the dependency cache was hit'
    value: ${{ steps.install.outputs.cache-hit }}

runs:
  using: 'composite'          # marks this as a composite action (no Dockerfile, no JS entrypoint)
  steps:
    - name: Checkout code
      uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3 # v4.1.7

    - name: Set up Node.js
      uses: actions/setup-node@60edb5dd545a775178f52524783378180af0d1f # v4.0.2
      with:
        node-version: ${{ inputs.node-version }}
        cache: 'npm'

    - name: Install dependencies
      id: install
      shell: bash              # required on every `run:` step inside a composite action
      run: npm ci
```

Consuming it from any workflow in the same repo:
```yaml
# .github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: ./.github/actions/setup-project   # local path reference, no version pin needed
        with:
          node-version: '20'
      - run: npm test

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: ./.github/actions/setup-project    # reused again — one source of truth
        with:
          node-version: '20'
      - run: npm run lint
```
Note the required `shell:` on every `run:` step inside a composite action — unlike a regular workflow step, composite action steps don't inherit a default shell automatically.

---

## 5. Writing a Simple Custom JavaScript Action (Brief)

For logic beyond what shell/composite steps comfortably express — calling the GitHub API, complex conditional branching, reusable logic published independently of any one repo — a JavaScript action is the next step up.

```
my-action/
├── action.yml
├── index.js
└── package.json
```

```yaml
# action.yml
name: 'Greet'
description: 'Greets someone and sets an output'
inputs:
  who-to-greet:
    required: true
outputs:
  time:
    description: 'The time we greeted them'
runs:
  using: 'node20'
  main: 'index.js'
```

```js
// index.js
const core = require('@actions/core');   // official toolkit for reading inputs/setting outputs/logging

try {
  const nameToGreet = core.getInput('who-to-greet');   // read the `who-to-greet` input
  console.log(`Hello, ${nameToGreet}!`);
  const time = new Date().toTimeString();
  core.setOutput('time', time);                        // expose an output other steps can consume
} catch (error) {
  core.setFailed(error.message);                        // marks the step (and job) as failed
}
```
Consumed the same way as any other action: `uses: ./my-action` (local) or `uses: your-org/my-action@<sha>` (published). For anything beyond a couple of small scripts, bundle dependencies with `@vercel/ncc` (or similar) into a single `dist/index.js` so consumers don't need a `node_modules` install step — this is the standard pattern used by `actions/checkout` and most official actions.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
