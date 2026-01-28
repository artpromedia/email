# Build stage
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s -X main.version=$(git describe --tags --always --dirty 2>/dev/null || echo 'dev')" \
    -o /imap-server \
    .

# Runtime stage
FROM alpine:3.20

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata

# Create non-root user
RUN addgroup -g 1000 imap && \
    adduser -u 1000 -G imap -s /bin/sh -D imap

# Create directories
RUN mkdir -p /etc/imap /var/mail/storage /var/log/imap && \
    chown -R imap:imap /var/mail /var/log/imap

# Copy binary
COPY --from=builder /imap-server /usr/local/bin/imap-server

# Copy default config
COPY config.yaml /etc/imap/config.yaml

# Use non-root user
USER imap

# Expose IMAP ports
EXPOSE 143 993 9090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:9090/health || exit 1

# Run
ENTRYPOINT ["/usr/local/bin/imap-server"]
CMD ["-config", "/etc/imap/config.yaml"]
