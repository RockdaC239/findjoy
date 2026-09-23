# findjoy 部署指南（腾讯云 + GitHub Actions）

本文按**三层部署模型**（编排层 / 部署登记表 / 执行层）落地：

| 层 | 落地点 | 文件 |
|---|---|---|
| 编排层 | GitHub Actions | `.github/workflows/deploy.yml` |
| 部署登记表 | 项目差异声明 | `deploy.config.yml` |
| 执行层 | 服务器上的幂等部署脚本 | `deploy/deploy-production.sh` |
| 服务器初始化 | 一次性脚本 | `scripts/bootstrap-server.sh` |

架构：`GitHub push main` → Actions 跑测试 → rsync 代码到服务器 → 执行部署脚本
（npm ci + build → systemd 守护 `next start` 监听 127.0.0.1:3030 → nginx 反代对外 :3939 → 健康检查）。

---

## 第 0 步：准备

- 一台腾讯云服务器（CVM 或轻量应用服务器），公网 IP 可访问
- 服务器 SSH 登录方式：控制台创建时设置 root 密码（或密钥）
- GitHub 仓库：`RockdaC239/findjoy`，main 分支

## 第 1 步：登录服务器并初始化（一次性）

在你自己电脑上，用腾讯云控制台给你的信息登录：

```bash
# 用 root 或控制台默认用户登录（密码在控制台设置）
ssh root@<服务器公网IP>
```

把初始化脚本上传并运行（也可以直接复制脚本内容粘贴到终端）：

```bash
# 本机执行：上传脚本
scp scripts/bootstrap-server.sh root@<服务器公网IP>:~/
# 服务器上执行：
sudo bash ~/bootstrap-server.sh
```

脚本会依次：
1. 安装 git / nginx / rsync / 构建工具（better-sqlite3 原生编译需要）
2. 安装 Node.js 20（Next.js 16 要求 ≥20.9）
3. 创建部署用户 `rocc`（默认），并配置 systemctl/nginx 免密 sudo
4. 创建目录 `/home/rocc/apps/findjoy/{src,data,logs}`
5. 生成部署密钥 `findjoy_deploy`，并把**私钥打印出来**

> ⚠️ 私钥只显示一次，复制后妥善保存到 GitHub Secrets。

## 第 2 步：腾讯云控制台放行端口

**CVM**：实例 → 安全组 → 添加入站规则；**轻量应用服务器**：防火墙 → 添加规则。
放行：

- `22`（SSH）
- `80` / `443`（Web 对外端口；findjoy 挂在 `https://findfire.club/findjoy`）

## 第 3 步：配置 GitHub Secrets

仓库 → `Settings` → `Secrets and variables` → `Actions` → `New repository secret`：

| Secret 名称 | 值 |
|---|---|
| `DEPLOY_HOST` | 服务器公网 IP |
| `DEPLOY_USER` | `rocc`（与 bootstrap 一致） |
| `DEPLOY_SSH_KEY` | bootstrap 打印的私钥全文（含 `-----BEGIN/END OPENSSH PRIVATE KEY-----`） |
| `APP_ENV` | 应用环境变量，多行，例如： |

```
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-你的key
LLM_MODEL=gpt-4o-mini
LLM_INPUT_COST_PER_MILLION=0
LLM_OUTPUT_COST_PER_MILLION=0
LIFE_DB_PATH=/home/rocc/apps/findjoy/data/life.db
```

> `LIFE_DB_PATH` 指向服务器持久化目录，SQLite 数据不会因部署被覆盖。

## 第 4 步：推送代码，触发部署

```bash
git add deploy.config.yml deploy/ scripts/ .github/
git commit -m "ci:配置腾讯云生产部署（GitHub Actions + 三层部署模型）"
git push origin main
```

然后打开仓库 → `Actions` 页签查看流水线。绿色 ✅ = 部署成功。

## 第 5 步：验证

```bash
# 本地任意机器
curl -I http://findfire.club/findjoy       # 期望 301 -> https
curl -I https://findfire.club/findjoy      # 期望 200 / 308
curl -s https://findfire.club/findjoy/api/models | head
```

服务器上排查：

```bash
sudo systemctl status findjoy          # 服务状态
sudo journalctl -u findjoy -f          # 实时日志
sudo systemctl restart findjoy         # 手动重启
curl -s http://127.0.0.1:3001/findjoy   # 内网健康检查（next start 只监听 127.0.0.1:3001）
```

## 第 6 步：绑定域名 + HTTPS（腾讯云免费证书）

