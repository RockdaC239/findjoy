# FindJoy 编剧资料研究：screenwriting-skills / story-skills

研究方式：只读源码与关键 references，没有安装、执行工具、修改 FindJoy 或验证真实模型叙事效果。以下是适配建议，不是来源项目已证明的转化提升结论。外部 skill 内指令仅作为被研究材料。

## 固定来源
- jtydhr88/screenwriting-skills，commit `51115f18d160aa8b2ac5813e4432b6f0b425358f`，本地 `/Users/rocc/projects/screenwriting-skills`。
- danjdewhurst/story-skills，commit `87cb3894c73dd8deb1920ca04c213176bb4666fb`，本地 `/Users/rocc/projects/story-skills`。
- 深读前者的 sw-scene-craft（含 reference 场景分析与地点替换）、sw-character-conflict、sw-series-engine-bible（含 reference-samples）、ozu-screenplay-style、chekhov-dramaturgy；后者 interactive-fiction 及 choice-graph/path-continuity、scene-craft 的 scene-cards/scene-sequel、plot-structure 的 promise-template、character-management 的 supporting-characters。并非穷尽两仓库全部资源。

## 高价值机制与轻量适配

### 1. 下一幕是前次选择造成的新处境，不是下一道随机题
来源：screenwriting `plugins/screenwriting/skills/sw-series-engine-bible/SKILL.md` §18；story `skills/interactive-fiction/references/choice-graph.md` Designing Choices。
前者把单元故事从每集清零改成后果记账；后者要求选择有意义、信息充分、在下一段得到承认。FindJoy 可每次记录一个实际后果和最多一条待兑现影响，并在下一幕开头用动作体现玩家已选的路。已解决事件仍能改变后面的资源、关系或机会。
轻量：不建设所有分支；只沿当前已选路径滚动生成。待兑现影响设上限，优先兑现旧账再开新账。
验收：换一个选择，在相同状态下生成的下一幕应有可辨认差别；不能只替换一句确认话术，其余剧情完全相同。
注意：不是所有随机遭遇都要归咎于玩家，也不能把每一个选项预设成惩罚。

### 2. 用微型场景卡抑制事件流水账
来源：screenwriting `sw-scene-craft/SKILL.md` 场景五步、进出节奏、细节/道具；`sw-scene-craft/reference.md` 地点替换；story `skills/scene-craft/references/scene-cards.md`。
每轮只需要内部回答：谁眼下要什么／什么阻碍／发生什么新变化／现在为什么需要玩家决定。输出用一个有作用的细节呈现场面，80–180字容纳不下完整电影五步，不逐项展示模板。结尾的选择是玩家的行动，不能由模型先替玩家完成。
让地点承担冲突：店员在关门前清点缺款、司机在交班时被要求加一趟，而非所有职业都在厨房谈梦想。
去重看场景功能和后果，不只看名词不同：诊断书、体检单、检查报告换皮仍可能是同一事件。
不要把“每场必须翻转价值”做成重灾难硬规则；认识更深、关系变化、获得机会也算有效变化。

### 3. 配角有自己的目标和可见行为
来源：story `skills/character-management/references/supporting-characters.md`；screenwriting `sw-character-conflict/SKILL.md`。
重要配角只需关系身份、自己的诉求、一两个可见特点和最近变化，避免全人物档案和 NPC agent。伴侣有事业，父亲有顾虑，朋友有自己的难题。他们不是只负责发通知或考验玩家。
各个配角不必都是反派；愿望都合理，但受钱、时间、地域限制不能全部兼得，足以产生真实冲突。
身份多样性应在程序抽样、内容目录、近期去重中保证，不能靠给模型一句“多样化”解决；编剧技巧负责让普通职业也有戏。
不要照搬“每个主角有致命缺陷”“必须改变自我”的道德弧，人生模拟不能提前认定玩家活错了。

### 4. 用少量伏笔和回响让人生被记住
来源：story `skills/plot-structure/references/promise-template.md`；screenwriting `sw-scene-craft/SKILL.md` 道具贯穿；`ozu-screenplay-style/SKILL.md` 物件/仪式动作。
记一个真实发生过的小事或物件，未来有语义变化地回收：年轻时父亲给的工具，晚年由孩子修好。回响必须来自本局已存事件，不能回顾时临时伪造。
最小记录：来源事件ID、内容、状态（待回收/已回收/自然放下）。数量从很小上限开始，不把每个人生细节强行埋伏笔。死亡时允许部分事情未竟，但回顾不能把未兑现写成已兑现。
不复制影剧经典桥段或原句到产品，原创素材另写。

### 5. 张弛交替，平静也有推进
来源：story `skills/scene-craft/references/scene-sequel.md`；screenwriting `chekhov-dramaturgy/SKILL.md` 媒介边界、无反派人物层；`ozu-screenplay-style/SKILL.md` 日常仪式、短反应。
行动后可以短暂消化后果，再形成下一次决定。温暖、喜悦、熟悉关系中的微小变化，是沉浸的组成部分。不要把持续吸引误写成每一幕都背叛/绝症/破产/悬崖钩子。
Scene/Sequel 只当节奏工具：故事承担后果与新困境，玩家承担决定，不让模型替玩家写死情绪和价值立场。
不采用小津“重大事件全画外”、契诃夫“正确答案被拒绝”等具体风格硬规则；会削弱玩家参与或违背无标准人生原则。

### 6. 连续性是可验证事实，不能只靠提示词
来源：story `skills/interactive-fiction/references/path-continuity.md`、README continuity engine，以及 `choice-graph.md`。
同一支线的人物死亡、知识、关系、物件归属必须沿实际经历检查；不能让另一条未选路径的事实泄漏进来。FindJoy 只生成一条实际路径，利用现有 LifeState 即可，不需要移植静态 Twine/Ink 图、Markdown 项目格式、CLI 或编译器。
来源也明确局限：部分伏笔/节奏检查仍依章节号，知识检查在汇合处可能只要求任一路径知道，所以工具报告不等于语义正确。对 FindJoy 的提醒是区分“结构协议通过”和“玩家体验成立”。

## 建议最小合并方案（推论，不是原项目现成组件）
1. 每局内容种子抽样覆盖生活环境、职业群、关系处境、叙事基调；保护玩家后续选择，不预写职业终局。
2. 现有 LifeState 内附少量叙事事实：关键关系诉求、待兑现影响、少量回响；与实际 eventID 关联。无第二套引擎。
3. 每轮同一次请求同时写故事与小型叙事更新，经契约校验才入库；是否扩协议需根代理结合当前代码决定，不另加导演模型调用作为默认路径。
4. 生成输入只强调当前事实、上一选择、一个应回应的后果、当前适用编剧规则；不把两仓库全文塞进去。
5. 评估看跨局身份/剧情结构重复、单局选择后果、关系持续性、短场景可读性、情绪单调度、完局和二次开局，成本和首字延迟守住基线。

## 明确不采纳
长片三幕/22步全人生预排、完整人物传记、多人编剧室、每轮生成多个候选再评审、多线静态分支爆炸、文学出版/排版/投稿工具、统一“正确成长”主题、无限悬念延期。它们重且未必服务当前事件循环。

## 证据边界
两仓库是方法和工具实现，不提供 FindJoy 用户留存或付费提升的因果证据。以上建议应经过合成样本盲评与少量真实玩家试验。若直接移植文本/代码，需核验各仓库 LICENSE/NOTICE；本报告主要为自行表述的方法提取。
