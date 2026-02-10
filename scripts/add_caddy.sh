#!/bin/bash
# Add Caddy reverse proxy to docker-compose.yml

COMPOSE_FILE="/opt/oonrumail/app/docker-compose.yml"

# Check if caddy already exists
if grep -q "oonrumail-caddy" "$COMPOSE_FILE"; then
    echo "Caddy already configured"
    exit 0
fi

# Add Caddy service after 'services:' line
sed -i '/^services:/a\
\
  # Reverse Proxy with automatic HTTPS\
  caddy:\
    image: caddy:2-alpine\
    container_name: oonrumail-caddy\
    restart: unless-stopped\
    ports:\
      - "80:80"\
      - "443:443"\
      - "443:443/udp"\
    volumes:\
      - ./docker/config/caddy/Caddyfile:/etc/caddy/Caddyfile:ro\
      - caddy_data:/data\
      - caddy_config:/config\
    networks:\
      - email-network\
    environment:\
      ACME_AGREE: "true"\
' "$COMPOSE_FILE"

# Add volumes before 'networks:' section
sed -i '/^networks:/i\
  caddy_data:\
    driver: local\
  caddy_config:\
    driver: local\
' "$COMPOSE_FILE"

echo "Caddy added to docker-compose.yml"
