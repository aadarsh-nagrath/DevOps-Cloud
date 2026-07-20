# Networking in DOCKER AND KUBERNETES

### Video Help
https://www.youtube.com/watch?v=bKFMS5C4CG0
https://www.youtube.com/watch?v=xrUGEoUpa3s
https://www.youtube.com/watch?v=EkAzMGldC5M
https://www.youtube.com/watch?v=5cNrTU6o3Fw
https://www.youtube.com/watch?v=B6FsWNUnRo0&list=PLSAko72nKb8QWsfPpBlsw-kOdMBD7sra-

# Basic of Network
Let me break down networking concepts and how they relate to Docker, using your `ngin-net` example for context. 

---

### **Key Networking Concepts**

1. **Subnet**:
   - A **subnet** (short for "subnetwork") is a segment of a network with its own range of IP addresses.
   - The `Subnet` field in your network configuration defines the range of IP addresses that devices (e.g., containers) in this network can use.
   - Example: `172.21.0.0/16` is a subnet. Here:
     - `172.21.0.0` is the base (or network) address.
     - `/16` is the **CIDR** notation, which specifies how many bits are reserved for the network portion of the address.

2. **CIDR (Classless Inter-Domain Routing)**:
   - CIDR notation is a compact way to specify a range of IP addresses.
   - It uses a base IP address and a suffix (e.g., `/16`) to indicate how many bits are used for the **network portion**.
   - Example: `172.21.0.0/16` means:
     - The first 16 bits (`172.21`) represent the **network**.
     - The remaining bits are used for **hosts** (devices like containers).
     - This allows for \( 2^{32-16} = 65,536 \) possible IP addresses in this subnet.

3. **Gateway**:
   - A gateway is an entry/exit point for traffic leaving or entering the subnet.
   - Example: `Gateway: 172.21.0.1` means this IP address acts as the router for containers in the subnet.

4. **IP Address**:
   - Each device (or container) in a network gets an IP address.
   - Example: Your container has `IPv4Address: 172.21.0.2/16`, meaning:
     - `172.21.0.2` is the container's address.
     - It belongs to the subnet `172.21.0.0/16`.

5. **Bridge Network**:
   - Docker's default network type. Containers connected to a bridge network can communicate with each other and, if configured, with the host or external networks.
   - Your `ngin-net` is a **bridge network** created by Docker.

---

### **Your Docker Network (`ngin-net`)**

Based on the output:
- **Subnet**: `172.21.0.0/16`
  - All containers in this network can use IPs from `172.21.0.1` to `172.21.255.254`.
- **Gateway**: `172.21.0.1`
  - Containers route traffic through this address when communicating outside the network.
- **Container**: `nginx`
  - IP: `172.21.0.2`
  - MAC Address: `02:42:ac:15:00:02` (used for Layer 2 communication within the network).

---

### **Why This Matters**

- Subnets and IP ranges prevent IP conflicts between different networks or containers.
- CIDR ensures efficient allocation of IPs (e.g., `/16` provides more IPs than `/24`).
- Knowing this helps in configuring networks for Docker Compose, Kubernetes, or any custom Docker setups.

---

### **How to Work With Docker Networks**

1. **List networks**:
   ```bash
   docker network ls
   ```

2. **Inspect a network**:
   ```bash
   docker network inspect ngin-net
   ```

3. **Create a custom network**:
   ```bash
   docker network create --subnet=192.168.1.0/24 my-custom-net
   ```

4. **Run a container in a specific network**:
   ```bash
   docker run --rm --net=ngin-net nginx
   ```

---

# Docker Networking Overview

Docker networking is a critical concept that enables communication between containers and the outside world. By default, Docker uses a bridge network, but it provides several other network types that cater to different use cases. Here is an extensive guide to the various Docker networks, their configuration, and use cases, based on the insights from the provided transcript.

### Default Networks in Docker

