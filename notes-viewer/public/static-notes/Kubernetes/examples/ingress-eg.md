Here’s a simple example to demonstrate how Ingress, Services, and Ingress Controllers work in Kubernetes:

### Scenario:
We have two services:
1. **App1** (a simple web app)
2. **App2** (another web app)

We want to route the traffic based on the URL path:
- Traffic to `http://example.com/app1` should go to **App1**.
- Traffic to `http://example.com/app2` should go to **App2**.

### Steps:

#### 1. **Create Services (App1 and App2)**

First, we create two services to expose our applications (Pods).

- **App1 Service**: 
```yaml
apiVersion: v1
kind: Service
metadata:
  name: app1-service
spec:
  selector:
    app: app1
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8080
```

- **App2 Service**:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: app2-service
spec:
  selector:
    app: app2
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8080
```

These services are internal and can route traffic to the appropriate Pods running App1 and App2.

#### 2. **Define Ingress Resource**

Now, we create an **Ingress** resource to route external HTTP traffic based on the path (`/app1` and `/app2`) to the right service.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: example-ingress
spec:
  rules:
    - host: example.com
      http:
        paths:
          - path: /app1
            pathType: Prefix
            backend:
              service:
                name: app1-service
                port:
                  number: 80
          - path: /app2
            pathType: Prefix
            backend:
              service:
                name: app2-service
                port:
                  number: 80
```

#### 3. **Ingress Controller Setup**

The **Ingress Controller** is responsible for managing traffic and implementing the routing rules defined in the **Ingress** resource. Typically, you deploy a controller like **NGINX Ingress Controller** or **Traefik**. It listens for Ingress resources and configures the actual HTTP routing.

#### 4. **How it Works**

- **DNS Setup**: The domain `example.com` is resolved to the IP address of your **Ingress Controller** (this could be via a LoadBalancer or NodePort).
- **Path Matching**:
  - Requests to `http://example.com/app1` are routed to `app1-service`.
  - Requests to `http://example.com/app2` are routed to `app2-service`.

This means that the Ingress controller reads the rules, checks the URL path, and forwards the request to the appropriate service within the Kubernetes cluster.

#### 5. **Test It**

- If you go to `http://example.com/app1`, the Ingress controller will route the request to **App1**.
- If you go to `http://example.com/app2`, the request will be routed to **App2**.

#### 6. **Internal vs External**

- **Services** like `app1-service` and `app2-service` are **internal** to the Kubernetes cluster. They handle routing traffic to the respective Pods (running your applications).
- The **Ingress Controller** listens for external traffic and routes it based on the defined rules.

---

### Summary:
- The **Ingress** defines the routing rules to map HTTP paths (`/app1`, `/app2`) to specific internal services.
- The **Ingress Controller** listens for incoming traffic and manages the routing to the right backend services.
- The **Services** expose the internal Pods that run your applications.

This is a simple example to show how external HTTP requests are routed to different internal services using Ingress in Kubernetes.