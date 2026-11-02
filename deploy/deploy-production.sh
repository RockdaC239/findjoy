#!/usr/bin/env bash
# ============================================================
# 执行层：findjoy 生产环境部署脚本（幂等）
# 由 GitHub Actions 同步代码后在服务器上调用。
# 重复部署会复用已有 systemd 单元 / nginx 配置。
# 对外访问：findfire.club/findjoy（Next.js basePath 处理前缀）
# ============================================================
set -euo pipefail

APP_NAME="${APP_NAME:-findjoy}"
DEPLOY_USER="${DEPLOY_USER:-rocc}"
SERVER_PATH="${SERVER_PATH:-/home/${DEPLOY_USER}/apps/${APP_NAME}}"
SRC_DIR="${SRC_DIR:-${SERVER_PATH}/src}"
APP_PORT="${APP_PORT:-3001}"
PUBLIC_BASE="${PUBLIC_BASE:-/findjoy}"
SERVER_NAME="${SERVER_NAME:-findfire.club}"
LISTEN_PORT="${LISTEN_PORT:-80}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${APP_PORT}${PUBLIC_BASE}/api/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
# HTTPS：证书存在即自动启用 443 并强制跳转，不存在则保持纯 HTTP
# 证书默认放 SERVER_PATH/certs（部署不会覆盖，私钥可保持 600），也可用 SSL_CERT/SSL_KEY 覆盖
CERT_DIR="${CERT_DIR:-${SERVER_PATH}/certs}"
SSL_LISTEN_PORT="${SSL_LISTEN_PORT:-443}"
SSL_CERT="${SSL_CERT:-${CERT_DIR}/${SERVER_NAME}.crt}"
SSL_KEY="${SSL_KEY:-${CERT_DIR}/${SERVER_NAME}.key}"
# 唯一入口是主域名 SERVER_NAME；SERVER_ALIAS（默认 www）只在 HTTP 上 301 跳到主域名
SERVER_ALIAS="${SERVER_ALIAS:-www.${SERVER_NAME}}"

log() { echo "==> $*"; }
die() { echo "!! $*" >&2; exit 1; }

[ -d "$SRC_DIR" ] || die "源码目录不存在：${SRC_DIR}（先运行 scripts/bootstrap-server.sh）"
cd "$SRC_DIR"

log "1/5 安装依赖并构建（失败自动回滚 .next）"
if [ -d .next ]; then cp -a .next .next.bak; fi
if ! npm ci --no-audit --no-fund; then
  rm -rf node_modules
  [ -d .next.bak ] && rm -rf .next && mv .next.bak .next
  die "npm ci 失败"
fi
if ! npm run build; then
  [ -d .next.bak ] && rm -rf .next && mv .next.bak .next
  die "npm run build 失败"
fi
rm -rf .next.bak

log "2/5 写入环境变量文件"
mkdir -p "$SERVER_PATH" "$SERVER_PATH/data"
chmod 700 "$SERVER_PATH"
if [ -f "/tmp/${APP_NAME}_app_env" ]; then
  umask 077
  cat "/tmp/${APP_NAME}_app_env" > "$SERVER_PATH/.env"
  rm -f "/tmp/${APP_NAME}_app_env"
  log ".env 已更新"
else
  log "未收到 APP_ENV，跳过 .env 更新（保持服务器上的旧配置）"
fi
[ -f "$SERVER_PATH/.env" ] || { echo "# 空环境文件" > "$SERVER_PATH/.env"; }
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$SERVER_PATH" 2>/dev/null || true

log "3/5 创建/更新 systemd 服务（幂等）"
UNIT="/etc/systemd/system/${APP_NAME}.service"
UNIT_BODY=$(cat <<EOF
[Unit]
Description=${APP_NAME} (Next.js)
After=network.target

[Service]
Type=simple
User=${DEPLOY_USER}
WorkingDirectory=${SRC_DIR}
EnvironmentFile=${SERVER_PATH}/.env
ExecStart=/usr/bin/npm run start -- -H 127.0.0.1 -p ${APP_PORT}
Restart=on-failure
RestartSec=3
TimeoutStartSec=60

[Install]
WantedBy=multi-user.target
EOF
)
if ! diff -q <(echo "$UNIT_BODY") <(sudo cat "$UNIT" 2>/dev/null) >/dev/null 2>&1; then
  echo "$UNIT_BODY" | sudo tee "$UNIT" >/dev/null
  sudo systemctl daemon-reload
  sudo systemctl enable "${APP_NAME}" >/dev/null
  log "systemd 单元已创建/更新"
else
  log "systemd 单元无变化，跳过"
fi

log "4/5 创建/更新 nginx 反向代理（幂等，内容变化才更新）"
NGINX_CONF="/etc/nginx/conf.d/${APP_NAME}.conf"

# 转发 location 在 HTTP / HTTPS 两个 server 块中复用，避免重复维护。
# location 用无尾斜杠前缀 /findjoy（Next basePath 下 /findjoy 直接 200；/findjoy/ 会 308 一次到 /findjoy）
if [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then TLS_ENABLED=1; else TLS_ENABLED=0; fi
NGINX_CANDIDATE=$(mktemp)
if ! bash "$SRC_DIR/deploy/render-nginx.sh" "$APP_PORT" "$SERVER_NAME" "$LISTEN_PORT" "$SSL_LISTEN_PORT" "$SSL_CERT" "$SSL_KEY" "$SERVER_ALIAS" > "$NGINX_CANDIDATE"; then
  rm -f "$NGINX_CANDIDATE"
  die "nginx 配置生成失败"
fi
if ! bash "$SRC_DIR/deploy/apply-nginx.sh" "$NGINX_CANDIDATE" "$NGINX_CONF"; then
  rm -f "$NGINX_CANDIDATE"
  die "nginx 配置应用失败，已尝试恢复原配置"
fi
rm -f "$NGINX_CANDIDATE"

log "5/5 重启服务并健康检查"
sudo systemctl restart "${APP_NAME}"
healthy=0
for _ in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -sf --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then healthy=1; break; fi
  sleep 1
done
if [ "$healthy" != 1 ]; then
  echo "---- 最近 30 行服务日志 ----"
  sudo journalctl -u "${APP_NAME}" -n 30 --no-pager || true
  die "健康检查失败：$HEALTH_URL"
fi

log "✅ ${APP_NAME} 部署完成"
log "   内网: ${HEALTH_URL}"
if [ "$TLS_ENABLED" = 1 ]; then
  log "   对外: https://${SERVER_NAME}${PUBLIC_BASE}（HTTP 已 301 跳转 HTTPS）"
else
  log "   对外: http://${SERVER_NAME}${PUBLIC_BASE}"
fi
log "   注意: ${SERVER_NAME}${PUBLIC_BASE}/ 会 308 到无尾斜杠版本（浏览器自动跟随）"
