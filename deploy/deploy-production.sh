#!/usr/bin/env bash
# ============================================================
# 执行层：findjoy 生产环境部署脚本（幂等）
# 由 GitHub Actions 同步代码后在服务器上调用。
# 重复部署会复用已有端口 / systemd 单元 / nginx 配置。
# ============================================================
set -euo pipefail

APP_NAME="${APP_NAME:-findjoy}"
DEPLOY_USER="${DEPLOY_USER:-rocc}"
SERVER_PATH="${SERVER_PATH:-/home/${DEPLOY_USER}/apps/${APP_NAME}}"
SRC_DIR="${SRC_DIR:-${SERVER_PATH}/src}"
APP_PORT="${APP_PORT:-3030}"
PUBLIC_PORT="${PUBLIC_PORT:-3939}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${APP_PORT}/}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"

log() { echo "==> $*"; }
die() { echo "!! $*" >&2; exit 1; }

[ -d "$SRC_DIR" ] || die "源码目录不存在：$SRC_DIR（先运行 scripts/bootstrap-server.sh）"
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

log "4/5 创建/更新 nginx 反向代理（幂等）"
NGINX_CONF="/etc/nginx/conf.d/${APP_NAME}.conf"
if [ ! -f "$NGINX_CONF" ]; then
  NGINX_BODY=$(cat <<'NGEOF'
server {
    listen 3030_placeholder;
    server_name _;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:APP_PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 流式响应：关闭缓冲，避免聊天流卡住
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGEOF
)
  # 用 sed 注入实际端口（保留 nginx 变量原样）
  NGINX_BODY=$(printf '%s' "$NGINX_BODY" | sed -e "s/3030_placeholder/${PUBLIC_PORT}/" -e "s/APP_PORT_PLACEHOLDER/${APP_PORT}/")
  echo "$NGINX_BODY" | sudo tee "$NGINX_CONF" >/dev/null
  sudo nginx -t || die "nginx 配置校验失败"
  sudo systemctl reload nginx
  log "nginx 反向代理已创建（:${PUBLIC_PORT} -> 127.0.0.1:${APP_PORT}）"
else
  log "nginx 配置已存在，跳过"
fi

log "5/5 重启服务并健康检查"
sudo systemctl restart "${APP_NAME}"
healthy=0
for _ in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -sf --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then healthy=1; break; fi
  sleep 1
done
if [ "$healthy" != 1 ]; then
  echo "---- 最近 30 行服务日志 ----"
  sudo journalctl -u "${APP_NAME}" -n 30 --no-pager || true
  die "健康检查失败：$HEALTH_URL"
fi

PUBLIC_IP=$(curl -s --max-time 3 ifconfig.me 2>/dev/null || echo "<服务器公网IP>")
log "✅ ${APP_NAME} 部署完成"
log "   内网: ${HEALTH_URL}"
log "   对外: http://${PUBLIC_IP}:${PUBLIC_PORT}"
