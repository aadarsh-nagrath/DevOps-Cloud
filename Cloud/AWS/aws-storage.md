# AWS Storage — S3, EBS, EFS, FSx, Glacier, Backup — Complete Notes

> Part of [AWS hub](./aws.md). Cross-cloud view: [Storage & Databases fundamentals](../Fundamentals/02-cloud-storage-and-databases.md).

---

## 1. Amazon S3 (object storage)

### Basics
- **Buckets** (globally unique name, regional) hold **objects** (key + value + metadata), unlimited count. Flat namespace — "folders" are just key prefixes.
- **Strong read-after-write consistency** for all operations (since Dec 2020).
- Durability **11 nines** (99.999999999%) across ≥3 AZs (except One Zone classes).
- Upload: single PUT up to 5 GB; use **multipart upload** for objects > ~100 MB (parallel parts, retry individual parts, required above 5 GB); `aws s3 cp` does multipart automatically. **Transfer Acceleration** speeds long-distance uploads via edge locations. Lifecycle rule to **abort incomplete multipart uploads**.

### Storage classes
| Class | Use | Notes |
|---|---|---|
| **S3 Standard** | Frequently accessed | Default, ≥3 AZs |
| **S3 Intelligent-Tiering** | Unknown/changing access | Auto-moves between frequent/infrequent/archive-instant tiers; small monitoring fee, no retrieval fees |
| **S3 Express One Zone** | Single-digit ms, very high request rate | Directory buckets in one AZ; ML/analytics hot data |
| **S3 Standard-IA** | Infrequent, needs ms access | 30-day min, retrieval fee |
| **S3 One Zone-IA** | Infrequent, re-creatable data | One AZ, cheaper |
| **S3 Glacier Instant Retrieval** | Archive accessed ~quarterly, ms access | 90-day min |
| **S3 Glacier Flexible Retrieval** | Archive; minutes–hours | Expedited (1–5 min) / Standard (3–5 h) / Bulk (5–12 h); 90-day min |
| **S3 Glacier Deep Archive** | Long-term compliance archive | Cheapest; 12–48 h retrieval; 180-day min |

### Lifecycle policies
Rules (by prefix/tag/size) with **transition** actions (Standard → IA after 30 d → Glacier after 90 d → Deep Archive after 365 d) and **expiration** actions (delete objects, delete noncurrent versions after N days, delete expired delete markers, abort multipart uploads).

### Versioning & data protection
- **Versioning**: keeps all versions; delete adds a **delete marker** (recover by removing it). Once enabled can only be *suspended*. Combine with lifecycle to expire old versions.
- **MFA Delete**: require MFA to permanently delete versions / change versioning (root only).
- **Object Lock** (WORM): *governance* mode (privileged users can override) or *compliance* mode (no one, not even root, until retention expires) + legal holds — ransomware/compliance (SEC 17a-4).
- **Replication**: **CRR** (cross-region) / **SRR** (same-region); requires versioning; replicates new objects (use **Batch Replication** for existing); **Replication Time Control** (15-min SLA); can change storage class/owner on destination.
- **AWS Backup** for S3 (continuous PITR + periodic).

### Access control (in evaluation order of importance)
1. **Block Public Access** (account + bucket level) — keep ON unless intentionally public (use CloudFront instead).
2. **IAM policies** (identity-based) — what a principal can do.
3. **Bucket policies** (resource-based JSON) — cross-account access, enforce TLS (`aws:SecureTransport`), enforce encryption, restrict to VPC endpoint (`aws:SourceVpce`) or org (`aws:PrincipalOrgID`).
4. **Object Ownership = Bucket owner enforced** → **ACLs disabled** (default for new buckets). Avoid ACLs.
5. **S3 Access Points** — named endpoints with their own policies per app/team; **Multi-Region Access Points**.
6. **VPC gateway endpoint** for private, free access from VPCs.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyInsecureTransport",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": ["arn:aws:s3:::my-bucket", "arn:aws:s3:::my-bucket/*"],
    "Condition": {"Bool": {"aws:SecureTransport": "false"}}
  }]
}
```

### Presigned URLs
Time-limited URL granting the bearer the signer's permission for one operation (GET/PUT) on one object — e.g. browser uploads directly to S3 without proxying through your servers.
```bash
aws s3 presign s3://my-bucket/report.pdf --expires-in 3600
```
```python
url = boto3.client("s3").generate_presigned_url("put_object",
        Params={"Bucket": "uploads", "Key": "u/123/avatar.png", "ContentType": "image/png"}, ExpiresIn=300)
