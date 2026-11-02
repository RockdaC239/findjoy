# 首次上线后端加固执行记录

## 范围与发布边界

Owner 已授权按 [上线清单](backend-database-launch-checklist.md) 实施后端与数据库加固，并要求每个独立代码改动验证后提交。首次只开放普通模式，交付链路是登录、游戏、购买。开发在 `test`，不自动 push main 或切换生产数据库。

数据库方向保留自部署 PostgreSQL，不以“先优化 SQLite”代替已确认迁移。FindFire 正式身份接入暂不纳入此次上线功能。

## 2026-11-02 服务器只读核验

核验通过 SSH 只读命令、Docker 运行状态、PostgreSQL 元数据及 SQLite 只读查询完成。未读取密码、模型配置或用户正文；未重启容器、修改权限或迁移生产数据。

| 项目 | 实测结果 |
| --- | --- |
| 服务器资源 | 4 CPU，约 3.6 GiB 内存，检查时可用内存约 2.6 GiB；约 2 GiB swap |
| 磁盘 | 根盘 40 GB，检查时剩余约 28 GB |
| FindJoy | systemd active，工作目录 `/home/rocc/apps/findjoy/src`，监听 127.0.0.1:3001 |
| FindFire API | `findfire-api` 容器，127.0.0.1:8003 |
| PostgreSQL | `findfire-postgres` 容器，实际版本 15.19，镜像标签 `postgres:15-alpine` |
| 数据库网络 | 实际映射为 127.0.0.1:54323 → 5432，与开发 Compose 的默认映射不同 |
| 持久化与重启 | 数据目录为 Docker volume，重启策略 unless-stopped；初始化 SQL 目录为 bind mount |
| 数据库资源快照 | 检查时容器约 24 MiB 内存，max_connections=100，pg_stat_activity 共 6 个连接（含检查连接） |
| 业务库 | findfire 约 8 MB，public schema 12 张表；未发现 FindJoy 专用数据库 |
| PostgreSQL 登录角色 | 仅看到 findfire 登录角色，拥有超级用户和建库权限；接入 FindJoy 前必须创建独立受限角色，不复用超级用户凭据 |
| 线上 SQLite | `/home/rocc/apps/findjoy/data/life.db`，约 6.1 MB |
| SQLite 数据 | 仅 lives=247、transcripts=226；未发现身份、订单和积分表，不能套用本地开发库的全量 schema 假设 |
| SQLite 一致性 | 只读 `PRAGMA quick_check` 返回 ok；不等同于恢复演练或业务校验完成 |
| 已有备份 | 看到 `life-before-auth-payment-20261101.db`；尚未验证备份恢复与异机副本 |

服务器源码以 rsync 发布，不含 `.git`，不能用服务器 `git rev-parse` 证明运行版本。后续发布应记录候选提交与部署版本标识。

判断：现有 PostgreSQL 有复用基础，但以上均为静态快照，没有压测，也未证明备份、权限隔离和生产容量合格。4 GiB 同机需要为构建、两个应用与数据库保留资源，连接池应保持小规模且有上限。

## 已完成的代码改动

### 首发模式限制

- 提交：`08be70d fix:首发仅开放普通模式并校验开局接口`。
- 前端其他模式标记开发中并禁用，后端开局接口拒绝非普通模式，返回 403 / MODE_UNAVAILABLE。
- 默认未指定模式仍为普通模式；底层四模式领域逻辑保留，未删除历史存档。
- 验证：先观察新增拒绝测试失败，再实现；新增接口测试覆盖三种非普通模式拒绝与普通/默认模式继续校验。全套测试、typecheck、lint、build 已执行通过。
- 限制：这是新开局范围限制，不删除或禁止现有历史模式存档的恢复。尚未做手机/桌面浏览器体验验收。

## 下一阶段工作

1. 建立独立本地 PostgreSQL 测试实例；本机已有 PostgreSQL 工具，但默认端口没有运行实例，Docker daemon 当前不可用。不得转而在生产库写测试数据。
2. 迁移 store 为异步 PostgreSQL 调用，更新真实调用方；将 schema 迁移从请求路径移出，保留积分、支付和单局生成事务语义。
3. 迁移脚本同时兼容线上仅人生表的旧 SQLite 和本地完整商业化 schema；线上旧无归属人生保持隔离，不因迁移自动认领。
4. 实施生成并发保护、生产就绪检查、备份恢复工具与部署流程加固；重复支付、并发预占和迟到任务使用实际 PostgreSQL 做集成测试。
5. 测试环境完成导入、恢复及突发压测后，再整理 Owner 可审核的生产切换范围。生产迁移与真实收款验收尚未完成。

本记录持续追加可核验结果，不将上线清单未完成项标记为已完成。

## PostgreSQL 连接与事务基础层

- 新增 `lib/database.ts`，使用 pg 驱动与每进程连接池；默认最多 5 个连接，连接等待 3 秒、语句 10 秒、锁等待 3 秒、空闲事务 10 秒。
- 未配置连接串或连接池数量非法时拒绝初始化。事务全程使用同一连接，失败回滚，回滚失败销毁连接；空闲连接错误只记录固定诊断文字，不输出凭据或 SQL 参数。
- 在忽略目录 `.data/pg-test/cluster` 建立独立本地 PostgreSQL 14.23 测试实例，仅监听 127.0.0.1:55439；与服务器 PostgreSQL 15.19 不同，上线前仍须补 15 版本复验。
- 真实数据库验证了失败回滚、12 个并发事务更新、语句超时后连接恢复，以及池耗尽 3 秒后有界失败。配置 `TEST_DATABASE_URL` 后全套 207 项测试通过，typecheck、lint、build 通过。
- 此提交只建立迁移所需基础，应用 store 仍使用 SQLite；尚未切换生产或宣称 PostgreSQL 迁移完成。
- 独立复验命令：`TEST_DATABASE_URL=<独立测试库连接串> npm test -- lib/database.test.ts`。不设置时数据库集成用例明确跳过，配置校验用例仍运行；不得把跳过视为集成验收。
- 安装驱动时 npm 报告现有依赖树存在安全公告；尚未完成公告逐项归因和修复，列入上线前依赖核查，不使用未经验证的 `npm audit fix --force` 批量升级。
