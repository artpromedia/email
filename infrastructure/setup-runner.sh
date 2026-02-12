#!/usr/bin/env bash
# =============================================================================
# GitHub Actions Self-Hosted Runner Setup for Oonrumail
# =============================================================================
# Run this script on the Hetzner production server to install and configure
# a GitHub Actions self-hosted runner as a systemd service.
#
# Prerequisites:
#   - Ubuntu 20.04+ / Debian 11+ on the Hetzner server
#   - Docker and Docker Compose already installed
#   - A GitHub Personal Access Token (PAT) with 'repo' scope, OR
#     a runner registration token from the repo settings
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/artpromedia/email/main/infrastructure/setup-runner.sh | bash
#   # OR
#   chmod +x setup-runner.sh && ./setup-runner.sh
#
# After running, the runner will appear in:
#   GitHub repo → Settings → Actions → Runners
# =============================================================================

set -euo pipefail

# --- Configuration ---
RUNNER_USER="runner"
RUNNER_HOME="/opt/actions-runner"
RUNNER_VERSION="2.331.0"  # Check https://github.com/actions/runner/releases for latest
RUNNER_LABELS="self-hosted,production,Linux,X64"
REPO_URL="https://github.com/artpromedia/email"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN} Oonrumail - Self-Hosted Runner Setup${NC}"
echo -e "${GREEN}=========================================${NC}"

# --- Must run as root ---
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: Please run as root (sudo)${NC}"
  exit 1
fi

# --- Get registration token ---
echo ""
echo -e "${YELLOW}You need a runner registration token.${NC}"
echo "Get it from: ${REPO_URL}/settings/actions/runners/new"
echo ""
read -rp "Enter registration token: " RUNNER_TOKEN

if [ -z "$RUNNER_TOKEN" ]; then
  echo -e "${RED}Error: Registration token is required${NC}"
  exit 1
fi

# --- Create runner user (if not exists) ---
echo ""
echo "[1/6] Creating runner user..."
if ! id "$RUNNER_USER" &>/dev/null; then
  useradd -m -d "$RUNNER_HOME" -s /bin/bash "$RUNNER_USER"
  echo -e "  ${GREEN}Created user: ${RUNNER_USER}${NC}"
else
  echo "  User ${RUNNER_USER} already exists"
fi

# Add runner user to docker group so it can run docker commands
usermod -aG docker "$RUNNER_USER"
echo "  Added ${RUNNER_USER} to docker group"

# --- Install dependencies ---
echo ""
echo "[2/6] Installing dependencies..."
apt-get update -qq
apt-get install -y -qq curl jq tar gzip > /dev/null
echo -e "  ${GREEN}Dependencies installed${NC}"

# --- Download and extract runner ---
echo ""
echo "[3/6] Downloading GitHub Actions Runner v${RUNNER_VERSION}..."
mkdir -p "$RUNNER_HOME"

RUNNER_ARCH="x64"
RUNNER_TAR="actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_TAR}"

cd "$RUNNER_HOME"

if [ ! -f ".runner" ]; then
  curl -sL "$RUNNER_URL" -o "$RUNNER_TAR"
  tar xzf "$RUNNER_TAR"
  rm -f "$RUNNER_TAR"
  echo -e "  ${GREEN}Runner extracted to ${RUNNER_HOME}${NC}"
else
  echo "  Runner already configured, skipping download"
fi

chown -R "$RUNNER_USER":"$RUNNER_USER" "$RUNNER_HOME"

# --- Configure runner ---
echo ""
echo "[4/6] Configuring runner..."
sudo -u "$RUNNER_USER" ./config.sh \
  --url "$REPO_URL" \
  --token "$RUNNER_TOKEN" \
  --name "oonrumail-production" \
  --labels "$RUNNER_LABELS" \
  --work "_work" \
  --runasservice \
  --replace \
  --unattended

echo -e "  ${GREEN}Runner configured${NC}"

# --- Install and start as systemd service ---
echo ""
echo "[5/6] Installing systemd service..."
./svc.sh install "$RUNNER_USER"
./svc.sh start

echo -e "  ${GREEN}Runner service started${NC}"

# --- Verify ---
echo ""
echo "[6/6] Verifying..."
sleep 2

if ./svc.sh status | grep -q "active (running)"; then
  echo -e "  ${GREEN}✅ Runner is active and running${NC}"
else
  echo -e "  ${YELLOW}⚠️  Runner may still be starting. Check with:${NC}"
  echo "     sudo ${RUNNER_HOME}/svc.sh status"
fi

# --- Create app directory if it doesn't exist ---
APP_DIR="/opt/oonrumail/app"
BACKUP_DIR="/opt/oonrumail/backups/deploys"
mkdir -p "$APP_DIR" "$BACKUP_DIR"
chown -R "$RUNNER_USER":"$RUNNER_USER" /opt/oonrumail
echo "  Created ${APP_DIR} and ${BACKUP_DIR}"

# --- Summary ---
echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN} Setup Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Runner details:"
echo "  Name:     oonrumail-production"
echo "  Labels:   ${RUNNER_LABELS}"
echo "  Home:     ${RUNNER_HOME}"
echo "  App dir:  ${APP_DIR}"
echo "  User:     ${RUNNER_USER}"
echo ""
echo "Useful commands:"
echo "  Status:   sudo ${RUNNER_HOME}/svc.sh status"
echo "  Restart:  sudo ${RUNNER_HOME}/svc.sh stop && sudo ${RUNNER_HOME}/svc.sh start"
echo "  Logs:     journalctl -u actions.runner.artpromedia-email.oonrumail-production -f"
echo ""
echo "The runner should now appear at:"
echo "  ${REPO_URL}/settings/actions/runners"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Verify the runner shows as 'Online' in GitHub Settings"
echo "  2. Push to main branch to trigger the CI/CD pipeline"
echo "  3. Or manually trigger the Deploy workflow from the Actions tab"
