# Build stage
FROM golang:1.21-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Copy all source code first for go mod tidy
COPY . .

# Fix dependencies and download
RUN go mod tidy && go mod download

# Build
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o storage-service .

# Runtime stage
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

# Copy binary
COPY --from=builder /app/storage-service .

# Copy migrations
COPY --from=builder /app/migrations ./migrations

# Create non-root user
RUN adduser -D -u 1000 appuser
USER appuser

EXPOSE 8080

ENTRYPOINT ["./storage-service"]
