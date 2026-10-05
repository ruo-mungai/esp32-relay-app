# Backend image for long-running hosts (Railway / Render / Fly.io / VPS).
FROM node:22-alpine

WORKDIR /app

# Install production deps first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Only the backend source is needed at runtime.
COPY server ./server

ENV NODE_ENV=production
EXPOSE 4000

# DB_FILE defaults to a mounted volume on the host (see .env.example).
CMD ["node", "server/index.js"]
