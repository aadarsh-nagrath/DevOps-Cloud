### Argo CD: A GitOps Tool for Continuous Delivery in Kubernetes

#### **What is Argo CD?**

- Argo CD is a **continuous delivery (CD)** tool designed for Kubernetes deployments.
- It works on **GitOps principles**, emphasizing the "pull model" for deployments.
- **Key Differentiator**: Unlike CI/CD tools like Jenkins, GitHub Actions, or GitLab CI/CD, Argo CD handles only the **deployment** aspect, not continuous integration (CI).

#### **Why Use Argo CD?**
- Simplifies Kubernetes deployments by removing the need to authenticate Kubernetes clusters in the CI/CD pipeline.
- Automatically syncs the **desired state** (defined in Git repositories) with the **actual state** in Kubernetes clusters.
- Works with **pull-based deployment** instead of the traditional push-based deployment model.

1. **Argo CD as a CD Tool:**
   - Argo CD focuses on continuous delivery to Kubernetes clusters, specifically improving the CD process.
   - In traditional CI/CD pipelines using tools like Jenkins, the CI pipeline builds, tests, and deploys application code. However, it often struggles with Kubernetes deployment management.
   
2. **Challenges with Traditional CI/CD Setup:**
   - External access tools like `kubectl` or Helm are required to interact with Kubernetes clusters.
   - Managing Kubernetes credentials for multiple projects, especially when scaling to large clusters, can be a significant challenge.
   - Traditional CI/CD systems like Jenkins struggle with visibility and synchronization after deploying changes, leaving them unaware of the application’s real-time status or failure.

---

### **How Argo CD Addresses These Challenges:**

1. **Reverse Workflow - Pull Model:**
   - Argo CD reverses the traditional CD workflow by using a "pull" mechanism. Rather than pushing changes to Kubernetes, Argo CD pulls configuration changes from Git repositories.
   - Argo CD is deployed **inside the Kubernetes cluster**, and it constantly monitors specific Git repositories for changes.
   
2. **Setting Up Argo CD:**
   - After deploying Argo CD within the Kubernetes cluster, it is configured to watch Git repositories where application configuration files (e.g., Kubernetes manifests) are stored.
   - As soon as any changes are made to the configuration in the Git repository (e.g., updated image version), Argo CD automatically synchronizes and applies those changes in the Kubernetes cluster.

---

### **Key Concepts**

#### **Push Deployment Model (Traditional CI/CD)**
1. Code changes are pushed to a GitHub repository.
2. CI/CD pipeline executes:
   - CI steps: Build and package the application (e.g., `npm run build`, `docker build`).
   - CD steps: Authenticate to Kubernetes, apply changes (`kubectl apply`).
3. Relies on credentials and direct interaction with the Kubernetes cluster.
4. Deployment is manually triggered or scheduled.

#### **Pull Deployment Model (GitOps with Argo CD)**
1. An **agent** (Argo CD) is installed on the Kubernetes cluster.
2. Argo CD is configured to monitor a Git repository containing Kubernetes configuration files.
3. Regularly checks for differences between:
   - **Desired state**: Defined in Git repository configuration files.
   - **Actual state**: Current state of Kubernetes cluster.
4. Automatically syncs changes:
   - Pulls updated configuration files from the repository.
   - Applies the required updates to align the cluster's actual state with the desired state.

#### **How Argo CD Works**
- Uses **Kubernetes custom resources** to define applications.
- Continuously monitors Git repositories for changes in Kubernetes configuration files.
- Automatically applies changes to the cluster as necessary.

---

### **The GitOps Workflow with Argo CD:**

1. **Separation of Concerns:**
   - The **CI pipeline** (handled by Jenkins) builds the application, runs tests, and pushes a new Docker image to a repository.
   - The **CD pipeline** (handled by Argo CD) is responsible for updating and syncing Kubernetes deployment configuration files stored in Git, making Kubernetes deployments automatic and more reliable.
   
2. **Use of Separate Git Repositories:**
   - It’s a best practice to have separate Git repositories for the application’s source code and its configuration (e.g., deployment YAML, config maps).
   - This separation ensures that configuration updates do not trigger unnecessary CI pipelines.

3. **Argo CD Syncs Kubernetes Clusters:**
   - Argo CD continuously monitors Git repositories and, once it detects changes, pulls them and applies them to the Kubernetes cluster.
   - The deployment manifest files (e.g., `deployment.yaml`) are synchronized automatically without manual intervention, ensuring consistency.

---

### **Benefits of GitOps with Argo CD:**

1. **Single Source of Truth:**
   - The Git repository acts as the **single source of truth** for the Kubernetes cluster's state. This reduces the need for manually managing configurations on local machines.
   
