#!/usr/bin/env bash
# ============================================================
# 执行层：findjoy 生产环境部署脚本（幂等、可回退）
# 由 GitHub Actions 同步到 releases/<commit>/ 后在服务器上调用。
# 旧布局（直接构建在 src/）仍可用，但没有不可变发布目录。
# ============================================================
set -euo pipefail

APP_NAME="${APP_NAME:-findjoy}"
DEPLOY_USER="${DEPLOY_USER:-rocc}"
SERVER_PATH="${SERVER_PATH:-/home/${DEPLOY_USER}/apps/${APP_NAME}}"
SRC_DIR="${SRC_DIR:-${SERVER_PATH}/src}"
RELEASES_DIR="${RELEASES_DIR:-${SERVER_PATH}/releases}"
CURRENT_DIR="${CURRENT_DIR:-${SERVER_PATH}/current}"
RELEASE_ID="${RELEASE_ID:-}"
KEEP_RELEASES="${KEEP_RELEASES:-3}"
NPM_BIN="${NPM_BIN:-npm}"
APP_PORT="${APP_PORT:-3001}"
PUBLIC_BASE="${PUBLIC_BASE:-/findjoy}"
SERVER_NAME="${SERVER_NAME:-findfire.club}"
LISTEN_PORT="${LISTEN_PORT:-80}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${APP_PORT}${PUBLIC_BASE}/api/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
CERT_DIR="${CERT_DIR:-${SERVER_PATH}/certs}"
SSL_LISTEN_PORT="${SSL_LISTEN_PORT:-443}"
SSL_CERT="${SSL_CERT:-${CERT_DIR}/${SERVER_NAME}.crt}"
SSL_KEY="${SSL_KEY:-${CERT_DIR}/${SERVER_NAME}.key}"
SERVER_ALIAS="${SERVER_ALIAS:-www.${SERVER_NAME}}"
UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
NGINX_CONF="${NGINX_CONF:-/etc/nginx/conf.d/${APP_NAME}.conf}"
ENV_FILE="${SERVER_PATH}/.env"
ENV_NEXT="${SERVER_PATH}/.env.next"
ENV_PREVIOUS="${SERVER_PATH}/.env.previous"

log() { echo "==> $*"; }
die() { echo "!! $*" >&2; exit 1; }

case "$KEEP_RELEASES" in (*[!0-9]*|'') die "KEEP_RELEASES 必须是正整数";; esac
[ "$KEEP_RELEASES" -ge 1 ] || die "KEEP_RELEASES 必须是正整数"

if [ -n "$RELEASE_ID" ]; then
  case "$RELEASE_ID" in (*[!A-Za-z0-9._-]*|'') die "RELEASE_ID 含非法字符";; esac
  RELEASE_DIR="${RELEASE_DIR:-${RELEASES_DIR}/${RELEASE_ID}}"
  IMMUTABLE=1
else
  RELEASE_DIR="${RELEASE_DIR:-${SRC_DIR}}"
  IMMUTABLE=0
fi
[ -d "$RELEASE_DIR" ] || die "发布目录不存在：${RELEASE_DIR}"
cd "$RELEASE_DIR"

PREVIOUS_TARGET=$(bash "$RELEASE_DIR/deploy/switch-release.sh" resolve "$SERVER_PATH" 2>/dev/null || true)
[ -n "$PREVIOUS_TARGET" ] || PREVIOUS_TARGET="$SRC_DIR"
if [ -d "$PREVIOUS_TARGET" ]; then
  log "当前版本：${PREVIOUS_TARGET}"
else
  log "当前版本：无（首次部署）"
  PREVIOUS_TARGET=""
fi

cleanup_failed_release() {
  rm -f "$ENV_NEXT"
  if [ "$IMMUTABLE" = 1 ] && [ "$RELEASE_DIR" != "$PREVIOUS_TARGET" ]; then
    rm -rf -- "$RELEASE_DIR"
  fi
}

log "1/7 写入待审核环境变量并安装依赖（旧版本继续运行）"
mkdir -p "$SERVER_PATH" "$SERVER_PATH/data" "$RELEASES_DIR"
chmod 700 "$SERVER_PATH"
if [ -f "/tmp/${APP_NAME}_app_env" ]; then
  umask 077
  install -m 600 "/tmp/${APP_NAME}_app_env" "$ENV_NEXT"
  rm -f "/tmp/${APP_NAME}_app_env"
  PREFLIGHT_ENV="$ENV_NEXT"
else
  log "未收到 APP_ENV，使用服务器现有 .env"
  PREFLIGHT_ENV="$ENV_FILE"
  [ -f "$PREFLIGHT_ENV" ] || die "没有可用的环境文件：${PREFLIGHT_ENV}"
fi

if [ "$IMMUTABLE" = 0 ] && [ -d .next ]; then cp -a .next .next.bak; fi
if ! "$NPM_BIN" ci --no-audit --no-fund; then
  [ "$IMMUTABLE" = 0 ] && [ -d .next.bak ] && { rm -rf .next; mv .next.bak .next; }
  cleanup_failed_release
  die "npm ci 失败"
fi

log "2/7 部署前预检（配置、迁移、权限、备份、磁盘）"
if ! SERVER_PATH="$SERVER_PATH" RELEASE_ID="$RELEASE_ID" \
  node scripts/preflight-deploy.mjs --env-file="$PREFLIGHT_ENV" --require-backup --require-offsite --require-alert; then
  cleanup_failed_release
  die "部署前预检失败，未构建、未切换、未重启服务"
fi

log "3/7 构建（旧版本继续运行）"
if ! "$NPM_BIN" run build; then
  [ "$IMMUTABLE" = 0 ] && [ -d .next.bak ] && { rm -rf .next; mv .next.bak .next; }
  cleanup_failed_release
  die "npm run build 失败"
