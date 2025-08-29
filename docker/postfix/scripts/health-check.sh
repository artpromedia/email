#!/bin/bash
# Health check script for Postfix container

# Check if postfix is running
if ! pgrep -x "master" > /dev/null; then
    echo "Postfix master process not running"
    exit 1
fi

# Check if postfix can accept connections on port 25
if ! timeout 5 bash -c "</dev/tcp/localhost/25"; then
    echo "Postfix not accepting connections on port 25"
    exit 1
fi

# Check if rsyslog is running
if ! pgrep -x "rsyslogd" > /dev/null; then
    echo "Rsyslog not running"
    exit 1
fi

echo "Postfix container healthy"
exit 0
