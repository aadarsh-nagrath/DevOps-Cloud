# Chaos Engineering Tools

The tool landscape — from the original simple instance-killer to Kubernetes-native CRD-based fault injection to commercial SaaS platforms — with worked examples and a decision guide.

---

## 1. Tool Comparison

| Tool | Type | Scope | Blast-radius controls | Safety mechanism | Best for |
|---|---|---|---|---|---|
| **Chaos Monkey** | Open source (Netflix) | AWS/cloud instance termination | Coarse — targets an Auto Scaling Group | Business-hours-only scheduling | Simple, continuous instance-kill testing |
| **Chaos Mesh** | Open source (CNCF) | Kubernetes-native (pod/network/IO/kernel) | Fine-grained via CRD selectors, percentage | Experiment duration, manual/scheduled workflows | Kubernetes environments wanting deep fault variety |
| **LitmusChaos** | Open source (CNCF) | Kubernetes-native | Fine-grained via CRD, "probes" for automated validation | Built-in health-check probes can auto-abort | Kubernetes environments wanting a pre-built experiment marketplace |
| **Gremlin** | Commercial SaaS | Hosts, containers, Kubernetes | Fine-grained UI-driven blast radius controls | "Halt all" kill switch, automatic experiment expiry | Teams wanting a managed platform with strong safety guarantees and no tooling to maintain |
| **AWS FIS** | Managed cloud service | AWS resources (EC2, ECS, EKS, RDS, etc.) | IAM-scoped, resource-tag-targeted | Stop conditions tied to CloudWatch alarms | AWS-native infrastructure wanting managed fault injection without new tooling |

---

## 2. Chaos Monkey

The original. Simple by design: it randomly terminates instances within an Auto Scaling Group, during a configured time window (traditionally business hours, so engineers are around to observe/respond).

```yaml
# chaos-monkey.yml — Spring Boot Chaos Monkey config example (a popular modern implementation
# for JVM apps, distinct from but inspired by Netflix's original)
chaos:
  monkey:
    enabled: true
    assaults:
      level: 5                    # roughly 1-in-5 chance of an assault per watched method call
      latencyRangeStart: 1000     # inject 1-5s latency
      latencyRangeEnd: 5000
      latencyActive: true
      killApplicationActive: false  # start conservative: latency only, no actual termination
    watcher:
      controller: true
      service: true
      repository: true
```

Chaos Monkey's value is its simplicity — it doesn't try to model every fault type, it just answers one question repeatedly: **does the system tolerate losing an instance it's currently relying on?** For anything more granular (specific network conditions, specific pod-level faults), you need one of the tools below.

---

## 3. Chaos Mesh (CNCF, Kubernetes-native)

A CNCF project that defines chaos experiments as Kubernetes Custom Resources (CRDs) — `PodChaos`, `NetworkChaos`, `IOChaos`, `StressChaos`, `KernelChaos`, `TimeChaos`, and more. Because it's CRD-based, experiments are declarative, version-controllable YAML, applied with `kubectl` exactly like any other Kubernetes object.

### Worked example: `PodChaos` — kill a pod

```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: kill-checkout-pod
  namespace: chaos-testing
spec:
  action: pod-kill              # also supports pod-failure, container-kill
  mode: one                     # affect exactly one matching pod (also: all, fixed, fixed-percent, random-max-percent)
  selector:
    namespaces:
      - default
    labelSelectors:
      app: checkout-service     # only target pods with this label — the blast-radius control
  scheduler:
    cron: "@every 10m"          # optional: run this experiment automatically every 10 minutes
```

### Worked example: `NetworkChaos` — inject latency

```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: checkout-to-payment-latency
  namespace: chaos-testing
spec:
  action: delay
  mode: all
  selector:
    namespaces:
      - default
    labelSelectors:
      app: checkout-service     # inject latency on traffic FROM pods with this label
  delay:
    latency: "500ms"
    jitter: "100ms"
    correlation: "25"
  duration: "5m"                 # auto-revert after 5 minutes — a built-in blast-radius/time control
  direction: to
  target:
    selector:
      namespaces:
        - default
      labelSelectors:
        app: payment-service     # ...specifically targeting calls TO this service
    mode: all
```

Because these are just Kubernetes resources, `kubectl delete -f` immediately reverts the experiment — no separate "undo" tooling required, and `duration` gives you an automatic time-boxed revert even if nobody manually intervenes.

---

## 4. LitmusChaos (CNCF, Kubernetes-native)

Another CNCF Kubernetes-native chaos tool, differentiated by its **ChaosHub** — a curated marketplace of pre-built, reusable experiments (pod-delete, disk-fill, network-latency, node-drain, and many more) that you install and configure rather than write from scratch. Experiments are run via a `ChaosEngine` CR that references a `ChaosExperiment`.

### Worked example: pod-delete experiment

```yaml
apiVersion: litmuschaos.io/v1alpha1
kind: ChaosEngine
metadata:
  name: checkout-pod-delete
  namespace: default
spec:
  appinfo:
    appns: default
    applabel: "app=checkout-service"   # the blast-radius target
    appkind: deployment
  engineState: active
  chaosServiceAccount: litmus-admin
  experiments:
    - name: pod-delete                  # pulled from the ChaosHub marketplace
      spec:
        components:
          env:
            - name: TOTAL_CHAOS_DURATION
              value: "60"                # experiment runs for 60s
            - name: CHAOS_INTERVAL
              value: "10"                 # kill a pod every 10s within that window
            - name: FORCE
              value: "false"               # graceful delete, not SIGKILL
        probe:
          - name: checkout-latency-check   # LitmusChaos "probes" auto-validate steady state DURING the run
            type: httpProbe
            mode: Continuous
            httpProbe/inputs:
              url: "http://checkout-service/healthz"
              method:
                get:
                  criteria: ==
                  responseCode: "200"
            runProperties:
              probeTimeout: 5
              interval: 5
              retry: 1
```

