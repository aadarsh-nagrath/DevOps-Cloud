# Azure Storage & Databases — Complete Notes

> Part of the [Azure overview](./azure.md). Cross-cloud: [Storage & Databases fundamentals](../Fundamentals/02-cloud-storage-and-databases.md).

---

## 1. Storage accounts
A **storage account** is a namespace (`https://<name>.blob.core.windows.net`) holding Azure Storage data services:
| Service | What | Notes |
|---|---|---|
| **Blob Storage** | Object storage (block blobs, append blobs for logs, page blobs for VHDs) | Containers → blobs |
| **Azure Files** | Managed SMB (and NFS) file shares | Mount from Windows/Linux/macOS, AD/Entra Kerberos auth, **Azure File Sync** caches shares on Windows Servers |
| **Queue Storage** | Simple message queue (64 KB msgs) | Async decoupling |
| **Table Storage** | NoSQL key-attribute store | Cheap; Cosmos DB Table API for premium |
| **Data Lake Storage Gen2** | Blob + **hierarchical namespace** (true directories, POSIX ACLs) | Analytics (Synapse, Databricks, Fabric) |

**Account types**: **Standard general-purpose v2** (most scenarios, all services, all redundancy options), **Premium block blobs** (low latency), **Premium file shares** (FileStorage), **Premium page blobs**.

### Redundancy options
| Option | Copies | Survives |
|---|---|---|
| **LRS** | 3 in one datacenter | Disk/rack failure |
| **ZRS** | 3 across 3 AZs | Datacenter/zone failure |
| **GRS** | LRS in primary + LRS in **paired region** (async) | Region failure (after failover) |
| **RA-GRS** | GRS + **read access** to secondary endpoint | Region failure, read anytime |
| **GZRS** | ZRS in primary + LRS in secondary | Zone + region |
| **RA-GZRS** | GZRS + read access to secondary | Highest durability (16 nines) |
Customer-managed **account failover** promotes secondary on regional outage (RPO typically < 15 min, data loss possible due to async).

### Blob access tiers
| Tier | Min retention | Use |
|---|---|---|
| **Hot** | — | Frequent access |
| **Cool** | 30 days | Infrequent (≥ monthly), short-term backup |
| **Cold** | 90 days | Rarely accessed, still online |
| **Archive** | 180 days | **Offline** — must **rehydrate** to Hot/Cool (hours; standard up to 15 h, high priority < 1 h for small) |
**Lifecycle management** policies move/delete blobs by age/last-access time. Set tier per blob or account default (Hot/Cool/Cold).

### Data protection & security
- **Soft delete** (blobs, containers, file shares), **versioning**, **point-in-time restore** (block blobs), **change feed**, **immutable storage** (time-based retention / legal hold, WORM — version-level immutability), **object replication** between accounts.
- Access: **Entra ID + RBAC** (Storage Blob Data Reader/Contributor) preferred; **SAS tokens** (service/account SAS; **user delegation SAS** signed with Entra creds — preferred), stored access policies to revoke; account keys (rotate, disable Shared Key auth where possible).
- Network: firewall rules, **service endpoints** or **private endpoints**, disable public access, `allowBlobPublicAccess=false`, minimum TLS 1.2, secure transfer required.
- Encryption: SSE always on (Microsoft-managed keys or CMK in Key Vault), infrastructure double encryption.
- **Defender for Storage**: malware scanning, anomaly detection.

### Disks
**Managed disks**: Standard HDD, Standard SSD, **Premium SSD**, **Premium SSD v2** (tune IOPS/throughput independent of size), **Ultra Disk** (sub-ms, highest IOPS). LRS or **ZRS** (for Premium/Standard SSD). Snapshots (incremental), shared disks (clustering), encryption at host, Azure Disk Encryption (BitLocker/dm-crypt, being retired in favor of encryption at host).

### Moving data & migration
| Tool | Use |
|---|---|
| **AzCopy** | CLI to copy/sync blobs/files (`azcopy copy ./data "https://acct.blob.core.windows.net/c?<SAS>" --recursive`) |
| **Azure Storage Explorer** | GUI for storage (uses AzCopy) |
| **Azure File Sync** | Sync on-prem Windows file servers with Azure Files (cloud tiering) |
| **Azure Migrate** | Hub: discovery, assessment, migration of servers, DBs, web apps, VDI |
| **Azure Data Box** | Offline appliance (Data Box Disk / Data Box / Heavy) for TB–PB transfers |
| **Azure Database Migration Service** | Online/offline DB migrations to Azure SQL/PostgreSQL/MySQL |

