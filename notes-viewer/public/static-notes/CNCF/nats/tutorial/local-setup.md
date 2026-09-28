# NATS — Learn It Locally

Goal: run a NATS server locally with JetStream enabled, use the `nats` CLI to see Core NATS's fire-and-forget behavior firsthand, then contrast it directly with JetStream's persistence and replay — the core "aha" of this tool — in about 15 minutes.

## Prerequisites
- Docker installed and running.
- The `nats` CLI installed on your host (not just in a container, so you can run it interactively):
  ```bash
  # macOS
  brew install nats-io/nats-tools/nats
  # or download a binary directly:
  # https://github.com/nats-io/natscli/releases
  ```

---

## Step 1 — Run NATS Server with JetStream Enabled

```bash
docker run -d --name nats-lab \
  -p 4222:4222 \
  -p 8222:8222 \
  nats:latest -js -m 8222
```
- `4222` — the client port, what publishers/subscribers connect to.
- `8222` — HTTP monitoring endpoint.
- `-js` — enables JetStream.
- `-m 8222` — exposes the monitoring HTTP server on that port.

Verify:
```bash
curl -s localhost:8222/varz | head -20
nats server check connection --server localhost:4222
```

---

## Step 2 — Core NATS: See the Fire-and-Forget Behavior Directly

This is the key contrast this tutorial builds toward — do it carefully.

**Terminal 1** — start a subscriber:
```bash
nats sub "orders.created" --server localhost:4222
```

**Terminal 2** — publish a message while the subscriber is running:
```bash
nats pub "orders.created" '{"orderId": 1, "status": "first message"}' --server localhost:4222
```
Back in Terminal 1, you'll see the message arrive immediately.

Now **stop the subscriber** (Ctrl+C in Terminal 1), and publish again from Terminal 2:
```bash
nats pub "orders.created" '{"orderId": 2, "status": "published with no subscriber"}' --server localhost:4222
```
Restart the subscriber:
```bash
nats sub "orders.created" --server localhost:4222
```
Message #2 never arrives — it's gone. This is Core NATS's at-most-once, fire-and-forget contract: if nobody was listening at the moment of publish, the message doesn't exist anymore. Confirm this is genuinely expected, not a fluke, by publishing a third message with the subscriber still down, then bringing the subscriber back — same result.

---

## Step 3 — JetStream: Create a Stream and Durable Consumer

Now do the same thing, but with persistence.

Create a stream that captures the `orders.>` subject hierarchy:
```bash
nats stream add ORDERS \
  --subjects "orders.>" \
  --storage file \
  --retention limits \
  --max-msgs=-1 \
  --max-age=1h \
  --server localhost:4222
```
Accept the defaults it prompts for (or pass `--defaults` to skip prompts).

Confirm it exists:
```bash
nats stream ls
nats stream info ORDERS
```

Publish a few messages — note we're publishing to the same `orders.*` subjects as before, but now a Stream is capturing them regardless of whether any subscriber is live:
```bash
nats pub "orders.created" '{"orderId": 101}' --server localhost:4222
nats pub "orders.created" '{"orderId": 102}' --server localhost:4222
nats pub "orders.created" '{"orderId": 103}' --server localhost:4222
```

Check the stream captured them even with no subscriber connected:
```bash
nats stream info ORDERS
# Look at "State" -> Messages: should show 3
```

---

## Step 4 — Durable Consumer: Read, Restart, and Replay

Create a durable, explicit-ack consumer:
```bash
nats consumer add ORDERS my-durable-consumer \
  --filter "orders.created" \
  --ack explicit \
  --deliver all \
  --replay instant \
  --server localhost:4222
```

Read messages via the durable consumer:
```bash
nats consumer next ORDERS my-durable-consumer --count 3 --server localhost:4222
```
You'll see all 3 messages, in order, including the ones published while nobody was subscribed in Step 3 — this is the direct contrast with Step 2.

Now publish two more messages, then simulate a "consumer restart" by just re-running `consumer next` fresh — a durable consumer remembers exactly where it left off:
```bash
nats pub "orders.created" '{"orderId": 104}' --server localhost:4222
nats pub "orders.created" '{"orderId": 105}' --server localhost:4222

nats consumer next ORDERS my-durable-consumer --count 2 --server localhost:4222
```
Only the 2 new messages come back — the consumer's position persisted across the "restart," proving durable consumers don't redeliver what's already been acked, and don't lose anything published while disconnected either.

To prove replay works, create a second, fresh consumer against the same stream and read from the beginning:
```bash
nats consumer add ORDERS replay-consumer \
  --filter "orders.created" \
  --ack explicit \
  --deliver all \
  --server localhost:4222

nats consumer next ORDERS replay-consumer --count 5 --server localhost:4222
```
This new consumer sees all 5 historical messages from the start, even though `my-durable-consumer` already consumed them — each consumer tracks its own independent position against the same underlying persisted stream.

---

## Step 5 — Try the KV Store (Built on JetStream)

```bash
nats kv add config-bucket --server localhost:4222
nats kv put config-bucket feature.flag "enabled"
nats kv get config-bucket feature.flag
nats kv history config-bucket feature.flag
```
This is JetStream underneath, wrapped in a simple key-value API — useful for small shared config without deploying a separate system like etcd or Consul.

---

## Cleanup
```bash
docker rm -f nats-lab
```

## What to Explore Next
- Try `--retention workqueue` instead of `limits` on a new stream, add two consumers, and observe that each message goes to exactly one consumer, not both — classic work-distribution behavior.
- Run a 3-node NATS cluster locally with `docker compose` and kill one node mid-publish to see the others keep serving.
- Use `nats request`/`nats reply` to try the request-reply pattern and inspect the auto-generated inbox subject with `nats sub ">"` running alongside.
- Set `--max-ack-pending` low on a consumer and publish a burst of messages faster than you ack them, to see flow control kick in.
