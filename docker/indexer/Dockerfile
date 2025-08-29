FROM node:18-alpine

WORKDIR /app

# Install dependencies
RUN apk add --no-cache postgresql-client redis-tools

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY src/ ./src/

# Create logs directory
RUN mkdir -p /var/log/indexer

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD pgrep -f "mail-indexer" || exit 1

EXPOSE 3001

CMD ["node", "src/indexer.js"]
