# Headless opencode server. The app talks to it over the internal compose network; it uses the
# credentials in auth.json (e.g. an opencode Go subscription) to reach the model providers.
FROM node:22-bookworm-slim

ARG OPENCODE_VERSION=latest
RUN npm install -g "opencode-ai@${OPENCODE_VERSION}" \
 && npm cache clean --force \
 && apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node opencode.json /home/node/.config/opencode/opencode.json
RUN mkdir -p /home/node/.local/share/opencode /workspace && chown -R node:node /home/node /workspace

USER node
WORKDIR /workspace
EXPOSE 4096
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:4096/config/providers -u "opencode:${OPENCODE_SERVER_PASSWORD}" || exit 1
CMD ["opencode", "serve", "--hostname", "0.0.0.0", "--port", "4096"]
