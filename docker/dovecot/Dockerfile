FROM debian:bookworm-slim

# Install Dovecot with JMAP support
RUN apt-get update && apt-get install -y \
    dovecot-core \
    dovecot-imapd \
    dovecot-lmtpd \
    dovecot-pgsql \
    dovecot-managesieved \
    dovecot-sieve \
    dovecot-antispam \
    redis-tools \
    postgresql-client \
    supervisor \
    curl \
    git \
    build-essential \
    autoconf \
    automake \
    libtool \
    pkg-config \
    libjansson-dev \
    libssl-dev \
    libsasl2-dev \
    && rm -rf /var/lib/apt/lists/*

# Build and install JMAP support (Cyrus JMAP)
RUN git clone https://github.com/cyrusimap/cyrus-jmap-api.git /tmp/jmap \
    && cd /tmp/jmap \
    && autoreconf -i \
    && ./configure --prefix=/usr/local \
    && make \
    && make install \
    && rm -rf /tmp/jmap

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

# Set permissions
RUN chmod +x /usr/local/bin/*.sh
RUN chown -R dovecot:dovecot /var/mail /var/lib/dovecot
RUN chown -R vmail:vmail /var/mail
RUN useradd -r -u 5000 -g mail -d /var/mail -s /bin/false vmail

# Expose ports
EXPOSE 143 993 24 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /usr/local/bin/health-check.sh

# Start services
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
