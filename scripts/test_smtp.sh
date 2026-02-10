#!/bin/sh
apk add --no-cache netcat-openbsd >/dev/null 2>&1
echo "EHLO test
MAIL FROM:<test@oonrumail.com>
RCPT TO:<dest@example.com>
DATA
Subject: Test

Hello World
.
QUIT" | nc -w5 smtp-server 25
