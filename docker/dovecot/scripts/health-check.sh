#!/bin/bash
# Health check script for Dovecot container

# Check if dovecot is running
if ! pgrep -x "dovecot" > /dev/null; then
    echo "Dovecot not running"
    exit 1
fi

# Check if dovecot can accept IMAP connections on port 143
if ! timeout 5 bash -c "</dev/tcp/localhost/143"; then
    echo "Dovecot not accepting IMAP connections on port 143"
    exit 1
fi

# Check if dovecot can accept IMAPS connections on port 993
if ! timeout 5 bash -c "</dev/tcp/localhost/993"; then
    echo "Dovecot not accepting IMAPS connections on port 993"
    exit 1
fi

echo "Dovecot container healthy"
exit 0