2. **Preventing Manual Configuration Drift:**
   - Argo CD actively monitors for **manual changes** made directly to the Kubernetes cluster. If someone updates the cluster without updating the Git repository, Argo CD will detect this drift and sync the cluster back to the state defined in the repository.
   - This guarantees that the configuration in the Git repository remains the authoritative version.

3. **Visibility and Auditing:**
   - Changes made in the Git repository are tracked with version control, providing **audit trails** and **history** of who made specific changes.
   - The entire process is transparent and easy to audit, making it simpler for teams to collaborate and review changes.

4. **Easy Rollback:**
   - If an issue arises from a new change, reverting to the previous stable version in Git is a quick and efficient process.
   - The rollback is not manual; Argo CD will automatically sync the Kubernetes cluster with the last known working state defined in Git.

5. **Cluster Disaster Recovery:**
   - If a Kubernetes cluster crashes (e.g., in AWS EKS), a new cluster can be set up and pointed to the Git repository to automatically recreate the cluster’s configuration, avoiding manual intervention.

---

### **Security and Access Control in Argo CD:**

1. **Cluster Access Management:**
   - Argo CD minimizes security risks by running **inside the Kubernetes cluster** and interacting directly with the Kubernetes API. This reduces the need for granting external tools (e.g., Jenkins) access to the cluster.
   - Users only need access to the Git repository, simplifying permission management and security.
   
2. **Separation of Roles:**
   - Argo CD allows **role-based access control** (RBAC) to ensure that only authorized personnel can initiate or approve changes to the cluster.
   - Operations or DevOps teams can manage configurations and deployments, while developers focus on the application code.

---

### **Argo CD's Integration with Kubernetes:**

1. **Leveraging Kubernetes API:**
   - Argo CD extends the Kubernetes API to manage application configurations, using Kubernetes controllers to compare the actual state of resources with the desired state in the Git repository.
   - This allows Argo CD to continuously monitor deployment states and provide real-time updates on whether applications are running successfully or need a rollback.

2. **Real-Time Monitoring and Updates:**
   - After a deployment, Argo CD provides real-time feedback in its UI, showing the status of applications, whether they are running successfully, and if any failures occur.
   - This level of integration ensures that teams are always aware of the state of their applications without needing to manually inspect the cluster.

---

### **Steps to Install and Use Argo CD**

#### **Installation**

1. **Create Namespace**:  
   ```bash
   kubectl create namespace argocd
   ```
   
2. **Apply Argo CD YAML**:  
   Download and apply the official YAML file:
   ```bash
   kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
   ```

3. **Verify Pods**:  
   Check the status of Argo CD pods:  
   ```bash
   kubectl get pods -n argocd
   ```

#### **Access Argo CD**

1. **Port Forward the Service**:  
   ```bash
   kubectl port-forward svc/argocd-server -n argocd 8080:443 --address 0.0.0.0 &
   ```

2. **Login to UI**:  
   - Default username: `admin`
   - Retrieve the initial password from the secret:  
     ```bash
     kubectl get secret argocd-initial-admin-secret -n argocd -o yaml | grep password | base64 -d
     ```

#### **Create an Application**

1. Log in to Argo CD UI.
2. Click **New Application** and provide:
   - **Application Name**: Unique identifier for the app.
   - **Repository URL**: Link to Git repo with Kubernetes manifests.
   - **Path**: Directory containing Kubernetes manifests.
   - **Cluster URL**: Leave as default for local cluster deployments.
   - **Namespace**: Namespace for the application.

3. Set sync policies:
   - **Automatic Sync**: Auto-apply changes.
   - **Self-Heal**: Ensure desired state matches actual state.

---

### **Key Features**

1. **Sync Mechanism**: Argo CD syncs configuration files every three minutes by default.
2. **Health Checks**: Monitors the health of deployments and services.
3. **Commit Traceability**: Tracks the commit ID for each deployment.
4. **Difference Visualization**: Highlights discrepancies between desired and actual states in the UI.

---

### **Advantages of Argo CD**
- Reduces complexity in managing Kubernetes credentials and access in CI/CD pipelines.
- Ensures consistency between the Git repository and the Kubernetes cluster.
- Supports **self-healing** to maintain the desired state.
- Provides a clear visualization of application deployments and cluster state.

---

Here’s the continuation of the tutorial with more details on deploying and managing Argo CD:

---

### **Tutorial: Deploying Argo CD in a Kubernetes Cluster**

In this section, we’ll walk you through the process of deploying Argo CD into your Kubernetes cluster, configuring it to automatically sync with a Git repository, and taking advantage of its advanced features like self-healing, pruning, and manual synchronization.

#### 1. **Create a Namespace for Argo CD**
   - Start by creating a dedicated namespace in your Kubernetes cluster for Argo CD. This step is important to organize and isolate the Argo CD components.
   - To create the namespace, run the following command:
     ```bash
     kubectl create namespace argo-cd
     ```

