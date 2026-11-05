# CloudFormation Updates, Rollbacks & Safety

> Part of the [CloudFormation notes](./cloud-formation.md). Previous: [Fundamentals](./cloud-formation.md). Next: [Composition & Extensibility](./cloudformation-composition-and-extensibility.md).
>
> Templates pass cfn-lint 1.57. CLI flags were checked against `aws cloudformation <cmd> help` on AWS CLI 2.36. Behaviour comes from the AWS documentation (see the verification note in [part 1](./cloud-formation.md)).

Most CloudFormation incidents happen during **updates**: a property change that silently replaces a database, a rollback that fails half-way, or drift that breaks the next deploy. This page is about making updates predictable and survivable.

---

## 1. Update behaviours: know them before you change anything

Every property in the resource reference documents its **Update requires** value:

| Behaviour | What happens | Example |
|---|---|---|
| **No interruption** | Updated in place, physical ID unchanged | S3 `VersioningConfiguration`, tags on most resources, SQS `VisibilityTimeout` |
| **Some interruption** | Updated in place but the resource restarts or is briefly unavailable | EC2 `InstanceType` (stop/start, EBS-backed), RDS `DBInstanceClass` (reboot / Multi-AZ failover) |
| **Replacement** | **A new resource is created** (new physical ID), references are updated, then the **old one is deleted** in the cleanup phase | S3 `BucketName`, RDS `DBInstanceIdentifier`/`Engine`/`StorageEncrypted`/`DBSubnetGroupName` (some), EC2 `ImageId`/`SubnetId`/`AvailabilityZone`, DynamoDB `TableName`/`KeySchema`, SQS `QueueName`/`FifoQueue` |

