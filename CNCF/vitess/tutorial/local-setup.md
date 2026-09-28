# Vitess — Learn It Locally

Goal: stand up a local Vitess cluster, connect with a plain MySQL client, create a sharded keyspace, and watch inserts route to different shards — in about 30 minutes.

## Prerequisites
- Docker and Docker Compose installed.
- A MySQL client (`mysql` CLI — `brew install mysql-client` on macOS, or use any GUI client that speaks MySQL protocol).
- `git` (to pull the Vitess example compose file).

---

## Step 1 — Get the Vitess Local Example

Vitess ships a ready-made docker-compose example in its repo. Clone just what you need:
```bash
git clone --depth 1 https://github.com/vitessio/vitess.git
cd vitess/examples/compose
```

This example brings up: a topology service (etcd/consul, configurable), VTGate, VTTablets, and MySQL instances for a sharded `commerce` keyspace out of the box.

---

## Step 2 — Start the Cluster

```bash
docker compose up -d
```

This starts multiple containers — etcd (topology), vtctld (cluster control plane / admin), several vttablet+mysql pairs, and vtgate. Give it 1-2 minutes to initialize.

Check everything is healthy:
```bash
docker compose ps
```

You should see containers like `vttablet100`, `vttablet101`, `vtgate`, `etcd`, `vtctld` all `Up`.

---

## Step 3 — Open the VTAdmin / vtctld UI

```bash
open http://localhost:15000    # vtctld web UI, port may vary — check docker compose ps for the mapped port
```

Here you can see the keyspace/shard topology visually: the `commerce` keyspace, its shards, and which tablet is currently `PRIMARY` for each.

You can also query cluster state from the CLI:
```bash
docker compose exec vtctld vtctldclient GetKeyspaces
docker compose exec vtctld vtctldclient GetShardReplication commerce zone1-0000000100
```

---

## Step 4 — Connect with a Standard MySQL Client

VTGate speaks the MySQL protocol on port 15306 (check your compose file's port mapping):
```bash
mysql -h 127.0.0.1 -P 15306 -u user
```

You're now talking to Vitess exactly as if it were a single MySQL server:
```sql
SHOW DATABASES;
USE commerce;
SHOW TABLES;
```

---

## Step 5 — Insert Data and Watch It Route

The example `commerce` keyspace ships pre-sharded with a `customer` table keyed on `customer_id` via a hash vindex. Insert a few rows:
```sql
INSERT INTO customer (customer_id, email) VALUES (1, 'alice@example.com');
INSERT INTO customer (customer_id, email) VALUES (2, 'bob@example.com');
INSERT INTO customer (customer_id, email) VALUES (3, 'carol@example.com');

SELECT * FROM customer;
```
This looks identical to plain MySQL. Now see where each row actually landed:
```sql
-- Vitess exposes routing info via a special comment-based hint / the vtexplain tool
SELECT customer_id, email FROM customer WHERE customer_id = 1;
```

To see the routing decision explicitly, use `vtexplain` from the vtctld container:
```bash
docker compose exec vtctld vtexplain \
  -keyspace commerce \
  -vschema-file /path/to/vschema.json \
  -sql "SELECT * FROM customer WHERE customer_id = 1"
```
The output shows which shard(s) the query was sent to — for a query with the sharding key in `WHERE`, you'll see it routed to exactly one shard. Try a query *without* the sharding key:
```bash
docker compose exec vtctld vtexplain \
  -keyspace commerce \
  -vschema-file /path/to/vschema.json \
  -sql "SELECT * FROM customer WHERE email = 'alice@example.com'"
```
This one scatters to every shard (no vindex can resolve `email` directly unless a lookup vindex is defined for it) — a direct, visible demonstration of the single-shard-route vs scatter-query distinction from the notes.

---

## Step 6 — Inspect the Shard Map

```bash
docker compose exec vtctld vtctldclient GetSrvKeyspace zone1 commerce
```
This prints the actual keyrange-to-shard mapping (`-80`, `80-`, etc.) that VTGate uses to route `customer_id` values to shards.

Check which MySQL/tablet is currently PRIMARY per shard:
```bash
docker compose exec vtctld vtctldclient GetTablets --keyspace commerce
```

---

## Step 7 — Simulate a Resharding Workflow (Optional, Advanced)

If your compose example includes the `resharding` variant of the demo (check `examples/compose/README.md` in the cloned repo — Vitess periodically restructures these examples), you can walk through a live split:
```bash
docker compose exec vtctld vtctldclient Reshard create \
  --workflow=cust2cust \
  --target-keyspace=commerce \
  --source-shards='-80' --target-shards='-40,40-80'

docker compose exec vtctld vtctldclient Reshard status --workflow=cust2cust --target-keyspace=commerce
```
Watch the status transition from copying to running (catching up via VReplication) to ready-to-switch — this is the online resharding flow described in the notes, observable end-to-end locally.

---

## Cleanup
```bash
docker compose down -v
```
The `-v` flag removes the named volumes too, so the next `up -d` starts completely fresh.

## What to Explore Next
- Add a `lookup` vindex on `email` so that `SELECT * FROM customer WHERE email = ...` becomes a single-shard route instead of a scatter — edit the VSchema and re-apply with `vtctldclient ApplyVSchema`.
- Kill a MySQL container mid-session (`docker compose stop vttablet101`) and watch VTGate's behavior — does it error, retry, or route around it depending on tablet type?
- Run `EXPLAIN` directly through the MySQL client connected via VTGate and compare it against `vtexplain`'s routing-level explain — they answer different questions (query plan vs. shard routing).
- Try a cross-shard JOIN and observe in `vtexplain` how VTGate turns it into a scatter-and-merge plan.
