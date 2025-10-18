# SSH Client API

This is a FastAPI application that provides an API for managing SSH connections and users. It uses a PostgreSQL database to store user information.

## Features

*   User management (CRUD operations for users).
*   SSH connection handling.

## Demo

[![Project Demo](https://github.com/user-attachments/assets/bda99407-0431-49ca-98c0-c7b5b4dc6380)](https://github.com/user-attachments/assets/bda99407-0431-49ca-98c0-c7b5b4dc6380)


For a full list of dependencies, please see the `requirements.txt` file.

## Installation and Running the Project

To run this project, you will need to have Docker and Docker Compose installed.

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd ssh_cleint
    ```

2.  **Create a `.env` file:**
    Create a `.env` file in the root of the project and add the following environment variables:
    ```
    POSTGRES_USER=
    POSTGRES_PASSWORD=
    POSTGRES_HOST=
    POSTGRES_PORT=
    POSTGRES_DB=
    ```

3.  **Run with Docker Compose:**
    ```bash
    docker-compose up -d --build
    ```
    This will build the Docker containers and run the application in detached mode.

4.  **Apply database migrations:**
    Once the containers are running, you can apply the database migrations with the following command:
    ```bash
    docker-compose exec web alembic upgrade head
    ```

