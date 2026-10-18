# AWS Databases — RDS, Aurora, DynamoDB, ElastiCache, Redshift — Complete Notes

> Part of [AWS hub](./aws.md). Cross-cloud: [Storage & Databases fundamentals](../Fundamentals/02-cloud-storage-and-databases.md).

---

## 1. Amazon RDS (managed relational)
- Engines: **PostgreSQL, MySQL, MariaDB, Oracle, SQL Server, Db2** (+ Aurora as separate engine).
- AWS manages: provisioning, OS/DB patching (maintenance windows), automated backups, monitoring, failover. You manage: schema, queries/indexes, parameter groups, users, sizing, security groups.
- **Why not self-managed DB on EC2?** No undifferentiated ops (backups, patching, replication, failover), built-in HA & PITR, metrics/Performance Insights; trade-off: less OS control, some engine features/extensions unavailable (use **RDS Custom** for Oracle/SQL Server OS access).

### High availability vs scaling
| Feature | Purpose | Replication | Readable? |
|---|---|---|---|
| **Multi-AZ instance deployment** | HA — standby in another AZ, automatic failover (~60–120 s), DNS endpoint flips | **Synchronous** | No (standby only) |
| **Multi-AZ DB cluster** (MySQL/Postgres) | HA + read — writer + 2 readable standbys across 3 AZs, faster failover (~35 s) | Semi-synchronous | Yes |
| **Read replicas** | Read scaling (up to 15), cross-region DR, analytics offload; can be promoted | **Asynchronous** (replica lag) | Yes |

- **Backups**: automated (retention 1–35 days, **PITR** to any second within window via transaction logs) + manual snapshots (kept until deleted; copy cross-region/account). Restore always creates a **new** instance.
- **Storage**: gp3/io2, **storage autoscaling**; Multi-AZ for prod.
- **Security**: private subnets (DB subnet group), SG from app SG only, encryption at rest with KMS (must be set at creation — to encrypt an existing DB: snapshot → copy encrypted → restore), TLS in transit, **IAM database authentication**, Secrets Manager integration (managed master password rotation).
- **RDS Proxy**: connection pooling — essential for Lambda → RDS (avoid connection exhaustion), faster failover.
- **Monitoring**: CloudWatch metrics (CPU, FreeableMemory, DatabaseConnections, ReadIOPS, ReplicaLag, FreeStorageSpace), Enhanced Monitoring (OS), **Performance Insights / Database Insights** (top SQL, waits), slow query logs to CloudWatch Logs.
- **Blue/green deployments** for major version upgrades with minimal downtime.

## 2. Amazon Aurora
- Cloud-native MySQL/PostgreSQL-compatible engine; **storage separated from compute**: 6 copies of data across 3 AZs, self-healing, auto-grows (up to 128 TiB); tolerates loss of 2 copies for writes, 3 for reads.
- **Up to 15 Aurora Replicas** sharing the same storage (low lag, typically < 100 ms); failover to a replica ~30 s. Endpoints: **cluster (writer)**, **reader** (load-balanced), custom, instance.
- **Aurora Serverless v2**: scales capacity (ACUs) in fine increments within seconds; good for variable workloads; can mix with provisioned instances.
- **Aurora Global Database**: one primary region + up to 10 secondary regions (storage-level replication, typically < 1 s lag); managed cross-region switchover/failover — RPO ~seconds, RTO ~1 min.
- **Aurora DSQL**: distributed serverless PostgreSQL-compatible DB with active-active multi-region writes.
- Other: **Backtrack** (MySQL, rewind in place), fast **cloning** (copy-on-write), parallel query, zero-ETL integrations to Redshift, I/O-Optimized pricing for I/O-heavy workloads.
- **RDS vs Aurora**: Aurora = higher performance & availability, faster failover, more replicas, global DB, auto-growing storage; costs ~20% more for small workloads. RDS = more engines, cheaper for small/simple DBs.

