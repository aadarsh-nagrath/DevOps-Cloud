# Vitess — Complete Notes

## 1. Beginner

### What is Vitess?
- Open-source **database clustering system for horizontal scaling of MySQL**, originally built at YouTube (2010) to keep MySQL alive under YouTube's write/read volume, donated to CNCF in 2018, **graduated** in 2019.
- Vitess is not a new database engine — it sits **on top of vanilla MySQL** and adds sharding, connection pooling, query routing, and topology management, without requiring the application to implement sharding logic itself.
- Speaks the **MySQL wire protocol**, so existing MySQL clients, ORMs, and drivers connect to Vitess exactly as they would to a single MySQL server.

### The Core Problem It Solves
A single MySQL instance scales vertically — bigger box, more RAM, faster disk — until it can't anymore. Read replicas help with read scaling, but writes are still bottlenecked on one primary.

```
Before (vanilla MySQL):
  App --------------> [MySQL Primary] (all writes, vertical scaling limit)
                            |
                       [Replica] [Replica]  (reads only)

After (Vitess):
  App --> [VTGate] --routes query--> [Shard 0: MySQL Primary + Replicas]
                    --routes query--> [Shard 1: MySQL Primary + Replicas]
                    --routes query--> [Shard 2: MySQL Primary + Replicas]
```
The app still writes plain SQL against what looks like one logical database. Vitess decides, per query, which shard(s) the data lives on and routes accordingly. The sharding logic that teams historically hand-rolled in application code (hash the user ID, pick a shard, maintain a shard map) moves into Vitess.

### Core Architecture
```
                        +------------------+
   MySQL client / ORM   |                  |
   (standard MySQL      |      VTGate      |  <-- stateless query router/proxy
    protocol)  -------->|                  |      the app connects HERE
                        +------------------+
                                 |
              +------------------+------------------+
              |                  |                  |
        +-----------+      +-----------+      +-----------+
        |  VTTablet  |      |  VTTablet  |      |  VTTablet  |
        | (shard 0)  |      | (shard 1)  |      | (shard 2)  |
        +-----------+      +-----------+      +-----------+
              |                  |                  |
        +-----------+      +-----------+      +-----------+
        |   MySQL    |      |   MySQL    |      |   MySQL    |
        | (primary + |      | (primary + |      | (primary + |
        |  replicas) |      |  replicas) |      |  replicas) |
        +-----------+      +-----------+      +-----------+

                    +------------------------+
                    |   Topology Service     |  (etcd, ZooKeeper, or Consul)
                    |   cluster metadata:    |
                    |   which shard is where,|
                    |   who's primary, etc.  |
                    +------------------------+
```

