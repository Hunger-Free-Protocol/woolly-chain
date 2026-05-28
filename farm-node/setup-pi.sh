#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Woolly Farm Node — Raspberry Pi Setup Script
#
# Run this on a fresh Raspberry Pi OS (64-bit) to set up
# the farm node prototype.
#
# Usage:
#   curl -sSL https://woolly.earth/setup-pi.sh | bash
#   — or —
#   chmod +x setup-pi.sh && ./setup-pi.sh
# ─────────────────────────────────────────────────────────────

set -euo pipefail

echo ""
echo "  🌱 Woolly Farm Node — Pi Setup"
echo "  ════════════════════════════════"
echo ""

# ── 1. System updates ────────────────────────────────────────
echo "[1/5] Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq

# ── 2. Install Node.js 20 ────────────────────────────────────
echo "[2/5] Installing Node.js 20..."
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "  Node: $(node -v)  npm: $(npm -v)"

# ── 3. Install serial port dependencies ──────────────────────
echo "[3/5] Installing serial port dependencies..."
sudo apt-get install -y -qq build-essential python3 libudev-dev

# Add user to dialout group for serial access
sudo usermod -a -G dialout $USER

# ── 4. Clone and install farm node ───────────────────────────
echo "[4/5] Setting up farm node..."
WOOLLY_DIR="$HOME/woolly-farm-node"

if [ -d "$WOOLLY_DIR" ]; then
  echo "  Directory exists — updating..."
  cd "$WOOLLY_DIR"
else
  mkdir -p "$WOOLLY_DIR"
  cd "$WOOLLY_DIR"
fi

# Copy source files (assumes they're in the current directory or will be copied)
npm install
npm run build

# Create data directory
mkdir -p data

# ── 5. Create systemd service ────────────────────────────────
echo "[5/5] Creating systemd service..."
sudo tee /etc/systemd/system/woolly-node.service > /dev/null << EOF
[Unit]
Description=Woolly Farm Node
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$WOOLLY_DIR
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=WOOLLY_CHAIN_URL=http://YOUR_VM_IP:3000
Environment=WOOLLY_FARM_ID=FARM-PROTO-001
Environment=WOOLLY_SERIAL_PORT=/dev/ttyUSB0
Environment=WOOLLY_LAT=12.9716
Environment=WOOLLY_LNG=77.5946

[Install]
WantedBy=multi-user.target
EOF

echo ""
echo "  ════════════════════════════════════════"
echo "  ✓ Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Edit the service config with your settings:"
echo "     sudo nano /etc/systemd/system/woolly-node.service"
echo "     → Set WOOLLY_CHAIN_URL to your GCP VM IP"
echo "     → Set WOOLLY_FARM_ID to your farm ID"
echo "     → Set WOOLLY_LAT / WOOLLY_LNG to your coordinates"
echo "     → Set WOOLLY_SERIAL_PORT to your uFarms USB port"
echo ""
echo "  2. Test manually first:"
echo "     cd $WOOLLY_DIR"
echo "     WOOLLY_SIMULATE=true npm run dev"
echo ""
echo "  3. Start the service:"
echo "     sudo systemctl daemon-reload"
echo "     sudo systemctl enable woolly-node"
echo "     sudo systemctl start woolly-node"
echo ""
echo "  4. Check logs:"
echo "     journalctl -u woolly-node -f"
echo ""
echo "  Reboot to apply serial group changes:"
echo "     sudo reboot"
echo ""