Consequences of replacement:
- **Custom names cause failures.** The new resource can't be created while the old one still has the name. You get `CloudFormation cannot update a stack when a custom-named resource requires replacing. Rename acme-logs and update the stack again.` This is why AWS recommends **not hard-coding names** for replaceable resources (let CloudFormation generate them, and export or SSM-publish them instead).
- **Data loss.** The old RDS instance, DynamoDB table or bucket is deleted after the new one is created, unless `UpdateReplacePolicy` says otherwise (§3).
- **Changing the logical ID** (renaming the key in the template) is always a create + delete. Use [stack refactoring](#8-refactoring-rename-logical-ids-or-move-resources-between-stacks).

---

## 2. Change sets: CloudFormation's "plan"

```bash
aws cloudformation create-change-set --stack-name base --change-set-name v2 \
  --template-body file://base-v2.yaml --parameters ParameterKey=Env,UsePreviousValue=true \
  --capabilities CAPABILITY_IAM --include-nested-stacks
aws cloudformation wait change-set-create-complete --stack-name base --change-set-name v2
aws cloudformation describe-change-set --stack-name base --change-set-name v2 \
  --query 'Changes[].ResourceChange.{Id:LogicalResourceId,Action:Action,Replacement:Replacement,Scope:Scope,Causing:Details[].CausingEntity}'
aws cloudformation execute-change-set --stack-name base --change-set-name v2
```

Reading a change set:

| Field | Values | What to look for |
|---|---|---|
| `Action` | `Add`, `Modify`, `Remove`, `Import`, `Dynamic` | Unexpected `Remove` |
| **`Replacement`** | `True`, `False`, **`Conditional`** | `True` on anything stateful = STOP. `Conditional` means it depends on a value that's only known at execution time (e.g. an attribute of another resource being replaced) |
| `Scope` | `Properties`, `Tags`, `Metadata`, `CreationPolicy`, `UpdatePolicy`, `DeletionPolicy` | Policy-only changes are safe |
| `Details[].Evaluation` | `Static`, `Dynamic` | Dynamic = decided during execution |
| `Details[].ChangeSource` | `DirectModification`, `ResourceReference`, `ParameterReference`, `ResourceAttribute` | *Why* it changes |

```jsonc
[
  {"Id":"LogsBucket","Action":"Modify","Replacement":"True", "Scope":["Properties"]},   // BucketName changed → new bucket
  {"Id":"AppConfig", "Action":"Modify","Replacement":"False","Scope":["Tags"]}
]
```

Change set facts:
- `aws cloudformation deploy` **creates and executes a change set for you** (you'll see `REVIEW_IN_PROGRESS` on new stacks). Add `--no-execute-changeset` to stop at review, which is the right default in CI ([part 4](./cloudformation-tooling-cicd-and-troubleshooting.md)).
- **A change set doesn't guarantee the update will succeed.** It only describes intent. It can't predict service-side failures (quotas, IAM, name clashes).
- A change set goes stale if the stack changes, and executing it then fails.
- **Drift-aware change sets** (`--deployment-mode REVERT_DRIFT`) compare the *actual* resource state, the previous deployment and the template, so manual console changes show up and get reverted, instead of being silently ignored. Standard change sets compare the template only against the *last template*, so they miss drift.
- `--include-nested-stacks` shows the changes inside child stacks too.

---

## 3. DeletionPolicy and UpdateReplacePolicy

| Value | On stack delete / resource removal (`DeletionPolicy`) | On replacement (`UpdateReplacePolicy`) |
|---|---|---|
| `Delete` (default for most) | Resource deleted | Old resource deleted |
| `Retain` | Resource kept, but no longer managed (orphaned) | Old resource kept (and orphaned) |
| `RetainExceptOnCreate` | Kept, **except** when the stack's *creation* fails (so failed first deploys don't leave orphans) | — |
| `Snapshot` | Final snapshot, then delete. Supported: RDS DBInstance/DBCluster, EBS Volume, ElastiCache, Neptune, DocumentDB, Redshift | Same |

The stateful template, with every safety control (lint-clean):
```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: Stateful resources with every safety control
Parameters:
  SubnetGroup: { Type: String }
Resources:
  DbKey:
    Type: AWS::KMS::Key
    DeletionPolicy: Retain
    UpdateReplacePolicy: Retain
    Properties:
      EnableKeyRotation: true
      PendingWindowInDays: 30
      KeyPolicy:
        Version: "2012-10-17"
        Statement:
          - Sid: root
            Effect: Allow
            Principal: { AWS: !Sub "arn:${AWS::Partition}:iam::${AWS::AccountId}:root" }
            Action: "kms:*"
            Resource: "*"
  Database:
    Type: AWS::RDS::DBInstance
    DeletionPolicy: Snapshot
    UpdateReplacePolicy: Snapshot
    Properties:
      Engine: postgres
      EngineVersion: "18"
      DBInstanceClass: db.t4g.medium
      AllocatedStorage: "50"
      StorageEncrypted: true
      KmsKeyId: !Ref DbKey
      MasterUsername: appadmin
      ManageMasterUserPassword: true
      DBSubnetGroupName: !Ref SubnetGroup
      MultiAZ: true
      DeletionProtection: true
      BackupRetentionPeriod: 14
      CopyTagsToSnapshot: true
Outputs:
  Endpoint:
    Value: !GetAtt Database.Endpoint.Address
  SecretArn:
    Value: !GetAtt Database.MasterUserSecret.SecretArn
```

Two cfn-lint findings to remember:
```text
W3011 Both 'UpdateReplacePolicy' and 'DeletionPolicy' are needed to protect resource from deletion
W3691 Engine version '16.4' for engine 'postgres' is deprecated and cannot be used to create new RDS DB instances
```
- **`DeletionPolicy: Retain` alone does not protect against replacement.** Set both.
- Pinned minor engine versions go stale. Pin a supported major (cfn-lint's AWS data flagged `16`, `16.4` and `17` as unavailable for new instances here, and accepted `18`). Let `AutoMinorVersionUpgrade` handle patches, and pick a major deliberately.

Layers of protection for a database:
1. `DeletionPolicy`/`UpdateReplacePolicy: Snapshot` (or `Retain`), so CloudFormation won't destroy the data.
2. `DeletionProtection: true`, so *the service itself* refuses deletion, whoever asks.
3. A **stack policy** that denies `Update:Replace`/`Update:Delete` on the resource (§4).
4. **Termination protection** on the stack (§4).
5. Backups outside CloudFormation (AWS Backup, cross-region copies).
6. `ManageMasterUserPassword: true`: RDS generates and rotates the password in Secrets Manager, so no secret ever passes through CloudFormation.

---

## 4. Stack policies and termination protection

### Stack policy (validated JSON)
A stack policy is a JSON document **attached to the stack** that controls which **updates** are allowed on which resources. It's evaluated for *every* update, regardless of who runs it:
```json
{
  "Statement": [
    { "Effect": "Allow", "Action": "Update:*", "Principal": "*", "Resource": "*" },
    { "Effect": "Deny",  "Action": ["Update:Replace", "Update:Delete"], "Principal": "*",
      "Resource": "LogicalResourceId/Database" },
    { "Effect": "Deny",  "Action": "Update:*", "Principal": "*", "Resource": "*",
      "Condition": { "StringEquals": { "ResourceType": ["AWS::KMS::Key"] } } }
  ]
}
```
```bash
aws cloudformation set-stack-policy --stack-name data --stack-policy-body file://stack-policy.json
aws cloudformation get-stack-policy --stack-name data
# one-off override for a planned change (temporary, only for this update):
aws cloudformation update-stack --stack-name data ... --stack-policy-during-update-body file://allow-db-replace.json
```
- Actions: `Update:Modify`, `Update:Replace`, `Update:Delete`, `Update:*`.
- **Once a policy is set, anything it doesn't allow is denied**, so always start with an `Allow Update:*`.
- It protects against **stack updates only**. It doesn't stop stack *deletion* (that's termination protection), and it doesn't stop direct API or console changes (that's IAM and service-level protection).
- An update that violates the policy fails with `Action denied by stack policy`, and the stack rolls back.

