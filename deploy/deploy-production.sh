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
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${APP_PORT}${PUBLIC_BASE}}"
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
LOCATIONS=$(cat <<'NGEOF'
    location /findjoy {
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

    # 根路径：findfire 主产品暂未部署，先给占位响应
    location / {
        return 200 'findfire.club - 主产品部署中';
        add_header Content-Type text/plain;
    }

    # 预留：acme.sh / certbot 续签用的 HTTP 校验路径
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
NGEOF
)

if [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then
  TLS_ENABLED=1
  log "检测到证书 ${SSL_CERT}，本次将启用 HTTPS 并统一跳转到 https://${SERVER_NAME}"
  HTTP_SERVER=$(cat <<'NGEOF'
server {
    listen HTTP_LISTEN_PLACEHOLDER;
    server_name SERVER_NAME_PLACEHOLDER SERVER_ALIAS_PLACEHOLDER;

    # 证书就绪后 HTTP 全站 301 到 HTTPS，并统一到唯一入口主域名，
    # 这样 www / IP / 其它 Host 都不会因为证书域名不匹配而报警告。
    # 保留 acme 校验路径，方便以后换 acme.sh 自动续签。
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    location / {
        return 301 https://SERVER_NAME_PLACEHOLDER$request_uri;
    }
}
NGEOF
)
  HTTPS_SERVER=$(cat <<'NGEOF'
server {
    listen HTTPS_LISTEN_PLACEHOLDER ssl;
    server_name SERVER_NAME_PLACEHOLDER;

    ssl_certificate SSL_CERT_PLACEHOLDER;
    ssl_certificate_key SSL_KEY_PLACEHOLDER;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    client_max_body_size 10m;

LOCATIONS_PLACEHOLDER
}
NGEOF
)
  HTTPS_SERVER="${HTTPS_SERVER/LOCATIONS_PLACEHOLDER/$LOCATIONS}"
  # 只有证书确实覆盖了别名域名时才在 443 上给别名加跳转块，避免证书不匹配
  ALIAS_HTTPS=0
  if command -v openssl >/dev/null 2>&1 && openssl x509 -in "$SSL_CERT" -noout -ext subjectAltName 2>/dev/null | grep -q "DNS:${SERVER_ALIAS}"; then
    ALIAS_HTTPS=1
  fi
  if [ "$ALIAS_HTTPS" = 1 ]; then
    log "证书包含 ${SERVER_ALIAS}，HTTPS 上同样 301 到 https://${SERVER_NAME}"
    HTTPS_ALIAS_SERVER=$(cat <<'NGEOF'

# 别名域名（www）在 HTTPS 上也 301 到唯一入口主域名
server {
    listen HTTPS_LISTEN_PLACEHOLDER ssl;
    server_name SERVER_ALIAS_PLACEHOLDER;

    ssl_certificate SSL_CERT_PLACEHOLDER;
    ssl_certificate_key SSL_KEY_PLACEHOLDER;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    return 301 https://SERVER_NAME_PLACEHOLDER$request_uri;
}
NGEOF
)
  else
    log "证书未覆盖 ${SERVER_ALIAS}，不加别名 HTTPS 跳转块"
    HTTPS_ALIAS_SERVER=""
  fi
  NGINX_BODY="${HTTP_SERVER}
${HTTPS_SERVER}${HTTPS_ALIAS_SERVER}"
else
  TLS_ENABLED=0
  log "未找到证书（${SSL_CERT} / ${SSL_KEY}），保持纯 HTTP；放好证书后重新部署即自动开启 HTTPS"
  # 主域名 server 放在前面，作为 80 端口默认 server：IP / 未知 Host 仍可直接访问
  NGINX_BODY=$(cat <<'NGEOF'
server {
    listen HTTP_LISTEN_PLACEHOLDER;
    server_name SERVER_NAME_PLACEHOLDER;

    client_max_body_size 10m;

LOCATIONS_PLACEHOLDER
}

# 别名（www）在 HTTP 上 301 跳到主域名；此时还没有证书，先不跳 HTTPS
server {
    listen HTTP_LISTEN_PLACEHOLDER;
    server_name SERVER_ALIAS_PLACEHOLDER;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    location / {
        return 301 http://SERVER_NAME_PLACEHOLDER$request_uri;
    }
}
NGEOF
)
  NGINX_BODY="${NGINX_BODY/LOCATIONS_PLACEHOLDER/$LOCATIONS}"
fi

NGINX_BODY=$(printf '%s\n' "$NGINX_BODY" | sed \
  -e "s/HTTP_LISTEN_PLACEHOLDER/${LISTEN_PORT}/" \
  -e "s/HTTPS_LISTEN_PLACEHOLDER/${SSL_LISTEN_PORT}/" \
  -e "s/SERVER_NAME_PLACEHOLDER/${SERVER_NAME}/" \
  -e "s/SERVER_ALIAS_PLACEHOLDER/${SERVER_ALIAS}/" \
  -e "s|SSL_CERT_PLACEHOLDER|${SSL_CERT}|" \
  -e "s|SSL_KEY_PLACEHOLDER|${SSL_KEY}|" \
  -e "s/APP_PORT_PLACEHOLDER/${APP_PORT}/")
  if ! diff -q <(echo "$NGINX_BODY") <(sudo cat "$NGINX_CONF" 2>/dev/null) >/dev/null 2>&1; then
    echo "$NGINX_BODY" | sudo tee "$NGINX_CONF" >/dev/null
    sudo nginx -t || die "nginx 配置校验失败"
    sudo systemctl reload nginx
    log "nginx 配置已更新（${SERVER_NAME}${PUBLIC_BASE} -> 127.0.0.1:${APP_PORT}）"
  else
    log "nginx 配置无变化，跳过"
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

log "✅ ${APP_NAME} 部署完成"
log "   内网: ${HEALTH_URL}"
if [ "$TLS_ENABLED" = 1 ]; then
  log "   对外: https://${SERVER_NAME}${PUBLIC_BASE}（HTTP 已 301 跳转 HTTPS）"
else
  log "   对外: http://${SERVER_NAME}${PUBLIC_BASE}"
fi
log "   注意: ${SERVER_NAME}${PUBLIC_BASE}/ 会 308 到无尾斜杠版本（浏览器自动跟随）"
