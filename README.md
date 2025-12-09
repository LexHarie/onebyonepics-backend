# onebyonepics-backend

## Docker

This repository includes a multistage `Dockerfile` that builds the TypeScript Nest/Fastify server with Bun and then runs the compiled output in a production slice of the same image.

```bash
# build the container locally
docker build -t onebyonepics-backend .

# run the server; make sure to expose the same port that the app listens on (default Nest port is 3000)
docker run --env-file .env -p 3000:3000 onebyonepics-backend
```

## GitHub action deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which:

1. Builds the Docker image on the runner.
2. Saves the image archive and uploads it to your DigitalOcean droplet over SSH.
3. Loads the image there, stops the previous container (if any), and runs the new container with the provided flags.

Ensure the droplet already has Docker and Git installed, then provide these repository secrets:

| Secret | Purpose |
|---|---|
| `DO_USER` | SSH username for the droplet |
| `DO_HOST` | Droplet hostname or IP |
| `DO_SSH_PORT` | Optional SSH port (defaults to 22 if empty) |
| `DO_SSH_PRIVATE_KEY` | Private key that has access to the droplet |
| `DO_DEPLOY_PATH` | Temporary directory on the droplet where the image archive is uploaded |
| `DOCKER_RUN_FLAGS` | Flags passed to `docker run` (default: `-d --restart unless-stopped -p 3000:3000`) |
| `DOCKER_ENV_FILE` | Optional path to an env file on the droplet (`--env-file`) |
| `DO_IMAGE_NAME`, `DO_IMAGE_TAG`, `DO_CONTAINER_NAME` | Optional overrides for the image/tag/container names |
