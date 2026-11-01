FROM node:22-bookworm-slim
WORKDIR /app
ARG APP_RELEASE=unversioned
ENV APP_RELEASE=$APP_RELEASE
# ffmpeg converts iPhone QuickTime uploads to MP4 in the worker (src/platform/video-transcode.ts).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates ffmpeg && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build && npm prune --omit=dev && mkdir -p /data/media && chown node:node /data/media
USER node
CMD ["node", "dist/src/platform/main.js"]
