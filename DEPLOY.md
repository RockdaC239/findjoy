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
- `3939`（findjoy 对外端口）
- `80` / `443`（以后绑定域名、上 HTTPS 用）

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
curl http://<服务器公网IP>:3939        # 应该返回 HTML 页面
curl http://<服务器公网IP>:3939/api/models
```

服务器上排查：

```bash
sudo systemctl status findjoy          # 服务状态
sudo journalctl -u findjoy -f          # 实时日志
sudo systemctl restart findjoy         # 手动重启
curl http://127.0.0.1:3030/            # 内网健康检查
```

## 第 6 步（可选）：绑定域名 + HTTPS

1. 域名解析 A 记录指向服务器 IP
2. `deploy.config.yml` 的 `nginx.server_name` 改成域名，并把 nginx 监听改为 80/443
3. 用 certbot 签证书：
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

## 回滚

部署脚本在构建失败时自动回滚 `.next`。若要回滚整个版本：在 GitHub 重新跑上一个 commit 的 Actions（`workflow_dispatch`），或服务器上手动 `git checkout <旧commit>` 后重新部署。

## 常见问题

- **SSH Permission denied**：确认 `DEPLOY_SSH_KEY` 是 bootstrap 打印的私钥全文；`DEPLOY_USER` 与 bootstrap 的 `DEPLOY_USER` 一致。
- **端口访问不了**：安全组没放行 3939；或 nginx 未 reload（看 `sudo nginx -t`）。
- **better-sqlite3 编译失败**：服务器缺 build-essential/python3，重跑 bootstrap。
- **服务反复重启**：`sudo journalctl -u findjoy -n 50` 看日志，多为 `.env` 缺 `LLM_API_KEY`。
