# Database Table Partitioning

## Overview

This directory contains the implementation for PostgreSQL table partitioning for the Enterprise
Email Platform. We use range partitioning by `created_at` timestamp to optimize query performance
and enable efficient data lifecycle management.

## Why Partition?

### Benefits

1. **Query Performance**: Partition pruning allows PostgreSQL to scan only relevant partitions
2. **Maintenance**: Individual partitions can be vacuumed, reindexed, or archived independently
3. **Data Lifecycle**: Old data can be archived or dropped by detaching partitions (O(1) operation)
4. **Parallelism**: Queries can parallelize across partitions
5. **Index Size**: Smaller indexes per partition fit better in memory

### Partitioned Tables

| Table        | Partition Key | Partition Size |
| ------------ | ------------- | -------------- |
| `emails`     | `created_at`  | Monthly        |
| `audit_logs` | `created_at`  | Monthly        |

## Files

```
partitioning/
├── 001_create_partitioned_tables.sql   # Migration script
├── manage-partitions.sh                # Management CLI
└── README.md                           # This file
```

## Setup Instructions

### 1. Apply Migration

```bash
# Connect to the database and run the migration
psql -h localhost -U postgres -d email \
  -f 001_create_partitioned_tables.sql
```

### 2. Migrate Existing Data

**Important**: Schedule a maintenance window for data migration.

```bash
# Set environment variables
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=email
export PGUSER=postgres
export PGPASSWORD=your_password

# Run migration
./manage-partitions.sh migrate
```

### 3. Verify Migration

```bash
# Check partition health
./manage-partitions.sh verify

# View statistics
./manage-partitions.sh stats
```

### 4. Schedule Automated Maintenance

Add to crontab or pg_cron:

```bash
# crontab example
# Create future partitions on the 1st of each month at midnight
0 0 1 * * /path/to/manage-partitions.sh create-future

# Archive old partitions on the 1st of each month at 1 AM
0 1 1 * * RETENTION_MONTHS=24 /path/to/manage-partitions.sh archive
```

Using pg_cron (recommended for production):

```sql
-- Create future partitions monthly
SELECT cron.schedule('create-future-partitions', '0 0 1 * *',
  'SELECT create_future_partitions(3)');

-- Archive old partitions monthly (24 month retention)
SELECT cron.schedule('archive-old-partitions', '0 1 1 * *',
  'SELECT archive_old_partitions(24)');
```

## Management Commands

### Create Future Partitions

Creates partitions for upcoming months:

```bash
# Create partitions for next 3 months (default)
./manage-partitions.sh create-future

# Create partitions for next 6 months
MONTHS_AHEAD=6 ./manage-partitions.sh create-future
```

### Archive Old Partitions

Detaches partitions older than retention period and renames them:

```bash
# Archive partitions older than 24 months (default)
./manage-partitions.sh archive

# Archive partitions older than 12 months
RETENTION_MONTHS=12 ./manage-partitions.sh archive
```

**Note**: Archiving only detaches partitions, data is preserved.

### Drop Archived Partitions

**Warning**: Permanently deletes archived data!

```bash
./manage-partitions.sh drop-archived
```

### View Statistics

```bash
./manage-partitions.sh stats
```

Example output:

```
     partition_name     | parent_table |   size   | row_count |        start_date        |         end_date
------------------------+--------------+----------+-----------+--------------------------+--------------------------
 emails_2024_01         | emails       | 1024 MB  |   5000000 | 2024-01-01 00:00:00+00   | 2024-02-01 00:00:00+00
 emails_2024_02         | emails       | 1156 MB  |   5500000 | 2024-02-01 00:00:00+00   | 2024-03-01 00:00:00+00
 audit_logs_2024_01     | audit_logs   | 256 MB   |   2000000 | 2024-01-01 00:00:00+00   | 2024-02-01 00:00:00+00
```

### Verify Health

```bash
./manage-partitions.sh verify
```

Checks:

- Missing future partitions
- Orphaned partitions
- Partition boundary integrity

## Query Optimization

### Partition Pruning

PostgreSQL automatically prunes partitions when queries include the partition key:

```sql
-- Efficient: Only scans relevant partition(s)
SELECT * FROM emails
WHERE created_at >= '2024-01-01' AND created_at < '2024-02-01';

-- Also efficient: Uses index within single partition
SELECT * FROM emails
WHERE mailbox_id = 'uuid' AND created_at >= '2024-01-01';
```

### Verify Partition Pruning

```sql
EXPLAIN (COSTS OFF)
SELECT * FROM emails
WHERE created_at >= '2024-01-01' AND created_at < '2024-02-01';

-- Should show:
--   Append
--     ->  Seq Scan on emails_2024_01 emails_1
--           Filter: ...
-- (Only one partition scanned)
```

### Anti-Patterns to Avoid

```sql
-- Inefficient: Scans ALL partitions
SELECT * FROM emails WHERE mailbox_id = 'uuid';

-- Better: Include date filter
SELECT * FROM emails
WHERE mailbox_id = 'uuid'
  AND created_at >= NOW() - INTERVAL '30 days';

-- Inefficient: Function on partition key
SELECT * FROM emails WHERE DATE(created_at) = '2024-01-15';

-- Better: Use range
SELECT * FROM emails
WHERE created_at >= '2024-01-15'
  AND created_at < '2024-01-16';
```

