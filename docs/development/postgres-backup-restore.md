# PostgreSQL 备份与恢复

适用于当前 FindJoy PostgreSQL 开发版本。工具已支持异机副本、保留策略和失败告警，并已提供 systemd 定时任务模板；生产安装、真实异机存储与 RPO/RTO 验收仍未执行。本文件不授权切换生产服务或覆盖生产库。

## 准备

- 安装与服务器大版本匹配的 `pg_dump`、`pg_restore`。服务器已核实为 PostgreSQL 15.19，生产使用 15 系列客户端；如系统有多个版本，通过绝对目录 `FINDJOY_PG_BIN` 指定。
- `DATABASE_URL` 提供备份源的 TCP PostgreSQL URI，包含明确用户名和数据库名。支持 sslmode/sslrootcert/sslcert/sslkey/options/connect_timeout/application_name 参数；其他形式直接拒绝，不猜测连接目标。
- 工具通过子进程环境传递凭据，不把密码放在命令行参数或日志里。环境文件与证书只存受保护目录，不提交 Git。
- 备份账号需能读取整个业务库及导出快照；恢复账号需能在独立目标库创建对象。运行应用仍使用独立受限账号。
- 备份目录使用绝对路径，放在源码目录之外，权限必须为 700；文件和摘要为 600。备份包含用户数据、会话和交易资料，不进入 Git、公开下载目录或普通日志。

## 备份

通过已配置的受保护环境提供连接串：

```bash
export FINDJOY_BACKUP_DIR='/absolute/private/backup-directory'
npm run db:backup
```

也可用 `node --env-file=/absolute/private/database.env scripts/backup-database.mjs`。脚本不自动读取 Next.js 的环境文件。

备份在只读 REPEATABLE READ 事务中导出快照，pg_dump 和表数据摘要使用同一个快照；支持业务正常读写时备份，迁移 DDL 仍应避开备份窗口。生成压缩 custom archive、SHA-256、大小、时间和逐表行数/内容摘要。摘要以数据库聚合计算，不将所有用户正文加载到 Node 内存。

成功生成 archive 后，脚本按以下顺序处理：

1. 若配置 `FINDJOY_BACKUP_OFFSITE`，先复制 archive 和清单到异机（`rclone:remote:path` 或绝对挂载目录），并校验大小/摘要；失败则保留全部本地副本并以非零退出。
2. 再清理本地过期备份：每个自然日保留最新一份（默认 7 天），每个 ISO 周保留最新一份（默认 4 周），同时永远保留刚生成的备份；只删除成对的 `findjoy-*.dump` 与 `.dump.json`，并清理超过一天的 `.partial`。
3. 任一步失败时向 `FINDJOY_ALERT_WEBHOOK` 发送固定字段告警（服务名、失败阶段、时间），不包含连接串、订单或用户数据。

文件先写 `.partial`，pg_dump 和 pg_restore 目录验证无错误/警告后发布 `.dump` 与 `.dump.json`。只有二者齐全且命令成功的备份可进入备份清单；失败残留的孤立文件不能算一次成功备份。命令非零退出必须触发告警，不应继续清理旧备份。

输出仅含备份路径、字节数和耗时，不输出用户数据或连接串。摘要用于内容一致性核验，不能单靠“文件已生成”宣称可恢复。

## 独立恢复演练

先由维护者创建一个独立空数据库。`RESTORE_DATABASE_URL` 必须显式指向该库；工具拒绝原源库指纹及非空目标，不自动删库、清表或覆盖对象。

```bash
# 用受保护的恢复环境提供 RESTORE_DATABASE_URL。
export FINDJOY_RESTORE_ARCHIVE='/absolute/private/backup-directory/selected.dump'
FINDJOY_RESTORE_EMPTY_TARGET=yes npm run db:restore
```

可用 Node `--env-file` 加载恢复环境文件。不要用原应用生产库作为演练目标，也不要把“空目标确认”变量当成已经核实目标的证明。

恢复顺序：先检查 `.dump.json` 与文件大小/SHA-256，再核实目标为空，通过 pg_restore 的单事务和遇错停止模式恢复，最后比对所有用户表的行数和内容摘要。没有使用 `--clean` 或 `--create`，不会自动删除数据库。

