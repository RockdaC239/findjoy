# 提示词分层设计

2026-11-07。本文说明 FindJoy 模型提示词的分层、组装顺序、时代设定位置，以及修改时应该改哪一层。

## 为什么分层

旧结构里 `two-scene.md` 同时承担四类职责：

1. 通用写作观与文风；
2. 场面、人物、对白、选择技法；
3. 每轮事件协议（`narration`/`story`、时间、死亡、JSON、状态更新）；
4. 部分年代与开篇要求。

`opening.md` 又重复了写法、代价、选项和年代。结果是同一条规则要在两三个文件里各改一遍，容易漂移；协议变化也会牵动写作规则。

分层后，每个文件只回答一个问题：

- 怎么写：`craft.md`
- 这一轮输出什么：`two-scene.md`
- 开局怎么写：`opening.md`
- 故事发生在什么年代：`era.json` 或剧本目录
- 这一局这一家是谁：`birth.json` / `background.json`
- 模式差异：`modes.json`
- 每轮动态提醒：`turn.json` / `assembly.json` / `storyline.json`

## 层与文件

| 层 | 文件 | 回答的问题 | 生效范围 |
| --- | --- | --- | --- |
| 通用叙事 | `craft.md` | 怎么写得清楚、有戏、有人物、有代价 | v3 全部事件与开篇 |
| 事件协议 | `two-scene.md` | 这一轮 `narration`/`story` 怎么分工，时间、死亡、JSON、状态怎么处理 | v3 全部事件 |
| 开篇 overlay | `opening.md` | 普通/主题开局的两个念头、五件事、篇幅与第一个选择（不再固定四段） | v3 普通/主题开局 |
| 开局方向 | `opening-plan.json` | 本局的主要关系、推动力、故事机制、代价类型，以及最近几局用过的组合 | v3 普通模式开局或开篇恢复 |
| 回顾 | `ending.md` | 一生结束后怎么回望、怎么取证据、怎么给分享句 | 回顾 |
| 默认时代 | `era.json` | 普通/主题/ForU 的时代质感与禁用旧物 | 普通/主题（含 v2 兼容）；v3 ForU |
| 剧本时代 | `mode-catalog.json` | 每个剧本自己的年代、地点、技术边界 | 剧本 |
| 出身事实 | `birth.json` | 这一家的地点、父母、住房、资源、年龄边界 | 普通/主题 |
| 出身基调 | `background.json` | 这一局从哪里开始（温暖、机会、变故、平凡） | 普通/主题开局 |
| 模式 | `modes.json` | 主题、剧本、ForU 的事件、开场和回顾差异 | 对应模式 |
| 张力和阶段 | `assembly.json` | 张力轮换、成年过渡、未完成开篇恢复 | 按条件追加 |
| 每轮任务 | `turn.json` | 本轮节奏、优先级、连续性、寿命、回顾证据、重试 | 每轮 user 消息 |
| 防重 | `storyline.json` | 跨局/单局题材防重与近期处境 | 普通人生 |
| 格式示例 | `examples.json` | 输出 JSON 的字段与顺序 | v2/v3 协议示例 |

## 组装顺序

`lib/engine/prompts/assemble.ts` 的 `buildSystemPrompt` 负责拼接。顺序遵循“稳定在前、易变在后”：

```text
基础层
  v3：craft.md + two-scene.md
  v2：adult.md 或 childhood.md（旧人生兼容，不继承 craft）

追加层
  1. era.json（仅普通/主题，以及 v3 ForU）
  2. 出生事实（birth.json）与出身基调（background.json）
  3. 模式情境（modes.json / 剧本 directive）
  4. 主题提醒（theme mode）
  5. 张力轮换（assembly.axisHint）
  6. 防重与近期处境（storyline.json）
  7. 旧版开场/过渡（仅 v2）
  8. 开篇 overlay（opening.md，仅 v3 普通/主题开局或恢复）
  9. 开局方向（opening-plan.json，仅 v3 普通模式开局或恢复；主题/剧本/ForU 不注入）
  10. 未完成开篇恢复（v3 recoveryHint）
```

### 四种玩法

