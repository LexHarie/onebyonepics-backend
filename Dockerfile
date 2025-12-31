FROM oven/bun:1
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

EXPOSE 3001
CMD ["bun", "run", "src/index.ts"]
