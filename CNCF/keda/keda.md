# KEDA — Complete Notes

## 1. Beginner

### What is KEDA?
- **Kubernetes Event-Driven Autoscaling** — CNCF **graduated** project, originally built by Microsoft and Red Hat.
- Extends the standard Kubernetes **Horizontal Pod Autoscaler (HPA)** so it can scale on signals other than CPU/memory: queue depth, Kafka consumer lag, cron schedules, HTTP request rate, Prometheus query results, and 60+ other event sources.
- KEDA does **not replace** the HPA — it feeds it. This is the single most important architectural fact to remember.

### The Core Problem It Solves
```
Standard HPA:
  Pod CPU/Memory usage --> HPA controller --> scale replicas up/down

Reality: most workloads aren't CPU-bound.
  "I have 10,000 messages sitting in a queue and 1 pod consuming them slowly"
  --> CPU usage on that pod might be totally normal (low) the whole time
  --> HPA never scales it, backlog keeps growing
```
Without KEDA, scaling a queue-consumer, a Kafka consumer group, or a webhook-driven job on external event volume means hand-rolling a custom metrics adapter or polling script. KEDA ships that adapter for you, pre-built for dozens of systems (RabbitMQ, Kafka, AWS SQS, Azure Service Bus, Redis, Prometheus, cron, and more), and — critically — it can scale a deployment **to zero** when there's no work at all, something the HPA alone cannot do (HPA has a hard minimum of 1 replica).

### Core Architecture
```
[External event source]                    [Kubernetes]
 (Redis list, Kafka topic,     KEDA Operator watches
  RabbitMQ queue, cron, ...)    ScaledObject/ScaledJob CRDs
         |                              |
         |  polls/subscribes            |
         v                              v
   +-----------------------------------------------+
   |              KEDA Operator                     |
   |  - Scales Deployment 0 <-> 1 (activation)       |
   |  - Exposes external metrics via                |
   |    KEDA Metrics Adapter (metrics-server API)    |
   +-----------------------------------------------+
                        |
                        v
             Kubernetes HPA controller
             (reads the external metric,
              scales replicas 1..N as usual)
                        |
                        v
                  Deployment/Job pods
```
- **KEDA Operator**: watches `ScaledObject`/`ScaledJob` custom resources, talks to the event source, and handles the 0-to-1 (and 1-to-0) activation/deactivation that HPA can't do on its own.
- **KEDA Metrics Adapter**: implements the Kubernetes `external.metrics.k8s.io` API — this is the trick that lets the *standard, unmodified* HPA controller consume KEDA's external metrics as if they were any other metric.
- Once at 1+ replicas, the **standard Kubernetes HPA** takes over scaling 1..N based on the metric value KEDA exposes — KEDA just handles sourcing the metric and the zero-boundary.

### Core Concepts
| Term | Meaning |
|---|---|
| **Scaler** | A plugin/connector for one event source (Redis, Kafka, Prometheus, cron, etc.) — 60+ built in |
| **ScaledObject** | CRD that tells KEDA to scale a `Deployment`/`StatefulSet` based on one or more triggers |
| **ScaledJob** | CRD that tells KEDA to create Kubernetes `Job`s (not scale a Deployment) per unit of backlog |
| **Trigger** | The specific event source config inside a ScaledObject/ScaledJob (e.g., "Redis list `myqueue`, target length 5") |
| **Activation / Deactivation** | KEDA scaling a workload from 0 to 1 (activation) or 1 to 0 (deactivation) — the part HPA can't do |
| **Cooldown Period** | How long to wait with no events before scaling back down to 0 (default 300s) |
| **Polling Interval** | How often KEDA checks the external source for new metric values (default 30s) |
| **minReplicaCount / maxReplicaCount** | Scaling bounds — `minReplicaCount: 0` is what enables scale-to-zero |

### Basic ScaledObject Example
```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: order-consumer-scaler
spec:
  scaleTargetRef:
    name: order-consumer          # the Deployment to scale
  minReplicaCount: 0
  maxReplicaCount: 20
  cooldownPeriod: 60
  pollingInterval: 15
  triggers:
    - type: redis
      metadata:
        address: redis.default.svc:6379
        listName: orders-queue
        listLength: "5"            # target: 5 items per replica
```
With this, KEDA polls the Redis list length every 15s. Zero items -> 0 replicas. 50 items -> roughly 10 replicas (50/5), capped at 20.

---

## 2. Intermediate

### How KEDA Feeds the HPA (Mechanics)
1. You create a `ScaledObject`.
2. KEDA operator creates (and owns) a Kubernetes `HorizontalPodAutoscaler` object behind the scenes — you can `kubectl get hpa` and see it, named `keda-hpa-<scaledobject-name>`.
3. That HPA's metric source is `external.metrics.k8s.io`, backed by the KEDA metrics adapter, which computes the current value from your trigger (e.g., current Redis list length / target length).
4. When replicas should be 0, KEDA operator bypasses the HPA entirely and scales the Deployment to 0 directly (HPA refuses to go below 1) — then watches the source itself until an event reappears, at which point it scales to 1 and hands control back to the HPA.