When Docker is installed, it automatically creates several default networks. These networks allow containers to communicate with each other and the host system. You can view the available networks using the `docker network ls` command.

#### Default Networks
1. **Bridge Network** (`bridge`)
2. **Host Network** (`host`)
3. **None Network** (`null`)
4. **Custom Networks** (e.g., `rbv_default`, user-defined networks)

Example output from `docker network ls`:
```bash
47f8a7940cb1   bridge                 bridge    local
328dd46ec550   host                   host      local
a1afdab7fe68   none                   null      local
59bbdcb0e5e1   rbv_default            bridge    local
```

### 1. **Bridge Network (Default)**
![d6](https://github.com/user-attachments/assets/81541104-6bfa-4605-afc6-002cd2141dc7)

The **Bridge Network** is the default network mode for containers. When Docker containers are created without specifying a network, they are automatically connected to the default bridge network (`docker0`).

#### How It Works:
- Docker creates virtual Ethernet interfaces for each container and links them to the `docker0` bridge.
- The bridge acts as a virtual switch, enabling communication between containers on the same network.
- Containers are assigned IP addresses within a private subnet.

#### Features:
- **NAT (Network Address Translation)**: The `docker0` bridge uses NAT to allow containers to access external networks (e.g., the internet).
- **DNS Resolution**: Docker containers use DNS to resolve each other's names. The `/etc/resolv.conf` from the host system is copied to each container for DNS resolution.

#### Example:
```bash
# Create a container and connect it to the bridge network (default)
docker run -itd --rm --name nginx --network bridge nginx
```

- **Accessing Services**: To access a service inside a container from outside, you need to expose the ports using `-p` (port mapping). For example:
```bash
docker run -itd --name nginx -p 80:80 nginx
```

This maps the container's port 80 to the host's port 80.

#### Container Communication:
Containers on the same bridge network can ping each other by name. For example:
```bash
docker exec -it nginx ping nginx
```

---
![d3](https://github.com/user-attachments/assets/a4070d0c-a2de-4172-9727-384072d9b1d3)

### 2. **Host Network**

The **Host Network** mode allows containers to share the host’s network namespace. This means containers use the host’s IP address and networking directly, without isolation.

#### Features:
- No network isolation between the container and the host.
- Containers do not require port mapping (`-p`), as they directly use the host's IP and ports.

#### Example:
```bash
# Run a container on the host network
docker run -itd --network host --name nginx nginx
```

- In this case, the container's service (like NGINX) is available directly on the host’s IP address, and no port mapping is needed.
![d4](https://github.com/user-attachments/assets/cdcb19b4-7adc-43f4-9fa1-945f979d934e)
![d5](https://github.com/user-attachments/assets/945c0515-8867-4b8e-8103-c55ad693fda1)

---

### 3. **None Network**

The **None Network** mode disables networking for the container. This is useful when you want to run a container with no networking capabilities.

#### Features:
- The container has no network access.
- Useful in highly isolated scenarios where the container does not need to interact with the network.

#### Example:
```bash
docker run -itd --rm --network none nginx
```

---

### 4. **User-Defined Bridge Networks**

You can create custom bridge networks to gain more control over container isolation and networking.

#### Creating a Custom Bridge Network:
```bash
docker network create my_custom_bridge
```

You can then attach containers to this custom network:
```bash
docker run -itd --rm --name nginx --network my_custom_bridge nginx
```

#### Advantages:
- **Isolation**: Containers connected to a user-defined bridge network are isolated from other networks.
- **DNS Resolution**: Containers can resolve each other's names via DNS.
- **Communication**: Containers on the same user-defined bridge network can communicate with each other using their container names.

---

### 5. **MacVlan Network**

The **MacVlan Network** connects Docker containers directly to the physical network. Each container is assigned its own MAC address and IP address from the host's network, making them behave like physical devices on the network.

#### Features:
- Containers are directly accessible from other devices on the network.
- Containers get unique MAC and IP addresses.
- Requires the container's parent network interface to be specified.

#### Example:
```bash
docker network create -d macvlan \
  --subnet=192.168.1.0/24 \
  --gateway=192.168.1.1 \
  -o parent=eth0 macvlan_network

docker run -itd --network macvlan_network --name my_container nginx
```

#### Downside:
- **Port Conflicts**: Multiple containers may end up using the same port on a switch, leading to potential conflicts.
- **Promiscuous Mode**: You may need to enable promiscuous mode on the host’s network interface to ensure MacVlan networking works correctly.

---

### 6. **IPVLAN Network**

**IPVLAN** is an advanced version of MacVlan, designed to provide better performance by using a more efficient networking model. It is typically used when containers need direct access to the network but want to avoid the issues caused by MacVlan’s reliance on switches.

#### Example (with IPVLAN driver):
```bash
docker network create -d ipvlan \
  --subnet=192.168.1.0/24 \
  --gateway=192.168.1.1 \
  -o parent=eth0 ipvlan_network

docker run -itd --network ipvlan_network --name my_container nginx
```

#### More context into it 
It seems like you're diving deep into Docker networking and its advanced configurations, particularly with `MacVLAN` and `IPVLAN`, each of which brings its own set of advantages and challenges. Here's a summary of the concepts and differences:

### 1. **MacVLAN Networking**
   - **Bridge Mode**: Containers get their own MAC address, appearing as if they are individual devices on the network, allowing direct communication with the network. However, it can introduce issues due to network switches not handling multiple MAC addresses on a single port.
   - **Challenges**:
     - **Promiscuous Mode**: Required to allow multiple MAC addresses on a single network interface.
     - **DHCP Conflicts**: Docker might use its own DHCP for containers, causing potential conflicts with your network's DHCP server.
   - **Solution**: Enabling promiscuous mode on both the host network interface and virtual machines if necessary.

### 2. **IPVLAN Networking**
   - **L2 (Layer 2)**: Similar to `MacVLAN`, but the containers share the host's MAC address, reducing issues with network switches that can't handle multiple MAC addresses on a single port.
   - **L3 (Layer 3)**: This is the most advanced mode, where containers do not rely on a network bridge or switch. Instead, the host acts as a router, forwarding traffic to external networks. This mode eliminates broadcast traffic and allows for better isolation and more complex network architectures.
     - **L3 Key Feature**: No ARP or broadcast traffic, making it ideal for complex networks.
   
### 3. **IPVLAN L3 Routing**
   - **Network Isolation**: Containers using `IPVLAN L3` are isolated from each other and can only communicate with external networks (via the host's routing capabilities).
   - **Challenges**:
     - Containers cannot communicate with each other or the host without specific routing configurations.
     - This mode requires more advanced networking setups, and traditional Docker port mappings don't work here.


---

### 7. **Overlay Network**

The **Overlay Network** is used when you have multiple Docker hosts, such as in a Docker Swarm or Kubernetes setup. It abstracts the complexities of inter-host networking and simplifies communication between containers on different hosts, making them appear as if they are on the same local network. Overlay networks are essential for distributed applications that span multiple hosts, enabling seamless communication between services deployed across different physical or virtual machines.

#### Features:
- **Cross-Host Communication**: Overlay networks allow containers running on different Docker hosts to communicate as if they were on the same host.
- **Automatic Creation in Docker Swarm**: When using Docker Swarm, overlay networks are automatically created when services are deployed across nodes.
- **Encryption and Isolation**: In Docker, overlay networks can be encrypted, providing secure communication between containers. They can also offer network isolation between different groups of containers.
- **Scalability**: Overlay networks enable scalability in containerized environments by facilitating easy communication between containers on different machines, making it easier to scale applications horizontally.
- **Supports Multi-Host Networking**: Overlay networks in Swarm or Kubernetes are critical for multi-host networking, as they allow services and containers to interact in a seamless manner.

#### Use Cases:
- **Docker Swarm**: Enables communication between services running on different nodes in a Swarm.
- **Kubernetes**: Kubernetes uses overlay networks (like Calico, Flannel, or Weave) to manage pod-to-pod communication across different nodes.
  
#### Example:
In a Docker Swarm setup, overlay networks are automatically created when you deploy services. Here’s an example of manually creating an overlay network and using it within a service deployment:

```bash
# Create an overlay network
docker network create -d overlay my_overlay_network

# Deploy a service with the created overlay network
docker service create --name my_service --replicas 3 --network my_overlay_network nginx
```

In this example:
- We create an overlay network named `my_overlay_network`.
- We deploy a service called `my_service` with 3 replicas, all of which can communicate through the `my_overlay_network`.

As a result, all the containers (replicas) of `my_service` can communicate with each other, even if they are distributed across multiple Docker hosts, because they are part of the same overlay network.

#### Example in Kubernetes:
In Kubernetes, an overlay network is often used by default to enable communication between Pods on different nodes. For instance, using **Flannel** as the network plugin, each pod is assigned an IP address, and they can communicate across nodes as if they were on the same network:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx
        ports:
        - containerPort: 80
```

Here, multiple instances of the `nginx` container are created, and they can communicate with each other across different Kubernetes nodes using the overlay network set up by the network plugin (e.g., Flannel).

---

### Summary of Docker Network Types

| Network Type   | Use Case                                                   | Isolation Level   | Example Command                                                                 |
|----------------|------------------------------------------------------------|-------------------|---------------------------------------------------------------------------------|
| **Bridge**     | Default, single-host communication between containers      | Medium            | `docker run -itd --name nginx --network bridge nginx`                            |
| **Host**       | Containers share the host's network namespace              | None              | `docker run -itd --network host --name nginx nginx`                             |
| **None**       | No network; isolated container                             | High              | `docker run -itd --rm --network none nginx`                                     |
| **MacVlan**    | Containers directly connected to the physical network     | Low               | `docker network create -d macvlan --subnet=192.168.1.0/24 macvlan_network`      |
| **IPVLAN**     | Optimized version of MacVlan for better performance        | Low               | `docker network create -d ipvlan --subnet=192.168.1.0/24 ipvlan_network`       |
| **Overlay**    | Multi-host communication (Docker Swarm/Kubernetes)        | Medium            | `docker network create -d overlay my_overlay_network`                           |
| **User-Defined Bridge** | Custom networks with more control over isolation | Medium            | `docker network create my_custom_bridge`                                        |

By understanding these networking options and how they operate, you can optimize the deployment of your containers based on the networking requirements of your project.

# **Networking in Kubernetes**

## Theory
**Kubernetes Networking Overview - Part 1**

1. **Introduction to Kubernetes Networking**
   - The video introduces networking in Kubernetes, led by experts in the field.
   - Kubernetes' networking system allows communication between pods across nodes in a cluster, which is fundamental for application scalability and efficiency.
   - This section aims to provide both conceptual and practical understanding of how Kubernetes handles networking.

2. **Historical Background**
   - **Early Days of Kubernetes:**
     - Docker was the sole container runtime used in Kubernetes, which led to Docker being bundled directly into Kubernetes' codebase.
     - Over time, Kubernetes evolved, leading to the need for a more flexible approach where container runtimes could be interchangeable. 
   
   - **Container Runtimes and the Open Container Initiative (OCI):**
     - As container runtimes like Docker, Rocket (which is no longer active), and others emerged, Kubernetes needed a specification to standardize how runtimes interacted.
     - In 2016, the **Open Container Initiative (OCI)** was formed to create this standard, which included:
       - **Image Specification:** Defining what a container image is.
       - **Runtime Specification:** Defining how containers should run.
       - **Distribution Specification:** Outlining how container images are stored and distributed.
   
   - **Transition to OCI-Compliant Runtimes:**
     - By Kubernetes version 1.24, Docker support was removed, marking the completion of a long process started in 2016.
     - Docker, which was originally not OCI-compliant, re-architected itself to align with the OCI standards.

3. **Container Ecosystem**
   - **Docker’s Evolution:**
     - Docker is more than just a container runtime; it is a complete ecosystem. It includes a UI, CLI tools, and more to simplify the container lifecycle.
     - When `docker run` is executed, it doesn’t directly start the container. Instead, it passes the request to Docker's internal components, such as:
       - **ContainerD:** Manages container lifecycle.
       - **Docker Shim:** Bridges the gap between Docker and low-level container runtimes.
       - **RunC:** The container runtime that actually starts the container.
   
   - **Container Runtime Interfaces (CRI) in Kubernetes:**
     - Kubernetes uses **CRI** (Container Runtime Interface) to communicate with various container runtimes like **containerd**, **cryo**, or **Docker**.
     - Most Kubernetes clusters use **containerd** as the default container runtime for its efficiency and lightweight nature.

4. **Kubernetes Pod and Node Communication**
   - **Pod Specification and Scheduling:**
     - When a user requests to run a pod (via `kubectl` or API), Kubernetes’ **kube-scheduler** selects an appropriate node to run the pod.
     - The node then receives the request and interacts with the **CRI** to start the container.

5. **Network Setup in Kubernetes**
   - **Pod Networking:**
     - Every pod in Kubernetes is assigned a unique IP, regardless of the node it runs on, which is critical for pod-to-pod communication.
     - This unique IP must be reachable across all nodes within the cluster.

   - **Container Network Interface (CNI):**
     - Kubernetes does not provide default networking but allows the integration of a **CNI (Container Network Interface)** plugin to manage networking.
     - The CNI plugin is responsible for:
       - Assigning IPs to pods.
       - Enabling pod communication across nodes in the cluster.
     - Without CNI plugins, pods cannot communicate across nodes effectively.

   - **CNI Plugin Configuration:**
     - **CNI** handles networking by attaching network interfaces to pods and managing their IP allocation.
     - Kubernetes nodes require a CNI plugin to be installed for proper networking configuration (e.g., Flannel, Calico, Weave, etc.).

6. **Why Kubernetes Networking is Successful**
   - Kubernetes is a **highly pluggable system**, meaning that users can choose:
     - Container runtimes (e.g., containerd, cri-o).
     - Networking solutions (e.g., Calico, Flannel).
   - This flexibility makes Kubernetes adaptable to different environments and use cases, contributing to its widespread adoption and success.

This section dives deep into the details of how the Container Network Interface (CNI) and container runtimes work in Kubernetes, particularly how CNI is used to manage networking for pods. Here's a brief summary of key points and concepts mentioned:

1. **CNI (Container Network Interface)**:
   - CNI defines a set of standards and operations for network plugins to implement in containerized environments.
   - The CNI specification outlines operations such as adding, deleting, and listing network configurations, and provides the essential structure for networking plugins.
   - CNI plugins, such as Flannel, Calico, Weave, and Cilium, implement this specification. Cilium, in particular, is highlighted for its powerful feature set, including network policies and deep integrations for Kubernetes.

2. **CNI Plugins**:
   - CNI plugins are built based on the specifications, ensuring compatibility with Kubernetes.
   - Plugins must follow the CNI spec, implementing specific operations like IP address assignment, network setup, and cleanup.
   - These plugins enable seamless networking between containers, facilitating network communication, IP address management, and routing.
   
3. **Pod Networking and the Role of the Pause Container**:
   - A Kubernetes pod, which can contain multiple containers, shares the same network namespace, meaning all containers in a pod can communicate with each other over localhost.
   - The "pause container" is used to hold the network namespace for the pod. This allows the pod's containers to share the same network interface, even if they are running different container images.
   - The pause container is essential for creating a shared network namespace, a key concept for pod networking in Kubernetes.

4. **Network Communication**:
   - Within a pod, containers communicate using localhost (loopback address) and share an IP address.
   - For inter-pod communication, Kubernetes uses virtual Ethernet (VETH) pairs. These VETH pairs facilitate communication between containers and across nodes in the cluster.
   - When communication is initiated, packets are passed from one container's VETH to the node's root namespace, where the network bridge resolves the destination address.
   
5. **Practical Demonstration**:
   - The explanation uses a practical example of creating a pod with multiple containers to visualize how network namespaces are assigned and how traffic flows between pods and containers.
   - Tools like `kubectl`, `lsns`, and `ip link` are used to inspect network namespaces and interfaces at the node level, showing the network setup behind the scenes.
   - The demonstration also touches on how to use the `Calico` CNI plugin to configure networking rules and IP addresses for pods.

6. **Visualizing Kubernetes Networking**:
   - The video suggests using platforms like **Killer Koda**, which provides a free Kubernetes playground for testing these concepts, making it easier for users to experiment with networking configurations without needing to set up their own cluster.


## Kubernetes Networking

Kubernetes networking ensures communication between Pods, Services, and external clients. Key concepts include:

1. **Pod-to-Pod Communication:**
   - Every Pod gets a unique IP address (flat network model).
   - Pods can communicate without NAT, assuming they are in the same cluster.
   - Kubernetes uses a **CNI (Container Network Interface)** plugin (e.g., Flannel, Calico) to handle networking.

2. **Pod-to-Service Communication:**
   - Services expose a stable IP address or DNS name, providing load balancing to connect multiple Pods.
   - Kubernetes creates **ClusterIP**, which is reachable within the cluster.

3. **Service Types:**
   - **ClusterIP:** Default; accessible only within the cluster.
   - **NodePort:** Exposes the service on a port of each cluster node.
   - **LoadBalancer:** Integrates with cloud providers to provide an external IP.
   - **ExternalName:** Maps a service to an external DNS name.

4. **Ingress:**
   - Manages external access to services within a cluster.
   - Provides routing rules, SSL termination, and HTTP/HTTPS load balancing.

5. **Network Policies:**
   - Control traffic flow at the Pod level using ingress (incoming) and egress (outgoing) rules.
   - Allows isolation and security for workloads.

   **Example Network Policy YAML:**
   ```yaml
   apiVersion: networking.k8s.io/v1
   kind: NetworkPolicy
   metadata:
     name: allow-frontend
   spec:
     podSelector:
       matchLabels:
         app: frontend
     policyTypes:
     - Ingress
     ingress:
     - from:
       - podSelector:
           matchLabels:
             app: backend
   ```

6. **Kubernetes DNS:**
   - Provides DNS resolution for services and Pods.
   - Example: A Service named `my-service` in namespace `default` is reachable at `my-service.default.svc.cluster.local`.

---
## IN MORE DETAIL
In a **Kubernetes (K8s) cluster**, networking operates differently than in Docker containers running on a single host. Kubernetes provides a more sophisticated and distributed way to manage networking between containers, services, and external traffic. Here's an overview of how networking works in Kubernetes:

### 1. **Pod Networking**
Each container in Kubernetes runs in a **Pod**, and Kubernetes uses a **flat network model** where each Pod is assigned a unique IP address within the cluster. This allows containers within the same Pod to communicate with each other via `localhost`, and containers in different Pods can communicate using the Pod's IP addresses.

- **Pod-to-Pod Communication**: Pods within the same Kubernetes cluster can communicate with each other directly using their unique Pod IP addresses.
  
  Example: If Pod A has IP `10.244.1.2` and Pod B has IP `10.244.1.3`, they can communicate directly, like `curl http://10.244.1.3`.

### 2. **Service Networking**
In Kubernetes, Pods can be grouped together by creating a **Service**, which acts as an abstraction layer over the Pods. A Service provides a stable DNS name (e.g., `my-service.default.svc.cluster.local`) and IP address for accessing the Pods it manages.

- **Service-to-Pod Communication**: A Service routes traffic to the Pods it is targeting based on labels. Kubernetes ensures that traffic to the Service IP is forwarded to the correct Pod, even if the Pods are recreated or rescheduled.
  
  Example: A Service named `my-service` could route traffic to Pods with the label `app=my-app`.

### 3. **ClusterIP (Default Service Type)**
- The default type of service in Kubernetes is **ClusterIP**, which means the service is accessible only inside the cluster.
- **External access** to the service is not possible using ClusterIP alone.

### 4. **NodePort**
If you want to expose a service outside the cluster, you can use **NodePort**.
- When you create a Service of type `NodePort`, Kubernetes will allocate a port on every node in the cluster (e.g., `30001`). You can then access the service using `http://<NodeIP>:<NodePort>`.
- NodePort is usually used for development or debugging.

Example of exposing a service on a NodePort:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app: my-app
  ports:
    - protocol: TCP
      port: 8080
      targetPort: 80
      nodePort: 30001
  type: NodePort
```
This exposes your app at `http://<NodeIP>:30001`.

### 5. **LoadBalancer**
In a production setup, especially in cloud environments (AWS, GCP, Azure), you can use **LoadBalancer** type services.
- Kubernetes automatically provisions an external load balancer and assigns it a public IP.
- External traffic is routed through the load balancer to the correct Pods, providing high availability and scaling.

Example of exposing a service using LoadBalancer:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app: my-app
  ports:
    - protocol: TCP
      port: 8080
      targetPort: 80
  type: LoadBalancer
```
This will create a cloud load balancer that routes traffic to your service.

### 6. **Ingress**
For advanced routing and HTTPS management, **Ingress** is used in Kubernetes.
- Ingress allows you to expose HTTP and HTTPS services with URL path-based routing, SSL termination, and load balancing.
- It requires an **Ingress Controller** (like NGINX) to be set up in the cluster.

Example of an Ingress resource:
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app-ingress
spec:
  rules:
  - host: my-app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: my-service
            port:
              number: 8080
```
This Ingress will route traffic to `my-service` when users visit `my-app.example.com`.

### Summary of Networking in Kubernetes:
1. **Pod Networking**: Each Pod gets a unique IP address.
2. **Service Networking**: Services route traffic to Pods, providing stable access points.
3. **NodePort**: Exposes the service on a port on each node for external access.
4. **LoadBalancer**: Automatically provisions a cloud load balancer to route traffic to your service.
5. **Ingress**: Provides advanced HTTP/HTTPS routing with SSL termination.

For security:
- Kubernetes uses **Network Policies** to control communication between Pods and Services.
- You can configure **firewalls**, **Ingress Controllers**, and **TLS** to secure the traffic between Pods and external access.



### **Comparison: Docker vs. Kubernetes Networking**

| Feature                  | Docker                            | Kubernetes                               |
|--------------------------|-----------------------------------|-----------------------------------------|
| **Networking Scope**     | Local container communication.    | Cluster-wide communication.             |
| **IP Address**           | Container-specific.               | Pod-specific, flat network.             |
| **External Access**      | Port mapping in Docker.           | Services (NodePort, LoadBalancer).      |
| **Load Balancing**       | Limited to container level.       | Built-in through Services.              |
| **Security Policies**    | Limited.                          | Network Policies for traffic control.   |

Both systems handle networking differently, with Kubernetes offering more robust and scalable solutions for containerized applications in distributed environments.


### Some K8 networking examples:
Certainly! Below is an example that explains the concepts and steps mentioned, particularly focusing on how networking works within Kubernetes with CNI (Container Network Interface) and how it facilitates pod communication and network configuration. 

### Example:

Let's assume we're using **Calico** as the CNI plugin and working in a **multi-node Kubernetes cluster**.

#### **Step 1: Set up a Kubernetes Pod with CNI Plugin**

You create a pod using `kubectl`. The pod has two containers: a `busybox` container and an `nginx` container. The pod is deployed on **Node 1** of the Kubernetes cluster.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: shared-namespace
spec:
  containers:
  - name: busybox
    image: busybox
  - name: nginx
    image: nginx
```

#### **Step 2: Pod Creation and Network Namespace**

- When the pod is created, a **pause container** is created first. The **pause container** is responsible for holding the network namespace for the pod. In Kubernetes, every pod gets a network namespace, and the containers inside the pod share the same network namespace (so they can communicate using `localhost`).
- The network namespace holds **virtual Ethernet (veth)** interfaces, such as `eth0`, for the containers within the pod.

When you run the following command, you'll see the pod is running on **Node 1**:

```bash
kubectl get pod shared-namespace -o wide
```

#### **Step 3: Understanding Network Namespace and Virtual Ethernet**

- Each container inside the pod gets an **Ethernet interface** (such as `eth0`) that is part of the virtual Ethernet pair, which communicates with the pod’s network namespace.
- This `eth0` interface is used for communication between containers within the same pod.
- Calico creates additional interfaces that connect the pod’s network namespace to the host's network.

To check the details of the network namespace, you can run:

```bash
kubectl exec -it shared-namespace -- ip addr
```

You will see the `lo` (loopback) interface and the `eth0` interface. The `eth0` interface is assigned the IP address for the pod.

#### **Step 4: Inter-Node Communication**

Now, let's simulate **communication between pods across nodes** in the cluster.

- Assume the pod `shared-namespace` is running on **Node 1**, and we want to communicate with another pod running on **Node 2**.
- The traffic goes from `eth0` in **Pod 1** to the virtual Ethernet interface (`veth`) on **Node 1**, where it is routed via the **Calico plugin**.
- **Calico** will handle the IP routing and network policies to ensure that the packet is forwarded to the correct pod on **Node 2**.
- **IP Tables** on the node manage how packets are forwarded between different network namespaces and the root namespace.

To check the status of the network namespaces and interfaces on Node 1, you can SSH into the node and run:

```bash
# SSH into Node 1
ssh user@node1

# Check network namespaces
lsns

# Check the network interfaces within the pod's network namespace
ip netns exec <namespace> ip link show
```

#### **Step 5: Networking Across Multiple Nodes**

Assuming **Pod A** on **Node 1** needs to communicate with **Pod B** on **Node 2**, the communication process would look like this:

1. **Pod A** on **Node 1** sends traffic to **Pod B** on **Node 2**.
2. **Pod A's eth0** interface communicates with the virtual Ethernet pair (`veth`) on **Node 1**.
3. The traffic is passed to **Calico**, which uses **IP routing** to route the traffic to the correct IP address.
4. Calico forwards the packet to **Node 2**, and **Node 2** then forwards the packet to **Pod B** via its own virtual Ethernet pair.

In **Node 2**, you can verify that the correct interfaces are set up:

```bash
# SSH into Node 2
ssh user@node2

# Check network interfaces on Node 2
ip addr show
```

If the network communication is working, you should see the `eth0` interface corresponding to **Pod B** in **Node 2**.

#### **Step 6: Verifying Pod-to-Pod Communication**

You can now check the inter-pod communication by running:

```bash
# From Pod A (on Node 1)
kubectl exec -it shared-namespace -- curl <IP_of_Pod_B_on_Node_2>:<port>
```

If everything is configured correctly, **Pod A** should be able to reach **Pod B** and vice versa.

### Key Points:
1. **CNI Plugins** (e.g., Calico) define how networking is set up for containers in a pod.
2. Each pod in Kubernetes is given its own **network namespace** to isolate its networking.
3. The **pause container** in Kubernetes holds the network namespace for the pod.
4. **Virtual Ethernet pairs (veth)** are created to allow communication between the containers and between different nodes.
5. **Calico** (or other CNI plugins) manages IP routing, network policies, and inter-pod communication.

