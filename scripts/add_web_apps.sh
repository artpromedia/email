#!/bin/bash
# Add web and admin apps to docker-compose.yml

COMPOSE_FILE="/opt/oonrumail/app/docker-compose.yml"

# Check if web already exists
if grep -q "oonrumail-web" "$COMPOSE_FILE"; then
    echo "Web app already configured"
else
    # Add web app after caddy
    sed -i '/container_name: oonrumail-caddy/,/ACME_AGREE/a\
\
  # Web Application (Next.js)\
  web:\
    build:\
      context: ./apps/web\
      dockerfile: Dockerfile\
    container_name: oonrumail-web\
    restart: unless-stopped\
    environment:\
      NODE_ENV: production\
      NEXT_PUBLIC_API_URL: https://api.oonrumail.com\
      NEXT_PUBLIC_AUTH_URL: https://api.oonrumail.com/auth\
      NEXT_PUBLIC_WS_URL: wss://api.oonrumail.com/chat\
    networks:\
      - email-network\
    depends_on:\
      - auth\
      - storage\
' "$COMPOSE_FILE"
    echo "Web app added"
fi

# Check if admin already exists
if grep -q "oonrumail-admin" "$COMPOSE_FILE"; then
    echo "Admin app already configured"
else
    # Add admin app after web
    sed -i '/container_name: oonrumail-web/,/- storage/a\
\
  # Admin Panel (Next.js)\
  admin:\
    build:\
      context: ./apps/admin\
      dockerfile: Dockerfile\
    container_name: oonrumail-admin\
    restart: unless-stopped\
    environment:\
      NODE_ENV: production\
      NEXT_PUBLIC_API_URL: https://api.oonrumail.com\
      NEXT_PUBLIC_AUTH_URL: https://api.oonrumail.com/auth\
    networks:\
      - email-network\
    depends_on:\
      - auth\
      - domain-manager\
' "$COMPOSE_FILE"
    echo "Admin app added"
fi

echo "Done!"
