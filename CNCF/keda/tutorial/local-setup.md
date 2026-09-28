# KEDA — Learn It Locally

Goal: install KEDA on a local Kubernetes cluster, deploy a Redis-backed worker, create a `ScaledObject` that scales on queue depth, and watch pods scale from zero up to several replicas and back to zero — in about 25 minutes.

## Prerequisites
- Docker installed and running.
- `kind` and `kubectl` installed.
- `helm` installed (KEDA is installed via its Helm chart).

---

## Step 1 — Create a kind Cluster

```bash
kind create cluster --name keda-lab
kubectl cluster-info --context kind-keda-lab
```

---

## Step 2 — Install KEDA via Helm

```bash
helm repo add kedacore https://kedacore.github.io/charts
helm repo update

kubectl create namespace keda

helm install keda kedacore/keda --namespace keda
```

Verify the operator and metrics adapter are running:
```bash
kubectl get pods -n keda
# expect: keda-operator-*, keda-operator-metrics-apiserver-*, keda-admission-webhooks-*
```

Confirm the external metrics API is registered:
```bash
kubectl get apiservice v1beta1.external.metrics.k8s.io
```

---

## Step 3 — Deploy Redis

```bash
kubectl create namespace demo

cat <<EOF | kubectl apply -n demo -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
spec:
  replicas: 1
  selector:
    matchLabels: { app: redis }
  template:
    metadata:
      labels: { app: redis }
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379
---
apiVersion: v1
kind: Service
metadata:
  name: redis
spec:
  selector: { app: redis }
  ports:
    - port: 6379
      targetPort: 6379
EOF

kubectl -n demo get pods -w
```
Wait until the redis pod is `Running`, then `Ctrl+C`.

---

## Step 4 — Deploy the Worker (the thing KEDA will scale)

This worker pops items off a Redis list called `job-queue` and sleeps briefly to simulate work — using `redis:7-alpine`'s own `redis-cli` in a loop so no custom image build is needed.

```bash
cat <<EOF | kubectl apply -n demo -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: queue-worker
spec:
  replicas: 1
  selector:
    matchLabels: { app: queue-worker }
  template:
    metadata:
      labels: { app: queue-worker }
    spec:
      containers:
        - name: worker
          image: redis:7-alpine
          command:
            - sh
            - -c
            - |
              while true; do
                item=\$(redis-cli -h redis BLPOP job-queue 5 | tail -n 1)
                if [ -n "\$item" ]; then
                  echo "processing: \$item"
                  sleep 3
                fi
              done
EOF

kubectl -n demo get pods
```

---

## Step 5 — Create the ScaledObject

```bash
cat <<EOF | kubectl apply -n demo -f -
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: queue-worker-scaler
spec:
  scaleTargetRef:
    name: queue-worker
  minReplicaCount: 0
  maxReplicaCount: 10
  cooldownPeriod: 30
  pollingInterval: 5
  triggers:
    - type: redis
      metadata:
        address: redis.demo.svc:6379
        listName: job-queue
        listLength: "3"
EOF

kubectl -n demo get scaledobject
```
Within ~30 seconds (the `cooldownPeriod`), since the queue is currently empty, watch the worker scale to zero:
```bash
kubectl -n demo get pods -w
```
You should see `queue-worker` go from 1 replica down to 0 — this is the scale-to-zero behavior plain HPA cannot do on its own. Confirm the HPA KEDA created behind the scenes:
```bash
kubectl -n demo get hpa
# keda-hpa-queue-worker-scaler
```

---

## Step 6 — Push Work Into the Queue and Watch It Scale Up

Open a second terminal and keep `kubectl -n demo get pods -w` running. In the first terminal, push 30 items into the Redis list:

```bash
kubectl -n demo run redis-cli --rm -it --restart=Never --image=redis:7-alpine -- \
  sh -c 'for i in $(seq 1 30); do redis-cli -h redis RPUSH job-queue "item-$i"; done'
```

Watch the second terminal: within one `pollingInterval` (5s), KEDA activates the deployment from 0 to 1, then the HPA takes over and scales further based on `listLength: "3"` (roughly `queue length / 3` replicas, capped at `maxReplicaCount: 10`). With 30 items you should see it climb toward 10 replicas.

Check the live metric value KEDA is feeding the HPA:
```bash
kubectl -n demo describe hpa keda-hpa-queue-worker-scaler
```

---

## Step 7 — Watch It Drain and Scale Back to Zero

Each worker pod pops one item and sleeps 3s, so the queue drains over roughly a minute. Keep watching:
```bash
kubectl -n demo get pods -w
```
Check the remaining queue depth at any point:
```bash
kubectl -n demo run redis-cli --rm -it --restart=Never --image=redis:7-alpine -- \
  redis-cli -h redis LLEN job-queue
```
Once the list is empty and `cooldownPeriod` (30s) elapses with no new items, replicas drop back to 0.

---

## Step 8 — Try a ScaledJob Instead (Optional)

To see the Job-per-work-unit model instead of the Deployment-replica model, delete the ScaledObject/Deployment approach and try a ScaledJob:
```bash
kubectl -n demo delete scaledobject queue-worker-scaler
kubectl -n demo delete deployment queue-worker

cat <<EOF | kubectl apply -n demo -f -
apiVersion: keda.sh/v1alpha1
kind: ScaledJob
metadata:
  name: queue-scaledjob
spec:
  jobTargetRef:
    template:
      spec:
        containers:
          - name: worker
            image: redis:7-alpine
            command:
              - sh
              - -c
              - |
                item=\$(redis-cli -h redis LPOP job-queue)
                echo "processed: \$item"
                sleep 2
        restartPolicy: Never
  minReplicaCount: 0
  maxReplicaCount: 10
  pollingInterval: 5
  successfulJobsHistoryLimit: 3
  triggers:
    - type: redis
      metadata:
        address: redis.demo.svc:6379
        listName: job-queue
        listLength: "1"
EOF

kubectl -n demo run redis-cli --rm -it --restart=Never --image=redis:7-alpine -- \
  sh -c 'for i in $(seq 1 10); do redis-cli -h redis RPUSH job-queue "job-$i"; done'

kubectl -n demo get jobs -w
```
Notice each queue item produces its own `Job` object (visible via `kubectl -n demo get jobs`) rather than a shared Deployment's replica count changing — this is the structural difference from a ScaledObject.

---

## Cleanup
```bash
kind delete cluster --name keda-lab
```

## What to Explore Next
- Add a second trigger (a `cron` trigger alongside the `redis` one) to keep `minReplicaCount` at 1 during a defined time window and 0 outside it.
- Swap the Redis scaler for the `prometheus` scaler and scale on a PromQL expression instead of a native queue integration.
- Try the `advanced.horizontalPodAutoscalerConfig.behavior` block to slow down scale-down and observe how it changes flapping behavior under bursty queue traffic.
- Install the KEDA HTTP Add-on and scale an HTTP service to zero based on request rate instead of a queue.
