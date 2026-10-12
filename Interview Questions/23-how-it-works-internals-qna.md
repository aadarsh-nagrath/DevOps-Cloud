# How It Works Internally — Interview Questions & Answers

> Part of the [Interview Questions](./README.md) hub. These are the "what actually happens under the hood" questions interviewers use to separate people who *use* a tool from people who *understand* it. Several topics have a basic, definition-level version elsewhere (linked per question); the answers here go one level deeper.

---

## Table of Contents
- [Kubernetes](#kubernetes)
- [Containers](#containers)
- [Terraform](#terraform)
- [CI/CD](#cicd)
- [Cloud & Networking](#cloud--networking)
- [Git](#git)
- [Operations & Production](#operations--production)

---

## Kubernetes

### 1. How does Kubernetes decide which node to schedule a pod on?
The **kube-scheduler** watches the API server for Pods with an empty `spec.nodeName` and puts them in a **scheduling queue** (ordered by PriorityClass). For each Pod it runs the **Scheduling Framework** pipeline:
1. **PreFilter / Filter**: remove nodes that can't run the Pod. These plugins check `NodeResourcesFit` (the Pod's **requests**, not limits, against the node's allocatable minus what's already requested), `NodeAffinity`/`nodeSelector`, `TaintToleration`, `NodePorts`, volume zone/topology constraints, inter-pod anti-affinity, and `PodTopologySpread` with `whenUnsatisfiable: DoNotSchedule`.
2. **Score**: rank the feasible nodes 0–100 per plugin, then take a weighted sum. Examples are `NodeResourcesBalancedAllocation`, `LeastAllocated` vs `MostAllocated` (spread vs bin-pack), `ImageLocality` (image already cached), preferred affinities, and soft topology spread. On big clusters it stops after finding enough feasible nodes (`percentageOfNodesToScore`) so the scheduler stays fast.
3. **Reserve → Permit → Bind**: it reserves the resources in its own cache, then writes a **Binding** object, which sets `nodeName`. The kubelet on that node takes over from there.

If no node fits, **PostFilter** runs **preemption**, which evicts lower-priority Pods to make room. If that doesn't help either, the Pod stays `Pending` with a `FailedScheduling` event such as `0/5 nodes are available: 3 Insufficient cpu, 2 node(s) had untolerated taint`. That event message is the first thing to read when debugging. *(Basics: [04 Q44](./04-kubernetes-qna.md))*

### 2. What happens internally when you run `kubectl apply`?
1. **Client side**: kubectl reads the manifest, loads credentials from kubeconfig, and uses **discovery** to map `kind` to the right API group/version/resource (e.g. `apps/v1 deployments`).
2. **Diff/merge**: with classic client-side apply, kubectl GETs the live object and computes a **three-way merge** between the last-applied config (stored in the `kubectl.kubernetes.io/last-applied-configuration` annotation), your new manifest, and the live state. This is how it knows to *delete* a field you removed without touching fields other controllers set. With `--server-side`, the API server does this using **managedFields** (field ownership) and reports conflicts when two managers own the same field.
3. **API server pipeline**: authentication → authorization (RBAC) → **mutating admission** (defaults, sidecar injection, webhooks) → schema validation → **validating admission** (OPA/Kyverno, PodSecurity) → persisted to **etcd** with a new `resourceVersion`.
4. **Controllers react** through watches. For a Deployment, the Deployment controller creates or updates a **ReplicaSet**, the ReplicaSet controller creates **Pods**, the scheduler binds them to nodes, and the **kubelet** calls the container runtime over CRI (pull image, create sandbox, CNI sets up networking, start containers, run probes) and reports status back.

`kubectl apply` returns as soon as the object is stored in etcd. Everything after that is asynchronous reconciliation, which is why you need `kubectl rollout status` to know whether the change actually worked. *(Basics: [04 Q11, Q21](./04-kubernetes-qna.md))*

### 3. How does Kubernetes service discovery work?
It has two halves: a **stable name** and a **stable virtual IP**.
- **Name → IP (DNS)**: **CoreDNS** watches Services and serves `my-svc.my-ns.svc.cluster.local` → the Service's **ClusterIP**. The kubelet writes each Pod's `/etc/resolv.conf` with the cluster DNS IP and search domains (`my-ns.svc.cluster.local svc.cluster.local ...`), so a plain `my-svc` resolves. Because of `ndots:5`, external names try the search domains first, which is a classic source of extra DNS latency. A **headless** Service (`clusterIP: None`) returns the Pod IPs directly instead, which StatefulSets rely on for stable per-pod names.
- **VIP → Pod (data plane)**: the **EndpointSlice controller** keeps the list of *ready* Pod IPs matching the Service selector. **kube-proxy** on each node watches EndpointSlices and programs **iptables/IPVS** rules (or eBPF maps with Cilium) that DNAT traffic sent to `ClusterIP:port` to one of the backend Pod IPs. The ClusterIP isn't bound to any interface. It only exists as those rewrite rules.

The common follow-up is "Service resolves but traffic fails". The usual answer is that the Service has empty endpoints, because the selector doesn't match the Pod labels or the Pods aren't Ready. Check `kubectl get endpointslices`.

### 4. What is the difference between readiness and liveness probes internally?
Both are run by the **kubelet** on the Pod's node (not by the control plane), on `periodSeconds`, and they use `failureThreshold`/`successThreshold`. The difference is **what the kubelet does with the result**:
- **Liveness failure**: the kubelet **kills the container** and the Pod's `restartPolicy` restarts it (restart count goes up, with CrashLoopBackOff backoff). It's a local, node-level action.
- **Readiness failure**: nothing is restarted. The kubelet sets the Pod's `Ready` condition to false in its status. The **EndpointSlice controller** sees that and marks the endpoint not-ready, and **kube-proxy/ingress controllers** stop routing to it. It's a cluster-level traffic action.
- **Startup probe**: disables the other two until it succeeds, so slow-starting apps don't get killed by liveness.

Practical consequences: readiness is checked for the Pod's whole life, not only at startup, so it can drain an overloaded Pod. A liveness probe that checks a **downstream dependency** (the DB) is an anti-pattern, because a DB blip then restarts every Pod at once. Liveness should only check "is this process wedged". Readiness also gates rolling updates: a new Pod doesn't count as available until it's Ready. *(Basics: [04 Q15](./04-kubernetes-qna.md))*

### 5. How does Horizontal Pod Autoscaler (HPA) make scaling decisions?
The HPA controller in kube-controller-manager runs a **control loop every 15 s**:
1. It fetches metrics: resource metrics (CPU/memory) from **metrics-server** via `metrics.k8s.io`, or custom/external metrics via an adapter (Prometheus Adapter, KEDA).
2. It computes `desiredReplicas = ceil(currentReplicas × currentMetric / targetMetric)`. CPU utilization is measured **as a percentage of the Pod's request**, so a Pod with no CPU request can't be autoscaled on CPU. With several metrics, it computes each one and takes the **max**.
3. It skips the change if the ratio is within the **tolerance (±10%)**, so it doesn't flap. Pods that aren't Ready yet, or have missing metrics, are treated conservatively.
4. It applies `behavior` policies. The **scale-down stabilization window** (default 300 s) uses the highest recommendation from the last 5 minutes, and there are rate limits on how fast it can scale (e.g. max 100% up per 15 s). Then it clamps to `minReplicas`/`maxReplicas` and updates the Deployment's `scale` subresource.

HPA only adds Pods. If they're `Pending` for lack of capacity, the **Cluster Autoscaler/Karpenter** adds nodes, so real scale-up latency is the metric scrape interval, plus the HPA loop, plus node provisioning, plus image pull and readiness. For spiky traffic, scale on a **leading** signal (queue depth, RPS) instead of CPU. *(Basics: [04 Q30](./04-kubernetes-qna.md))*

### 16. How does Kubernetes handle pod failures and self-healing?
Self-healing is a set of independent **reconciliation loops**, each fixing one layer:
- **Container crashes** → the kubelet restarts it in place per `restartPolicy`, with exponential backoff (10 s → 5 min cap, which shows up as `CrashLoopBackOff`). OOM kills (`OOMKilled`, exit 137) are handled the same way.
- **Container hung** → the liveness probe fails → the kubelet kills and restarts it.
- **Pod deleted or evicted** → the **ReplicaSet controller** sees `actual < desired` replicas and creates a replacement Pod, which the scheduler places, often on a different node. A bare Pod with no controller does **not** come back.
- **Node dies** → the kubelet stops renewing its **Lease** → the node-lifecycle controller marks it `NotReady` after about 40 s and adds a `NoExecute` taint → Pods are evicted after `tolerationSeconds` (default 300 s) → controllers recreate them elsewhere. StatefulSet Pods are *not* force-replaced automatically, to avoid two copies of the same identity.
- **Not enough capacity** → the Cluster Autoscaler adds nodes for the Pending Pods.
- **Voluntary disruptions** (drains, upgrades) are limited by **PodDisruptionBudgets**.

What it does *not* heal: a bad image or config (it will happily crash-loop forever), application-level corruption, or a single-replica service with no redundancy. Self-healing assumes you run multiple replicas spread across nodes and zones.

### 17. What happens during a rolling deployment in Kubernetes?
When the Pod template changes (new image, env, etc.), the **Deployment controller** creates a **new ReplicaSet** (named with the template hash) and leaves the old one in place. Then it steps:
1. It scales the new RS up by up to **`maxSurge`** (default 25%) extra Pods above the desired count.
2. It waits for the new Pods to be **Ready** and stay Ready for `minReadySeconds`.
3. It scales the old RS down, while never dropping below `replicas − maxUnavailable` (default 25%) available Pods.
4. It repeats until the new RS is at full size and the old RS is at 0. The old RS is kept (scaled to 0) for `kubectl rollout undo`, up to `revisionHistoryLimit`.

During the rollout, both versions serve traffic at the same time, so the app must be **backward compatible** (API and DB schema). For zero dropped requests on scale-down: the Pod is removed from endpoints and gets SIGTERM *at the same time*, so use a `preStop` sleep of a few seconds plus graceful shutdown within `terminationGracePeriodSeconds`. If new Pods never become Ready, the rollout stalls and is marked failed after `progressDeadlineSeconds`. It doesn't roll back automatically; you (or Argo Rollouts/CI) run `rollout undo`. *(Basics: [04 Q14](./04-kubernetes-qna.md), strategies: [14](./14-deployment-systemdesign-behavioral-qna.md))*

---

## Containers

### 6. What happens internally when you run `docker run`?
1. The **docker CLI** sends a REST call over `/var/run/docker.sock` to **dockerd**.
2. dockerd resolves the image. If it isn't local, it **pulls** it: it resolves the tag to a manifest digest from the registry, picks the platform, and downloads and verifies each **layer** blob by digest.
3. It creates the container: prepares an **overlay2** filesystem (read-only image layers as `lowerdir` plus a fresh writable `upperdir`), sets up networking (a **veth pair**, one end in a new network namespace and the other attached to the `docker0` bridge, an IP from IPAM, and iptables NAT rules for `-p` port mappings), and mounts volumes.
4. dockerd hands off to **containerd**, which starts a **containerd-shim** and calls **runc** with an OCI bundle (`config.json` + rootfs).
5. **runc** creates the **namespaces** (pid, net, mnt, uts, ipc, user), applies **cgroups** (CPU/memory limits), drops capabilities, applies the seccomp/AppArmor profiles, `pivot_root`s into the rootfs, and `exec`s the entrypoint as **PID 1**. Then runc exits.
6. The **shim** stays as the container's parent. It holds stdio and collects the exit code, which is why containers survive a dockerd restart (with live-restore).

So a container is just a normal Linux process with isolation (namespaces) and limits (cgroups). *(Docker basics: [03](./03-docker-qna.md))*

### 7. How does Docker layer caching work?
Each Dockerfile instruction produces a layer, and the builder (**BuildKit**) checks a **cache key** before running each step:
- For `RUN`, `ENV`, `WORKDIR`, etc., the key is **the parent layer + the instruction text**. If the same command ran on the same parent before, the cached layer is reused, even if the command would produce something different today (`apt-get update` gets cached forever unless the line changes).
- For `COPY`/`ADD`, the key also includes a **checksum of the copied files' contents** (not mtimes).
- **A cache miss invalidates every step after it**, because each later layer's parent is now different.

That's why ordering matters: put rarely-changing steps first. Copy only the dependency manifest, install dependencies, *then* copy the source:
```dockerfile
COPY package.json package-lock.json ./
RUN npm ci            # cached until the lockfile changes
COPY . .              # source changes only rebuild from here
```
Other tools: `.dockerignore` (so `.git` or logs don't bust the `COPY . .` hash), multi-stage builds, BuildKit `RUN --mount=type=cache` for package-manager caches, and in CI (fresh runners have no local cache) `--cache-from`/`--cache-to type=registry` or `type=gha`. Layers are content-addressed by digest, so identical layers are also shared on disk and in the registry across images. *(See also [03 Q16–Q20](./03-docker-qna.md), [20 Q15](./20-devops-roadmap-gap-fill-qna.md))*

---

## Terraform

### 8. How does Terraform dependency graph (DAG) work internally?
On `plan`/`apply`, Terraform builds a **directed acyclic graph**: nodes are resources, data sources, providers, modules, variables, locals, and outputs. Edges come from:
- **Implicit references**: `subnet_id = aws_subnet.a.id` adds an edge from the instance to the subnet.
- **Explicit `depends_on`**, for ordering that no attribute reference shows.
- **Provider edges**: every resource depends on its provider being configured.

Then it validates that the graph has **no cycles** (a cycle is a hard `Error: Cycle`), runs a transitive reduction, and **walks** it: a node runs once all its dependencies are done, and independent nodes run **in parallel** (default `-parallelism=10`). **Destroy order is the reverse** of creation. With `create_before_destroy`, the replacement is created first and the old one destroyed afterwards. During `plan`, values that aren't known until apply show as `(known after apply)` and pass through the graph as unknowns. You can see the graph with `terraform graph | dot -Tsvg`. *(Basics: [06 Q17](./06-terraform-and-iac-qna.md))*

### 9. How does Terraform handle state locking and consistency?
- **Locking**: before any operation that can write state (`plan`, `apply`, `import`, `state mv`), Terraform takes a lock from the **backend**. S3 historically used a **DynamoDB** table with a conditional write on a `LockID` item. Since Terraform 1.10 it can use `use_lockfile = true`, which writes a `.tflock` object with S3 conditional writes. GCS, azurerm (blob lease), Consul, and Terraform Cloud each have native locks. If the lock is held, others fail (or wait with `-lock-timeout`). A crashed run leaves a stale lock, which you clear with `terraform force-unlock <ID>` *only after* confirming nothing is running.
- **Consistency**: the state file has a **`serial`** (incremented on every write) and a **`lineage`** (a unique ID for that state's history). Terraform refuses to push older or different-lineage state over newer state. Each plan **refreshes** real infrastructure against state to detect drift, and a saved plan file (`plan -out`) is rejected at apply time if the state changed since it was made.
- **Hygiene**: enable bucket **versioning** to roll back a bad state, encrypt it (it contains secrets), keep state small and split per component/environment so the lock and blast radius are small, and run applies from CI only, so there's one serialized writer. *(Basics: [06 Q12–Q13](./06-terraform-and-iac-qna.md))*

---

## CI/CD

### 10. What happens internally in a CI/CD pipeline from commit → deploy?
1. **Trigger**: `git push` → the Git server fires a **webhook** (or the CI polls) carrying the commit SHA, branch, and author.
2. **Scheduling**: the CI server parses the pipeline definition **at that commit** (`.github/workflows/*.yml`, `Jenkinsfile`, `.gitlab-ci.yml`), builds the job graph, and queues jobs. A **runner/agent** matching the job's labels picks one up (a fresh VM or container for ephemeral runners).
3. **Job execution**: check out the SHA, inject secrets (preferably short-lived **OIDC** credentials rather than static keys), restore caches, then run the steps: lint → unit tests → build → **SAST/SCA/secret scan** → build image → **scan image** → sign it (cosign) and generate an SBOM → push to the registry tagged with the **commit SHA** (immutable, never `latest`).
4. **Artifacts** are passed between jobs/stages, and test reports and coverage are published.
5. **Deploy**: either **push-based** (the pipeline runs `helm upgrade`/`kubectl apply`/`terraform apply` against the environment) or **GitOps** (the pipeline bumps the image tag in a config repo, and **Argo CD/Flux** inside the cluster pulls and reconciles). Promotion is dev → staging (integration/e2e tests) → **approval gate** → prod with canary or blue-green.
6. **Verify and feedback**: smoke tests and health checks; automated rollback on failure or SLO breach; commit status set on the PR; Slack notification; DORA metrics recorded.

The key properties are **build once, promote the same artifact** (staging and prod run the identical digest) and **everything traceable back to a commit SHA**. *(See [05](./05-cicd-jenkins-github-actions-qna.md))*

### 11. How does a pipeline handle parallel jobs and dependencies?
Internally, a pipeline is also a **DAG of jobs**. The scheduler starts every job whose dependencies are satisfied, in parallel, limited by available runners and concurrency limits.
- **Declaring dependencies**: GitHub Actions `needs: [build]`, GitLab `needs:` (DAG mode, so a job doesn't have to wait for the whole previous stage), Jenkins `parallel {}` blocks inside sequential stages.
- **Fan-out/fan-in**: a **matrix** (`os × version`) runs N copies of a job in parallel, and a later job that `needs` the matrix waits for all of them.
- **Passing data**: jobs run on *different* machines, so they share nothing by default. Outputs go via **artifacts** (upload/download), **job outputs** (small strings), or a registry (images), and dependencies via **caches**.
- **Failure semantics**: by default a failed dependency skips its dependents. `fail-fast` cancels the sibling matrix jobs. `if: always()`/`when: always` runs cleanup or notification jobs anyway. `continue-on-error` marks a job as non-blocking.
- **Concurrency control**: `concurrency:` groups (GHA), `resource_group` (GitLab), or Jenkins `lock()` stop two deploys to the same environment from running at once, with `cancel-in-progress` for superseded PR builds.

Parallelism is good for independent work (lint, unit tests, scans, test sharding). Deploys should be serialized per environment.

---

## Cloud & Networking

### 12. How does AWS Load Balancer route traffic?
1. **DNS**: the LB's hostname resolves via Route 53 (an Alias record) to **LB node IPs, one or more per enabled AZ**. The client picks one. With **cross-zone load balancing** (always on for ALB, off by default for NLB), each node can send to targets in any AZ.
2. **ALB (Layer 7)**: terminates TCP and **TLS** (certificate from ACM, chosen by SNI), parses HTTP, then evaluates **listener rules** in priority order: host header, path, HTTP method, headers, query string, source IP. The matching rule forwards to a **target group** (it can also redirect, return a fixed response, or authenticate via OIDC/Cognito). Within the target group it uses **round-robin** or **least outstanding requests**, with optional sticky sessions (a cookie). It opens a *new* connection to the target, so the client IP arrives in `X-Forwarded-For`.
3. **NLB (Layer 4)**: no HTTP parsing. It uses a **flow hash** (protocol, src/dst IP and port) so a connection sticks to one target, preserves the client source IP, has static or Elastic IPs per AZ, handles millions of connections at very low latency, and can pass TLS through or terminate it.
4. **Health checks**: each target group probes its targets, and only healthy targets get traffic. If *all* targets are unhealthy, the LB **fails open** and sends to all of them. **Deregistration delay** lets in-flight requests drain.
5. **Target types**: instance, IP (e.g. EKS Pods directly via the AWS Load Balancer Controller), Lambda, or another ALB (behind an NLB).

GWLB (Layer 3, GENEVE) is for inserting firewall/inspection appliances. *(See [07 Q12](./07-aws-cloud-qna.md))*

### 13. What happens internally when you hit a CloudFront URL?
1. **DNS**: `d123.cloudfront.net` (or your CNAME/Alias) resolves through CloudFront's DNS, which returns IPs of the **nearest edge location** based on latency and geography (anycast-like routing).
2. **TLS** terminates at the edge (certificate from ACM in `us-east-1`, chosen by SNI). HTTP/2 or HTTP/3 to the viewer.
3. **Edge logic**: **AWS WAF** rules, geo restriction, then **viewer-request** functions (CloudFront Functions or Lambda@Edge for header rewrites, auth, redirects). The request is matched to a **cache behavior** by path pattern.
4. **Cache lookup** by the **cache key**, which is defined by the cache policy (path plus whichever headers, cookies, or query strings you include; a bigger key means a lower hit ratio). **Hit** → served directly from the edge.
5. **Miss** → the edge asks a **Regional Edge Cache** (a bigger mid-tier cache). If that also misses, optional **Origin Shield** collapses requests, then it goes to the **origin**: an S3 bucket (locked down with **OAC** so only CloudFront can read it), an ALB, API Gateway, or a custom HTTP server. The connection to the origin goes over AWS's backbone and is reused (keep-alive).
6. The response is cached per TTL (`Cache-Control`/`max-age` from the origin, bounded by the policy's min/max TTL), passes through origin-response/viewer-response functions, and is returned, often compressed. A deploy needs versioned filenames or an **invalidation** (`/*`) so edges don't serve stale content.

`X-Cache: Hit from cloudfront` / `Miss from cloudfront` in the response headers tells you which path it took.

### 14. How does DNS resolution work step by step?
Taking `www.example.com` from a Linux host:
1. **Local**: the app calls `getaddrinfo()` → `/etc/nsswitch.conf` decides the order (usually `files dns`) → `/etc/hosts` → the local stub/cache (`systemd-resolved`, nscd) → `/etc/resolv.conf` gives the **recursive resolver** IP (ISP, `8.8.8.8`, VPC `.2` resolver, CoreDNS in K8s). The browser also has its own cache.
2. **Recursive resolver**: if `www.example.com` is in its cache and the TTL hasn't expired, it answers immediately. Otherwise it walks the tree **iteratively**:
   - asks a **root server** (it knows them from root hints) → referral to the `.com` **TLD** servers,
   - asks a `.com` TLD server → referral to `example.com`'s **authoritative nameservers** (the NS records set at the registrar, plus glue A records),
   - asks the authoritative server → it returns the final answer (an `A`/`AAAA` record, or a `CNAME` that it then follows).
3. The resolver **caches** each answer for its TTL (and NXDOMAIN for the SOA negative TTL), and returns the result to the client, which caches it too.

The client→resolver query is *recursive* ("give me the final answer"); resolver→root/TLD/auth queries are *iterative* (referrals). It runs over UDP 53 and falls back to TCP for large responses/AXFR; DoH/DoT encrypt it, and DNSSEC signs answers so they can't be spoofed. Debug with `dig +trace www.example.com`. The interview point about TTLs: lower them *before* a migration, because old values stay cached until they expire. *(See [08](./08-networking-and-security-fundamentals-qna.md), [01 Q68](./01-linux-and-scripting-qna.md))*

---

## Git

### 15. How does Git merge and rebase differ internally?
Git stores **commits** (a tree, parent pointer(s), author, message), **trees**, and **blobs**, all content-addressed by hash. A branch is just a file containing a commit hash.
- **Merge**: Git finds the **merge base** (the best common ancestor, `git merge-base A B`) and does a **three-way merge** of base vs ours vs theirs (the `ort` strategy by default) at the tree level, combining non-conflicting changes and stopping on conflicts. It then creates **one new commit with two parents**. Existing commits are untouched, so history stays exactly as it happened and it's safe on shared branches. If your branch is a direct ancestor of theirs, it's a **fast-forward**: the pointer just moves and no commit is created.
- **Rebase**: Git finds the commits on your branch that aren't on the target, **saves them as patches**, resets your branch to the target's tip, and **replays each commit one by one** (effectively a cherry-pick each). Each replayed commit has a different parent, so it gets a **new hash**: they are *new commits* with the same changes. Conflicts can come up per commit. The originals still exist (in `ORIG_HEAD` and the **reflog**) until garbage collection.

Consequences: rebase gives linear history but **rewrites history**, so never rebase commits others have already pulled (it needs `push --force-with-lease`). Merge keeps the true history but adds merge commits. If you mess up a rebase, `git reflog` + `git reset --hard <old-sha>` recovers it. *(Basics: [02 Q11, Q29, Q39](./02-git-version-control-qna.md))*

---

## Operations & Production

### 18. How do logs, metrics, and traces work together in observability?
They answer different questions and are only powerful when **correlated**:
- **Metrics** (Prometheus, numeric time series): cheap, aggregated, and what you **alert** on. They tell you *that* something is wrong: "p99 latency on checkout jumped to 3 s".
- **Traces** (OpenTelemetry → Tempo/Jaeger/X-Ray): one request's path across services as spans with timings. They tell you *where* it's wrong: "the span to `payment-svc` → DB query takes 2.8 s". **Context propagation** (the W3C `traceparent` header) carries the trace ID across every hop.
- **Logs** (Loki/ELK): detailed, discrete events. They tell you *why*: "connection pool exhausted, timeout acquiring connection".

The glue is shared context: services emit structured logs that include the **`trace_id`**, metrics carry **exemplars** (a trace ID attached to a histogram bucket), and everything shares consistent labels (`service`, `env`, `version`, `k8s pod`). The workflow is: alert fires on metric → click an exemplar to open a slow trace → jump from the slow span to logs filtered by that `trace_id` → root cause. **OpenTelemetry** standardizes collecting all three through one SDK and Collector. Without correlation you just have three expensive, disconnected tools. *(See [11](./11-monitoring-logging-observability-qna.md), [20 Q6](./20-devops-roadmap-gap-fill-qna.md))*

### 19. What happens when your system goes down - how do you approach it?
Mitigate first; find the root cause after.
1. **Detect and declare**: an alert or user report → acknowledge, judge the **severity** by user impact, open an incident channel, and assign an **Incident Commander** (coordinates), plus ops/comms roles. Post an early status-page update.
2. **Scope it fast**: what's broken, for whom, since when? Check dashboards (RED/USE metrics), error rates, and recent **changes**. Most outages follow a deploy, config change, flag flip, cert expiry, or infra change. Check dependencies (DB, DNS, cloud provider status).
3. **Mitigate**: take the quickest action that restores service even if it doesn't fix the cause, such as **roll back** the recent deploy, disable the feature flag, fail over to another region/replica, scale up, shed load/rate-limit, or restart a wedged component. Make one change at a time and say each one out loud in the channel.
4. **Verify recovery** with metrics (not just "the pod is up"), then keep watching for a while.
5. **Communicate** throughout: regular stakeholder updates on a fixed cadence, even when the update is "no new information".
6. **Afterwards**: a **blameless postmortem** with a timeline, root cause *and* contributing factors (why it wasn't caught, why detection took X minutes), and action items with owners: fix the bug, add the missing alert, add a test or guardrail, update the runbook.

Common mistakes interviewers listen for: debugging root cause for an hour while users are down instead of rolling back, several people changing things at once, and silence toward stakeholders. *(See [13](./13-sre-incident-loadbalancing-servicemesh-qna.md))*

### 20. What are the most common production mistakes in DevOps setups?
- **No resource requests/limits** → noisy neighbours, OOM kills, a broken HPA, and nodes overcommitted until they fall over.
- **Bad probes**: no readiness probe (traffic goes to unready Pods), or a liveness probe that checks dependencies (cascading restarts).
- **Single points of failure**: one replica, one AZ, no PodDisruptionBudget, a single NAT gateway, one DB with no failover.
- **Mutable tags (`:latest`)** → you can't tell what's running and can't roll back reliably.
- **Secrets in Git, images, or env files**, long-lived static cloud keys, and over-permissive IAM (`*:*`).
- **No rollback path**: deploys you can't undo quickly, and DB migrations that aren't backward compatible.
- **Manual changes ("ClickOps")** → drift from IaC, snowflake environments, local Terraform state, or no state locking.
- **Monitoring gaps or alert fatigue**: alerting on CPU instead of user-facing symptoms/SLOs, no alerts on cert expiry or disk, and alerts nobody acts on.
- **Untested backups and DR**: backups exist but restores have never been tried.
- **Missing timeouts, retries, and backoff**, or retries without jitter, which turn a small blip into a retry storm.
- **Big-bang deploys** with no canary, feature flags, or staged rollout, often on a Friday evening.
- **Unbounded logs and cardinality**: debug logging in prod, high-cardinality metric labels (user IDs), and no retention → cost explosions and a Prometheus that falls over.
- **Prod and staging that differ**, so "it worked in staging" means nothing.
- **No cost guardrails**: idle resources, oversized instances, forgotten snapshots, and cross-AZ/NAT data transfer charges.

A strong answer names a few of these *from your own experience* along with the guardrail you added afterwards (a policy-as-code check, an alert, a CI gate).

---

*Part of the [DevOps & Cloud Preparation Hub](../README.md). See [`../Index.md`](../Index.md) for the full repository index.*