### ScaledObject vs ScaledJob
| | ScaledObject | ScaledJob |
|---|---|---|
| Scales | An existing `Deployment`/`StatefulSet` | Creates Kubernetes `Job` objects |
| Scaling model | Replica count goes up/down on one workload | One Job per unit of work (e.g., one Job per N queue messages) |
| Best for | Long-running consumers (HTTP servers, stream processors) | Batch/one-shot work items, each needing isolated completion semantics |
| Completion | Pods keep running, consuming continuously | Each Job runs to completion then exits |
| Concurrency control | `maxReplicaCount` | `maxReplicaCount` (max concurrent Jobs) + `scalingStrategy` (default/custom/accurate) |

Example `ScaledJob` (one Job per batch of SQS messages):
```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledJob
metadata:
  name: sqs-batch-processor
spec:
  jobTargetRef:
    template:
      spec:
        containers:
          - name: worker
            image: myrepo/sqs-worker:latest
        restartPolicy: Never
  minReplicaCount: 0
  maxReplicaCount: 50
  pollingInterval: 30
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  triggers:
    - type: aws-sqs-queue
      metadata:
        queueURL: https://sqs.us-east-1.amazonaws.com/123456789/my-queue
        queueLength: "5"
        awsRegion: us-east-1
      authenticationRef:
        name: keda-trigger-auth-aws
```

### Multiple Triggers on One ScaledObject
A ScaledObject can have several triggers — KEDA scales to satisfy whichever trigger demands the most replicas:
```yaml
triggers:
  - type: redis
    metadata:
      address: redis.default.svc:6379
      listName: orders-queue
      listLength: "5"
  - type: cron
    metadata:
      timezone: Asia/Kolkata
      start: "0 9 * * 1-5"    # 9am weekdays: warm up minimum capacity
      end: "0 18 * * 1-5"
      desiredReplicas: "3"
```
This is a common pattern: combine a real event-driven trigger with a cron trigger to keep a warm baseline during business hours and let it drop to zero overnight/weekends.

### Authentication (TriggerAuthentication)
Most real scalers need credentials (AWS keys, RabbitMQ connection strings, Prometheus bearer tokens). KEDA keeps these out of the ScaledObject spec via a separate CRD:
```yaml
apiVersion: keda.sh/v1alpha1
kind: TriggerAuthentication
metadata:
  name: keda-trigger-auth-aws
spec:
  secretTargetRef:
    - parameter: awsAccessKeyID
      name: aws-secrets
      key: AWS_ACCESS_KEY_ID
    - parameter: awsSecretAccessKey
      name: aws-secrets
      key: AWS_SECRET_ACCESS_KEY
```
Referenced from a trigger via `authenticationRef.name`. Also supports pod identity (IRSA on EKS, Workload Identity on GKE, AAD Pod Identity on AKS) so you often don't need static secrets at all in cloud environments.

### Scalers Landscape (a sample of 60+)
| Category | Examples |
|---|---|
| Message queues | RabbitMQ, AWS SQS, Azure Service Bus, NATS JetStream, Redis Lists/Streams |
| Streaming | Kafka, AWS Kinesis, Azure Event Hubs, GCP Pub/Sub |
| Metrics-based | Prometheus, Datadog, Graphite, CloudWatch, Azure Monitor, Stackdriver |
| Schedule-based | Cron |
| HTTP | KEDA HTTP Add-on (scale-to-zero for HTTP services, including request-rate scaling) |
| Databases | PostgreSQL, MySQL, MongoDB (row/document counts as scale signal) |

---

## 3. Advanced

### Scale-to-Zero Mechanics and HTTP Workloads
- Plain HTTP services can't naturally scale to zero because there's no metric to poll when the deployment has zero pods (no pods = nothing to measure). The **KEDA HTTP Add-on** solves this with a lightweight interceptor proxy sitting in front of the service: it buffers incoming requests, triggers activation (0 -> 1), and forwards the request once a pod is ready — genuinely useful for internal/low-traffic services that shouldn't burn resources idling.
- For non-HTTP scalers, the source itself (Redis, Kafka, SQS, etc.) exists independently of pod count, so polling at zero replicas is trivial — KEDA operator does the polling, not the workload.

