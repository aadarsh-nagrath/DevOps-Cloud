# Argo Workflows — Complete Notes

## 1. Beginner

### What is Argo Workflows?
- A **Kubernetes-native workflow engine**, CNCF **graduated** project, part of the Argo project family.
- Each step of a workflow runs as its own **Pod** — a workflow is a DAG or sequence of steps, and every step gets its own container image, resource limits, and lifecycle, orchestrated entirely through Kubernetes primitives (a custom `Workflow` CRD, controlled by a Kubernetes controller).
- Used for: CI pipelines, ML/data pipelines, batch/ETL jobs, and any multi-step process that benefits from running each step as an isolated, independently resourced container.

### Not to Be Confused With Argo CD
- **Argo CD** (see [Argo CD notes](../../Continuous%20Delivery/ArgoCD/Argo-cd.md)) is a **continuous delivery** tool — it watches Git and syncs Kubernetes manifests into a cluster (the GitOps deployment problem).
- **Argo Workflows** is a **pipeline/workflow execution engine** — it runs multi-step jobs as Pods (the CI/data-pipeline execution problem).
- They're siblings in the same Argo project umbrella and are often used together (Argo Workflows can build/test an image, Argo CD then deploys it), but they solve entirely different problems and have entirely different CRDs (`Workflow` vs `Application`).

### The Core Problem It Solves
Traditional CI runners (a single Jenkins agent, a single GitHub Actions runner) execute an entire pipeline's steps on one machine or in one long-lived environment. That's fine for homogeneous, lightweight pipelines, but breaks down when:
- Different steps need wildly different environments (a build step needing a specific compiler toolchain image, a test step needing a database sidecar, a training step needing a GPU).
- Steps need independent resource limits (one step needs 32GB RAM for a data job, another needs 200MB for a lint check) — sharing one runner wastes resources or starves the heavy step.
- You want the isolation and reproducibility that comes from "each step is its own container" without hand-rolling that on top of a non-Kubernetes-native CI system.

```
Traditional CI runner:                 Argo Workflows:
  [One VM/runner]                        [Pod: build]  --image: golang:1.22
    build                                      |
    test                                       v
    deploy-check                          [Pod: test]   --image: custom-test-image, own CPU/mem limits
  (shared env, shared resources)                |
                                                 v
                                          [Pod: deploy-check] --image: kubectl-tools, own service account
```
Each Pod is scheduled, resourced, and isolated by Kubernetes itself — Argo Workflows just orchestrates the DAG of which Pod runs when, with what inputs/outputs.

### Core Architecture
```
   kubectl / argo CLI / Argo Events trigger
                |
                v
         [Workflow CRD object] (created in cluster)
                |
                v
     [Workflow Controller] (watches Workflow objects, drives execution)
                |
     +----------+-----------+
     |          |           |
  [Pod: step1] [Pod: step2] [Pod: step3]   <-- each step = one Pod
     |          |           |
     +----------+-----------+
                |
                v
        [Argo Server] (REST/gRPC API + Web UI)
```
- **Workflow Controller**: the core operator — watches `Workflow` custom resources, figures out which steps are ready to run (based on DAG dependencies), creates Pods for them, tracks status.
- **Argo Server**: serves the Web UI and API — visualize DAGs, view logs, resubmit workflows.
- **`argo` CLI**: submit, get, list, logs, delete workflows from the terminal.

### Core Concepts
| Term | Meaning |
|---|---|
| **Workflow** | The top-level CRD — an instance of a running (or completed) pipeline |
| **Template** | A reusable unit of work within a workflow — can be a container step, a DAG, a set of steps, or a script |
| **Steps** | A workflow type where templates run in defined sequential/parallel groups (a list of lists) |
| **DAG** | A workflow type where templates declare explicit `dependencies` on other templates — more flexible than Steps for complex fan-out/fan-in graphs |
| **Artifact** | A file/output passed from one step to another, typically stored in an object store (S3, GCS, MinIO) between steps since each step is a separate Pod with no shared filesystem by default |
| **Parameter** | A value passed into a workflow or between steps (e.g., a Git commit SHA, a config value) |

### Basic Workflow Example
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: hello-world-
spec:
  entrypoint: say-hello
  templates:
    - name: say-hello
      container:
        image: busybox
        command: [echo]
        args: ["hello from Argo Workflows"]
