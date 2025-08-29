FROM debian:bookworm-slim

# Set environment variables for non-interactive installation
ENV DEBIAN_FRONTEND=noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN=true

# Pre-configure postfix and opendmarc to avoid interactive prompts
RUN echo "postfix postfix/mailname string localhost" | debconf-set-selections && \
    echo "postfix postfix/main_mailer_type string 'Internet Site'" | debconf-set-selections && \
    echo "opendmarc opendmarc/dbconfig-install boolean false" | debconf-set-selections && \
    echo "opendmarc opendmarc/mysql/admin-pass password" | debconf-set-selections

# Install Postfix, OpenDKIM, OpenDMARC, and utilities
RUN apt-get update && apt-get install -y \
    postfix \
    postfix-pgsql \
    postfix-pcre \
    opendkim \
    opendkim-tools \
    opendmarc \
    rsyslog \
    supervisor \
    ca-certificates \
    openssl \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create directories
RUN mkdir -p /etc/postfix/custom \
    /etc/opendkim \
    /etc/opendmarc \
    /var/log/postfix \
    /var/log/opendkim \
    /var/log/opendmarc

# Copy configuration templates
COPY config/ /etc/postfix/custom/
COPY scripts/ /usr/local/bin/
COPY supervisord.conf /etc/supervisor/conf.d/

# Set permissions
RUN chmod +x /usr/local/bin/*.sh
RUN chown -R postfix:postfix /var/spool/postfix
RUN chown -R opendkim:opendkim /etc/opendkim
RUN chown -R opendmarc:opendmarc /etc/opendmarc

# Expose SMTP ports
EXPOSE 25 465 587

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /usr/local/bin/health-check.sh

# Start services via supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
