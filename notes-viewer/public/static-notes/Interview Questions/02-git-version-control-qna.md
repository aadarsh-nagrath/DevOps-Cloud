# Git & Version Control — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub in this repo. Covers Git internals, day-to-day workflows, branching strategies, and the scenario/recovery questions that separate "knows the commands" from "actually understands the object model." Grouped **Junior → Mid → Senior**.

---

## Table of Contents
- [Junior Level (0–2 yrs)](#junior-level-02-yrs)
- [Mid Level (2–5 yrs)](#mid-level-25-yrs)
- [Senior Level (5+ yrs)](#senior-level-5-yrs)

---

## Junior Level (0–2 yrs)

### 1. What is Git, and how is it different from a centralized VCS like SVN?
Git is a **distributed** version control system — every clone is a full copy of the repository's history, so most operations (commit, diff, log, branch) happen locally and instantly, without needing network access to a central server. SVN (and other centralized systems) keep the full history only on a central server; clients check out working copies and must contact the server for most history-related operations. Git's distributed nature also means every developer has a complete backup of the project's history.

### 2. What's the difference between `git init` and `git clone`?
`git init` creates a brand-new, empty Git repository in the current directory. `git clone <url>` copies an *existing* remote repository (full history, all branches/tags by default) to your local machine and automatically sets up a remote named `origin` pointing back to it.

### 3. What are the three main states/areas in Git — working directory, staging area (index), and repository?
The **working directory** is your actual files on disk that you edit. The **staging area** (a.k.a. the index) is a snapshot-in-progress where `git add` stages the exact changes you intend to include in the next commit. The **repository** (`.git` directory) is where committed history is permanently stored as objects. This three-stage model is why `git add` and `git commit` are separate steps — it lets you build a commit out of only some of your changes.

### 4. What's the difference between `git add`, `git commit`, and `git push`?
`git add <file>` stages changes into the index. `git commit -m "message"` takes what's staged and permanently records it as a new commit in your local repository history. `git push` uploads your local commits to a remote repository so others can see them — these are three distinct, sequential steps, and none of them happens automatically as a side effect of the others.

### 5. What does `git status` show, and why is it usually the first command you run?
It shows the current branch, whether it's ahead/behind its remote tracking branch, which files are staged, unstaged-but-modified, or untracked. It's the "orientation" command — running it before any git operation prevents most mistakes (accidentally committing the wrong files, forgetting you have uncommitted work before switching branches, etc.).

### 6. What's the difference between `git diff` and `git diff --staged` (or `--cached`)?
`git diff` (no arguments) shows changes in the working directory that are *not yet staged*. `git diff --staged`/`--cached` shows changes that *are* staged but not yet committed — i.e., exactly what would go into the next commit if you ran `git commit` right now.

### 7. What is a branch in Git, conceptually?
A branch is simply a movable, lightweight pointer (a 40/64-character reference) to a specific commit. Creating a branch doesn't copy any files — it just creates a new named pointer, which is why branching in Git is nearly instantaneous regardless of repository size, unlike some older VCS tools where branching meant copying the whole tree.

### 8. What's the difference between `git branch`, `git checkout -b`, and `git switch -c`?
`git branch <name>` creates a new branch pointer but *doesn't move you onto it* — you stay on your current branch. `git checkout -b <name>` creates the branch *and* switches to it in one step (the older, overloaded command that also does file checkout, which is why it's easy to misuse). `git switch -c <name>` is the newer, purpose-built command (Git 2.23+) that does the same "create and switch" job as `checkout -b` but without `checkout`'s dual-purpose ambiguity (checking out files vs. switching branches).

### 9. What is `.gitignore`, and how do the patterns in it work?
`.gitignore` lists file/directory patterns Git should never track or show as "untracked" (build artifacts, `node_modules/`, `.env` secrets, IDE config). Patterns support globs (`*.log`), directory-only matches (`build/`), negation (`!important.log` to un-ignore something inside an otherwise ignored pattern), and can live at multiple levels (repo root, subdirectories, or globally in `~/.gitconfig`'s `core.excludesfile`).

### 10. What happens if you `git add` a file, then edit it again before committing?
The staged version (snapshot at the time of `git add`) and the working directory version diverge — `git status` will show the file as *both* staged and modified. Committing at that point commits only the originally staged version; you'd need to `git add` again to include the newer edits, or use `git commit -a` (which only re-stages *already-tracked, modified* files, not new untracked ones).

### 11. What's the difference between `git merge` and `git rebase`, at a basic level?
`git merge` combines two branches' histories by creating a new "merge commit" with two parents, preserving both branches' commit history exactly as it happened. `git rebase` instead replays your branch's commits one by one on top of the target branch's latest commit, producing new commits (with new hashes) and a linear history with no merge commit. Merge preserves true history; rebase rewrites it for a cleaner-looking log.

### 12. What is a merge conflict, and why does it happen?
A conflict occurs when Git can't automatically reconcile two changes to the *same lines* of the *same file* across the branches being merged/rebased (or, less commonly, one side deletes a file the other modified). Git marks the conflicting regions in the file with `<<<<<<<`, `=======`, `>>>>>>>` markers, and it's up to the developer to manually choose/combine the correct content, then `git add` the resolved file and continue.

### 13. How do you resolve a merge conflict, step by step?
Run `git status` to see which files conflict. Open each conflicted file, find the `<<<<<<<`/`=======`/`>>>>>>>` markers, edit the content to what it *should* be (removing all markers), then `git add <file>` to mark it resolved, and finally `git commit` (for a merge) or `git rebase --continue` (for a rebase) to finish. `git merge --abort` or `git rebase --abort` bails out entirely and returns to the pre-merge/rebase state if things go wrong.

### 14. What's the difference between `git pull` and `git fetch`?
`git fetch` downloads new commits/branches/tags from the remote into your local repository's remote-tracking branches (e.g. `origin/main`) *without* touching your working directory or current branch. `git pull` is essentially `git fetch` immediately followed by a `git merge` (or `rebase`, with `git pull --rebase`) of the fetched changes into your current branch — meaning `pull` can trigger a merge/conflict, while `fetch` never modifies your working files.

### 15. What is a remote in Git, and what does `origin` mean?
A remote is a named reference to another copy of the repository, usually hosted on a server (GitHub, GitLab, Bitbucket). `origin` is just the conventional default name Git gives the remote you cloned from — it's not a special keyword, just a common naming convention (`git remote -v` shows all configured remotes and their URLs).

### 16. What's the difference between a local branch and a remote-tracking branch (e.g. `main` vs `origin/main`)?
`main` is your local branch you commit to directly. `origin/main` is a read-only, local snapshot of what the `main` branch looked like on the remote *as of your last fetch* — it only updates via `git fetch`/`git pull`, not automatically in real time. This is why you can be "3 commits behind origin/main" — your local snapshot of the remote is stale until you fetch again.

### 17. What does `git log` show, and how do you make it more readable?
`git log` shows commit history (hash, author, date, message) newest-first. Common useful flags: `git log --oneline` (one line per commit), `git log --oneline --graph --all` (ASCII graph of branches/merges across all branches), `git log -p` (show the actual diff per commit), `git log --author="name"` or `git log --since="2 weeks ago"` to filter.

### 18. What's the difference between `git revert` and `git reset`?
`git revert <commit>` creates a *new* commit that undoes the changes introduced by a previous commit — history is preserved, safe to use on shared/pushed branches. `git reset` moves the current branch pointer backward (optionally also changing the staging area and/or working directory, depending on `--soft`/`--mixed`/`--hard`), effectively rewriting history — dangerous on branches others have already pulled, since it can orphan commits others still have locally.

### 19. What are the differences between `git reset --soft`, `--mixed`, and `--hard`?
`--soft` moves the branch pointer only — staged changes and working directory are untouched (all your changes stay staged, ready to re-commit differently). `--mixed` (the default) also resets the staging area to match the target commit, but leaves working directory files alone (changes become unstaged). `--hard` resets *everything* — branch pointer, staging area, and working directory — permanently discarding any uncommitted changes, so it's the one to be careful with.

### 20. How do you undo the last commit but keep its changes so you can edit and recommit?
`git reset --soft HEAD~1` moves the branch pointer back one commit while leaving everything staged exactly as it was — you can then amend files and `git commit` again. If you also want the changes unstaged (to re-review what to include), use `git reset HEAD~1` (mixed mode, the default).

### 21. What does `git commit --amend` do?
It replaces the most recent commit with a new one — combining any currently staged changes with the previous commit's changes, and optionally letting you edit the commit message. Because it creates a *new* commit hash, you should never amend a commit that's already been pushed and pulled by others, without communicating it (it requires a force-push).

### 22. What is `HEAD` in Git?
`HEAD` is a pointer to the commit you currently have checked out — normally it points indirectly, via a branch name (e.g. `HEAD -> main -> commit abc123`), which is why committing on a branch automatically moves both the branch and `HEAD` forward. "Detached HEAD" means `HEAD` points directly at a specific commit instead of a branch, which happens when you check out a commit hash or a tag directly.

### 23. What is a "detached HEAD" state, and is it dangerous?
It means you've checked out a specific commit (or tag) rather than a branch, so `HEAD` isn't attached to any branch pointer. It's not dangerous by itself — you can look around, even build/test at that exact commit — but any *new commits* you make while detached aren't referenced by any branch, so they become unreachable (and eventually garbage-collected) the moment you check out something else, unless you first create a branch from that point (`git switch -c new-branch`) to keep them.

### 24. What's the difference between a lightweight tag and an annotated tag?
A lightweight tag (`git tag v1.0`) is just a simple named pointer to a commit, like a branch that never moves. An annotated tag (`git tag -a v1.0 -m "Release 1.0"`) is a full Git object storing the tagger's name, email, date, and message, and can be GPG-signed (`git tag -s`) — annotated tags are generally recommended for release versions since they carry metadata and can be verified.

### 25. How do you clone only a specific branch, or clone without the full history?
`git clone -b <branch> --single-branch <url>` clones just one branch. `git clone --depth 1 <url>` does a "shallow clone" fetching only the most recent commit (much faster for CI checkouts that don't need history) — `--depth 1 -b <branch> --single-branch` combines both for the fastest possible CI checkout.

---

## Mid Level (2–5 yrs)

### 26. Explain Git's internal object model — blobs, trees, and commits.
Git stores everything as content-addressed objects, hashed (historically SHA-1, with SHA-256 support increasingly available) by their content: a **blob** stores raw file content (no filename/metadata). A **tree** represents a directory, listing filenames and modes mapped to blob or subtree hashes. A **commit** points to a single tree (the full snapshot of the project at that point) plus its parent commit(s), author/committer info, and message. Because objects are addressed by content hash, identical file content anywhere in history is stored only once — this is also why changing anything in a commit changes its hash, and the hash of every descendant commit.

### 27. If Git stores a full snapshot per commit (not diffs), why is a repository's `.git` folder usually so much smaller than "number of commits × repo size"?
Because identical blobs (unchanged files between commits) are stored exactly once and simply referenced by multiple trees/commits — only genuinely changed files produce new blob objects. On top of that, Git periodically runs `git gc`, which packs loose objects into compressed "packfiles" using delta compression between similar objects, so even *changed* files that are similar to a previous version (e.g. a large file with one small edit) are stored efficiently as a delta rather than a fresh full copy.

### 28. What's the difference between `git rebase` and `git rebase -i` (interactive rebase), and what can you do with the latter?
Plain `git rebase <branch>` replays your commits on top of another branch verbatim. Interactive rebase (`git rebase -i HEAD~5`) opens an editable list of the last N commits where you can reorder them, `squash`/`fixup` multiple commits into one, `reword` a commit message, `edit` to pause and amend a specific commit's content, or `drop` a commit entirely — the standard tool for cleaning up messy work-in-progress commits into a clean, reviewable history before merging.

### 29. What's the "golden rule" of rebasing, and why does it exist?
Never rebase commits that have already been pushed to a shared branch that others may have pulled/branched from. Rebase rewrites commit hashes; if someone else has those original commits in their history, their next pull results in duplicated/conflicting commits and a confusing divergence that typically requires a force-push plus manual cleanup on everyone's side to fix. Rebasing your own *local, not-yet-shared* commits (or a personal feature branch nobody else uses) is completely safe and commonly encouraged for a clean history.

### 30. What's the difference between `git merge --no-ff` and a regular fast-forward merge?
If the target branch has had no new commits since the feature branch diverged, a normal merge can "fast-forward" — Git just moves the branch pointer forward, with no merge commit at all, producing a perfectly linear history (indistinguishable from having committed directly on the target branch). `--no-ff` forces a merge commit to be created regardless, explicitly preserving the fact that a feature branch existed and was merged — many teams enforce this policy so the history/log clearly shows feature boundaries.

### 31. What is `git cherry-pick`, and when would you use it?
`git cherry-pick <commit-hash>` applies the changes from one specific commit (from any branch) onto your current branch as a new commit. Common uses: pulling a critical bugfix from `main` into a release branch without merging all of `main`'s other unrelated commits, or recovering a specific commit that was accidentally left off a branch.

### 32. What is `git stash`, and what's the difference between `git stash pop` and `git stash apply`?
`git stash` temporarily shelves uncommitted changes (both staged and unstaged, by default) off your working directory, returning it to a clean state matching `HEAD` — useful when you need to switch branches urgently without committing half-finished work. `git stash apply` reapplies the most recent stash but *keeps it* in the stash list. `git stash pop` reapplies it *and removes it* from the list. `git stash list` shows all stashes; `git stash apply stash@{2}` applies a specific one.

### 33. What's the difference between `git reflog` and `git log`?
`git log` shows the commit history reachable from the current branch/HEAD — i.e., "real" project history. `git reflog` shows a local-only, chronological record of every place `HEAD` has pointed to on *your machine* — every checkout, commit, reset, rebase step — even commits that are no longer reachable from any branch. This makes `reflog` the primary recovery tool: `git reset --hard HEAD@{5}` can undo an accidental hard reset or a botched rebase, as long as it's recent enough not to have been garbage-collected.

### 34. How do you recover a commit after an accidental `git reset --hard` that discarded it?
As long as the commit was made (even briefly) and hasn't been garbage-collected (default grace period is 30–90 days depending on config), it's still in `git reflog`. Run `git reflog`, find the entry just before the destructive reset (e.g. `HEAD@{1}`), and either `git reset --hard HEAD@{1}` to fully restore that state, or `git cherry-pick`/`git checkout` specific commits/files from it if you only need part of it back.

### 35. What's the difference between `.gitignore` and `git rm --cached`?
`.gitignore` only prevents Git from tracking files that *aren't already tracked* — adding a pattern to it has no effect on files Git is already tracking. `git rm --cached <file>` untracks an already-tracked file (removing it from the index/future commits) while leaving it on disk untouched — typically done right before adding it to `.gitignore`, to stop tracking something that was committed by mistake (like a `.env` file).

### 36. What is a Git hook, and give an example of a useful pre-commit and pre-push hook.
Hooks are scripts Git runs automatically at specific points in the workflow, stored in `.git/hooks/` (not version-controlled by default — tools like `pre-commit` or `husky` solve this by managing hooks as versioned config). A `pre-commit` hook commonly runs linters/formatters/secret-scanners and blocks the commit if they fail. A `pre-push` hook commonly runs the test suite or blocks pushes directly to `main`, catching problems before they ever reach the remote/CI.

### 37. Compare common branching strategies: Git Flow, GitHub Flow, and Trunk-Based Development.
**Git Flow** uses long-lived `develop` and `main` branches plus dedicated `feature/`, `release/`, and `hotfix/` branches — structured and good for scheduled/versioned releases, but heavyweight and prone to long-lived branches drifting from `main`. **GitHub Flow** is simpler: `main` is always deployable, all work happens in short-lived feature branches merged via pull request after review/CI, then deployed — well suited to continuous deployment. **Trunk-Based Development** takes this further: developers commit directly to `main` (or very short-lived branches merged within a day), relying heavily on feature flags to hide incomplete work, small frequent commits, and strong CI/test coverage — the strategy most associated with high-performing, high-deploy-frequency teams (per the DORA/Accelerate research).

### 38. What's the difference between squash merging, rebase merging, and a regular merge commit, as pull-request merge strategies (e.g. on GitHub/GitLab)?
A **merge commit** keeps every individual commit from the feature branch plus a new merge commit — full fidelity, noisier history. **Squash merge** combines *all* commits in the PR into a single new commit on the target branch — clean, one-commit-per-feature history, but loses the granular intermediate commit history (harder to `git bisect` within that feature later). **Rebase merge** replays each individual commit from the branch onto the target with new hashes, keeping them separate but producing a linear history with no merge commit at all. Team choice is often a tradeoff between history cleanliness and preserving development granularity.

### 39. What is `git bisect`, and how does it help find which commit introduced a bug?
`git bisect` automates binary-searching through commit history to find the exact commit that introduced a regression. You mark a known-good commit (`git bisect good <hash>`) and a known-bad one (`git bisect bad`, often `HEAD`), and Git checks out the midpoint commit for you to test; you mark each as `good`/`bad` and Git narrows the range, typically finding the culprit in `log2(n)` steps instead of manually checking every commit. `git bisect run <script>` fully automates this if you have a script that exits non-zero on a bad commit.

### 40. What's the difference between `git submodule` and `git subtree`, and what problem do both try to solve?
Both let you include one Git repository inside another (e.g. a shared library used by multiple projects). A **submodule** stores a reference (a specific commit hash) to the external repo in a `.gitmodules` file — the external repo's history stays separate, and you must explicitly `git submodule update` to pull changes, which many teams find confusing/error-prone (easy to forget to init/update, easy to commit a submodule pointer nobody updated). A **subtree** merges the external repository's actual files and history directly into your repo's history — no separate clone/init step for other developers, but merging upstream changes back is a bit more involved. Increasingly, teams avoid both in favor of a monorepo or a package-manager-based dependency (npm/pip/Go modules) where feasible.

### 41. How would you split a large, unwieldy monolithic repository's history into a new repo containing only one subdirectory's history?
`git filter-repo --path <subdirectory> --path-rename <subdirectory>:` (the modern, recommended tool — `git filter-branch` is the older, much slower, officially deprecated equivalent) rewrites history to keep only commits touching that path, moving those files to the new repo root, effectively extracting that subdirectory's full history into a standalone repository you can then push to a fresh remote.

### 42. What's the difference between `git fetch --prune` and a regular `git fetch`, and why does it matter for keeping a local repo tidy?
When a branch is deleted on the remote (e.g. after a PR merges and the feature branch is cleaned up), a plain `git fetch` does *not* remove the now-stale local remote-tracking branch (`origin/feature-x` sticks around pointing at a branch that no longer exists remotely). `git fetch --prune` (or setting `fetch.prune = true` globally) removes those stale remote-tracking references automatically, which keeps `git branch -r`/`--all` and tools that list "remote branches" accurate instead of cluttered with dozens of long-deleted branches.

---

## Senior Level (5+ yrs)

### 43. Design a branching + release strategy for a team practicing continuous deployment to production multiple times a day. What breaks down if you use Git Flow here, and what would you use instead?
Git Flow's long-lived `develop` branch and scheduled `release/` branches actively work against continuous deployment — they create integration delay (features sit unmerged for a release cycle), and "release" as a discrete Git event stops mapping to reality when every merge to `main` deploys. Trunk-based development is the natural fit: short-lived branches (hours, not days) merged frequently into `main`, `main` is always releasable, incomplete features are hidden behind feature flags rather than long-lived branches, and the CI/CD pipeline — not a Git branch — is what gates whether a commit is safe to promote through environments. Versioning/rollback then happens via deployment tooling (tagging the exact commit that was deployed, blue-green/canary rollback) rather than via long-lived release branches.

### 44. A force-push to a shared branch overwrote several colleagues' commits. Walk through recovering the lost work.
First, check if anyone's local clone still has the pre-force-push state — `git reflog` on *their* machine (not the remote) will show the original branch tip before they last fetched/pulled the rewritten history, and that commit (and everything reachable from it) can be recovered and re-pushed/cherry-picked from there. If nobody's local reflog has it, check whether the Git hosting provider (GitHub/GitLab) retains "orphaned" commits reachable via its own reflog-like internal retention (GitHub, for instance, often keeps unreachable commits reachable-by-hash for a period, discoverable if you know or can guess the SHA from PR/CI history, e.g. a CI build log that recorded the commit hash it built). Longer-term fix: enable branch protection rules that block force-pushes to shared branches entirely, so this class of incident becomes structurally impossible rather than something to recover from after the fact.

### 45. How do commit signing (GPG/SSH signing) and provenance attestation fit into a supply-chain security strategy, and what does "verified" actually guarantee (and not guarantee)?
Signed commits/tags (`git commit -S`, verified via `git log --show-signature`, or platform "Verified" badges) cryptographically prove the commit's *content* was produced by someone holding the corresponding private key — it does **not** by itself prove that content is safe, correct, or that the signer's account wasn't compromised, and it doesn't protect against a malicious commit merged with a legitimately signed identity. In a real supply-chain security posture (aligned with frameworks like SLSA), commit signing is one layer among several: branch protection requiring signed commits, required reviews from CODEOWNERS, provenance attestation on *build artifacts* (not just source, tying a specific artifact back to the exact source commit and build pipeline that produced it, e.g. via Sigstore/cosign), and dependency/SBOM verification — treating signing as a necessary-but-not-sufficient control, not a silver bullet.

### 46. Your CI pipeline needs to build only the services affected by a given commit in a large monorepo. How would you determine that with Git, and what are the pitfalls?
`git diff --name-only <base>...<head>` gives the list of changed files between two refs, which you then map to affected packages/services via a dependency graph (either a build tool that understands the graph natively — Bazel, Nx, Turborepo — or a hand-maintained mapping of paths to owning services). Pitfalls: using `..` instead of `...` compares against the wrong merge-base in some CI checkout configurations (shallow/detached-HEAD checkouts in CI often don't have the full history needed to compute an accurate merge-base at all, requiring `fetch-depth: 0` or an explicit deepen step); changes to shared/transitive dependencies need to trigger rebuilds of *everything* depending on them, not just the directly-changed package, which naive path-based diffing misses entirely — this is exactly the problem purpose-built monorepo build tools solve with an explicit dependency graph instead of ad hoc path matching.

### 47. Explain how Git's SHA-1 to SHA-256 transition (and known SHA-1 collision research) is relevant operationally, and whether teams should be worried today.
Git historically addresses objects by SHA-1 hash; academic collision attacks (e.g. "SHAttered") demonstrated SHA-1 collisions are computationally feasible, though Git's specific usage (hashing structured object content, plus `git`'s adoption of collision-detection via a hardened SHA-1 implementation) makes a practical malicious-collision attack against a real repository still very difficult, not "broken" in the way it sounds. Git has added opt-in SHA-256 repository support as the long-term direction, but as of today it's not the default and has ecosystem-wide compatibility gaps (hosting providers, tooling) that make a wholesale migration impractical for most teams — the pragmatic senior-level answer is "aware of the theoretical concern, not currently an operational priority for the vast majority of repositories," rather than either dismissing it or treating it as an urgent migration.

### 48. How would you structure Git repository and branch permissions/policies (branch protection, CODEOWNERS, required checks) for a regulated environment requiring auditable, non-repudiable change history?
Enforce: branch protection on `main`/release branches disallowing force-pushes and direct pushes (all changes via reviewed PR), required approvals from `CODEOWNERS` mapped to the actual accountable teams per path, required status checks (tests, security scans, signed-commit verification) that must pass before merge, and disabling the ability for the merging user to also be the sole approver. For non-repudiation and audit trail integrity, combine this with signed commits/tags, an immutable audit log of merge events exported to a separate system (since repo-hosting audit logs are themselves mutable by admins), and a documented, tested process for the *rare* legitimate exception (e.g. an emergency hotfix bypass) that still leaves a clear, reviewable record rather than a silent policy override.
