# syntax=docker/dockerfile:1.7
# payee-api and source-gateway (06 §9.1). The default command runs the API; compose overrides it for the gateway.
FROM node:22-bookworm-slim
ENV NODE_ENV=production NPM_CONFIG_UPDATE_NOTIFIER=false
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY app/package.json ./app/package.json
COPY services/source-gateway/package.json ./services/source-gateway/package.json
# The lockfile spans every workspace, so npm needs their manifests even though only app and the gateway are installed.
COPY ui/package.json ./ui/package.json
COPY video/package.json ./video/package.json
RUN npm ci --omit=dev --include=optional --workspace=app --workspace=services/source-gateway --include-workspace-root \
 && npm cache clean --force
COPY tsconfig.json ./
COPY bin ./bin
COPY app ./app
COPY services ./services
# The World Model and H-MEM engines are vendored byte-for-byte under vendor/meterless (app/engines/* are one-line facades over them).
COPY vendor ./vendor
COPY scripts/fetch-tessdata.ts scripts/smoke.ts ./scripts/
COPY data ./data
COPY input_examples ./input_examples
RUN node --import tsx scripts/fetch-tessdata.ts \
 && mkdir -p logs .world data/hmem uploads \
 && chown -R node:node logs .world data/hmem uploads \
 && ln -s /app/bin/probity.mjs /usr/local/bin/probity
USER node
EXPOSE 8787 8790
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "app/server.ts"]
