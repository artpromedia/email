#!/bin/bash
# Postfix startup script

set -e

# Set environment variables
export HOSTNAME=${MAIL_HOSTNAME:-mail.ceerion.com}
export DOMAIN=${MAIL_DOMAIN:-ceerion.com}

# Copy custom configuration
cp -r /etc/postfix/custom/* /etc/postfix/

# Configure hostname
echo "$HOSTNAME" > /etc/mailname
postconf -e "myhostname = $HOSTNAME"
postconf -e "mydomain = $DOMAIN"

# Set permissions
chown -R postfix:postfix /var/spool/postfix
chmod 755 /var/spool/postfix

# Generate alias database
newaliases

# Start rsyslog in background
rsyslogd

# Start postfix
exec postfix start-fg
