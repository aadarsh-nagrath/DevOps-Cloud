# GCP Compute — Compute Engine, MIGs, App Engine, Cloud Run, GKE — Complete Notes

> Part of the [GCP overview](./gcp.md).

---

## 1. Compute Engine (IaaS VMs)
- **Machine families**: **General purpose** (E2 cost-optimized, N2/N2D/N4, C4/C4A/C4D, **Tau T2D/T2A** scale-out, Arm: C4A/N4A **Axion**), **Compute-optimized** (C2, C2D, H3, H4D), **Memory-optimized** (M1/M2/M3/M4, X4), **Accelerator-optimized** (A2/A3/A4 GPUs, G2), **Storage-optimized** (Z3).
- **Custom machine types** (N/E families): choose exact vCPU and memory (`--custom-cpu=6 --custom-memory=20GB`), extended memory option — pay only for what you need.
- **Pricing/discounts**: per-second billing; **Sustained Use Discounts** automatic (up to ~30% for N1/N2/N2D/C2/M families running much of the month); **Committed Use Discounts** (1/3-yr, resource-based or flexible **spend-based**, up to ~55–70%); **Spot VMs** (up to ~91% off, can be preempted any time with 30-s notice, **no 24-hour limit** unlike legacy preemptible VMs); sole-tenant nodes (BYOL/compliance).
- **Disks**: Persistent Disk / **Hyperdisk** (network block) vs **Local SSD** (physically attached, highest IOPS, ephemeral) — see storage notes.
- **Images** (public, custom, **machine images**, image families), **instance templates**, **startup scripts** (metadata), **metadata server**, **OS Login**, shielded/confidential VMs, **live migration** during host maintenance (no reboot for most VMs).
- **Spot/preemptible use cases**: batch, rendering, CI, stateless workers in MIGs, fault-tolerant big data (Dataproc secondary workers). Never single-instance databases.
```bash
gcloud compute instances create web-1 --zone=asia-south1-a --machine-type=e2-medium \
  --image-family=debian-12 --image-project=debian-cloud --tags=web --no-address \
  --service-account=web-sa@my-proj.iam.gserviceaccount.com --scopes=cloud-platform --shielded-secure-boot
gcloud compute instances create batch-1 --provisioning-model=SPOT --instance-termination-action=DELETE --machine-type=c3-standard-8
gcloud compute ssh web-1 --zone=asia-south1-a --tunnel-through-iap
```

## 2. Managed Instance Groups (MIGs) — autoscaling VMs
- Identical VMs from an **instance template**; **zonal** or **regional** (spread across zones — recommended for HA).
- **Autoscaling** on CPU, LB serving capacity (RPS), Cloud Monitoring metrics, **schedules**, predictive autoscaling; cool-down/initialization period; scale-in controls.
- **Autohealing** with health checks (recreate unhealthy VMs).
- **Rolling updates/canary** (`maxSurge`, `maxUnavailable`, canary with two templates), **stateful MIGs** (preserve disks/IPs/names).
- Backends for load balancers. Equivalent to AWS ASG / Azure VMSS; conceptually like a K8s Deployment + HPA.
```bash
gcloud compute instance-templates create web-tmpl --machine-type=e2-medium --image-family=debian-12 --image-project=debian-cloud --tags=web --metadata-from-file=startup-script=startup.sh
gcloud compute instance-groups managed create web-mig --template=web-tmpl --size=3 --region=asia-south1
gcloud compute instance-groups managed set-autoscaling web-mig --region=asia-south1 --min-num-replicas=3 --max-num-replicas=20 --target-cpu-utilization=0.6
gcloud compute instance-groups managed rolling-action start-update web-mig --version=template=web-tmpl-v2 --max-surge=3 --max-unavailable=0 --region=asia-south1
```

