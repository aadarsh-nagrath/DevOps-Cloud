# NATS — Complete Notes

## 1. Beginner

### What is NATS?
- A lightweight, high-performance **messaging system** for cloud-native applications, microservices, and IoT, originally built at Apcera, now a CNCF **graduated** project.
- Solves the same broad problem as Kafka or RabbitMQ — decoupled communication between services — but takes a much simpler, faster, "do less but do it extremely well" approach. Single small binary, minimal configuration, sub-millisecond latency for core messaging.
- Overlapping use cases with Kafka, but genuinely different sweet spots (see comparison table below) — the choice isn't "NATS is strictly better/worse," it's "which shape of problem do you have."

### Core Pub/Sub Model — Subject-Based Messaging
Instead of topics/queues you declare upfront, NATS uses lightweight **subjects** — dot-separated strings that publishers send to and subscribers match against, with wildcard support:
```
Publisher sends to:  orders.created
                     orders.updated
                     orders.us.created
                     orders.eu.created

Subscriber patterns:
  orders.created          -> matches only that exact subject
  orders.*                -> matches orders.created, orders.updated (single token wildcard)
  orders.>                -> matches orders.created, orders.us.created, orders.eu.created, ...
                              (matches one or more trailing tokens, i.e. "everything under orders")
```
No admin step required to "create" a subject — publishing to a subject that has no subscribers simply results in the message going nowhere (in Core NATS). This is core to NATS's simplicity: subjects are just strings, not objects you provision.

### Core Architecture
```
                    [nats-server] (single binary, in-memory routing)
                   /      |       \
                  v       v        v
           [Publisher] [Subscriber A] [Subscriber B]

Publish: fire a message at a subject
Subscribe: register interest in a subject (or wildcard pattern)
Server: routes matching messages to all currently-connected subscribers, in memory
```
- The server itself is a single Go binary (`nats-server`), extremely fast to start, minimal resource footprint compared to Kafka's JVM + Zookeeper/KRaft dependency.
- Clustering (multiple `nats-server` nodes) forms a full mesh for HA and horizontal scale — covered in Advanced.

### Core Concepts
| Term | Meaning |
|---|---|
| **Subject** | The routing key for a message — a dot-separated string, e.g. `orders.created` |
| **Wildcard `*`** | Matches exactly one token in a subject, e.g. `orders.*` matches `orders.created` but not `orders.us.created` |
| **Wildcard `>`** | Matches one or more trailing tokens, e.g. `orders.>` matches everything under `orders` |
| **Core NATS** | The base pub/sub layer — at-most-once, fire-and-forget, no persistence, extremely low latency |
| **JetStream** | NATS's built-in persistence layer — adds at-least-once/exactly-once delivery, message replay, durable consumers |
| **Stream** | A JetStream construct that captures and persists messages published to one or more subjects |
| **Consumer** | A JetStream construct that tracks a subscriber's position/progress reading from a Stream — can be durable (survives restarts) or ephemeral |
| **NATS CLI (`nats`)** | The standard command-line tool for publishing, subscribing, and managing streams/consumers |

### Basic Usage Example (Core NATS)
```bash
# Terminal 1 — subscribe
nats sub "orders.created"

# Terminal 2 — publish
nats pub "orders.created" '{"orderId": 123}'
```
If Terminal 1 isn't running when Terminal 2 publishes, the message is simply gone — Core NATS makes no promise of delivery to anyone who wasn't listening at the moment of publish. This fire-and-forget behavior is a deliberate design tradeoff, not a limitation to work around by default — plenty of real use cases (live telemetry, ephemeral status updates, request-reply RPC) genuinely don't need durability, and Core NATS is blazing fast because it doesn't pay for it.

---

## 2. Intermediate

### The Three Usage Patterns

**1. Core NATS — at-most-once, fire-and-forget**
- No persistence. If no subscriber is connected at publish time, the message is lost.
- Extremely fast — this is the mode to reach for when you need low-latency pub/sub or request-reply and don't need a delivery guarantee (e.g., service discovery pings, live dashboards, ephemeral RPC calls).

