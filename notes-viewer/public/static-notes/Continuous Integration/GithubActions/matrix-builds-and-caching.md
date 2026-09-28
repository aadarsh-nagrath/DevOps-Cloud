# Matrix Builds, Caching, and Artifacts

Deep dive on `strategy.matrix`, `actions/cache` internals, and passing files between jobs with artifacts. See [CI Fundamentals §5-6, §8](../ci-fundamentals.md) for the general concepts (why matrices exist, why caching matters, why artifacts are needed) — this file covers the GitHub-Actions-specific mechanics and syntax.

---

## 1. Matrix Strategy Deep Dive

```yaml
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
        node-version: [18, 20, 22]
      fail-fast: true          # default: true — cancel ALL matrix jobs the moment ONE fails
      max-parallel: 4          # cap concurrent matrix jobs (default: unlimited, up to plan limits)
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3 # v4.1.7
      - uses: actions/setup-node@60edb5dd545a775178f52524783378180af0d1f # v4.0.2
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npm test
```
This generates 2 × 3 = 6 jobs: `test (ubuntu-latest, 18)`, `test (ubuntu-latest, 20)`, ... each with `matrix.os` and `matrix.node-version` set accordingly for that combination.

### `fail-fast`
```yaml
strategy:
  fail-fast: false   # let ALL matrix combinations run to completion, even if one fails
```
`fail-fast: true` (the default) is efficient — no point burning runner minutes on 5 more combinations once you know the code is broken — but it means you only ever see the *first* failure per run. Set `fail-fast: false` when you specifically want the full failure picture across every OS/version combination in one go (e.g., "which of our 6 supported Node versions actually broke").

### `max-parallel`
```yaml
strategy:
  max-parallel: 2   # only 2 matrix jobs run at once, rest queue
```
Useful when the matrix is large but a shared downstream resource (a rate-limited API, a shared test database) can't handle full concurrency.

### `include` — add extra combinations or extra variables to specific combinations
```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest]
    node-version: [18, 20]
    include:
      - os: ubuntu-latest        # add ONE more specific combination not covered by the cross product
        node-version: 22
        experimental: true       # AND attach an extra variable only to this combination
      - os: macos-latest         # this combo wasn't in the matrix's cross product at all — include: adds it fresh
        node-version: 20
```
`include` entries that match an existing `os`/`node-version` pair add extra keys to that job; entries that don't match any existing pair are added as an entirely new combination.

### `exclude` — remove specific combinations from the cross product
```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
    node-version: [18, 20, 22]
    exclude:
      - os: windows-latest
        node-version: 18   # skip just this one pairing — e.g. known unsupported combo
```
`exclude` is evaluated first, then `include` is layered on top — this ordering matters if you're both excluding a base combination and including a variant of it.

---

## 2. `actions/cache` in Depth

### Key strategy and `restore-keys` fallback
```yaml
- uses: actions/cache@0c907a75c2c80ebcb7f088228285e798b750cf22 # v4.0.2
  with:
    path: |
      ~/.npm
      node_modules
    key: npm-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
    # Exact-match key: only hits when package-lock.json is byte-identical to a
    # previous cache save on this OS. Changing ANY dependency = new key = miss.

    restore-keys: |
      npm-${{ runner.os }}-
      npm-
    # Fallback prefixes, tried IN ORDER if the exact key misses. GitHub finds the
    # MOST RECENT cache whose key starts with this prefix and restores it, even
    # though it doesn't exactly match. This still saves real time (most deps
    # unchanged, only a couple new packages to fetch) versus a fully cold install.
```

How resolution works, step by step:
1. GitHub computes `key` and looks for an **exact match** in the cache store (scoped to this repo).
2. Exact match found -> cache restored, step reports `cache-hit: true`, no fallback needed.
3. Exact match not found -> GitHub walks `restore-keys` in order, and for each prefix, finds the **most recently created** cache entry whose key starts with that prefix.
4. Restores that (older, imperfect) cache if found; otherwise starts with nothing (a cold install).
5. At the end of the job, if the exact `key` didn't already exist, a **new** cache entry is saved under it — so the next run with the same lockfile gets an exact hit.

