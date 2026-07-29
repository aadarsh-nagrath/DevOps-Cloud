

# ☁️ Centro de Preparación para DevOps y Cloud

¡Bienvenido al **Centro de Preparación para DevOps y Cloud**! Este repositorio funciona como un depósito centralizado de notas, un centro de referencias rápidas (cheatsheets) y un entorno de aprendizaje para cubrir prácticas modernas de infraestructura como código (IaC), contenedores, orquestación, automatización, redes y GitOps.

---

## 🗺️ Hoja de ruta y camino de preparación

![{E8C03455-8EAB-408E-A69E-B67D70AF9287}](https://github.com/user-attachments/assets/94e9ae3d-654e-42c3-8601-feee0c012103)

---

## 📂 Contenido del Repositorio

Las notas están categorizadas y estructuradas de la siguiente manera:

*   **☸️ Kubernetes & CKA**: Guías de preparación exhaustivas, especificaciones de recursos, configuraciones de Kustomize/Helm, modelos de red y resolución de dudas sobre k8s. Consulta las carpetas [`Kubernetes/`](./Kubernetes) y [`CKA/`](./CKA).
*   **🐳 Docker**: Referencias rápidas para contenedores, patrones de optimización y configuraciones de red avanzadas en el directorio [`docker/`](./docker).
*   **📜 Scripting & Linux**: Protocolos de scripting en Bash, índices de comandos de Linux y referencias de permisos en [`scripting/`](./scripting).
*   **🛠️ Terraform & CloudFormation**: Patrones de infraestructura como código, espacios de trabajo, entornos y modelos de prueba en el directorio [`Terraform and CF/`](./Terraform%20and%20CF).
*   **🚀 GitOps & CI/CD**: ArgoCD, pipelines de integración de Jenkins, mejores prácticas de GitOps y patrones serverless de Knative.

---

## 🖥️ Visor de Interfaz de Usuario del Centro de Notas

Hemos agregado una aplicación de página única (SPA) personalizada y premium para navegar, buscar y visualizar tus notas en tu navegador con resaltado de sintaxis completo.

### Primeros pasos

1.  **Navega al directorio del Centro de Notas**:
    ```bash
    cd notes-viewer
    ```

2.  **Instala las dependencias**:
    ```bash
    npm install
    ```

3.  **Inicia el servidor**:
    ```bash
    PORT=3005 npm start
    ```

4.  **Abre en el navegador**:
    Accede a [http://localhost:3005](http://localhost:3005) para leer tus notas dinámicamente!

### Características
*   **Interfaz oscura y elegante con estilo Glassmorphism** con alternancia de tema claro/oscuro.
*   **Íconos tecnológicos elegantes** correspondientes al contexto del archivo.
*   **Navegación interactiva por árbol en la barra lateral** con filtro de texto en tiempo real.
*   **Resaltado de sintaxis de código** (YAML, Bash, Dockerfile, Terraform/HCL, JSON).
*   **Diseños responsivos** adecuados para lectura en pantalla dividida lado a lado mientras se programa.

---

## 🤝 Contribuciones

¡Las contribuciones, comentarios y reportes de problemas son bienvenidos! No dudes en abrir una solicitud de extracción (pull request) o enviar una sugerencia.
