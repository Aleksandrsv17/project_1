#!/bin/bash
# ============================================================
# VIP Mobility Platform — Auto Deploy Script
# Server: 109.120.133.113
# Usage: ./deploy.sh [--full | --restart | --logs]
# ============================================================

set -e

SERVER="root@109.120.133.113"
APP_DIR="/var/www/vip-mobility/backend"
ADMIN_DIR="/var/www/vip-mobility/admin"
LOCAL_BACKEND="$(dirname "$0")/backend"
LOCAL_ADMIN="$(dirname "$0")/admin"

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

  --admin)
    log "Deploying admin panel to $SERVER"

    log "[1/2] Building admin panel locally..."
    (cd "$LOCAL_ADMIN" && npm install && npm run build) || err "Admin build failed"

    log "[2/2] Uploading admin dist to server..."
    ssh_run "mkdir -p $ADMIN_DIR"
    rsync -avz --delete "$LOCAL_ADMIN/dist/" "$SERVER:$ADMIN_DIR/" || err "Admin upload failed"

    echo ""
    log "Admin deployed: https://109.120.133.113/admin/"
    ;;

  --full|*)
    log "Starting full deployment to $SERVER"

    # Step 1: Upload backend source
    log "[1/5] Uploading backend source..."
    rsync -avz --delete \
      --exclude node_modules \
      --exclude dist \
      --exclude .env \
      --exclude "*.log" \
      "$LOCAL_BACKEND/" "$SERVER:$APP_DIR/" \
      || err "Upload failed"

    # Step 2: Install dependencies + build
    log "[2/5] Installing dependencies and building..."
    ssh_run "
      cd $APP_DIR
      npm install
      npx tsc --skipLibCheck
    " || err "Build failed"

    # Step 3: Restart with PM2
    log "[3/5] Restarting application..."
    ssh_run "
      cd $APP_DIR
      pm2 restart ecosystem.config.js --env production || pm2 start ecosystem.config.js --env production
      pm2 save
    " || err "PM2 restart failed"

    # Step 4: Build + deploy admin panel
    log "[4/5] Building and deploying admin panel..."
    (cd "$LOCAL_ADMIN" && npm install && npm run build) || err "Admin build failed"
    ssh_run "mkdir -p $ADMIN_DIR"
    rsync -avz --delete "$LOCAL_ADMIN/dist/" "$SERVER:$ADMIN_DIR/" || err "Admin upload failed"

    # Step 5: Health check
    log "[5/5] Verifying deployment..."
    sleep 5
    HEALTH=$(ssh_run "curl -sf http://localhost:3000/health" 2>/dev/null) || err "Health check failed — check logs: ./deploy.sh --logs"

    echo ""
    log "Deployment SUCCESSFUL"
    log "Health: $HEALTH"
    log "API: https://109.120.133.113/v1/"
    log "Admin: https://109.120.133.113/admin/"
    log "Logs: ./deploy.sh --logs"
    ;;

esac
