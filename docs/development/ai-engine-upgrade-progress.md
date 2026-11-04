# 人生引擎升级执行记录

状态：本次实施与三轮真实验证已收尾，产品质量暂不建议发布。最终结果见 [验证报告](./ai-engine-upgrade-validation-2026-11-04.md)。下文为过程记录，旧“待完成”条目以最终报告结论为准。

## 已提交

- `dc591d7`：保存升级设计v0.1/v0.2与资料研究。
- `1222c3d`：在新旧两种请求上下文中加入当轮写作任务，携带当前行动及最近4次已选行动，强调回应、关系连续性与真实回报。没有新增模型调用或修改保存协议。
- 行为测试先验证缺少turn_task时失败，实现后相关4文件64项测试通过；`npm run typecheck`、`npm run lint`通过。全量测试和build留待整体变更完成后运行。

## 进行中及待完成

1. 提示词与例子升级：独立任务`upgrade_prompts`正在处理prompts/*.md、assemble.ts、output-format.ts中的示例与基线。
2. 状态与记忆：补足关系/迁居/教育等事实更新，增加有边界的活跃人物、方向与未完事项；同步协议转换和历史兼容。
3. 多样性：扩展机会条件，改进跨局处境/冲突去重，保护玩家合理返回旧方向。
4. 回顾与分享：reflection、shareLines、来源事件ID；校验、保存、展示和公开隐私边界，新旧回顾兼容。
5. 生成可靠性与成本：错误分类、失败轮费用、生产诊断不记录正文。
6. 全量test/typecheck/lint/build，再真实LLM验证。使用用户指定的已登录账号，最多按问题微调3轮，不为凑数迭代。
7. 测试报告：记录实际模型、样本/路径、叙事质量和缺陷、响应/费用、修正轮次和仍未证明的结论。不得仅以单元测试证明沉浸或付费提升。

## 工作区边界

已有app/globals.css、components/ReviewView.tsx与分享相关未提交文件属于开始时已有改动，未提交到本次上下文模块commit。后续如必须接入分享，应先核对差异并只处理授权部分。

浏览器验证空间已经建立：Ego TaskSpace 37（FindJoy engine upgrade validation），p1当前为空白页；尚未确认指定账号会话。继续使用同一space，不另建。已读取ego-browser指南；工具提示有新版本，未升级，不因提示阻断当前任务。

## 续轮进展：生活环境多样性

- 增加12类生活机会环境，作为机会而非预设职业，写入现有flags并恢复为背景指令。
- recentBackgroundAvoid复用当前用户近期存档，增加机会环境避重；旧存档无该字段仍兼容。
- 替换开局“比赛/展览获奖”的集中示例，使用托付、工具、生活环境和参与机会。
- 新行为测试先失败后通过；独立测试库确认可用：本地55439的findjoy_test（不是55438开发库）。相关3文件22项测试通过，typecheck及修改文件ESLint通过。
- 浏览器提示Ego Lite可更新，但未升级；仍使用space37。未调用真实模型、未进入优化轮次。

## 并行实施与验证会话

- `adddf18`已提交生活机会环境及持久化/近期避重，相关3文件22项测试通过。
- 子任务`state_memory_upgrade`负责life.ts、event-contract.ts及narrative.ts和测试；`generation_reliability`负责generate/model-client/errors及测试；`upgrade_prompts`仍负责提示词和示例。三个任务文件边界已告知，后续改回顾前等state任务提交，改输出类型前等prompts任务提交。
- 已通过space37/p1访问http://localhost:3000/findjoy，页面可用且已登录（auth/me 200）。me仅返回id/displayName，尚不能证明是用户指定手机号；后续需通过个人中心/账号接口核实，不凭已登录就断言账号正确。
- 当前未运行真实LLM，微调轮次仍为0。前一轮数据库测试曾因缺TEST_DATABASE_URL失败；已定位独立测试实例并成功复验，非未解决阻塞。

## 续轮：编剧、记忆、可靠性与回顾契约

已提交：
- `e117050`：Review解析优先reflection，shareLines独立处理，旧回顾不自动转公开文案；新增normalizeShareLines基本长度/明显敏感词筛选（语义隐私仍需生成要求与预览）。4项测试red→green。
- `056458d`：人物、方向与事项narrative状态、来源校验、城市/教育/父母/孩子/朋友/病史更新；同一applyNextEvent保存。
- `900f067`：成人/童年/回顾提示词重写、移除艺术创业示例偏置与机械换轴。
- `7aecc73`：永久错误不重试、日志不记正文、累计失败轮已知费用、CRLF/EOF流解析、回顾usage回调与证据ID白名单。
- `7978d33`：output-format接入新事实与narrative类型，context携带活跃记忆及当前城市/教育；路由保存经apply校验的narrative转录；ending契约支持reflection/shareLines/evidenceEventIds，提示词说明字段且更新hash。

最新验证：typecheck通过；独立TEST_DATABASE_URL相关6文件74项测试通过（含生成路由）；修改文件ESLint与diff check通过。全量test/build尚未执行。

仍需完成：
- 分享UI/海报接入用户选择的shareLines，不能默认公开observation/moments，保护已有未提交UI工作；设计tokens.json与showcase在实际UI改动前补读。
- 回顾usage回调接入保存/汇总；目前只有接口，不能声称回顾成本已入账。
- 题材职业硬禁用仍需放松为软提醒，保护玩家返回旧方向；当前只有机会环境增加，未完成整个多样性目标。
- 增加context narrative快照、状态/转录往返集成覆盖及回顾源ID边界测试；review evidence合法ID不证明语义正确，需真实模型样本审阅。
- 所有分项tests及完整test/typecheck/lint/build；真实LLM仍未调用，优化轮次0，测试报告尚未开始。
- Ego space37 p1本地页面已登录；auth/me只返回id/displayName，仍需核实15200297440。不要另建space，不调用生产版本验证未上线变更。

## 2026-11-04恢复后

分项新增提交a90441a、8f99f35、c6d9b8d、93279eb。PG15独立测试库55441下341/341通过；lint/build/typecheck通过。实际账号已由本地会话ID和DB手机只读匹配确认。space37不存在，已接入当前用户space0，新建p1为本地验证页（保留其他网页）。Mock已关，原设置保存.data/engine-validation-settings.json，结束需恢复。

真实测试已开始：首幕文件.data/engine-validation/opening-a.json为真实200完成；当前连续12节点脚本运行handle **exec session_id 6204**（不是functions.wait cell）。继续时先write_stdin轮询6204或核对.data/engine-validation/a-current.json及各a-next-N.json；不要因观察超时重开人生。脚本.data/engine-validation/continue-a.mjs。全量测试session91265已exit0，build session47501已exit0。

正式报告草稿docs/development/ai-engine-upgrade-validation-2026-11-04.md，真实验证/海报浏览器验收/可能微调/恢复浏览器设置尚未完成，目标继续active。

连续脚本session6204已正常exit0：首局到33岁，a-current.json为当前已保存状态，不再轮询该handle。真实发现琐事跨年拖延、职业婴儿/教育未开始，已做第1轮微调（见验证报告），下一步从a-current续推4～6节点验证纠正，并独立新开人生比较。优化轮次1/3，不重复计算工程修复。真实模型配置单价0，报告不能视为免费。待真实终点/回顾/海报浏览器测试及最终复测后才可完成目标。

第1轮复测session25992已exit0，到79岁后429正常停止；.data/engine-validation/a-current.json已更新。分支对照session32406已exit0，结果branch-check.json。第二轮修正职业嵌套解析和字段示例，提交5c8c516、13cd1cf，67项相关测试通过。当前真实续推与自动回顾脚本运行session_id **14231**，使用resume-a-r2.mjs，继续先轮询该句柄。报告已记录实测不足，调优轮次2/3。尚未通过完整效果验收，仍不能complete。

session14231已exit0，第一局100岁44节点死亡，a-ending.json真实200；完整内容已保存。职业教育仍旧默认，回顾有效生成但存在部分选择/年龄解释误差。重要：服务96894是next dev（父37240），之前build与dev共用.next，需重启本地dev并核实实际模型输入，不能把前面复测当作已确认加载新改动。不要重跑该人生到结局；下一步新独立开局及分支验证。最多3轮调优计数仍为2，先排运行态问题，不为凑数加第3轮。浏览器海报可访问本局review，lifeId在忽略的a-current.json中，别提交ID。

运行确认：已重启原next dev，本次dev exec session84468运行中。新B人生10节点到28岁职业教育正常，之后真实续推session **43410**仍运行，脚本finish-b.mjs(最多35步)，逐文件b-final-next-N.json。目前已到56岁，勿重复启动。UI用space0/p3验收回顾和海报；space0/p1为生成测试，p2是用户网页不要操作/关闭。手机尺寸已恢复桌面。图片下载.data/engine-validation/share-poster.png已检查。新增第3轮回顾evidence对照，commit7649fe3，调优已3/3，不再额外生成策略改动。上一次全量test343通过(在新增最后1项模块测试前)，最终需再全量test并build/typecheck/lint；build应停dev或用隔离输出，不能再共享运行目录造成疑惑。

B续推session43410已exit0，到77岁，b-current更新。接着end-b.mjs最多20步及终点回顾运行session **77618**；最终全量测试session **95878**(final3.log)。等待这些具体句柄，不重开人生。关键未解决：B父亲病情进入玩家conditions、对话/检查跨年过长；已3轮不继续调策略，报告建议暂不生产发布。next-env.d.ts被next dev自动改为.next/dev路径，最终build会改回，勿把它误作用户改动。最终需停dev84468后build，再typecheck/lint；恢复Mock并结束只由本次创建的p1/p3，保护p2用户网页。实测质量审计子任务engine_audit正在只读整理/tmp/findjoy-final-quality-audit.md。

## 最终收尾

B terminal脚本session53840已exit0，到106岁75节点、ending200。A/B回顾、同处境两分支、海报桌面/390px手机切换和下载均实际测试。3轮微调用完，不继续改策略。父亲病情误归玩家、同次谈话跨年、回顾解读仍是质量风险，报告不建议直接生产发布。浏览器原Mock设置已恢复，测试p1/p3关闭，p2原用户页保留；用户空间已finish。
