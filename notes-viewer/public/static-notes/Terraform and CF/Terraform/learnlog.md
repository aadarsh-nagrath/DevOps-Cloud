Terraform can interact with cloud providers with an API.

### Written Learning Blog
[Terraform Beginner to Pro - Introduction](https://courses.devopsdirective.com/terraform-beginner-to-pro/lessons/00-introduction/01-main)

### Github Credit
[devops-directive-terraform-course](https://github.com/sidpalas/devops-directive-terraform-course)

### Important Points

#### Three Main Approaches for Provisioning Cloud Resources:

- **Cloud Console**: A graphical user interface provided by cloud providers, allowing users to interact with and manage cloud services.
  
- **API or Command-Line Interface**: A method of interacting with cloud services programmatically, allowing for more efficient and automated management.
  
- **Infrastructure as Code**: Defining your entire infrastructure within your codebase, offering better control, visibility, and consistency across environments.

#### Categories of Infrastructure as Code Tools:
- **Ad-hoc scripts**: Basic scripts that make API calls to provision infrastructure resources (e.g., shell scripts).
  
- **Configuration management tools**: Tools like Ansible, Puppet, and Chef, designed to manage software and infrastructure configuration.
  
- **Server templating tools**: Tools for building server templates, such as Amazon Machine Images (AMIs) or virtual machine images.
  
- **Orchestration tools**: Tools like Kubernetes, which focus on deploying applications and managing containers.
  
- **Provisioning tools**: Tools like Terraform, which focus on provisioning cloud resources using a declarative approach.

#### Declarative vs. Imperative:
- **Declarative tools** define the desired end state of your infrastructure (e.g., five servers, one load balancer), and the tool handles the API calls and processes to achieve that state.
  
- **Imperative tools** require you to define the sequence of actions to create the desired infrastructure.

#### Cloud-Specific vs. Cloud-Agnostic:
- **Cloud-specific tools**: These tools, such as AWS CloudFormation or Azure Resource Manager, are provided by major cloud providers and focus on provisioning infrastructure within their respective clouds.
  
- **Cloud-agnostic tools**: Tools like Terraform or Pulumi, which can be used across any cloud provider, allowing for greater flexibility when deploying resources across multiple clouds or when using third-party services.

---

Terraform is a powerful Infrastructure as Code (IaC) tool that allows you to build, change, and version infrastructure safely and easily.

### Features of Terraform:
The cloud-agnostic approach allows for compatibility with multiple cloud providers and services.
- Interact with almost any online service with an API.

Terraform can be used in conjunction with other IaC tools to create powerful and flexible infrastructure management solutions. Some common patterns include:

- **Terraform + Configuration Management Tools (e.g., Ansible)**:
  - Terraform provisions virtual machines
  - Ansible installs and configures dependencies inside virtual machines.

- **Terraform + Orchestration Tools (e.g., Kubernetes)**:
  - Terraform provisions Kubernetes clusters.
  - Kubernetes defines how the application is deployed and managed on the cloud resources.

Here's the updated version of the notes with additional vital points:

## **Terraform Architecture Overview:**
![image](https://github.com/user-attachments/assets/28bb7c91-7b65-4719-ac5b-473db4c4c084)

- **Terraform Core**: 
  - The central engine that manages and controls the provisioning of infrastructure.
  - It processes **configuration files** and the **Terraform state file**.
  - **Configuration files** define the desired infrastructure setup, while the **state file** maintains the current status of the infrastructure already provisioned.
  
- **State Management**:
  - The **state file** is a crucial component as it tracks all the infrastructure Terraform has created or modified. It helps Terraform determine what changes are necessary to match the desired configuration.
  - State can be stored locally or remotely (e.g., in Amazon S3, or Terraform Cloud) for better team collaboration and consistency.
  
- **Providers (Plugins)**: 
  - Providers act as **plugins** to Terraform Core, enabling it to interact with various cloud provider APIs.
  - Each provider understands the configuration format for a particular service (e.g., AWS, Azure, Google Cloud, Cloudflare, etc.).
  - Providers are installed alongside Terraform core, allowing Terraform to authenticate and make requests to the relevant cloud provider API.
  - **There are more than a hundred providers available**, covering nearly all major services and internet resources.
  
- **Execution Plan**:
  - Terraform generates an **execution plan** before applying any changes. This plan is the proposed set of actions Terraform will take to align the infrastructure with the configuration files.
  - The plan is reviewed by the user to ensure that Terraform is taking the correct actions (e.g., adding, modifying, or destroying resources).

- **Resource Provisioning**:
  - **Resources** are the fundamental components managed by Terraform (e.g., servers, databases, networking rules).
  - Terraform ensures the correct provisioning of resources by using the appropriate API calls, as defined by the provider, to create, modify, or destroy resources in the cloud.
  
- **Terraform Modules**:
  - Terraform supports the concept of **modules**, which are reusable configurations that allow for better code organization and reuse across different projects.
  - Modules can contain one or more resources and be shared to ensure consistency in resource management.

- **Terraform CLI**:
  - The **Command-Line Interface (CLI)** is used to interact with Terraform, allowing the user to execute commands like `terraform init`, `terraform plan`, and `terraform apply`.
  
- **State Locking**:
  - When using remote backends for state management, **state locking** is important to ensure that no two users or processes are modifying the same state simultaneously, which prevents conflicts.

- **Cloud-Agnostic Approach**:
  - Terraform’s **cloud-agnostic** nature allows it to work across multiple cloud providers with the same configuration syntax. This flexibility makes it suitable for multi-cloud environments.

### Install and Set Up Terraform with AWS

**Installing Terraform**:  
- For macOS: `brew install terraform`.  
- For other OS, visit HashiCorp’s installation page.

**Authenticating with AWS**:  
- Create an IAM user with necessary permissions (e.g., EC2, RDS, S3, DynamoDB).  
- Install AWS CLI and run `aws configure` to set up credentials.

**Basic Terraform Configuration**:  
Create a `main.tf` file with the following:

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

resource "aws_instance" "example" {
  ami           = "ami-011899242bb902164"
  instance_type = "t2.micro"
}
```

**Terraform Commands**:  
1. `terraform init` – Initialize the project.  
2. `terraform plan` – View the execution plan.  
3. `terraform apply` – Apply changes to create resources.  
4. `terraform destroy` – Clean up resources.

This setup gets Terraform running with AWS and provisions an EC2 instance.
------

```md
# Terraform Providers:
- Visit [registry.terraform.io](https://registry.terraform.io) to explore available providers
- Official providers have the "official" tag and are maintained by the respective cloud service
- In your configuration file, specify required providers and pin their versions within a terraform block

Run `terraform init` to download the necessary providers and store them in the `.terraform` directory. The `.terraform.lock.hcl` file contains information about the installed dependencies and providers.

Modules, reusable Terraform code bundles, are also downloaded and stored in the `.terraform` directory.

We will cover the concept of the Terraform state file, its importance, and the different ways to store and manage it.

We will discuss the advantages and drawbacks of local and remote backends and explain how to use them effectively for better collaboration and security.

## Understanding the State File:
The state file is a JSON file containing information about resources and data objects deployed using Terraform.
It includes metadata and other essential information about each resource.
The state file may contain sensitive information, so it must be protected and encrypted.

The following is an example of a `.tfstate` file for a terraform config managing an s3 bucket:

```json
{
  "version": 4,
  "terraform_version": "1.0.0",
  "serial": 1,
  "lineage": "your-lineage-here",
  "outputs": {},
  "resources": [
    {
      "mode": "managed",
      "type": "aws_s3_bucket",
      "name": "example_bucket",
      "provider": "provider.aws",
      "instances": [
        {
          "attributes": {
            "acl": "private",
            "bucket": "example-bucket",
            "force_destroy": false,
            "id": "example_bucket",
            "region": "us-east-1",
            "tags": {}
          },
          "private": "bnVsbA=="
        }
      ]
    }
  ]
}
```

## Storing the State File:
### Local Backend:
- The state file is stored within the working directory of the project

**Advantages:**
- Easy to set up and use
- Stores the state file alongside your code

**Disadvantages:**
- Stores sensitive values in plain text
- Not suitable for collaboration
- Requires manual interaction for applying changes

### Remote Backend:
- The state file is stored in a remote object store or a managed service like Terraform Cloud

**Advantages:**
- Encrypts sensitive data
- Allows collaboration among multiple developers
- Supports automation through CI/CD pipelines

**Disadvantages:**
- Increased complexity compared to the local backend

## Remote Backend Options:
- Terraform Cloud (managed offering)
- Self-managed remote backends (e.g., Amazon S3, Google Cloud Storage)
```
```md
# Terraform Commands and Remote Backends

## Terraform Commands

### 1. Terraform Plan Command
- **Purpose**: Compares the desired state (from the Terraform configuration) with the actual state (from the Terraform state file).
- **Action**: Identifies any discrepancies between the two states and outputs the differences and the actions needed to reconcile the states.
  
#### Example:
```bash
terraform plan
```

### 2. Terraform Apply Command
- **Purpose**: Executes the actions identified in the Terraform Plan command.
- **Action**: Creates, modifies, or deletes resources as needed to match the desired state and updates the Terraform state file accordingly.
  
#### Example:
```bash
terraform apply
```

### 3. Terraform Destroy Command
- **Purpose**: Removes all resources associated with the Terraform configuration.
- **Caution**: This command **permanently deletes** resources. It's typically used for cleaning up resources at the end of a project or example.
  
#### Example:
```bash
terraform destroy
```

---

## Remote Backends for Terraform

### 1. Terraform Cloud
- **Type**: Managed offering from HashiCorp.
- **Configuration**: Specify a backend type of `"remote"` with organization and workspace names.
- **Features**: Allows interaction via a web UI to manage your account, organization, and workspaces.
- **Cost**: Free up to five users within an organization, but costs **$20 per user per month** for more than five users.

#### Example Configuration for Terraform Cloud:
```hcl
terraform {
  backend "remote" {
    organization = "example-org"
    workspaces {
      name = "example-workspace"
    }
  }
}
```

### 2. Self-managed Backend (AWS S3)
- **Configuration**: Uses an S3 bucket to store the state file and a DynamoDB table to prevent multiple concurrent `apply` commands.
- **Bootstrapping Process**: Required to provision the S3 bucket and DynamoDB table.
  
#### Example Configuration for AWS S3 Backend:
```hcl
terraform {
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "path/to/my/key"
    region         = "us-west-2"
    dynamodb_table = "my-lock-table"
    encrypt        = true
  }
}
```
---

## Types of Variables

### 1. Input Variables
- **Purpose**: Input parameters or arguments for a function.
- **Syntax**:
```hcl
variable "instance_type" {
  type    = string
  default = "t2.micro"
}
```

### 2. Local Variables
- **Purpose**: Temporary variables within the scope of a function.
- **Syntax**:
```hcl
locals {
  service_name = "example-service"
  owner        = "your_name"
}
```

### 3. Output Variables
- **Purpose**: Return values of a function that allow bundling multiple Terraform configurations.
- **Syntax**:
```hcl
output "instance_ip" {
  value = aws_instance.example.public_ip
}
```

---

## Setting Input Variables

### Ways to Set Input Variables (Ranked by Precedence):
1. **Terraform CLI prompts**: If no value is specified and there’s no default, Terraform prompts for the value.
2. **Default value in the block**: Defined in the variable declaration.
3. **Environment variables**: Set with the `TF_VAR_` prefix.
4. **Terraform .tfvars files**: Store values in `.tfvars` files.
5. **Auto-applied .auto.tfvars files**: Applied over `.tfvars` files automatically.
6. **-var or -var-file options**: Pass values when running the `terraform plan` or `terraform apply` commands.

#### Example of Passing Input Variable:
```bash
terraform apply -var "instance_type=t2.medium"
```

---

## Variable Value Types
- **Primitive Types**: string, number, boolean.
- **Complex Types**: lists, sets, maps, etc.
- **Type Checking**: Automatically performed by Terraform. Custom validation rules can also be defined.

---

## Handling Sensitive Data

To handle sensitive data such as passwords securely:
- **Mark Sensitive Variables**: Add the `sensitive = true` attribute when defining the variable. This will mask sensitive data in Terraform plan output.

#### Example:
```hcl
variable "db_password" {
  type      = string
  sensitive = true
}
```

- **Avoid Storing Sensitive Data in Files**: Instead, use secure methods for passing in sensitive data:
  - **Environment Variables**.
  - **-var command**.
  - **External Secret Stores** like AWS Secrets Manager or HashiCorp Vault.

---

## Summary

- **Terraform Commands**: `plan` to compare states, `apply` to execute changes, and `destroy` to remove resources.
- **Remote Backends**: Terraform Cloud and self-managed AWS S3 backends offer different methods for managing Terraform state.
- **Variables**: Input, local, and output variables allow for dynamic and flexible Terraform configurations.
- **Sensitive Data**: Terraform provides mechanisms to securely handle sensitive information.
```