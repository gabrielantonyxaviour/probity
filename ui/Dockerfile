# syntax=docker/dockerfile:1.7
# Build context is the repo root: docker build -f ui/Dockerfile .  (06 section 9.2)
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY app/schemas ./app/schemas
COPY ui/package.json ui/package-lock.json* ./ui/
RUN cd ui && (test -f package-lock.json && npm ci || npm install)
COPY ui ./ui
RUN cd ui && npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3100 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /repo/ui/.next/standalone ./
COPY --from=build /repo/ui/.next/static ./.next/static
COPY --from=build /repo/ui/public ./public
USER node
EXPOSE 3100
CMD ["node", "server.js"]
