# SSH Client API

This is a FastAPI application that provides an API for managing SSH connections and users. It uses a PostgreSQL database to store user information.

## Features

*   User management (CRUD operations for users).
*   SSH connection handling.

## Demo

[![Project Demo](https://via.placeholder.com/800x450.png?text=Project+Demo)](https://example.com/path/to/your/video.mp4)

*Replace the image and link with your own project demo video.*

## Dependencies

The main dependencies are:
*   fastapi
*   uvicorn
*   sqlalchemy
*   alembic
*   psycopg2-binary
*   paramiko
*   websockets
*   jinja2
*   pydantic-settings

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
    POSTGRES_USER=your_postgres_user
    POSTGRES_PASSWORD=your_postgres_password
    POSTGRES_DB=your_postgres_db
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

