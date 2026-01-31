# PostgreSQL Replication & Failover Runbook

## Overview

This runbook documents the operational procedures for managing the PostgreSQL high-availability
cluster using Patroni, etcd, and HAProxy for the Enterprise Email Platform.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Monitoring & Health Checks](#monitoring--health-checks)
3. [Automatic Failover](#automatic-failover)
4. [Manual Failover Procedures](#manual-failover-procedures)
5. [Recovery Procedures](#recovery-procedures)
6. [Replication Lag Management](#replication-lag-management)
7. [Emergency Procedures](#emergency-procedures)
8. [Maintenance Operations](#maintenance-operations)
9. [Alerting Configuration](#alerting-configuration)

---

## Architecture Overview

### Components

| Component  | Purpose                  | Count        |
| ---------- | ------------------------ | ------------ |
| PostgreSQL | Database engine          | 3 nodes      |
| Patroni    | HA management & failover | 3 instances  |
| etcd       | Distributed consensus    | 3 nodes      |
| HAProxy    | Load balancing & routing | 1+ instances |

### Connection Endpoints

| Port      | Endpoint         | Use Case                    |
| --------- | ---------------- | --------------------------- |
| 5000      | Primary (R/W)    | All write operations        |
| 5001      | Replicas (R/O)   | Read-heavy queries, reports |
| 5002      | Any healthy node | Connection poolers          |
| 7000      | HAProxy stats    | Monitoring dashboard        |
| 8008-8010 | Patroni REST API | Cluster management          |

### Data Flow

```
Application
    │
    ▼
HAProxy (5000/5001)
    │
    ├──► Primary (patroni1) ──────┐
    │         │                   │
    │    replication              │ Streaming
    │         │                   │ Replication
    │         ▼                   │
    ├──► Replica (patroni2) ◄─────┤
    │                             │
    └──► Replica (patroni3) ◄─────┘
```

---

## Monitoring & Health Checks

### Patroni REST API Endpoints

```bash
# Check if node is primary (returns 200 for primary)
curl -s http://localhost:8008/primary
# Returns: {"role":"master","state":"running",...}

# Check if node is replica (returns 200 for replica)
curl -s http://localhost:8008/replica
# Returns: {"role":"replica","state":"running",...}

# Get full cluster status
curl -s http://localhost:8008/cluster | jq '.'

# Get cluster configuration
curl -s http://localhost:8008/config | jq '.'

# Health check (200 if node is healthy)
curl -s http://localhost:8008/health
```

### Critical Metrics to Monitor

#### 1. Replication Lag

```sql
-- On primary: check replication status
SELECT
    client_addr,
    state,
    sent_lsn,
    write_lsn,
    flush_lsn,
    replay_lsn,
    pg_wal_lsn_diff(sent_lsn, replay_lsn) AS lag_bytes,
    pg_size_pretty(pg_wal_lsn_diff(sent_lsn, replay_lsn)) AS lag_pretty
FROM pg_stat_replication;

-- On replica: check lag from replica's perspective
SELECT
    CASE
        WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() THEN 0
        ELSE EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp())
    END AS replication_lag_seconds;
```

#### 2. Connection Count

```sql
-- Current connections per database
SELECT
    datname,
    count(*) as connections,
    count(*) FILTER (WHERE state = 'active') as active,
    count(*) FILTER (WHERE state = 'idle') as idle,
    count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
FROM pg_stat_activity
WHERE datname IS NOT NULL
GROUP BY datname;
```

#### 3. WAL Generation Rate

```sql
-- WAL generation rate (run twice with 1 minute gap)
SELECT pg_current_wal_lsn();
-- Compare values to calculate bytes/second
```

### Prometheus Metrics

Patroni exposes these key metrics at `/metrics`:

```
# Cluster state
patroni_cluster_unlocked{scope="email-cluster"} 0
patroni_master{scope="email-cluster"} 1
patroni_standby_leader{scope="email-cluster"} 0
patroni_replica{scope="email-cluster"} 0

# Replication
patroni_postgres_timeline{scope="email-cluster"} 1
patroni_postgres_running{scope="email-cluster"} 1

# Lag (in bytes)
patroni_replication_lag{scope="email-cluster"} 0
```

### Health Check Script

```bash
#!/bin/bash
# check-cluster-health.sh

check_node() {
    local node=$1
    local port=$2

    # Check Patroni API
    if curl -sf "http://${node}:${port}/health" > /dev/null; then
        echo "✓ ${node} Patroni API healthy"
    else
        echo "✗ ${node} Patroni API UNHEALTHY"
        return 1
    fi

    # Get role
    role=$(curl -sf "http://${node}:${port}/" | jq -r '.role')
    state=$(curl -sf "http://${node}:${port}/" | jq -r '.state')
    echo "  Role: ${role}, State: ${state}"

    # Check lag if replica
    if [ "$role" = "replica" ]; then
        lag=$(curl -sf "http://${node}:${port}/" | jq -r '.xlog.replayed_location')
        echo "  Replayed LSN: ${lag}"
    fi
}

echo "=== Cluster Health Check ==="
check_node "localhost" 8008  # patroni1
check_node "localhost" 8009  # patroni2
check_node "localhost" 8010  # patroni3

echo ""
echo "=== etcd Health ==="
docker exec email-etcd1 etcdctl endpoint health --cluster

echo ""
echo "=== HAProxy Status ==="
curl -sf http://localhost:7000/stats?stats;csv | grep -E "^postgres" | cut -d',' -f1,2,18
```

---

## Automatic Failover

### How Automatic Failover Works

1. **Leader election** is managed by Patroni via etcd
2. **Heartbeat monitoring**: Patroni checks leader every `loop_wait` seconds (10s)
3. **Failure detection**: After `ttl` (30s) without heartbeat, leader is considered failed
4. **Candidate selection**: Replica with least lag becomes new leader
5. **Promotion**: Patroni promotes selected replica to primary
6. **HAProxy routing**: Automatically routes to new primary (via health checks)

### Failover Timeline

| Time  | Event                             |
| ----- | --------------------------------- |
| T+0s  | Primary fails/stops responding    |
| T+10s | Replicas notice missed heartbeat  |
| T+30s | TTL expires, leader key released  |
| T+31s | Replicas start election           |
| T+32s | New leader elected                |
| T+35s | New primary accepting connections |
| T+45s | HAProxy routes to new primary     |

**Total failover time: ~30-45 seconds**

### Failover Constraints

Configured in `patroni.yml`:

```yaml
bootstrap:
  dcs:
    maximum_lag_on_failover: 1048576 # 1MB max lag for failover candidate
    maximum_lag_on_syncnode: -1 # No limit for sync replica
    master_start_timeout: 300 # Wait 5min for old master to restart
```

---

## Manual Failover Procedures

### Planned Failover (Switchover)

Use for planned maintenance:

```bash
# 1. Check current cluster state
./manage-cluster.sh status

# 2. Identify current leader and target
curl -s http://localhost:8008/cluster | jq '.members[] | {name, role, lag}'

# 3. Perform switchover via Patroni API
curl -s -X POST http://localhost:8008/switchover \
  -H "Content-Type: application/json" \
  -d '{
    "leader": "patroni1",
    "candidate": "patroni2",
    "scheduled_at": "2024-01-15T02:00:00+00:00"
  }'

# 4. Or perform immediate switchover
curl -s -X POST http://localhost:8008/switchover \
  -H "Content-Type: application/json" \
  -d '{"leader": "patroni1", "candidate": "patroni2"}'

# 5. Monitor progress
watch -n 2 './manage-cluster.sh status'
```

### Forced Failover (Emergency)

Use when primary is unresponsive:

```bash
# 1. Verify primary is truly unavailable
ping patroni1
curl -sf http://localhost:8008/health || echo "Primary unresponsive"

# 2. Force failover
curl -s -X POST http://localhost:8009/failover \
  -H "Content-Type: application/json" \
  -d '{"candidate": "patroni2"}'

# 3. If cluster is stuck, restart Patroni on candidate
docker exec -it email-patroni2 patronictl failover email-cluster --force

# 4. As last resort, manually promote replica
docker exec -it email-patroni2 \
  pg_ctl promote -D /var/lib/postgresql/data
```

---

## Recovery Procedures

### Scenario 1: Failed Replica Recovery

```bash
# 1. Check the failed replica status
curl -s http://localhost:8010/  # patroni3

# 2. If data is corrupted, reinitialize from primary
curl -s -X POST http://localhost:8010/reinitialize \
  -H "Content-Type: application/json" \
  -d '{"force": true}'

# 3. Monitor reinitialization
watch -n 5 'curl -s http://localhost:8010/ | jq ".state"'

# 4. Alternative: Use manage-cluster.sh
./manage-cluster.sh reinit patroni3
```

### Scenario 2: Failed Primary Recovery (After Failover)

```bash
# 1. Start the old primary
docker start email-patroni1

# 2. Patroni will automatically:
#    - Detect it's no longer leader
#    - Use pg_rewind to sync with new primary
#    - Rejoin as replica

# 3. If pg_rewind fails, reinitialize
curl -s -X POST http://localhost:8008/reinitialize \
  -H "Content-Type: application/json" \
  -d '{"force": true}'

# 4. Monitor recovery
watch -n 5 './manage-cluster.sh status'
```

### Scenario 3: Complete Cluster Recovery

```bash
# 1. Stop all services
./manage-cluster.sh stop

# 2. Start etcd first and wait for quorum
docker compose -f docker-compose.ha.yml up -d etcd1 etcd2 etcd3
sleep 15

# 3. Check etcd health
docker exec email-etcd1 etcdctl endpoint health --cluster

# 4. Start Patroni nodes one at a time
docker compose -f docker-compose.ha.yml up -d patroni1
sleep 30  # Wait for first node to become leader

docker compose -f docker-compose.ha.yml up -d patroni2 patroni3
sleep 30  # Wait for replicas to sync

# 5. Start HAProxy
docker compose -f docker-compose.ha.yml up -d haproxy

# 6. Verify
./manage-cluster.sh status
```

### Scenario 4: etcd Cluster Recovery

```bash
# If single etcd node fails:
docker start email-etcd1  # Just restart it

# If etcd cluster loses quorum (2+ nodes down):
# 1. Stop Patroni nodes first
docker stop email-patroni1 email-patroni2 email-patroni3

# 2. Remove stale etcd data
docker exec email-etcd1 rm -rf /etcd-data/*
docker exec email-etcd2 rm -rf /etcd-data/*
docker exec email-etcd3 rm -rf /etcd-data/*

# 3. Restart etcd cluster
docker restart email-etcd1 email-etcd2 email-etcd3
sleep 15

# 4. Restart Patroni (will re-register in etcd)
docker start email-patroni1 email-patroni2 email-patroni3
```

---

## Replication Lag Management

### Acceptable Lag Thresholds

| Level     | Lag       | Action                  |
| --------- | --------- | ----------------------- |
| Normal    | < 1 MB    | None                    |
| Warning   | 1-10 MB   | Investigate             |
| Critical  | 10-100 MB | Immediate attention     |
| Emergency | > 100 MB  | Stop reads from replica |

### Causes of High Replication Lag

1. **Network issues**: Packet loss, high latency
2. **Disk I/O**: Slow disks on replica
3. **Heavy write load**: Primary generating WAL faster than replica can apply
4. **Long-running queries**: Blocking replay on replica
5. **Resource constraints**: CPU/memory on replica

### Remediation Steps

```bash
# 1. Check current lag
curl -s http://localhost:8009/ | jq '.xlog'

# 2. Check for long-running queries blocking replay
psql -h localhost -p 5433 -U postgres -c "
SELECT pid, age(clock_timestamp(), xact_start), state, query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY xact_start;"

# 3. If lag is severe, temporarily remove from load balancer
# Update haproxy.cfg to disable the lagging replica
# Or use Patroni tags:
curl -s -X PATCH http://localhost:8009/config \
  -H "Content-Type: application/json" \
  -d '{"tags": {"noloadbalance": true}}'

# 4. Let replica catch up, then re-enable
curl -s -X PATCH http://localhost:8009/config \
  -H "Content-Type: application/json" \
  -d '{"tags": {"noloadbalance": false}}'
```

---

## Emergency Procedures

### Split-Brain Prevention

Patroni prevents split-brain by:

1. Using etcd for distributed locking
2. Only allowing writes to the node holding the leader key
3. Fencing: Old primary demotes itself when it loses leader key

**If split-brain is suspected:**

```bash
# 1. Immediately stop all application connections
# Update HAProxy to reject all connections

# 2. Check which node etcd thinks is leader
docker exec email-etcd1 etcdctl get /service/email-cluster/leader

# 3. Check each Patroni node's view
curl -s http://localhost:8008/cluster
curl -s http://localhost:8009/cluster
curl -s http://localhost:8010/cluster

# 4. Stop the non-leader node that thinks it's primary
docker stop email-patroni1  # if it's the rogue node

# 5. Let remaining cluster stabilize
sleep 30
./manage-cluster.sh status

# 6. Reinitialize the stopped node
docker start email-patroni1
curl -s -X POST http://localhost:8008/reinitialize -d '{"force":true}'
```

### Data Corruption Recovery

```bash
# 1. Stop the corrupted node
docker stop email-patroni1

# 2. If primary is corrupted, failover first
./manage-cluster.sh failover patroni2

# 3. Remove corrupted data
docker volume rm email-patroni1_data

# 4. Recreate volume and reinitialize
docker compose -f docker-compose.ha.yml up -d patroni1
# Patroni will automatically bootstrap from healthy replica
```

### Network Partition Recovery

```bash
# When network partition resolves:

# 1. Check all nodes see each other
docker exec email-etcd1 etcdctl endpoint status --cluster

# 2. Check Patroni cluster state
curl -s http://localhost:8008/cluster | jq '.members'

# 3. If duplicate leaders existed, demote the one that was isolated
curl -s -X POST http://localhost:8008/restart \
  -H "Content-Type: application/json" \
  -d '{"role": "replica"}'

# 4. Reinitialize if data diverged
curl -s -X POST http://localhost:8008/reinitialize -d '{"force":true}'
```

---

## Maintenance Operations

### Rolling Restart

```bash
#!/bin/bash
# rolling-restart.sh

# Restart replicas first
for replica in patroni2 patroni3; do
    echo "Restarting $replica..."
    docker restart email-$replica
    sleep 60  # Wait for replica to rejoin

    # Verify it's healthy
    until curl -sf http://localhost:8009/health; do
        sleep 5
    done
    echo "$replica is healthy"
done

# Failover before restarting primary
echo "Performing switchover..."
./manage-cluster.sh failover patroni2
sleep 30

# Restart old primary (now replica)
echo "Restarting patroni1..."
docker restart email-patroni1
sleep 60

# Optionally failback to patroni1
./manage-cluster.sh failover patroni1
```

### Configuration Changes

```bash
# 1. Update patroni.yml

# 2. Apply to cluster via API
curl -s -X PATCH http://localhost:8008/config \
  -H "Content-Type: application/json" \
  -d '{
    "postgresql": {
      "parameters": {
        "max_connections": 300
      }
    }
  }'

# 3. Check pending restart
curl -s http://localhost:8008/cluster | jq '.members[] | {name, pending_restart}'

# 4. Restart nodes if needed (rolling)
curl -s -X POST http://localhost:8009/restart  # replica first
sleep 30
curl -s -X POST http://localhost:8010/restart  # replica
sleep 30
# Switchover then restart old primary
```

### Adding a New Replica

```bash
# 1. Add new service to docker-compose.ha.yml (patroni4)

# 2. Update HAProxy config to include new node

# 3. Start the new node
docker compose -f docker-compose.ha.yml up -d patroni4

# 4. Patroni will automatically:
#    - Create base backup from primary
#    - Start streaming replication
#    - Register in cluster

# 5. Monitor progress
watch -n 5 'curl -s http://localhost:8011/ | jq "{state, xlog}"'
```

---

## Alerting Configuration

### Prometheus Alert Rules

```yaml
# postgresql-alerts.yml
groups:
  - name: postgresql-ha
    rules:
      # Cluster has no leader
      - alert: PostgresNoLeader
        expr: sum(patroni_master{scope="email-cluster"}) == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL cluster has no leader"
          description: "The email-cluster has no active primary node"

      # High replication lag
      - alert: PostgresReplicationLag
        expr: patroni_replication_lag{scope="email-cluster"} > 10485760
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "PostgreSQL replication lag > 10MB"
          description: "Replica {{ $labels.instance }} has {{ $value | humanize1024 }} lag"

      # Critical replication lag
      - alert: PostgresReplicationLagCritical
        expr: patroni_replication_lag{scope="email-cluster"} > 104857600
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL replication lag > 100MB"
          description: "Replica {{ $labels.instance }} has critical lag"

      # Node unhealthy
      - alert: PostgresNodeUnhealthy
        expr: patroni_postgres_running{scope="email-cluster"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL node unhealthy"
          description: "Node {{ $labels.instance }} is not running"

      # Too few replicas
      - alert: PostgresInsufficientReplicas
        expr: sum(patroni_replica{scope="email-cluster"}) < 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "PostgreSQL cluster has fewer than 2 replicas"
          description: "Only {{ $value }} replicas available"

      # etcd health
      - alert: EtcdUnhealthy
        expr: etcd_server_has_leader == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "etcd cluster has no leader"
          description: "etcd instance {{ $labels.instance }} reports no leader"

      # Connection count high
      - alert: PostgresConnectionsHigh
        expr: pg_stat_activity_count > 180
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "PostgreSQL connections above 180"
          description: "{{ $value }} connections (max 200)"
```

### PagerDuty Integration

```yaml
# alertmanager.yml
receivers:
  - name: "postgresql-critical"
    pagerduty_configs:
      - service_key: "<your-service-key>"
        description: "{{ .CommonAnnotations.summary }}"
        details:
          firing: "{{ .Alerts.Firing }}"

route:
  receiver: "default"
  routes:
    - match:
        alertname: PostgresNoLeader
      receiver: "postgresql-critical"
    - match:
        alertname: PostgresReplicationLagCritical
      receiver: "postgresql-critical"
```

---

## Quick Reference

### Common Commands

```bash
# Cluster status
./manage-cluster.sh status

# Switchover (planned)
curl -X POST http://localhost:8008/switchover \
  -d '{"leader":"patroni1","candidate":"patroni2"}'

# Failover (emergency)
curl -X POST http://localhost:8009/failover \
  -d '{"candidate":"patroni2"}'

# Reinitialize node
curl -X POST http://localhost:8010/reinitialize -d '{"force":true}'

# Restart node
curl -X POST http://localhost:8008/restart

# Check lag
curl -s http://localhost:8009/ | jq '.xlog.replayed_location'

# Pause cluster (stops failovers)
curl -X PATCH http://localhost:8008/config -d '{"pause": true}'

# Resume cluster
curl -X PATCH http://localhost:8008/config -d '{"pause": false}'
```

### Contacts

| Role          | Contact                | Escalation      |
| ------------- | ---------------------- | --------------- |
| DBA On-Call   | dba-oncall@company.com | PagerDuty       |
| Platform Team | platform@company.com   | Slack #platform |
| Security Team | security@company.com   | For data breach |

---

## Revision History

| Date       | Version | Author        | Changes         |
| ---------- | ------- | ------------- | --------------- |
| 2024-01-15 | 1.0     | Platform Team | Initial runbook |