| 场景 | 实际组成 |
| --- | --- |
| 普通/主题开局 | `craft + two-scene + era + birth + tone + opening`（普通再加 opening-plan） |
| 普通/主题后续 | `craft + two-scene + era + birth + tone + axis/storyline` |
| 剧本 | `craft + two-scene + scenario.directive`（年代在 directive 内，不再加默认 era） |
| ForU | `craft + two-scene + era + foruScenario`（v2 ForU 保持旧行为，不加 era） |
| 回顾 | `ending + scenarioReview + evidenceRule`（不继承 craft/era） |
| v2 旧人生 | `adult/childhood + era（普通/主题）+ birth/tone + 动态片段`，不继承 craft |

## 年代设定放在哪里

年代不是一个文件，而是两种不同来源：

1. **默认当代**：普通、主题（含 v2 兼容）以及 v3 ForU 使用 `era.json` 的 `contemporary`。当前是“2020 年代的生活质感”，不写具体年份，也不写出生年；人物变老时社会细节保持当代，不按年份倒推成八九十年代。
2. **剧本年代**：剧本是有作者设定的年代（1980s、1990s、民国等），来源是 `mode-catalog.json` 的 `SCRIPT_ERAS` 和 `SCRIPTS`，通过 `scriptSnapshot` 注入 `eraLabel`、`eraYears`、`eraSetting`。剧本**不使用** `era.json`，否则 1980s 剧本会被 2020s 污染。

因此：

- 改默认年代质感：改 `era.json`。
- 改某个剧本的年代：改 `mode-catalog.json`。
- **不要**把年代写进 `craft.md`、`two-scene.md`、`opening.md` 或 `birth.json`。
- `birth.json` 只描述这一家的地点、父母、住房、资源；它的 `eraBoundary` 只保留“不自行另设年代”的边界，不承载时代正文。
- 如果以后要让不同人生落在不同年代，选中的 era key 应随人生保存（scenario 或 flags），不要每轮随机。

## 每层不该放什么

| 文件 | 不该放 |
| --- | --- |
| `craft.md` | 2020s、具体剧本年代、输出 JSON 字段、state 字段、模式硬规则、动态提醒 |
| `two-scene.md` | 开篇五件事、开篇 3～4 段结构、年代正文、模式专属规则 |
| `opening.md` | 通用文风全文、完整代价/选项规则、年代正文、输出协议 |
| `ending.md` | 场景卡、选择设计、下一幕叙事；回顾不是场景写作 |
| `era.json` | 人物、选择、剧情、具体剧本年代 |
| `birth.json` | 年代质感、通用写法、开篇结构 |
| `assembly.json` | 年代正文（已移到 `era.json`） |

## 具体场景问题必须抽象化

调试中遇到的具体场景（例如最近讨论的民办/公办选择）不能直接写进生产提示词。具体场景只用于定位“缺了哪条通用规则”，不能把场景里的机构、金额、人物关系、对白、标题示例搬进 `craft.md` / `two-scene.md` / `opening.md` / `era.json`。

正确顺序：

1. 先写清这次失败的现象，例如“选项没有代价”“读者感受不到民办和公办的差别”。
2. 抽象成可复用的规则，例如“代价要有锚点：具体数额或相对量、已经发生的动作、期限”。
3. 放进正确的层：写法进 `craft.md`，协议进 `two-scene.md`，开篇结构进 `opening.md`，年代进 `era.json`。
4. 例子必须跨领域、跨年代成立；需要多个短例时，至少覆盖两三个不同生活领域。
5. 具体场景样本放测试、审计或试玩文档，明确标注“样本，不是提示词”。

禁止：

- 把当前试玩那一场的原句、原人物、原金额、原标题写进提示词。
- 用 2020s 的学校、机构、政策做 `craft` 的例子；`craft` 也会进入 1980s 剧本，会造成年代错位。
- 用一个“刚修好的 bug”当通用示例，导致模型反复复制同一场景。
- 因为某个例子在最近一局有效，就把它放进所有模式共用的层。

检查问题：

- 这个例子是不是来自刚刚那一局？
- 它是否绑定某个年代、机构或人生阶段？
- 1980s 剧本或 ForU 成年人读到它会不会错位？
- 去掉这个例子，规则还说得清吗？如果说得清，就不要放例子。
- 如果必须举例，是否覆盖了两个以上不相关的领域？

## 选项数量

