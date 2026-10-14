# Cloud Storage & Databases — Complete Notes

> Part of the [Cloud hub](../README.md). Provider deep dives: [AWS Storage](../AWS/aws-storage.md) · [AWS Databases](../AWS/aws-databases.md) · [Azure Storage & DBs](../AZURE/azure-storage-and-databases.md) · [GCP Storage & DBs](../GCP/gcp-storage-and-databases.md).

---

## 1. Storage types: object vs block vs file

| | **Object** | **Block** | **File** |
|---|---|---|---|
| Unit | Objects (data + metadata + key) in a flat namespace (buckets) | Fixed-size blocks presented as a raw disk | Files in hierarchical directories |
| Access | HTTP(S) REST API (GET/PUT) | Attached to one VM (mostly), OS formats with ext4/xfs/NTFS | Network protocol NFS / SMB, many clients at once |
| Scale | Virtually unlimited | Up to volume size limits | Petabytes (managed) |
| Latency | ms (higher) | sub-ms (lowest) | low ms |
| Modify | Replace whole object (no in-place edits) | In-place block writes | In-place, file locking |
| Use cases | Backups, static websites, data lakes, media, logs, artifacts | OS boot disks, databases, transactional apps | Shared content, home dirs, lift-and-shift apps, CMS, ML training data |
| **AWS** | **S3** (+ Glacier classes) | **EBS**, instance store | **EFS** (NFS), **FSx** (Windows/Lustre/ONTAP/OpenZFS) |
| **Azure** | **Blob Storage** (ADLS Gen2 for analytics) | **Managed Disks** | **Azure Files** (SMB/NFS), Azure NetApp Files |
| **GCP** | **Cloud Storage** | **Persistent Disk / Hyperdisk**, Local SSD | **Filestore**, NetApp Volumes |

**Ephemeral vs persistent:** instance store / Local SSD / temp disk lose data when the VM stops/terminates — use for caches/scratch only.

### Object storage tiers (cheaper storage ↔ more expensive retrieval)
| Access pattern | AWS S3 | Azure Blob | GCP Cloud Storage |
|---|---|---|---|
| Frequent | Standard | Hot | Standard |
| Unknown/changing | **Intelligent-Tiering** | (lifecycle mgmt / smart tier) | **Autoclass** |
| Infrequent (~monthly) | Standard-IA, One Zone-IA | **Cool** (30-day min) | **Nearline** (30-day min) |
| Rare (~quarterly) | Glacier Instant Retrieval | **Cold** (90-day min) | **Coldline** (90-day min) |
| Archive | Glacier Flexible Retrieval, **Glacier Deep Archive** (hours to restore) | **Archive** (180-day min, rehydrate hours, offline) | **Archive** (365-day min, still ms access) |

Lifecycle policies move objects between tiers / expire them automatically. Minimum storage durations mean early deletion fees.

### Redundancy options
| Scope | AWS | Azure | GCP |
|---|---|---|---|
| Single zone | S3 One Zone-IA, EBS (replicated within AZ) | **LRS** (3 copies, one DC) | Zonal PD |
| Multi-zone in region | S3 Standard (≥3 AZs), EFS Regional | **ZRS** (3 AZs) | Regional bucket, Regional PD |
| Cross-region | S3 **Cross-Region Replication** | **GRS / RA-GRS** (paired region, RA = readable), **GZRS / RA-GZRS** | **Dual-region / multi-region** buckets (turbo replication option) |

---

## 2. Databases: relational vs NoSQL vs warehouse

### Relational (SQL, OLTP)
Tables with schemas, joins, **ACID** transactions, strong consistency. Scale up + read replicas; sharding is hard.
| Need | AWS | Azure | GCP |
|---|---|---|---|
| Managed MySQL/PostgreSQL/SQL Server | **RDS** | Azure Database for PostgreSQL/MySQL **Flexible Server**, **Azure SQL Database**, SQL Managed Instance | **Cloud SQL** |
| High-performance cloud-native SQL | **Aurora** (MySQL/Postgres compatible) | Azure SQL **Hyperscale** | **AlloyDB** (Postgres compatible) |
| Globally distributed, horizontally scalable SQL | Aurora DSQL / Global Database | Cosmos DB for PostgreSQL (Citus) | **Spanner** |

