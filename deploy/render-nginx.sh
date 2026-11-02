#!/usr/bin/env bash
# 只输出共享域名配置，不写文件、不重载服务。由已授权的发布流程调用。
set -euo pipefail
APP_PORT="${1:?app port required}"
SERVER_NAME="${2:?domain required}"
LISTEN_PORT="${3:?HTTP port required}"
SSL_LISTEN_PORT="${4:?HTTPS port required}"
SSL_CERT="${5:?certificate path required}"
SSL_KEY="${6:?key path required}"
SERVER_ALIAS="${7:?alias required}"
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

    # FindFire API 与 Web 共用域名；由同一配置维护，发布 FindJoy 时必须保留。
    location ^~ /api/v1/ {
        proxy_pass http://127.0.0.1:8003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # 预留：acme.sh / certbot 续签用的 HTTP 校验路径
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
NGEOF
)

if [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then
  TLS_ENABLED=1
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
  if command -v openssl >/dev/null 2>&1 && openssl x509 -in "$SSL_CERT" -noout -ext subjectAltName 2>/dev/null | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -Fxq "DNS:${SERVER_ALIAS}"; then
    ALIAS_HTTPS=1
  fi
  if [ "$ALIAS_HTTPS" = 1 ]; then
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
    HTTPS_ALIAS_SERVER=""
  fi
  NGINX_BODY="${HTTP_SERVER}
${HTTPS_SERVER}${HTTPS_ALIAS_SERVER}"
else
  TLS_ENABLED=0
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
printf '%s\n' "$NGINX_BODY"
