FROM oven/bun:latest AS builder
WORKDIR /app

# Install deps and compile the TypeScript sources for a reproducible bundle
COPY package.json bun.lock bunfig.toml tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN bun install --frozen-lockfile
RUN bun run build

FROM oven/bun:latest AS runtime
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/bunfig.toml ./bunfig.toml
# Scripts and src needed for migrations (scripts import from src/database/migrations)
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src

RUN bun install --production --frozen-lockfile

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/main.js"]
