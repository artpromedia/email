FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o chat ./main.go

# Runtime image
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/chat .
COPY --from=builder /app/config.yaml .

# Create non-root user
RUN adduser -D -g '' chatuser
USER chatuser

EXPOSE 8086 9094

ENTRYPOINT ["./chat"]
CMD ["-config", "config.yaml"]