### Cache scoping by branch
Caches are scoped hierarchically by branch: a workflow run on a feature branch can read caches from that branch **or its base branch** (typically `main`), but a run on `main` cannot read a feature branch's cache. This prevents one branch's cache from leaking into another unrelated branch, while still letting new branches benefit from `main`'s warm cache instead of starting fully cold. Caches are also automatically evicted (GitHub enforces a total per-repo cache size cap, currently 10GB, evicting least-recently-used entries beyond that).

### Common caching patterns

```yaml
# npm
- uses: actions/cache@0c907a75c2c80ebcb7f088228285e798b750cf22 # v4.0.2
  with:
    path: ~/.npm
    key: npm-${{ runner.os }}-${{ hashFiles('**/package-lock.json') }}
    restore-keys: npm-${{ runner.os }}-
# Simpler alternative: actions/setup-node's `cache: 'npm'` input does this automatically

# pip
- uses: actions/cache@0c907a75c2c80ebcb7f088228285e798b750cf22 # v4.0.2
  with:
    path: ~/.cache/pip
    key: pip-${{ runner.os }}-${{ hashFiles('**/requirements.txt') }}
    restore-keys: pip-${{ runner.os }}-

# Maven
- uses: actions/cache@0c907a75c2c80ebcb7f088228285e798b750cf22 # v4.0.2
  with:
    path: ~/.m2/repository
    key: maven-${{ runner.os }}-${{ hashFiles('**/pom.xml') }}
    restore-keys: maven-${{ runner.os }}-

# Cargo (Rust)
- uses: actions/cache@0c907a75c2c80ebcb7f088228285e798b750cf22 # v4.0.2
  with:
    path: |
      ~/.cargo/registry
      ~/.cargo/git
      target
    key: cargo-${{ runner.os }}-${{ hashFiles('**/Cargo.lock') }}
    restore-keys: cargo-${{ runner.os }}-
```
Note the common shape across all of them: `path` targets wherever the package manager stores downloaded packages (not your source code), and `key` hashes the lockfile — the one file that changes precisely when, and only when, the dependency set actually changes. See [CI Fundamentals §6](../ci-fundamentals.md) for why keying on anything else (a timestamp, a commit SHA) defeats caching entirely.

---

## 3. Artifacts — Full Worked Example: Build Job -> Deploy Job

Jobs run on **separate, ephemeral runners** — a `deploy` job cannot see files a `build` job created unless they're explicitly passed as an artifact.

```yaml
name: Build and Deploy

on: push

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3 # v4.1.7

      - name: Compile binary
        run: |
          mkdir -p out
          echo '#!/bin/sh' > out/app
          echo 'echo "hello from the built app"' >> out/app
          chmod +x out/app
          # (stand-in for a real compile step, e.g. `go build -o out/app`)

      - name: Upload build artifact
        uses: actions/upload-artifact@50769540e7f4bd5e21e526ee35c689e35d7d7cf # v4.4.0
        with:
          name: app-binary          # identifier used to download it later
          path: out/app             # file (or directory) to upload
          retention-days: 7         # optional — how long GitHub keeps it (default 90, max repo-configurable)

  deploy:
    runs-on: ubuntu-latest
    needs: build                    # ensures build finishes (and succeeds) first
    steps:
      - name: Download build artifact
        uses: actions/download-artifact@fa0a91b85d4f404e444e00e005971372dc801d16 # v4.1.8
        with:
          name: app-binary
          path: downloaded/         # where to place it in THIS job's fresh workspace

      - name: Use the downloaded artifact
        run: |
          chmod +x downloaded/app
          ./downloaded/app
          # In a real pipeline: scp/rsync it to a server, push to a registry,
          # or run a deploy CLI (kubectl, aws deploy, terraform apply, etc.)
```
What actually happens: `build` runs on one ephemeral VM, produces `out/app`, and `upload-artifact` copies it to GitHub's artifact storage (outside any runner) under the name `app-binary`. `deploy` then runs on a **completely different, fresh VM** — its filesystem starts empty except for what its own steps create — and `download-artifact` pulls `app-binary` back down from GitHub's storage into that new VM's workspace. Without the upload/download pair, `deploy` would simply have no `out/app` to find.

For matrix jobs producing artifacts, avoid name collisions:
```yaml
- uses: actions/upload-artifact@50769540e7f4bd5e21e526ee35c689e35d7d7cf # v4.4.0
  with:
    name: app-binary-${{ matrix.os }}-${{ matrix.node-version }}   # unique per matrix leg
    path: out/app
```

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
