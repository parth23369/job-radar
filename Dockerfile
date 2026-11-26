# One image for the daily run, the weekly report and the alert.
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app

# Dependencies first, so this layer is reused until the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY config.mjs ./
COPY src ./src
COPY scripts ./scripts
COPY data/discovered-boards.json ./data/

# The app writes only to data/ and out/. The code stays owned by root.
RUN mkdir -p data/jobs out && chown -R node:node data out
USER node

# Safe by default: nothing is mailed and no job is marked as seen.
CMD ["node", "src/daily.mjs", "--dry-run"]
