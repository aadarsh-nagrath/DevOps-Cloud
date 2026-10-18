# Jenkins, Kubernetes & Helm Interview Rounds (Screening → In-Depth) — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. Questions taken from real DevOps screening and in-depth rounds, heavy on Jenkins, EKS, Helm and Terraform. These rounds expect **"what do *you* do"** answers, so each answer is written the way you'd describe your own setup, with commands and snippets to back it up.

---

## Already covered elsewhere (not repeated here)
| Question asked in the round | Where it's answered |
|---|---|
| Common Kubernetes errors (CrashLoopBackOff, ImagePullError) and how you resolved them | [04](./04-kubernetes-qna.md) Q36–Q38, Q49–Q50 · [28](./28-production-scenarios-rapid-round-qna.md) Q05 |
| Security scanning tools; scanning Docker images at build and at the registry | [12](./12-security-devsecops-qna.md) Q14 · [28](./28-production-scenarios-rapid-round-qna.md) Q19 |
| Integrating SonarQube + Trivy + Slack in Jenkins | [05](./05-cicd-jenkins-github-actions-qna.md) Q37 (Sonar + Trivy), Q35 (Slack `post` block) |
| Docker image too large: optimize for production | [03](./03-docker-qna.md) Q30 · [28](./28-production-scenarios-rapid-round-qna.md) Q04 |
| K8s rolling updates via YAML, zero-downtime approach | [04](./04-kubernetes-qna.md) Q14, Q59 · [28](./28-production-scenarios-rapid-round-qna.md) Q10 |
| Terraform state conflicts: prevent and recover | [06](./06-terraform-and-iac-qna.md) Q12–Q13 · [28](./28-production-scenarios-rapid-round-qna.md) Q13 |
| Secrets management: Terraform + AWS Secrets Manager | [06](./06-terraform-and-iac-qna.md) Q19 · [24](./24-aws-deep-dive-qna.md) Q63 |
| Centralized monitoring for multi-cluster K8s | [20](./20-devops-roadmap-gap-fill-qna.md) Q23 · [11](./11-monitoring-logging-observability-qna.md) Q23 |

---

