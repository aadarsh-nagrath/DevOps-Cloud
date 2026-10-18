# CloudFormation Hands-on Labs

> Part of the [CloudFormation notes](./cloud-formation.md). Previous: [Tooling, CI/CD & Troubleshooting](./cloudformation-tooling-cicd-and-troubleshooting.md).

These labs need a **sandbox AWS account**. Never run them in production. They use S3, SSM, SQS, SNS, IAM and a small Lambda, all of which cost **nothing or a few cents** if you delete the stacks afterwards (the cleanup is at the end). Every template here passes cfn-lint (`bad.yaml` fails on purpose). The behaviour you'll *observe* (replacement, rollback, export locks) is real CloudFormation, which emulators like LocalStack don't reproduce faithfully.

```bash
export AWS_PROFILE=sandbox AWS_REGION=us-east-1      # a SANDBOX profile
aws sts get-caller-identity                            # confirm the account before every lab session
pip install cfn-lint                                   # used throughout
mkdir -p ~/cfn-labs && cd ~/cfn-labs
```

Each lab: **Goal → Do → Observe → Explain it.**

---

## Lab 0: Console warm-up (from the original notes)
1. CloudFormation → **Create stack** → **Upload a template file** with:
   ```yaml
   AWSTemplateFormatVersion: '2010-09-09'
   Description: Simple S3 bucket creation
   Resources:
     MyNewBucket:
       Type: 'AWS::S3::Bucket'       # no BucketName → CloudFormation generates a unique one
   ```
   (The original version hard-coded `BucketName: my-new-bucket`. S3 names are **global**, so that fails with `already exists` for almost everyone. That's lesson one about custom names.)
2. Watch the **Events** tab, then find the bucket in S3 (note its generated name: `<stack>-mynewbucket-<random>`).
3. Delete the stack and confirm the bucket is gone.
4. Optional: create a stack from the **LAMP sample template** (EC2 + MySQL) to see parameters such as KeyName rendered as dropdowns (AWS-specific parameter types), then delete it.
5. Optional: open **Infrastructure Composer** (the successor to Application Composer and the old Designer), drag in resources, connect them, validate, and export YAML.

---

## Lab 1: Lifecycle, parameters, conditions, outputs, exports
```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: Base storage stack (logs bucket + config parameter)
Parameters:
  Env:
    Type: String
    AllowedValues: [dev, prod]
    Default: dev
  RetentionDays:
    Type: Number
    Default: 30
    MinValue: 1
    MaxValue: 3650
Conditions:
  IsProd: !Equals [!Ref Env, prod]
Mappings:
  EnvConfig:
    dev:  { LogLevel: debug }
    prod: { LogLevel: warn }
Resources:
  LogsBucket:
    Type: AWS::S3::Bucket
    DeletionPolicy: Retain
    UpdateReplacePolicy: Retain
    Properties:
      BucketName: !Sub "acme-${Env}-logs-${AWS::AccountId}"
      VersioningConfiguration:
        Status: !If [IsProd, Enabled, Suspended]
      LifecycleConfiguration:
        Rules:
          - Id: expire
            Status: Enabled
            ExpirationInDays: !Ref RetentionDays
      Tags:
        - { Key: Environment, Value: !Ref Env }
  AppConfig:
    Type: AWS::SSM::Parameter
    Properties:
      Name: !Sub "/acme/${Env}/log-level"
      Type: String
      Value: !FindInMap [EnvConfig, !Ref Env, LogLevel]
Outputs:
  BucketName:
    Value: !Ref LogsBucket
    Export: { Name: !Sub "${AWS::StackName}-BucketName" }
  BucketArn:
    Value: !GetAtt LogsBucket.Arn
    Export: { Name: !Sub "${AWS::StackName}-BucketArn" }
```
```bash
cfn-lint base.yaml
aws cloudformation deploy --stack-name base --template-file base.yaml --parameter-overrides Env=dev
aws cloudformation describe-stack-events --stack-name base \
  --query 'reverse(StackEvents)[].[LogicalResourceId,ResourceStatus]' --output text
aws cloudformation describe-stacks --stack-name base --query 'Stacks[0].Outputs'
aws cloudformation list-exports --query 'Exports[].Name'
aws ssm get-parameter --name /acme/dev/log-level --query Parameter.Value --output text     # debug (from Mappings)
```
**Observe:** `REVIEW_IN_PROGRESS` first (because `deploy` uses a change set), then each resource's `CREATE_IN_PROGRESS` → `CREATE_COMPLETE`. The bucket name has your account ID in it.
**Explain it:** why does `deploy` show `REVIEW_IN_PROGRESS`? What would `Env=prod` change (versioning and log level)?

---

## Lab 2: Change sets reveal replacement
`base-v2.yaml` = base.yaml with two changes: a new tag, and `logs` renamed to `applogs` in `BucketName`:
```bash
sed 's/acme-${Env}-logs/acme-${Env}-applogs/; s/Value: !Ref Env }/Value: !Ref Env }\n        - { Key: Team, Value: platform }/' base.yaml > base-v2.yaml
aws cloudformation create-change-set --stack-name base --change-set-name v2 \
  --template-body file://base-v2.yaml --parameters ParameterKey=Env,UsePreviousValue=true \
  ParameterKey=RetentionDays,UsePreviousValue=true
aws cloudformation wait change-set-create-complete --stack-name base --change-set-name v2
aws cloudformation describe-change-set --stack-name base --change-set-name v2 \
  --query 'Changes[].ResourceChange.{Id:LogicalResourceId,Action:Action,Replacement:Replacement,Scope:Scope}'
```
**Observe:** `LogsBucket` → `Replacement: True` (the BucketName change). Then remove just the rename and create the change set again: `Replacement: False`, `Scope: [Tags]`.
**Then:** execute the replacing change set. Because of `UpdateReplacePolicy: Retain`, the **old bucket survives** as an orphan. Find it with `aws s3 ls | grep acme-dev`. **Explain it:** what would have happened to the old bucket *without* that policy?

**Before Lab 3:** redeploy `base.yaml` (`aws cloudformation deploy --stack-name base --template-file base.yaml --parameter-overrides Env=dev`). That renames the bucket back, which is another replacement, and leaves the stack in the state the later labs expect.

---

## Lab 3: Failed create → rollback → ROLLBACK_COMPLETE
```yaml
Resources:
  Good:
    Type: AWS::SSM::Parameter
    Properties: { Name: /acme/good, Type: String, Value: ok }
  Bad:
    Type: AWS::SSM::Parameter
    DependsOn: Good
    Properties: { Name: /acme/bad, Type: NotARealType, Value: x }
```
```bash
cfn-lint bad.yaml            # E3030 'NotARealType' is not one of ['String', 'StringList']   ← lint catches it...
aws cloudformation create-stack --stack-name broken --template-body file://bad.yaml   # ...CloudFormation does not, until runtime
aws cloudformation wait stack-rollback-complete --stack-name broken
aws cloudformation describe-stack-events --stack-name broken \
  --query 'reverse(StackEvents)[].[LogicalResourceId,ResourceStatus,ResourceStatusReason]' --output table
aws ssm get-parameter --name /acme/good          # ParameterNotFound — the GOOD resource was rolled back too
aws cloudformation update-stack --stack-name broken --template-body file://base.yaml
#  → Stack:arn:... is in ROLLBACK_COMPLETE state and can not be updated.
aws cloudformation delete-stack --stack-name broken
```
**Then repeat with** `--disable-rollback`: the stack ends in `CREATE_FAILED`, `Good` still exists, and you can fix the template and `update-stack`. **Explain it:** when is `--disable-rollback` the right choice, and when is it dangerous?

---

## Lab 4: The export lock
```yaml
Resources:
  Ref:
    Type: AWS::SSM::Parameter
    Properties:
      Name: /acme/consumer/bucket
      Type: String
      Value: !ImportValue base-BucketName
```
```bash
aws cloudformation deploy --stack-name consumer --template-file consumer.yaml
aws cloudformation list-imports --export-name base-BucketName        # → consumer
# try to remove the export from base:
sed '/Export: { Name: !Sub "${AWS::StackName}-BucketName" }/d' base.yaml > base-noexport.yaml
aws cloudformation deploy --stack-name base --template-file base-noexport.yaml \
  --parameter-overrides Env=dev
aws cloudformation describe-stack-events --stack-name base --max-items 5 \
  --query 'StackEvents[].[ResourceStatus,ResourceStatusReason]' --output text
#  → UPDATE_ROLLBACK... "Cannot delete export base-BucketName as it is in use by consumer."
aws cloudformation delete-stack --stack-name base     # also blocked while imported
```
**Explain it:** what's the 4-step procedure to change an exported value? Why do many teams prefer SSM parameters?

---

## Lab 5: Stack policy and termination protection
```bash
cat > policy.json <<'J'
{ "Statement": [
  { "Effect": "Allow", "Action": "Update:*", "Principal": "*", "Resource": "*" },
  { "Effect": "Deny",  "Action": ["Update:Replace","Update:Delete"], "Principal": "*", "Resource": "LogicalResourceId/LogsBucket" } ] }
J
aws cloudformation set-stack-policy --stack-name base --stack-policy-body file://policy.json
aws cloudformation deploy --stack-name base --template-file base-v2.yaml      # rename → replacement → DENIED
#  → update fails and rolls back: "Action denied by stack policy ... [Update:Replace] ... LogicalResourceId/LogsBucket"
aws cloudformation update-termination-protection --stack-name base --enable-termination-protection
aws cloudformation delete-stack --stack-name base
#  → Stack [base] cannot be deleted while TerminationProtection is enabled
aws cloudformation update-termination-protection --stack-name base --no-enable-termination-protection
```

---

## Lab 6: Drift detection and a drift-aware change set
```bash
aws ssm put-parameter --name /acme/dev/log-level --value trace --overwrite      # "someone changed it in the console"
ID=$(aws cloudformation detect-stack-drift --stack-name base --query StackDriftDetectionId --output text)
sleep 10; aws cloudformation describe-stack-drift-detection-status --stack-drift-detection-id $ID --query StackDriftStatus
aws cloudformation describe-stack-resource-drifts --stack-name base --stack-resource-drift-status-filters MODIFIED \
  --query 'StackResourceDrifts[].PropertyDifferences'          # Value: expected debug, actual trace
# a normal deploy of the unchanged template does NOTHING (No changes):
aws cloudformation deploy --stack-name base --template-file base.yaml --parameter-overrides Env=dev
# a drift-aware change set reverts it:
aws cloudformation create-change-set --stack-name base --change-set-name revert \
  --use-previous-template --parameters ParameterKey=Env,UsePreviousValue=true ParameterKey=RetentionDays,UsePreviousValue=true \
  --deployment-mode REVERT_DRIFT
```
**Explain it:** why did the normal deploy see "no changes" even though the parameter was wrong?

---

## Lab 7: Import an existing resource
```bash
aws sqs create-queue --queue-name legacy-jobs                         # created outside CloudFormation
aws s3 mb s3://acme-legacy-reports-$RANDOM                            # use YOUR name below
```
Use `import.yaml` from [part 2 §7](./cloudformation-updates-rollbacks-and-safety.md#7-importing-existing-resources) (edit the bucket name), then:
```bash
aws cloudformation create-change-set --stack-name legacy --change-set-name imp --change-set-type IMPORT \
  --resources-to-import file://to-import.json --template-body file://import.yaml
aws cloudformation execute-change-set --stack-name legacy --change-set-name imp
aws cloudformation describe-stacks --stack-name legacy --query 'Stacks[0].StackStatus'     # IMPORT_COMPLETE
aws cloudformation detect-stack-drift --stack-name legacy                                   # any mismatch → fix the template
```
**Then:** delete the `legacy` stack. Both resources **survive** (`DeletionPolicy: Retain`). Re-adopt them in a new stack with an ordinary change set plus `--import-existing-resources`.

---

## Lab 8: Nested stacks with `package`
Child:
```yaml
AWSTemplateFormatVersion: "2010-09-09"
Parameters:
  Env: { Type: String }
Resources:
  Topic:
    Type: AWS::SNS::Topic
    Properties: { TopicName: !Sub "${Env}-alerts" }
Outputs:
  TopicArn: { Value: !Ref Topic }
```

Parent (local `TemplateURL` gets rewritten by `package`; cfn-lint warns `W3002 This code may only work with 'package' cli command`):
```yaml
AWSTemplateFormatVersion: "2010-09-09"
Parameters:
  Env: { Type: String, Default: lab }
Resources:
  Alerts:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: ./lab-nested-child.yaml
      Parameters: { Env: !Ref Env }
  AlertsTopicParam:
    Type: AWS::SSM::Parameter
    Properties:
      Name: !Sub "/${Env}/alerts-topic"
      Type: String
      Value: !GetAtt Alerts.Outputs.TopicArn
```
```bash
aws s3 mb s3://cfn-artifacts-$(aws sts get-caller-identity --query Account --output text)
aws cloudformation package --template-file lab-nested-parent.yaml \
  --s3-bucket cfn-artifacts-<acct> --output-template-file packaged.yaml
grep TemplateURL packaged.yaml                                  # now an https://...s3... URL
aws cloudformation deploy --stack-name nested --template-file packaged.yaml
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE --query 'StackSummaries[].StackName'   # parent + nested-Alerts-XXXX
```
**Break it:** set `TopicName` to something invalid (`"bad name!"`). The parent shows `Embedded stack ... was not successfully created`, and the real reason is in the **child** stack's events.

---

## Lab 9: Custom resource (with a deliberate hang)
Deploy [the AMI lookup custom resource](./cloudformation-composition-and-extensibility.md#6-custom-resources-run-code-during-stack-operations) (`CAPABILITY_IAM`) in an account with no AMIs tagged `App=web`: `max()` on an empty list raises an exception, and the `except` branch sends FAILED, so the stack fails fast and rolls back with your error message.
**Then break it properly:** delete the `try/except` so the function crashes without responding, and set `ServiceTimeout: 60`. Watch the stack wait about 60 seconds before failing. Without `ServiceTimeout`, the default wait is much longer. **Explain it:** why must the Delete path always respond?

---

## Lab 10: Guard your templates in CI
Write `rules.guard` from [part 4 §2](./cloudformation-tooling-cicd-and-troubleshooting.md#2-cfn-lint-and-cfn-guard-real-results) and run it against every lab template:
```bash
cfn-guard validate -r rules.guard -d . --show-summary fail
echo $?            # 19 when any rule fails, 0 when all pass
```
Then make `base.yaml` pass `s3_versioning_enabled` for every environment (hint: `!If [IsProd, Enabled, Suspended]` breaks it). Decide whether the rule or the template is wrong.

---

## Cleanup
```bash
for s in consumer nested legacy broken base; do
  aws cloudformation update-termination-protection --stack-name $s --no-enable-termination-protection 2>/dev/null
  aws cloudformation delete-stack --stack-name $s; done
# retained resources outlive their stacks — remove them by hand:
aws s3 ls | grep -E 'acme-|cfn-artifacts|legacy'      # empty, then: aws s3 rb s3://<name> --force
aws sqs delete-queue --queue-url $(aws sqs get-queue-url --queue-name legacy-jobs --query QueueUrl --output text)
```
The cleanup is itself the final lesson: **`Retain` means *you* own the deletion.**

Back to the [CloudFormation index](./cloud-formation.md).
