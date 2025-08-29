FROM debian:bookworm-slim

# Install backup tools and encryption utilities
RUN apt-get update && apt-get install -y \
    postgresql-client-16 \
    awscli \
    gpg \
    gzip \
    tar \
    rsync \
    curl \
    jq \
    cron \
    supervisor \
    openssl \
    age \
    && rm -rf /var/lib/apt/lists/*

# Create backup user and directories
RUN useradd -r -u 6000 -d /backup -s /bin/bash backup
RUN mkdir -p /backup/{scripts,staging,logs,keys} \
    && chown -R backup:backup /backup

# Copy backup scripts and configuration
COPY scripts/ /backup/scripts/
COPY crontab /etc/cron.d/backup-cron
COPY supervisord.conf /etc/supervisor/conf.d/

# Set permissions
RUN chmod +x /backup/scripts/*.sh
RUN chmod 0644 /etc/cron.d/backup-cron
RUN crontab -u backup /etc/cron.d/backup-cron

# Install KMS client
COPY kms-client /usr/local/bin/
RUN chmod +x /usr/local/bin/kms-client

USER backup
WORKDIR /backup

# Health check
HEALTHCHECK --interval=60s --timeout=30s --start-period=120s --retries=3 \
    CMD /backup/scripts/health-check.sh

# Start supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
