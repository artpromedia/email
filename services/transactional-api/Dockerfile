FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git ca-certificates

# Copy all source code first for go mod tidy
COPY . .

# Fix dependencies and download
RUN go mod tidy && go mod download

# Build
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o transactional-api .

# Final image
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata

# Security: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /app/transactional-api .
COPY --from=builder /app/config.yaml .

USER appuser

EXPOSE 8080

CMD ["./transactional-api", "-config", "config.yaml"]
