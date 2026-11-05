Important Docker Commands - 
### 1. **Docker Installation and Version**
- `docker --version` – Displays the installed Docker version.
- `docker info` – Provides detailed information about the Docker installation.

### 2. **Container Management**
- `docker run <image>` – Creates and starts a container from an image.
- `docker run -d <image>` – Runs a container in detached mode (in the background).
- `docker run -it <image>` – Runs a container interactively with a terminal.
- `docker ps` – Lists all running containers.
- `docker ps -a` – Lists all containers (running and stopped).
- `docker stop <container_id>` – Stops a running container.
- `docker start <container_id>` – Starts a stopped container.
- `docker restart <container_id>` – Restarts a container.
- `docker pause <container_id>` – Pauses a running container.
- `docker unpause <container_id>` – Unpauses a paused container.
- `docker exec -it <container_id> <command>` – Executes a command in a running container (e.g., `docker exec -it <container_id> bash`).
- `docker attach <container_id>` – Attaches to a running container.
- `docker rm <container_id>` – Removes a container.
- `docker logs <container_id>` – Shows the logs of a container.
- `docker inspect <container_id>` – Provides detailed information about a container.

### 3. **Image Management**
- `docker images` – Lists all available images on your local machine.
- `docker pull <image>` – Pulls an image from a Docker registry (e.g., Docker Hub).
- `docker build -t <image_name>:<tag> <path>` – Builds a Docker image from a Dockerfile.
- `docker rmi <image_id>` – Removes an image.
- `docker tag <image_id> <new_image_name>` – Tags an image with a new name.
- `docker push <image>` – Pushes an image to a Docker registry (e.g., Docker Hub).

### 4. **Networking**
- `docker network ls` – Lists all Docker networks.
- `docker network inspect <network_name>` – Displays detailed information about a Docker network.
- `docker network create <network_name>` – Creates a new Docker network.
- `docker network connect <network_name> <container_name>` – Connects a container to a network.
- `docker network disconnect <network_name> <container_name>` – Disconnects a container from a network.

### 5. **Volume Management**
- `docker volume ls` – Lists all volumes.
- `docker volume create <volume_name>` – Creates a new volume.
- `docker volume inspect <volume_name>` – Displays detailed information about a volume.
- `docker volume rm <volume_name>` – Removes a volume.

### 6. **Docker Compose**
- `docker-compose up` – Starts all services defined in the `docker-compose.yml` file.
- `docker-compose up -d` – Starts all services in detached mode.
- `docker-compose down` – Stops and removes all containers, networks, and volumes defined in the `docker-compose.yml` file.
- `docker-compose logs` – Displays logs for all services.
- `docker-compose ps` – Lists the status of containers managed by Docker Compose.

### 7. **System Cleanup**
- `docker system prune` – Removes unused data (containers, images, networks, and volumes).
- `docker container prune` – Removes all stopped containers.
- `docker image prune` – Removes all unused images.
- `docker volume prune` – Removes all unused volumes.
- `docker network prune` – Removes all unused networks.

### 8. **Container and Image Searching**
- `docker search <image_name>` – Searches for images on Docker Hub.

### 9. **Docker Hub Authentication**
- `docker login` – Logs in to Docker Hub.
- `docker logout` – Logs out from Docker Hub.

### 10. **Docker Info and Performance**
- `docker stats` – Displays real-time statistics for containers.
- `docker top <container_id>` – Displays the running processes of a container.
- `docker diff <container_id>` – Shows the changes made to the container's filesystem.

These commands cover a wide range of Docker functionalities and will help with container, image, volume, and network management.