# GCP Storage & Databases — Cloud Storage, Disks, Cloud SQL, AlloyDB, Spanner, Firestore, Bigtable, BigQuery — Complete Notes

> Part of the [GCP overview](./gcp.md). Cross-cloud: [Storage & Databases fundamentals](../Fundamentals/02-cloud-storage-and-databases.md).

---

## 1. Cloud Storage (GCS — object storage)
- **Buckets** (globally unique names) → **objects** (immutable; overwrite creates new generation). Strong global consistency. 11 nines durability.
- **Location types**: **region** (lowest latency/cost, single region), **dual-region** (two specific regions, optional **turbo replication** with 15-min RPO), **multi-region** (US/EU/ASIA — highest availability, content serving).
- **Storage classes** (all have **millisecond access** — unlike AWS Glacier/Azure Archive):
| Class | Minimum storage duration | Use |
|---|---|---|
| **Standard** | none | Hot data, serving, analytics |
| **Nearline** | 30 days | Accessed < once/month (backups) |
| **Coldline** | 90 days | Accessed < once/quarter (DR) |
| **Archive** | 365 days | Accessed < once/year (compliance) |
Non-Standard classes add **retrieval fees** and early-deletion charges. **Autoclass** moves objects between classes automatically by access.
- **Lifecycle rules**: `SetStorageClass` / `Delete` by age, created before, number of newer versions, noncurrent time, matches prefix/suffix; `AbortIncompleteMultipartUpload`.
- **Object versioning** (noncurrent versions kept; restore by copying old generation) and **soft delete** (default 7-day retention of deleted objects). **Retention policies** + **Bucket Lock** (WORM, irreversible) and **object holds** for compliance.
- **Access control**: **uniform bucket-level access** (IAM only, recommended; ACLs disabled) vs fine-grained ACLs; **public access prevention**; IAM Conditions on prefixes; **signed URLs** (time-limited access to an object for anyone with the URL, signed by a service account; V4 max **7 days**) and **signed policy documents** (browser uploads with constraints); **HMAC keys** for S3-compatible API.
- **Encryption**: Google-managed by default; CMEK (Cloud KMS) or CSEK.
- Uploads: `gcloud storage cp` (parallel composite uploads), resumable uploads for large/flaky, Storage Transfer Service (from S3/Azure/HTTP/on-prem agents), Transfer Appliance (offline), **gcsfuse** / Cloud Storage FUSE to mount buckets.
- Static website hosting (behind global external Application LB + Cloud CDN for HTTPS/custom domain), Pub/Sub notifications on object changes, Eventarc triggers, Storage Insights/inventory reports.
```bash
gcloud storage buckets create gs://acme-logs-prod --location=asia-south1 --default-storage-class=STANDARD --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://acme-logs-prod --versioning
gcloud storage buckets update gs://acme-logs-prod --lifecycle-file=lifecycle.json
gcloud storage cp ./report.pdf gs://acme-logs-prod/reports/
gcloud storage sign-url gs://acme-logs-prod/reports/report.pdf --duration=1h --impersonate-service-account=signer@my-proj.iam.gserviceaccount.com
```
```json
{"rule":[
  {"action":{"type":"SetStorageClass","storageClass":"NEARLINE"},"condition":{"age":30}},
  {"action":{"type":"SetStorageClass","storageClass":"ARCHIVE"},"condition":{"age":365}},
  {"action":{"type":"Delete"},"condition":{"numNewerVersions":3}}
]}
```
- **Cloud Storage vs Persistent Disk**: GCS = object storage accessed via API, unlimited, shared globally; PD = block device attached to VMs, formatted filesystem, low latency. **Cloud Storage vs Datastore/Firestore**: GCS stores files/blobs; Firestore/Datastore stores structured documents/entities with queries & transactions.

## 2. Block & file storage
| Option | Notes |
|---|---|
| **Persistent Disk** (pd-standard HDD, **pd-balanced**, pd-ssd, pd-extreme) | Network block storage, zonal or **regional PD** (synchronous replication across 2 zones for HA), snapshots, resize online |
| **Hyperdisk** (Balanced, Throughput, Extreme, ML; Hyperdisk Balanced HA) | Next-gen: provision IOPS/throughput independently of size, storage pools |
| **Local SSD** | Physically attached NVMe, very high IOPS/low latency, **ephemeral** (data lost on stop/delete; survives live migration) — caches, scratch, replicated DBs |
| **Filestore** | Managed NFS (Basic, Zonal, Regional/Enterprise) for shared files/GKE RWX |
| **NetApp Volumes** | Managed NetApp (NFS/SMB) |
| **Backup and DR Service** | Centralized backup of VMs, DBs, file systems |
**PD vs Local SSD**: PD = durable, network-attached, snapshots, detachable, moderate latency; Local SSD = fastest but ephemeral and fixed per VM — use for temp data or databases that replicate themselves (Cassandra, Kafka with replication).