**2. JetStream — persistence, replay, durable consumers**
- JetStream is NATS's answer to "but I need durability like Kafka." It's built into the same `nats-server` binary (enabled with a flag), not a separate system.
- A **Stream** captures messages published to one or more subjects and persists them (to disk or memory) with configurable retention.
- A **Consumer** reads from a Stream, tracking its own position — durable consumers resume exactly where they left off after a restart, giving at-least-once (or with dedup, effectively exactly-once) delivery.

**3. Key/Value and Object Store — built on JetStream**
- NATS exposes a **KV store** (`nats kv`) and an **Object store** (`nats object`) as higher-level abstractions built directly on top of JetStream streams — useful for simple config/state storage or blob storage without standing up a separate system.

### JetStream Configuration Example
```bash
# Enable JetStream on the server
nats-server -js

# Create a stream that captures everything under "orders.>"
nats stream add ORDERS \
  --subjects "orders.>" \
  --storage file \
  --retention limits \
  --max-msgs=-1 \
  --max-age=24h

# Create a durable consumer on that stream
nats consumer add ORDERS my-durable-consumer \
  --filter "orders.created" \
  --ack explicit \
  --deliver all
```
```yaml
# Conceptual shape of what a Stream config represents
stream: ORDERS
subjects: ["orders.>"]
storage: file          # or memory
retention: limits      # or interest, or workqueue
max_age: 24h
```

### Retention Policies (JetStream Streams)
| Policy | Behavior |
|---|---|
| **Limits** | Retain messages until age/size/count limits are hit, then drop oldest — classic bounded log behavior |
| **Interest** | Retain a message only as long as at least one consumer still needs it — auto-cleans once all consumers have acked |
| **WorkQueue** | Each message delivered to exactly one consumer, removed once acked — classic work-distribution queue semantics |

### NATS vs Kafka
| Aspect | NATS (JetStream) | Kafka |
|---|---|---|
| **Ops complexity** | Single small Go binary, minimal config, trivial to run in a sidecar or edge device | JVM-based, historically needed Zookeeper (now KRaft), heavier ops footprint |
| **Latency** | Sub-millisecond for Core NATS, still very fast for JetStream | Higher baseline latency, optimized for throughput over latency |
| **Routing model** | Subject-based, hierarchical, flexible wildcards | Partition-based topics, consumer groups |
| **Ordering guarantees** | Per-subject ordering within a stream | Strong per-partition ordering, well-understood at massive scale |
| **Ecosystem/tooling** | Smaller but growing (Kafka Connect equivalents less mature) | Enormous ecosystem — Connect, ksqlDB, Schema Registry, etc. |
| **Scale ceiling** | Excellent up to large scale; superclusters for multi-region | Proven at the largest scales in the industry, purpose-built for huge sustained throughput |
| **Best fit** | Microservices messaging, IoT/edge, request-reply RPC, simpler event streaming needs | High-throughput event streaming/log aggregation, complex stream processing pipelines, orgs already invested in the Kafka ecosystem |

Neither is strictly "better" — NATS wins on simplicity, latency, and operational footprint; Kafka wins on ecosystem maturity and proven throughput at extreme scale with strong partition-ordering semantics.

### Request-Reply Pattern
NATS has request-reply as a first-class built-in pattern (not bolted on), useful for synchronous RPC-style calls over the same pub/sub infrastructure:
```bash
# Responder
nats reply "greet.hello" "Hello, {{Request}}!"

# Requester
nats request "greet.hello" "World"
# -> "Hello, World!"
```
Under the hood this uses an auto-generated unique inbox subject for the reply — the requester subscribes to a one-off subject, includes it in the request, and the responder publishes the reply there.

---

## 3. Advanced

