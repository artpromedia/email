# Integration Test Runner Dockerfile
FROM golang:1.22-alpine

# Install dependencies
RUN apk add --no-cache \
    git \
    curl \
    postgresql-client \
    bash \
    jq

# Set working directory
WORKDIR /app

# Copy go mod files first for caching
COPY go.work go.work.sum* ./
COPY services/smtp-server/go.mod services/smtp-server/go.sum ./services/smtp-server/
COPY services/auth/go.mod services/auth/go.sum ./services/auth/
COPY services/ai-assistant/go.mod services/ai-assistant/go.sum ./services/ai-assistant/
COPY services/imap-server/go.mod services/imap-server/go.sum ./services/imap-server/
COPY services/storage/go.mod services/storage/go.sum ./services/storage/
COPY services/domain-manager/go.mod services/domain-manager/go.sum ./services/domain-manager/

# Download dependencies
RUN cd /app && go work sync || true

# Copy test files
COPY tests/integration/ ./tests/integration/

# Set the entrypoint
ENTRYPOINT ["go", "test", "-v", "-timeout", "300s", "./tests/integration/..."]