```
```bash
argo submit --watch hello-world.yaml
```

---

## 2. Intermediate

### DAG-Based Workflow with Dependencies
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: ci-pipeline-
spec:
  entrypoint: pipeline
  templates:
    - name: pipeline
      dag:
        tasks:
          - name: build
            template: build-step
          - name: unit-test
            template: test-step
            dependencies: [build]
          - name: lint
            template: lint-step
            dependencies: [build]
          - name: deploy-check
            template: deploy-check-step
            dependencies: [unit-test, lint]

    - name: build-step
      container:
        image: golang:1.22
        command: [sh, -c]
        args: ["go build -o /out/app ./..."]

    - name: test-step
      container:
        image: golang:1.22
        command: [sh, -c]
        args: ["go test ./..."]

    - name: lint-step
      container:
        image: golangci/golangci-lint:latest
        command: [golangci-lint]
        args: [run]

    - name: deploy-check-step
      container:
        image: bitnami/kubectl:latest
        command: [sh, -c]
        args: ["kubectl diff -f manifests/ || true"]
```
`unit-test` and `lint` both depend only on `build` and run in parallel once it completes; `deploy-check` waits for both. This fan-out/fan-in shape is exactly what the DAG template type is for — expressing real dependency graphs, not just a linear list.

### Steps-Based Alternative (Simpler, Sequential/Parallel Groups)
```yaml
templates:
  - name: pipeline
    steps:
      - - name: build
          template: build-step
      - - name: unit-test
          template: test-step
        - name: lint
          template: lint-step
      - - name: deploy-check
          template: deploy-check-step
```
Each inner list `[- - ...]` is a parallel group; outer list items run sequentially. `unit-test` and `lint` are in the same inner list so they run in parallel, same effect as the DAG example — Steps is more readable for simple pipelines, DAG scales better for complex/irregular dependency graphs.

### Passing Artifacts Between Steps
```yaml
templates:
  - name: generate-data
    container:
      image: busybox
      command: [sh, -c]
      args: ["echo 'hello data' > /tmp/output.txt"]
    outputs:
      artifacts:
        - name: data
          path: /tmp/output.txt

  - name: consume-data
    inputs:
      artifacts:
        - name: data
          path: /tmp/input.txt
    container:
      image: busybox
      command: [cat, /tmp/input.txt]
```
Since each step is a separate Pod, Argo transparently uploads `generate-data`'s output artifact to configured object storage (S3/MinIO/GCS/Azure Blob) and downloads it into `consume-data`'s Pod before it starts — no shared volume needed across steps by default (though a shared PVC/`volumeClaimTemplate` is also an option for same-workflow steps that need one).

### Parameters
```yaml
spec:
  entrypoint: greet
  arguments:
    parameters:
      - name: name
        value: "world"
  templates:
    - name: greet
      inputs:
        parameters:
          - name: name
      container:
        image: busybox
        command: [echo]
        args: ["hello {{inputs.parameters.name}}"]
```
```bash
argo submit greet.yaml -p name=aadarsh
```

### Argo Workflows vs Traditional CI Tools
| Dimension | Traditional CI (Jenkins, single-runner GitHub Actions job) | Argo Workflows |
|---|---|---|
| **Execution unit** | Shared runner/VM across steps | Each step is its own Pod — independent image, CPU/mem limits |
| **Heterogeneous steps** | Awkward (all steps share one environment/toolchain unless using containers-in-containers) | Natural — swap container image per step trivially |
| **Resource isolation** | Coarse (whole runner sized for the heaviest step) | Fine-grained per step, scheduled by Kubernetes |
| **Native Kubernetes integration** | Bolted on (plugins, k8s-runner add-ons) | First-class — it IS a Kubernetes controller/CRD |
| **Scaling** | Scale runners/agents | Scale is just "more Pods," handled by cluster autoscaling |
| **Best fit** | Simple, lightweight, homogeneous pipelines | Complex DAGs, ML/data pipelines, heterogeneous resource needs, Kubernetes-native shops |

---

## 3. Advanced

### Argo Events Integration (Event-Driven Workflows)
- **Argo Events** is a separate but tightly integrated CNCF-adjacent Argo project: an event-driven automation framework with `EventSource` and `Sensor` CRDs that can trigger a Workflow in response to external events (a webhook, a Kafka message, an S3 object creation, a cron schedule).
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Sensor
metadata:
  name: webhook-sensor
spec:
  dependencies:
    - name: webhook-dep
      eventSourceName: webhook
      eventName: example
  triggers:
    - template:
        name: workflow-trigger
        k8s:
          operation: create
          source:
            resource:
              apiVersion: argoproj.io/v1alpha1
              kind: Workflow
              metadata:
                generateName: event-triggered-
              spec:
                entrypoint: say-hello
                templates:
                  - name: say-hello
                    container:
                      image: busybox
                      command: [echo, "triggered by event"]