fi
[ "$IMMUTABLE" = 0 ] && rm -rf .next.bak

log "4/7 创建/更新 systemd 服务（幂等）"
mkdir -p "$UNIT_DIR"
UNIT="${UNIT_DIR}/${APP_NAME}.service"
if [ "$IMMUTABLE" = 1 ] || [ -e "$CURRENT_DIR" ]; then UNIT_WORKDIR="$CURRENT_DIR"; else UNIT_WORKDIR="$RELEASE_DIR"; fi
UNIT_BODY=$(cat <<UNITEOF
[Unit]
Description=${APP_NAME} (Next.js)
After=network.target

[Service]
Type=simple
User=${DEPLOY_USER}
WorkingDirectory=${UNIT_WORKDIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/npm run start -- -H 127.0.0.1 -p ${APP_PORT}
Restart=on-failure
RestartSec=3
TimeoutStartSec=60

[Install]
WantedBy=multi-user.target
UNITEOF
)
if ! diff -q <(echo "$UNIT_BODY") <(sudo cat "$UNIT" 2>/dev/null) >/dev/null 2>&1; then
  echo "$UNIT_BODY" | sudo tee "$UNIT" >/dev/null
  sudo systemctl daemon-reload
  sudo systemctl enable "${APP_NAME}" >/dev/null
  log "systemd 单元已创建/更新"
else
  log "systemd 单元无变化，跳过"
fi

log "5/7 创建/更新 nginx 反向代理（幂等，内容变化才更新）"
if [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then TLS_ENABLED=1; else TLS_ENABLED=0; fi
NGINX_CANDIDATE=$(mktemp)
if ! bash "$RELEASE_DIR/deploy/render-nginx.sh" "$APP_PORT" "$SERVER_NAME" "$LISTEN_PORT" "$SSL_LISTEN_PORT" "$SSL_CERT" "$SSL_KEY" "$SERVER_ALIAS" > "$NGINX_CANDIDATE"; then
  rm -f "$NGINX_CANDIDATE"
  cleanup_failed_release
  die "nginx 配置生成失败"
fi
if ! bash "$RELEASE_DIR/deploy/apply-nginx.sh" "$NGINX_CANDIDATE" "$NGINX_CONF"; then
  rm -f "$NGINX_CANDIDATE"
  cleanup_failed_release
  die "nginx 配置应用失败，已尝试恢复原配置"
fi
rm -f "$NGINX_CANDIDATE"

log "6/7 切换环境变量与版本目录"
ENV_CHANGED=0
if [ "$PREFLIGHT_ENV" = "$ENV_NEXT" ]; then
  if [ -f "$ENV_FILE" ]; then cp -p "$ENV_FILE" "$ENV_PREVIOUS"; fi
  mv "$ENV_NEXT" "$ENV_FILE"
  ENV_CHANGED=1
fi
if [ "$IMMUTABLE" = 1 ]; then
  bash "$RELEASE_DIR/deploy/switch-release.sh" switch "$SERVER_PATH" "$RELEASE_DIR"
  log "current -> ${RELEASE_DIR}"
else
  log "旧布局：直接使用 ${RELEASE_DIR}"
fi
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$SERVER_PATH" 2>/dev/null || true

restart_and_check() {
  sudo systemctl restart "${APP_NAME}"
  local healthy=0
  for _ in $(seq 1 "$HEALTH_RETRIES"); do
    if curl -sf --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then healthy=1; break; fi
    sleep 1
  done
  [ "$healthy" = 1 ]
}

rollback() {
  log "健康检查失败，回滚到 ${PREVIOUS_TARGET:-无可用旧版本}"
  if [ -n "$PREVIOUS_TARGET" ] && [ -d "$PREVIOUS_TARGET" ]; then
    bash "$RELEASE_DIR/deploy/switch-release.sh" rollback "$SERVER_PATH" "$PREVIOUS_TARGET"
    if [ "$ENV_CHANGED" = 1 ] && [ -f "$ENV_PREVIOUS" ]; then cp -p "$ENV_PREVIOUS" "$ENV_FILE"; fi
    if restart_and_check; then
      log "已回滚到旧版本；新版本保留在 ${RELEASE_DIR} 供排查"
    else
      echo "!! 回滚后仍未通过健康检查，需要人工处理；未删除任何版本或数据" >&2
    fi
  else
    sudo systemctl stop "${APP_NAME}" || true
    echo "!! 首次部署失败且没有旧版本，已停止服务；未删除数据" >&2
  fi
}

log "7/7 重启服务并健康检查"
if ! restart_and_check; then
  echo "---- 最近 30 行服务日志 ----"
  sudo journalctl -u "${APP_NAME}" -n 30 --no-pager || true
  rollback
  die "健康检查失败：$HEALTH_URL"
fi

log "清理旧发布目录（保留最近 ${KEEP_RELEASES} 个）"
if [ "$IMMUTABLE" = 1 ]; then
  bash "$RELEASE_DIR/deploy/switch-release.sh" prune "$SERVER_PATH" "$KEEP_RELEASES" || log "旧版本清理失败，不影响本次发布"
fi

log "✅ ${APP_NAME} 部署完成"
log "   版本: ${RELEASE_ID:-legacy} (${RELEASE_DIR})"
log "   内网: ${HEALTH_URL}"
if [ "$TLS_ENABLED" = 1 ]; then
  log "   对外: https://${SERVER_NAME}${PUBLIC_BASE}（HTTP 已 301 跳转 HTTPS）"
else
  log "   对外: http://${SERVER_NAME}${PUBLIC_BASE}"
fi
log "   注意: ${SERVER_NAME}${PUBLIC_BASE}/ 会 308 到无尾斜杠版本（浏览器自动跟随）"
