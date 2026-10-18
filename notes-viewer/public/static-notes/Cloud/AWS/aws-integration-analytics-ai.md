# AWS Integration, Analytics & AI — SQS, SNS, EventBridge, Kinesis, Step Functions, API Gateway, Bedrock — Complete Notes

> Part of [AWS hub](./aws.md). Messaging concepts: [Messaging & Distributed Systems Q&A](../../Interview%20Questions/17-messaging-caching-distributed-systems-qna.md).

---

## 1. Messaging & integration
| Service | Pattern | Key facts |
|---|---|---|
| **SQS** | Queue (point-to-point, pull) | **Standard**: at-least-once, best-effort ordering, nearly unlimited throughput. **FIFO**: exactly-once processing, strict ordering per message group, dedup. Visibility timeout, long polling (`WaitTimeSeconds`), retention 1 min–14 days (default 4 d), max message 256 KB (larger via S3 pointer), **DLQ** via redrive policy (`maxReceiveCount`), delay queues |
| **SNS** | Pub/sub (push) | Topics → subscribers (SQS, Lambda, HTTP/S, email, SMS, Firehose); **fan-out** SNS → many SQS queues; message filtering policies; FIFO topics |
| **EventBridge** | Event bus / router | Rules match event patterns → targets; AWS service events, SaaS partner events, custom events; schema registry; archive & replay; **Scheduler** (cron/one-time); **Pipes** (source → filter/enrich → target) |
| **Kinesis Data Streams** | Streaming log (shards, ordered per partition key) | Replay, multiple consumers, retention 24 h–365 d; on-demand or provisioned |
| **Data Firehose** | Managed delivery | Stream → S3/Redshift/OpenSearch/Splunk with buffering & transform |
| **MSK** | Managed Apache Kafka (provisioned/serverless) | Kafka ecosystem compatibility |
| **Amazon MQ** | Managed ActiveMQ/RabbitMQ | Lift-and-shift of JMS/AMQP apps |
| **Step Functions** | Workflow orchestration (state machines, ASL) | Standard (up to 1 yr, exactly-once) vs Express (high volume, 5 min); retries/catch, parallel, map, human approval, 200+ SDK integrations |
| **API Gateway** | Managed APIs | REST (full features: API keys, usage plans, request validation, caching) vs **HTTP APIs** (cheaper/faster, JWT auth) vs WebSocket; Lambda/HTTP/AWS service integrations; throttling; custom domains; authorizers (Cognito, Lambda, IAM) |
| **AppSync** | Managed GraphQL | Real-time subscriptions |

**SNS vs SQS use cases**: SNS to broadcast an event to many systems immediately (order placed → email, analytics, inventory); SQS to buffer work for a consumer to process at its own pace with retries (order processing workers). Combined: **SNS → multiple SQS** for durable fan-out.

**SQS vs Kinesis vs EventBridge**: SQS = task queue, per-message delete, scale consumers freely. Kinesis/MSK = ordered stream, replay, multiple independent readers, analytics. EventBridge = routing events by content between many services/SaaS with low code.

## 2. Analytics
**Athena** (serverless SQL on S3), **Glue** (Data Catalog, crawlers, Spark ETL, Data Quality), **EMR** (Spark/Hadoop on EC2/EKS/serverless), **Redshift** (warehouse), **Lake Formation** (lake permissions/governance), **OpenSearch** (search/logs), **QuickSight** (BI), **Managed Service for Apache Flink** (stream processing), **SageMaker Unified Studio / Lakehouse** (unified data+AI workspace), zero-ETL integrations (Aurora/DynamoDB → Redshift).

Data lake cost/perf tips: partition by date/key, columnar Parquet/ORC + compression, compaction of small files, Iceberg tables (S3 Tables), lifecycle to IA/Glacier for old partitions.

## 3. Generative AI & ML on AWS
| Service | What |
|---|---|
| **Amazon Bedrock** | Fully managed access to foundation models (Anthropic Claude, Amazon Nova, Meta Llama, Mistral, etc.) via one API — serverless, no infra; your data not used to train base models |
| **Bedrock Knowledge Bases** | Managed **RAG**: ingest documents from S3/etc. → chunk → embed → store in a vector store (OpenSearch Serverless, Aurora pgvector, S3 Vectors…) → retrieve + generate with citations |
| **Bedrock Agents / AgentCore** | Agents that plan, call tools/APIs (action groups / Lambda), use memory; AgentCore = runtime, identity, memory, gateway for production agents |
| **Bedrock Guardrails** | Content filters, denied topics, PII redaction, word filters, **contextual grounding checks** (reduce hallucinations), applied to inputs/outputs |
| **SageMaker AI** | Build/train/tune/deploy your own ML models (notebooks, training jobs, endpoints, pipelines, MLOps) |
| **Amazon Q** | AI assistant for business (Q Business) and developers (Q Developer) |
| AI services | Rekognition (vision), Textract (documents), Comprehend (NLP), Transcribe, Polly, Translate, Lex |

- **Bedrock vs SageMaker**: Bedrock = consume/customize existing foundation models via API (fine-tuning, RAG, agents) with no ML infra; SageMaker = full ML platform to build/train/host any model with full control.
- **Embeddings**: numeric vectors representing meaning of text/images; similar content → nearby vectors; used for semantic search, RAG retrieval, clustering (e.g. Titan Text Embeddings, Cohere Embed on Bedrock).
- **RAG architecture on AWS**: documents in S3 → Knowledge Base (chunking + embedding model) → vector store → user query via API Gateway/Lambda → retrieve top-k chunks → prompt FM in Bedrock with context → Guardrails → response with citations; monitoring via CloudWatch, invocation logging, evaluations.
- **Preventing hallucinations**: RAG grounding with trusted sources, contextual grounding checks (Guardrails), instruct model to say "I don't know", lower temperature, citations, evaluation datasets (Bedrock Evaluations), human review for critical outputs.
- **Securing GenAI apps**: IAM least privilege on model invocation, VPC endpoints (PrivateLink) for Bedrock, KMS encryption, Guardrails for prompt-injection/PII, input validation, no secrets in prompts, logging to CloudWatch/S3 with data controls, per-user authorization on retrieved documents.
- **Enterprise chatbot design**: Cognito/Identity Center auth → front end (Amplify/CloudFront) → API Gateway → Lambda/ECS orchestrator → Bedrock (Knowledge Base for company docs, Agents for actions like ticket creation) → Guardrails → DynamoDB for conversation history → CloudWatch + invocation logs; cost controls via model choice, caching, provisioned throughput if steady.
- **Monitoring/governance**: CloudWatch metrics for Bedrock invocations/latency/tokens, model invocation logging, CloudTrail, Guardrails metrics, Bedrock evaluations, cost allocation tags/inference profiles.
