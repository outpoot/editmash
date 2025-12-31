ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-slim AS base-node
WORKDIR /app
ENV NODE_ENV="production"
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
    build-essential \
    node-gyp \
    pkg-config \
    python-is-python3 \
    curl \
    ca-certificates \
    unzip \
    libc6 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

FROM base-node AS build-main
WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install --include=dev --platform=linux --arch=x64

COPY . .

RUN npm run build

FROM base-node AS build-websocket
WORKDIR /websocket

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

COPY websocket/tsconfig.json ./
COPY websocket/*.ts ./

COPY src/gen ./src/gen

RUN bun add -d bun-types @bufbuild/protobuf

RUN bun build server.ts --outdir dist --target bun

FROM base-node AS production-main
WORKDIR /app

COPY --from=build-main --chown=node:node /app/.next/standalone ./
COPY --from=build-main --chown=node:node /app/.next/static ./.next/static
COPY --from=build-main --chown=node:node /app/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]

FROM oven/bun:1 AS production-websocket
WORKDIR /websocket

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build-websocket --chown=bun:bun /websocket/dist ./dist

USER bun
EXPOSE 8080
CMD ["bun", "run", "dist/server.js"]
