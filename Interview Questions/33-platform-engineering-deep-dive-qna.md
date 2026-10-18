# Platform Engineering Deep Dive (Terraform, CloudFormation, Jenkins, GitHub Actions, Argo CD, Helm, Gateway API, Service Mesh, EKS) — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Gap-fill for platform/DevOps roles that go past the basics. Fundamentals are already in [05 CI/CD](./05-cicd-jenkins-github-actions-qna.md), [06 Terraform](./06-terraform-and-iac-qna.md), [04 Kubernetes](./04-kubernetes-qna.md), [20 GitOps](./20-devops-roadmap-gap-fill-qna.md) and [29 Jenkins/K8s/Helm](./29-jenkins-k8s-helm-interview-rounds-qna.md). This file covers the follow-up questions interviewers ask once you've shown you know the basics.

---

## Table of Contents
- [Terraform: Advanced](#terraform-advanced)
- [CloudFormation](#cloudformation)
- [Jenkins: Advanced](#jenkins-advanced)
- [GitHub Actions: Advanced](#github-actions-advanced)
- [Argo CD & GitOps Internals](#argo-cd--gitops-internals)
- [Helm: Advanced](#helm-advanced)
- [Ingress Controllers & Gateway API](#ingress-controllers--gateway-api)
- [Service Mesh (Istio)](#service-mesh-istio)
- [EKS & Kubernetes Operations](#eks--kubernetes-operations)

---

## Terraform: Advanced

### 1. Explain the `lifecycle` meta-argument and each of its options.
`lifecycle` changes how Terraform handles create, update and delete for one resource:
- **`create_before_destroy = true`**: when a change forces replacement, create the new one first, then destroy the old one. Use it for zero-downtime swaps (launch templates, certificates, security groups attached to live resources). Names must be unique, so use `name_prefix` instead of a fixed `name`.
- **`prevent_destroy = true`**: any plan that would destroy the resource fails. It's a guard for prod databases, KMS keys and state buckets. It doesn't help if someone deletes the resource block itself, because then the lifecycle block is gone too.
- **`ignore_changes = [tags, desired_count]`**: don't treat outside changes to these attributes as drift. Typical cases are an ASG's `desired_capacity` managed by autoscaling, or tags added by a security tool.
- **`replace_triggered_by = [aws_launch_template.app.id]`**: force replacement when another resource or attribute changes.
- **`precondition` / `postcondition`**: custom assertions with readable error messages, e.g. "AMI must be from our account".

```hcl
resource "aws_db_instance" "main" {
  # ...
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [password]   # rotated by Secrets Manager
  }
}
```

### 2. What are `moved`, `import` and `removed` blocks, and why are they better than the CLI commands?
They are config-driven versions of `terraform state mv`, `terraform import` and `terraform state rm`. Because they live in code, they go through PR review, show up in `plan`, and run the same way in CI. The CLI versions mutate state directly from someone's laptop.

```hcl
# Renamed a resource or moved it into a module: no destroy/recreate
moved {
  from = aws_instance.web
  to   = module.web.aws_instance.this
}

# Adopt an existing, hand-made resource (Terraform 1.5+)
import {
  to = aws_s3_bucket.logs
  id = "corp-prod-logs"
}
# terraform plan -generate-config-out=generated.tf  → writes the HCL for you

# Stop managing a resource WITHOUT deleting it (Terraform 1.7+)
removed {
  from = aws_s3_bucket.legacy
  lifecycle { destroy = false }
}
```

### 3. How do you manage multiple AWS accounts or regions from one Terraform configuration?
Use provider aliases and pass them into modules explicitly:

```hcl
provider "aws" { region = "ap-south-1" }                     # default
provider "aws" {
  alias  = "dr"
  region = "ap-southeast-1"
  assume_role { role_arn = "arn:aws:iam::222222222222:role/terraform" }
}

module "dr_bucket" {
  source    = "./modules/bucket"
  providers = { aws = aws.dr }
}
```

At scale, prefer one root module (and one state) per account/region/component, with CI assuming a role per account. A single giant state across accounts makes the blast radius and plan time much worse.

### 4. What are `locals`, `dynamic` blocks and `depends_on`, and when do you use each?
- **`locals`**: named expressions computed once, like common tags or a name prefix. They keep things DRY without turning values into inputs.
- **`dynamic` blocks**: generate repeated nested blocks (ingress rules, EBS volumes) from a list or map. Use them sparingly, because heavy nesting hurts readability.
- **`depends_on`**: an explicit dependency for when Terraform can't infer one from references, e.g. an IAM policy attachment that must exist before a Lambda runs. It's a last resort. A real reference is always better, because `depends_on` makes plans more conservative and can cause more "known after apply" values.

```hcl
dynamic "ingress" {
  for_each = var.allowed_ports
  content {
    from_port   = ingress.value
    to_port     = ingress.value
    protocol    = "tcp"
    cidr_blocks = var.office_cidrs
  }
}
```

### 5. How do you test Terraform code?
In layers, from cheap to expensive:
1. `terraform fmt -check` and `terraform validate` on every PR.
2. Linting and policy: `tflint`, plus `checkov`/`tfsec`(now Trivy)/OPA-Conftest for security rules like "no public S3" or "encryption on".
3. **`terraform test`** (1.6+): `.tftest.hcl` files that run `plan` or `apply` against a module and assert on the outputs. Mock providers (1.7+) let you unit-test without a cloud account.
4. Integration tests with Terratest (Go) for critical modules: apply into a sandbox account, hit the endpoint, destroy.
5. `check` blocks for continuous assertions after apply, e.g. "health endpoint returns 200".

```hcl
# tests/bucket.tftest.hcl
run "bucket_is_encrypted" {
  command = plan
  assert {
    condition     = aws_s3_bucket_server_side_encryption_configuration.this.rule[0].apply_server_side_encryption_by_default[0].sse_algorithm == "aws:kms"
    error_message = "Bucket must use KMS encryption"
  }
}
```

### 6. How has S3 state locking changed, and how do you configure a backend now?
Since Terraform 1.10, the S3 backend can lock with a lock file in the bucket itself (`use_lockfile = true`) using S3 conditional writes. The DynamoDB table approach is deprecated. A production backend looks like this:

```hcl
terraform {
  backend "s3" {
    bucket       = "corp-tfstate-prod"
    key          = "network/ap-south-1/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}
```

The bucket should have versioning (to recover a corrupted state), KMS encryption, block-public-access, and a bucket policy limited to the CI role and a break-glass role.

### 7. How do you keep secrets out of Terraform state?
State stores every attribute in plain JSON, including generated DB passwords, so:
- Encrypt the backend and lock down who can read it. Treat state as a secret.
- Don't generate secrets in Terraform when you can avoid it. Use `manage_master_user_password = true` on RDS so AWS creates the password and stores it in Secrets Manager, and Terraform never sees it.
- On Terraform 1.10+/1.11+, use **ephemeral resources** and **write-only arguments** (e.g. `password_wo`). These pass a value to the provider without persisting it in state or plan.
- Mark outputs `sensitive = true`. This only hides them from CLI output; they are still in state.

### 8. A `terraform plan` in CI shows that a resource will be replaced, but nobody changed it. How do you investigate?
1. Read the plan line marked `# forces replacement`. It names the exact attribute.
2. Common causes: a provider version upgrade changed a default; a `data` source (like "latest AMI") returned a new value; someone changed it in the console (drift); or a computed value went "known after apply" because of an upstream change.
3. Fix by pinning the input (a specific AMI ID, a provider version in `.terraform.lock.hcl`), by adding `ignore_changes` if it's managed elsewhere, or by importing or reconciling the console change.
4. Never apply an unexpected replacement on a stateful resource. `prevent_destroy` on databases turns this into a hard failure instead of an outage.

---

## CloudFormation

### 9. Explain the structure of a CloudFormation template.
A template is YAML or JSON with these top-level sections: `AWSTemplateFormatVersion`, `Description`, `Parameters` (inputs), `Mappings` (static lookup tables, like AMI per region), `Conditions` (e.g. `IsProd`), `Resources` (the only required section), `Outputs` (values to show or export), plus optional `Transform` (SAM, macros) and `Metadata`.

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Parameters:
  Env: { Type: String, AllowedValues: [dev, prod] }
Conditions:
  IsProd: !Equals [!Ref Env, prod]
Resources:
  LogsBucket:
    Type: AWS::S3::Bucket
    DeletionPolicy: Retain
    UpdateReplacePolicy: Retain
    Properties:
      BucketName: !Sub "corp-${Env}-logs-${AWS::AccountId}"
      VersioningConfiguration:
        Status: !If [IsProd, Enabled, Suspended]
Outputs:
  BucketArn:
    Value: !GetAtt LogsBucket.Arn
    Export: { Name: !Sub "${Env}-logs-bucket-arn" }
```

### 10. What are the most-used intrinsic functions?
`!Ref` (parameter value or a resource's primary ID), `!GetAtt` (any other attribute, like `.Arn`), `!Sub` (string interpolation), `!Join`, `!Select` + `!Split`, `!If` / `!Equals` / `!And` / `!Or` (with Conditions), `!FindInMap` (Mappings lookup), `!ImportValue` (read another stack's export), `!GetAZs` and `!Base64` (UserData). Pseudo-parameters: `AWS::Region`, `AWS::AccountId`, `AWS::StackName`.

### 11. What is a change set, and why always use one in production?
A change set is a preview of what an update will do: which resources are added, modified or **replaced**. It's CloudFormation's version of `terraform plan`. In prod you create the change set, review it (especially `Replacement: True` on databases), and then execute it, often with an approval in between. Updating a stack directly skips the review.

```bash
aws cloudformation create-change-set --stack-name app-prod \
  --template-body file://app.yaml --change-set-name pr-142 \
  --parameters ParameterKey=Env,ParameterValue=prod --capabilities CAPABILITY_NAMED_IAM
aws cloudformation describe-change-set --stack-name app-prod --change-set-name pr-142
aws cloudformation execute-change-set --stack-name app-prod --change-set-name pr-142
```

### 12. What are DeletionPolicy and UpdateReplacePolicy, and what's a stack policy?
- **DeletionPolicy** (`Delete` | `Retain` | `Snapshot` | `RetainExceptOnCreate`): what happens to the physical resource when it's removed from the template or the stack is deleted. Use `Retain` or `Snapshot` on data stores.
- **UpdateReplacePolicy**: the same, but for the old resource when an update forces a replacement. People forget it, so set both on stateful resources.
- **Stack policy**: a JSON policy that blocks updates to specific resources (e.g. deny `Update:Replace` on the RDS instance) unless someone temporarily overrides it.
- **Termination protection**: stops the whole stack from being deleted.

### 13. A stack is stuck in `UPDATE_ROLLBACK_FAILED`. How do you fix it?
The update failed, and then the rollback also failed. Usually that's because a resource was changed or deleted outside CloudFormation, or a dependency (IAM permission, quota) blocks the rollback.
1. Look at the stack events for the first `*_FAILED` reason, not the last one.
2. Fix the cause where possible (recreate the missing resource, restore the permission).
3. Run `continue-update-rollback`. If a resource still can't roll back, skip it with `--resources-to-skip LogicalId` (CloudFormation then marks it as rolled back), and reconcile that resource by hand later.

```bash
aws cloudformation continue-update-rollback --stack-name app-prod --resources-to-skip MyFunction
```

For `ROLLBACK_COMPLETE` after a failed **create**, the stack can't be updated. Delete it and create it again.

### 14. What are nested stacks vs cross-stack references vs StackSets?
- **Nested stacks** (`AWS::CloudFormation::Stack`): split one large template into reusable components that deploy as a single unit. Good for reuse and for the 500-resource limit per stack.
- **Cross-stack references** (`Export` + `!ImportValue`): separate lifecycles, e.g. a network stack exports subnet IDs and app stacks import them. Downside: you can't change or delete an export while any stack imports it.
- **StackSets**: deploy the same stack to many accounts and regions from one place, with service-managed permissions through AWS Organizations. Typical uses are baselines like CloudTrail, Config rules and IAM roles in every account.

### 15. How do you detect and handle drift in CloudFormation?
Run **drift detection** (`detect-stack-drift`, then `describe-stack-resource-drifts`). It compares live properties with the template and reports `MODIFIED` or `DELETED`. To fix it, either put the manual change back into the template and update, or revert the manual change. Prevention: SCPs or permission boundaries that deny console changes to stack-managed resources, plus an AWS Config rule to alert on drift.

### 16. What are custom resources, and when do you need one?
A custom resource (`Custom::Something` backed by a Lambda function or SNS topic) runs your own code on stack Create/Update/Delete. You need it for things CloudFormation can't do natively: looking up a value from an external system, seeding a database, or calling a third-party API. The Lambda **must** send a SUCCESS or FAILED response to the pre-signed S3 URL. If it crashes without responding, the stack hangs until it times out (up to an hour), which is the classic custom resource bug. Wrap the handler in try/finally and always respond.

### 17. How do you make CloudFormation wait until an EC2 instance is actually configured?
Use **`cfn-init`** (applies `AWS::CloudFormation::Init` metadata: packages, files, services) and **`cfn-signal`** with a **`CreationPolicy`**. The stack waits for N success signals within a timeout, and rolls back if they don't arrive. For Auto Scaling groups, use `UpdatePolicy` with `AutoScalingRollingUpdate` to do rolling instance replacement with signals.

### 18. Terraform vs CloudFormation: how do you answer "which would you choose?"
- **CloudFormation**: AWS-native, no state file to manage (AWS holds the state), automatic rollback on failure, StackSets for multi-account, same-day support for many new services, and AWS support covers it. It's AWS-only and slower to iterate on; YAML gets verbose (CDK helps).
- **Terraform**: multi-cloud and SaaS providers (Datadog, Cloudflare, GitHub, Vault), better modules and plan output, and a larger ecosystem. You own the state, the locking and the secrets in state, and there's no automatic rollback.
- A reasonable answer: "AWS-only shops with a strict AWS-support or compliance posture often pick CloudFormation/CDK. Anything multi-cloud, or that also manages non-AWS resources, picks Terraform. In either case the practices matter more than the tool: plan/change-set review, policy checks and no console changes."

---

## Jenkins: Advanced

### 19. What is a Jenkins Shared Library, and how is it structured?
A Git repo of reusable pipeline code that every Jenkinsfile can load, so 50 services don't copy and paste the same 300-line pipeline.

```
jenkins-shared-lib/
├── vars/            # global steps, called like functions: buildAndPush(...)
│   └── buildAndPush.groovy
├── src/org/corp/    # Groovy classes (helpers)
└── resources/       # non-Groovy files (templates, scripts) via libraryResource
```

```groovy
// vars/buildAndPush.groovy
def call(Map cfg) {
  sh "docker build -t ${cfg.image}:${env.GIT_COMMIT} ."
  sh "docker push ${cfg.image}:${env.GIT_COMMIT}"
}

// Jenkinsfile in each service
@Library('jenkins-shared-lib@v2.3.0') _
pipeline {
  agent any
  stages { stage('Build') { steps { buildAndPush(image: 'registry.corp/payments') } } }
}
```

Pin the library to a tag, as above, so a change to the library can't break every pipeline at once.

### 20. How do you run Jenkins agents on Kubernetes?
Use the Kubernetes plugin. Each build gets an ephemeral pod with one container per tool (jnlp, maven, docker/kaniko, kubectl), and the pod is deleted afterwards. That means a clean environment every time, no idle VMs, and autoscaling through the cluster. Build images with **Kaniko** or **BuildKit rootless** rather than mounting the Docker socket, because a mounted socket is root on the node.

```groovy
pipeline {
  agent {
    kubernetes {
      yaml '''
        spec:
          containers:
          - name: maven
            image: maven:3.9-eclipse-temurin-21
            command: [sleep, infinity]
          - name: kaniko
            image: gcr.io/kaniko-project/executor:debug
            command: [sleep, infinity]
      '''
    }
  }
  stages {
    stage('Test')  { steps { container('maven')  { sh 'mvn -B verify' } } }
    stage('Image') { steps { container('kaniko') { sh '/kaniko/executor --destination=registry.corp/app:$GIT_COMMIT' } } }
  }
}
```

### 21. How do you make Jenkins itself highly available and recoverable?
Open-source Jenkins has no active-active controller. The realistic approach:
- **Config as code**: JCasC (`jenkins.yaml`) for system config, plugins pinned in `plugins.txt`, and jobs defined by Jenkinsfiles plus Organization Folders or Job DSL. A new controller can then be rebuilt from Git.
- **Back up `JENKINS_HOME`** (or put it on a persistent volume with snapshots), especially `secrets/` and `credentials.xml`. Without `secrets/master.key` the stored credentials can't be decrypted.
- Run the controller on Kubernetes with a PVC so it restarts automatically. Keep **zero executors on the controller**, so all builds run on agents.
- For larger organizations, split into several controllers (one per business unit) to limit the blast radius. CloudBees CI offers HA if it's required.

### 22. What are the key Declarative Pipeline features you use day to day?
`parallel` stages, `when` (branch or changeset conditions), `input` (manual approval with `submitter`), `post { always/success/failure }` (notifications and cleanup), `options { timeout(); buildDiscarder(); disableConcurrentBuilds() }`, `environment` with `credentials()`, `withCredentials` for scoped secrets, `stash`/`unstash` and `archiveArtifacts`, `retry`, and `lock` (Lockable Resources) to stop two deploys hitting the same environment at once.

### 23. How do you secure Jenkins?
Turn off anonymous access and use SSO (LDAP/AD/OIDC) with role-based authorization (Role Strategy or Matrix). Keep secrets in the Credentials store, or better, fetch them from Vault or AWS Secrets Manager at runtime, and use folder-scoped credentials so a team can only see its own. Keep plugins few and patched (most Jenkins CVEs are in plugins). Use the script approval sandbox. Run no builds on the controller. Put Jenkins behind a reverse proxy with TLS. Use agent-to-controller security. Ship audit logs to the SIEM.

---

## GitHub Actions: Advanced

### 24. How do you authenticate GitHub Actions to AWS without storing access keys?
Use **OIDC**. GitHub issues a short-lived signed token per job, AWS STS trusts GitHub's OIDC provider, and the job assumes an IAM role. There are no long-lived keys to leak or rotate.

```yaml
permissions:
  id-token: write      # required to request the OIDC token
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::111111111111:role/gha-deploy-prod
          aws-region: ap-south-1
```

The important part is the role's **trust policy**. It must restrict the token's `sub` claim, or any repo on GitHub could assume the role:

```json
"Condition": {
  "StringEquals": {
    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
    "token.actions.githubusercontent.com:sub": "repo:corp/payments-api:environment:production"
  }
}
```

### 25. GitHub-hosted vs self-hosted runners: when do you need self-hosted, and how do you run them safely?
You need self-hosted runners when jobs must reach private networks (on-prem databases, private EKS endpoints), need special hardware, or when a compliance rule says code can't build on shared infrastructure. Run them with **Actions Runner Controller (ARC)** on Kubernetes as **ephemeral** runners (one job per pod, then destroyed), so nothing leaks between jobs. Never attach self-hosted runners to public repos, because a fork PR could run code on your network. Use runner groups to limit which repos can use which runners, and give the runner's IAM identity least privilege.

### 26. How do you stop two deployments to the same environment from running at once?
Use `concurrency`:

```yaml
concurrency:
  group: deploy-${{ github.ref }}-production
  cancel-in-progress: false   # queue deploys; true would cancel the older one (good for PR builds)
```

Combine it with **environments** that have protection rules: required reviewers, a wait timer, and limits on which branches can deploy. Environment secrets are only released to jobs that passed those rules.

### 27. How do you keep GitHub Actions workflows secure?
- Set `permissions:` at the workflow level to least privilege (default `contents: read`) instead of relying on the broad default `GITHUB_TOKEN`.
- Pin third-party actions to a full commit SHA (see [05 Q19](./05-cicd-jenkins-github-actions-qna.md)).
- Be careful with `pull_request_target`: it runs with secrets in the base repo's context, so never check out and run the fork's code in it.
- Avoid script injection: never put `${{ github.event.pull_request.title }}` straight into a `run:` line. Pass it through `env:` and quote the variable.
- Use OIDC instead of static cloud keys, environment-scoped secrets, and CODEOWNERS on `.github/workflows/`.
- Generate build provenance and signatures (`actions/attest-build-provenance`, cosign).

### 28. How do you share pipeline logic across many repos in GitHub Actions?
Use **reusable workflows** (`on: workflow_call`, called with `uses: org/platform-workflows/.github/workflows/build.yml@v3`) for whole jobs, and **composite actions** for groups of steps. Keep them in a central platform repo, version them with tags, and pass `secrets: inherit` or explicit secrets. This is the GitHub Actions equivalent of a Jenkins Shared Library. Organization rulesets can require that certain workflows run on every repo.

---

## Argo CD & GitOps Internals

### 29. Walk through Argo CD's architecture.
- **API server**: serves the UI, CLI and API, and handles SSO and RBAC.
- **Repo server**: clones Git and renders manifests (plain YAML, Helm, Kustomize, plugins). It caches rendered output.
- **Application controller**: a Kubernetes controller that keeps comparing the rendered desired state with the live cluster state, reports Synced/OutOfSync and Healthy/Degraded, and runs syncs.
- **ApplicationSet controller**: generates Applications from templates.
- Redis for caching, and Dex for SSO when needed.
The core object is the **Application** CRD: source (repo, path, revision), destination (cluster, namespace) and syncPolicy.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata: { name: payments-prod, namespace: argocd }
spec:
  project: payments
  source:
    repoURL: https://git.corp/platform/deploy.git
    path: apps/payments/overlays/prod
    targetRevision: main
  destination: { server: https://kubernetes.default.svc, namespace: payments }
  syncPolicy:
    automated: { prune: true, selfHeal: true }
    syncOptions: [CreateNamespace=true]
```

### 30. What do `prune` and `selfHeal` do, and when would you turn them off?
- **`prune: true`**: deletes cluster resources that were removed from Git. Without it, deleted manifests leave orphaned resources behind.
- **`selfHeal: true`**: reverts manual `kubectl` changes back to Git automatically. This is what enforces Git as the single source of truth.
- Turn them off, or use manual sync, for sensitive prod apps where a change-management process requires a human to click Sync after CAB approval, and while debugging live (otherwise Argo reverts your debug change within seconds). For resources that should never be pruned, such as PVCs, use the annotation `argocd.argoproj.io/sync-options: Prune=false`.

### 31. What are sync waves and hooks?
Argo CD applies resources in **waves**, ordered by the annotation `argocd.argoproj.io/sync-wave: "<n>"`, lowest first (negative numbers allowed). It waits for each wave to be healthy before starting the next. **Hooks** (`argocd.argoproj.io/hook: PreSync | Sync | PostSync | SyncFail`) are usually Jobs that run at those points: a DB migration as PreSync, smoke tests as PostSync, a Slack alert as SyncFail.

```yaml
metadata:
  annotations:
    argocd.argoproj.io/hook: PreSync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
```

Typical order: wave -1 for namespaces, CRDs and secrets; wave 0 for config; wave 1 for Deployments; then a PostSync test.

### 32. What is the app-of-apps pattern, and how does ApplicationSet improve on it?
- **App-of-apps**: one root Application points at a folder that contains other Application manifests. You bootstrap a whole cluster by syncing one app.
- **ApplicationSet**: a template plus **generators** that create Applications automatically. The **list** generator iterates over fixed values; **cluster** creates one per registered cluster (for example, deploy the monitoring stack to every cluster labelled `env=prod`); **git directory/file** creates one per folder (add a folder and you get a new app); **matrix/merge** combine generators; **pull request** creates preview environments per PR. ApplicationSet replaces copy-pasted Application YAML across 30 clusters.

### 33. How do you handle multi-tenancy and RBAC in Argo CD?
Use **AppProjects**. A project limits which source repos, destination clusters and namespaces, and which resource kinds (e.g. no ClusterRoles) its apps can use. Map SSO groups to project roles in `argocd-rbac-cm`. For example, the payments team can sync apps in project `payments` but only view others, and only the platform team can manage cluster-scoped resources. Turn off the local admin account once SSO works.

### 34. An Argo CD application is permanently OutOfSync even right after a sync. Why?
Usually something in the cluster changes fields after apply: a mutating webhook adds a sidecar, an HPA changes `replicas`, a controller sets defaults, or a CRD normalizes values. Fixes:
- Remove `replicas` from the Deployment manifest when an HPA manages it.
- Use `ignoreDifferences` for those specific JSON paths (with `RespectIgnoreDifferences=true` so sync doesn't fight them either).
- Turn on Server-Side Apply (`ServerSideApply=true`) and field managers for better diffs.
- Check the diff view. It shows exactly which field differs.

### 35. How do you roll back with Argo CD?
The GitOps way is `git revert` on the commit and let Argo sync, so Git still matches reality. Argo CD also has a history and rollback button (`argocd app rollback`), but it only works with auto-sync disabled, because otherwise the controller immediately syncs back to Git HEAD. Use it for emergencies, then revert in Git. For automatic, metric-driven rollback during a release, use **Argo Rollouts** canary with AnalysisTemplates (see [20 Q13](./20-devops-roadmap-gap-fill-qna.md)).

### 36. How do new image tags get from CI into Git for Argo CD?
Two common patterns:
1. **CI writes to Git**: after pushing the image, the pipeline updates the tag in the deploy repo (`kustomize edit set image` or `yq` on `values.yaml`) and opens a PR for prod or commits directly for dev. This is the most auditable option and fits banks well, because the PR is the change record.
2. **Argo CD Image Updater**: watches the registry and writes new tags back to Git (or as parameter overrides) based on semver or digest rules.
Keep application source and deploy config in separate repos, so a CI commit that bumps a tag doesn't trigger another CI build.

---

## Helm: Advanced

### 37. What is the values precedence order in Helm?
From lowest to highest: the chart's `values.yaml`, then a parent chart's values for its subcharts, then each `-f/--values` file in the order given (later files win), then `--set`, `--set-string` and `--set-file` (the last one wins). A common layout is `-f values.yaml -f values-prod.yaml --set image.tag=$SHA`. Run `helm get values <release> --all` to see what a release actually used.

### 38. How does Helm store releases, and how do you fix "another operation (install/upgrade/rollback) is in progress"?
Helm 3+ stores each release revision as a Secret in the release namespace (`sh.helm.release.v1.<name>.v<N>`), labelled with status. If an upgrade is killed halfway, for example when a CI job times out, the latest revision stays in `pending-upgrade`, and every later command fails with that error.

```bash
helm history payments -n prod                 # find the stuck revision
helm rollback payments <last-good-rev> -n prod # usually clears it
# last resort: delete the stuck release secret
kubectl -n prod delete secret sh.helm.release.v1.payments.v15
```

Prevention: `helm upgrade --install --atomic --timeout 10m` rolls back automatically on failure (Helm 4 renames `--atomic` to `--rollback-on-failure`), and set a CI job timeout longer than Helm's own timeout.

### 39. What are Helm hooks?
Annotations that make a resource, usually a Job, run at lifecycle points: `pre-install`, `post-install`, `pre-upgrade`, `post-upgrade`, `pre-delete`, `post-delete`, `pre-rollback`, `post-rollback`, and `test`. Ordering uses `helm.sh/hook-weight`, and cleanup uses `helm.sh/hook-delete-policy: before-hook-creation,hook-succeeded`. The classic use is a DB migration as `pre-upgrade`. Hooks aren't part of the release's managed resources, so `helm uninstall` won't delete them unless a delete policy says so. Argo CD maps Helm hooks to its own hooks.

### 40. Explain common template functions and the `_helpers.tpl` file.
`_helpers.tpl` holds named templates (`define`/`include`) for labels, names and selectors, so they're consistent across manifests. Useful functions:
- `include "app.labels" . | nindent 4`: render a named template with correct indentation. `include` can be piped, `template` can't.
- `toYaml .Values.resources | nindent 12`: drop a whole values block in.
- `required "image.tag is required" .Values.image.tag`: fail the render early.
- `default "80" .Values.port`, `quote`, `tpl` (render a string from values as a template).
- `lookup`: read live cluster objects. It returns nothing during `helm template` and dry runs, so don't rely on it in GitOps.
- `checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}` as a pod annotation, so pods restart when the ConfigMap changes.

### 41. How do you test and validate Helm charts in CI?
`helm lint`; `helm template` piped into `kubeconform` (schema validation) and policy checks (Conftest/Kyverno CLI); `values.schema.json` so bad values fail at install time; **`helm diff upgrade`** (plugin) in the PR, to show the exact change to live resources; **chart-testing (`ct lint` / `ct install`)** against a kind cluster; and `helm test` hooks for post-install smoke tests. Publish charts to an OCI registry (`helm push chart.tgz oci://registry.corp/charts`) with versioned releases.

### 42. What are library charts, umbrella charts and dependencies?
- **Dependencies**: listed in `Chart.yaml` under `dependencies:` (with `condition:` to toggle them, e.g. `postgresql.enabled`). `helm dependency update` fetches them into `charts/`.
- **Umbrella chart**: a parent chart whose only job is to bundle several subcharts into one release, like a whole product stack. It's convenient, but they all share one release lifecycle.
- **Library chart** (`type: library`): only named templates, no resources. A platform team publishes a common library (standard Deployment, Service and labels) that 100 service charts depend on, which keeps them consistent without copying code.
- Tools such as **helmfile** declare many releases per environment in one file, and are an alternative to Argo CD for managing them.

---

## Ingress Controllers & Gateway API

### 43. What's the relationship between an Ingress resource and an Ingress controller?
An Ingress is only configuration (host and path rules, TLS secret). It does nothing until an **Ingress controller** (NGINX, Traefik, HAProxy, AWS Load Balancer Controller, and others) watches Ingress objects and programs a real proxy or load balancer. `ingressClassName` chooses which controller handles a given Ingress, so you can run several: an internal one and an internet-facing one. Basics are in [04 Q24–25](./04-kubernetes-qna.md).

### 44. How does the AWS Load Balancer Controller differ from running NGINX in the cluster?
- **AWS LB Controller**: creates a real **ALB** for each Ingress (or each `group.name`, so many Ingresses can share one ALB) and an **NLB** for `Service type=LoadBalancer`. With `target-type: ip` the ALB sends traffic straight to pod IPs, skipping NodePort and kube-proxy. You get WAF, ACM certificates, Cognito/OIDC auth and Shield through annotations. Downsides: ALB cost per group and less flexible rewrites.
- **In-cluster proxy behind one NLB**: one NLB forwards to proxy pods that do all L7 routing. That's cheaper with many hostnames, more flexible (rewrites, rate limits, custom Lua/filters), and portable to on-prem, but you operate and scale the proxy yourself.
Many EKS setups use an ALB at the edge for WAF and certificates, and an in-cluster gateway for internal routing.

### 45. What is the Gateway API, and why is it replacing Ingress?
The Gateway API is the newer Kubernetes networking API (v1.0 GA since late 2023). It fixes Ingress's problems: features hidden in vendor-specific annotations, HTTP only, and one object that mixes infrastructure and application concerns. It's **role-oriented**:
- **GatewayClass**: the implementation (managed by the infra provider).
- **Gateway**: the listeners, ports, TLS and allowed namespaces (managed by the platform team).
- **HTTPRoute / GRPCRoute / TLSRoute / TCPRoute**: routing rules (owned by app teams in their own namespaces).
- **ReferenceGrant**: explicit permission for cross-namespace references.
Header and query matching, traffic splitting by weight (canary), request mirroring, redirects and header changes are part of the standard API, so they work the same across implementations (Envoy Gateway, Istio, Cilium, NGINX Gateway Fabric, Traefik, Kong). The community **ingress-nginx** controller was retired in March 2026, which pushed many teams to migrate. Ingress still works, but new features only land in Gateway API.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: { name: payments, namespace: payments }
spec:
  parentRefs: [{ name: public-gw, namespace: gateway-infra }]
  hostnames: ["pay.corp.com"]
  rules:
  - matches: [{ path: { type: PathPrefix, value: /api } }]
    backendRefs:
    - { name: payments-v1, port: 8080, weight: 90 }
    - { name: payments-v2, port: 8080, weight: 10 }   # 10% canary, no annotations
```

### 46. How would you migrate from Ingress to Gateway API?
1. Pick an implementation and install the Gateway API CRDs plus the controller next to the existing Ingress controller.
2. Convert manifests with **`ingress2gateway`**, then review by hand, because annotation-based features (rewrites, auth, rate limits) map to filters or implementation-specific policies.
3. Create the Gateway with its own load balancer, and test routes using a temporary hostname or a `curl --resolve`.
4. Move traffic gradually with weighted DNS, then flip the DNS record. Keep the old Ingress until the TTL has passed and traffic is zero.
5. Remove the old Ingress objects and controller.

### 47. Users get 404 or 502 through the Ingress or Gateway, but the pod works with port-forward. How do you debug?
- **404 from the proxy**: no rule matched. Check host and path, `pathType` (`Prefix` vs `Exact`), `ingressClassName`, and that the Ingress or Route is actually accepted (`kubectl describe httproute` shows `Accepted`/`ResolvedRefs` conditions).
- **502/503**: the proxy matched but couldn't reach a backend. Check that the Service selector matches pod labels (`kubectl get endpointslices`), that `targetPort` is right, that readiness probes pass, and that NetworkPolicies allow traffic from the controller's namespace.
- **TLS problems**: wrong secret name or namespace, a cert that doesn't cover the hostname, or a missing intermediate.
- Read the controller's logs. They usually state the exact upstream error.
See also [28 Q08](./28-production-scenarios-rapid-round-qna.md).

---

## Service Mesh (Istio)

### 48. Explain Istio's architecture: sidecar mode vs ambient mode.
- **Control plane (istiod)**: issues workload certificates (SPIFFE identities), turns VirtualService and DestinationRule objects into Envoy config, and pushes it to proxies over xDS.
- **Sidecar mode**: an Envoy container is injected into every pod (namespace label `istio-injection=enabled`). You get full L7 features per pod, at the cost of CPU and memory in every pod, a restart to upgrade the proxy, and startup-order issues.
- **Ambient mode** (GA since Istio 1.24): no sidecars. A per-node **ztunnel** handles L4 mTLS and identity, and an optional per-namespace or per-service **waypoint** proxy (Envoy) handles L7 policy and routing only where needed. Much lower overhead and no pod restarts, so it's the usual default for new installs.

### 49. What do VirtualService, DestinationRule, Gateway, PeerAuthentication and AuthorizationPolicy do?
- **VirtualService**: *how requests are routed*: match on host, path or header, split traffic by weight, retries, timeouts, fault injection.
- **DestinationRule**: *what happens after routing*: subsets (v1/v2 by label), load-balancing algorithm, connection pools, **outlier detection** (circuit breaking), and TLS mode to the upstream.
- **Gateway (Istio)**: ingress or egress listeners at the mesh edge. New installs increasingly use the Kubernetes Gateway API instead.
- **PeerAuthentication**: mTLS mode, `PERMISSIVE` (accepts plaintext and mTLS) or `STRICT` (mTLS only).
- **AuthorizationPolicy**: L4/L7 allow and deny rules based on workload identity, e.g. only `payments/sa/api` may call `ledger` on `POST /transfer`.

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata: { name: ledger }
spec:
  hosts: [ledger]
  http:
  - route:
    - { destination: { host: ledger, subset: v1 }, weight: 95 }
    - { destination: { host: ledger, subset: v2 }, weight: 5 }
    retries: { attempts: 2, perTryTimeout: 2s, retryOn: 5xx,reset,connect-failure }
    timeout: 5s
```

### 50. How do you roll out mTLS across an existing cluster without breaking traffic?
1. Install the mesh with mesh-wide `PeerAuthentication` set to **PERMISSIVE**, and enroll namespaces one at a time (inject sidecars or label for ambient).
2. Check in Kiali or with Istio telemetry (`connection_security_policy="mutual_tls"`) that traffic between enrolled workloads is already mTLS, and find the clients still sending plaintext, such as workloads outside the mesh or VMs.
3. Switch to **STRICT** per namespace, then mesh-wide, once nothing sends plaintext.
4. Add AuthorizationPolicies (default-deny plus explicit allows) only after mTLS is strict, because identity-based policy depends on it.

### 51. A service in the mesh returns 503s. How do you troubleshoot?
- `istioctl analyze -n <ns>`: catches misconfigurations such as a VirtualService pointing at a missing subset.
- `istioctl proxy-status`: is every proxy's config SYNCED with istiod?
- Read the Envoy access log's **response flags**: `UH` (no healthy upstream, so check endpoints and readiness), `UF` (upstream connection failure), `NR` (no route, so a VirtualService or host mismatch), `UO` (circuit breaker overflow, so connection pool limits are too low), `URX` (retries exhausted).
- `istioctl proxy-config cluster|route|endpoint <pod>` to see what Envoy actually has.
- Common causes: mTLS mismatch (STRICT server, plaintext client), a DestinationRule subset label that doesn't match any pod, port names or `appProtocol` missing so the protocol is detected wrong, or sidecar start ordering where the app starts before Envoy is ready (`holdApplicationUntilProxyStarts: true`).

---

## EKS & Kubernetes Operations

### 52. IRSA vs EKS Pod Identity: how do pods get AWS permissions?
Both give a pod an IAM role so it never needs node credentials or static keys:
- **IRSA**: the cluster's OIDC provider is registered in IAM, a ServiceAccount is annotated with `eks.amazonaws.com/role-arn`, and the SDK exchanges the projected service account token through `AssumeRoleWithWebIdentity`. Each role's trust policy must name the cluster's OIDC provider, which gets painful across many clusters.
- **EKS Pod Identity** (newer): install the Pod Identity Agent add-on and create an association (cluster, namespace, service account → role). The trust policy is the same everywhere (`pods.eks.amazonaws.com`), so roles are reusable across clusters, and session tags allow ABAC. It's preferred for new setups.
Either way, block pods from using the node role through IMDS (hop limit 1 on IMDSv2).

### 53. Pods are stuck Pending with "failed to assign an IP address" on EKS. What's wrong?
The AWS VPC CNI gives every pod a real VPC IP. The limit is the ENIs and IPs per instance type, and the subnet size.
- The subnet ran out of IPs: add secondary CIDRs (for example 100.64.0.0/10) with **custom networking**, so pods use separate subnets from nodes.
- The node hit its max pods for its ENI limit: turn on **prefix delegation** (`ENABLE_PREFIX_DELEGATION=true`, which assigns /28 prefixes instead of single IPs) for far higher pod density, and set `max-pods` to match.
- Check with `kubectl describe pod`, the `aws-node` logs, and free IPs per subnet in the VPC console.

### 54. Cluster Autoscaler vs Karpenter?
- **Cluster Autoscaler**: scales existing node groups (ASGs) up and down. It's limited to the instance types defined in each group, and slower because it goes through the ASG.
- **Karpenter**: looks at pending pods, picks the cheapest instance types that fit them from a broad allowed set (NodePool constraints), launches EC2 directly in seconds, and **consolidates**, i.e. repacks pods onto fewer or cheaper nodes and removes empty ones. It's the usual choice on EKS for cost and speed, especially with Spot. Protect important workloads during consolidation with PDBs and the `karpenter.sh/do-not-disrupt` annotation.

### 55. How do you upgrade an EKS cluster safely?
1. Read the release notes for removed APIs. Find deprecated API use with `kubent` or `pluto`, and check the EKS **upgrade insights** tab.
2. Upgrade non-prod first. The control plane goes one minor version at a time (1.30 → 1.31). AWS does it in place, and the API stays available.
3. Upgrade add-ons to versions compatible with the new release: VPC CNI, CoreDNS, kube-proxy, EBS CSI, and the LB controller.
4. Upgrade the data plane: managed node groups do rolling replacement, and Karpenter replaces nodes when the AMI drifts. Make sure PDBs exist and aren't so strict (e.g. `maxUnavailable: 0`) that they block draining.
5. Upgrade Helm charts and operators that depend on the Kubernetes version.
6. For high-risk prod, a **blue/green cluster** upgrade (new cluster, GitOps syncs everything, shift traffic) is the safest option, and it also tests your DR.

### 56. On a self-managed (kubeadm/on-prem) cluster, how do you back up and restore etcd?
```bash
ETCDCTL_API=3 etcdctl snapshot save /backup/etcd-$(date +%F).db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
etcdutl snapshot status /backup/etcd-2026-10-18.db -w table   # verify

# restore (on a stopped control plane), then point etcd's static pod manifest at the new data dir
etcdutl snapshot restore /backup/etcd-2026-10-18.db --data-dir /var/lib/etcd-restored
```
Schedule snapshots, copy them off the node and encrypt them (they contain every Secret), and test restores. etcd backs up cluster *state*. Application data on PVs needs Velero or storage-level snapshots, and GitOps should be able to rebuild the manifests anyway.

### 57. How do you make a workload production-ready on Kubernetes?
Requests and limits (memory limit equal to request for critical apps), readiness, liveness and startup probes, `replicas >= 2` with **topology spread** across zones, a **PodDisruptionBudget**, graceful shutdown (`preStop` sleep plus `terminationGracePeriodSeconds`, and handling SIGTERM), HPA on the right metric, a non-root `securityContext` with a read-only root filesystem and dropped capabilities, a dedicated ServiceAccount with IRSA or Pod Identity, NetworkPolicy default-deny, image pinned by digest from a trusted registry, resource quotas per namespace, structured logs, metrics and traces, and a tested rollback. The full checklist is in [20 Q19](./20-devops-roadmap-gap-fill-qna.md).
