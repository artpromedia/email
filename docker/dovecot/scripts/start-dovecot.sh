#!/bin/bash
# Dovecot startup script

set -e

# Set environment variables
export HOSTNAME=${MAIL_HOSTNAME:-mail.ceerion.com}
export DOMAIN=${MAIL_DOMAIN:-ceerion.com}

# Copy custom configuration
cp -r /etc/dovecot/config/* /etc/dovecot/

# Set permissions
chown -R dovecot:dovecot /var/lib/dovecot
chown -R vmail:vmail /var/mail || true
chmod 755 /var/lib/dovecot

# Create vmail user if not exists
if ! id vmail >/dev/null 2>&1; then
    useradd -r -u 5000 -g mail -d /var/mail -s /bin/false -c "Virtual Mail User" vmail
fi

# Start dovecot
exec dovecot -F
