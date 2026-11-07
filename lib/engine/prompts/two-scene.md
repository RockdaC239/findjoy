## 一次生成，两幕经历
只返回一个 JSON 对象。narration 是已经发生的经历，story 是下一次尚待玩家回应的具体处境。先写 narration，再写 story，不重复整段讲述。
有已选行动时，narration 先让它落地：别人怎么接招，事情走到哪一步，玩家得到了什么、付出了什么。结果可以好、可以坏、可以好坏参半，也可以出乎意料，但必须看得见，不能只复述“你选择了……”。未选分支不成为事实，不能替玩家作新的重要决定；走到取舍处停下来交给 story 与 choices。
narration 停下来的地方，事情正好压到玩家面前。story 也是一个正在发生的场面，不是情况说明：谁在场、说了什么、要你做什么、什么时候答复；不重复 narration 已经讲过的内容。把代价摆到桌面上（按前面的锚点），不要只写“要你去看看”“有空聊聊”这种没有成本的要求。
跨年时用一两句压缩不重要的时间，再落进一个具体场面；不逐年列总结。前轮投入与约定应适时兑现、变化或结清，不无限积累悬念。

## 一轮只写一个场面
【一轮只写一个场面】timePassed 是这几年发生的事，不是要逐年交代的清单。先决定这一轮玩家要在什么事情上做选择，再倒推这件事怎么一步步走到他面前。narration 只写其中最关键的一两个时刻，其余年份用一句话带过，或者干脆不写。时间跨度决定发生多少事，不决定写多少字。
每个场面的四问、人物自己的算盘和选择的代价，按前面的通用要求写；这一段只负责把“这一轮”收成一场戏，不铺开写年表。

## 本轮篇幅
【篇幅】narration 一到两个自然段，合计 120～200 字；要结清旧事或跨度很大时可到 220 字，超过就删。story 50～100 字。每个选项 5～18 字。童年开篇另有篇幅要求。

## 时间与开局
【时间】普通/主题首轮 timePassed=15：一次讲到 15 岁并给出第一个决策，不逐年交代，不预定职业、人格、婚姻或价值观；若合理早逝，可以提前终止。剧本/ForU 首轮 timePassed=0，只写所给起点，不补演童年。
之后普通/主题 timePassed 为 0～8 的整数，剧本/ForU 为 0～5。0 表示同龄内的下一步，不强制跨年。讲述发生在当前年龄到落地年龄之间，story 的处境发生在落地年龄；不要把讲述里的每个年龄都写成终点年龄。时代按本轮提供的时代背景写，不自行另设年代。
跨度要配得上变化：没事情发生就少跨几年，有结果没交代就先落地。不为凑人生进度赶着毕业、结婚、退休。生命终点自然收束，不留等玩家操作的悬念。

## 输出契约
【输出】只返回一个 JSON 对象，不要 Markdown、解释或思考过程。narration必须非空。outcome 只能是 continue 或 death。
continue：story 非空；choices 为 3 项，每项有唯一 id 和非空 text。
death：narration 写最终结果与终点，story 必须为空字符串，choices 必须为空数组，deathCause 为 natural/disease/accident/other。死亡写得具体、安静，不血腥、不升华，可以留下没办完的事。
event.type 只用 career/relationship/health/finance/random/family；title 写这一轮真正发生的事或必须做的决定，最好带动作，不要只写一个物件或名词（“一个消息”不算事件，“他半夜来敲门”才算）；不要“人生转折”“成长的代价”这种标签，也不要提前泄露选择的结果；importance 为 0～1。
memory 一句话记下这一轮真正改变了什么，不写感悟。
字段与顺序如下（只演示格式，不要照抄内容）：
{{twoSceneFormat}}

## 状态与叙事记忆更新
objectiveChanges只记录这一幕已经成立的事实：city/education为新值；fatherStatus、motherStatus分别记录父母状态；children、friends、conditions为完整字符串数组快照，仅有变化时给出；不输出未知或猜测。已有收入/职业是新值，cash/assets/debt/physical沿用增量规则。已故人物只能作为回忆出现。
可在memory之后输出narrative，只写实际变化，不复制全量档案。direction为{content,sourceEventId}，表示由实际选择形成的当前方向；people最多4项，每项{id,relation,want,sharedMemory,sourceEventId,status:"active"或"inactive"}，用稳定英文ID区分称谓相同的人；threads最多3项，每项{id,content,status:"open"或"closed",sourceEventId}。sourceEventId必须引用输入中本局真实事件ID；本幕新成立的事实填"current"，保存时由程序替换。关闭已解决事项，人物不再活跃可标inactive，勿将未来计划写成既成事实。缺省字段保留历史记录；儿童不得被预定成年职业或人格。不在故事前输出这些后台字段，不输出规划或推理。
这些字段也要具体：people 的 want 是这个人当下想要的一件具体事，不写“希望家庭幸福”；sharedMemory 写你们之间真实发生过的一件小事；threads 写还没了结的承诺、期限、债务或威胁，不写“关系发展”这种空话；direction 写正在成形的去处，不写性格评语。
旧转录缺少narrative属于旧格式，继续依据已保存状态，不要求改写历史。state.narrative或user.narrative是当前活跃记录，历史中已关闭的事项不能当成仍未解决。

## 客观变更格式示例
objectiveChanges字段必须平铺，例如{"occupation":"社区机构前台","incomeYearly":60000,"education":"高中毕业"}，不要在其内嵌套career/basic/finance。此例仅演示字段，不预设职业或学历。故事发生就业、升学或退休时，同步更新相应字段。成年教育若没有事实依据，写“教育经历未详”，不沿用婴儿阶段“未开始”，不凭空补文凭。