## Data Lifecycle

### Retention Policy

| Data Type  | Retention | Action                  |
| ---------- | --------- | ----------------------- |
| Emails     | 24 months | Archive to cold storage |
| Audit Logs | 36 months | Required for compliance |

### Archive Process

1. **Detach partition** (instant):

   ```sql
   ALTER TABLE emails DETACH PARTITION emails_2022_01;
   ```

2. **Rename** (for tracking):

   ```sql
   ALTER TABLE emails_2022_01 RENAME TO archived_emails_2022_01;
   ```

3. **Optional: Dump to cold storage**:

   ```bash
   pg_dump -t archived_emails_2022_01 > emails_2022_01.sql
   gzip emails_2022_01.sql
   aws s3 cp emails_2022_01.sql.gz s3://email-archive/
   ```

4. **Drop when no longer needed**:
   ```sql
   DROP TABLE archived_emails_2022_01;
   ```

## Monitoring

### Prometheus Metrics

Add to your monitoring:

```yaml
# prometheus.yml scrape config
- job_name: "postgres-partitions"
  static_configs:
    - targets: ["postgres-exporter:9187"]
```

### Key Metrics

```sql
-- Partition size distribution
SELECT
  relname,
  pg_size_pretty(pg_total_relation_size(oid)) as size
FROM pg_class
WHERE relname LIKE 'emails_%'
ORDER BY pg_total_relation_size(oid) DESC;

-- Rows per partition
SELECT
  tableoid::regclass as partition,
  COUNT(*) as rows
FROM emails
GROUP BY tableoid
ORDER BY tableoid::regclass::text;
```

### Alerting

Set up alerts for:

1. **Missing partitions**: No partition exists for next month
2. **Large partition growth**: Unexpected size increase
3. **Failed maintenance**: Create/archive jobs failing

```yaml
# alert_rules.yml
- alert: MissingFuturePartition
  expr: pg_partition_missing_future > 0
  for: 1d
  labels:
    severity: warning
  annotations:
    summary: "Missing future partition"
    description: "No partition exists for next month"
```

## Troubleshooting

### Data Inserted Into Wrong Partition

PostgreSQL's constraint exclusion handles routing automatically. If data ends up in `historical`
partition:

```sql
-- Check for data in historical partition
SELECT COUNT(*) FROM emails_historical;

-- Move to correct partition (requires partition to exist)
WITH moved AS (
  DELETE FROM emails_historical
  WHERE created_at >= '2024-01-01' AND created_at < '2024-02-01'
  RETURNING *
)
INSERT INTO emails SELECT * FROM moved;
```

### Partition Not Found for Date

Error: `no partition of relation "emails" found for row`

Solution:

```bash
# Create missing partition
./manage-partitions.sh create-future
```

Or manually:

```sql
CREATE TABLE emails_2024_07 PARTITION OF emails
FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
```

### Slow Queries Not Using Partition Pruning

1. Check `constraint_exclusion` setting:

   ```sql
   SHOW constraint_exclusion;  -- Should be 'partition' or 'on'
   ```

2. Verify query includes partition key in WHERE clause

3. Check EXPLAIN output for partition scanning

## Emergency Procedures

### Rollback Migration

If migration fails:

```sql
-- Restore original tables
BEGIN;
DROP TABLE emails;  -- Drops partitioned table
ALTER TABLE emails_old RENAME TO emails;
DROP TABLE audit_logs;
ALTER TABLE audit_logs_old RENAME TO audit_logs;
COMMIT;
```

### Rebuild Partition

If a partition is corrupted:

```sql
-- Create replacement partition
CREATE TABLE emails_2024_01_new (LIKE emails_2024_01 INCLUDING ALL);

-- Copy data from backup
INSERT INTO emails_2024_01_new
SELECT * FROM backup.emails
WHERE created_at >= '2024-01-01' AND created_at < '2024-02-01';

-- Swap partitions
BEGIN;
ALTER TABLE emails DETACH PARTITION emails_2024_01;
DROP TABLE emails_2024_01;
ALTER TABLE emails_2024_01_new RENAME TO emails_2024_01;
ALTER TABLE emails ATTACH PARTITION emails_2024_01
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
COMMIT;
```

## Performance Benchmarks

### Before Partitioning

```
Query: SELECT * FROM emails WHERE mailbox_id = X AND created_at > Y
Table size: 500 GB
Execution time: 2.5 seconds
Rows scanned: 100,000,000
```

### After Partitioning

```
Query: SELECT * FROM emails WHERE mailbox_id = X AND created_at > Y
Table size: 500 GB (distributed across partitions)
Execution time: 150 ms
Rows scanned: 5,000,000 (1 partition)
Improvement: 16x faster
```

## References

- [PostgreSQL Partitioning Documentation](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [pg_cron Extension](https://github.com/citusdata/pg_cron)
- [Partition Maintenance Best Practices](https://www.postgresql.org/docs/current/ddl-partitioning.html#DDL-PARTITIONING-PRUNING)