## Table of Contents
1. [Your CI/CD workflow, multi-env (Dev/Stage/Prod) setup, and how Jenkins pipelines are defined & invoked](#1-explain-your-cicd-workflow-and-multi-env-devstageprod-setup-how-do-you-define-and-invoke-pipelines-in-jenkins-and-what-stages-and-quality-checks-do-you-use)
2. [Jenkins shared libraries: structure, how they're written and used](#2-what-are-jenkins-shared-libraries-how-are-they-written-structured-and-used-in-jenkinsfiles)
3. [What applications you deploy and which deployment tools](#3-what-kind-of-applications-do-you-deploy-using-jenkins-pipelines-and-what-deployment-tools-do-you-use)
4. [The pipeline runs but the build doesn't happen](#4-the-jenkins-pipeline-runs-but-the-build-doesnt-happen-what-could-be-causing-it)
5. [Jenkins pipeline failing randomly](#5-a-jenkins-pipeline-fails-randomly-intermittently-how-would-you-debug-it)
6. [Webhooks in CI/CD](#6-what-is-the-purpose-of-a-webhook-and-how-is-it-used-in-a-cicd-pipeline)
7. [Creating K8s clusters with Terraform; master vs worker nodes](#7-how-do-you-create-and-manage-kubernetes-clusters-with-terraform-and-what-are-master-and-worker-nodes)
8. [Accessing a pod; defining/creating K8s objects](#8-what-is-the-command-to-access-a-pod-and-how-do-you-define-or-create-a-kubernetes-object-or-class)
9. [Helm chart folder structure and deploy commands](#9-explain-the-folder-structure-of-a-basic-helm-chart-what-commands-do-you-use-to-deploy-with-helm)
10. [Branching, release strategy, production hotfixes, parallel changes](#10-what-branching-and-release-strategy-do-you-follow-how-do-you-avoid-breaking-the-release-branch-fix-a-production-bug-and-handle-parallel-changes)
11. [Env vars during Docker build; where images are stored](#11-how-do-you-pass-environment-variables-during-docker-build-and-what-services-do-you-use-to-store-docker-images)
12. [Connecting to databases from deployments](#12-how-do-you-establish-database-connections-in-your-deployments-and-infrastructure)
13. [EKS authentication and storing secrets](#13-how-do-you-handle-authentication-for-eks-clusters-and-store-secrets-securely)
14. [Dynamic infra creation + auto-destroy](#14-dynamic-infrastructure-creation-with-auto-destroy-how-would-you-automate-it)

---

### 1. Explain your CI/CD workflow and multi-env (Dev/Stage/Prod) setup. How do you define and invoke pipelines in Jenkins, and what stages and quality checks do you use?
**The flow (describe it as your own):**
```
Developer → feature branch → PR (CI: build, unit tests, lint, Sonar, scans) → review + merge to main
   → build once → image tagged with git SHA → push to ECR
   → auto-deploy DEV → smoke tests
   → auto/one-click promote STAGE → integration/E2E + performance tests
   → manual approval → PROD (rolling/canary) → health checks → auto-rollback on failure → Slack notify
```
**Principles to call out:**
- **Build once, promote the same artifact.** The exact image digest tested in Stage is the one that goes to Prod. Only the configuration changes per environment (values files, ConfigMaps, secrets from the secrets manager). You never rebuild per environment.
- **Environments are isolated**: separate namespaces or (better) separate clusters/AWS accounts for Prod, and separate credentials per environment, so the Dev pipeline physically can't touch Prod.
- **Gates get stricter as you get closer to Prod**: Dev is automatic, Stage is automatic after Dev's smoke tests pass, Prod needs an `input` approval (restricted to a release-manager group) plus a change ticket where required.

**How pipelines are defined in Jenkins:**
- As code in a **`Jenkinsfile`** at the repo root, mostly **Declarative** syntax (`pipeline { agent … stages { … } post { … } }`), with Scripted/Groovy only inside `script {}` blocks or shared libraries.
- Common logic lives in a **shared library** (Q2), so each service's Jenkinsfile is a few lines.
- Job types: a **Multibranch Pipeline** (discovers every branch and PR that has a Jenkinsfile), or an **Organization Folder** (discovers every repo in a GitHub org). Job configuration itself is kept as code with **Job DSL** or **JCasC** (Configuration as Code).

**How pipelines are invoked (triggered):**
| Trigger | How |
|---|---|
| SCM push / PR | **Webhook** from GitHub/GitLab/Bitbucket (Q6); Multibranch scans on each event |
| Schedule | `triggers { cron('H 2 * * *') }` (nightly builds/scans) |
| Polling (fallback) | `triggers { pollSCM('H/5 * * * *') }`; avoid it if webhooks are possible |
| Upstream job | `triggers { upstream(upstreamProjects: 'lib-build', threshold: hudson.model.Result.SUCCESS) }` or `build job: 'deploy-stage', parameters: [...]` from another pipeline |
| Manual / parameterized | "Build with Parameters" (`parameters { choice(name: 'ENV', choices: ['dev','stage','prod']) }`) |
| API | `curl -X POST -u user:token https://jenkins/job/app/buildWithParameters?ENV=stage` |

**Typical stages and quality checks:**
```groovy
pipeline {
  agent { kubernetes { yamlFile 'ci/pod.yaml' } }       // ephemeral agent pod
  options { timeout(time: 45, unit: 'MINUTES'); disableConcurrentBuilds(); buildDiscarder(logRotator(numToKeepStr: '30')) }
  environment { IMAGE = "123456789012.dkr.ecr.ap-south-1.amazonaws.com/orders"; TAG = "${env.GIT_COMMIT.take(7)}" }
  stages {
    stage('Checkout')        { steps { checkout scm } }
    stage('Build & Unit Test'){ steps { sh 'mvn -B clean verify' } post { always { junit '**/target/surefire-reports/*.xml' } } }
    stage('SonarQube')       { steps { withSonarQubeEnv('sonar') { sh 'mvn sonar:sonar' } } }
    stage('Quality Gate')    { steps { timeout(time: 10, unit: 'MINUTES') { waitForQualityGate abortPipeline: true } } }
    stage('Build Image')     { steps { sh 'docker build -t $IMAGE:$TAG .' } }
    stage('Trivy Scan')      { steps { sh 'trivy image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 $IMAGE:$TAG' } }
    stage('Push')            { steps { sh 'aws ecr get-login-password | docker login --username AWS --password-stdin ${IMAGE%%/*} && docker push $IMAGE:$TAG' } }
    stage('Deploy Dev')      { steps { sh 'helm upgrade --install orders ./chart -n dev -f chart/values-dev.yaml --set image.tag=$TAG --atomic --wait' } }
    stage('Deploy Stage')    { when { branch 'main' } steps { sh 'helm upgrade --install orders ./chart -n stage -f chart/values-stage.yaml --set image.tag=$TAG --atomic --wait' } }
    stage('Approve Prod')    { when { branch 'main' } steps { input message: 'Deploy to PROD?', submitter: 'release-managers' } }
    stage('Deploy Prod')     { when { branch 'main' } steps { sh 'helm upgrade --install orders ./chart -n prod -f chart/values-prod.yaml --set image.tag=$TAG --atomic --wait --timeout 10m' } }
  }
  post {
    success { slackSend color: 'good',   message: "✅ ${env.JOB_NAME} #${env.BUILD_NUMBER} ($TAG)" }
    failure { slackSend color: 'danger', message: "❌ ${env.JOB_NAME} #${env.BUILD_NUMBER} — ${env.BUILD_URL}" }
  }
}
```
Quality is enforced as **gates that fail the build**, not as reports someone may or may not read: unit tests plus a coverage threshold, the Sonar **Quality Gate** (bugs, vulnerabilities, coverage on new code), a Trivy fail-on-critical, IaC/Helm lint (`helm lint`, `kubeconform`), smoke tests after each deploy, and `--atomic` for an automatic rollback if the release doesn't become healthy.

**See also:** [05](./05-cicd-jenkins-github-actions-qna.md) Q11–Q13, Q22, Q35 · [20](./20-devops-roadmap-gap-fill-qna.md) Q10 (GitOps promotion).

---

### 2. What are Jenkins shared libraries? How are they written, structured, and used in Jenkinsfiles?
A **shared library** is a Git repo of reusable Groovy pipeline code that many Jenkinsfiles load. Fifty microservices call `standardPipeline()` instead of copy-pasting 200 lines each. When you fix or upgrade a stage once, every pipeline gets the change, and the platform team can enforce standards (scans, approvals, notifications) in one place.

**Directory structure (fixed by Jenkins):**
```
jenkins-shared-lib/
├── vars/                       # global "steps" — callable directly by file name
│   ├── standardPipeline.groovy #   → standardPipeline(...) in a Jenkinsfile
│   ├── dockerBuildPush.groovy  #   → dockerBuildPush(...)
│   ├── notifySlack.groovy
│   └── notifySlack.txt         #   optional help text shown in Jenkins' step reference
├── src/                        # regular Groovy classes (package structure), for complex logic
│   └── org/acme/ci/
│       └── Semver.groovy
└── resources/                  # non-Groovy files loaded with libraryResource()
    └── org/acme/ci/
        ├── pod-template.yaml
        └── sonar-project.properties
```
- **`vars/*.groovy`**: each file is a global variable. Defining `def call(...)` makes it callable like a step. This is where 90% of libraries live.
- **`src/`**: standard Groovy classes, imported with `import org.acme.ci.Semver`. Use it for helpers that need state or unit tests.
- **`resources/`**: templates or config, read with `libraryResource 'org/acme/ci/pod-template.yaml'`.

**Writing a step:**
```groovy
// vars/dockerBuildPush.groovy
def call(Map cfg = [:]) {
  def registry = cfg.registry ?: '123456789012.dkr.ecr.ap-south-1.amazonaws.com'
  def image    = "${registry}/${cfg.name}:${cfg.tag ?: env.GIT_COMMIT.take(7)}"
  sh """
    aws ecr get-login-password | docker login --username AWS --password-stdin ${registry}
    docker build -t ${image} ${cfg.context ?: '.'}
    trivy image --severity CRITICAL --ignore-unfixed --exit-code 1 ${image}
    docker push ${image}
  """
  return image
}
```
```groovy
// vars/standardPipeline.groovy — a whole pipeline as a template
def call(Map cfg) {
  pipeline {
    agent any
    stages {
      stage('Build')  { steps { sh cfg.buildCmd ?: 'make build' } }
      stage('Image')  { steps { script { env.IMAGE = dockerBuildPush(name: cfg.app) } } }
      stage('Deploy') { steps { sh "helm upgrade --install ${cfg.app} ./chart -n ${cfg.namespace} --set image.tag=${env.IMAGE.split(':')[-1]} --atomic" } }
    }
    post { always { notifySlack(currentBuild.currentResult) } }
  }
}
```

**Defining it in Jenkins:** *Manage Jenkins → System → Global Pipeline Libraries*: give it a name (`acme-lib`), a default version (branch or tag), and the SCM repo URL plus credentials. With JCasC it's `unclassified.globalLibraries.libraries[]`. If you tick "Load implicitly", every pipeline gets it without an `@Library` line. A library can also be defined at folder level for one team.

**Using it in a Jenkinsfile:**
```groovy
@Library('acme-lib@v2.3.0') _          // pin a TAG in prod pipelines; '_' imports vars/
standardPipeline(app: 'orders', namespace: 'dev', buildCmd: 'mvn -B package')
```
Alternatively, `library('acme-lib@main')` loads it dynamically, and you can mix library steps into a normal Declarative pipeline (`steps { dockerBuildPush(name: 'orders') }`).

**Good practices:** version the library with **tags** and pin them, so a library change can't break 50 pipelines at once (test on `@feature-branch` first). Unit test it with **JenkinsPipelineUnit**. Keep the steps small and composable. Be aware that *global* (trusted) libraries run outside the Groovy sandbox, so restrict who can merge to that repo.

---

### 3. What kind of applications do you deploy using Jenkins pipelines, and what deployment tools do you use?
Answer from your own experience. A strong, concrete shape is:

- **Applications**: containerized **microservices** (Java Spring Boot, Node.js, Python/FastAPI, Go) running on **EKS**, plus a few **frontends** (React/Angular builds to **S3 + CloudFront**), **scheduled jobs** (K8s CronJobs), **Lambda** functions, and sometimes legacy apps on EC2 VMs.
- **Deployment tools by target:**
| Target | Tool used from Jenkins |
|---|---|
| Kubernetes (EKS) | **Helm** (`helm upgrade --install --atomic`), or hand off to **Argo CD** (GitOps: Jenkins bumps the image tag in the config repo, Argo CD syncs it). Kustomize for simpler overlays |
| Infrastructure | **Terraform** (plan in PR, apply after approval) |
| VMs / config | **Ansible** playbooks (rolling, `serial: 25%`), or AWS CodeDeploy |
| Static frontends | `aws s3 sync` + CloudFront invalidation |
| Serverless | SAM / Serverless Framework / Terraform |
| Artifacts | Docker images to **ECR**; JARs/npm packages to **Nexus/Artifactory** |

- What to emphasize: **Jenkins does CI, and a declarative tool does the deploying** (Helm/Argo CD/Terraform). Deploys are idempotent and repeatable, and rollback is a `helm rollback` or `git revert`, not a manual fix.

---

### 4. The Jenkins pipeline runs but the build doesn't happen. What could be causing it?
Work out which of these you're seeing: (a) the job never triggers, (b) it triggers but sits in the **queue**, or (c) it "runs" but the stages are skipped or do nothing.

**(a) Not triggered at all**
- Webhook not delivered: check GitHub → Settings → Webhooks → *Recent Deliveries* (response code). The usual causes are a wrong URL (`/github-webhook/` needs the trailing slash; GitLab and generic triggers use different paths), Jenkins not reachable from the internet (private network, firewall, missing reverse proxy), a bad TLS cert, or a secret/token mismatch.
- The job isn't configured to listen: "GitHub hook trigger for GITScm polling" isn't ticked, or the Multibranch job's branch discovery or filter (regex, "only PRs") excludes this branch.
- Commit message contains `[ci skip]`, or a path filter excludes the changed files.

**(b) Stuck in the queue (*"Waiting for next available executor"*)**
- No agent matches the `agent { label 'docker' }` label, or the agent is **offline** (disconnected, disk full, JNLP/SSH broken).
- The Kubernetes plugin can't start the agent pod: the pod is Pending (no capacity, ImagePullBackOff for the agent image, wrong service account). Check the pod events in the agent namespace.
- All executors are busy, or `disableConcurrentBuilds()` / a `lock()` is waiting on another build. A quiet period or throttle is configured.

**(c) Runs, but no real build**
- `when { branch 'main' }` conditions are false (on a PR the branch is `PR-12`, so the stages are skipped), or a `changeset` condition doesn't match.
- The wrong Jenkinsfile is used (script path), or the wrong branch or refspec is checked out (shallow clone or stale workspace builds an old commit).
- `sh` steps exit 0 without doing anything: a script error swallowed by `|| true`, missing `set -e`, or a wrong working directory (`dir()`).
- Build tool issues: a cached artifact means nothing gets rebuilt (Maven offline, Docker cache), or a build tool or plugin version mismatch on the agent.
- Sandbox: "Scripts not permitted to use method…" means **script approval** is pending in *Manage Jenkins → In-process Script Approval*.

**Where to look:** the build **Console Output**, *Manage Jenkins → System Log*, the queue tooltip (it says why it's waiting), webhook delivery logs, the agent log, and `kubectl get pods -n jenkins-agents`.

---

### 5. A Jenkins pipeline fails randomly (intermittently). How would you debug it?
Random failures have a cause that isn't in the code diff. You find it by **finding the pattern**.

1. **Collect the data**: list the last N failures. Group them by **failing stage, error message, agent/node, time of day, and concurrent builds**. Tools: the Build Failure Analyzer plugin, or exporting build results to Prometheus/Elastic. The pattern usually points straight at the cause:
   - Always the **same agent**: that agent's disk is full, its Docker daemon is broken, a tool version differs, or it has a stale workspace.
   - **Only under load / at peak**: executor or CPU/memory contention, an agent pod that got **OOMKilled** (exit 137), test DB connection limits.
   - **Same test, different results**: a **flaky test** (timing assumptions, test order dependence, shared state, `sleep`-based waits, random ports colliding).
   - **Network-y errors** (`Connection reset`, `TLS handshake timeout`, `429`): Docker Hub rate limits, artifact repo or registry blips, DNS.
   - **At a specific time**: overlapping cron jobs, nightly backups, credential/token rotation, spot agent interruption.
2. **Common Jenkins-specific causes:**
   - **Shared workspaces** between concurrent builds on the same agent. Use `disableConcurrentBuilds()`, `ws()` with unique paths, or ephemeral agents (K8s pods) plus `cleanWs()`.
   - **Shared resources**: two builds deploy to the same Dev namespace, or use the same test DB or ports. Use the Lockable Resources plugin (`lock('dev-env')`), or a namespace per build.
   - The Jenkins controller itself: heap pressure (look for GC in the logs), too many builds running on the controller (it should have **0 executors**), plugin bugs.
   - Spot or autoscaled agents that disappear mid-build, showing `ChannelClosedException` / `Agent went offline`.
   - Unpinned dependencies or `latest` images resolving differently between runs.
3. **Reproduce**: rerun on the same agent and commit. Loop the suspect test 50 times (`mvn -Dtest=X -Dsurefire.rerunFailingTestsCount=0` in a loop). Use `kubectl describe pod` on agent pods for OOM and eviction.
4. **Fix the cause, then add guardrails**: give agents enough resources, use ephemeral clean agents, pin images and dependencies, use a local registry mirror, use `retry(3)` **only around network steps** (never around tests, which would hide flakiness), quarantine flaky tests with an owner and a deadline, and set timeouts on every stage.

**See also:** [05](./05-cicd-jenkins-github-actions-qna.md) Q10, Q26 · [28](./28-production-scenarios-rapid-round-qna.md) Q09.

---

### 6. What is the purpose of a webhook, and how is it used in a CI/CD pipeline?
A **webhook** is an HTTP **callback**: when an event happens in system A, A sends an HTTP POST with a JSON payload to a URL in system B. It's push-based and event-driven, the opposite of **polling** (B asking A every few minutes "anything new?"). Webhooks are instant, and they don't put load on the Git server.

**In CI/CD:**
- **Git, then CI**: GitHub/GitLab sends a webhook on `push`, `pull_request`, or tag events to Jenkins (`https://jenkins.example.com/github-webhook/`). Jenkins reads the payload (repo, branch, commit SHA) and triggers the matching Multibranch job right away.
- **CI, then other tools**: SonarQube sends a webhook back to Jenkins (`/sonarqube-webhook/`) with the Quality Gate result. Registries (ECR/Harbor/Docker Hub) send webhooks on image push to trigger a deploy or a scan. Argo CD gets Git webhooks for an instant sync instead of the 3-minute poll.
- **Notifications**: Slack/Teams **incoming webhooks** receive build status; PagerDuty or Alertmanager receive alerts.

**Setting it up (GitHub to Jenkins):** in the repo go to *Settings → Webhooks → Add*: Payload URL `https://<jenkins>/github-webhook/`, content type `application/json`, a **secret**, and the events. In Jenkins, add the GitHub server config with the same secret and tick "GitHub hook trigger" (Multibranch jobs pick it up automatically).

**Security:** the endpoint is exposed to the internet, so **verify the HMAC signature** (`X-Hub-Signature-256`) with the shared secret, use HTTPS only, allowlist GitHub's IP ranges at the firewall/WAF if possible, or put a relay in front (smee.io for local dev, or webhook-proxy services) instead of exposing the whole Jenkins UI.

---

### 7. How do you create and manage Kubernetes clusters with Terraform, and what are master and worker nodes?
**Master (control plane) vs. worker nodes:**
| Control plane ("master") | Worker nodes |
|---|---|
| **kube-apiserver**: the front door; every `kubectl` call and every component talks to it | **kubelet**: an agent that makes sure the containers in its assigned pods are running and healthy, and reports node status |
| **etcd**: a key-value store holding all cluster state | **container runtime** (containerd / CRI-O): pulls images and runs containers |
| **kube-scheduler**: picks a node for each new pod | **kube-proxy** (or Cilium eBPF): implements Service networking |
| **kube-controller-manager**: control loops (Deployments, ReplicaSets, nodes, endpoints) | **CNI plugin** (VPC CNI, Calico, Cilium): pod networking |
| **cloud-controller-manager**: cloud LBs, routes, nodes | Your application pods run here |

On **EKS/AKS/GKE the control plane is managed**: AWS runs the API servers and etcd across 3 AZs, and you only see the API endpoint. You manage the **worker nodes** (managed node groups, Karpenter, or Fargate). With self-managed clusters (kubeadm), you run 3 control plane nodes for etcd quorum.

**Creating EKS with Terraform** (use the community module rather than writing it from scratch):
```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
  name = "prod"
  cidr = "10.0.0.0/16"
  azs             = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
  enable_nat_gateway = true
  private_subnet_tags = { "kubernetes.io/role/internal-elb" = 1 }
  public_subnet_tags  = { "kubernetes.io/role/elb" = 1 }
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"
  cluster_name    = "prod"
  cluster_version = "1.31"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets
  cluster_endpoint_public_access = false            # private API; reach it via VPN/bastion
  enable_cluster_creator_admin_permissions = true
  authentication_mode = "API"                        # EKS access entries (see Q13)

  eks_managed_node_groups = {
    general = { instance_types = ["m6i.large"], min_size = 3, max_size = 10, desired_size = 3 }
    spot    = { instance_types = ["m6i.large", "m5.large"], capacity_type = "SPOT", min_size = 0, max_size = 20 }
  }
  cluster_addons = { coredns = {}, kube-proxy = {}, vpc-cni = {}, eks-pod-identity-agent = {}, aws-ebs-csi-driver = {} }
}
```
```bash
terraform init && terraform plan -out tfplan && terraform apply tfplan
aws eks update-kubeconfig --name prod --region ap-south-1
kubectl get nodes
```

**Managing it over time:**
- **Split the state**: network, then cluster, then add-ons/workloads in separate states. Install in-cluster things (ingress controller, cert-manager, Argo CD) with the Helm provider or, better, **Argo CD**, so a cluster rebuild isn't one giant apply.
- **Upgrades**: bump `cluster_version` one minor version at a time. The control plane goes first, then the add-ons, then the node groups (rolling node replacement, which respects PDBs). Test in non-prod first, and check deprecated APIs with `kubent` / `pluto`.
- Use the same module with different `tfvars` per environment, remote state with locking, and plan/apply through CI.

**See also:** [04](./04-kubernetes-qna.md) Q3, Q47 · [06](./06-terraform-and-iac-qna.md) Q22.

---

### 8. What is the command to access a pod, and how do you define or create a Kubernetes object (or "class")?
**Accessing a pod:**
```bash
kubectl exec -it <pod> -n <ns> -- /bin/sh            # shell (use /bin/bash if present)
kubectl exec -it <pod> -c <container> -- sh          # multi-container pod
kubectl exec <pod> -- env                            # run one command
kubectl logs -f <pod> [-c <container>] [--previous]  # logs
kubectl port-forward pod/<pod> 8080:80               # reach it from your laptop
kubectl cp <pod>:/tmp/heap.hprof ./heap.hprof        # copy files out
kubectl debug -it <pod> --image=busybox --target=<container>   # distroless image with no shell → ephemeral debug container
kubectl attach -it <pod>                             # attach to the main process's stdin/stdout
```

**Defining and creating objects:** every object is YAML with four top-level fields: `apiVersion`, `kind`, `metadata`, `spec`.
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: web }
spec:
  replicas: 3
  selector: { matchLabels: { app: web } }
  template:
    metadata: { labels: { app: web } }
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports: [{ containerPort: 80 }]
          resources: { requests: { cpu: 100m, memory: 128Mi }, limits: { memory: 256Mi } }
```
```bash
kubectl apply -f deployment.yaml          # declarative: create or update (preferred, used in CI/GitOps)
kubectl create -f deployment.yaml         # imperative create (fails if it exists)
kubectl create deployment web --image=nginx --replicas=3 --dry-run=client -o yaml > deployment.yaml  # generate YAML fast
kubectl expose deployment web --port=80 --type=ClusterIP
kubectl explain deployment.spec.strategy  # field docs from the API itself
kubectl api-resources                     # every kind the cluster knows
```

**If they literally mean "class":** Kubernetes has several **`*Class` objects**, which are cluster-wide templates that other objects refer to by name:
- **StorageClass**: how PVCs get provisioned dynamically (`provisioner: ebs.csi.aws.com`, `type: gp3`, `volumeBindingMode: WaitForFirstConsumer`).
- **IngressClass**: which ingress controller handles an Ingress (`ingressClassName: nginx`).
- **PriorityClass**: pod scheduling and eviction priority. **RuntimeClass**: selects a runtime (e.g. gVisor). **GatewayClass** for the Gateway API.
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata: { name: gp3 }
provisioner: ebs.csi.aws.com
parameters: { type: gp3, encrypted: "true" }
volumeBindingMode: WaitForFirstConsumer
reclaimPolicy: Delete
allowVolumeExpansion: true
```
If they mean defining your **own** object type, that's a **CustomResourceDefinition (CRD)**: you register a new `kind` (e.g. `Database`), and an **operator/controller** watches those objects and reconciles them, the way cert-manager's `Certificate` or Argo CD's `Application` work.

---

### 9. Explain the folder structure of a basic Helm chart. What commands do you use to deploy with Helm?
```
mychart/                     # created by: helm create mychart
├── Chart.yaml               # chart metadata: apiVersion v2, name, version (chart SemVer), appVersion, dependencies
├── values.yaml              # default configuration values (image, replicas, resources, ingress…)
├── values.schema.json       # (optional) JSON schema to validate values
├── charts/                  # dependency charts (subcharts), filled by `helm dependency update`
├── templates/               # Go-templated Kubernetes manifests
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml
│   ├── serviceaccount.yaml
│   ├── configmap.yaml
│   ├── _helpers.tpl         # named templates/partials (labels, fullname) — '_' files render nothing on their own
│   ├── NOTES.txt            # message printed after install (how to reach the app)
│   └── tests/
│       └── test-connection.yaml   # run with `helm test <release>`
└── .helmignore              # files to exclude when packaging
```
```yaml
# Chart.yaml
apiVersion: v2
name: orders
version: 1.4.0          # chart version — bump on any chart change
appVersion: "2.7.1"     # version of the app it deploys
dependencies:
  - name: postgresql
    version: 15.x.x
    repository: oci://registry-1.docker.io/bitnamicharts
    condition: postgresql.enabled
```
```yaml
# templates/deployment.yaml (excerpt) — values flow in via {{ .Values.* }}
spec:
  replicas: {{ .Values.replicaCount }}
  template:
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          resources: {{- toYaml .Values.resources | nindent 12 }}
```

**Commands:**
```bash
helm create orders                                   # scaffold
helm dependency update ./orders                      # pull subcharts into charts/
helm lint ./orders                                   # static checks
helm template orders ./orders -f values-prod.yaml    # render locally, no cluster (pipe to kubeconform)
helm install orders ./orders -n prod --create-namespace -f values-prod.yaml --dry-run --debug  # validate against cluster
helm upgrade --install orders ./orders -n prod -f values-prod.yaml --set image.tag=abc1234 --atomic --wait --timeout 5m
helm list -n prod                                    # releases
helm status orders -n prod
helm get values orders -n prod                       # values in use; `helm get manifest` for rendered YAML
helm history orders -n prod
helm rollback orders 3 -n prod                       # back to revision 3
helm uninstall orders -n prod
helm package ./orders && helm push orders-1.4.0.tgz oci://<registry>/charts   # publish to OCI registry (ECR/Harbor)
helm repo add bitnami https://charts.bitnami.com/bitnami && helm repo update  # third-party charts
```
Values precedence (lowest to highest): chart `values.yaml`, then parent chart values, then each `-f` file in order, then `--set`. In CI, use `upgrade --install` (idempotent) plus `--atomic`.

**See also:** [28](./28-production-scenarios-rapid-round-qna.md) Q07 (releases/rollback/config management) · [Argo CD + Helm integration](../Continuous%20Delivery/ArgoCD/argo-cd-integration-helm.md).

---

### 10. What branching and release strategy do you follow? How do you avoid breaking the release branch, fix a production bug, and handle parallel changes?
**The strategy, and why.** Pick one and justify it:
- **Trunk-based / GitHub Flow** (most teams that deploy often): short-lived `feature/*` branches, PRs into `main`, `main` always deployable, unfinished work hidden behind **feature flags**, releases are **tags** (`v1.8.0`) on main.
- **Release branches** (when you ship versioned releases, support several versions, or have a fixed release cadence/QA window): `main` (or `develop`) for ongoing work, `release/1.8` cut for stabilization, only bug fixes go into it, tag `v1.8.0` from it, `hotfix/*` for production fixes. Full **Git Flow** (separate `develop` + `main`) is heavy, so only use it if the release process really needs it.

**Keeping the release branch (and main) from breaking:**
- **Branch protection**: no direct pushes, PRs required, at least 1–2 approvals, CODEOWNERS for critical paths, **required status checks** (build, tests, Sonar gate, scans) must pass, branch must be **up to date** with the base before merging (or use a **merge queue**, which tests the combined result).
- Small PRs, rebasing or merging from the base often to avoid big-bang conflicts, squash merges for a clean history.
- Only **cherry-picked fixes** enter the release branch after it's cut; no new features.
- Signed commits and linear history if compliance needs them.

**Production bug: the hotfix flow**
1. **Mitigate first**: roll back to the previous release or turn off the feature flag. A hotfix is not always the fastest fix.
2. Create `hotfix/PROJ-123` from the **tag that's in production** (`git checkout -b hotfix/PROJ-123 v1.8.0`), or from `release/1.8`.
3. Write the smallest fix **plus a regression test**, open a PR, get an expedited but still real review, and let the full pipeline run (don't skip scans).
4. Deploy through the normal pipeline to Stage, verify, then Prod. Tag `v1.8.1`.
5. **Merge the fix back** to `main` (and `develop`, and any newer release branch) so it isn't lost in the next release. If the fix landed on main first, `git cherry-pick -x <sha>` it onto the release branch.
6. Postmortem: why did tests miss it?

**Parallel changes (several features or teams at once):**
- Each feature gets its own short-lived branch and PR; rebase on `main` daily to keep conflicts small.
- **Feature flags** so half-finished features can merge without being released. That's the key to avoiding long-lived branches.
- Per-PR **preview environments** (Q14) so features are tested in isolation before merge.
- **Merge queue** so concurrent PRs that each pass alone don't break `main` together.
- For **parallel releases** (1.8 in prod being patched while 1.9 is in QA): keep separate `release/x.y` branches, fix in the oldest affected branch and merge forward, or fix on main and cherry-pick back.
- **SemVer** tags plus automated changelogs (Conventional Commits, semantic-release / release-please).
- For a monorepo, path-based CI so teams only build what they changed.

**See also:** [02](./02-git-version-control-qna.md) Q38, Q44.

---

### 11. How do you pass environment variables during Docker build, and what services do you use to store Docker images?
**Build-time values use `ARG` + `--build-arg`:**
```dockerfile
ARG NODE_VERSION=20                 # ARG before FROM → usable in FROM
FROM node:${NODE_VERSION}-alpine
ARG APP_VERSION                     # must be re-declared after FROM to use in this stage
ARG BUILD_ENV=production
ENV APP_VERSION=${APP_VERSION} \
    NODE_ENV=${BUILD_ENV}           # promote to ENV only if the running app needs it
RUN npm ci && npm run build
```
```bash
docker build \
  --build-arg APP_VERSION=$(git rev-parse --short HEAD) \
  --build-arg BUILD_ENV=production \
  -t orders:1.4.0 .
```
- `ARG` exists **only during the build**. `ENV` is baked into the image and present at **runtime**.
- **Runtime environment variables** are best supplied at run/deploy time, not baked in: `docker run -e KEY=val` / `--env-file .env`, or K8s `env`, `envFrom: configMapRef/secretRef`. That way the **same image works in every environment**, and only the configuration changes.
- **Never pass secrets with `--build-arg` or `ENV`.** They're visible in `docker history` and the image layers. Use **BuildKit secrets** instead:
```dockerfile
# syntax=docker/dockerfile:1
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
```
```bash
docker build --secret id=npmrc,src=$HOME/.npmrc -t orders .
```
  In Jenkins, wrap the build in `withCredentials([...])` so the value is masked in logs.

**Where images are stored:**
| Registry | Notes |
|---|---|
| **Amazon ECR** | Default on AWS; IAM auth (`aws ecr get-login-password`), scan on push (Inspector), lifecycle policies to delete old tags, cross-region replication, **immutable tags** |
| **Azure ACR** / **GCP Artifact Registry** | Same idea on those clouds, with managed identity / workload identity auth |
| **Harbor** | Self-hosted, CNCF; RBAC, Trivy scanning, replication, image signing, proxy cache |
| **JFrog Artifactory / Nexus** | Universal artifact repos (Docker + Maven + npm), often as a Docker Hub **pull-through cache** |
| **Docker Hub / GHCR** | Public/open-source images; watch the Docker Hub pull rate limits |

Practices: tag with the **git SHA** (plus SemVer for releases), never deploy `latest`, turn on immutable tags, set lifecycle cleanup policies, scan on push, and deploy by digest.

**See also:** [03](./03-docker-qna.md) Q15, Q21–Q22.

---

### 12. How do you establish database connections in your deployments and infrastructure?
Cover four things: **network path, credentials, configuration, and connection management.**

**1. Network path (private, never public):**
- The DB (RDS/Aurora) lives in **private subnets**, in a DB subnet group across AZs, with `publicly_accessible = false`.
- **Security groups**: the DB SG allows `5432/3306` **only from the app's SG** (SG-to-SG reference), not from CIDR ranges. On EKS, use **Security Groups for Pods** or the node SG.
- Humans and tools connect through **SSM Session Manager port forwarding** or a bastion/VPN, never through a public DB endpoint.
- Cross-VPC or on-prem: VPC peering, Transit Gateway, or PrivateLink.

**2. Credentials (no hardcoded passwords):**
- Generate the master password with Terraform (`manage_master_user_password = true` lets RDS store and rotate it in **Secrets Manager**), with automatic rotation.
- The app gets credentials at runtime: **External Secrets Operator** syncs the Secrets Manager secret into a K8s Secret, mounted as env vars or files. Or use the **Secrets Store CSI driver**. The pod's **IRSA / Pod Identity** role is allowed to read only *its own* secret.
- Better: **IAM database authentication** (a short-lived token generated with the pod's IAM role, no password at all), or Vault **dynamic DB credentials** (a unique user per pod with a TTL).

**3. Configuration:**
```yaml
env:
  - name: DB_HOST
    valueFrom: { configMapKeyRef: { name: orders-config, key: db_host } }   # e.g. orders.cluster-xxxx.ap-south-1.rds.amazonaws.com
  - name: DB_PASSWORD
    valueFrom: { secretKeyRef: { name: orders-db, key: password } }        # synced from Secrets Manager by ESO
```
- Use the **cluster/writer endpoint** for writes and the **reader endpoint** for read replicas. A K8s `ExternalName` Service (`db.orders.svc` pointing to the RDS hostname) makes the endpoint easy to swap.
- Turn on **TLS** to the DB (`sslmode=verify-full` with the RDS CA bundle).

**4. Connection management (where production incidents happen):**
- **Connection pooling** in the app (HikariCP, SQLAlchemy pool). Size it so that `pods × pool size` stays below the DB's `max_connections`, which gets dangerous with an HPA scaling to 50 pods.
- **RDS Proxy** or **PgBouncer** in front of the DB to multiplex connections, handle failover faster, and absorb spikes from Lambda or autoscaling.
- Readiness probes should check the DB connection carefully (don't make every pod go unready when the DB has a blip). Retry with backoff at startup. **Schema migrations** run as a separate step (Flyway/Liquibase job, Helm pre-upgrade hook), backward compatible.

**Debugging "can't connect":** DNS resolves? `nc -zv host 5432` from the pod. SG/NACL rules? Credentials and secret synced? TLS required? `max_connections` exhausted?

**See also:** [04](./04-kubernetes-qna.md) Q54 · [25](./25-azure-deep-dive-qna.md) Q58.

---

### 13. How do you handle authentication for EKS clusters and store secrets securely?
**Two different directions, and you should separate them:** *who can call the Kubernetes API* (humans and CI to the cluster), and *what the pods can call in AWS* (the cluster to AWS).

**1. Humans and CI to the EKS API (authentication, then authorization):**
- **Authentication is IAM.** `aws eks update-kubeconfig` writes a kubeconfig that runs `aws eks get-token`, which creates a short-lived signed token from your IAM identity. There are no static kube passwords or certs.
- **Mapping IAM to Kubernetes identity:**
  - **EKS access entries** (current method, `authentication_mode = "API"`): manage which IAM principals can access the cluster through the EKS API/Terraform, and attach **access policies** (`AmazonEKSClusterAdminPolicy`, `AmazonEKSViewPolicy`, namespace-scoped) or map them to K8s groups.
  - The **`aws-auth` ConfigMap** (legacy; `mapRoles`/`mapUsers`) is fragile. One bad edit locks everyone out. Migrate to access entries.
```bash
aws eks create-access-entry --cluster-name prod --principal-arn arn:aws:iam::123456789012:role/DevTeam
aws eks associate-access-policy --cluster-name prod --principal-arn arn:aws:iam::123456789012:role/DevTeam \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy \
  --access-scope type=namespace,namespaces=team-a
```
- **Authorization is Kubernetes RBAC**: Roles/RoleBindings per team namespace, ClusterRoles for platform admins, least privilege, and no one uses the cluster creator identity day to day.
- Humans come in through **SSO** (IAM Identity Center permission sets mapped to roles). **CI** (Jenkins/GitHub Actions) assumes a deploy role via **OIDC** or the agent's IRSA role, with no long-lived access keys. Prefer a **private API endpoint**. Send **control-plane audit logs** to CloudWatch.

**2. Pods to AWS services:**
- **EKS Pod Identity** (newer, simpler) or **IRSA** (IAM Roles for Service Accounts via the cluster's OIDC provider). Each K8s ServiceAccount maps to its own IAM role, so the `orders` pod can read *only* `orders/*` secrets and its S3 bucket. Never put permissions on the node role, which every pod on the node inherits, and block IMDS access from pods (hop limit 1).

**3. Storing secrets:**
- The **source of truth is AWS Secrets Manager** (or SSM Parameter Store for config), encrypted with **KMS**, with **automatic rotation** (RDS-managed rotation, rotation Lambdas).
- Getting them into the cluster: **External Secrets Operator** (`ClusterSecretStore` using IRSA, and an `ExternalSecret` per app with a refresh interval), or the **Secrets Store CSI Driver + AWS provider** (mounted as files, optionally synced to a K8s Secret).
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata: { name: orders-db, namespace: orders }
spec:
  refreshInterval: 1h
  secretStoreRef: { name: aws-secrets-manager, kind: ClusterSecretStore }
  target: { name: orders-db }
  data:
    - secretKey: password
      remoteRef: { key: prod/orders/db, property: password }
```
- Hardening the cluster side: **envelope encryption of K8s Secrets with KMS** (an EKS setting), RBAC that limits `get/list` on secrets, mounting secrets as files instead of env vars where possible, and **Reloader** so pods pick up rotated values.
- **In Git, nothing in plain text**: Sealed Secrets or SOPS + KMS if secrets have to live in a GitOps repo. **In Jenkins**: Credentials store or the AWS Secrets Manager credentials provider plugin, used with `withCredentials` (masked in logs).

**See also:** [28](./28-production-scenarios-rapid-round-qna.md) Q18 · [20](./20-devops-roadmap-gap-fill-qna.md) Q3, Q11 · [04](./04-kubernetes-qna.md) Q55.

---

### 14. Dynamic infrastructure creation with auto-destroy: how would you automate it?
**Use case:** **ephemeral environments**. These are per-PR preview environments, short-lived load-test or QA stacks, and training labs. They're created on demand and **destroyed automatically**, so they never turn into forgotten, expensive leftovers.

**Pattern 1: per-PR environments on Kubernetes (cheapest, fastest)**
- PR opened: the pipeline builds the image and deploys to namespace `pr-<number>` with Helm, `pr-123.dev.example.com` via wildcard DNS + ingress, and a seeded or shared test DB. It posts the URL as a PR comment.
- PR merged or closed: a webhook triggers `helm uninstall` + `kubectl delete ns pr-123`.
- Argo CD's **ApplicationSet with the Pull Request generator** does all of this declaratively: one Application per open PR, removed automatically when the PR closes.

**Pattern 2: per-PR / on-demand cloud infrastructure with Terraform**
```hcl
# envs/ephemeral/main.tf — one state per environment, keyed by env name
terraform {
  backend "s3" {}                                   # key passed at init: ephemeral/${ENV_NAME}.tfstate
}
variable "env_name" {}
variable "ttl_hours" { default = 24 }
locals {
  tags = { Environment = var.env_name, Ephemeral = "true", Owner = "ci",
           ExpiresAt = timeadd(plantimestamp(), "${var.ttl_hours}h") }
}
module "app_stack" {
  source        = "../../modules/app-stack"
  name          = var.env_name
  tags          = local.tags
  instance_type = "t3.small"
}
```
```groovy
// Jenkins: create on PR, destroy on close / TTL
stage('Create env') {
  when { changeRequest() }
  steps { sh '''
    terraform init -backend-config="key=ephemeral/pr-${CHANGE_ID}.tfstate"
    terraform apply -auto-approve -var env_name=pr-${CHANGE_ID} -var ttl_hours=48
  ''' }
}
// separate job triggered by the PR-closed webhook (or the nightly reaper below):
//   terraform init -backend-config="key=ephemeral/pr-${PR}.tfstate" && terraform destroy -auto-approve -var env_name=pr-${PR}
```
In GitHub Actions: `on: pull_request: types: [opened, synchronize]` runs apply, and `types: [closed]` runs destroy. **Use Terraform workspaces or a state key per environment**, so destroying one environment can never touch another.

**Auto-destroy: defense in layers (the event trigger *will* get missed sometimes):**
1. **Event-based**: destroy on PR close/merge (webhook).
2. **TTL-based reaper**: a scheduled job (nightly Jenkins cron / EventBridge + Lambda) finds every environment whose `ExpiresAt` tag is in the past and runs `terraform destroy` for its state key. For anything Terraform has lost track of, tools like **cloud-nuke** / **aws-nuke** (scoped to the sandbox account by tag filter) clean up.
3. **Budget guardrails**: put ephemeral environments in a **separate sandbox account**. AWS Budgets alerts, SCPs limit instance types and regions, and Service Quotas cap the damage.
4. **Platform options**: Terraform Cloud / HCP **ephemeral workspaces** (an auto-destroy timer per workspace), Crossplane compositions with a TTL controller, Kubernetes namespace TTL controllers (e.g. `kube-janitor` deleting objects with a `janitor/ttl: 24h` annotation).

**Making it safe and cheap:**
- The destroy job uses a CI role that can **only** delete resources tagged `Ephemeral=true` in the sandbox account. A bug can't reach shared or prod infrastructure.
- Keep the stacks small (spot, small instances, shared VPC/EKS cluster, Aurora Serverless or a snapshot-restored DB), and seed data from fixtures, not from prod copies (PII).
- Handle failed destroys: retry, then alert. Use `prevent_destroy` only on shared resources, never on ephemeral ones.
- Report on cost per environment (tags) so the savings are visible.

**See also:** [06](./06-terraform-and-iac-qna.md) Q16, Q22–Q23 · [20](./20-devops-roadmap-gap-fill-qna.md) Q10.

---

*Part of the [Interview Questions](./README.md) hub. See [`../Index.md`](../Index.md) for the full repository index.*
