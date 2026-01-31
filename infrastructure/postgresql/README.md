# PostgreSQL High Availability with Patroni

This directory contains configuration for a highly available PostgreSQL cluster using Patroni, etcd, and HAProxy.

## Architecture

```
                    ┌─────────────────┐
                    │    HAProxy      │
                    │  (Load Balancer)│
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
    ┌──────┴──────┐   ┌──────┴──────┐   ┌──────┴──────┐
    │  Patroni 1  │   │  Patroni 2  │   │  Patroni 3  │
    │  (Primary)  │   │  (Replica)  │   │  (Replica)  │
    │  PostgreSQL │   │  PostgreSQL │   │  PostgreSQL │
    └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │
                    ┌────────┴────────┐
                    │  etcd Cluster   │
                    │ (3-node quorum) │
                    └─────────────────┘
```

## Components

- **Patroni**: PostgreSQL HA manager with automatic failover
- **etcd**: Distributed key-value store for leader election
- **HAProxy**: Load balancer for routing read/write traffic

## Endpoints

| Port | Purpose | Description |
|------|---------|-------------|
| 5000 | Primary (R/W) | Routes to current leader only |
| 5001 | Replicas (R/O) | Routes to all healthy replicas |
| 5002 | Any Node | Routes to any healthy node |
| 7000 | HAProxy Stats | Web dashboard for monitoring |
| 8008-8010 | Patroni API | REST API for each Patroni node |

## Quick Start

```bash
# Start the HA cluster
./manage-cluster.sh start

# Check cluster status
./manage-cluster.sh status

# View HAProxy stats
open http://localhost:7000

# Connect to primary
psql -h localhost -p 5000 -U email_app -d enterprise_email

# Connect to read replica
psql -h localhost -p 5001 -U email_readonly -d enterprise_email
```

## Management Commands

```bash
# Start cluster
./manage-cluster.sh start

# Stop cluster
./manage-cluster.sh stop

# View status
./manage-cluster.sh status

# Perform manual failover
./manage-cluster.sh failover <target-node>

# Reinitialize a failed node
./manage-cluster.sh reinit <node-name>

# View logs
./manage-cluster.sh logs [node-name]
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_SUPERUSER_PASSWORD` | `superuser_password` | PostgreSQL superuser password |
| `POSTGRES_REPLICATION_PASSWORD` | `replicator_password` | Replication user password |
| `POSTGRES_PASSWORD` | `app_password` | Application user password |
| `POSTGRES_READONLY_PASSWORD` | `readonly_password` | Read-only user password |

### Scaling

To add more replicas, copy an existing patroni service definition and update:
1. Container name and hostname
2. Port mappings
3. Volume name

## Monitoring

### Patroni API Endpoints

```bash
# Check if node is primary
curl http://localhost:8008/primary

# Check if node is replica
curl http://localhost:8008/replica

# Get cluster status
curl http://localhost:8008/cluster

# Get node configuration
curl http://localhost:8008/config
```

### Prometheus Metrics

Patroni exposes metrics at `/metrics` endpoint. Add to your Prometheus config:

```yaml
scrape_configs:
  - job_name: 'patroni'
    static_configs:
      - targets:
        - 'patroni1:8008'
        - 'patroni2:8008'
        - 'patroni3:8008'
```

## Failover Testing

```bash
# Simulate primary failure
docker stop email-patroni1

# Watch automatic failover (takes ~30 seconds)
./manage-cluster.sh status

# Restart failed node (will rejoin as replica)
docker start email-patroni1
```

## Production Considerations

1. **Network Isolation**: Place the cluster in a private network
2. **SSL/TLS**: Enable SSL in patroni.yml for encrypted connections
3. **Backup**: Configure continuous archiving to S3/MinIO
4. **Monitoring**: Set up alerting for replication lag and failover events
5. **Resource Limits**: Add memory/CPU limits in docker-compose
6. **Persistent Storage**: Use network-attached storage for data volumes
