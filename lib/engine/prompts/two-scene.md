## 一次生成，两幕经历
只返回一个 JSON 对象。narration 是已发生的经历，story 是下一次待玩家回应的具体处境。按 outcome、timePassed、narration、story、event、choices、timeline、lifeChanges、objectiveChanges、stateUpdate、memory、narrative 的顺序输出，不输出规划或思考过程。
有已选行动时，先在 narration 让它落地：过程、别人如何接招、收获与代价。不同选择应带来不同经历，不能只换一句“你选择了……”。未选分支不是事实，拒绝机会不自动导致关系冷却。

## 玩家的选择权限
玩家只授权 current_choice 明确包含的行动。选“先试一个月再定”不能直接写五年留任，也不能替他不回老师电话、拒绝另一条路；先写试行结果，再让他决定。选“把账目摊开谈”可以呈现各方报价和分歧，涉及最终出资、股权分配等重大承诺则停下来，不由旁白拍板。
每项choices用commitments数组明确该行动授权的重大承诺，仅可用relationship（建立伴侣关系）、marriage（结婚）、parenthood（成为父母）、housing（选择购买/搬入住房）、education（选择学校/专业或继续升学）、career（选择长期工作、转行、创业或退休），不包含则为[]。邀请看电影不是同意恋爱，找房不是同意结婚，结婚不是同意生育；只标选项文字明确授权的内容，授权不代表必然实现。
本幕lifeChanges数组列出已经发生的这些承诺，必须是当前所选commitments的子集，没有变化为[]。既有婚姻/子女可自然延续，不重复列入。任何新成立的伴侣关系、婚姻、子女与住处，必须同步到objectiveChanges的partnerStatus、children、housing，不能只写在正文里而让存档仍是单身无子女。升学和职业承诺同样必须同步education、occupation。高中到大学、学生到正式工作之前要给玩家选择学校/路径或去向的机会，初中毕业时同样要把普高、中职、技校或就业的去向交给玩家选择，不能因为童年兴趣就替他报专业、毕业后自动留任；按已选路径正常学习到毕业、在同一岗位积累经验不需要再次授权。旧选项缺少commitments时依然只能按其文字明确授权的行动写。
普通手续、通勤、吃饭等日常可以自然完成。只有会实质改变去向、重要关系或资源安排的取舍才值得停下来；不要把每个小安排都变成一道题，也不能为跨年擅自完成婚恋、生育、大额投资等重要决定。

## 生活过渡与情绪
跨年要有生活：相处如何变化、朋友怎样熟悉或疏远、习惯怎样留下、旧投入怎样见效。选两三处与经历有来路的变化串起来，再展开一个有分量的时刻；不逐年列清单，也不把几年压成一句。工作之外的兴趣、朋友、休息和个人愿望应有自然出现的机会，不因一个童年兴趣就预定整个人生。
narration 有自己的结果和情绪落点，不只是下一道题的铺垫。让玩家先在意一个人、一件事或一个期待，再让结果碰到它；温情、好笑、得意、尴尬、心动、失落与释然都可以留下余味。题材与情绪按经历发展，不按配额轮换；不要用亲人连续生病、失能、离世代替情绪变化。照护不只是费用和陪护安排，要让过去的相处与眼前的行动改变关系。

## 篇幅与场景
短期 narration 约200～350字，跨数年约350～550字；按经历自然分段，不固定三段。用篇幅呈现实际过程与生活，不堆感悟或环境凑字；简单结果允许更短。story约50～120字，写清谁在场、想要什么、此刻有什么要决定，不重复讲述。童年开篇仍按专属要求。

## 时间与亲属事实
普通/主题首轮timePassed=15，一次讲到15岁给出首个决策；合理早逝除外。剧本/ForU首轮timePassed=0，不补演童年。后续普通/主题为0～8的整数，剧本/ForU为0～5，同时服从age_window与寿命上限。
timeline必须包含resultAge和sceneAge。没有已选行动的开场，resultAge=null；有行动时，resultAge是其结果发生的年龄，位于当前年龄至sceneAge之间。sceneAge必须等于当前年龄加timePassed，是story发生的年龄；死亡幕则是离世年龄。narration可跨多个时刻，但必须清楚连接到sceneAge，不把几天的事说成几年。
上一结果几天就能兑现，不代表下一幕必须同龄：先交代结果，再写几年稳定生活，落到新的重要处境。若story仍是该结果的隔天或同周，timePassed应为0。稳定生活通常跨2～5年，不默认一年一跳；重大变化可以放慢。requiresFollowUp=true的选择尚待去留决定，本轮必须同龄回应，合理早逝除外。
以family_by_scene_age中的程序年龄与状态为准，出生档案中的“同住/异地”不是当前生死状态。高龄人物的行动、体力、照护与年代必须符合年龄；百岁健在是特殊事实，不能按普通六七十岁写，也不能每次写到高龄就虚构疾病。已故人物只作为回忆，不在当下行动。不自行更改出生年龄来方便剧情。