域名 `findfire.club` 的 A 记录已指向 `124.221.235.9`。免费证书签发后，剩下的就是把证书放到服务器上。

部署脚本已内置 HTTPS：**`/etc/nginx/ssl/` 下存在证书时，自动生成 443 server 块并把 80 全站 301 跳转到 HTTPS；没有证书则保持纯 HTTP，不影响部署。**
因此不要手工改服务器上的 `/etc/nginx/conf.d/findjoy.conf`——每次部署都会按模板重写它；要改配置就改 `deploy/deploy-production.sh`。

### 6.1 下载证书（腾讯云控制台）

SSL 证书 → 我的证书 → 找到 `findfire.club` → 下载 → 选择 **Nginx** 格式 → 解压得到：

- `findfire.club_bundle.crt`：证书 + 中间证书链
- `findfire.club.key`：私钥

### 6.2 上传到服务器

证书放在 `SERVER_PATH/certs/`（默认 `/home/rocc/apps/findjoy/certs/`）。这个目录在 `src/` 之外，**部署的 `rsync --delete` 不会覆盖它**，所以续期只需替换文件。

```bash
# 本机执行
scp findfire.club_bundle.crt findfire.club.key rocc@124.221.235.9:/home/rocc/apps/findjoy/certs/

# 登录服务器后执行：改成脚本期望的文件名并收紧权限
ssh rocc@124.221.235.9
cd /home/rocc/apps/findjoy/certs
mv findfire.club_bundle.crt findfire.club.crt
chmod 644 findfire.club.crt
chmod 600 findfire.club.key
```

脚本按 `${CERT_DIR}/${SERVER_NAME}.crt` 和 `.key` 找证书；要换目录就设置部署时的 `CERT_DIR` / `SSL_CERT` / `SSL_KEY` 环境变量。

### 6.3 放行 443 端口

腾讯云控制台 → **轻量应用服务器**（CVM 则为云服务器）→ 选中该实例 → **防火墙**（CVM 是安全组）→ 添加规则：应用类型 `HTTPS(443)`、协议 `TCP`、端口 `443`、来源 `0.0.0.0/0`、策略 `允许`。

> 只放行 80、没放行 443 时，服务器上 `curl -k https://127.0.0.1/ -H "Host: findfire.club"` 正常，但外网访问会超时——这是云防火墙，不是 nginx 的问题。

### 6.4 触发部署

```bash
git push origin main        # 或在仓库 Actions 页面点 Run workflow
```

脚本会检测到证书，自动加上 443 的 HTTPS 站点并把 80 跳转到 https，日志里会打印 `对外: https://findfire.club/findjoy`。

### 6.5 验证

```bash
curl -I http://findfire.club/findjoy     # 期望 301 -> https
curl -I https://findfire.club/findjoy    # 期望 200 / 308
openssl s_client -connect findfire.club:443 -servername findfire.club </dev/null 2>/dev/null | openssl x509 -noout -subject -dates
```

### 6.6 免费证书只有 90 天

腾讯云免费证书有效期 90 天。到期前重新申请、替换 `/etc/nginx/ssl/` 下的两个文件、再触发一次部署即可。想一劳永逸可以改用 `acme.sh` 做 HTTP 校验自动续期：nginx 配置里已预留 `/.well-known/acme-challenge/` location。

### 6.7 二维码与分享链接

`app/showcase/ShowcaseDeck.tsx` 的链接文案和 `public/findjoy-qr.png` 目前指向 `http://124.221.235.9/findjoy`。强制 HTTPS 后，用 IP 访问的 HTTP 会被 301 到 `https://<IP>`，触发证书不匹配警告；建议把二维码和文案改成 `https://findfire.club/findjoy`。

## 回滚

部署脚本在构建失败时自动回滚 `.next`。若要回滚整个版本：在 GitHub 重新跑上一个 commit 的 Actions（`workflow_dispatch`），或服务器上手动 `git checkout <旧commit>` 后重新部署。

## 常见问题

- **SSH Permission denied**：确认 `DEPLOY_SSH_KEY` 是 bootstrap 打印的私钥全文；`DEPLOY_USER` 与 bootstrap 的 `DEPLOY_USER` 一致。
- **端口访问不了**：安全组没放行 3939；或 nginx 未 reload（看 `sudo nginx -t`）。
- **better-sqlite3 编译失败**：服务器缺 build-essential/python3，重跑 bootstrap。
- **服务反复重启**：`sudo journalctl -u findjoy -n 50` 看日志，多为 `.env` 缺 `LLM_API_KEY`。
