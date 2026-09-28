# Backstage — Learn It Locally

Goal: scaffold a Backstage app locally, run it, register a sample service in the Software Catalog, and browse it in the UI — in about 20 minutes.

## Prerequisites
- Node.js (LTS, 20.x or 22.x recommended) and `yarn` installed — check Backstage's current supported Node version at [backstage.io/docs/getting-started](https://backstage.io/docs/getting-started) since it moves with Node LTS releases.
- Docker (optional — only needed if you later switch the dev database to Postgres, see Step 5).
- Git installed (the create-app flow initializes a git repo).

---

## Step 1 — Scaffold a New Backstage App

```bash
npx @backstage/create-app@latest
```
You'll be prompted for an app name — e.g. `backstage-demo`. This generates a full monorepo (Yarn workspaces) with a `packages/app` (frontend) and `packages/backend` (Node.js backend), pre-wired with the Software Catalog plugin.

```bash
cd backstage-demo
```

---

## Step 2 — Run It

```bash
yarn install
yarn dev
```
This starts both the frontend (default `http://localhost:3000`) and backend (`http://localhost:7007`) with hot reload. The default dev database is **SQLite**, file-based, zero config — nothing else to start.

Open `http://localhost:3000`. You'll land on the Catalog page, pre-populated with a handful of example entities (`example-website`, `example-service`, template examples) that ship with the scaffolded app so you have something to look at immediately.

---

## Step 3 — Explore What's There

- Click into `example-website` in the catalog — note the entity's overview page: owner, links, relations (About card, links to source).
- Go to the **Create** page (left nav) — this is the Software Templates / Scaffolder UI, pre-loaded with example templates (`example-nodejs-template`, `example-django-template`). You won't run one against a real GitHub org in this tutorial, but open one to see the parameter form Backstage generates from the template's YAML schema.
- Go to **Docs** (left nav) — this is TechDocs; the example entities include a docs reference so you can see what a rendered TechDocs page looks like.

---

## Step 4 — Register Your Own Component

Create a `catalog-info.yaml` describing a fictional service, and register it directly from a local path (no real GitHub repo needed to try this).

```bash
mkdir -p /tmp/sample-service
cat > /tmp/sample-service/catalog-info.yaml <<'EOF'
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: sample-orders-service
  description: A fictional service for learning Backstage's catalog
  tags:
    - demo
    - orders
spec:
  type: service
  lifecycle: experimental
  owner: guests
EOF
```

Since this file lives on local disk rather than a Git remote, the easiest way to register it for a local experiment is to add it directly to the app's static catalog locations in `app-config.yaml`:

```bash
# in backstage-demo/app-config.yaml, under the `catalog:` key, add:
```
```yaml
catalog:
  locations:
    - type: file
      target: /tmp/sample-service/catalog-info.yaml
```

Restart `yarn dev` (Ctrl+C, then `yarn dev` again) and check the catalog:
```bash
open http://localhost:3000/catalog
```
Search for `sample-orders-service` — it should now appear as a registered `Component` owned by `guests`, with the `demo` and `orders` tags visible and filterable in the catalog sidebar.

(In a real setup you'd instead point this at a GitHub repo URL — `type: url`, `target: https://github.com/myorg/myrepo/blob/main/catalog-info.yaml` — or configure the GitHub discovery provider to bulk-register every `catalog-info.yaml` across an org automatically, as shown in the notes file.)

---

## Step 5 — Note the SQLite vs Postgres Detail

Check `backstage-demo/app-config.yaml` — under `backend.database`, you'll find the SQLite config used for local dev:
```yaml
backend:
  database:
    client: better-sqlite3
    connection: ':memory:'
```
This is why `yarn dev` needs nothing else running: the catalog, scaffolder task history, and everything else Backstage stores lives in an in-memory (or file-based, depending on template version) SQLite database that resets on restart.

To see what changes for a production-shaped setup, here's the Postgres equivalent (optional — requires a running Postgres instance, e.g. `docker run -d -e POSTGRES_PASSWORD=backstage -p 5432:5432 postgres:16`):
```yaml
backend:
  database:
    client: pg
    connection:
      host: localhost
      port: 5432
      user: postgres
      password: backstage
```
No application code changes are needed for this swap — Backstage's backend uses Knex as a query-builder abstraction over both.

---

## Step 6 — Inspect the Backend API Directly

Backstage's backend exposes the catalog over a plain REST API — useful for understanding that the UI is just one consumer of this data:
```bash
curl -s http://localhost:7007/api/catalog/entities | jq '.[] | {kind, name: .metadata.name}'
```
You should see your `sample-orders-service` Component alongside the shipped example entities — confirming the catalog is queryable machine-readable data, not just a browsable page.

---

## Cleanup
```bash
# stop yarn dev with Ctrl+C
rm -rf /tmp/sample-service
# optionally remove the whole scaffolded app
cd .. && rm -rf backstage-demo
```

## What to Explore Next
- Register an `API` entity and a `Resource` entity, link them to your Component via `providesApis`/`dependsOn`, and view the auto-generated dependency graph on the entity's Relations tab.
- Write a real `docs/index.md` + `mkdocs.yml` in a sample repo, add the `backstage.io/techdocs-ref: dir:.` annotation, and see TechDocs render it inside the portal.
- Install a community plugin (e.g., the Kubernetes plugin) via `yarn add` in `packages/app` and `packages/backend`, and wire it up to show live pod status next to a Component.
- Point the GitHub discovery provider at a real (even personal) GitHub org and watch entities get bulk-registered automatically instead of one-by-one.