## 3. App Engine (PaaS)
- **Standard environment**: sandboxed runtimes (Python, Java, Node, Go, PHP, Ruby), very fast scaling incl. **to zero**, free tier; **Flexible environment**: Docker containers on Compute Engine VMs, more flexibility, no scale to zero, slower scaling.
- Services → versions → instances; **traffic splitting** across versions; `app.yaml`. One App Engine app per project (region fixed). Today **Cloud Run** is generally recommended for new apps.
```bash
gcloud app deploy app.yaml --version=v2 --no-promote
gcloud app services set-traffic default --splits=v1=0.9,v2=0.1
```

## 4. Cloud Run (serverless containers)
- Run any stateless **container** that listens on `$PORT` (HTTP/gRPC/WebSockets) — fully managed on Google infrastructure (Knative-based API).
- **Services** (request-driven, URL, autoscale incl. **scale to zero**), **Jobs** (run-to-completion tasks, parallel tasks, scheduled via Cloud Scheduler), **Worker pools** (continuous background work, no URL, manual scaling — e.g. pull-based Pub/Sub/Kafka consumers).
- **Concurrency**: max simultaneous requests per instance (default 80, up to 1000) — a ceiling, not a target; set **1** for non-thread-safe code. Autoscaling considers concurrency & CPU.
- **Min instances** to avoid cold starts; **max instances** to protect downstream DBs; CPU allocation: request-based (CPU only during requests) vs instance-based ("CPU always allocated", for background work); startup CPU boost; **GPUs** for inference.
- **Revisions** are immutable; **traffic splitting** & tags for canary/blue-green; **rollback = shift traffic to a previous revision**.
- Networking: **Direct VPC egress** (instances get subnet IPs; cheaper, no connector) or Serverless VPC Access connector; ingress settings (all / internal / internal + LB); behind global LB with Cloud Armor/IAP/CDN; custom domains.
- Security: per-service **service account**, `roles/run.invoker` for authenticated invocation, Secret Manager integration, Binary Authorization, CMEK.
- Billing: per 100 ms of CPU/memory while serving (request-based) — very cheap for spiky traffic.
```bash
gcloud run deploy web --image=asia-south1-docker.pkg.dev/my-proj/apps/web:1.4.0 --region=asia-south1 \
  --service-account=web-sa@my-proj.iam.gserviceaccount.com --min-instances=1 --max-instances=50 --concurrency=80 \
  --set-secrets=DB_PASS=db-pass:5 --no-allow-unauthenticated --no-traffic --tag=canary
gcloud run services update-traffic web --region=asia-south1 --to-tags=canary=10      # canary 10%
gcloud run services update-traffic web --region=asia-south1 --to-revisions=web-00042-abc=100   # rollback
```

## 5. Cloud Run functions (formerly Cloud Functions)
- Event-driven functions (HTTP, Pub/Sub, Cloud Storage, Firestore, Eventarc events) in Node, Python, Go, Java, .NET, Ruby, PHP — renamed **Cloud Run functions** (2024); deployed as Cloud Run services (2nd gen), so they get concurrency, longer timeouts (up to 60 min for HTTP), traffic splitting.
- **Functions vs Cloud Run**: functions = write just a function, Google builds the container (simplest for glue/event handlers); Cloud Run = bring any container, any language/binary, multiple endpoints, more control. **Functions vs App Engine**: functions for single-purpose event handlers; App Engine for whole web apps (legacy-ish).

## 6. Google Kubernetes Engine (GKE)
| | **Autopilot** (default, recommended) | **Standard** |
|---|---|---|
| Nodes | Google manages nodes, scaling, security hardening, upgrades | You manage node pools (machine types, autoscaling, upgrades) |
| Billing | **Per Pod resource requests** (vCPU/memory/ephemeral storage) | **Per node** VM (pay for unused capacity) + cluster fee |
| Control | Restricted (no privileged pods, no SSH to nodes, limited DaemonSets) | Full (custom node configs, GPUs/TPUs any way, privileged workloads) |
| SLA | Pods + control plane | Control plane (regional) |
| When | Most workloads, small platform teams | Special node needs, kernel tuning, specific hardware, cost tricks with bin-packing |
Since 2025 Standard clusters can run selected workloads in Autopilot mode via **Autopilot ComputeClasses**.

