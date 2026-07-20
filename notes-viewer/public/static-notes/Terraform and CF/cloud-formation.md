# AWS CloudFormation Notes

## Official resources -
https://docs.aws.amazon.com/cloudformation/
https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/Welcome.html

## Table of Contents
- [Introduction](#introduction)
- [Key Concepts](#key-concepts)
  - [Stacks](#stacks)
  - [Templates](#templates)
  - [Resources](#resources)
  - [Parameters](#parameters)
  - [Outputs](#outputs)
  - [Mappings](#mappings)
  - [Conditions](#conditions)
- [Features and Benefits](#features-and-benefits)
- [Template Anatomy](#template-anatomy)
- [Template Sections](#template-sections)
  - [AWSTemplateFormatVersion](#awstemplateformatversion)
  - [Description](#description)
  - [Metadata](#metadata)
  - [Parameters](#parameters-section)
  - [Mappings](#mappings-section)
  - [Conditions](#conditions-section)
  - [Resources](#resources-section)
  - [Outputs](#outputs-section)
- [CloudFormation Functions](#cloudformation-functions)
  - [Intrinsic Functions](#intrinsic-functions)
- [Stack Management](#stack-management)
- [Change Sets](#change-sets)
- [Best Practices](#best-practices)
- [Common Use Cases](#common-use-cases)
- [Error Handling and Troubleshooting](#error-handling-and-troubleshooting)
- [References and Further Reading](#references-and-further-reading)

---

## Introduction
AWS CloudFormation is a service that helps you model, provision, and manage AWS and third-party resources by treating infrastructure as code. With CloudFormation, you can define resources and configurations in JSON or YAML templates and automate their deployment.

---

## Key Concepts

### Stacks
- A stack is a collection of AWS resources that you can manage as a single unit.
- Changes to resources in a stack are tracked and managed collectively.

### Templates
- A template is a declarative specification of the resources and configurations in a stack.
- Written in JSON or YAML.

### Resources
- Resources are the AWS services and infrastructure defined in a template, such as EC2 instances, S3 buckets, and RDS databases.

### Parameters
- Parameters enable you to pass dynamic values into the template at runtime.
- Useful for customization and reusability.

### Outputs
- Outputs are return values from the stack, such as resource IDs or endpoints.
- Useful for referencing information in other stacks.

### Mappings
- Mappings provide static, predefined values based on keys, useful for region-specific or environment-specific configurations.

### Conditions
- Conditions control whether certain resources or properties are created based on parameter values or other factors.

---

## Features and Benefits
- **Infrastructure as Code:** Automate provisioning and management of resources.
- **Reusability:** Use templates to standardize resource configurations.
- **Consistency:** Ensure consistent resource deployments across environments.
- **Automation:** Reduce manual intervention and errors.
- **Change Management:** Use Change Sets to preview and manage updates.
- **Stack Policies:** Protect critical resources from accidental updates or deletion.

### Other features

### Extensibility
- **AWS CloudFormation Registry**: Model and provision third-party resources and modules published by AWS Partner Network (APN) Partners and the developer community.
  - Examples include tools for monitoring, team productivity, incident management, and version control.
  - Supported third-party tools include MongoDB, Datadog, Atlassian Opsgenie, JFrog, Trend Micro, Splunk, Aqua Security, FireEye, Sysdig, Snyk, Check Point, Spot by NetApp, Gremlin, Stackery, and Iridium.
- **Custom Resource Providers**: Build your own resource providers using the AWS CloudFormation CLI. The CLI streamlines development with local testing and code generation capabilities.

### Cross Account & Cross-Region Management
- **StackSets**: Provision and manage AWS resources across multiple accounts and regions using a single CloudFormation template. Automates provisioning, updating, and deleting stacks safely.

### Authoring with JSON/YAML
- Use declarative languages such as JSON or YAML to model your cloud environment.
- **AWS CloudFormation Designer**: A visual tool to create and modify templates easily.

### Authoring with Familiar Programming Languages
- **AWS Cloud Development Kit (CDK)**: Define your cloud environment using TypeScript, Python, Java, and .NET.
  - High-level components with proven defaults.
  - Seamless integration with your IDE.

### Build Serverless Applications with SAM
- **AWS Serverless Application Model (SAM)**: Open-source framework for serverless applications.
  - Shorthand syntax for defining resources like functions, APIs, databases, and event sources.
  - Transforms SAM syntax into CloudFormation syntax during deployment.

### Safety Controls
- **Rollback Triggers**: Specify CloudWatch alarms to monitor during stack creation and updates. If alarms are triggered, the stack rolls back to the last known good state.
- **ChangeSets**: Preview proposed changes before they are applied.
- **Drift Detection**: Track changes to resources outside CloudFormation.


---

## Template Anatomy
A CloudFormation template typically includes the following sections:

- `AWSTemplateFormatVersion`
- `Description`
- `Metadata`
- `Parameters`
- `Mappings`
- `Conditions`
- `Resources`
- `Outputs`

---

## Template Sections

### AWSTemplateFormatVersion
- Specifies the version of the CloudFormation template format.
- Example:
  ```yaml
  AWSTemplateFormatVersion: '2010-09-09'
  ```

### Description
- A short description of the stack's purpose.
- Example:
  ```yaml
  Description: This template deploys a web application.
  ```

### Metadata
- Contains additional information about the template.
- Example:
  ```yaml
  Metadata:
    Author: Scanlon
    Version: 1.0
  ```

### Parameters Section
- Defines dynamic inputs for the template.
- Example:
  ```yaml
  Parameters:
    InstanceType:
      Type: String
      Default: t2.micro
      AllowedValues:
        - t2.micro
        - t2.small
        - t2.medium
      Description: EC2 instance type.
  ```

### Mappings Section
- Defines key-value pairs.
- Example:
  ```yaml
  Mappings:
    RegionMap:
      us-east-1:
        AMI: ami-0abcdef1234567890
      us-west-1:
        AMI: ami-1234567890abcdef0
  ```

### Conditions Section
- Defines conditions to control resource creation.
- Example:
  ```yaml
  Conditions:
    CreateProdResources:
      Fn::Equals:
        - Ref: EnvType
        - prod
  ```

### Resources Section
- Defines the AWS resources to be created.
- Example:
  ```yaml
  Resources:
    MyEC2Instance:
      Type: AWS::EC2::Instance
      Properties:
        InstanceType: t2.micro
        ImageId: ami-0abcdef1234567890
  ```

### Outputs Section
- Defines values to return after stack creation.
- Example:
  ```yaml
  Outputs:
    InstanceId:
      Description: The ID of the EC2 instance.
      Value: !Ref MyEC2Instance
  ```

---

## CloudFormation Functions

### Intrinsic Functions
Intrinsic functions help define resource properties dynamically.

- **`Ref`:** References a parameter or resource.
  ```yaml
  Resources:
    MyBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: !Ref BucketNameParam
  ```

- **`Fn::Join`:** Concatenates values.
  ```yaml
  BucketName: !Join ['-', ['mybucket', !Ref EnvType]]
  ```

- **`Fn::Sub`:** Substitutes variables into a string.
  ```yaml
  BucketName: !Sub '${EnvType}-mybucket'
  ```

- **`Fn::GetAtt`:** Retrieves an attribute of a resource.
  ```yaml
  Value: !GetAtt MyBucket.Arn
  ```

- **`Fn::If`:** Conditionally include a value.
  ```yaml
  Properties:
    BucketName: !If [CreateProdResources, 'prod-bucket', 'dev-bucket']
  ```

---

## Stack Management
- **Create Stack:** Deploy resources from a template.
- **Update Stack:** Modify existing resources.
- **Delete Stack:** Remove resources created by the stack.

### Tools
- AWS Management Console
- AWS CLI
- AWS SDKs
- Infrastructure as Code tools (e.g., Terraform, Pulumi)

---

## Change Sets
- Preview proposed changes to a stack before execution.
- Useful for evaluating impact.

### Commands
```bash
aws cloudformation create-change-set --stack-name my-stack --template-body file://template.yaml
aws cloudformation describe-change-set --change-set-name my-change-set
```

---

## Best Practices
- **Use Parameters for Flexibility:** Avoid hardcoding values.
- **Modularize Templates:** Break templates into smaller, reusable components.
- **Version Control:** Store templates in version control systems (e.g., Git).
- **Test Templates:** Use tools like cfn-lint or AWS CloudFormation Designer.
- **Handle Rollbacks:** Monitor stack creation to address rollbacks.

---

## Common Use Cases
- Automating multi-tier application deployments.
- Setting up networking resources (e.g., VPCs, subnets, NAT gateways).
- Configuring monitoring and logging (e.g., CloudWatch, CloudTrail).
- Managing serverless applications with AWS Lambda.

---

## Error Handling and Troubleshooting
- **Stack Event Logs:** Check event logs for stack operations.
- **Rollback Triggers:** Define CloudWatch alarms to trigger rollbacks.
- **Drift Detection:** Identify changes made outside of CloudFormation.
- **Validate Templates:** Use the following command to validate:
  ```bash
  aws cloudformation validate-template --template-body file://template.yaml
  ```

---

## References and Further Reading
- [AWS CloudFormation Documentation](https://docs.aws.amazon.com/cloudformation/)
- [AWS CloudFormation Designer](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/working-with-templates-cfn-designer.html)
- [Intrinsic Functions Reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference.html)
- [Template Anatomy](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-anatomy.html)


Here's the markdown-formatted notes from the transcript, along with the steps for performing the experiment.

---

# AWS CloudFormation Overview

## Introduction
- **AWS CloudFormation** allows users to automate infrastructure provisioning using **Infrastructure as Code (IaC)**.
- You can define AWS resources in a YAML or JSON file, which can be uploaded to CloudFormation to create resources automatically.
- CloudFormation helps replicate infrastructure easily and consistently across different regions.

## Scenario Example
- **Problem**: Manually recreating infrastructure can lead to errors. For example, adding Lambda functions, DynamoDB tables, RDS, S3 buckets, and IAM users might require manual reconfiguration for every region.
- **Solution**: CloudFormation automates infrastructure creation, ensuring all resources are created with the same properties consistently.

---

## **Advantages of AWS CloudFormation**

1. **Time-Saving**: Automates resource creation, freeing developers to focus on application development rather than infrastructure setup.
2. **Repeatability**: Templates can be reused to create the same resources consistently, eliminating human error.
3. **Cost Estimation**: Helps predict financial requirements by analyzing resource configurations.
4. **Cross-Region Use**: Replicate infrastructure in multiple regions, aiding global applications.
5. **Large Community Support**: Access to resources and support from a large community for troubleshooting and guidance.

---

## **Disadvantages of AWS CloudFormation**

1. **Steep Learning Curve**: Learning infrastructure-as-code concepts and CloudFormation syntax can be difficult.
2. **Minor Changes Can Be Fatal**: Small modifications (e.g., renaming a database) could lead to resource deletion and loss of data.
3. **Drift**: If resources are modified directly via AWS CLI or Console, configurations may become out of sync with the template, causing issues.

---

## **Hands-On Experiment**

### Step 1: Create a CloudFormation Stack (S3 Bucket Example)
1. **Go to AWS Console** and navigate to **CloudFormation**.
2. Click **Create Stack** and select **Upload a template file**.
3. Create a simple **S3 Bucket** in YAML format:
   ```yaml
   AWSTemplateFormatVersion: '2010-09-09'
   Description: Simple S3 bucket creation
   Resources:
     MyNewBucket:
       Type: 'AWS::S3::Bucket'
       Properties:
         BucketName: my-new-bucket
   ```

4. Upload this file in the CloudFormation interface and proceed with the stack creation:
   - Provide a **stack name** and **bucket name**.
   - Leave all other settings as defaults.
5. Wait for CloudFormation to create the bucket.
6. After creation, navigate to **S3** to verify the new bucket is created.
7. Delete the bucket and verify its deletion in CloudFormation.

---

### Step 2: Create a CloudFormation Stack (LAMP Stack Example)
1. **Go to AWS Console** and navigate to **CloudFormation**.
2. Create a new stack using a **Sample Template** (e.g., LAMP stack).
3. This template will create an **EC2 instance** and a **MySQL database**.
4. Select appropriate configurations (e.g., **Key Pair** for EC2).
5. Once the stack creation is in progress, wait for it to finish and verify the resources in **EC2** and **RDS**.
6. Delete the resources after verification.

---

### Step 3: Using Application Composer
1. **Go to CloudFormation** and open **Application Composer**.
2. Drag and drop resources (e.g., EC2, S3, RDS) to create a custom infrastructure.
3. Link resources together as required.
4. Use **Validate** to check if the resources are valid.
5. Download the YAML code for the infrastructure design.

---

# DEMONTRATION

Here's the markdown-formatted notes from the transcript, along with the steps for performing the experiment.

---

# AWS CloudFormation Overview

## Introduction
- **AWS CloudFormation** allows users to automate infrastructure provisioning using **Infrastructure as Code (IaC)**.
- You can define AWS resources in a YAML or JSON file, which can be uploaded to CloudFormation to create resources automatically.
- CloudFormation helps replicate infrastructure easily and consistently across different regions.

## Scenario Example
- **Problem**: Manually recreating infrastructure can lead to errors. For example, adding Lambda functions, DynamoDB tables, RDS, S3 buckets, and IAM users might require manual reconfiguration for every region.
- **Solution**: CloudFormation automates infrastructure creation, ensuring all resources are created with the same properties consistently.

---

## **Advantages of AWS CloudFormation**

1. **Time-Saving**: Automates resource creation, freeing developers to focus on application development rather than infrastructure setup.
2. **Repeatability**: Templates can be reused to create the same resources consistently, eliminating human error.
3. **Cost Estimation**: Helps predict financial requirements by analyzing resource configurations.
4. **Cross-Region Use**: Replicate infrastructure in multiple regions, aiding global applications.
5. **Large Community Support**: Access to resources and support from a large community for troubleshooting and guidance.

---

## **Disadvantages of AWS CloudFormation**

1. **Steep Learning Curve**: Learning infrastructure-as-code concepts and CloudFormation syntax can be difficult.
2. **Minor Changes Can Be Fatal**: Small modifications (e.g., renaming a database) could lead to resource deletion and loss of data.
3. **Drift**: If resources are modified directly via AWS CLI or Console, configurations may become out of sync with the template, causing issues.

---

## **Hands-On Experiment**

### Step 1: Create a CloudFormation Stack (S3 Bucket Example)
1. **Go to AWS Console** and navigate to **CloudFormation**.
2. Click **Create Stack** and select **Upload a template file**.
3. Create a simple **S3 Bucket** in YAML format:
   ```yaml
   AWSTemplateFormatVersion: '2010-09-09'
   Description: Simple S3 bucket creation
   Resources:
     MyNewBucket:
       Type: 'AWS::S3::Bucket'
       Properties:
         BucketName: my-new-bucket
   ```

4. Upload this file in the CloudFormation interface and proceed with the stack creation:
   - Provide a **stack name** and **bucket name**.
   - Leave all other settings as defaults.
5. Wait for CloudFormation to create the bucket.
6. After creation, navigate to **S3** to verify the new bucket is created.
7. Delete the bucket and verify its deletion in CloudFormation.

---

### Step 2: Create a CloudFormation Stack (LAMP Stack Example)
1. **Go to AWS Console** and navigate to **CloudFormation**.
2. Create a new stack using a **Sample Template** (e.g., LAMP stack).
3. This template will create an **EC2 instance** and a **MySQL database**.
4. Select appropriate configurations (e.g., **Key Pair** for EC2).
5. Once the stack creation is in progress, wait for it to finish and verify the resources in **EC2** and **RDS**.
6. Delete the resources after verification.

---

### Step 3: Using Application Composer
1. **Go to CloudFormation** and open **Application Composer**.
2. Drag and drop resources (e.g., EC2, S3, RDS) to create a custom infrastructure.
3. Link resources together as required.
4. Use **Validate** to check if the resources are valid.
5. Download the YAML code for the infrastructure design.

---
