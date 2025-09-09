#############################################
# builder: install deps and build assets
#############################################
FROM node:20-bullseye AS builder
WORKDIR /app
COPY package*.json ./
# Install deps without running scripts; then run explicit build
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

#############################################
# runner: minimal image for runtime
#############################################
FROM node:20-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# Install production deps without running postinstall
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy application source and built assets
COPY --from=builder /app/public/dist /app/public/dist
COPY . .

# Ensure non-root
USER node

# Expose and healthcheck
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node /app/scripts/healthcheck.js || exit 1

CMD ["node", "server.js"]
