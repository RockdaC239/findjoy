# FindJoy 编剧参考研究：fiction-development / Story Architect

只读研究，2026-11-03。未安装技能、未运行仓库脚本、未调用模型。以下“可用”均为设计推断，尚无FindJoy A/B实验支撑。

## 来源与阅读范围

1. https://github.com/alt-code-ai/agent/tree/8693ecd0e1e320f7063be13e6c2ec8dffac82f6b/skills/fiction-writing-story-development
   - commit `8693ecd0e1e320f7063be13e6c2ec8dffac82f6b`
   - 实际只有 `skills/fiction-writing-story-development/SKILL.md`，全文阅读，无配套references。它是传统叙事技法的汇编，引用McKee/Egri/Truby/Snyder等，不是作者实测这些方法提高模型质量的证据。
2. https://github.com/narrastory/story-architect-skill/tree/55ac32b4c3250ec603ada967c1a49f03603ee249
   - commit `55ac32b4c3250ec603ada967c1a49f03603ee249`
   - 深读 `SKILL.md`、`references/story-foundations.md`、`character-design.md`、`plot-structures.md`、`scene-and-prose.md`、`revision-and-continuity.md`、`prompt-contract.md`；读连续性/threads模板及 `scripts/build_context_pack.py`、`scripts/story_lint.py` 主要实现。

## 可直接提取的高价值方法

### 1. 因果衔接，而非年代流水账

fiction-development 第3/4节的 expectation–result gap 与 therefore/but 诊断：上一行动本来想取得什么，实际发生什么，为什么迫使玩家重新决策。每轮不必戏剧性反转，更不必“让最坏的事发生”；要让选择改变机会、限制、关系或后续的可行方向。

轻量落点：下一事件至少有一个可辨认的来源（上一选择、已存在处境、独立偶发因素）。因果来源不等于所有坏事都是惩罚，随机事件仍独立。评价问题：将上一选项换成另一个，若下一事件不需改任何事实或冲突，可能是假分支。无需预生成分支树；用固定合成状态+不同选择的反事实对照样本来评估。

### 2. 把场景压缩为“诉求—阻力—变化—待选代价”

fiction-development第4节；Story Architect `scene-and-prose.md` scene contract / scene-and-sequel。传统小说把欲望、冲突、转折、结果写完；互动人生必须在玩家行动之前停下，不能替玩家选。

轻量用法：生成时先明确本轮处境改变、谁想要什么、为什么现在必须回应、2个合理选项分别保住和放弃什么，再写80–180字。仅作为结构化任务要求/离线诊断，不要求输出思维链或每轮追加一次规划模型请求。新事件先兑现上次选择的一部分，再提出新的抉择。

### 3. 身份多样应来自社会位置与资源限制

fiction-development第2节Egri三维：生理/社会/心理，而不是只换职业名。Story Architect `character-design.md` identity/want/resources/vulnerability/strategy。

轻量落点：人生差异优先来自家庭资源、城市/行业机会、教育路径、照护责任、关系网络、生活阶段与具体处境的组合；不要用“天才/体育/艺术特长”作为故事入口捷径。普通模式不能预设玩家人格、伤口或一生职业；客观出身限定资源，后续方向由玩家行为塑造。NPC可保留一个独立诉求+一项现实限制+与玩家的共同事实，已足以产生冲突。不要全量14维人物卡。

### 4. 连续性分“事实”“猜测”“未发生计划”

Story Architect `SKILL.md` operating contract/source-of-truth；`revision-and-continuity.md`五类账本；`canon.md`只收实际成立的事实。其价值是避免把方案、未来伏笔的预期回收当作已发生事实。

建议最小状态只考虑：关键事实及建立节点、少量活跃关系、少量未完事项与来源/状态。保持在唯一LifeState内；不建外部故事数据库。内部ID可稳定区分同角色称谓的两位同事，玩家显示仍无姓名。人物主观声称≠世界事实；ForU真实自述不能被模型猜测覆盖。只有被接纳并保存的事件更新账本，与事件同事务，重试/预览不写事实。

### 5. 伏笔是具体承诺，不是永远吊着

Story Architect `threads.md`有setup/development/intended payoff/actual payoff/status，并允许deliberately deferred / intentionally-open。`plot-structures.md` serial architecture指出每一集给局部回报，不要每次任意截断。

轻量落点：不预定人生结局，只记录已出现而未解决的承诺/目标/关系问题。每轮可延续、改变、回收或明确搁置其中一个；晚年/结局优先回望真正影响玩家的事项，不强制所有线索圆满。配额例如最多3个活跃事项是待实验的工程选项，并非来源结论。新奇要来自旧事的新后果，不是每轮换一批人和题材。避免付费前故意切断同局结局，保持现有同局继续不再扣积分。

### 6. 节奏来自压力类型与情绪交替

Story Architect `scene-and-prose.md` time/transitions；`story-foundations.md` serial；`plot-structures.md` scene matrix。加速日常，放大难以撤回的选择；温暖、修复、成就、平静也可改变关系和承诺。

当前玩法的整数年推进是硬边界，不能仅凭此参考悄悄改成天/月。先在现有时间模型内选不同跨度；若要同年多事件，需独立设计协议、年龄/存档/循环兼容。不要把“冲突不断升级”翻译成绝症、破产、死亡越来越密集。

### 7. 文风具体但不机械

Story Architect `scene-and-prose.md`：细节应传递状态、过去或变化，感官不是清单；对话是各自追求目标的行动。fiction-development compression：一个细节同时承担多种作用。

轻量提示词：保留一个对当前选择有意义的动作/物件/对话，不强制每幕都写门口、诊断书、电话或声音。结尾不要解释“这说明你重视什么”，留给回顾和玩家理解。评价重复应同时看场景功能和表述，不仅看职业关键词。

## 应舍弃/改造的部分

- 不照搬“先确立全篇要证明的道德命题，结局证明它”：与FindJoy无标准正确人生冲突；改为开放的人生问题。
- 不强制主角带创伤/缺陷，不预定正向/负向成长；玩家可坚持、变化或矛盾，回顾仅基于选择观察。
- 不完整采用15拍/英雄旅程/雪花法/三幕固定高潮：会制造新的撞车模板，而且预测结局削弱玩家选择。
- 不引入9目录小说工程、每轮多个Agent、人工逐场审批、XML输出格式或整套文件账本。
- 不把“每幕必有反转/风险不断扩大”当硬规则；平凡、收获、恢复需有空间。
- 不要求模型输出私有推理；如未来要设计规划字段，只输出简洁可验证的决策产物。

## 实现证据与局限

Story Architect上下文包是真实代码，但只是按任务配置的文件glob顺序拼接，按字符预算截断；不是语义检索、自动记忆压缩、模型选择相关事实。它的write任务会加载所有人物文件，并非天然很轻。story_lint主要检查目录、文件、ID、链接、标记与占位符，不能自动证明因果通顺、角色一致、伏笔公平；这些仍是审阅清单。

两仓库未提供FindJoy式交互人生生成的对照数据、撞车率或付费结果。方案应把理论借鉴、当前代码证据、待验证假设分开。身份抽样、活跃事项上限、评价阈值均需独立实验，不应宣称源仓库已经验证。