```
Max validity 7 days with IAM user credentials (SigV4); with role/STS credentials it ends when the session expires. Keep expiry short; scope per object. For many files use **CloudFront signed URLs/cookies**.

### Encryption
Default **SSE-S3** (AES-256) on all new objects; **SSE-KMS** (audit via CloudTrail, key policies; enable **S3 Bucket Keys** to cut KMS costs); **DSSE-KMS** (dual-layer); **SSE-C** (customer-provided keys); client-side encryption. Enforce TLS via bucket policy.

### Other S3 features
Static website hosting (use CloudFront + **OAC** for HTTPS/private bucket), event notifications (→ Lambda/SQS/SNS/EventBridge), S3 Select/Athena querying, **S3 Inventory**, **Storage Lens** (org-wide analytics), **Object Lambda**, requester pays, **S3 Tables** (managed Apache Iceberg), **Mountpoint for S3**, CORS configuration, server access logs / CloudTrail data events.

### Securing S3 — checklist
Block Public Access on; ACLs disabled; least-privilege IAM + bucket policies; enforce TLS and encryption (SSE-KMS for sensitive); VPC endpoint + `aws:SourceVpce` for internal buckets; versioning + Object Lock for critical data; Macie for sensitive data discovery; CloudTrail data events + access logs; IAM Access Analyzer for external access findings; GuardDuty S3 protection; presigned URLs instead of public objects.

---

## 2. Amazon EBS (block storage)
- Network-attached volumes for EC2, **AZ-scoped** (attach only to instances in the same AZ; move via snapshot). Replicated within the AZ. **Multi-Attach** for io1/io2 (cluster-aware apps).
| Type | Kind | Use |
|---|---|---|
| **gp3** | General SSD; baseline 3,000 IOPS / 125 MB/s **independent of size**, provision more separately | Default for most workloads — cheaper than gp2 |
| gp2 | Legacy SSD; IOPS scale with size (3/GB, burst credits) | Migrate to gp3 |
| **io2 Block Express** / io1 | Provisioned IOPS SSD, highest performance & durability | Critical DBs |
| **st1** | Throughput HDD | Big data, logs, streaming |
| **sc1** | Cold HDD | Infrequent, cheapest |
- **Snapshots**: incremental, stored in S3 (managed), copyable cross-region/account; **Fast Snapshot Restore**; **Data Lifecycle Manager** / AWS Backup for schedules; **Recycle Bin** for accidental deletion; **EBS Snapshots Archive** tier.
- Encryption with KMS (enable **EBS encryption by default** per region). Volumes can be resized/retyped online (Elastic Volumes) — then extend the filesystem.
- **Instance store**: physically attached NVMe, very fast, **ephemeral** (lost on stop/terminate/host failure) — caches, buffers, scratch, replicated data stores.

## 3. Amazon EFS (file storage)
Managed **NFS v4** file system mountable by thousands of EC2/ECS/EKS/Lambda clients across AZs; elastic size; Regional (multi-AZ) or One Zone; storage classes Standard / IA / Archive with lifecycle management; throughput modes **Elastic** (recommended), Provisioned, Bursting; Linux only. Use for shared content, CMS, home directories, ML data, container persistent storage (EFS CSI).

## 4. Amazon FSx
| FSx flavor | For |
|---|---|
| **FSx for Windows File Server** | SMB shares, AD integration, Windows apps |
| **FSx for Lustre** | HPC/ML high-throughput, S3-linked |
| **FSx for NetApp ONTAP** | Multi-protocol (NFS/SMB/iSCSI), snapshots, lift-and-shift NetApp |
| **FSx for OpenZFS** | ZFS workloads, low latency NFS |

## 5. S3 vs EBS vs EFS vs Glacier (classic question)
| | S3 | EBS | EFS | Glacier classes |
|---|---|---|---|---|
| Type | Object | Block | File (NFS) | Archive object |
| Access | API/HTTP, anywhere | One EC2 (same AZ) | Many clients, multi-AZ | Restore before/at read (except Instant) |
| Use | Backups, static assets, data lake | Boot/DB disks | Shared files | Long-term retention |
| Pricing | GB + requests + egress | Provisioned GB (+IOPS) | Used GB | Cheapest GB + retrieval |

## 6. Hybrid & data movement
- **Storage Gateway**: S3 File Gateway (NFS/SMB → S3), FSx File Gateway, Volume Gateway (iSCSI, cached/stored), Tape Gateway (VTL → Glacier).
- **DataSync**: online transfer/sync NFS/SMB/HDFS/S3/other clouds → AWS storage, scheduled, verified.
- **Snow Family**: Snowball Edge for offline petabyte transfer / edge compute.
- **Transfer Family**: managed SFTP/FTPS/FTP/AS2 into S3/EFS.
- **AWS Backup**: central policies for EC2/EBS/RDS/Aurora/DynamoDB/EFS/FSx/S3; cross-region & cross-account copies; **Vault Lock** (immutable); backup audit manager.