### Cooldown, Polling Interval, and Flapping
- `pollingInterval` (default 30s): frequency of checking the external source. Too aggressive -> load on the source system (e.g., hammering a Prometheus query every 5s); too lax -> slow to react to bursts.
- `cooldownPeriod` (default 300s): time with zero demand before scaling down to `minReplicaCount`. Too short causes flapping (scale down, immediately scale up again) which is expensive for workloads with slow startup (JVM apps, cold-start-heavy containers).
- `stabilizationWindowSeconds` in `advanced.horizontalPodAutoscalerConfig.behavior` gives fine-grained control over scale-up/scale-down rate, exactly like native HPA behavior policies:
```yaml
spec:
  advanced:
    horizontalPodAutoscalerConfig:
      behavior:
        scaleDown:
          stabilizationWindowSeconds: 300
          policies:
            - type: Percent
              value: 50
              periodSeconds: 60
```

### KEDA vs Cluster Autoscaler vs VPA
| Tool | Scales what | Based on |
|---|---|---|
| **KEDA** | Pod replica count | External event sources (queue depth, custom metrics, schedules) |
| **HPA (vanilla)** | Pod replica count | CPU/memory (or custom metrics manually wired) |
| **Cluster Autoscaler** | Number of *nodes* | Unschedulable pods (pending due to resource pressure) |
| **VPA (Vertical Pod Autoscaler)** | Pod resource requests/limits | Historical usage, right-sizing a single pod |
These are complementary layers, commonly run together: KEDA/HPA decide how many pods you need, Cluster Autoscaler makes sure there's node capacity to run them, VPA (less commonly combined with KEDA due to restart-on-resize conflicts) right-sizes each pod.

### Security Considerations
- Prefer workload identity (IRSA/Workload Identity/AAD Pod Identity) over long-lived secrets in `TriggerAuthentication`.
- `TriggerAuthentication` can be namespace-scoped or cluster-scoped (`ClusterTriggerAuthentication`) — use namespace-scoped by default to limit blast radius.
- The KEDA operator itself needs broad RBAC (it creates/manages HPA objects and reads Secrets across referenced namespaces) — review its ClusterRole before granting cluster-admin-adjacent trust in multi-tenant clusters.

### Common Failure Modes / Debugging
| Symptom | Likely cause | Check |
|---|---|---|
| Deployment stuck at 0, never activates | Scaler misconfigured (wrong queue name/address), or auth failing | `kubectl describe scaledobject <name>`, KEDA operator logs |
| HPA shows `<unknown>` for external metric | Metrics adapter can't reach the source, or metrics API not registered | `kubectl get apiservice v1beta1.external.metrics.k8s.io`, operator logs |
| Scales up but never down | Cooldown too long, or trigger metric never returns to zero due to averaging | Check actual source value vs `cooldownPeriod`, verify trigger threshold math |
| Flapping (rapid scale up/down) | Polling interval too short relative to workload startup time, or cooldown too short | Increase `cooldownPeriod`, tune HPA `behavior.scaleDown.stabilizationWindowSeconds` |
| ScaledJob creates too many concurrent Jobs | `maxReplicaCount` too high relative to downstream capacity (DB connections, etc.) | Lower `maxReplicaCount`, set `scalingStrategy: default` with `pendingPodConditions` |

### Integration Notes
- KEDA is commonly paired with **Prometheus** as a generic trigger: scale on literally any PromQL expression (queue lag exported as a custom metric, SLO burn rate, etc.) when no dedicated scaler exists for a system.
- Works well alongside **Argo Rollouts/Flagger** for progressive delivery — KEDA controls replica count, the rollout controller controls traffic shifting, they don't conflict since they operate on different axes.
- In GitOps setups (ArgoCD/Flux), `ScaledObject`/`ScaledJob` are just CRDs — they sync like any other manifest, no special handling needed beyond installing the KEDA CRDs first.

---

## Quick Revision — KEDA
- KEDA extends HPA, it does not replace it — KEDA feeds an `external.metrics.k8s.io` metric to a standard HPA object it creates and owns (`keda-hpa-<name>`).
- Two CRDs: `ScaledObject` (scales a Deployment/StatefulSet, replica count model) and `ScaledJob` (creates Kubernetes Jobs, one-per-work-unit model).
- The one thing vanilla HPA fundamentally cannot do: scale to **zero**. KEDA's operator handles the 0<->1 activation boundary directly, bypassing HPA at the zero edge.
- `TriggerAuthentication`/`ClusterTriggerAuthentication` keep credentials out of ScaledObject specs; prefer workload identity over static secrets.
- 60+ built-in scalers: queues (RabbitMQ, SQS, Service Bus), streams (Kafka, Kinesis, Pub/Sub), metrics (Prometheus, CloudWatch, Datadog), cron, and the HTTP Add-on for scale-to-zero HTTP services.
- Key tuning knobs: `pollingInterval` (how often to check the source), `cooldownPeriod` (how long idle before scaling to zero), `minReplicaCount`/`maxReplicaCount`.
- Complementary to Cluster Autoscaler (scales nodes) and VPA (right-sizes a single pod's resources) — different axes, often run together.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