### Termination protection
```bash
aws cloudformation update-termination-protection --stack-name data --enable-termination-protection
aws cloudformation delete-stack --stack-name data
# → An error occurred (ValidationError): Stack [data] cannot be deleted while TerminationProtection is enabled
```
It's off by default. Turn it on for every production and stateful stack. Nested stacks inherit the setting from the root stack.

---

## 5. Rollbacks and recovering from `UPDATE_ROLLBACK_FAILED`

### Rollback triggers: roll back on *metrics*, not just API errors
```json
{
  "RollbackTriggers": [
    { "Arn": "arn:aws:cloudwatch:us-east-1:123456789012:alarm:api-5xx-high", "Type": "AWS::CloudWatch::Alarm" }
  ],
  "MonitoringTimeInMinutes": 15
}
```
```bash
aws cloudformation update-stack ... --rollback-configuration file://rollback-config.json
```
CloudFormation watches the alarms during the update **and for `MonitoringTimeInMinutes` afterwards**. If an alarm fires, the whole update is rolled back automatically, even though every resource "succeeded". This is how you make a bad Lambda or ECS rollout undo itself.

### Faster iteration: don't roll back while developing
```bash
aws cloudformation create-stack ... --disable-rollback      # keep what succeeded, inspect the failure
aws cloudformation update-stack ... --disable-rollback      # stack goes to UPDATE_FAILED, fix the template, update again
aws cloudformation rollback-stack --stack-name app          # when you decide to roll back after all
```
Avoid this in production pipelines, where automatic rollback is the safety net.