v3 新人生固定 3 个选项；v2 旧人生保留 2～3 的兼容。不要在 v3 的 `craft.md`、`two-scene.md`、`opening.md` 里写 2～3，也不要只改提示词而不改契约。

- 第三个必须是第三种真实行动和第三种代价，不能是折中、拖延或“再沟通”。
- `diagnoseGeneratedEvent` 对 v3 要求恰好 3 项；v2 仍允许 2～3。
- 改数量时同步检查：`craft`/`two-scene`/`opening`、`retry.json`、v3 测试样本、`mock-life`、预览样例。
- v2 的 `adult.md`、`assembly.transitionHint`、`modes.opening` 仍写 2～3，是旧人生兼容，不是新体验标准。

## 修改指南

按“先找层，再改文件”的顺序：

- 文字太平、太文学、对白不活、选择不疼 → `craft.md`
- 每轮字数、`narration`/`story` 分工、时间跨度、死亡、JSON、state → `two-scene.md`
- 开篇五件事、两个念头、3～4 段结构、第一个选择 → `opening.md`
- 默认 2020s 时代质感、旧物禁用 → `era.json`
- 剧本年代与时代细节 → `mode-catalog.json`
- 家庭事实、年龄、父母状态、开局场景候选 → `birth.json`
- 家境、结构、开局基调 → `background.json`
- 主题/剧本/ForU 专属要求 → `modes.json`
- 张力轮换、成年过渡、开篇恢复 → `assembly.json`
- 每轮节奏、优先级、寿命、回顾证据 → `turn.json`
- 跨局/单局防重 → `storyline.json`
- 输出格式示例 → `examples.json`

## 前缀缓存与顺序

DeepSeek 按请求前缀命中缓存。当前顺序把同一局内稳定的内容放在前面（craft、two-scene、era、birth、tone），把逐轮变化的内容放在后面（axis、storyline、theme、recovery）。不要为了“读起来顺”把 `current_state`、`recent_decisions` 一类易变内容插到中间，否则会从那里切断可缓存前缀。

Markdown 在模块加载时读取；改完必须重启开发进程，预览命令才会反映新文本。

## 兼容与验证

- v3 新人生使用 `craft + two-scene`；v2 旧人生继续 `adult.md` / `childhood.md`，不继承 craft，避免半路变风格。v2 普通/主题的时代文本改由 `era.json` 提供，基础文本本身不变。
- 已有的人生不会被重写；新开人生才使用新分层。
- 剧本模式保留自身年代，不统一成 2020s。
- `prompt-baseline.json` 只覆盖 v2 childhood/adult 与 ending；改这三者时要重新生成基线。改 `craft.md`/`two-scene.md`/`opening.md`/`era.json` 不改变该基线。
- 全量测试中的 PostgreSQL 用例需要 `TEST_DATABASE_URL`；只跑提示词相关测试时可以指定文件。

常用验证：

```sh
npm run prompt:preview -- --mode normal --stage opening
npm run prompt:preview -- --mode normal --stage next
npm run prompt:preview -- --mode theme --theme family --stage next
npm run prompt:preview -- --mode script --script 1980s-factory-succession --stage next
npm run prompt:preview -- --mode foru --stage next
npm run prompt:preview -- --mode normal --stage ending

npx vitest run lib/engine lib/birth/profile.test.ts lib/model-adapter.test.ts lib/modes/scenario.test.ts lib/review.test.ts lib/narration-scene.test.ts
npm run typecheck
npm run lint
npm run build
```

## 当前迁移记录

2026-11-07：

- 新建 `craft.md`，承接原 `two-scene.md` 的通用写作、场面、人物、对白、选择、连续性、语气示例。
- `two-scene.md` 收敛为事件协议：`narration`/`story`、每轮一场、时间、死亡、JSON、状态更新。
- `opening.md` 收敛为开篇 overlay：两个念头、五件事、3～4 段结构、第一个选择；不再重复文风、代价、选项和年代。
- 新建 `era.json`，默认当代改为 2020s 生活质感；`assembly.json` 移除 `eraHint`；`birth.json` 不再承载年代正文；ForU 的年代表述移出 `modes.json`，由 era 层统一提供。
- v3 基础改为 `craft + two-scene`；v2 基础文本不变，普通/主题的时代文本改由 `era.json` 提供；剧本年代继续由 `mode-catalog.json` 提供。
