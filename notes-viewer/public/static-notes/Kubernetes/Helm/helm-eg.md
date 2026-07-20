Here is an example of using **Helm** to deploy a Kubernetes application. We'll deploy a sample **Nginx application** using a Helm chart.

---

### **Example Usage of Helm**

#### **1. Install Helm**
Ensure Helm is installed on your system:
```bash
helm version
```
If not installed, follow the [official Helm installation guide](https://helm.sh/docs/intro/install/).

---

#### **2. Add a Repository**
Add a Helm chart repository (e.g., Bitnami, a popular repository with many charts):
```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
```

Update the repository to fetch the latest charts:
```bash
helm repo update
```

---

#### **3. Search for a Chart**
Find a chart for your application (e.g., Nginx):
```bash
helm search repo nginx
```

Output example:
```
NAME                      CHART VERSION   APP VERSION DESCRIPTION
bitnami/nginx             13.2.0          1.21.1      A Helm chart for Nginx
```

---

#### **4. Install the Chart**
Deploy the Nginx application into your Kubernetes cluster:
```bash
helm install my-nginx bitnami/nginx
```
Here:
- `my-nginx` is the name of the release.
- `bitnami/nginx` is the chart name from the Bitnami repository.

Helm will generate and apply all Kubernetes resources (like Pods, Services, etc.) required for the Nginx deployment.

---

#### **5. List the Releases**
View all deployed Helm releases:
```bash
helm list
```

Example output:
```
NAME       NAMESPACE   REVISION   UPDATED                 STATUS    CHART          APP VERSION
my-nginx   default     1          Fri Jan 25 10:30:00    deployed  nginx-13.2.0   1.21.1
```

---

#### **6. Customize Deployment with `values.yaml`**
You can override default values using a `values.yaml` file.

Example `values.yaml`:
```yaml
replicaCount: 3
service:
  type: NodePort
  port: 8080
image:
  repository: nginx
  tag: latest
```

Install the chart with custom values:
```bash
helm install my-nginx bitnami/nginx -f values.yaml
```

---

#### **7. Upgrade the Release**
Update the release (e.g., change the replica count to 5):
```bash
helm upgrade my-nginx bitnami/nginx --set replicaCount=5
```

---

#### **8. Rollback the Release**
If something goes wrong, you can rollback to a previous version:
```bash
helm rollback my-nginx 1
```

---

#### **9. Uninstall the Release**
Remove the deployed release:
```bash
helm uninstall my-nginx
```

Add the `--keep-history` flag if you want to keep the release history:
```bash
helm uninstall my-nginx --keep-history
```

---

#### **10. Advanced Example: Deploying to Multiple Environments**
Create separate `values.yaml` files for different environments:
- `values-dev.yaml` (Development):
  ```yaml
  replicaCount: 1
  image:
    tag: dev
  ```
- `values-prod.yaml` (Production):
  ```yaml
  replicaCount: 5
  image:
    tag: stable
  ```

Deploy for each environment:
```bash
helm install dev-nginx bitnami/nginx -f values-dev.yaml
helm install prod-nginx bitnami/nginx -f values-prod.yaml
```

---

By following these steps, Helm simplifies the process of managing Kubernetes applications while offering flexibility with templating and environment-specific configurations.