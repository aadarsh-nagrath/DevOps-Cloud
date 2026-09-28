# Backstage — Complete Notes

## 1. Beginner

### What is Backstage?
- Open-source platform for building **internal developer portals**, originally built at Spotify, donated to CNCF, **graduated** status.
- Not a runtime tool like the other entries in this folder (Jaeger, Prometheus, KEDA) — Backstage is a **platform engineering / developer experience** tool. It doesn't run your workloads or scrape your metrics; it gives engineers one place to find, understand, and act on everything else that does.

### The Core Problem It Solves
```
A company with 400 microservices, no Backstage:

  "Who owns the payments-api service?"        -> ask around on Slack
  "Where are the docs for the checkout flow?"  -> some wiki page, maybe outdated, maybe gone
  "How do I scaffold a new service correctly?" -> copy-paste from a service that "looks similar"
  "What's the on-call runbook for this thing?" -> tribal knowledge, if it exists at all
  "Is this API still used by anything?"        -> nobody actually knows

With Backstage:
  One searchable Software Catalog: every service, API, and resource,
  with an owning team, docs, links, and dependencies — all defined as code.
```
As an organization's service count grows, the cost of *not* having a catalog grows faster than linearly — onboarding slows down, ownership gets fuzzy, and duplicated effort (five teams building the same auth wrapper) becomes common. Backstage centralizes discovery so engineers spend time building, not hunting.

### Core Concepts
| Term | Meaning |
|---|---|
| **Software Catalog** | The central registry of every entity in the org — services, APIs, resources, teams — described as YAML |
| **Entity** | One item in the catalog: `Component`, `API`, `Resource`, `System`, `Domain`, `User`, `Group` |
| **catalog-info.yaml** | The file, committed inside each repo, that describes that repo's entity/entities to Backstage |
| **Software Templates** | Scaffolding for creating new projects with golden-path defaults (repo setup, CI, catalog registration, all pre-wired) |
| **TechDocs** | Docs-as-code — Markdown in the repo, rendered as a polished documentation site inside the Backstage UI |
| **Plugin** | Backstage is mostly a plugin host — the core app does very little on its own; almost all functionality (CI/CD views, Kubernetes pod status, cost dashboards) comes from plugins |

### Core Architecture
```
                    +----------------------------------+
                    |          Backstage App             |
                    |  (React frontend + Node.js backend)|
                    +----------------------------------+
                       |            |             |
                       v            v             v
              +-------------+ +-----------+ +--------------+
              |  Software    | | TechDocs  | |   Plugins    |
              |  Catalog     | | (docs-as- | | (CI/CD,      |
              |  (entities   | |  code,    | |  Kubernetes, |
              |  from        | |  rendered | |  cost, etc.) |
              |  catalog-    | |  MkDocs   | |              |
              |  info.yaml   | |  sites)   | |              |
              |  across all  | |           | |              |
              |  repos)      | |           | |              |
              +-------------+ +-----------+ +--------------+
                       |
                       v
              +-------------------+
              | Database (Postgres |
              | in prod, SQLite    |
              | for local dev)     |
              +-------------------+
```

### Basic `catalog-info.yaml` Example
```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: payments-api
  description: Handles payment processing and refunds
  annotations:
    github.com/project-slug: myorg/payments-api
    backstage.io/techdocs-ref: dir:.
  tags:
    - payments
    - go
spec:
  type: service
  lifecycle: production
  owner: team-payments
  system: checkout
  providesApis:
    - payments-api-spec
```
Committed at the root of the `payments-api` repo, this one file is what makes the service, its owner, and its docs discoverable in the catalog UI the moment it's registered.

---

## 2. Intermediate

### Entity Kinds in Depth
| Kind | Represents |
|---|---|
| `Component` | A piece of software with its own lifecycle — a service, website, library |
| `API` | An interface a Component exposes (REST/GraphQL/gRPC spec) — separately trackable so consumers can find it without knowing which Component implements it |
| `Resource` | Infrastructure a Component depends on but doesn't fully own the lifecycle of — a database, a message queue, an S3 bucket |
| `System` | A logical grouping of Components/APIs/Resources that together deliver a capability (e.g., "checkout" = payments-api + cart-api + checkout-db) |
| `Domain` | A higher-level grouping of Systems (e.g., "commerce") |
| `User` / `Group` | People and teams — drives ownership display and access-related UI across the catalog |

Relationships between entities (`providesApis`, `consumesApis`, `dependsOn`, `partOf`) let Backstage auto-render dependency graphs — you can visually see "checkout system depends on payments-api which depends on payments-db."

### Registering Entities
Two ways to get a `catalog-info.yaml` into the catalog:
1. **Manual registration**: paste the repo URL into the "Register Existing Component" UI flow.
2. **Bulk discovery**: configure a catalog provider to auto-discover `catalog-info.yaml` files across an entire GitHub org/GitLab group:
```yaml
# app-config.yaml
catalog:
  providers:
    github:
      myOrg:
        organization: 'my-github-org'
        catalogPath: '/catalog-info.yaml'
        filters:
          branch: 'main'
        schedule:
          frequency: { minutes: 30 }
```

