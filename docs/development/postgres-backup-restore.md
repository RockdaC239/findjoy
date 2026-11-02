# PostgreSQL 备份与恢复

适用于当前 FindJoy PostgreSQL 开发版本。工具已通过独立数据库演练，尚未在生产安装定时任务、建立异机副本或验收恢复时间。本文件不授权切换生产服务或覆盖生产库。

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

## 上线前仍需完成

1. 至少每日自动备份，并按明确业务容忍度增加频率；每日备份意味着最多可能丢失约一天数据，不是零丢失方案。交易增长后需要更小 RPO 时增加频率或启用 WAL 归档/时间点恢复。
2. 至少一份备份及摘要离开应用服务器，放在受限存储中，使用加密传输。异机副本也执行校验与恢复，不只确认上传成功。
3. 建立保留策略：建议最近 7 天每日备份、最近 4 周每周备份。先确认新备份和异机副本有效，再清理过期文件；当前工具不自动删除任何已完成备份。
4. 安装定时任务、失败告警和磁盘监控，核实备份任务没有因脚本异常、版本不匹配或权限不足长期失败。
5. 用接近真实数据量演练，记录备份时间、异机备份时间、恢复耗时、应用冒烟结果和 Owner 接受的 RPO/RTO。应用与数据库同机的单点故障仍存在。

## 开发验证

`TEST_DATABASE_URL` 必须是有创建/删除测试数据库权限的独立测试实例账号。测试随机创建 source/target 数据库并清理，不使用生产数据；该权限只供测试和维护，不授予应用账号。

```bash
TEST_DATABASE_URL='postgresql://findjoy_test@127.0.0.1:55439/findjoy_test' npm test -- lib/database-backup.test.ts
```

验证文件权限、工具失败清理、损坏备份拒绝、原库拒绝、非空目标拒绝、存档/订单/积分恢复及账本序列继续递增。CI 准备 PostgreSQL 15 客户端与 15.19 服务；本地已执行的演练版本为 14.23，CI 尚未运行，不视为 15 版本已验收。

依据：[pg_dump 官方说明](https://www.postgresql.org/docs/15/app-pgdump.html)、[pg_restore 官方说明](https://www.postgresql.org/docs/15/app-pgrestore.html)。
