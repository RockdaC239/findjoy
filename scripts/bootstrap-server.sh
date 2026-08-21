#!/usr/bin/env bash
# ============================================================
# 腾讯云新服务器一键初始化（以 root 运行一次）
# 用法：  sudo bash scripts/bootstrap-server.sh
# 会安装 Node 20 / nginx / 构建工具，创建部署用户与部署密钥，
# 并打印需要填入 GitHub Secrets 的私钥。
# ============================================================
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-rocc}"
APP_NAME="${APP_NAME:-findjoy}"
SERVER_PATH="${SERVER_PATH:-/home/${DEPLOY_USER}/apps/${APP_NAME}}"
PUBLIC_PORT="${PUBLIC_PORT:-3939}"
NODE_MAJOR="${NODE_MAJOR:-20}"

export DEBIAN_FRONTEND=noninteractive

log() { echo; echo "========== $* =========="; }

log "1/6 系统更新与基础软件"
apt-get update -y
apt-get install -y git nginx rsync curl ca-certificates build-essential python3

log "2/6 安装 Node.js ${NODE_MAJOR}"
if command -v node >/dev/null 2>&1 && node -v | grep -q "^v${NODE_MAJOR}"; then
  echo "Node.js 已安装：$(node -v)"
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

log "3/6 创建部署用户 ${DEPLOY_USER}"
if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "${DEPLOY_USER}"
  echo "已创建用户 ${DEPLOY_USER}，请设置登录密码："
  passwd "${DEPLOY_USER}"
else
  echo "用户已存在"
fi
# 部署脚本需要免密执行 systemctl 与 nginx
cat > /etc/sudoers.d/deploy-nopasswd <<EOF
${DEPLOY_USER} ALL=(ALL) NOPASSWD: /bin/systemctl, /usr/sbin/nginx
EOF
chmod 440 /etc/sudoers.d/deploy-nopasswd
visudo -c

log "4/6 创建目录结构"
mkdir -p "${SERVER_PATH}/src" "${SERVER_PATH}/data" "${SERVER_PATH}/logs"
chown -R "${DEPLOY_USER}":"${DEPLOY_USER}" "$(dirname "${SERVER_PATH}")"

log "5/6 生成 GitHub Actions 部署密钥"
runuser -u "${DEPLOY_USER}" -- bash -c 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
if [ ! -f "/home/${DEPLOY_USER}/.ssh/${APP_NAME}_deploy" ]; then
  runuser -u "${DEPLOY_USER}" -- ssh-keygen -t ed25519 -f "/home/${DEPLOY_USER}/.ssh/${APP_NAME}_deploy" -N "" -C "${APP_NAME}-github-actions"
fi
runuser -u "${DEPLOY_USER}" -- bash -c "grep -qF "$(cat /home/${DEPLOY_USER}/.ssh/${APP_NAME}_deploy.pub)" /home/${DEPLOY_USER}/.ssh/authorized_keys || cat /home/${DEPLOY_USER}/.ssh/${APP_NAME}_deploy.pub >> /home/${DEPLOY_USER}/.ssh/authorized_keys"

log "6/6 完成"
echo
echo "=============================================================="
echo "✅ 服务器初始化完成！请完成以下 4 步："
echo ""
echo "1. 腾讯云控制台 -> 安全组/防火墙，放行端口："
echo "    22（SSH）、${PUBLIC_PORT}（应用）、80/443（以后绑定域名用）"
echo ""
echo "2. 在 GitHub 仓库 Settings -> Secrets and variables -> Actions 添加："
echo "    DEPLOY_HOST = 服务器公网 IP"
echo "    DEPLOY_USER = ${DEPLOY_USER}"
echo "    DEPLOY_SSH_KEY = 下面【私钥】的完整内容"
echo ""
echo "3. 添加应用环境变量 APP_ENV（.env 内容，例如）："
echo '    LLM_BASE_URL=https://api.openai.com/v1'
echo '    LLM_API_KEY=sk-你的key'
echo '    LLM_MODEL=gpt-4o-mini'
echo '    LIFE_DB_PATH='${SERVER_PATH}'/data/life.db'
echo ""
echo "4. 把仓库的 deploy/、scripts/、.github/ 推送到 main，自动部署。"
echo "=============================================================="
echo
echo ">>> 私钥（完整复制，含 BEGIN/END 行）>>>"
runuser -u "${DEPLOY_USER}" -- cat "/home/${DEPLOY_USER}/.ssh/${APP_NAME}_deploy"
echo "<<< 私钥结束 <<<"
