# Kyverno — Kubernetes-Native Policy Engine, In Depth

A complete, standalone deep dive into Kyverno: what it is, how it's built internally, every rule type (`validate`, `mutate`, `generate`, `verifyImages`, cleanup policies), variables/context, background scanning, policy reports, exceptions, the CLI/testing workflow, HA/security considerations, and a large worked-example library. This assumes you've read the introductory comparison in [`policy-as-code-with-opa-and-conftest.md`](policy-as-code-with-opa-and-conftest.md#5-kyverno--a-kubernetes-native-alternative) — this file goes far past that summary.

---

## 1. What Kyverno Is and Why It Exists

**Kyverno** ("govern" in Greek) is a policy engine designed *specifically* for Kubernetes — unlike OPA, which is a general-purpose engine that happens to have a Kubernetes integration (Gatekeeper), Kyverno was built from day one with only Kubernetes resources as its input and output. That single design decision drives almost every difference between the two tools:

- Policies are plain **Kubernetes YAML** — a `ClusterPolicy` or `Policy` custom resource — not a separate policy language (Rego) embedded inside YAML.
- Policy rules are expressed as **patterns that structurally resemble the resource being checked**, so anyone who can read a Pod manifest can read most Kyverno rules without training.
- Because policies are just CRDs, they get the same `kubectl get/describe/apply`, RBAC, and GitOps treatment as any other Kubernetes object — no separate policy-bundle packaging/distribution step (`opa build`, `conftest push`) is needed.

Kyverno does more than admission control (accept/reject at the API server). It has four distinct capabilities, unified under one CRD:

| Capability | What it does | Analogy |
|---|---|---|
| **Validate** | Accept or reject a resource based on whether it matches/doesn't match a pattern | Gatekeeper's `deny` rules |
| **Mutate** | Modify a resource's contents before it's persisted (e.g. inject a default, add a label) | A Kubernetes `MutatingAdmissionWebhook`, but declarative |
| **Generate** | Create/synchronize *additional* resources in response to another resource being created (e.g. a default `NetworkPolicy` whenever a `Namespace` is created) | Nothing in vanilla Kubernetes — this is Kyverno-specific |
| **Verify Images** | Verify container image signatures/attestations (supply-chain security) before allowing the Pod to run | Sigstore/cosign policy enforcement, natively in the admission path |

OPA/Gatekeeper can only validate (reject/accept). Kyverno's mutate and generate capabilities are a meaningful superset of what Gatekeeper does out of the box — this is the single biggest functional reason teams pick Kyverno over Gatekeeper beyond "no Rego."

---

## 2. Architecture — What's Actually Running in the Cluster

Installing Kyverno deploys several components (via Helm or static manifests), not just one Pod:

```
                     ┌─────────────────────────┐
kubectl apply ─────▶ │   Kubernetes API Server  │
                     └────────────┬─────────────┘
                                  │  admission review request
                                  ▼
                     ┌─────────────────────────┐
                     │   kyverno admission      │◀── validate / mutate / verifyImages
                     │   controller (webhook)   │     happen HERE, synchronously,
                     └────────────┬─────────────┘     before the object is persisted
                                  │  allowed object persisted to etcd
                                  ▼
                     ┌─────────────────────────┐
                     │   etcd (object stored)   │
                     └────────────┬─────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                          ▼
┌───────────────┐      ┌───────────────────┐      ┌────────────────────┐
│ background     │      │ generate           │      │ cleanup            │
│ controller      │      │ controller         │      │ controller         │
│ (periodic       │      │ (creates/syncs     │      │ (TTL-based /       │
│  re-scan of     │      │  generated          │      │  scheduled          │
│  existing        │      │  resources, e.g.    │      │  deletion of        │
│  resources,      │      │  default            │      │  matching           │
│  produces        │      │  NetworkPolicy      │      │  resources)         │
│  PolicyReports)  │      │  per Namespace)     │      └────────────────────┘
└───────────────┘      └───────────────────┘
        │
        ▼
┌───────────────────────────┐
│ reports controller         │
│ → PolicyReport /            │
│   ClusterPolicyReport CRs   │
└───────────────────────────┘
```

Since Kyverno v1.8+, these responsibilities are split into **separate Deployments** (the older all-in-one single Deployment still exists in some install modes, but the default Helm chart installs them separately for independent scaling/failure isolation):

| Deployment | Responsibility |
|---|---|
| `kyverno-admission-controller` | Serves the `ValidatingWebhookConfiguration`/`MutatingWebhookConfiguration` — the synchronous, in-line admission path. This is the only component on the critical path of `kubectl apply` latency. |
| `kyverno-background-controller` | Periodically re-evaluates policies against resources *already in the cluster* (not just new ones) — this is how policy violations that predate a policy, or that were created while a policy was temporarily down, still get caught. Also handles `generate` rule reconciliation. |
| `kyverno-reports-controller` | Produces and keeps `PolicyReport`/`ClusterPolicyReport` objects up to date, aggregating both admission-time and background-scan results into a single queryable resource. |
| `kyverno-cleanup-controller` | Runs `CleanupPolicy`/`ClusterCleanupPolicy` — scheduled, condition-based deletion of matching resources (garbage collection as policy). |

**Why this matters operationally:** the admission controller is the only piece that can make `kubectl apply` fail or hang. Give it adequate resource requests/limits and multiple replicas (see §13); the other controllers can be slower/have transient issues without users noticing directly, since they don't sit in the request path.

Kyverno registers itself with the API server as standard `ValidatingWebhookConfiguration` and `MutatingWebhookConfiguration` objects (`kubectl get validatingwebhookconfigurations | grep kyverno`) — it is not magic, it's the same webhook mechanism any admission webhook uses, just auto-managed: Kyverno dynamically updates the webhook's `rules` (which resource kinds/operations to intercept) as policies are added/removed, so you don't hand-maintain webhook configuration yourself.

---

## 3. Installation

```bash
# Helm (recommended for production — supports HA, resource tuning, etc.)
helm repo add kyverno https://kyverno.github.io/kyverno/
helm repo update
helm install kyverno kyverno/kyverno -n kyverno --create-namespace

# Static manifest (quick lab/test install)
kubectl create -f https://github.com/kyverno/kyverno/releases/latest/download/install.yaml

# Verify
kubectl get pods -n kyverno
kubectl get validatingwebhookconfigurations,mutatingwebhookconfigurations | grep kyverno
```

Also install the **Kyverno CLI** for local policy testing (§11) and the **kubectl-kyverno** plugin — these run entirely client-side, no cluster connection required for basic pattern testing:

```bash
brew install kyverno-cli          # macOS
# or download a release binary from github.com/kyverno/kyverno-cli releases
kyverno version
```

---

## 4. Policy Resource Types: `ClusterPolicy` vs `Policy`

| Resource | Scope | Use when |
|---|---|---|
| `ClusterPolicy` | Cluster-wide — applies to matching resources in *any* namespace (unless scoped down via `match`) | Org-wide guardrails: PSS enforcement, image registry restrictions, mandatory labels |
| `Policy` | Namespaced — only evaluates resources in the namespace it's created in | Team/tenant-specific rules a namespace owner manages themselves without cluster-admin access |

Both share an identical `spec.rules[]` schema — the only difference is the `kind` and namespace scoping. A minimal skeleton:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: my-policy
spec:
  validationFailureAction: Enforce   # Enforce = block; Audit = allow but report the violation
  background: true                    # also evaluate this policy against EXISTING resources (§9)
  rules:
    - name: rule-one                  # each policy can have multiple independent rules
      match:
        any:
          - resources:
              kinds:
                - Pod
      validate:
        message: "..."
        pattern: {}
```

Top-level `spec` fields worth knowing beyond `rules`:

| Field | Meaning |
|---|---|
| `validationFailureAction` | `Enforce` (reject) or `Audit` (allow, but log/report the violation) — settable per-policy, and overridable per-rule since v1.8 via `validationFailureActionOverrides` for staged per-namespace rollout |
| `background` | Whether the background-scan controller re-evaluates this policy against pre-existing resources, not just new admissions |
| `failurePolicy` | `Fail` (reject the request if Kyverno itself errors/times out — the safe-but-riskier default for strict enforcement) vs `Ignore` (allow the request through if Kyverno can't be reached — safer for cluster availability, riskier for policy bypass) |
| `webhookTimeoutSeconds` | How long the API server waits for Kyverno's admission response before applying `failurePolicy` |
| `schemaValidation` | Whether Kyverno validates the policy's own schema at admission (catches malformed policies immediately rather than at runtime) |

---

## 5. Match and Exclude — Scoping a Rule

Every rule needs a `match` block (what this rule applies to) and optionally an `exclude` block (carve-outs). Since Kyverno v1.7+, the idiomatic syntax uses `any`/`all` (each a list of match blocks combined with OR/AND respectively) instead of the older flat `resources:` shorthand — both still work, but `any`/`all` is what current documentation and generated policies use.

```yaml
match:
  any:
    - resources:
        kinds:
          - Pod
          - Deployment
        namespaces:
          - "default"
          - "staging-*"          # supports wildcards
        selector:
          matchLabels:
            app: web
    - resources:
        kinds:
          - Job
      subjects:                   # match based on WHO is submitting the request
        - kind: User
          name: alice@example.com
exclude:
  any:
    - resources:
        namespaces:
          - kube-system
          - kyverno
        # near-universal exclusion: never let a policy accidentally
        # break the platform's own control-plane namespaces
    - resources:
        kinds:
          - Pod
        selector:
          matchLabels:
            policy.exempt: "true"
```

Matching dimensions available beyond `kinds`/`namespaces`/`selector`:

| Field | Matches on |
|---|---|
| `resources.kinds` | API kind(s) — `Pod`, `Deployment`, `Ingress`, custom CRDs, etc. |
| `resources.names` / `resources.name` | Resource name (supports wildcards, e.g. `"web-*"`) |
| `resources.namespaces` | Namespace name (wildcards supported) |
| `resources.namespaceSelector` | Match by namespace *labels* rather than name — much more maintainable than hardcoding names |
| `resources.selector` | Match by the resource's own labels |
| `resources.operations` | `CREATE`, `UPDATE`, `DELETE`, `CONNECT` — restrict a rule to only fire on specific verbs |
| `subjects` | The Kubernetes user/group/service-account making the request |
| `roles` / `clusterRoles` | The RBAC role bound to the requester |

**Practical rule:** always exclude `kube-system` (and Kyverno's own namespace) from broad `ClusterPolicy` rules unless you have a specific reason to police the control plane — a strict PSS policy that accidentally blocks a `kube-system` DaemonSet update can take down cluster networking.

---

## 6. Preconditions — Conditional Rule Logic

`preconditions` gate whether a rule's main logic (`validate`/`mutate`/`generate`) even runs, evaluated *after* `match`/`exclude` but *before* the rule body — useful for "only apply this rule if X is also true" logic that doesn't fit cleanly into `match`.

```yaml
preconditions:
  all:
    - key: "{{ request.operation }}"
      operator: NotEquals
      value: DELETE
      # skip this rule entirely on delete requests — nothing to validate/mutate
    - key: "{{ request.object.metadata.labels.\"skip-policy\" || '' }}"
      operator: NotEquals
      value: "true"
```

`key`/`value` support the same JMESPath variable substitution used everywhere else in Kyverno (§7). `operator` supports `Equals`, `NotEquals`, `In`, `AnyIn`, `AllIn`, `AnyNotIn`, `AllNotIn`, `GreaterThan`, `LessThan`, and more — see the full operator table in Kyverno's docs when a rule needs numeric/set comparisons rather than plain equality.

---

## 7. Variables and Context — Where Rule Data Comes From

Kyverno rules are templated with **JMESPath** expressions inside `{{ }}` delimiters, resolved against a **context** that's assembled per-request. Understanding the context is the single most important skill for writing non-trivial Kyverno policies.

### 7.1 Built-in variables (always available, no `context` block needed)

| Variable | Contains |
|---|---|
| `{{ request.object }}` | The full incoming resource being admitted (the thing you're validating/mutating) |
| `{{ request.oldObject }}` | The previous version of the resource, on `UPDATE`/`DELETE` |
| `{{ request.operation }}` | `CREATE`, `UPDATE`, `DELETE`, or `CONNECT` |
| `{{ request.userInfo }}` | The requester's username, groups, UID |
| `{{ serviceAccountName }}` / `{{ serviceAccountNamespace }}` | Shorthand accessors into `request.userInfo` for the common "who submitted this" case |
| `{{ images }}` | A structured map of every container image referenced in the resource (populated automatically for Pod-like resources) — the basis for `verifyImages` (§10) |

### 7.2 Custom context: `configMap`, `apiCall`, `variable`, `globalReference`

`context` lets a rule pull in *external* data before evaluating:

```yaml
rules:
  - name: enforce-approved-registry-from-configmap
    match:
      any:
        - resources:
            kinds: [Pod]
    context:
      - name: approvedRegistries
        configMap:
          name: registry-allowlist      # a ConfigMap living in Kyverno's namespace or the resource's namespace
          namespace: kyverno
    validate:
      message: "Image registry not in the approved list"
      foreach:
        - list: "request.object.spec.containers"
          deny:
            conditions:
              all:
                - key: "{{ images.containers.\"{{element.name}}\".registry }}"
                  operator: AnyNotIn
                  value: "{{ approvedRegistries.data.registries }}"
```

`context` sources available:

| Source | Use case |
|---|---|
| `configMap` | Pull an allowlist/denylist or config value from a ConfigMap, rather than hardcoding it in every policy — update the ConfigMap and every referencing policy picks it up without a policy edit |
| `apiCall` | Call the Kubernetes API (or any external URL) at evaluation time — e.g. look up a resource that isn't the one being admitted, check the count of existing resources of a kind, or query an external service for a decision |
| `variable` | Compute and name an intermediate JMESPath expression once, then reference it repeatedly by name elsewhere in the rule (avoids repeating a long JMESPath expression) |
| `globalReference` | (Newer Kyverno versions) Reference a `GlobalContextEntry` cluster resource — a way to share a single cached API/ConfigMap lookup across *many* policies instead of every policy re-fetching it independently |

### 7.3 JMESPath gotchas worth knowing up front

- Kubernetes label/annotation keys often contain `.` or `/` (e.g. `kubernetes.io/name`) — JMESPath treats `.` as a path separator, so such keys must be quoted: `request.object.metadata.labels."app.kubernetes.io/name"`.
- Kyverno adds several **custom JMESPath functions** beyond the JMESPath spec: `add()`, `subtract()`, `to_upper()`, `regex_match()`, `time_since()`, `parse_json()`, `pattern_match()`, and more — check the docs' function list before writing custom string/date logic manually.
- Missing/optional fields: `{{ request.object.spec.containers[0].resources.limits.memory || '0' }}` — the `|| 'default'` pattern avoids a hard evaluation error when a field may not exist.

---

## 8. Validate Rules, In Depth

### 8.1 Pattern-based validation (the common case)

A `pattern` mirrors the shape of the resource; every field you include becomes a required condition, and special operators express "must exist," "must not exist," "one of," etc.

```yaml
validate:
  message: "CPU and memory requests/limits are required on every container"
  pattern:
    spec:
      containers:
        - resources:
            requests:
              memory: "?*"     # must exist and be non-empty
              cpu: "?*"
            limits:
              memory: "?*"
              cpu: "?*"
```

Pattern operator cheat-sheet:

| Operator | Meaning |
|---|---|
| `?*` | Field must exist and be non-empty (any value) |
| `X*` (e.g. `"ghcr.io/*"`) | Wildcard match — value must start with `X` |
| `*?` | Field may or may not exist, but if present must be non-empty |
| `!` (e.g. `"!latest"`) | Negation — value must NOT equal this |
| `>`, `>=`, `<`, `<=` (e.g. `">=1"`) | Numeric comparisons |
| `X | Y` inside `anyPattern` | See below — OR logic across whole sub-patterns |

For "must NOT have this field at all" logic, use `X(field): "null"` inside a pattern, or more commonly reach for `deny.conditions` (§8.2) which is more expressive for negative/complex logic.

### 8.2 `anyPattern` — OR logic across whole patterns

A single `pattern` block is implicitly AND'd. To express "must satisfy pattern A OR pattern B," use `anyPattern`:

```yaml
validate:
  message: "hostPath volumes must be read-only, or not used at all"
  anyPattern:
    - spec:
        =(volumes):
          - X(hostPath): "null"       # pattern A: no hostPath volumes present at all
    - spec:
        volumes:
          - hostPath:
              readOnly: true           # pattern B: hostPath present, but readOnly
```

(`=(field)` marks a field as optional-but-if-present-must-match — a subtlety used to make list-element patterns not fail outright when the list is empty.)

### 8.3 `deny.conditions` — imperative-style logic for what patterns can't express cleanly

For logic that's awkward as a structural pattern (comparisons across two different fields, complex boolean combinations, numeric thresholds), use `deny`:

```yaml
validate:
  message: "replicas must not exceed 10 in the 'staging' namespace"
  deny:
    conditions:
      all:
        - key: "{{ request.object.metadata.namespace }}"
          operator: Equals
          value: staging
        - key: "{{ request.object.spec.replicas }}"
          operator: GreaterThan
          value: 10
```

`deny.conditions` supports the same `all`/`any` nesting and operator set as `preconditions` (§6) — think of `preconditions` as "should this rule run at all" and `deny.conditions` as "given that it's running, is this specific request bad."

### 8.4 `foreach` — validating/mutating each element of a list independently

Pod specs contain arrays (`containers`, `initContainers`, `ephemeralContainers`), and a plain `pattern` block only expresses "the first/only element must match" unless you use `foreach` to genuinely iterate:

```yaml
validate:
  message: "Container '{{ element.name }}' must not run as root"
  foreach:
    - list: "request.object.spec.containers"
      deny:
        conditions:
          all:
            - key: "{{ element.securityContext.runAsNonRoot }}"
              operator: NotEquals
              value: true
```

Inside a `foreach`, the current list element is bound to `element`, and its index to `elementIndex` — this is the idiomatic way to validate every container in a Pod (including `initContainers`/`ephemeralContainers` via separate `foreach` entries) rather than relying on pattern-matching quirks against array position `[0]`.

### 8.5 `validationFailureAction`: Enforce vs Audit, and staged rollout

- **`Audit`** — the resource is *admitted* even if it violates the policy, but the violation is recorded in a `PolicyReport` (§12). This is the correct starting mode for any new policy in a live cluster: you see what *would* break before you turn on enforcement.
- **`Enforce`** — the resource is rejected outright.

Since v1.8, `validationFailureActionOverrides` lets one policy run `Enforce` in some namespaces and `Audit` in others simultaneously — the standard way to roll a new guardrail out namespace-by-namespace instead of flipping it cluster-wide in one shot:

```yaml
spec:
  validationFailureAction: Audit
  validationFailureActionOverrides:
    - action: Enforce
      namespaces:
        - production
    - action: Audit
      namespaces:
        - staging
        - dev
```

---

## 9. Background Scanning — Catching Violations in Resources That Already Exist

Admission control only ever sees resources at the *moment* they're created/updated. Two realistic gaps that leaves open:

1. A policy is added *after* non-compliant resources already exist in the cluster — they're never re-evaluated unless something re-triggers admission (e.g. someone edits them).
2. Kyverno's webhook is briefly unavailable (upgrade, crash, `failurePolicy: Ignore`) and a bad resource slips through during the gap.

`spec.background: true` (the default) tells the **background controller** to periodically re-evaluate the policy against every existing matching resource in the cluster, independent of admission — the results feed into `PolicyReport`/`ClusterPolicyReport` (§12) even though nothing is rejected retroactively (Kubernetes has no concept of un-admitting an object that already exists; background scanning is *detective*, not *preventive*, control for pre-existing resources).

Because of this distinction, mature Kyverno usage treats the two as complementary, not redundant:

| | Admission (webhook) | Background scan |
|---|---|---|
| Timing | Synchronous, at the moment of `CREATE`/`UPDATE` | Periodic (default every ~1 hour, configurable), asynchronous |
| Can block? | Yes (`Enforce`) | No — purely detects and reports |
| Covers pre-existing resources | No | Yes |
| Covers requests during webhook downtime | No (`failurePolicy` decides fallback) | Yes — eventually surfaces anything that slipped through |

Rules that only make sense for `mutate`/`generate` (not `validate`) are typically also given `background: false` at the policy level when they truly can't apply usefully outside admission-time — but for `validate` rules, leaving `background: true` (the default) is almost always correct.

---

## 10. Mutate Rules, In Depth

Mutation runs *before* validation in the admission chain — a common pattern is: mutate a sane default in, then validate that the field is present (which it now always will be, either from the user or from the mutation).

### 10.1 `patchStrategicMerge` — the common case

```yaml
mutate:
  patchStrategicMerge:
    spec:
      containers:
        - (name): "*"                 # apply to every container regardless of name
          resources:
            limits:
              +(memory): "512Mi"       # "+()" = add ONLY IF the field is not already set
              +(cpu): "500m"
```

`+(field)` is the key mutate-specific operator: **add this value only if the field is absent** — it never overwrites a value the user explicitly set, which is almost always the desired behavior for "inject a sane default" policies (as opposed to "force this value no matter what," which would just be a plain field assignment).

### 10.2 `patchesJson6902` — surgical patches (RFC 6902 JSON Patch)

For edits that strategic-merge patching can't express cleanly (e.g. inserting into the middle of an array, or removing a field), use standard JSON Patch syntax:

```yaml
mutate:
  patchesJson6902: |
    - op: add
      path: "/metadata/annotations/managed-by"
      value: kyverno
    - op: remove
      path: "/spec/template/spec/containers/0/securityContext/privileged"
```

### 10.3 `foreach` mutation

Same iteration model as validate's `foreach` (§8.4), for per-element edits across an array (e.g. adding a label to every container's environment, or appending an item to each container's `env` list) where a single strategic-merge block can't target "every element, however many there are."

### 10.4 Mutating existing resources: `mutateExistingOnPolicyUpdate`

By default, mutate rules only fire at admission time on the specific resource being created/updated — they don't retroactively touch unrelated existing resources just because the policy changed. Setting `mutateExistingOnPolicyUpdate: true` (or triggering via a separate resource's admission event, e.g. "when a new ConfigMap is created, go patch an unrelated Deployment") extends mutation to **existing** resources, driven by the background controller rather than the webhook. This is the mechanism behind patterns like "when a Secret is updated, automatically roll the Deployments that reference it" — genuinely powerful, and correspondingly worth testing carefully in `Audit`-adjacent staging before trusting it against production objects, since a mutate rule with a bug can silently corrupt live resources at scale.

---

## 11. Generate Rules, In Depth

`generate` creates a *new*, separate resource in response to a triggering event — most commonly, "whenever a Namespace is created, also create a default NetworkPolicy / ResourceQuota / RoleBinding in it."

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: default-deny-netpol
spec:
  rules:
    - name: generate-default-deny
      match:
        any:
          - resources:
              kinds:
                - Namespace
      exclude:
        any:
          - resources:
              namespaces:
                - kube-system
                - kyverno
      generate:
        apiVersion: networking.k8s.io/v1
        kind: NetworkPolicy
        name: default-deny-all
        namespace: "{{ request.object.metadata.name }}"   # the namespace that triggered this rule
        synchronize: true    # if the generated resource is edited/deleted later, Kyverno reverts/recreates it
        data:                # inline resource spec (alternative: "clone" from an existing source resource)
          spec:
            podSelector: {}
            policyTypes:
              - Ingress
              - Egress
```

Key fields:

| Field | Meaning |
|---|---|
| `data` | Inline the generated resource's spec directly in the policy (as above) |
| `clone` / `cloneList` | Instead of `data`, copy an *existing* resource (e.g. a shared `ImagePullSecret` or `ConfigMap`) into the new namespace — used for "every namespace gets a copy of this org-wide secret" |
| `synchronize` | `true` = Kyverno continuously reconciles the generated resource back to the policy's intent if someone edits or deletes it (like a mini-controller); `false` = generate once, then leave it alone even if later modified |
| `generateExisting` | Whether this rule also runs against namespaces/resources that already existed *before* the policy was created (similar spirit to background scanning, but for generate rather than validate) |

This is genuinely something Gatekeeper/OPA has no equivalent for out of the box — it turns Kyverno into a lightweight, declarative "operator" for bootstrapping standard resources across a fleet of namespaces, without writing a custom Kubernetes controller.

---

## 12. Image Verification (`verifyImages`) — Supply-Chain Enforcement at Admission

`verifyImages` rejects Pods whose container images fail signature or attestation verification — the admission-time enforcement half of a software-supply-chain-security posture (see [`../Security in DevOps/supply-chain-security.md`](../Security%20in%20DevOps/supply-chain-security.md) for the broader signing/SBOM/provenance picture this plugs into).

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-image-signatures
spec:
  validationFailureAction: Enforce
  rules:
    - name: verify-signature
      match:
        any:
          - resources:
              kinds:
                - Pod
      verifyImages:
        - imageReferences:
            - "ghcr.io/myorg/*"          # only enforce for this org's own images
          attestors:
            - entries:
                - keyless:                 # cosign keyless (Sigstore/Fulcio/Rekor) verification —
                    subject: "https://github.com/myorg/*"   # no static key management needed
                    issuer: "https://token.actions.githubusercontent.com"
          # Alternative: static public-key verification instead of keyless:
          # attestors:
          #   - entries:
          #       - keys:
          #           publicKeys: |-
          #             -----BEGIN PUBLIC KEY-----
          #             ...
          #             -----END PUBLIC KEY-----
```

`verifyImages` can additionally check **attestations** (not just "was this signed," but "does the attached SBOM/provenance predicate satisfy a condition") — e.g. reject an image if its attached vulnerability-scan attestation shows any CRITICAL CVE, or if it wasn't built by the expected CI pipeline identity. This is the mechanism that turns "we scan images in CI" into "we can *prove*, at the moment a Pod is scheduled, that the running image is the one CI actually scanned and signed" — closing the gap where a CI scan result and what actually gets deployed can otherwise silently diverge.

---

## 13. Cleanup Policies — Policy-Driven Garbage Collection

`CleanupPolicy` / `ClusterCleanupPolicy` (handled by the dedicated cleanup controller from §2) delete matching resources on a schedule or condition — e.g. TTL-based cleanup of completed `Job`s, stale `Secret`s, or orphaned `PVC`s:

```yaml
apiVersion: kyverno.io/v2
kind: ClusterCleanupPolicy
metadata:
  name: cleanup-completed-jobs
spec:
  match:
    any:
      - resources:
          kinds:
            - Job
  conditions:
    all:
      - key: "{{ target.status.succeeded || `0` }}"
        operator: GreaterThan
        value: 0
  schedule: "0 * * * *"    # standard cron syntax — run this cleanup check hourly
```

This overlaps in intent with Kubernetes' native `ttlSecondsAfterFinished` on Jobs, but generalizes the idea to arbitrary resource kinds and arbitrary match/condition logic, expressed the same declarative way as every other Kyverno policy.

---

## 14. Policy Reports — Where Violations Are Recorded

Both admission-time `Audit` results and background-scan results accumulate into **`PolicyReport`** (namespaced) and **`ClusterPolicyReport`** (cluster-scoped resources, non-namespaced policies/resources) objects — these implement the CNCF `wgpolicyk8s.io` Policy Report standard, so tooling built against that spec (some dashboards, `kubectl` plugins) works across policy engines, not just Kyverno.

```bash
# See a summary of pass/fail counts per policy, per namespace
kubectl get policyreport -A

# Drill into one report's violation details
kubectl get policyreport <name> -n <namespace> -o yaml
```

A report entry records: which policy/rule, which resource, `pass`/`fail`/`warn`/`error`/`skip`, and the human-readable message from the rule's `message:` field — this is the primary place to look when rolling a policy out in `Audit` mode to see what *would* be blocked before flipping to `Enforce`.

---

## 15. PolicyExceptions — Exempting Specific Resources Without Editing the Policy

Hardcoding every exemption into a policy's own `exclude` block doesn't scale once exemptions are requested by many different teams for many different reasons — it turns the guardrail policy itself into a constantly-churning file that non-platform-team people need edit access to. **`PolicyException`** (a separate namespaced CRD, must be explicitly enabled via `--enablePolicyException` on the admission controller, since letting arbitrary namespaces exempt themselves from cluster policy is a meaningful security decision) decouples "the exemption" from "the policy":

```yaml
apiVersion: kyverno.io/v2
kind: PolicyException
metadata:
  name: exempt-legacy-app
  namespace: legacy-app
spec:
  exceptions:
    - policyName: require-non-root
      ruleNames:
        - check-runasnonroot
  match:
    any:
      - resources:
          kinds:
            - Pod
          names:
            - legacy-app-*
  conditions:
    all:
      - key: "{{ request.object.metadata.namespace }}"
        operator: Equals
        value: legacy-app
```

This is the Kyverno-native equivalent of a documented, reviewable, time-boxed waiver — it can (and should) be scoped tightly by name/namespace/condition, reviewed in a PR like any other manifest, and audited by simply listing all `PolicyException` objects cluster-wide rather than grepping every policy's `exclude` block for one-off carve-outs.

---

## 16. The Kyverno CLI — Local Testing Without a Cluster

The `kyverno` CLI applies policies against local manifest files entirely client-side — no cluster connection needed for the core pattern logic, which makes it the right tool for pre-merge CI checks and fast local iteration.

```bash
# Apply a policy against one or more resource files, no cluster required
kyverno apply policy.yaml --resource pod.yaml

# Apply against a whole directory of manifests
kyverno apply policies/ --resource manifests/

# Apply against LIVE cluster resources instead of local files (does need a kubeconfig)
kyverno apply policy.yaml --cluster
```

### 16.1 Structured test suites: `kyverno test`

For repeatable, CI-friendly assertions (not just eyeballing CLI output), define a `kyverno-test.yaml`:

```yaml
name: require-resource-limits-test
policies:
  - ../policies/require-resource-limits.yaml
resources:
  - ../resources/good-pod.yaml
  - ../resources/bad-pod.yaml
results:
  - policy: require-resource-limits
    rule: check-resource-limits
    resource: good-pod
    kind: Pod
    result: pass
  - policy: require-resource-limits
    rule: check-resource-limits
    resource: bad-pod
    kind: Pod
    result: fail
```

```bash
kyverno test .
```

This is the direct Kyverno analogue of Conftest's `conftest test` step from [`policy-as-code-with-opa-and-conftest.md`](policy-as-code-with-opa-and-conftest.md#31-worked-example-gating-a-terraform-plan-in-ci) — wire it into CI as a required check on any PR that touches `policies/`, so a broken or overly-broad policy is caught before it's ever applied to a real cluster:

```yaml
# Conceptual CI step
- name: Test Kyverno policies
  run: kyverno test ./policies
  # non-zero exit fails the pipeline if any expected pass/fail result doesn't match reality
```

---

## 17. Autogen — One Policy, Automatically Applied to Every Pod Controller

Writing a Pod-level policy (e.g. "containers must not run as root") and only matching `kind: Pod` misses the overwhelming majority of real workloads, since almost nothing creates bare Pods directly — they come from `Deployment`, `StatefulSet`, `DaemonSet`, `Job`, `CronJob` templates. Kyverno's **autogen** feature solves this automatically: when a policy's rules match `Pod`, Kyverno internally generates additional copies of those same rules rewritten to match `spec.template.spec` inside each controller kind, so you write the policy once against Pod semantics and it's enforced everywhere a Pod eventually comes from.

```yaml
metadata:
  name: require-non-root
  annotations:
    pod-policies.kyverno.io/autogen-controllers: Deployment,StatefulSet,DaemonSet,Job,CronJob
    # explicit list — or omit the annotation to accept Kyverno's sensible default set
```

```bash
# Inspect what autogen actually produced for a given policy
kubectl get clusterpolicy require-non-root -o yaml
# look for spec.rules entries with names like "autogen-require-non-root" targeting
# Deployment/StatefulSet/etc — these are generated, not something you wrote by hand
```

Set `pod-policies.kyverno.io/autogen-controllers: "none"` to disable autogen entirely for a policy that's deliberately meant to apply only to bare Pods.

---

## 18. Kyverno's Own Security Model — Securing the Policy Engine Itself

Kyverno is, itself, a piece of privileged cluster infrastructure — it holds broad RBAC permissions (it needs to read/write many resource kinds across the whole cluster to do its job) and terminates a webhook the API server trusts. Treat it accordingly:

- **RBAC**: review the `ClusterRole`s Kyverno's service accounts are bound to after install — they're broad by necessity (it must be able to `get`/`list`/`watch` any kind any policy might reference), but access to *edit Kyverno's own service accounts, or to create/edit `ClusterPolicy`/`PolicyException` objects*, should itself be tightly restricted via your own cluster's RBAC — anyone who can create a `ClusterPolicy` can, in principle, mutate or generate resources cluster-wide.
- **Certificates**: the admission webhook's TLS is backed by a cert Kyverno manages (self-signed by default, rotated automatically) — in regulated environments this is commonly swapped for cert-manager-issued certificates instead; check the Helm chart's `certManager` values if that's a requirement.
- **`failurePolicy` trade-off** (§4): `Fail` means a Kyverno outage blocks *all* cluster admissions matching any active policy — a strong guarantee against policy bypass, but a real availability risk if Kyverno itself is unhealthy during an incident. `Ignore` is safer for cluster availability but means policies are silently bypassed during any Kyverno downtime. Most production guidance leans `Fail` for genuinely security-critical policies (image verification, PSS enforcement) provided Kyverno itself is run at real HA (next section) — the whole point of enforcement is that it isn't optional.

---

## 19. High Availability, Scaling, and Performance

- **Replicas**: run at least 2–3 replicas of the admission controller Deployment in any cluster where `failurePolicy: Fail` is used — a single-replica Kyverno is a single point of failure for every `kubectl apply` in the cluster.
- **Resource requests/limits**: the admission controller is latency-sensitive (it sits inline on every matching admission request) — under-provisioning it manifests as slow `kubectl apply`/`kubectl create` cluster-wide, not just a Kyverno-specific symptom, which makes it a confusing thing to diagnose if you don't already know Kyverno is in the request path.
- **`webhookTimeoutSeconds`**: keep this reasonably tight (Kubernetes' own webhook timeout ceiling is 30s) — a slow `apiCall` context lookup (§7.2) inside a validate rule can turn into cluster-wide admission slowness if it's not fast/cached.
- **Policy count and complexity**: every active policy's matching rules are evaluated on every relevant admission request — a large number of broad, complex policies (especially ones using `apiCall` context or heavy `foreach` loops) has a real, measurable effect on API server request latency. Prefer narrow `match`/`exclude` scoping over "match everything, filter with `preconditions`" where possible, since match/exclude filtering happens earlier and cheaper.
- **Background scan interval and cluster size**: on very large clusters, the periodic background re-scan of *all* existing resources against *all* policies is real load — tune the scan interval and be deliberate about which policies actually need `background: true` versus ones that only make sense at admission time (e.g. most `mutate`-only policies).

---

## 20. Kyverno vs OPA/Gatekeeper — Expanded Comparison

The introductory comparison in [`policy-as-code-with-opa-and-conftest.md`](policy-as-code-with-opa-and-conftest.md#51-opagatekeeper-vs-kyverno) covers the headline trade-off (Rego vs YAML). With the full picture from this file, the comparison sharpens:

| | OPA / Gatekeeper | Kyverno |
|---|---|---|
| Policy language | Rego | YAML patterns (+ JMESPath for dynamic parts) |
| Validate (reject bad resources) | Yes | Yes |
| Mutate (inject/patch defaults) | Only via a separate, less commonly used Gatekeeper mutation feature (added later, less mature) | Yes, first-class since early versions |
| Generate (create new resources from a trigger) | No native equivalent | Yes, first-class |
| Verify image signatures | Via separate tooling/integration | Yes, first-class (`verifyImages`) |
| Cleanup/TTL policies | No native equivalent | Yes (`CleanupPolicy`) |
| Reporting | Constraint status conditions; less standardized reporting surface | `PolicyReport`/`ClusterPolicyReport`, implementing the CNCF Policy Report standard |
| Exemptions | Handled via constraint `excludedNamespaces`/match tuning, generally policy-embedded | Dedicated `PolicyException` CRD, decoupled from the policy itself |
| Reusable outside Kubernetes (CI, API authz, service mesh) | Yes — same OPA engine, via Conftest/OPA SDK elsewhere | No — Kyverno only understands Kubernetes resources |
| Best fit | Organizations standardizing one policy engine across CI, Kubernetes, and application-level authorization | Organizations whose policy needs are Kubernetes-specific and want mutate/generate/image-verification without adopting a new language |

The practical takeaway from [`policy-as-code-with-opa-and-conftest.md`](policy-as-code-with-opa-and-conftest.md) still holds: these aren't mutually exclusive tools guarding the same layer. A common real setup uses Conftest/Rego for CI-stage checks against Terraform/config (where a general-purpose engine earns its keep) and Kyverno specifically inside the cluster for admission control, defaulting, and supply-chain enforcement — picking Kyverno there specifically *because* mutate/generate/verifyImages give a platform team capability Gatekeeper alone doesn't.

---

## 21. Worked Example Library — Common Real Policies

A grab-bag of policies covering the most frequently needed guardrails, each demonstrating a different rule type/feature from above.

### 21.1 Enforce Pod Security Standards "restricted" profile (validate + foreach)

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-privileged-containers
spec:
  validationFailureAction: Enforce
  background: true
  rules:
    - name: privileged-containers
      match:
        any:
          - resources:
              kinds:
                - Pod
      validate:
        message: "Privileged containers are not allowed"
        foreach:
          - list: "request.object.spec.[ephemeralContainers, initContainers, containers][]"
            deny:
              conditions:
                all:
                  - key: "{{ element.securityContext.privileged }}"
                    operator: Equals
                    value: true
```

(Kyverno's official `kyverno-policies` chart ships the *entire* Pod Security Standards baseline/restricted profile as ready-made `ClusterPolicy` objects — in practice, most teams install that chart rather than hand-writing every PSS rule from scratch; the example above shows the mechanics one of those rules uses internally.)

### 21.2 Disallow the `latest` image tag (validate, plain pattern)

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-latest-tag
spec:
  validationFailureAction: Enforce
  rules:
    - name: require-image-tag
      match:
        any:
          - resources:
              kinds:
                - Pod
      validate:
        message: "Images must not use the ':latest' tag or be untagged"
        pattern:
          spec:
            containers:
              - image: "!*:latest"
```

### 21.3 Inject default resource limits if missing (mutate)

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: add-default-resources
spec:
  rules:
    - name: default-resources
      match:
        any:
          - resources:
              kinds:
                - Pod
      mutate:
        patchStrategicMerge:
          spec:
            containers:
              - (name): "*"
                resources:
                  requests:
                    +(memory): "128Mi"
                    +(cpu): "100m"
                  limits:
                    +(memory): "512Mi"
                    +(cpu): "500m"
```

### 21.4 Default-deny NetworkPolicy on every new namespace (generate)

Covered fully in §11 — this is the canonical generate-rule example.

### 21.5 Require a cost-allocation label (validate, org-wide tagging guardrail)

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-team-label
spec:
  validationFailureAction: Enforce
  rules:
    - name: check-team-label
      match:
        any:
          - resources:
              kinds:
                - Deployment
                - StatefulSet
      validate:
        message: "Resources must carry a 'team' label for cost allocation"
        pattern:
          metadata:
            labels:
              team: "?*"
```

This directly complements the tagging/allocation discussion in [`../FinOps and Cost Optimization/cost-visibility-and-allocation.md`](../FinOps%20and%20Cost%20Optimization/cost-visibility-and-allocation.md) — a tagging policy that's only a wiki convention is exactly the kind of rule that Kyverno turns into something actually enforced at admission time rather than hoped for.

### 21.6 Restrict allowed image registries (validate, deny.conditions)

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: restrict-registries
spec:
  validationFailureAction: Enforce
  rules:
    - name: allowed-registries
      match:
        any:
          - resources:
              kinds:
                - Pod
      validate:
        message: "Images must come from an approved registry (ghcr.io/myorg or gcr.io/myorg)"
        foreach:
          - list: "request.object.spec.containers"
            deny:
              conditions:
                all:
                  - key: "{{ element.image }}"
                    operator: AllNotIn
                    value:
                      - "ghcr.io/myorg/*"
                      - "gcr.io/myorg/*"
```

---

## 22. Troubleshooting Checklist

| Symptom | Where to look |
|---|---|
| Policy doesn't seem to trigger at all | `kubectl get clusterpolicy <name> -o yaml` — check `status` for a `ready: true`/background-scan info; confirm `match` actually covers the resource kind/namespace/labels used in the test manifest |
| `kubectl apply` hangs or times out cluster-wide | Check `kyverno-admission-controller` Pod health/resource usage (§13) — it's synchronous and on the critical path; also check `webhookTimeoutSeconds` and whether a slow `apiCall` context is the culprit |
| Resources that predate a policy aren't flagged | Confirm `background: true` is set, and check `kubectl get policyreport -A` after the next scan interval, not immediately |
| A rule that should reject is only warning | Check `validationFailureAction` (and any per-namespace `validationFailureActionOverrides`) — it may deliberately be `Audit` |
| JMESPath expression errors in Kyverno logs | `kubectl logs -n kyverno deploy/kyverno-admission-controller` — look for the exact expression; test it standalone with `kyverno apply` locally (§16) before debugging against a live cluster |
| A team says a legitimate deploy is blocked unexpectedly | Check `kubectl get policyreport -n <namespace>` for the exact violated rule/message first, then decide between fixing the manifest vs a scoped `PolicyException` (§15) — never widen the policy's own `exclude` block as the default fix, since that erodes the guardrail for everyone |
| Generated resources keep disappearing/reverting unexpectedly | Check `synchronize: true` on the generate rule — someone may be manually editing a resource Kyverno considers itself the owner of |

---

## 23. Where This Fits: CKA/CKS and the Rest of This Repo

- Kyverno (and admission control generally) is squarely a **CKS** (Certified Kubernetes Security Specialist) topic — supply-chain security, admission controllers, and Pod Security Standards enforcement are named exam domains. If working through [`../CKA/`](../CKA/) material, treat this file as the CKS-adjacent deep dive that CKA itself doesn't require but a security-focused follow-up would.
- For Pod-level concepts referenced throughout this file (`resources.limits`, `securityContext`, `initContainers`), see [`../Kubernetes/K-pods.md`](../Kubernetes/K-pods.md).
- For the broader supply-chain-security picture that `verifyImages` (§12) is the admission-time enforcement half of, see [`../Security in DevOps/supply-chain-security.md`](../Security%20in%20DevOps/supply-chain-security.md) and [`../Security in DevOps/container-and-image-security.md`](../Security%20in%20DevOps/container-and-image-security.md).
- For the CI-stage counterpart to cluster-side admission control, and the general shift-left argument for catching violations as early as possible, see [`policy-as-code-with-opa-and-conftest.md`](policy-as-code-with-opa-and-conftest.md#6-shift-left-why-catch-it-in-ci-not-at-admission-not-in-an-incident).

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
