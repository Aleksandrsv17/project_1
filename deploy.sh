#!/bin/bash
# ============================================================
# VIP Mobility Platform — Auto Deploy Script
# Server: 109.120.133.113
# Usage: ./deploy.sh [--full | --restart | --logs]
# ============================================================

set -e

SERVER="root@109.120.133.113"
APP_DIR="/var/www/vip-mobility/backend"
LOCAL_BACKEND="$(dirname "$0")/backend"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

usage() {
  echo "Usage: $0 [--full | --restart | --logs | --status]"
  echo ""
  echo "  --full     Full deploy: upload code + build + restart (default)"
  echo "  --restart  Restart PM2 process only (no upload)"
  echo "  --logs     Stream live logs from server"
  echo "  --status   Show PM2 + service status"
  echo ""
}

ssh_run() {
  ssh -o StrictHostKeyChecking=no "$SERVER" "$1"
}

MODE="${1:---full}"

case "$MODE" in

  --logs)
    log "Streaming live logs from $SERVER..."
    ssh -o StrictHostKeyChecking=no "$SERVER" "pm2 logs vip-mobility --lines 50"
    ;;

  --status)
    log "Server status:"
    ssh_run "pm2 status && echo '' && systemctl is-active postgresql && systemctl is-active redis-server && systemctl is-active nginx && curl -sf http://localhost:3000/health && echo ''"
    ;;

  --restart)
    log "Restarting PM2 process..."
    ssh_run "pm2 restart /var/www/vip-mobility/backend/ecosystem.config.js --env production && pm2 save"
    sleep 4
    log "Health check:"
    ssh_run "curl -sf http://localhost:3000/health && echo ''"
    ;;

  --full|*)
    log "Starting full deployment to $SERVER"

    # Step 1: Upload backend source
    log "[1/4] Uploading backend source..."
    rsync -avz --delete \
      --exclude node_modules \
      --exclude dist \
      --exclude .env \
      --exclude "*.log" \
      "$LOCAL_BACKEND/" "$SERVER:$APP_DIR/" \
      || err "Upload failed"

    # Step 2: Install dependencies + build
    log "[2/4] Installing dependencies and building..."
    ssh_run "
      cd $APP_DIR
      npm install
      npx tsc --skipLibCheck
    " || err "Build failed"

    # Step 3: Restart with PM2
    log "[3/4] Restarting application..."
    ssh_run "
      cd $APP_DIR
      pm2 restart ecosystem.config.js --env production || pm2 start ecosystem.config.js --env production
      pm2 save
    " || err "PM2 restart failed"

    # Step 4: Health check
    log "[4/4] Verifying deployment..."
    sleep 5
    HEALTH=$(ssh_run "curl -sf http://localhost:3000/health" 2>/dev/null) || err "Health check failed — check logs: ./deploy.sh --logs"

    echo ""
    log "Deployment SUCCESSFUL"
    log "Health: $HEALTH"
    log "API: http://109.120.133.113/v1/"
    log "Logs: ./deploy.sh --logs"
    ;;

esac