### Clustering and Superclusters
```
Single cluster (one region):
  [nats-1] <-> [nats-2] <-> [nats-3]     (full mesh, route protocol)

Supercluster (multi-region):
  Cluster A (us-east)  <--gateway-->  Cluster B (eu-west)
  [n1][n2][n3]                          [n1][n2][n3]
```
- A **cluster** is a set of `nats-server` nodes that form a full mesh and share routing state — clients can connect to any node and reach subscribers on any other node.
- A **supercluster** connects multiple clusters (typically one per region) via **gateway connections** — messages route across regions only when there's actual cross-region interest, avoiding unnecessary WAN traffic.
- JetStream replicates stream data across cluster nodes (R1/R3/R5 replica factor, similar in spirit to Raft-based replication) for durability and failover within a cluster.

### Security
- **Accounts**: top-level isolation boundary — separate tenants get separate accounts with fully isolated subject namespaces, similar in spirit to Kafka's multi-tenancy via ACLs but built in from the ground up.
- **NKeys**: Ed25519-based public-key identity for servers, accounts, and users — no shared-secret password infrastructure needed.
- **Decentralized JWT-based auth**: accounts and users can be authorized via signed JWTs that the server validates without a central database lookup — fits well with NATS's operator-run, multi-tenant deployment model (the "NATS operator" here means an authority that signs account JWTs, not a Kubernetes Operator).
- **TLS**: standard transport encryption between clients and servers, and between cluster nodes.

### Performance Tuning
- **Storage type** (`file` vs `memory`) on a JetStream stream is the main lever — memory storage is faster but doesn't survive a server restart; file storage is durable but has more I/O overhead.
- **Replica factor** (R1 vs R3) trades write latency for durability — R3 requires quorum ack across replicas before confirming a write.
- **Max ack pending / flow control** on consumers prevents a slow consumer from causing unbounded memory growth on the server.
- **Subject design** matters for routing efficiency — deep wildcard hierarchies (`orders.>`) are cheap to match; extremely high-cardinality subject spaces (e.g., one subject per user ID) are still fine at NATS's scale but worth being deliberate about for observability/debugging.

### Integration with the CNCF Ecosystem
- **Kubernetes**: the NATS Helm chart / NATS Operator deploys clustered NATS with JetStream persistence backed by PersistentVolumes.
- **Service mesh adjacency**: NATS is sometimes used as an alternative to sidecar-based service mesh communication for event-driven microservices patterns, particularly at the edge/IoT tier where a full mesh sidecar is too heavy.
- **KEDA**: can scale Kubernetes workloads based on JetStream consumer lag, similar to how it scales on Kafka consumer lag.

### Common Failure Modes
| Symptom | Likely cause |
|---|---|
| Published messages silently disappearing | Using Core NATS with no subscriber connected — expected behavior, not a bug; switch to JetStream if you need durability |
| JetStream stream filling disk | No `max_age`/`max_bytes`/`max_msgs` limit set, or retention policy mismatched to the actual consumption pattern |
| Slow consumer causing server memory growth | No flow control / `max_ack_pending` configured on the consumer |
| Cross-region messages not arriving in a supercluster | Gateway connection down, or no actual subscriber interest on the remote cluster (gateways only forward on-demand) |

---

## Quick Revision — NATS
- Lightweight, high-performance messaging, CNCF graduated, single small Go binary.
- Subject-based routing: `*` matches one token, `>` matches one-or-more trailing tokens.
- Core NATS = at-most-once, fire-and-forget, no persistence, extremely low latency.
- JetStream = built-in persistence layer on the same binary — Streams capture messages, Consumers (durable or ephemeral) track read position, giving at-least-once/exactly-once delivery and replay.
- KV store and Object store are built directly on top of JetStream streams.
- Retention policies: Limits (age/size/count bound), Interest (keep while a consumer needs it), WorkQueue (one consumer per message).
- vs Kafka: NATS wins on simplicity/latency/ops footprint; Kafka wins on ecosystem maturity and proven massive-scale partitioned throughput.
- Clustering = full mesh within a region; superclusters = gateway-connected clusters across regions, routing only on actual interest.
- Security: Accounts (tenant isolation), NKeys (Ed25519 identity), decentralized JWT auth, TLS.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