## 3. Amazon DynamoDB (serverless NoSQL key-value/document)
- Tables of items; **primary key** = **partition key** (hash) or partition + **sort key**. Item max 400 KB.
- Single-digit-ms performance at any scale; data replicated across 3 AZs.
- **Capacity modes**: **On-demand** (pay per request, instant scaling — default choice for unknown/spiky) vs **Provisioned** (RCU/WCU with auto scaling, reserved capacity — cheaper for steady traffic). 1 RCU = 1 strongly consistent read/s of ≤4 KB (or 2 eventually consistent); 1 WCU = 1 write/s of ≤1 KB.
- **Indexes**: **GSI** (different partition/sort key, own capacity, eventually consistent, create anytime) vs **LSI** (same partition key, different sort key, must be created with table, strongly consistent option, 10 GB per partition key limit).
- **Query** (by key — efficient) vs **Scan** (reads whole table — avoid).
- **Data modeling**: design from access patterns; high-cardinality partition keys to avoid **hot partitions**; single-table design; composite sort keys (`ORDER#2026-10-14`).
- Features: **Streams** (change data capture → Lambda), **TTL** (auto-expire items), **transactions** (ACID across items), **global tables** (multi-region, multi-active), **PITR** (35 days) + on-demand backups, **DAX** (in-memory cache, microsecond reads), conditional writes (optimistic locking), export to S3, zero-ETL to OpenSearch/Redshift.
- **RDS vs DynamoDB**: relational/joins/ad-hoc SQL/complex transactions → RDS/Aurora. Massive scale, known access patterns, key lookups, serverless, unpredictable traffic → DynamoDB.

## 4. Caching: ElastiCache & MemoryDB
- **ElastiCache**: managed **Valkey**, **Redis OSS**, **Memcached**; serverless option. Redis/Valkey: data structures, replication, Multi-AZ auto-failover, cluster mode sharding, persistence, pub/sub. Memcached: simple, multi-threaded, no persistence/replication.
- **MemoryDB**: Redis/Valkey-compatible **durable** primary database (multi-AZ transaction log).
- Patterns: **cache-aside** (lazy loading), write-through, TTLs, session store, leaderboards, rate limiting.

## 5. Analytics & specialty databases
| Service | What |
|---|---|
| **Redshift** | Columnar MPP data warehouse (provisioned RA3 or **Redshift Serverless**), Spectrum queries S3, concurrency scaling, data sharing |
| **Athena** | Serverless SQL on S3 (Presto/Trino), pay per TB scanned — partition + Parquet to cut cost |
| **DocumentDB** | MongoDB-compatible document DB |
| **Neptune** | Graph DB (Gremlin, openCypher, SPARQL) |
| **Keyspaces** | Serverless Cassandra-compatible |
| **Timestream** | Time-series |
| **OpenSearch Service** | Search & log analytics |
| **QLDB** | Ledger DB (end of support 2025 — use Aurora PostgreSQL with audit) |

## 6. Choosing (RDS vs Aurora vs DynamoDB vs Redshift vs ElastiCache)
| Requirement | Pick |
|---|---|
| Standard OLTP app, familiar SQL, moderate scale | RDS (PostgreSQL/MySQL) |
| High-performance/HA OLTP, many read replicas, global | Aurora (+ Global Database) |
| Serverless, massive scale key-value, millisecond latency | DynamoDB |
| BI/analytics on TB–PB | Redshift (or Athena on S3 lake) |
| Sub-ms reads, sessions, caching | ElastiCache (Valkey/Redis) |
| Oracle/SQL Server licenses | RDS for Oracle/SQL Server (or EC2 for full control) |

## 7. Database migration — AWS DMS
Full load + **CDC** (ongoing replication) for minimal-downtime migrations; homogeneous (MySQL→RDS MySQL) or heterogeneous (Oracle→Aurora PostgreSQL) with **Schema Conversion** (DMS SC / SCT). Steps: create replication instance/serverless, source/target endpoints, task (full load + CDC), validate, cut over (stop writes → wait for lag 0 → switch connection strings).