### When the rollback itself fails
`UPDATE_ROLLBACK_FAILED` means CloudFormation tried to put things back and couldn't. Typical causes:
- Someone **deleted or changed a stack resource by hand** (the rollback can't find or restore it).
- **Missing IAM permissions** for the *rollback* direction (the role could create but not delete).
- A **service limit** or an externally deleted dependency (a deleted KMS key, a missing subnet).
- A resource stuck in a provisioning state (e.g. an ECS service never stabilising).

Recovery:
```bash
# 1. read the events to find the resource that failed to roll back
aws cloudformation describe-stack-events --stack-name app \
  --query 'StackEvents[?ResourceStatus==`UPDATE_FAILED`].[LogicalResourceId,ResourceStatusReason]'
# 2a. fix the cause (re-create the deleted thing, fix permissions), then:
aws cloudformation continue-update-rollback --stack-name app
# 2b. or skip the broken resources — CloudFormation marks them as rolled back without touching them:
aws cloudformation continue-update-rollback --stack-name app --resources-to-skip OrdersService NestedStack.Resource
```
After skipping, **the stack's view and reality disagree** for those resources. Next, update the template to match reality (or bring reality back to the template), otherwise the next update can fail the same way. AWS Support can sometimes help with stacks that are otherwise unrecoverable.

### `ROLLBACK_COMPLETE` after the first create
There's nothing to update, so delete the stack (`delete-stack`) and create it again. Many pipelines check for this status first and delete automatically.

### `DELETE_FAILED`
Common causes: a non-empty S3 bucket (CloudFormation won't empty it, so empty it first, or use a custom resource / lifecycle rule), a security group still referenced by ENIs outside the stack, an export that's imported elsewhere, or termination protection on a nested stack.
```bash
aws cloudformation delete-stack --stack-name app --retain-resources LogsBucket      # skip what can't be deleted
aws cloudformation delete-stack --stack-name app --deletion-mode FORCE_DELETE_STACK # stack stuck in DELETE_FAILED
```

---

## 6. Drift detection

Drift = a stack resource's **actual** configuration differs from what CloudFormation last deployed (console edits, scripts, other tools).
```bash
ID=$(aws cloudformation detect-stack-drift --stack-name app --query StackDriftDetectionId --output text)
aws cloudformation describe-stack-drift-detection-status --stack-drift-detection-id $ID   # StackDriftStatus: DRIFTED / IN_SYNC
aws cloudformation describe-stack-resource-drifts --stack-name app \
  --stack-resource-drift-status-filters MODIFIED DELETED \
  --query 'StackResourceDrifts[].{Id:LogicalResourceId,Status:StackResourceDriftStatus,Diff:PropertyDifferences[].[PropertyPath,ExpectedValue,ActualValue]}'
```
| Resource status | Meaning |
|---|---|
| `IN_SYNC` | Matches |
| `MODIFIED` | Properties differ (`PropertyDifferences` shows expected vs actual) |
| `DELETED` | The resource is gone |
| `NOT_CHECKED` | The resource type doesn't support drift detection |

Limits: drift detection only checks **properties you set in the template** (defaults you didn't specify aren't compared), not every resource type supports it, and it **doesn't fix anything**. To correct drift, either update the template to match reality, or use a **drift-aware change set** (`--deployment-mode REVERT_DRIFT`) to push the template's values back. Schedule detection (EventBridge → Lambda, or AWS Config's `cloudformation-stack-drift-detection-check` rule) and alert on `DRIFTED`.

---

## 7. Importing existing resources

Bring resources created outside CloudFormation (console, scripts, a retained resource from another stack) under management **without recreating them**.

```yaml
# import.yaml — every imported resource MUST have a DeletionPolicy (lint-clean)
AWSTemplateFormatVersion: "2010-09-09"
Resources:
  LegacyBucket:
    Type: AWS::S3::Bucket
    DeletionPolicy: Retain
    UpdateReplacePolicy: Retain
    Properties:
      BucketName: acme-legacy-reports
      VersioningConfiguration: { Status: Enabled }
  LegacyQueue:
    Type: AWS::SQS::Queue
    DeletionPolicy: Retain
    UpdateReplacePolicy: Retain
    Properties:
      QueueName: legacy-jobs
```
```bash
cat > to-import.json <<'J'
[
  {"ResourceType":"AWS::S3::Bucket","LogicalResourceId":"LegacyBucket","ResourceIdentifier":{"BucketName":"acme-legacy-reports"}},
  {"ResourceType":"AWS::SQS::Queue","LogicalResourceId":"LegacyQueue","ResourceIdentifier":{"QueueUrl":"https://sqs.us-east-1.amazonaws.com/123456789012/legacy-jobs"}}
]
J
aws cloudformation create-change-set --stack-name legacy --change-set-name import-1 \
  --change-set-type IMPORT --resources-to-import file://to-import.json --template-body file://import.yaml
aws cloudformation execute-change-set --stack-name legacy --change-set-name import-1    # → IMPORT_COMPLETE
aws cloudformation detect-stack-drift --stack-name legacy                               # verify template == reality
```
Rules:
- Every imported resource needs a `DeletionPolicy` (any value), so you decide its fate up front.
- The template properties should **match the real configuration**. Import doesn't change the resource, so any mismatch is immediate drift. Run drift detection straight after the import and fix the template.
- Import changes can't add or modify other resources in the same operation.
- The identifier keys (`BucketName`, `QueueUrl`, `TableName`, `InstanceId` ...) are listed per type in `get-template-summary` → `ResourcesToImport`.

**Auto-import** (`--import-existing-resources` on a normal change set) adopts existing resources that have **custom names** matching the template, which is handy for recovering from a deleted stack whose resources were retained. Resources without custom names (EC2 instances, for example) still need `--resources-to-import`.

Don't have a template for what exists at all? Use the **IaC generator** (`start-resource-scan` → `create-generated-template`), which scans the account and writes a template plus the import mapping ([part 4](./cloudformation-tooling-cicd-and-troubleshooting.md#6-iac-generator-templates-from-existing-resources)).

---

## 8. Refactoring: rename logical IDs or move resources between stacks

**Stack refactoring** (`create-stack-refactor` / `execute-stack-refactor`) lets you rename logical IDs and move resources between stacks **without replacing them**. It's the CloudFormation counterpart of Terraform's `moved` blocks.
```bash
aws cloudformation create-stack-refactor \
  --description "split monolith: move db to data stack, rename bucket" \
  --stack-definitions StackName=monolith,TemplateBody@=file://monolith-new.yaml \
                      StackName=data,TemplateBody@=file://data.yaml \
  --enable-stack-creation \
  --resource-mappings 'Source={StackName=monolith,LogicalResourceId=Database},Destination={StackName=data,LogicalResourceId=OrdersDb}' \
                      'Source={StackName=monolith,LogicalResourceId=LogsBucket},Destination={StackName=monolith,LogicalResourceId=AppLogs}'
aws cloudformation describe-stack-refactor --stack-refactor-id <id>              # validate
aws cloudformation list-stack-refactor-actions --stack-refactor-id <id>          # what will move
aws cloudformation execute-stack-refactor --stack-refactor-id <id>
```
`--enable-stack-creation` lets the destination stack be created as part of the refactor. Before this API existed, the only way was the **retain → remove → import** dance: set `DeletionPolicy: Retain` → remove the resource from stack A (it gets orphaned) → import it into stack B. That still works everywhere, but it's three deployments and risky.

---

## 9. Safe update checklist

- [ ] Change set reviewed: **no `Replacement: True` on stateful resources**, no unexpected `Remove`
- [ ] Stateful resources: `DeletionPolicy` + `UpdateReplacePolicy` (Snapshot/Retain) + service deletion protection
- [ ] No hard-coded names on replaceable resources, unless you've accepted that renames need a migration
- [ ] Stack policy on data stacks. Termination protection on prod stacks
- [ ] Rollback triggers on alarms for application stacks
- [ ] Deploy role has **both create and delete** permissions (so rollbacks can succeed)
- [ ] No manual changes to stack resources. Scheduled drift detection
- [ ] Logical IDs are stable. Use stack refactoring for renames and moves
- [ ] A runbook for `UPDATE_ROLLBACK_FAILED` (`continue-update-rollback`, `--resources-to-skip`)

Next: [Composition & Extensibility →](./cloudformation-composition-and-extensibility.md)
