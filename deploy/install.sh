#!/usr/bin/env bash
# SAMIZDAT deployment installer
# Run as root on a Debian/Ubuntu server with nginx and Tor already installed.
# Usage: sudo bash deploy/install.sh
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/samizdat}"
SAMIZDAT_USER="${SAMIZDAT_USER:-samizdat}"

echo "==> SAMIZDAT installer"
echo "    Install dir : $INSTALL_DIR"
echo "    Service user: $SAMIZDAT_USER"
echo ""

# ── Create service user ───────────────────────────────────────────────────────
if ! id "$SAMIZDAT_USER" &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SAMIZDAT_USER"
  echo "[ok] Created system user: $SAMIZDAT_USER"
fi

# ── Install Node.js dependencies and build ────────────────────────────────────
cd "$INSTALL_DIR"
npm ci --omit=dev
npm run build
npm run editor:build
echo "[ok] Build complete"

# ── Install systemd units ─────────────────────────────────────────────────────
cp "$INSTALL_DIR/deploy/samizdat-renderer.service" /etc/systemd/system/
cp "$INSTALL_DIR/deploy/samizdat-indexer.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable samizdat-renderer samizdat-indexer
systemctl start samizdat-renderer samizdat-indexer
echo "[ok] systemd services installed and started"

# ── nginx config ──────────────────────────────────────────────────────────────
if [ ! -f /etc/nginx/sites-available/samizdat ]; then
  cp "$INSTALL_DIR/deploy/nginx-samizdat.conf" /etc/nginx/sites-available/samizdat
  ln -sf /etc/nginx/sites-available/samizdat /etc/nginx/sites-enabled/samizdat
  echo ""
  echo "[!] nginx config installed at /etc/nginx/sites-available/samizdat"
  echo "    Edit it to replace EDITOR_ONION / RENDERER_ONION / INDEXER_ONION"
  echo "    with your actual .onion addresses, then run:"
  echo "      nginx -t && systemctl reload nginx"
else
  echo "[skip] /etc/nginx/sites-available/samizdat already exists — not overwriting"
fi

# ── Tor hidden services ───────────────────────────────────────────────────────
echo ""
echo "[!] Add hidden services to /etc/tor/torrc, then reload Tor:"
echo ""
echo "    HiddenServiceDir /var/lib/tor/samizdat-editor/"
echo "    HiddenServicePort 80 127.0.0.1:4000"
echo ""
echo "    HiddenServiceDir /var/lib/tor/samizdat-renderer/"
echo "    HiddenServicePort 80 127.0.0.1:4001"
echo ""
echo "    HiddenServiceDir /var/lib/tor/samizdat-indexer/"
echo "    HiddenServicePort 80 127.0.0.1:4002"
echo ""
echo "    systemctl reload tor"
echo "    cat /var/lib/tor/samizdat-editor/hostname    # your editor .onion"
echo "    cat /var/lib/tor/samizdat-renderer/hostname  # your renderer .onion"
echo ""
echo "==> SAMIZDAT installed. Services running:"
systemctl is-active samizdat-renderer samizdat-indexer || true
