# Multi-Stage Build for SMTP Server
FROM golang:1.23-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies and update go.sum
RUN go mod download && go mod tidy

# Copy source code
COPY . .

# Re-run go mod tidy with full source to ensure all dependencies
RUN go mod tidy

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -ldflags="-w -s" -o smtp-server .

# Runtime image
FROM alpine:3.19

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata

# Create non-root user
RUN addgroup -g 1000 smtp && \
    adduser -u 1000 -G smtp -s /bin/sh -D smtp

# Create directories
RUN mkdir -p /app/config /app/data /app/certs && \
    chown -R smtp:smtp /app

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/smtp-server .

# Copy default config
COPY --from=builder /app/config.yaml ./config/config.yaml

# Switch to non-root user
USER smtp

# Expose ports
# 25 - SMTP (receiving)
# 587 - Submission (sending, STARTTLS)
# 465 - SMTPS (implicit TLS)
# 9090 - Metrics
EXPOSE 25 587 465 9090

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:9090/health || exit 1

# Default command
ENTRYPOINT ["./smtp-server"]
CMD ["-config", "/app/config/config.yaml"]