- **Cluster types**: zonal vs **regional** (control plane + nodes across 3 zones — prod); **private clusters** (nodes without external IPs, private control plane endpoint / DNS-based endpoint); release channels (Rapid/Regular/Stable/Extended) + maintenance windows/exclusions; **surge upgrades** / blue-green node pool upgrades.
- **Networking**: VPC-native (alias IPs), **GKE Dataplane V2** (eBPF/Cilium, network policy, logging), Gateway API / Ingress (GCLB), multi-cluster gateways, Cloud Service Mesh.
- **Scaling**: HPA, VPA, **Cluster Autoscaler**, **Node Auto-Provisioning / ComputeClasses**, multi-dimensional pod autoscaling, image streaming for fast startup.
- **Security / hardening**: private cluster + authorized networks, **Workload Identity Federation for GKE**, least-privilege node SA, **Shielded GKE nodes** + Container-Optimized OS, **Binary Authorization**, network policies, Pod Security Standards (Policy Controller), Secret Manager CSI + application-layer secrets encryption (CMEK for etcd secrets), GKE Security Posture dashboard, Container Threat Detection, regular upgrades via release channels, RBAC via Google Groups.
- **Monitoring/troubleshooting**: Cloud Monitoring/Logging integration (system + workload), **Managed Service for Prometheus**, GKE dashboards, `kubectl describe/top/logs`, events, node pressure, Pod `Pending` (quota/resources/affinity), `CrashLoopBackOff`, HPA metrics, VPC flow logs, Cloud Trace.
```bash
gcloud container clusters create-auto prod-auto --region=asia-south1 --release-channel=regular --enable-private-nodes
gcloud container clusters create std-prod --region=asia-south1 --num-nodes=1 --machine-type=e2-standard-4 \
  --enable-autoscaling --min-nodes=1 --max-nodes=5 --workload-pool=my-proj.svc.id.goog --enable-shielded-nodes \
  --enable-ip-alias --enable-private-nodes --master-ipv4-cidr=172.16.0.0/28 --release-channel=stable
gcloud container clusters get-credentials prod-auto --region=asia-south1
```
- **GKE Enterprise (Anthos)**: fleet management across GKE, on-prem (Google Distributed Cloud), AWS/Azure attached clusters — Config Sync (GitOps), Policy Controller, Cloud Service Mesh, multi-cluster ingress — for hybrid/multi-cloud consistency.
- **Microservices on GKE steps**: containerize each service → Artifact Registry → Kubernetes manifests/Helm per service → namespaces & quotas → service discovery via Services, Gateway API for ingress → Workload Identity for GCP access → Cloud Service Mesh for mTLS/traffic policy → CI/CD with Cloud Build + Cloud Deploy (or Argo CD) → observability (Managed Prometheus, Cloud Trace) → autoscaling + PDBs.

## 7. Choosing compute (Cloud Run vs GKE vs Compute Engine vs App Engine vs Functions)
**Pick the most managed option that fits:**
- Stateless HTTP/event service, containers, spiky traffic, small team → **Cloud Run** (jobs for batch, worker pools for pull consumers).
- Single event handler / glue code → **Cloud Run functions**.
- Many services needing Kubernetes APIs (operators, service mesh, StatefulSets, DaemonSets, custom scheduling), portability, platform team → **GKE** (Autopilot first).
- Full OS control, licensed software tied to VMs, special kernels/drivers, legacy lift-and-shift, Windows apps → **Compute Engine** (+ MIGs).
- Existing App Engine apps → App Engine; new apps → Cloud Run.
- Batch/HPC → **Batch** service, Spot VMs.
Trade-offs: control ↑ = ops burden ↑; Cloud Run has request/instance limits and no node access; GKE needs K8s skills; VMs need patching/scaling.
