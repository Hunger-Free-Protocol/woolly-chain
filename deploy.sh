#!/bin/bash
# Woolly Chain - GCP VM Deployment Script
# Usage: ./deploy.sh [VM_IP] [SSH_KEY_PATH]
#
# Prerequisites:
#   - GCP VM (e2 or n2 instance) with Docker + Docker Compose installed
#   - SSH access configured
#   - Firewall rule allowing TCP:80 (and TCP:3000 for direct API access)

set -euo pipefail

VM_IP="${1:?Usage: ./deploy.sh <VM_IP> [SSH_KEY_PATH]}"
SSH_KEY="${2:-~/.ssh/google_compute_engine}"
SSH_USER="${SSH_USER:-$(whoami)}"
REMOTE_DIR="/opt/woolly-chain"

echo "=== Woolly Chain Deployment ==="
echo "Target: ${SSH_USER}@${VM_IP}"
echo "Remote dir: ${REMOTE_DIR}"
echo ""

# Step 1: Build locally
echo "[1/4] Building TypeScript..."
npm run build

# Step 2: Create deployment archive
echo "[2/4] Creating deployment archive..."
tar czf /tmp/woolly-chain.tar.gz \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=data \
  --exclude=.git \
  -C "$(dirname "$0")" .

# Step 3: Upload to VM
echo "[3/4] Uploading to VM..."
ssh -i "$SSH_KEY" "${SSH_USER}@${VM_IP}" "sudo mkdir -p ${REMOTE_DIR} && sudo chown ${SSH_USER}:${SSH_USER} ${REMOTE_DIR}"
scp -i "$SSH_KEY" /tmp/woolly-chain.tar.gz "${SSH_USER}@${VM_IP}:${REMOTE_DIR}/"
ssh -i "$SSH_KEY" "${SSH_USER}@${VM_IP}" "cd ${REMOTE_DIR} && tar xzf woolly-chain.tar.gz && rm woolly-chain.tar.gz"

# Step 4: Build and start on VM
echo "[4/4] Building and starting on VM..."
ssh -i "$SSH_KEY" "${SSH_USER}@${VM_IP}" "cd ${REMOTE_DIR} && docker compose up -d --build"

echo ""
echo "=== Deployment complete ==="
echo "Website:      http://${VM_IP} (point woolly.earth DNS here)"
echo "API endpoint: http://${VM_IP}/api/v1/chain/info"
echo "Health check: http://${VM_IP}/health"
echo ""
echo "Useful commands:"
echo "  Logs:    ssh -i ${SSH_KEY} ${SSH_USER}@${VM_IP} 'cd ${REMOTE_DIR} && docker compose logs -f'"
echo "  Stop:    ssh -i ${SSH_KEY} ${SSH_USER}@${VM_IP} 'cd ${REMOTE_DIR} && docker compose down'"
echo "  Restart: ssh -i ${SSH_KEY} ${SSH_USER}@${VM_IP} 'cd ${REMOTE_DIR} && docker compose restart'"

rm -f /tmp/woolly-chain.tar.gz
