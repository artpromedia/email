# Load Testing Suite

This directory contains k6 load tests for the Enterprise Email Platform.

## Overview

The load tests validate system performance under realistic and stress conditions:

| Test     | Target        | Standard Load    | Stress Load       |
| -------- | ------------- | ---------------- | ----------------- |
| SMTP     | smtp-server   | 1,000 concurrent | 2,000 concurrent  |
| IMAP     | imap-server   | 5,000 concurrent | 10,000 concurrent |
| API      | web app       | 2,000 RPS        | 3,000 RPS         |
| Combined | Full workflow | 200 concurrent   | 500 concurrent    |

## Test Files

| File                             | Description                            |
| -------------------------------- | -------------------------------------- |
| `smtp-load-test.js`              | Basic SMTP load test                   |
| `smtp-high-throughput.js`        | 1000+ concurrent SMTP connections test |
| `imap-load-test.js`              | IMAP server concurrent sessions test   |
| `api-load-test.js`               | API endpoint load test                 |
| `api-high-rps.js`                | 2000+ RPS API test                     |
| `combined-workflow-test.js`      | Full email workflow (send/receive)     |
| `stress-test.js`                 | System stress and breaking point test  |
| `database-load-test.js`          | Database performance test              |
| `concurrent-connections-test.js` | Connection pool testing                |

## Prerequisites

### Install k6

```bash
# macOS
brew install k6

# Ubuntu/Debian
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Docker
docker pull grafana/k6
```

### SMTP/IMAP Extensions (Optional)

For native SMTP/IMAP protocol testing, install k6 extensions:

```bash
# Build k6 with extensions using xk6
go install go.k6.io/xk6/cmd/xk6@latest
xk6 build --with github.com/grafana/xk6-smtp --with github.com/grafana/xk6-imap
```

## Quick Start

```bash
# Make scripts executable
chmod +x run-load-tests.sh

# Run smoke test (quick validation)
./run-load-tests.sh smoke all

# Run standard load test
./run-load-tests.sh standard all

# Run specific test
./run-load-tests.sh standard smtp
```

## Test Profiles

| Profile    | Duration | Description                          |
| ---------- | -------- | ------------------------------------ |
| `smoke`    | 1 min    | Quick validation, low load           |
| `standard` | 10 min   | Recommended for beta testing         |
| `stress`   | 15 min   | High load, find breaking points      |
| `soak`     | 60 min   | Extended duration, find memory leaks |

## Test Details

### SMTP Load Test (`smtp-load-test.js`)

Tests SMTP server performance:

- Connection establishment
- Email sending with various sizes
- Concurrent connection handling
- Error handling under load

**Metrics:**

- `smtp_connect_duration` - Time to establish connection
- `smtp_send_duration` - Time to send email
- `email_success_rate` - Percentage of successful sends

### IMAP Load Test (`imap-load-test.js`)

Tests IMAP server with realistic user behaviors:

- Quick check (50%) - Check for new mail
- Read emails (30%) - Fetch and read messages
- IDLE session (15%) - Long-running push connections
- Heavy sync (5%) - Full mailbox synchronization

**Metrics:**

- `imap_connect_duration` - Connection time
- `imap_login_duration` - Authentication time
- `imap_select_duration` - Mailbox selection time
- `imap_fetch_duration` - Message fetch time
- `session_success_rate` - Successful session percentage

### API Load Test (`api-load-test.js`)

Tests web API endpoints:

- Authentication flow
- Email listing and pagination
- Email fetching
- Search functionality
- Email sending
- Email management (read, delete)

**Metrics:**

- `api_latency` - Overall API response time
- `auth_latency` - Authentication time
- `email_list_latency` - List endpoint time
- `search_latency` - Search endpoint time
- `request_success_rate` - Successful request percentage

## Configuration

### Environment Variables

```bash
# SMTP configuration
export SMTP_HOST=smtp.example.com
export SMTP_PORT=25
export SMTP_USER=loadtest
export SMTP_PASS=password

# IMAP configuration
export IMAP_HOST=imap.example.com
export IMAP_PORT=143
export IMAP_USER=loadtest
export IMAP_PASS=password
export IMAP_TLS=true

# API configuration
export BASE_URL=https://mail.example.com
```

### Running with Docker

```bash
# Run SMTP test with Docker
docker run -i grafana/k6 run - < smtp-load-test.js \
  -e SMTP_HOST=host.docker.internal \
  -e SMTP_PORT=25

# Run with custom VUs and duration
docker run -i grafana/k6 run - < api-load-test.js \
  --vus 100 \
  --duration 5m \
  -e BASE_URL=http://host.docker.internal:3000
```

## Results

Results are saved to the `results/` directory:

```
results/
├── smtp-load-test-summary.json
├── smtp-metrics.json
├── imap-load-test-summary.json
├── imap-metrics.json
├── api-load-test-summary.json
├── api-metrics.json
└── load-test-report.md
```

## Thresholds

Default performance thresholds (adjust based on requirements):

| Metric       | Threshold   | Description                        |
| ------------ | ----------- | ---------------------------------- |
| SMTP connect | p95 < 1s    | 95% of connections under 1 second  |
| SMTP send    | p95 < 5s    | 95% of sends under 5 seconds       |
| IMAP connect | p95 < 2s    | 95% of connections under 2 seconds |
| IMAP login   | p95 < 1s    | 95% of logins under 1 second       |
| API response | p95 < 500ms | 95% of API calls under 500ms       |
| Success rate | > 99%       | At least 99% successful operations |

## Monitoring During Tests

### Grafana Dashboard

Import the k6 dashboard in Grafana:

1. Add InfluxDB as data source
2. Import dashboard ID: 2587

### Real-time Output

```bash
# Run with real-time metrics to InfluxDB
k6 run --out influxdb=http://localhost:8086/k6 smtp-load-test.js
```

## Troubleshooting

### High Error Rates

1. Check target service health
2. Verify network connectivity
3. Check for rate limiting
4. Review server logs for errors

### Memory Issues

1. Reduce VU count
2. Add `--no-thresholds` to skip threshold checking
3. Use `--summary-trend-stats` to reduce memory

### Slow Tests

1. Check network latency to target
2. Verify target service has adequate resources
3. Consider running tests closer to target
