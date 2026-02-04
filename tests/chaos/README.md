# Chaos Engineering Tests

This directory contains chaos engineering experiments for testing the resilience of the OONRUMAIL system.

## Overview

Chaos engineering helps verify that the system can handle various failure scenarios gracefully. These experiments simulate real-world failures to identify weaknesses before they cause production incidents.

## Prerequisites

1. **Chaos Toolkit**: Install the chaos toolkit and extensions
   ```bash
   pip install chaostoolkit chaostoolkit-kubernetes chaostoolkit-lib
   ```

2. **Docker**: Ensure Docker and docker-compose are installed

3. **Running System**: Start the email system with replication enabled
   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.replication.yml up -d
   ```

4. **Stress Tools**: Install stress-ng in containers for resource experiments
   ```bash
   docker exec oonrumail-web apk add --no-cache stress-ng
   ```

## Available Experiments

### 1. Database Primary Failure (`database-primary-failure`)
Tests automatic failover when the primary PostgreSQL database becomes unavailable.

**What it tests:**
- Replica promotion
- Connection pool handling
- Query rerouting
- Data consistency

### 2. Redis Cache Failure (`redis-failure`)
Tests system behavior when the Redis cache is unavailable.

**What it tests:**
- Degraded mode operation
- Rate limiting fallback
- Session handling
- Cache miss handling

### 3. Network Partition (`network-partition`)
Simulates network issues between services.

**What it tests:**
- Service isolation
- Timeout handling
- Retry logic
- Circuit breakers

### 4. High CPU Load (`high-cpu-load`)
Injects CPU stress to test performance under load.

**What it tests:**
- Request queuing
- Timeout handling
- Priority scheduling
- Auto-scaling triggers

### 5. Memory Pressure (`memory-pressure`)
Simulates memory exhaustion scenarios.

**What it tests:**
- OOM handling
- Graceful degradation
- Container restart recovery
- Memory leak detection

### 6. Disk I/O Saturation (`disk-io-saturation`)
Tests behavior when storage is slow or saturated.

**What it tests:**
- Write queue handling
- Read timeouts
- Attachment upload handling
- Database performance

### 7. DNS Failure (`dns-failure`)
Simulates DNS resolution failures.

**What it tests:**
- Email delivery queuing
- Retry mechanisms
- Fallback DNS servers
- Cached resolutions

### 8. Certificate Issues (`certificate-issues`)
Tests handling of TLS certificate problems.

**What it tests:**
- STARTTLS fallback
- Certificate validation
- Secure connection handling
- Error reporting

## Running Experiments

### Run a single experiment
```bash
./run-chaos-tests.sh database-primary-failure
```

### Run all experiments
```bash
./run-chaos-tests.sh --all
```

### List available experiments
```bash
./run-chaos-tests.sh --list
```

### Validate experiments (dry run)
```bash
./run-chaos-tests.sh --dry-run
```

## Results

Results are stored in the `results/` directory:

- `<experiment>_<timestamp>.json` - Raw experiment results
- `<experiment>_<timestamp>_journal.json` - Chaos Toolkit journal
- `<experiment>_<timestamp>_report.html` - HTML report
- `<experiment>_<timestamp>.log` - Execution log
- `snapshots/<experiment>/` - Pre-chaos system snapshots

## Safety Guidelines

1. **Never run in production** without proper safeguards
2. **Always run during low-traffic periods** if testing in staging
3. **Monitor the system** during experiments
4. **Have rollback procedures ready**
5. **Notify the team** before running experiments

## Adding New Experiments

To add a new experiment:

1. Add the experiment definition to `chaos-experiments.yaml`
2. Define the steady-state hypothesis (what should be true normally)
3. Define the chaos method (what failure to inject)
4. Define rollback procedures
5. Add the experiment name to `EXPERIMENTS` array in `run-chaos-tests.sh`

## Interpreting Results

### Steady-State Hypothesis
If the hypothesis fails before injecting chaos, the system has an existing issue.

### During Chaos
Monitor:
- Response times
- Error rates
- Resource usage
- Queue depths

### After Rollback
The system should return to its steady state within the defined tolerance.

## Recommended Experiment Schedule

| Experiment | Frequency | Best Time |
|------------|-----------|-----------|
| Database failover | Weekly | Maintenance window |
| Redis failure | Weekly | Low traffic |
| Network partition | Bi-weekly | Maintenance window |
| CPU/Memory stress | Monthly | Staging only |
| Certificate issues | Before renewals | Staging |

## Metrics to Monitor

During chaos experiments, monitor:

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (if configured)
- **Application logs**: `docker-compose logs -f`
- **Database replication lag**: Check `pg_stat_replication`

## Troubleshooting

### Experiment fails immediately
- Check if services are running: `docker ps`
- Verify network connectivity
- Check resource availability

### System doesn't recover
- Check container logs: `docker-compose logs <service>`
- Verify rollback executed: Check journal file
- Manual intervention may be needed

### Steady-state check fails
- The system may have an existing issue
- Check application health endpoints
- Review recent changes

## Contributing

When adding experiments:
1. Document the failure scenario
2. Define clear success criteria
3. Include proper rollback procedures
4. Test in development first
5. Get team review before merging
