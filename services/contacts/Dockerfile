FROM golang:1.22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates

# Copy all source code first for go mod tidy
COPY . .

# Fix dependencies and download
RUN go mod tidy && go mod download

RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o contacts-service .

FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata

# Security: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /app/contacts-service .
COPY --from=builder /app/config.yaml .

USER appuser

EXPOSE 8083

CMD ["./contacts-service", "-config", "config.yaml"]