#### 2. **Install Argo CD**
   - Next, install Argo CD by applying its installation YAML file to your Kubernetes cluster. This file contains the necessary resources for deploying Argo CD’s components.
   - To install Argo CD, use this command:
     ```bash
     kubectl apply -n argo-cd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
     ```

#### 3. **Check Pod Status**
   - After deploying Argo CD, check the status of the pods to ensure everything is up and running smoothly.
   - Use the following command to list the Argo CD pods:
     ```bash
     kubectl get pods -n argo-cd
     ```

#### 4. **Access Argo CD UI**
   - Once the Argo CD pods are running, you can access the Argo CD user interface (UI). To do so, expose the Argo CD service locally using port forwarding.
   - Run this command to forward the service’s port:
     ```bash
     kubectl port-forward svc/argo-cd-server -n argo-cd 8080:80
     ```
   - Now, open your browser and navigate to `https://localhost:8080` to access the UI.

#### 5. **Login to Argo CD**
   - The default login credentials for Argo CD are:
     - **Username**: `admin`
     - **Password**: The password is auto-generated and stored in a Kubernetes secret.
   - To retrieve the password, run the following command:
     ```bash
     kubectl -n argo-cd get secret argo-cd-initial-admin-secret -o yaml
     ```
   - Decode the base64-encoded password and use it to log in to the Argo CD UI.

#### 6. **Create Argo CD Configuration (application.yaml)**
   - In order to configure Argo CD to sync with a Git repository, you need to create an `application.yaml` file. This file defines the Git repository, the Kubernetes namespace, and other settings related to the application.
   - A sample configuration (`application.yaml`) might look like this:
     ```yaml
     apiVersion: argoproj.io/v1alpha1
     kind: Application
     metadata:
       name: my-app
       namespace: argo-cd
     spec:
       source:
         repoURL: https://github.com/myorg/my-app-repo.git
         targetRevision: master
         path: k8s
       destination:
         server: https://kubernetes.default.svc
         namespace: default
       syncPolicy:
         automated:
           prune: true
           selfHeal: true
     ```

#### 7. **Sync Settings**
   - The `syncPolicy` section of the `application.yaml` file defines how Argo CD will automatically sync resources with the Git repository.
     - **automated: true**: This enables automatic synchronization of the application whenever changes are made in the Git repository.
     - **prune: true**: This option ensures that outdated resources (like removed or renamed components) are deleted from the cluster.
     - **selfHeal: true**: This setting enables Argo CD to automatically revert manual changes in the cluster to match the Git repository's desired state.

#### 8. **Apply the Configuration**
   - Once the `application.yaml` file is ready, apply it to your Kubernetes cluster using the following command:
     ```bash
     kubectl apply -f application.yaml
     ```

#### 9. **Argo CD UI Update**
   - After applying the configuration, refresh the Argo CD UI. The UI will now display your application, showing its current state and associated resources (like services, deployments, and pods).
   - Argo CD will ensure the cluster’s state matches the Git repository state.

#### 10. **Test Automatic Sync**
   - To verify the automatic sync functionality, make a change to your Git repository (e.g., update the container image version).
   - Argo CD will automatically detect the change and apply the update to the cluster without any manual intervention.

#### 11. **Pruning Old Resources**
   - Test the pruning functionality by renaming or deleting a resource (e.g., a service or deployment) in the Git repository.
   - After Argo CD synchronizes, it will remove any resources that no longer exist in the repository.

#### 12. **Manual Changes Reversion**
   - Test the self-healing feature by manually editing a deployment or other resource in the cluster (e.g., change the number of replicas).
   - Argo CD will automatically revert the resource back to the desired state from the Git repository.

#### 13. **Manual Sync**
   - If you want to sync your application immediately instead of waiting for the next sync interval, you can manually trigger a sync through the Argo CD UI.
   - To do this, navigate to the application in the UI and click on the "Sync" button to synchronize the resources with the Git repository state.

---

### **Conclusion**
This tutorial provided a step-by-step guide on deploying Argo CD into a Kubernetes cluster and configuring it to synchronize automatically with a Git repository. We also explored advanced features like pruning, self-healing, and manual synchronization to give you a full understanding of how to use Argo CD for continuous delivery in your Kubernetes environment.

By following these steps, you’ll be able to manage your Kubernetes applications in a declarative and automated manner using GitOps principles, ensuring your cluster always reflects the desired state as defined in your Git repository.

---

### **Next Steps**
1. Explore more about Argo CD’s integration with **Helm** and **Kustomize** for managing complex applications.
2. Dive deeper into Argo CD's security features, including role-based access control (RBAC) and how to manage multi-cluster environments.
https://github.com/aadarsh-nagrath/DevOps/blob/7670958d598c5ef2f0bc78f5c48a0e5a17197700/argo-cd-integration-helm/next-steps.md