## 3. Databases
| Service | Type | Key facts | Choose when |
|---|---|---|---|
| **Cloud SQL** | Managed MySQL / PostgreSQL / SQL Server | **HA = regional instance** (primary + synchronous standby in another zone, automatic failover, shared regional PD); **read replicas** (in-region/cross-region, async; can promote for DR); automated backups + **PITR**; Enterprise / Enterprise Plus editions (99.99% SLA, near-zero-downtime maintenance, data cache); private IP / PSC; **Cloud SQL Auth Proxy** / language connectors (IAM-authorized, encrypted, short-lived certs — no authorized networks/SSL management); IAM database authentication | Standard OLTP, single region, lift-and-shift |
| **AlloyDB for PostgreSQL** | High-performance Postgres-compatible | Disaggregated storage, up to ~4× faster transactional and ~100× analytical vs standard Postgres (columnar engine), read pools, cross-region secondary clusters, AI/vector (ScaNN) | Demanding Postgres OLTP + HTAP |
| **Spanner** | Globally distributed relational, strongly consistent | Horizontal scale of reads **and writes**, **external consistency** via **TrueTime** (GPS+atomic clocks), SQL (GoogleSQL/PostgreSQL dialect), automatic sharding (splits), regional (99.99%) or **multi-region (99.999%)**, interleaved tables, Spanner Graph, granular instances (processing units) | Write scale beyond one primary or global consistency (finance, gaming, inventory). Start with Cloud SQL unless you truly need this |
| **Firestore** | Serverless document DB | **Native mode** (real-time listeners, offline mobile/web SDKs) vs **Datastore mode** (Datastore API, server workloads) — chosen at DB creation; strong consistency, ACID transactions, automatic multi-region, composite indexes; MongoDB-compatibility | Mobile/web apps, user profiles, catalogs |
| **Bigtable** | Wide-column NoSQL (HBase API) | Petabyte scale, single-digit ms, high write throughput; rows sorted by **row key** (the only index) — design keys to avoid hotspots (**don't start with timestamp**; use field promotion/salting e.g. `deviceId#reverseTimestamp`); replication across clusters; no multi-row transactions/joins/ad-hoc SQL (has GoogleSQL for reads) | Time series, IoT, ad-tech, fintech ticks, ML features |
| **Memorystore** | Managed **Redis / Valkey / Memcached** | In-memory cache, HA with replicas, cluster mode | Caching, sessions, leaderboards, rate limiting |
| **Datastream** | CDC replication | MySQL/Postgres/Oracle/SQL Server → BigQuery/GCS | Real-time analytics replication |
| **Database Migration Service** | Migration | Homogeneous (to Cloud SQL/AlloyDB) with continuous replication, Oracle → Postgres conversion | Minimal-downtime migrations |

### Cloud SQL high availability setup
```bash
gcloud sql instances create orders-db --database-version=POSTGRES_16 --region=asia-south1 --availability-type=REGIONAL \
  --tier=db-custom-4-16384 --network=projects/my-proj/global/networks/shared-vpc --no-assign-ip \
  --backup-start-time=02:00 --enable-point-in-time-recovery --edition=ENTERPRISE_PLUS
gcloud sql instances create orders-db-dr --master-instance-name=orders-db --region=asia-southeast1   # cross-region replica for DR
```
Production checklist: regional HA, private IP, backups + PITR, maintenance windows, deletion protection, connection pooling, query insights, read replicas for reporting, cross-region replica for DR, IAM DB auth / Secret Manager.

**Cloud Spanner vs Cloud SQL**: Cloud SQL = vertically scaled single-primary DB with HA standby, regional, cheaper, full MySQL/Postgres compatibility. Spanner = horizontally scalable, multi-region active, 99.999% SLA, strong external consistency, higher minimum cost, schema/primary key design for distribution (avoid monotonically increasing keys).

## 4. BigQuery (serverless data warehouse)
- Columnar, separates storage & compute, serverless (no clusters), SQL (**GoogleSQL**; legacy SQL deprecated-in-practice — standard SQL supports DML, joins, arrays/structs, partitioned tables, and is required for new features), petabyte scale, ML in SQL (**BigQuery ML**), BI Engine, streaming inserts (Storage Write API), federated queries (Cloud SQL, Spanner, GCS external/BigLake tables, Iceberg), Omni (cross-cloud), Data Canvas/Gemini.
- **Pricing**: storage (active vs long-term — auto ~50% cheaper after 90 days untouched; logical vs physical/compressed billing) + compute: **on-demand** (per TB scanned) or **capacity** (slots via **BigQuery editions**: Standard/Enterprise/Enterprise Plus, autoscaling reservations, commitments).
- **Cost control & performance**:
  - `SELECT` only needed columns (columnar — `SELECT *` scans everything); `LIMIT` does **not** reduce bytes scanned.
  - **Partition** tables (ingestion time, DATE/TIMESTAMP column, integer range) + `require_partition_filter`; **cluster** by frequently filtered/joined columns (up to 4).
  - Preview with dry runs (`--dry_run`), set **maximum bytes billed**, custom quotas per user/project.
  - Materialized views, BI Engine, cached results (24 h), denormalize with nested/repeated fields instead of huge joins, avoid repeated transformations (use scheduled queries/Dataform), approximate functions (`APPROX_COUNT_DISTINCT`), filter early, avoid cross joins/skewed joins, use search indexes.
  - Monitor via `INFORMATION_SCHEMA.JOBS` (top costly queries), slot utilization, reservations.
- Security/governance: dataset/table IAM, **authorized views**, row-level access policies, column-level security (policy tags via Dataplex), data masking, CMEK, VPC-SC, Analytics Hub (data sharing).
- **BigQuery vs Cloud SQL**: BigQuery = OLAP analytics on huge data, not for transactional single-row updates/low-latency serving; Cloud SQL = OLTP transactions.
```bash
bq query --use_legacy_sql=false --dry_run 'SELECT order_id, amount FROM shop.orders WHERE order_date = "2026-10-01"'
bq mk --table --time_partitioning_field=order_date --clustering_fields=customer_id,country shop.orders schema.json
```
