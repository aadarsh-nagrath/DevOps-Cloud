# Helm

### Video Help
https://www.youtube.com/watch?v=w51lDVuRWuk
---

## **What is Helm?**
Helm is a **package manager for Kubernetes**, simplifying the deployment and management of Kubernetes applications. Similar to tools like `yum`, `apt`, or `Homebrew`, Helm enables you to install, update, and roll back applications in Kubernetes with minimal effort.
![d2](https://github.com/user-attachments/assets/6bb09635-4268-4d02-ae88-c55f9e1031e5)

### Key Benefits:
1. **Simplifies Deployment**: Applications with multiple components (e.g., Prometheus) can be deployed with a single command.
2. **Reusable Configurations**: Helm charts prevent the need to manually write and manage multiple YAML manifests.
3. **Customizability**: Use values and templating to adapt applications for different environments (e.g., Dev, QA, Production).

---

## **Core Components of Helm**
1. **Helm Chart**:
   - A **bundle of YAML files** defining a Kubernetes application.
   - Includes templating to make configurations dynamic.
   
2. **Config Values**:
   - These are the dynamic values provided by users to customize the deployment.
   - Can be passed via CLI arguments or by using `values.yaml` files.

3. **Release**:
   - A **deployed instance of a Helm chart** with specific configurations.
   - Releases allow for easy upgrades, rollbacks, and application management.

---

## **How Helm Works**
- Helm uses **charts** to define application configurations.
- Public repositories like **Artifact Hub** provide pre-built charts for popular applications.
- Users can override default chart values with their own configurations during installation.

---

## **Key Helm Features**
### 1. **Helm Templating Engine** 
![d1](https://github.com/user-attachments/assets/7a17a5d9-1d66-4d2b-8de3-ce3a82d25dbd)

   - It allosws you to customize your Helm Releases
   - Makes YAML files dynamic using placeholders.
   - Supports **environment-specific values** (e.g., different namespaces or replica counts for Dev/Prod).
   - Default values are stored in `values.yaml` and can be overridden using separate environment-specific files (e.g., `dev-values.yaml`, `prod-values.yaml`).

For example, you will probably run an instance in your development environment, test environment, and production environment. The requirements and configuration for these environments are going to be different. 

Things like namespaces, labels, and container images are likely to need custom values in each environment. This is the power of **Helm templating**. Instead of managing individual YAML files for each environment, you define a common blueprint through your Helm chart. Any dynamic values can be overridden.

Your manifest files will look just the same as regular Kubernetes manifests, but dynamic values are switched out with Helm templating. Default values are provided in the `values.yaml` file, and you can have additional values files for other environments.


### 2. **Helm Repositories**
   - Public repositories like **Artifact Hub** host charts for popular software.
   - Commands:
     - Add repo: `helm repo add <repo-name> <repo-url>`
     - Search charts: `helm search hub <chart-name>`
     - Update repo: `helm repo update`

---

## **Helm Chart Folder Structure**
```plaintext
<chart-name>/
├── Chart.yaml         # Metadata (name, version, description, etc.)
├── values.yaml        # Default configuration values
├── templates/         # Kubernetes manifests with Helm templating
│   ├── <resource>.yaml   # E.g., deployment.yaml, service.yaml
│   └── NOTES.txt         # Notes displayed after installation
```

---

## **Helm CLI Commands**
1. **Repository Management**:
   - `helm repo add <repo-name> <repo-url>`: Add a repository.
   - `helm repo list`: List all added repositories.
   - `helm repo update`: Update repository information.

2. **Chart Installation**:
   - `helm install <release-name> <chart-path-or-repo/chart-name>`: Install a Helm chart.
   - Pass custom values:
     - Inline: `--set <key>=<value>`
     - File: `--values <file.yaml>`

3. **Managing Releases**:
   - `helm list`: List all releases.
   - `helm status <release-name>`: View detailed information about a release.

4. **Uninstalling Releases**:
   - `helm uninstall <release-name>`: Uninstall a release.
   - Add `--keep-history` to retain history for potential rollbacks.

---

## **Helm v2 vs. Helm v3**
### Key Differences:
- **Helm v2**:
  - Used a **client-server model** with `tiller`, a server component.
  - Tiller managed Kubernetes changes.

- **Helm v3**:
  - **Tiller removed**, making the Helm CLI directly interact with the Kubernetes API.
  - Benefits:
    - Reduced complexity.
    - Granular permissions.
    - Improved security.

---

## **Example: Using Helm**
1. **Deploy a Chart**:
   ```bash
   helm install my-release prometheus-community/prometheus
   ```

2. **Override Values**:
   ```bash
   helm install my-release prometheus-community/prometheus \
     --values dev-values.yaml
   ```

3. **Upgrade a Chart**:
   ```bash
   helm upgrade my-release prometheus-community/prometheus \
     --set replicaCount=3
   ```

4. **Rollback a Release**:
   ```bash
   helm rollback my-release 1
   ```

5. **Uninstall a Release**:
   ```bash
   helm uninstall my-release --keep-history
   ```

---

## **Best Practices**
1. **Use Templating**: Minimize duplication by using templating for dynamic values.
2. **Separate Environments**:
   - Create individual `values.yaml` files for Dev, QA, and Production.
   - Example structure:
     ```plaintext
     values.yaml        # Default values
     dev-values.yaml    # Development-specific values
     prod-values.yaml   # Production-specific values
     ```

3. **Version Control Charts**: Manage Helm charts in a Git repository for easy collaboration and updates.

4. **Explore Artifact Hub**: Use trusted public Helm repositories for pre-built charts.

---

## **Conclusion**
Helm is an essential tool for managing Kubernetes applications, simplifying deployment, updates, and rollbacks. By leveraging Helm charts and templating, users can standardize and streamline application configurations across multiple environments. Practical knowledge of Helm commands and chart management is crucial for mastering Kubernetes.
