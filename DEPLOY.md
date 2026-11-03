# findjoy 部署指南（腾讯云 + GitHub Actions）

生产发布须由 Owner 确认范围，再通过 main push 触发 GitHub Actions；以下初始化说明不授权手动发布应用。当前 PostgreSQL 上线加固仍在开发，执行前核对[进度与待验收事项](docs/development/2026-11-02-backend-hardening-progress.md)。

本文按**三层部署模型**（编排层 / 部署登记表 / 执行层）落地：

| 层 | 落地点 | 文件 |
|---|---|---|
| 编排层 | GitHub Actions | `.github/workflows/deploy.yml` |
| 部署登记表 | 项目差异声明 | `deploy.config.yml` |
| 执行层 | 服务器上的幂等部署脚本 | `deploy/deploy-production.sh` |
| 服务器初始化 | 一次性脚本 | `scripts/bootstrap-server.sh` |

架构：`GitHub push main` → Actions 跑测试 → rsync 到 `releases/<commit>` → 部署前预检
→ npm ci + build → 原子切换 `current` 软链 → systemd 守护 `next start` 监听 127.0.0.1:3001
→ nginx 反代对外 80/443 → 健康检查；失败自动切回上一个 release。

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
2. 安装 Node.js 22（`better-sqlite3@13` 要求 ≥22）
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
| `APP_ENV` | 应用环境变量，多行，必须使用 PostgreSQL，例如： |

```env
FINDJOY_APP_ORIGIN=https://findfire.club
AUTHING_ISSUER=https://findjoy.authing.cn/oidc
AUTHING_CLIENT_ID=...
DATABASE_URL=postgresql://findjoy_app:密码@127.0.0.1:54323/findjoy
FINDJOY_DB_POOL_MAX=5
FINDJOY_PG_BIN=/usr/lib/postgresql/15/bin

LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=sk-你的key
LLM_MODEL=deepseek-chat

FINDJOY_PAYMENTS_MODE=demo
FINDJOY_TRIAL_CREDITS=40
FINDJOY_GENERATION_ENABLED=true
FINDJOY_GENERATION_MAX_CONCURRENT=4
FINDJOY_RECONCILE_TOKEN=至少32位随机字符

FINDJOY_BACKUP_DIR=/home/rocc/apps/findjoy/backups
FINDJOY_BACKUP_OFFSITE=rclone:findjoy-backup:findjoy
FINDJOY_ALERT_WEBHOOK=https://hooks.example.com/findjoy
```

> 生产预检会检查数据库版本/迁移/权限、最近备份、异机目标、告警 Webhook、支付配置和磁盘余量；任何一项失败都不会构建或切换版本。`DATABASE_URL` 必须使用独立受限角色，不能复用 PostgreSQL 超级用户。`.env` 只保存在服务器，不进入 Git 或发布目录。

## 第 4 步：推送代码，触发部署

首次发布前还要完成数据库迁移、备份/异机/告警配置和恢复演练；生产预检未通过时流水线会停在构建前。

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
curl -s http://127.0.0.1:3001/findjoy/api/health   # 数据库就绪检查（next start 只监听 127.0.0.1:3001）
```

## 第 6 步：绑定域名 + HTTPS（腾讯云免费证书）

域名 `findfire.club` 的 A 记录已指向 `124.221.235.9`。免费证书签发后，剩下的就是把证书放到服务器上。

部署脚本已内置 HTTPS：**`SERVER_PATH/certs/` 下存在证书时，自动生成 443 server 块并把 80 全站 301 跳转到 HTTPS；没有证书则保持纯 HTTP，不影响部署。**
因此不要手工改服务器上的 `/etc/nginx/conf.d/findjoy.conf`——每次部署都会按模板重写它；共享路由的唯一模板入口是 `deploy/render-nginx.sh`，由 `deploy/deploy-production.sh` 调用 `deploy/apply-nginx.sh` 校验并应用；修改后必须同时验证 FindFire 的 `/` 与 `/api/v1/`。

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

腾讯云免费证书有效期 90 天。到期前重新申请、替换 `SERVER_PATH/certs/` 下的两个文件、再触发一次部署即可。想一劳永逸可以改用 `acme.sh` 做 HTTP 校验自动续期：nginx 配置里已预留 `/.well-known/acme-challenge/` location。

### 6.7 二维码与分享链接

`app/showcase/ShowcaseDeck.tsx` 的链接文案和 `public/findjoy-qr.png` 目前指向 `http://124.221.235.9/findjoy`。强制 HTTPS 后，用 IP 访问的 HTTP 会被 301 到 `https://<IP>`，触发证书不匹配警告；建议把二维码和文案改成 `https://findfire.club/findjoy`。

## 发布目录、预检与回滚

- 每次发布写入 `SERVER_PATH/releases/<commit>`，构建成功后才把 `current` 软链原子切换到该目录；正在运行的旧进程和旧文件不被覆盖。
- 构建、预检或 nginx 配置失败时，`current` 不切换，旧版本继续服务；失败的新目录会被清理。
- 健康检查失败时，脚本自动把 `current` 切回上一个 release、恢复上一份 `.env` 并重启，保留失败版本供排查。
- 默认保留最近 3 个 release（`KEEP_RELEASES` 可调），旧目录在成功后清理；`src` 仅作为旧布局的回退目录保留。
- 紧急手动回退须由 Owner 确认范围，只切换到已验证的旧 release：

```bash
# 示例；先确认目标 release 和当前版本，禁止直接改数据库或手工覆盖源码
sudo systemctl stop findjoy
sudo bash /home/rocc/apps/findjoy/current/deploy/switch-release.sh \
  rollback /home/rocc/apps/findjoy /home/rocc/apps/findjoy/releases/<旧commit>
sudo systemctl start findjoy
curl -fsS http://127.0.0.1:3001/findjoy/api/health
```

切换后若已有新写入，不能简单恢复旧数据库备份；应暂停写入口、保全新数据并前向修复。

## 常见问题

- **SSH Permission denied**：确认 `DEPLOY_SSH_KEY` 是 bootstrap 打印的私钥全文；`DEPLOY_USER` 与 bootstrap 的 `DEPLOY_USER` 一致。
- **端口访问不了**：安全组没放行 80/443；或 nginx 未 reload（看 `sudo nginx -t`）。
- **better-sqlite3 编译失败**：服务器缺 build-essential/python3，重跑 bootstrap。
- **服务反复重启**：`sudo journalctl -u findjoy -n 50` 看日志，多为 `.env` 缺 `LLM_API_KEY` 或数据库迁移未执行。
- **部署停在预检**：按输出逐项修复，常见原因是迁移校验和不一致、运行角色权限过高、最近备份超过 26 小时、未配置异机/告警目标或磁盘不足。不要用跳过预检的方式强行发布。