- pg_restore 执行出错时，其恢复事务回滚。
- 恢复完成但内容核验失败时，退出非零并保留隔离库供排查，禁止将该库接入应用；不会为了清理演练而自动删除它。
- 数据库对象所有权与 ACL 不从源库照搬，避免把旧权限带到新环境。角色、凭据、运行账号授权和默认权限须从部署配置独立重建，尚不能把本工具当作完整的实例级灾备。
- 校验通过后还需在隔离服务验证登录、普通模式存档恢复与游戏、订单和积分，再记录实际 RPO/RTO。旧备份对应旧 schema 时，先保留原备份，再按已验证流程升级 schema，不能直接连接最新应用碰运气。

## 定时任务、异机副本与告警

服务器完成一次不可变发布后，用一次性脚本安装并启用两个 systemd timer：

```bash
# 服务器上执行；先确认 .env 已配置备份目录、异机目标、告警 Webhook 和对账令牌
sudo DEPLOY_USER=rocc SERVER_PATH=/home/rocc/apps/findjoy \
  bash scripts/install-maintenance-units.sh
```

- `findjoy-backup.timer`：每日 03:30 运行 `npm run db:backup`，随机延迟最多 15 分钟，失败可在 `journalctl -u findjoy-backup` 查看。
- `findjoy-reconcile.timer`：开机 2 分钟后、之后每 5 分钟调用本机对账接口；令牌只从环境文件读取，不放在命令行或 URL。
- 安装脚本在缺少 `FINDJOY_BACKUP_DIR`、`FINDJOY_BACKUP_OFFSITE`、`FINDJOY_ALERT_WEBHOOK` 或 `FINDJOY_RECONCILE_TOKEN` 时拒绝启用，避免“定时任务在但没有真实备份”的假完成。

异机目标二选一：

- `rclone:findjoy-backup:findjoy`：需要先配置好 rclone remote，并确保远端支持服务端加密/访问控制；本地脚本会 `rclone copyto` 后用 `lsjson --stat` 校验大小。
- 绝对挂载目录：目录必须为 700，复制后重新计算 SHA-256 校验。挂载点断开时备份任务失败并告警，不会静默只留本机副本。

远端保留周期建议在对象存储/备份服务侧单独配置生命周期；本工具的自动清理只作用于本机目录，不删除异机副本。

## 上线前仍需完成

1. 在服务器配置真实异机存储和 HTTPS 告警 Webhook，安装 timer，并确认连续多日自动备份、失败告警和磁盘余量正常。
2. 用接近真实数据量执行一次完整恢复演练，记录备份时间、异机复制时间、恢复耗时、应用冒烟结果和 Owner 接受的 RPO/RTO。每日备份最多可能丢失约一天数据；需要更小 RPO 时再评估 WAL 归档/时间点恢复。
3. 应用与数据库同机的单点故障仍存在；异机副本只是一份离线恢复材料，不等同于高可用。
4. 恢复后的数据库角色、密码和运行权限必须独立重建；archive 不包含实例全局角色。

## 开发验证

`TEST_DATABASE_URL` 必须是有创建/删除测试数据库权限的独立测试实例账号。测试随机创建 source/target 数据库并清理，不使用生产数据；该权限只供测试和维护，不授予应用账号。

```bash
TEST_DATABASE_URL='postgresql://findjoy_test@127.0.0.1:55439/findjoy_test' npm test -- lib/database-backup.test.ts
```

验证文件权限、工具失败清理、损坏备份拒绝、原库拒绝、非空目标拒绝、存档/订单/积分恢复及账本序列继续递增；另验证异机目录复制、保留清理和告警目标格式。2026-11-02 已在本地 PostgreSQL 15.19 实例执行全套测试（含备份恢复、导入、账号/订单/积分并发用例）；CI 仍须实际运行并保存结果，不能只以 workflow 配置代替验收。

依据：[pg_dump 官方说明](https://www.postgresql.org/docs/15/app-pgdump.html)、[pg_restore 官方说明](https://www.postgresql.org/docs/15/app-pgrestore.html)。