## 2. Relational databases
| Service | What | When |
|---|---|---|
| **Azure SQL Database** | PaaS SQL Server engine, single DB or **elastic pool** (share resources across many DBs — SaaS per-tenant DBs). Purchasing: **DTU** (bundled) or **vCore** (General Purpose / **Business Critical** (local SSD, readable replica, Always On) / **Hyperscale** (up to 128 TB, fast scale, many replicas)); **serverless** compute tier (auto-pause) | New cloud apps on SQL Server |
| **Azure SQL Managed Instance** | Near 100% SQL Server compatibility (SQL Agent, cross-DB queries, CLR) in your VNet | Lift-and-shift SQL Server |
| **SQL Server on Azure VMs** | IaaS, full control | OS/engine-level access needs |
| **Azure Database for PostgreSQL – Flexible Server** | Managed Postgres, zone-redundant HA, read replicas, PgBouncer built-in, extensions | Postgres apps |
| **Azure Database for MySQL – Flexible Server** | Managed MySQL | MySQL apps |
- HA/DR: zone-redundant configuration, **active geo-replication** (up to 4 readable secondaries) and **auto-failover groups** (group of DBs fail over together with a stable listener endpoint) for Azure SQL; automated backups with **PITR** (1–35 days) + long-term retention (up to 10 years); geo-restore.
- Security: Entra authentication (managed identities, no passwords), private endpoints, TDE (on by default), Always Encrypted, dynamic data masking, row-level security, auditing, Defender for SQL.

## 3. Azure Cosmos DB (globally distributed NoSQL)
- Multi-model **APIs**: **NoSQL** (native, JSON/SQL-like queries), **MongoDB** (RU & vCore), **Apache Cassandra**, **Apache Gremlin** (graph), **Table**; plus **Cosmos DB for PostgreSQL** (Citus, distributed Postgres).
- **Throughput** in **Request Units (RU/s)**: provisioned (manual or **autoscale**), or **serverless**. 1 RU ≈ point read of a 1 KB item.
- **Partition key** choice is critical (high cardinality, even distribution, used in queries) → avoids hot partitions; logical partition limit 20 GB.
- **Global distribution**: add regions with a click; **multi-region writes**; automatic failover; 99.999% SLA for multi-region.
- **Five consistency levels** (strongest → weakest): **Strong**, **Bounded staleness**, **Session** (default — read-your-writes per session), **Consistent prefix**, **Eventual**. Trade consistency for latency/availability/throughput.
- Features: change feed (event sourcing, triggers Functions), TTL, analytical store / Fabric mirroring (HTAP), integrated vector search (AI apps), continuous backup with PITR.

## 4. Analytics & caching
| Service | What |
|---|---|
| **Microsoft Fabric** | Unified SaaS analytics: **OneLake** (Delta/Parquet lake), Data Factory, Data Engineering (Spark), Data Warehouse, Real-Time Intelligence, Power BI, Copilot — Microsoft's strategic analytics platform |
| **Azure Synapse Analytics** | Dedicated SQL pools (MPP DW), serverless SQL over lake, Spark, pipelines — existing deployments; new work trending to Fabric |
| **Azure Databricks** | Managed Databricks (Spark, Delta Lake, Unity Catalog) |
| **Azure Data Factory** | ETL/ELT orchestration (90+ connectors, mapping data flows, self-hosted integration runtime for on-prem) |
| **Event Hubs** | Big-data streaming ingestion (Kafka-compatible) |
| **Stream Analytics** | SQL-based real-time stream processing |
| **Azure Data Explorer** | Fast log/time-series analytics (KQL) |
| **Azure Managed Redis** / Azure Cache for Redis | Managed Redis caching (Managed Redis is the newer offering) |
| **Azure AI Search** | Search + vector search for RAG |

## 5. Choosing (Azure SQL vs Cosmos DB vs PostgreSQL/MySQL vs Synapse/Fabric)
- Relational SQL Server workload, new app → **Azure SQL Database** (Hyperscale for big/fast-growing).
- Lift-and-shift SQL Server with instance features → **SQL Managed Instance**.
- Open-source relational → **PostgreSQL/MySQL Flexible Server**.
- Global, low-latency, flexible schema, massive scale, multi-region writes → **Cosmos DB**.
- Analytics/BI over large data → **Fabric** (or Synapse/Databricks).
- Caching/session → **Azure Managed Redis**.