The `probe` block is LitmusChaos's distinguishing feature relative to Chaos Mesh — it can automatically validate a steady-state hypothesis (in this case, an HTTP healthz check) *during* the experiment and mark the run as failed if the probe fails, giving you built-in hypothesis validation rather than needing to watch a dashboard manually.

---

## 5. Gremlin (commercial SaaS)

A managed, commercial chaos engineering platform, distinguished by strong built-in safety tooling and no infrastructure to run yourself (an agent is installed on hosts/containers, orchestration happens through Gremlin's UI/API).

Key abstractions:
- **Attack**: Gremlin's term for a single fault-injection action (resource attack, state attack, network attack) — conceptually the same as a Chaos Mesh experiment CR, but configured through a UI/API rather than a CRD.
- **Blast radius controls**: built into the attack-creation flow itself — you explicitly choose targets (specific hosts, a percentage of a container group, specific Kubernetes labels) before an attack can even be launched.
- **Halt-all safety mechanism**: a single button/API call that immediately stops every active attack across the entire organization — the safety net for "something's going wrong and we're not sure which experiment caused it."

```bash
# Example: Gremlin CLI shape (illustrative) — a CPU attack scoped to a specific container label,
# for a bounded duration
gremlin attack-container \
  --length 60 \
  --target-type Exact \
  --target-tags "service=checkout" \
  cpu --cores 2
```

Gremlin's value proposition is largely operational, not technical: teams that don't want to build/maintain chaos tooling and want strong guardrails (halt-all, RBAC on who can run attacks, guided experiment templates) pay for that instead of assembling it from open-source parts.

---

## 6. AWS Fault Injection Simulator (FIS)

A fully managed AWS service for injecting faults directly into AWS resources — EC2 instances, ECS/EKS tasks, RDS, EBS volumes, and more — without needing to install any agent inside the workload itself for most action types.

### Worked example: experiment template

```json
{
  "description": "Terminate a random EC2 instance in the checkout ASG",
  "targets": {
    "checkout-instances": {
      "resourceType": "aws:ec2:instance",
      "resourceTags": { "Service": "checkout" },
      "selectionMode": "PERCENT(25)"
    }
  },
  "actions": {
    "terminate-instances": {
      "actionId": "aws:ec2:terminate-instances",
      "targets": { "Instances": "checkout-instances" }
    }
  },
  "stopConditions": [
    {
      "source": "aws:cloudwatch:alarm",
      "value": "arn:aws:cloudwatch:us-east-1:123456789012:alarm:checkout-error-rate-high"
    }
  ],
  "roleArn": "arn:aws:iam::123456789012:role/fis-experiment-role"
}
```
```bash
aws fis start-experiment --experiment-template-id EXT12345678901234
```

The `stopConditions` block is FIS's built-in abort mechanism — bind it to an existing CloudWatch alarm (e.g., checkout error rate exceeding a threshold) and FIS automatically halts the experiment the moment that alarm fires, without needing a human to be watching a dashboard and clicking stop in time. This is the same abort-condition discipline from [designing-chaos-experiments.md](designing-chaos-experiments.md), enforced natively by the platform.

---

## 7. Decision Guide

**Simple open-source tool vs managed/commercial:**
- Choose a simple OSS tool (Chaos Monkey, or hand-rolled scripts) if you only need basic instance-kill testing and don't need fine-grained blast-radius UI controls or organizational safety tooling.
- Choose a commercial platform (Gremlin) if you want strong built-in safety guardrails (halt-all, RBAC, audit trail) and don't want to build/maintain that tooling yourself — especially valuable in a larger org where many teams will run experiments and you need consistent guardrails across all of them.

**Kubernetes-native vs infrastructure-level:**
- Choose Chaos Mesh or LitmusChaos if your workloads run on Kubernetes and you want experiments to live as version-controlled YAML alongside the rest of your manifests, with fine-grained pod/network/IO-level fault types.
- Choose AWS FIS (or the equivalent for your cloud provider) if the failure you're testing is at the infrastructure layer itself (an EC2 instance, an RDS replica, an AZ) rather than something expressible purely in terms of Kubernetes resources — FIS can also target EKS node groups, so the two aren't mutually exclusive.

**Chaos Mesh vs LitmusChaos specifically** (both are CNCF, both Kubernetes-native, both CRD-based):
- Chaos Mesh has a slightly broader native fault-type catalog (including kernel-level and time-skew faults) and a strong web dashboard for visual experiment design.
- LitmusChaos's ChaosHub marketplace and built-in `probe` validation are the differentiators if you want pre-built, reusable experiments with automated hypothesis checking rather than assembling and validating everything yourself.

In practice, many organizations end up using a managed cloud-level tool (AWS FIS) for infrastructure-layer faults and a Kubernetes-native tool (Chaos Mesh/LitmusChaos) for pod/network-layer faults — they're complementary, not competing, because they operate at different layers of the stack.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
