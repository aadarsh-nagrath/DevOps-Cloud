# Argo Workflows — Learn It Locally

Goal: install Argo Workflows on a local `kind` cluster, submit a DAG workflow, watch it run, and view it visually in the UI — in about 25 minutes.

## Prerequisites
- Docker installed and running.
- `kind` and `kubectl` installed.
- `argo` CLI installed: `brew install argo` (macOS) or download from the [Argo Workflows releases page](https://github.com/argoproj/argo-workflows/releases).

---

## Step 1 — Create a Local Cluster

```bash
kind create cluster --name argo-wf-lab
kubectl cluster-info --context kind-argo-wf-lab
```

---

## Step 2 — Install Argo Workflows

```bash
kubectl create namespace argo
kubectl apply -n argo -f https://github.com/argoproj/argo-workflows/releases/latest/download/install.yaml
```

Wait for everything to come up:
```bash
kubectl get pods -n argo
```
You should see `argo-server`, `workflow-controller`, and `minio` (bundled default artifact storage for local/dev use) all `Running`.

By default the Argo Server requires client certs/SSO for the UI. For local learning, switch it to simpler access:
```bash
kubectl patch deployment argo-server -n argo --type='json' \
  -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args", "value": ["server", "--auth-mode=server"]}]'
```

---

## Step 3 — Submit a Hello World Workflow

```yaml
# hello-world.yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: hello-world-
  namespace: argo
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
argo submit -n argo --watch hello-world.yaml
```
`--watch` streams live status until the workflow completes. You'll see it go `Pending` → `Running` → `Succeeded`.

Check it from the CLI:
```bash
argo list -n argo
argo get -n argo @latest
argo logs -n argo @latest
```
`argo logs @latest` prints the exact stdout of the `busybox` Pod that ran — proof this was a real container execution, not a simulated status.

---

## Step 4 — Submit a Real DAG Workflow

```yaml
# ci-dag.yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: ci-dag-
  namespace: argo
spec:
  entrypoint: pipeline
  templates:
    - name: pipeline
      dag:
        tasks:
          - name: build
            template: build-step
          - name: test
            template: test-step
            dependencies: [build]
          - name: report
            template: report-step
            dependencies: [test]

    - name: build-step
      container:
        image: busybox
        command: [sh, -c]
        args: ["echo 'building...'; sleep 2; echo 'build complete'"]

    - name: test-step
      container:
        image: busybox
        command: [sh, -c]
        args: ["echo 'testing...'; sleep 2; echo 'tests passed'"]

    - name: report-step
      container:
        image: busybox
        command: [sh, -c]
        args: ["echo 'all steps finished, generating report'"]
```
```bash
argo submit -n argo --watch ci-dag.yaml
```
Watch the DAG execute `build` → `test` → `report` in sequence (each depending on the previous). Check logs for each individual step:
```bash
argo logs -n argo @latest -c build
argo logs -n argo @latest -c test
argo logs -n argo @latest -c report
```

---

## Step 5 — View the DAG Visually in the UI

Port-forward the Argo Server:
```bash
kubectl -n argo port-forward deployment/argo-server 2746:2746
```
Open https://localhost:2746 (self-signed cert — accept the browser warning). You'll land on the workflow list; click into the `ci-dag-*` workflow to see the DAG rendered as a graph, each node colored by status (green = succeeded), and you can click any node to view its logs directly in the UI.

---

## Step 6 — Try a Parallel Fan-Out DAG

```yaml
# fan-out.yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: fan-out-
  namespace: argo
spec:
  entrypoint: pipeline
  templates:
    - name: pipeline
      dag:
        tasks:
          - name: build
            template: echo-step
            arguments:
              parameters: [{name: msg, value: "building"}]
          - name: unit-test
            template: echo-step
            dependencies: [build]
            arguments:
              parameters: [{name: msg, value: "unit testing"}]
          - name: lint
            template: echo-step
            dependencies: [build]
            arguments:
              parameters: [{name: msg, value: "linting"}]
          - name: deploy-check
            template: echo-step
            dependencies: [unit-test, lint]
            arguments:
              parameters: [{name: msg, value: "deploy check"}]

    - name: echo-step
      inputs:
        parameters:
          - name: msg
      container:
        image: busybox
        command: [sh, -c]
        args: ["echo {{inputs.parameters.msg}}; sleep 2"]
```
```bash
argo submit -n argo --watch fan-out.yaml
```
In the UI, this renders as a visible fan-out/fan-in: `build` splits into parallel `unit-test` and `lint`, which both merge back into `deploy-check` — exactly the DAG shape covered in the notes.

---

## Step 7 — Pass an Artifact Between Steps

```yaml
# artifact-pipeline.yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: artifact-pipeline-
  namespace: argo
spec:
  entrypoint: pipeline
  templates:
    - name: pipeline
      dag:
        tasks:
          - name: generate
            template: generate-data
          - name: consume
            template: consume-data
            dependencies: [generate]
            arguments:
              artifacts:
                - name: data
                  from: "{{tasks.generate.outputs.artifacts.data}}"

    - name: generate-data
      container:
        image: busybox
        command: [sh, -c]
        args: ["echo 'pipeline output data' > /tmp/output.txt"]
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
```bash
argo submit -n argo --watch artifact-pipeline.yaml
argo logs -n argo @latest -c consume
```
The `consume` step prints `pipeline output data` — the file was generated in one Pod, uploaded to the bundled MinIO artifact repository, and downloaded into a completely separate Pod for the next step.

---

## Cleanup
```bash
kind delete cluster --name argo-wf-lab
```

## What to Explore Next
- Add a `retryStrategy` to a step that deliberately exits non-zero and watch Argo retry it with backoff before marking the workflow failed.
- Install Argo Events on the same cluster and wire a `Sensor` to trigger the `ci-dag.yaml` workflow automatically from a webhook, instead of manual `argo submit`.
- Create a `WorkflowTemplate` from `ci-dag.yaml` and submit against it with `argo submit --from workflowtemplate/ci-template` to see the reusable-template pattern.
- Set `spec.templates[].retryStrategy` and `activeDeadlineSeconds` together and simulate a timeout to see how Argo reports a killed-for-timeout step differently from a failed one in the UI.