### Software Templates (Scaffolder)
A template defines a golden path for creating a new service — repo creation, CI wiring, and catalog registration all happen in one guided flow instead of copy-pasting an existing repo and hoping you remembered to change everything.
```yaml
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: nodejs-service-template
  title: New Node.js Service
  description: Scaffolds a Node.js service with CI, Dockerfile, and catalog registration
spec:
  owner: platform-team
  type: service
  parameters:
    - title: Service details
      required: [name, owner]
      properties:
        name:
          type: string
          title: Service name
        owner:
          type: string
          title: Owning team
  steps:
    - id: fetch
      name: Fetch skeleton
      action: fetch:template
      input:
        url: ./skeleton
        values:
          name: ${{ parameters.name }}
          owner: ${{ parameters.owner }}
    - id: publish
      name: Publish to GitHub
      action: publish:github
      input:
        repoUrl: github.com?repo=${{ parameters.name }}&owner=my-github-org
    - id: register
      name: Register in catalog
      action: catalog:register
      input:
        repoContentsUrl: ${{ steps.publish.output.repoContentsUrl }}
        catalogInfoPath: /catalog-info.yaml
```
This is the "golden path" idea in concrete form: every service scaffolded this way starts with correct CI, correct Dockerfile conventions, and is catalog-registered from minute one — no tribal knowledge required.

### TechDocs
- Docs live as Markdown **in the same repo as the code** (docs-as-code, not a separate wiki that drifts out of sync).
- Each repo has an `mkdocs.yml` plus a `docs/` folder; the `backstage.io/techdocs-ref: dir:.` annotation in `catalog-info.yaml` tells Backstage where to find them.
- Backstage builds the MkDocs site (locally or via a CI-triggered "techdocs-cli" publish step to cloud storage) and renders it inline in the portal, next to the entity it documents.

### Plugin Architecture
- The core Backstage app deliberately does very little by itself — almost everything visible (catalog views, CI/CD status widgets, Kubernetes pod health, cost dashboards, on-call/PagerDuty widgets) is a **plugin**.
- Hundreds of open-source plugins exist (ArgoCD, GitHub Actions, Kubernetes, Jenkins, SonarQube, cost-insights, and more); orgs also write internal plugins for proprietary systems.
- Plugins can contribute frontend pages, backend APIs, or both — the frontend is a React app, so a plugin is essentially a self-contained React module registered into the app's routing/UI.

---

## 3. Advanced

### Local Dev Database vs Production
| | SQLite (default local dev) | PostgreSQL (production) |
|---|---|---|
| Setup | Zero config, file-based, works out of the box with `yarn dev` | Requires a running Postgres instance + connection config |
| Persistence | Fine for local iteration, not meant to survive real usage patterns | Durable, supports concurrent backend replicas |
| Use case | `npx @backstage/create-app` local development | Any real deployment — Backstage backend is stateless app logic, Postgres holds catalog state, scaffolder task history, etc. |
Switching is a config change in `app-config.yaml` (`backend.database.client: pg` plus connection details) — no application code changes needed, since Backstage uses Knex as its query builder abstraction.

### Authentication and Permissions
- Backstage supports pluggable auth providers (GitHub, Google, Okta, SAML, etc.) for sign-in — identity resolution maps a logged-in user to catalog `User`/`Group` entities, which is what powers "my services" views and ownership-based filtering.
- The **Permission Framework** lets you define fine-grained policies (who can register new components, who can trigger a scaffolder template, who can edit specific entities) — important once a portal moves from "everyone can see everything" to real multi-team governance with sensitive systems represented in the catalog.

### Catalog as a Source of Truth for Other Tooling
- Because the catalog is structured, machine-readable data (not just a UI), other systems can query it: CI pipelines can look up an owning team for notification routing, cost-allocation tooling can join cloud billing data against `Resource` entities, security scanning can be triggered per-`Component` and results surfaced back into the entity page via a plugin.
- This is the deeper reason organizations invest in Backstage beyond "a nice UI" — it becomes the **ownership and metadata graph** that other platform automation reads from.

### Scaling Considerations
- Bulk entity discovery across thousands of repos needs sensible `schedule.frequency` tuning — too frequent hammers the Git provider's API rate limits.
- TechDocs generation can be offloaded to CI (build the static site in the repo's own pipeline, publish to cloud storage) rather than having the Backstage backend build docs on-demand — keeps the portal responsive at scale.
- Large catalogs benefit from splitting catalog location config across multiple discovery providers/orgs rather than one giant static list, and from entity **ownership tags** used consistently so catalog search/filtering stays useful as entity count grows into the thousands.

### Common Failure Modes / Debugging
| Symptom | Likely cause | Check |
|---|---|---|
| Entity doesn't show up in catalog | `catalog-info.yaml` malformed, or not on the discovered branch/path | Catalog processing errors in backend logs, validate YAML against the entity schema |
| TechDocs page blank/build failing | `mkdocs.yml` missing or misconfigured, missing `techdocs-ref` annotation | Backend TechDocs build logs |
| Scaffolder template fails mid-run | Missing permissions on the target Git org/token, action input mismatch | Scaffolder task execution log (visible in the UI per-run) |
| Ownership/ "my services" view empty | User's auth identity not resolving to a `Group`/`User` entity | Check auth provider's identity resolver config, confirm `User`/`Group` entities exist in catalog |

---

## Quick Revision — Backstage
- Internal developer portal, CNCF graduated, donated by Spotify — a platform engineering/DX tool, not a runtime component.
- Software Catalog is the core: every service described by a `catalog-info.yaml`, entity kinds are `Component`, `API`, `Resource`, `System`, `Domain`, `User`, `Group`.
- Software Templates (Scaffolder) encode golden paths — new services start correctly configured and catalog-registered from creation.
- TechDocs = docs-as-code, Markdown in the repo, rendered in-portal via MkDocs — avoids wiki drift.
- Almost all real functionality comes from plugins — the core app is a thin host; hundreds of plugins exist (CI/CD, Kubernetes, cost, on-call).
- SQLite for local dev (`yarn dev`, zero config), Postgres required for production (durable, supports concurrent backend replicas).
- The catalog's real long-term value is as a machine-readable ownership/metadata graph other platform automation queries against, not just a browsable UI.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
