FROM debian:bookworm-slim

# Set environment variables for non-interactive installation
ENV DEBIAN_FRONTEND=noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN=true

# Install Dovecot with essential packages
RUN apt-get update && apt-get install -y \
    dovecot-core \
    dovecot-imapd \
    dovecot-lmtpd \
    dovecot-pgsql \
    dovecot-managesieved \
    dovecot-sieve \
    redis-tools \
    postgresql-client \
    supervisor \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create directories
RUN mkdir -p /etc/dovecot/custom \
    /var/mail \
    /var/lib/dovecot/index \
    /var/log/dovecot \
    /run/dovecot

# Copy configuration
COPY config/ /etc/dovecot/custom/
COPY scripts/ /usr/local/bin/
COPY supervisord.conf /etc/supervisor/conf.d/

# Create vmail user and group, set permissions
RUN groupadd -r -g 5000 vmail && useradd -r -u 5000 -g vmail -d /var/mail -s /bin/false vmail
RUN chmod +x /usr/local/bin/*.sh
RUN chown -R dovecot:dovecot /var/lib/dovecot
RUN chown -R vmail:vmail /var/mail

# Expose ports
EXPOSE 143 993 24 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /usr/local/bin/health-check.sh

# Start services
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