### Core Concepts
| Term | Meaning |
|---|---|
| **VTGate** | Stateless proxy/router the application connects to via the MySQL protocol. Parses queries, figures out which shard(s) to hit, scatters/gathers results, and returns a single response as if talking to one MySQL server |
| **VTTablet** | A process running alongside every MySQL instance (one per mysqld). Manages that instance: query rewriting/validation, connection pooling, enforces row-count limits, handles replication topology, exposes health checks |
| **Keyspace** | A logical database in Vitess — can be unsharded (one keyspace = one MySQL schema) or sharded across many MySQL instances |
| **Shard** | A horizontal partition of a keyspace's data — each shard is its own MySQL primary + replica set, serving a range of the keyspace's data |
| **Vindex** | "Vitess Index" — a function that maps a column value (e.g., `user_id`) to the shard that row belongs on. The core mechanism that makes sharding transparent to the app |
| **Topology Service** | External coordination store (etcd is the common choice — same tool used for Kubernetes' own control plane) holding cluster metadata: shard map, which tablet is primary, keyspace schema |
| **Tablet Type** | Role of a given VTTablet's MySQL instance: `PRIMARY`, `REPLICA`, `RDONLY` (read-only, for analytics/batch reads) |

### Basic Usage Example
Once connected through VTGate, applications write ordinary SQL:
```sql
-- looks identical to talking to a single MySQL instance
SELECT * FROM users WHERE user_id = 42;

INSERT INTO orders (order_id, user_id, total) VALUES (9001, 42, 59.99);
```
Behind the scenes, VTGate uses the Vindex on `user_id` to compute which shard row `42` lives on, and sends the query only to that shard's VTTablet — the app never specifies a shard.

---

## 2. Intermediate

### Keyspaces and VSchema
Every sharded keyspace needs a **VSchema** (Vitess Schema) declaring its tables, primary vindexes, and sharding key:
```json
{
  "sharded": true,
  "vindexes": {
    "hash": {
      "type": "hash"
    }
  },
  "tables": {
    "users": {
      "column_vindexes": [
        {
          "column": "user_id",
          "name": "hash"
        }
      ]
    },
    "orders": {
      "column_vindexes": [
        {
          "column": "user_id",
          "name": "hash"
        }
      ]
    }
  }
}
```
- `orders` is also keyed on `user_id` (not `order_id`) so that a user's orders land on the *same* shard as the user row — this is deliberate co-location to avoid cross-shard joins for the common query pattern "get this user's orders."

### Vindex Types
| Vindex Type | Behavior | Use Case |
|---|---|---|
| **hash** | Hashes the column value, evenly distributes across shards | Default choice, good uniform distribution, no range queries |
| **consistent_lookup / lookup** | External lookup table mapping a secondary column (e.g., `email`) to the primary shard key | Query by a non-sharding column while keeping data co-located by the real shard key |
| **numeric** | Direct numeric range-to-shard mapping | When you want ordered/range-friendly sharding |
| **binary / unicode_loose_md5** | String-oriented hashing variants | Sharding on string columns (usernames, UUIDs as strings) |

### Applying a VSchema and Creating a Sharded Keyspace
```bash
vtctldclient ApplyVSchema --vschema-file=vschema.json commerce

vtctldclient CreateShard commerce/-80
vtctldclient CreateShard commerce/80-
```
- `-80` and `80-` are **keyrange-based shard names**: `-80` covers hash values `0x00` to `0x80`, `80-` covers `0x80` to `0xFF`. This keyrange notation is how Vitess names shards without a central shard-ID counter.

### Resharding Without Downtime
Vitess's signature operational feature: splitting or merging shards live, with the app staying online throughout.
```
Before:              After split:
  [Shard -80]    -->    [Shard -40]  [Shard 40-80]
  (getting hot)          (half the data each)
```
Workflow (`VReplication`-based, via `vtctldclient`):
```bash
vtctldclient Reshard create --workflow=split_commerce \
  --target-keyspace=commerce \
  --source-shards='-80' --target-shards='-40,40-80'

vtctldclient Reshard status --workflow=split_commerce --target-keyspace=commerce

vtctldclient Reshard switchtraffic --workflow=split_commerce --target-keyspace=commerce

vtctldclient Reshard complete --workflow=split_commerce --target-keyspace=commerce
```
- Vitess copies data to new shards, keeps them continuously in sync via **VReplication** (a change-stream-based replication mechanism), then does an online traffic cutover once caught up. This is the same underlying mechanism used for online schema changes and materialized views.

### Transactions and Cross-Shard Queries
| Query Shape | How Vitess Handles It |
|---|---|
| Single-shard query (has the sharding key in `WHERE`) | Routed directly to one shard — fast path, same cost as vanilla MySQL |
| Scatter query (no sharding key, e.g. `SELECT * FROM users WHERE name = 'x'`) | VTGate fans out to *all* shards, merges results — works but expensive, avoid at scale |
| Cross-shard JOIN | VTGate can do it, but it's a scatter-and-merge under the hood — design schemas (via co-located vindexes) to avoid needing this on hot paths |
| Cross-shard transaction | Supported via 2PC (two-phase commit) mode, but adds latency — best-effort/atomic-commit tradeoffs are configurable |

---

## 3. Advanced

### When Vitess Makes Sense (and When It's Overkill)
| Signal | Verdict |
|---|---|
| Single MySQL primary handles your write load fine, even with headroom | Don't use Vitess — plain MySQL + read replicas is simpler and sufficient |
| You've maxed out vertical scaling on the primary and reads/writes still growing | Vitess is a legitimate fit |
| You need online schema migrations on huge tables without long locks | Vitess (via `vtctldclient ApplySchema` + VReplication-based migrations) helps even before full sharding is needed |
| Team has no dedicated database/infra ops capacity | Think twice — Vitess adds real operational surface area: VTGate, VTTablet, topology service, VReplication workflows all need to be run and understood |
| You need this because "we might scale like YouTube someday" | Overkill — most teams never hit the ceiling that justifies this complexity |

Vitess is a horizontal-scaling tool for a specific, real bottleneck. It is not a default choice for "using MySQL in Kubernetes."

### Topology Service Choice
- **etcd** is the most common topology backend in modern Vitess deployments — same distributed KV store used for Kubernetes' own control plane, which makes it a natural fit when running Vitess on Kubernetes (the [Vitess Operator](https://github.com/planetscale/vitess-operator) manages this wiring).
- Stores: keyspace/shard graph, tablet records (host, port, type, health), serving graph (which tablet serves which shard/type right now).
- If the topology service is down, existing connections keep working off cached state in VTGate, but topology changes (failovers, resharding) stall — treat it with the same seriousness as etcd for a Kubernetes control plane.

### Query Routing and the VTGate Planner
- VTGate parses incoming SQL and builds a query plan: single-shard route, scatter route, or a more complex plan involving in-memory joins/aggregation across shard results.
- Plans are cached per query shape so repeated queries (the common case for OLTP traffic) don't re-pay planning cost.
- `EXPLAIN` in Vitess shows the *routing* plan (which shards, what strategy) in addition to normal MySQL query-plan info — essential for diagnosing an accidental scatter query that should have been a single-shard route.

### High Availability and Failover
- Each shard's MySQL primary can fail; Vitess handles primary failover via `vtctldclient PlannedReparentShard` (planned) or `EmergencyReparentShard` (unplanned), promoting a replica and updating the topology service so VTGate routes to the new primary within seconds.
- VTOrchestrator (formerly `vtorc`) can run continuously to detect and automate failover instead of requiring manual intervention.

### Backups and Point-in-Time Recovery
- Vitess has built-in backup orchestration per tablet (`vtctldclient BackupShard`), storing to pluggable backends (S3, GCS, local filesystem).
- Restoring a new replica: bring up a VTTablet pointed at an empty MySQL, it can auto-restore from the latest backup and catch up via replication — this is how Vitess quickly adds capacity to an existing shard.

### Security
- VTGate supports TLS between client and VTGate, and mTLS between VTGate and VTTablet.
- ACLs can restrict which users/tables/query patterns are allowed at the VTGate layer, independent of MySQL's own grants.
- Query rewriting at VTTablet also enforces row-count and execution-time limits, protecting shards from runaway queries originating from any client.

### Common Failure Modes
| Symptom | Likely Cause |
|---|---|
| One query is slow across the board | Scatter query hitting all shards instead of a single-shard route — check the vindex on the `WHERE` column |
| Resharding stuck at "copying" for a long time | Large tables + insufficient replication/copy throughput — check VReplication lag metrics |
| VTGate errors right after a failover | Topology service propagation delay — normal for a few seconds, investigate if sustained |
| Hot shard despite hash vindex | Uneven access pattern (a few `user_id`s get disproportionate traffic) — hash vindex balances *storage*, not necessarily *access* — may need a different sharding key |

### Ecosystem Tie-Ins
- Runs naturally on Kubernetes via the Vitess Operator, using etcd for topology (see [etcd notes](../etcd/etcd.md) if present in this repo) — a good example of one CNCF project (etcd) becoming a load-bearing dependency of another (Vitess).
- PlanetScale (a hosted database company) is built directly on Vitess, and is the primary corporate sponsor/maintainer today.

---

## Quick Revision — Vitess
- MySQL clustering system for horizontal scaling — sits on top of vanilla MySQL, speaks the MySQL protocol, app doesn't need to know about shards.
- Architecture: App → **VTGate** (stateless router) → **VTTablet** (one per MySQL instance, manages it) → MySQL (primary + replicas) per shard. **Topology service** (usually etcd) holds cluster metadata.
- **Keyspace** = logical database, can be sharded or unsharded. **Shard** = horizontal partition, its own MySQL primary+replicas.
- **Vindex** determines which shard a row lives on given a column value — `hash` for uniform distribution, `lookup` for querying by a non-sharding-key column.
- Co-locate related tables (e.g., `orders` keyed by `user_id` not `order_id`) to avoid cross-shard joins.
- **Resharding** happens online via **VReplication** — copy, sync, cutover, no downtime.
- Scatter queries (no sharding key in WHERE) fan out to every shard — expensive, avoid on hot paths.
- Only adopt Vitess at real horizontal MySQL scale — it adds genuine operational complexity and is not a default Kubernetes-MySQL choice.

---

[Github](https://github.com/aadarsh-nagrath) | [Twitter](https://twitter.com/aadarsh_nagrath)
