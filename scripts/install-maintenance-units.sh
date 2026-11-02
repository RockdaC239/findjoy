#!/usr/bin/env bash
# 一次性安装备份与对账定时器；不修改应用版本或数据库。
set -euo pipefail

APP_NAME="${APP_NAME:-findjoy}"
DEPLOY_USER="${DEPLOY_USER:-rocc}"
SERVER_PATH="${SERVER_PATH:-/home/${DEPLOY_USER}/apps/${APP_NAME}}"
APP_PORT="${APP_PORT:-3001}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
NPM_BIN="${NPM_BIN:-$(command -v npm || true)}"
UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../deploy/systemd" && pwd)"

die() { echo "!! $*" >&2; exit 1; }
[ -n "$NODE_BIN" ] && [ -x "$NODE_BIN" ] || die "找不到 node，可通过 NODE_BIN 指定"
[ -n "$NPM_BIN" ] && [ -x "$NPM_BIN" ] || die "找不到 npm，可通过 NPM_BIN 指定"
[ -d "$SERVER_PATH/current" ] || die "缺少 $SERVER_PATH/current；先完成一次不可变发布"
[ -f "$SERVER_PATH/.env" ] || die "缺少环境文件 $SERVER_PATH/.env"

for key in FINDJOY_BACKUP_DIR FINDJOY_BACKUP_OFFSITE FINDJOY_ALERT_WEBHOOK FINDJOY_RECONCILE_TOKEN; do
  grep -Eq "^${key}=.+" "$SERVER_PATH/.env" || die "环境文件缺少 ${key}；先完成备份/异机/告警/对账配置"
done

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
for unit in findjoy-backup.service findjoy-backup.timer findjoy-reconcile.service findjoy-reconcile.timer; do
  sed \
    -e "s|__SERVER_PATH__|${SERVER_PATH}|g" \
    -e "s|__DEPLOY_USER__|${DEPLOY_USER}|g" \
    -e "s|__APP_PORT__|${APP_PORT}|g" \
    -e "s|__NODE_BIN__|${NODE_BIN}|g" \
    -e "s|__NPM_BIN__|${NPM_BIN}|g" \
    "$SOURCE_DIR/$unit" > "$work/$unit"
  sudo install -m 644 "$work/$unit" "$UNIT_DIR/$unit"
done
sudo systemctl daemon-reload
sudo systemctl enable --now findjoy-backup.timer findjoy-reconcile.timer
echo "已启用：findjoy-backup.timer（每日 03:30）、findjoy-reconcile.timer（每 5 分钟）"
sudo systemctl list-timers --all 'findjoy-*' --no-pager || true
