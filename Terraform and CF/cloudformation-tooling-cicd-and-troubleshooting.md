# CloudFormation Tooling, CI/CD & Troubleshooting

> Part of the [CloudFormation notes](./cloud-formation.md). Previous: [Composition & Extensibility](./cloudformation-composition-and-extensibility.md). Next: [Hands-on Labs](./cloudformation-hands-on-labs.md).
>
> **Actually run for this page:** cfn-lint 1.57.2, cfn-guard 3.2.1 (real rule results and exit codes) and AWS CDK 2.1145 (`cdk synth` output analysed). CLI flags were checked against AWS CLI 2.36.

---

## 1. The tool map

| Stage | Tool | What it catches |
|---|---|---|
| Authoring | VS Code + cfn-lint extension, **rain fmt**, Infrastructure Composer (visual, replaced the old Designer) | Typos, schema errors as you type |
| Static validation | **cfn-lint** | Invalid properties and values, wrong `Ref`/`GetAtt`, deprecated engines and runtimes, missing policies, best-practice warnings |
| Policy | **cfn-guard**, Checkov, cfn-nag | Your org's rules (encryption, versioning, tags, no public access) |
| Server-side policy | **Hooks** (Guard/Lambda), Control Tower proactive controls | The same rules, enforced for every deployment ([part 3 §9](./cloudformation-composition-and-extensibility.md#9-hooks-proactive-policy-checks-inside-cloudformation)) |
| Integration test | **taskcat** (deploys to N regions, then deletes) | Real deploy failures, regional differences |
| Higher-level authoring | **SAM** (serverless), **CDK** (TS/Python/Java/Go/.NET), Pulumi/Terraform (alternatives) | Boilerplate, loops, abstractions |
| Deploy | `aws cloudformation deploy`, **rain deploy**, SAM/CDK CLIs, **Git sync**, CodePipeline, GitHub Actions | — |
| Brownfield | **IaC generator**, `cdk migrate`, import | Bringing existing resources under management |

---

## 2. cfn-lint and cfn-guard (real results)

### cfn-lint
```bash
pip install cfn-lint                       # or: brew install cfn-lint
cfn-lint templates/**/*.yaml               # E = error, W = warning, I = info
cfn-lint -f sarif templates/*.yaml > cfn-lint.sarif     # GitHub code-scanning annotations
cfn-lint --regions us-east-1 eu-west-1 -- t.yaml        # validate against each region's resource availability
cfn-lint -i W3005 -- t.yaml                # ignore a rule
```
What it caught while these notes were written:

| Rule | Finding | Lesson |
|---|---|---|
| `E0000` | `did not find expected key` on `!Base64 !Sub "x"` | Two short-form tags can't sit on one YAML node |
| `E3030` | `'NotARealType' is not one of ['String', 'StringList']` | Enum validation from the real resource schema |
| `E3009` | `'dnf' was unexpected` in `AWS::CloudFormation::Init` packages | cfn-init only supports `yum/rpm/apt/python/rubygems/msi` |
| `E6101` | `'OrdersQueue' is not one of [... 'ordersQueue' ...]` | `Fn::ForEach` logical IDs are case-sensitive |
| `W2001` | `Parameter DbPassword not used` | Dead parameters |
| `W3011` | `Both 'UpdateReplacePolicy' and 'DeletionPolicy' are needed` | Retain alone doesn't survive replacement |
| `W3691` | `Engine version '16.4' for engine 'postgres' is deprecated` | Pinned versions go stale |
| `W3005` | Redundant `DependsOn` already enforced by a `GetAtt` (in **CDK's own output**) | Harmless, and shows the linter reads generated templates too |

`aws cloudformation validate-template` only checks **syntax and structure**. It doesn't validate property names or values. Always use cfn-lint.

### cfn-guard: your rules as code
```text
# rules.guard
let buckets = Resources.*[ Type == 'AWS::S3::Bucket' ]

rule s3_versioning_enabled when %buckets !empty {
  %buckets.Properties.VersioningConfiguration.Status == 'Enabled'
    <<S3 buckets must have versioning enabled>>
}

rule s3_retained when %buckets !empty {
  %buckets.DeletionPolicy == 'Retain'
  %buckets.UpdateReplacePolicy == 'Retain'
    <<S3 buckets must set DeletionPolicy and UpdateReplacePolicy to Retain>>
}

let dbs = Resources.*[ Type == 'AWS::RDS::DBInstance' ]
rule rds_hardened when %dbs !empty {
  %dbs.Properties.StorageEncrypted == true
  %dbs.Properties.DeletionProtection == true
  %dbs.Properties.MasterUserPassword not exists
    <<RDS must be encrypted, deletion-protected, and use ManageMasterUserPassword>>
}
```
Real runs:
```text
$ cfn-guard validate -r rules.guard -d import.yaml -S all
import.yaml Status = PASS
SKIP rules   rds_hardened             SKIP        ← no RDS in this template
PASS rules   s3_versioning_enabled    PASS
             s3_retained              PASS

$ cfn-guard validate -r rules.guard -d anatomy.yaml
anatomy.yaml Status = FAIL
FAILED rules  s3_versioning_enabled FAIL   s3_retained FAIL
Resource = DebugBucket {
  Rule = s3_versioning_enabled {
    Check = %buckets[*].Properties.VersioningConfiguration.Status EQUALS "Enabled" {
      Message = S3 buckets must have versioning enabled
      RequiredPropertyError { PropertyPath = /Resources/DebugBucket[L:55,C:4]
                              MissingProperty = Properties.VersioningConfiguration.Status }
$ echo $?
19                                              ← non-zero → fails the CI job

$ cfn-guard validate -r rules.guard -d db-safety.yaml --show-summary all
db-safety.yaml Status = PASS    rds_hardened PASS
```
Guard rules also run against **JSON plans and any JSON/YAML** (Terraform plan JSON, Kubernetes manifests), as **Guard Hooks** server-side, and as AWS Config custom rules. There's a ready-made rule library in the `aws-guard-rules-registry` repo, mapped to CIS, PCI and NIST.

---

## 3. SAM

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31          # SAM is a CloudFormation macro
Globals:
  Function: { Runtime: python3.13, Timeout: 10, Tracing: Active, Architectures: [arm64] }
Resources:
  OrdersApi:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/orders/
      Handler: app.handler
      Policies: [DynamoDBCrudPolicy: { TableName: !Ref OrdersTable }]   # policy templates
      Events:
        Create: { Type: HttpApi, Properties: { Path: /orders, Method: post } }
      AutoPublishAlias: live
      DeploymentPreference: { Type: Canary10Percent5Minutes, Alarms: [!Ref ErrorsAlarm] }   # CodeDeploy traffic shifting
  OrdersTable:
    Type: AWS::Serverless::SimpleTable
```
```bash
sam build && sam local invoke OrdersApi -e event.json     # run locally in Docker
sam local start-api
sam deploy --guided                                        # writes samconfig.toml
sam sync --watch --stack-name dev-orders                   # fast dev loop (skips CFN for code changes — DEV ONLY)
sam validate --lint                                        # cfn-lint on the transformed template
```
SAM expands into normal CloudFormation (Lambda, IAM role, API Gateway, CodeDeploy). You can see the result with `get-template --template-stage Processed`.

---

## 4. CDK: the generated CloudFormation, measured

A small CDK app (JavaScript):
```javascript
const bucket = new s3.Bucket(this, 'Reports', {
  versioned: true, encryption: s3.BucketEncryption.S3_MANAGED,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, enforceSSL: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});
const dlq = new sqs.Queue(this, 'Dlq');
const queue = new sqs.Queue(this, 'Orders', { deadLetterQueue: { queue: dlq, maxReceiveCount: 5 } });
const fn = new lambda.Function(this, 'Worker', { runtime: lambda.Runtime.PYTHON_3_13, handler: 'index.handler',
  code: lambda.Code.fromInline('def handler(e, c):\n    print(e)') });
fn.addEventSource(new SqsEventSource(queue, { batchSize: 10 }));
bucket.grantWrite(fn);
```
`cdk synth` (CDK 2.1145) produced:
```text
9 resources, 6,242 bytes of JSON:
  AWS::S3::Bucket                   Reports65402A0A        DeletionPolicy=Retain   ← removalPolicy
  AWS::S3::BucketPolicy             ReportsPolicyA13B441D                         ← enforceSSL → deny non-TLS
  AWS::SQS::Queue                   DlqD1FAA4AD            DeletionPolicy=Delete   ← CDK default for queues
  AWS::SQS::Queue                   OrdersA9B65338         DeletionPolicy=Delete
  AWS::IAM::Role                    WorkerServiceRole8543584E
  AWS::IAM::Policy                  WorkerServiceRoleDefaultPolicyAE71B5FA         ← from grantWrite + event source:
        sqs:ReceiveMessage,ChangeMessageVisibility,GetQueueUrl,DeleteMessage...   (scoped to the queue ARN)
        s3:DeleteObject*,PutObject,PutObjectLegalHold,PutObjectRetention...       (scoped to the bucket)
  AWS::Lambda::Function             Worker11F36D0F
  AWS::Lambda::EventSourceMapping   WorkerSqsEventSourceOrdersC8818BACE592CAFB
  AWS::CDK::Metadata                CDKMetadata
Parameters: BootstrapVersion            ← requires `cdk bootstrap` in each account/region
```
CDK facts that matter in production:
- **CDK *is* CloudFormation.** Every CloudFormation rule on these pages still applies: replacement, rollback, limits, drift. Learn CloudFormation first.
- **Logical IDs are construct-path + hash** (`Reports65402A0A`). Moving a construct in the tree, or changing its `id`, changes the logical ID, which **means replacement**. Use `this.overrideLogicalId()` / `renameLogicalId`, or stack refactoring, when restructuring code.
- `cdk diff` before every deploy. `cdk deploy --require-approval broadening` prompts when IAM or security-group permissions widen.
- `cdk bootstrap` creates the staging bucket, ECR repo and deploy roles (`cdk-hnb659fds-*`). Bootstrap with `--trust` for cross-account pipelines.
- **`cdk deploy --hotswap` / `cdk watch` bypass CloudFormation** for Lambda/ECS code. That's fast for development, and it **causes drift**. Never use it in prod.
- **Escape hatches:** `(bucket.node.defaultChild as CfnBucket).addPropertyOverride('...')` for properties the L2 doesn't expose. L1 `Cfn*` constructs map one-to-one to CloudFormation.
- **CDK Pipelines** (`pipelines.CodePipeline`) gives you a self-mutating pipeline with stages and waves across accounts.
- `cdk-nag` adds Guard/cfn-nag-style rule packs (AwsSolutions, HIPAA, NIST) at synth time.

---

## 5. rain and taskcat

```bash
rain fmt template.yaml                 # canonical formatting (and JSON → YAML)
rain deploy template.yaml app          # interactive params, change set preview, live progress, readable errors
rain watch app                         # stream events
rain build AWS::S3::Bucket             # skeleton for any type
rain forecast template.yaml app        # predicts failures (name clashes, missing permissions) before deploying
```
```yaml
# .taskcat.yml — deploy a template into several regions, assert success, clean up
project:
  name: orders
  regions: [us-east-1, eu-west-1, ap-southeast-2]
tests:
  default:
    template: templates/main.yaml
    parameters:
      Env: test
      BucketSuffix: $[taskcat_random-string]
```

---

## 6. IaC generator: templates from existing resources

```bash
aws cloudformation start-resource-scan                                  # scans the account/region (takes minutes)
aws cloudformation list-resource-scan-resources --resource-scan-id <id> \
  --resource-type-prefix AWS::S3 --query 'Resources[].ResourceIdentifier'
aws cloudformation create-generated-template --generated-template-name legacy-s3 \
  --resources ResourceType=AWS::S3::Bucket,ResourceIdentifier={BucketName=acme-legacy-reports}
aws cloudformation get-generated-template --generated-template-name legacy-s3 --format YAML
```
The output is a template with **every property spelled out**, plus a `DeletionPolicy`, ready to import ([part 2 §7](./cloudformation-updates-rollbacks-and-safety.md#7-importing-existing-resources)). You can create a new stack from it directly, or import into an existing stack. Clean it up first (parameters, removing defaults). `cdk migrate --from-scan` turns the same scan into a CDK app.

---

## 7. CI/CD

### Principles
1. **Templates in Git** with cfn-lint + cfn-guard on every PR.
2. **Create a change set on the PR or pre-prod stage, review it, then execute.** Never `deploy` straight to prod unreviewed.
3. **A CloudFormation service role** (`--role-arn`) holds the deploy permissions, and the pipeline identity only needs `cloudformation:*` on its stacks plus `iam:PassRole` for that role. That way, people with CloudFormation access can't use it to grab admin.
4. **OIDC** for GitHub Actions/GitLab, so there are no long-lived keys (the same pattern as the [Terraform CI page](./terraform-environments-and-cicd.md#5-github-actions-with-oidc-no-long-lived-keys)).
5. **Promote the same template artifact** dev → staging → prod, with per-environment parameter files.

### GitHub Actions
```yaml
name: cfn
on:
  pull_request: { paths: ["cfn/**"] }
  push: { branches: [main], paths: ["cfn/**"] }
permissions: { id-token: write, contents: read, pull-requests: write }
concurrency: { group: cfn-orders-prod, cancel-in-progress: false }

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install cfn-lint && cfn-lint -f sarif cfn/**/*.yaml > lint.sarif || true
      - run: cfn-lint cfn/**/*.yaml
      - name: cfn-guard
        run: |
          curl -sSL https://raw.githubusercontent.com/aws-cloudformation/cloudformation-guard/main/install-guard.sh | sh
          ~/.guard/bin/cfn-guard validate -r cfn/rules/ -d cfn/templates/          # exit 19 on violations

  changeset:
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with: { role-to-assume: "arn:aws:iam::123456789012:role/gha-cfn-plan", aws-region: us-east-1 }
      - name: create change set (no execute)
        run: |
          CS=pr-${{ github.run_id }}
          aws cloudformation create-change-set --stack-name orders-prod --change-set-name $CS \
            --template-body file://cfn/templates/orders.yaml \
            --parameters file://cfn/params/prod.json --capabilities CAPABILITY_NAMED_IAM \
            --change-set-type UPDATE
          aws cloudformation wait change-set-create-complete --stack-name orders-prod --change-set-name $CS || true
          aws cloudformation describe-change-set --stack-name orders-prod --change-set-name $CS \
            --query 'Changes[].ResourceChange.[Action,LogicalResourceId,ResourceType,Replacement]' --output table | tee cs.txt
          if grep -E '\|\s*True\s*\|' cs.txt; then echo "::warning::Change set contains REPLACEMENTS"; fi
          [ "${{ github.event_name }}" = "pull_request" ] && aws cloudformation delete-change-set --stack-name orders-prod --change-set-name $CS || echo "CS=$CS" >> $GITHUB_ENV

  deploy:
    needs: changeset
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: prod                         # required reviewers
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with: { role-to-assume: "arn:aws:iam::123456789012:role/gha-cfn-deploy", aws-region: us-east-1 }
      - uses: aws-actions/aws-cloudformation-github-deploy@v1
        with:
          name: orders-prod
          template: cfn/templates/orders.yaml
          parameter-overrides: file:///${{ github.workspace }}/cfn/params/prod.json
          capabilities: CAPABILITY_NAMED_IAM
          role-arn: arn:aws:iam::123456789012:role/cfn-service-role-orders
          no-fail-on-empty-changeset: "1"
          termination-protection: "1"
```
`"No updates are to be performed"` / `The submitted information didn't contain changes` is an **error** from `update-stack` and from change set creation. Pipelines must treat it as success (`no-fail-on-empty-changeset`, or `deploy --no-fail-on-empty-changeset`).

### Other deployment options
- **CodePipeline** CloudFormation actions: `CHANGE_SET_REPLACE` → manual approval → `CHANGE_SET_EXECUTE`, with `TemplateConfiguration` param files per stage.
- **Git sync**: CloudFormation watches a branch in GitHub/GitLab/Bitbucket and deploys a deployment file (`template-file-path`, `parameters`) on each commit. It's the simplest GitOps, but you lose control over review and change sets (it can comment change set info on PRs).
- **StackSets from pipelines**, for org-wide baselines ([part 3 §3](./cloudformation-composition-and-extensibility.md#3-stacksets-one-template-many-accounts-and-regions)).

---

## 8. Troubleshooting: real errors and fixes

```bash
# 90% of debugging: the first FAILED event, oldest first
aws cloudformation describe-stack-events --stack-name app \
  --query 'reverse(StackEvents)[?contains(ResourceStatus,`FAILED`)].[Timestamp,LogicalResourceId,ResourceType,ResourceStatusReason]' --output table
```
Read the **earliest** failure. Later ones are usually `Resource creation cancelled` as a side effect. For nested stacks, open the **child stack's** events (the parent only says `Embedded stack ... was not successfully created`). The console's "Detect root cause" button does the same.

| Error (abridged) | Cause | Fix |
|---|---|---|
| `Template format error: Unresolved resource dependencies [X] in the Resources block` | `Ref`/`GetAtt` to a logical ID that doesn't exist (typo, or a conditional resource) | Fix the name. Wrap conditional refs in `!If` |
| `Template error: instance of Fn::GetAtt references undefined resource` / `...has no attribute` | Wrong attribute name | Check the "Return values" in the docs |
| `Circular dependency between resources: [A, B]` | Mutual references (often SGs) | Separate `SecurityGroupIngress` resources |
| `Requires capabilities : [CAPABILITY_NAMED_IAM]` | IAM resources with names | Add `--capabilities` |
| `Requires capabilities : [CAPABILITY_AUTO_EXPAND]` | Macro / SAM / nested transforms | Add it, and deploy through a change set |
| `X already exists in stack arn:...` / `acme-logs already exists` | Custom name clashes with an existing resource (another stack, a retained orphan, globally unique S3 names) | Rename, import the existing one, or drop the custom name |
| `CloudFormation cannot update a stack when a custom-named resource requires replacing` | A replacement property changed on a custom-named resource | Change the name too, or migrate (refactor/import) |
| `Export X cannot be updated as it is in use by Y` / `Cannot delete export ... in use` | Export lock | Decouple the consumers first ([part 3 §1](./cloudformation-composition-and-extensibility.md#1-sharing-values-between-stacks)) |
| `Stack is in ROLLBACK_COMPLETE state and can not be updated` | The first create failed | Delete and recreate |
| `Stack is in UPDATE_ROLLBACK_FAILED state` | Rollback couldn't restore something | `continue-update-rollback [--resources-to-skip]` ([part 2 §5](./cloudformation-updates-rollbacks-and-safety.md#5-rollbacks-and-recovering-from-update_rollback_failed)) |
| `Stack ... is in UPDATE_IN_PROGRESS state and can not be updated` | Concurrent deploys | Serialise pipelines (concurrency groups) |
| `No updates are to be performed.` | Nothing changed | Treat as success |
| `Resource handler returned message: "User: ... is not authorized to perform: iam:CreateRole"` | The deploy identity or **service role** lacks a permission | Add it. Remember that **rollbacks need delete permissions** |
| `... is not authorized to perform: iam:PassRole` | The caller can't pass the service role | Grant `iam:PassRole` on that role |
| `Resource timed out waiting for completion` / `Received 0 SUCCESS signal(s) out of 2` | cfn-signal never sent (UserData failed, no outbound internet or endpoint to CloudFormation, wrong resource name in cfn-signal) | Check `/var/log/cfn-init.log` and `cloud-init-output.log`. Needs a NAT or VPC endpoint |
| Custom resource stuck `CREATE_IN_PROGRESS` for an hour | Lambda never responded (crash, no response on Delete) | Always respond. Set `ServiceTimeout`. Use crhelper or the Provider framework |
| `The bucket you tried to delete is not empty` | `DELETE_FAILED` on S3 | Empty it, `--retain-resources`, or an emptying custom resource |
| `Embedded stack ... was not successfully created` | A child stack failed | Open the child stack's events |
| `Template may not exceed 51200 bytes` | Inline template too large | `--template-url` / `deploy --s3-bucket` (up to 1 MB) |
| `Limit exceeded: 500 resources` | Template too big | Nested stacks or split stacks |
| `Parameter validation failed: parameter value X for parameter name Y does not exist` | AWS-specific param type: the resource doesn't exist in this account/region | Pass a real ID |
| `Rate exceeded` / `Throttling` | Many parallel StackSet instances or stacks | Lower concurrency, retry with backoff |
| `Encountered unsupported property X` | Property not valid for the type (or a newer property than CloudFormation supports yet) | cfn-lint would have caught it. Check the docs |
| Update "succeeded" but nothing changed | Drift, or the change was in a value CloudFormation doesn't compare | Drift detection, then a drift-aware change set |

---

## 9. CloudFormation vs Terraform vs CDK vs Pulumi

| | CloudFormation (YAML) | CDK | Terraform/OpenTofu | Pulumi |
|---|---|---|---|---|
| Engine | AWS-managed CloudFormation | Generates CloudFormation | Client-side, providers | Client-side, providers (some bridged from Terraform) |
| State | Managed by AWS | Managed by AWS (CloudFormation) | Self-managed backend | Pulumi Cloud or self-managed |
| Rollback | **Automatic** | Automatic (via CloudFormation) | None (fix forward) | None |
| Multi-cloud / SaaS | Registry types only | Same | **Yes** (thousands of providers) | Yes |
| Preview | Change sets (resource-level) | `cdk diff` | `plan` (attribute-level, very detailed) | `preview` |
| Drift handling | Detection + drift-aware change sets | Same | Every plan refreshes and shows drift | Refresh |
| Loops/abstractions | `Fn::ForEach`, modules, macros | **Full languages** | `for_each`, modules | Full languages |
| Multi-account rollout | **StackSets** (native) | CDK Pipelines/StackSets | Workspaces/pipelines (your design) | Stacks/pipelines |
| Day-0 AWS features | Usually at or near launch | Same (L1 `Cfn*`) | Usually fast | Fast |
| Pain points | Verbose YAML, export locks, rollback-failed states, 500-resource limit | Logical-ID churn on refactors, synth complexity | State management, no rollback | State backend, language lock-in per team |

A rule of thumb: **all-in on AWS, with a team that wants AWS to own state and rollback** → CloudFormation via CDK (or SAM for serverless). **Multi-cloud, lots of SaaS, or an existing Terraform estate** → Terraform/OpenTofu. Mixed estates are common: Terraform for accounts and network, CDK/SAM for app stacks, with SSM parameters as the contract between them.

### Migration
- **CloudFormation → Terraform:** keep the resources and **retain** them (set `DeletionPolicy: Retain` on everything, then delete the stack), then `import {}` blocks in Terraform ([Terraform state §6](./terraform-state-deep-dive.md#6-importing-existing-infrastructure)).
- **Terraform → CloudFormation/CDK:** `terraform state rm` (or `removed { destroy = false }`), then a CloudFormation import change set or the IaC generator.
- **CloudFormation YAML → CDK:** `cdk migrate --from-stack` (generates an app from a deployed stack), or `CfnInclude` to wrap the existing template and refactor gradually.

Next: [Hands-on Labs →](./cloudformation-hands-on-labs.md)