```
This is how "push a commit → CI workflow starts" or "new file lands in S3 → ETL workflow starts" gets wired without a separate always-polling CI orchestrator.

### Workflow Templates and Cluster Workflow Templates
- `WorkflowTemplate` (namespace-scoped) and `ClusterWorkflowTemplate` (cluster-scoped) let you define reusable workflow definitions that individual `Workflow` submissions reference, instead of duplicating full YAML per run:
```yaml
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: ci-template
spec:
  entrypoint: pipeline
  templates: [...]
```
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: ci-run-
spec:
  workflowTemplateRef:
    name: ci-template
```

### Retry, Timeout, and Exit Handlers
```yaml
templates:
  - name: flaky-step
    retryStrategy:
      limit: 3
      retryPolicy: OnFailure
      backoff:
        duration: "10s"
        factor: 2
    activeDeadlineSeconds: 300
    container:
      image: busybox
      command: [sh, -c, "exit 1"]
```
- `retryStrategy` handles transient failures without failing the whole workflow.
- `spec.onExit` can define a template that always runs at workflow completion (success or failure) — common for cleanup/notification steps.

### Scaling and Performance
- The Workflow Controller processes many `Workflow` objects concurrently; `--parallelism` at the workflow or template level caps how many Pods run simultaneously to avoid overwhelming the cluster.
- Large workflows (thousands of steps/Pods) benefit from **Pod garbage collection** settings (`podGC`) to avoid leaving completed Pods around indefinitely, and from offloading large workflow status to a database (`persistence` config with Postgres/MySQL) since etcd has object-size limits that a huge inline workflow status can hit.
- **Archiving**: completed workflows can be archived to an external database so they don't need to stay live as Kubernetes objects, keeping etcd/API-server load down.

### Security
- Each step's Pod runs under a Kubernetes **ServiceAccount** — scope permissions per-workflow or per-step template so a build step can't, say, call the Kubernetes API to modify Secrets.
- `PodSecurityContext`/`securityContext` per template like any other Pod spec — run as non-root, drop capabilities, etc.
- Artifact repositories (S3/MinIO) should use scoped credentials, ideally via a Secret referenced per-workflow rather than a cluster-wide superuser credential.

### The Argo Workflows UI
- Argo Server's web UI renders the DAG visually with live status per node (pending/running/succeeded/failed), lets you view each step's logs inline, retry/resubmit failed workflows, and browse artifact outputs.
- Particularly useful for debugging complex fan-out/fan-in DAGs where reading raw YAML status doesn't make the failure point obvious.

### Common Failure Modes
| Symptom | Likely Cause |
|---|---|
| Workflow stuck `Pending` | Pod can't be scheduled — check resource requests vs cluster capacity, node selectors/taints |
| Step fails immediately with no logs | Image pull failure — check `imagePullSecrets`/registry access |
| Artifact step fails to pass data | Artifact repository (S3/MinIO) misconfigured or credentials missing — check `configmap/workflow-controller-configmap` for the default artifact repository config |
| Workflow object rejected, "too large" | Inline status growing too big for etcd — enable workflow archiving/offloading to a database |

---

## Quick Revision — Argo Workflows
- Kubernetes-native workflow engine — every step runs as its own Pod, orchestrated via the `Workflow` CRD and the Workflow Controller.
- Different tool from **Argo CD**: Argo CD deploys (GitOps CD), Argo Workflows executes pipelines (CI/data/ML/batch). See [Argo CD notes](../../Continuous%20Delivery/ArgoCD/Argo-cd.md) for the deployment-side sibling.
- Two ways to define step ordering: **Steps** (simple sequential/parallel groups) and **DAG** (explicit `dependencies`, better for complex graphs).
- Artifacts move between steps via object storage (S3/GCS/MinIO) since each step is an isolated Pod with no shared filesystem by default.
- `WorkflowTemplate`/`ClusterWorkflowTemplate` let you define reusable pipeline definitions referenced by individual runs.
- **Argo Events** (`EventSource` + `Sensor`) triggers workflows from external events — webhooks, message queues, cron, object storage events.
- Per-step isolation (own image, own resource limits, own ServiceAccount) is the core advantage over traditional single-runner CI for heterogeneous pipelines.
- Scale considerations: `parallelism` caps, `podGC` for cleanup, workflow archiving/offload to Postgres/MySQL to avoid etcd object-size limits on large workflows.
- UI renders the DAG live with per-node status and inline logs — the fastest way to debug a failing complex pipeline.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