### NoSQL families
| Type | Model | Use cases | AWS | Azure | GCP |
|---|---|---|---|---|---|
| **Key-value** | key → value | Sessions, carts, leaderboards | **DynamoDB** | Cosmos DB (NoSQL/Table) | Firestore, Bigtable |
| **Document** | JSON documents | Catalogs, user profiles, CMS | DocumentDB, DynamoDB | **Cosmos DB** (NoSQL/Mongo API) | **Firestore** |
| **Wide-column** | Rows with dynamic columns, huge scale | Time series, IoT, ad-tech | Keyspaces (Cassandra) | Cosmos DB Cassandra API | **Bigtable** |
| **Graph** | Nodes/edges | Social, fraud, recommendations | Neptune | Cosmos DB Gremlin | (Spanner Graph) |
| **In-memory cache** | RAM key-value | Caching, rate limiting, pub/sub | **ElastiCache** (Valkey/Redis OSS/Memcached), MemoryDB | **Azure Managed Redis** / Azure Cache for Redis | **Memorystore** |
| **Time series** | Timestamped metrics | IoT, monitoring | Timestream | Data Explorer | Bigtable / BigQuery |

### Analytics: data warehouse vs data lake vs lakehouse
| | Data warehouse | Data lake | Lakehouse |
|---|---|---|---|
| Data | Structured, cleaned, schema-on-write | Raw any format, schema-on-read | Lake storage + table formats (Iceberg/Delta) with ACID |
| Users | BI, analysts (SQL) | Data scientists, ML | Both |
| AWS | **Redshift** | **S3** + Glue + Athena + Lake Formation | S3 Tables (Iceberg) + Athena/Redshift |
| Azure | Synapse / **Microsoft Fabric** Warehouse | **ADLS Gen2** | Fabric OneLake (Delta) / Databricks |
| GCP | **BigQuery** | **Cloud Storage** + Dataproc | BigLake + BigQuery (Iceberg) |

### OLTP vs OLAP
| | OLTP | OLAP |
|---|---|---|
| Workload | Many small reads/writes, transactions | Few huge scans/aggregations |
| Storage | Row-oriented | Column-oriented |
| Examples | RDS, Cloud SQL, Azure SQL | Redshift, BigQuery, Synapse |

---

## 3. Choosing a database — decision guide
1. Need joins, transactions, fixed schema, moderate scale? → **Managed relational** (RDS/Aurora, Azure SQL/Flexible Server, Cloud SQL/AlloyDB).
2. Massive scale, single-digit ms key lookups, flexible schema, predictable access patterns? → **DynamoDB / Cosmos DB / Firestore / Bigtable**.
3. Global writes + strong consistency + relational? → **Spanner** (or Cosmos DB with strong consistency/Aurora DSQL).
4. Analytics on TBs–PBs? → **Redshift / Synapse–Fabric / BigQuery**.
5. Read-heavy hot data / sub-ms latency? → add a **cache** in front.
6. Text search? → OpenSearch / Azure AI Search / Elastic.

**RDS vs DynamoDB (classic question)**: RDS = relational, SQL, joins, ACID, vertical scaling + replicas, schema. DynamoDB = serverless NoSQL key-value/document, horizontal auto-scaling, single-digit ms at any scale, access patterns must be designed up front (partition key), limited query flexibility, pay per request or provisioned capacity.

---

## 4. Consistency, CAP, replication
- **CAP theorem**: during a network **P**artition, a distributed store chooses **C**onsistency or **A**vailability. Spanner/strongly consistent systems choose C; Dynamo-style default to A (eventual).
- **Consistency levels**: strong → bounded staleness → session → consistent prefix → eventual (Cosmos DB exposes all five). S3, GCS and Azure Blob now give **strong read-after-write** consistency for objects.
- **Replication**: synchronous (zero data loss, adds latency — e.g. RDS Multi-AZ standby, Cloud SQL HA) vs asynchronous (fast, possible lag/data loss — read replicas, cross-region replicas).
- **Sharding/partitioning**: split data by key across nodes; choose high-cardinality keys to avoid **hot partitions**.
- **Data redundancy in cloud** is achieved by: multi-AZ replication, cross-region replication, snapshots/backups, versioning, erasure coding inside the provider's storage systems.

## 5. Moving data into the cloud
| Method | AWS | Azure | GCP |
|---|---|---|---|
| CLI/online copy | `aws s3 sync`, DataSync | **AzCopy**, Storage Explorer, Azure File Sync | `gcloud storage cp/rsync`, Storage Transfer Service |
| Offline appliance (TBs–PBs) | Snowball (Edge) | **Data Box** | **Transfer Appliance** |
| Database migration | **DMS** (+ SCT) | **Azure Database Migration Service** / Azure Migrate | **Database Migration Service** |
| Private network link | Direct Connect | ExpressRoute | Interconnect |

Rule of thumb: if online transfer would take more than ~1 week at your available bandwidth, use an appliance.