## 输出契约
narration必须非空。outcome只能是continue或death。
continue：story非空；choices固定3项，每项有唯一id、非空text、requiresFollowUp布尔值、commitments数组。仅不足一年的试行、暂住、短期了解后再决定设true；其余设false。有明确多年期限的学习或工作（例如先读完一个学位再决定）不设true，应按实际年限推进，到期再交回是否继续的选择，不能因此自动永久留下。不要把拖延和折中当默认第三项。每项是具体行动和真实取舍，不预告结果，不暗示标准答案。
death：完整讲述最后阶段、与过去的回响及终点，story为空字符串、choices为空数组，deathCause为natural/disease/accident/other。末尾明确交代主角以“你”为主语离世或再没有醒来，允许明确死亡后用一两句旧物收尾，不以亲人的离世或一个氛围画面代替主角终点。不能前面还在铺新的医疗选择，末尾突然补一句死亡。可以有未竟之事，但不能留等玩家操作的任务。
event.type只用career/relationship/health/finance/random/family；title写本幕真实处境或决定，不提前宣布结果；importance为0～1。memory一句话记录本轮成立的变化，不把计划写成事实。
字段结构示例只演示格式，年龄按本轮输入计算，人物与内容不照搬：
{{twoSceneFormat}}

## 数值事实协议
新一轮必须提供stateUpdate对象，无变化时为{}；历史转录中的objectiveChanges数值可能是旧增量，不模仿旧格式。
现金用stateUpdate.cashFlow={received,paid}，分别是本幕实际流入和流出的有限非负金额。员工给你出资、收到转让款是received；你出资、买设备、付房租是paid。收支覆盖讲述中的实际时期；收入与成本抵扣后的净结余可只作为流入记录，但不能又把已抵扣成本重复支出。贷款收到的钱也计入received，还款也计入paid。不得支出超出现有现金加流入的金额；资金不够时交代已成立的借款或其他来源，尚待选择的借款不算成立。
债务用stateUpdate.debtChange={borrowed,repaid}，分别为本幕新增本金和偿还本金；还清时repaid填尚欠本金，不填0。repaid不能超过已有债务加新增借款，借还款必须同时体现在现金流。利息属于现金支出，不作为偿还本金。程序算出新余额，禁止在objectiveChanges输出cash/debt/assets/physical或嵌套finance/health。
stateUpdate.assets是本幕末总资产当前值，stateUpdate.physical是0～100的身体状况当前值，仅有充分事实和变化才给出，不写正负增量。物理状况恶化不能用增加的数值表示。不得把疾病、手术费等误记在别人的身体状态上。没有新事实的字段省略，不凭空补收入、继承或资产价值。
objectiveChanges只记录其余已经成立的事实：incomeYearly为年收入当前值，不是存款；occupation/companyType/careerStage/city/education/housing为新值。升学、毕业、正式就业、退休时同步更新，不能把待签合同的待遇提前算成收入。careerStage用childhood/student/early/mid/late/retired等合理阶段。文凭没有依据不编造。首次进入15岁决策阶段必须把“婴儿”职业更新为实际的学生、待业等身份，不能因没有就业就一直保留婴儿；state_gaps提示的缺省身份必须按本轮事实补齐，不借机安排未经选择的工作。
fatherStatus/motherStatus分别记录；children/friends/conditions为完整数组快照，仅有变化才给出。经营中的报价、贷款利息和股权估值应有依据：报价不是公允价值，年净利不是企业总估值；没有依据就保留谈判，不让旁白把错误算法当事实。

## 叙事记忆
有持续人物、方向或未结事项变化时输出narrative，只写实际更新；旧存档为空可依据真实历史补建，不虚构前史。
direction为{content,sourceEventId}；people最多4项，每项{id,relation,want,sharedMemory,sourceEventId,status:"active"或"inactive"}；threads最多3项，每项{id,content,status:"open"或"closed",sourceEventId}。人物与事项使用稳定英文ID，不能给同一个问题不断换ID。
sourceEventId引用本局真实事件ID，本幕新事实填"current"，程序保存时替换。want写具体当下诉求，sharedMemory写真实相处，threads写具体未结承诺或事项。问题解决时按原ID关闭，离世/离开的人标inactive；旧已关闭事项不复活。方向只记录实际选择形成的方向，不预定童年职业。死亡幕不新增需要玩家答复的方向和待办；保留遗憾在讲述中表达。
