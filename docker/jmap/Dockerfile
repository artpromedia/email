FROM node:18-alpine

WORKDIR /app

# Install dependencies
RUN apk add --no-cache postgresql-client

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY src/ ./src/

# Create logs directory
RUN mkdir -p /var/log/jmap

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8081/health || exit 1

EXPOSE 8081

CMD ["node", "src/server.js"]
