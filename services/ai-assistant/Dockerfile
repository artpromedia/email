FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files
COPY go.mod go.sum* ./

# Copy source code
COPY . .

# Fix dependencies and download
RUN go mod tidy && go mod download

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /ai-assistant .

# Final stage
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy binary from builder
COPY --from=builder /ai-assistant .
COPY --from=builder /app/config.yaml .

# Create non-root user
RUN adduser -D -g '' appuser
USER appuser

# Expose port
EXPOSE 8090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8090/health || exit 1

# Run
ENTRYPOINT ["./ai-assistant"]
