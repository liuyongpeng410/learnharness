# Local LearnHarness image for Docker Desktop's Linux/amd64 engine.
# Official Node.js image only. This project does not publish a supported image.
# CI and desktop release builds use Node 26.

# Digest recorded from the linux/amd64 build that was HTTP-checked.
ARG NODE_IMAGE=node:26-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1

FROM ${NODE_IMAGE} AS build

WORKDIR /src
ENV NEXT_TELEMETRY_DISABLED=1 \
	CI=1 \
	NPM_CONFIG_AUDIT=false \
	NPM_CONFIG_FUND=false \
	NPM_CONFIG_UPDATE_NOTIFIER=false

RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run plugins:setup \
	&& npm run build \
	&& node scripts/build-server.mjs \
	&& test -f .next/standalone/server.js \
	&& test -d .next/standalone/core-plugins \
	&& test -d .next/standalone/.next/static \
	&& test -d .next/standalone/public

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production \
	NEXT_TELEMETRY_DISABLED=1 \
	PORT=3000

WORKDIR /app
COPY --from=build --chown=node:node /src/.next/standalone /app
COPY --chown=node:node docker/entrypoint.mjs /app/docker-entrypoint.mjs

RUN mkdir -p /var/lib/learnharness/data \
	&& chown -R node:node /var/lib/learnharness

VOLUME ["/var/lib/learnharness"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:3000/').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "/app/docker-entrypoint.mjs"]
