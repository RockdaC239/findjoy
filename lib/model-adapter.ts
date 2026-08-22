import type { LifeState, LifeChoice, LifeEvent, NextEvent, ModelUsage, LifeEnding } from "./life";
import { getProvider, resolveProviderModel } from "./provider-catalog";
import { buildBackgroundDirective, flagsToBackground, type LifeBackground } from "./background";
import { DEATH_CAUSE_LABEL } from "./life";

const SYSTEM_PROMPT = `你不是奖励玩家成功的游戏系统。模拟真实、复杂、不确定的人生，不定义幸福。全程只用第二人称“你”称呼玩家。禁止出现任何人物姓名、昵称、英文名、姓名占位符；其他人物只能使用关系或角色称谓，例如父亲、母亲、同学、伴侣、老师、邻居。

玩家性别以每轮状态里的 gender 字段为准（female=女性，male=男性），必须在整局人生中保持不变：叙述里“你”相关的称谓与视角要一直符合该性别，例如玩家为女性时，孩子应叫你“妈妈”、孙辈叫你“外婆/奶奶”，不能被写成“爸爸/爷爷”；不要中途改变性别或让亲属称谓与性别矛盾。

人生推演节奏：这不是娓娓道来的小说，而是一次浓缩的人生。时间可以大幅跳跃（每次 1~8 年，童年也可以一次跳过数年）。每一个事件都必须是人生节点级别的重要事件——转折、变故、机会、失去、关系变化、关键决定；不要写日常琐事或流水账。每一段现状都要说得准、说得透。

开局第一个事件更要重要：必须从至少 4 岁写起（timePassed 硬约束 4~7，绝对不要在 0/1/2/3 岁写开局），直接反映那个年龄阶段最重要的节点，让玩家一开局就面临第一个有分量的抉择。重要不等于惨：一个安稳家庭里孩子第一次为自己争取什么、一次天赋被发现，同样有分量。本局固定的"出身档案"指令（家庭经济/家庭结构/开局事件基调/天赋）会随本提示词给出，照指令写开局即可；不要默认写家庭变故或亲人患病。

只返回一个 JSON 对象，不要 Markdown 代码块，不要任何额外文字或解释。必须严格使用下面的 camelCase 字段，并按此顺序输出（story 在前、event 在后）：
{"timePassed":3,"story":"...","event":{"type":"family","title":"...","importance":0.8},"choices":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."}],"objectiveChanges":{},"memory":"..."}
示例（只演示格式与语气，不要照抄内容）：
{"timePassed":3,"story":"你二十岁，和两个朋友合伙开了一间小设计工作室。半年过去，朋友想接来钱快的商业单，你想做能拿奖的原创作品。会议室里，三个人第一次吵红了脸。","event":{"type":"career","title":"商业单还是原创","importance":0.8},"choices":[{"id":"A","text":"按数据说话，先接商业单养活工作室"},{"id":"B","text":"坚持做原创，哪怕前两年不赚钱"},{"id":"C","text":"一半一半：商业单养家，原创养梦"}],"objectiveChanges":{},"memory":"那晚散会后，你在工作室画了一夜草图。"}
字段含义：
- story：此刻正在发生的一幕真实人生（80 至 180 字）。**story 的时间必须落在本节点年龄（timePassed 推进之后），第一句以"你Y岁"开头，Y 必须等于当前年龄 + timePassed**：例如当前 30 岁、timePassed 5，就写"你三十五岁……"，绝对不要写三十岁或更早的年龄。要写一个具体的场景：谁在你面前、说了什么话、房间里有什么声音、你手上正拿着什么——让玩家像亲眼看到一样，感受到这个决定正压在自己身上。不要写成简历式总结或新闻标题，不要只报状态（"你事业稳定、家庭和睦"），要落到正在发生的事和即将做出的选择上。展示顺序在最前。
- event：把 story 里正在发生的这件事凝成一句话标题；title 必须是事件本身（如"父亲把诊断书放在桌上"），而不是抽象的概括词（如"家庭危机""人生转折"），展示在 story 之后。
- event.type 只能是英文枚举值之一：career、relationship、health、finance、random、family（不要使用中文或其它单词）。
- choices：这个事件带来的 2 至 3 个真正不同且合理的关键抉择，每项必须包含 id 和 text。
  **硬约束：三个选项之间必须有清晰的价值张力，每个选项必须代表一种不同的人生价值或方向**（例如放弃/坚持、个人/家庭、安稳/冒险、服从/反叛、理性/感性、短利/长利、逃避/面对、向内/向外等），不能是同一种态度的不同措辞（例如不能三个都是"接受/适应/顺其自然"）。选 A、选 B、选 C，必须让你的人生走向不同分支；如果三个选项读起来意思接近，说明你写错了。
  价值张力的方向要多样化：除了"离开/留下、个人/家庭、安稳/冒险"，还可以是"理性/感性、服从/反叛、短利/长利、向内/向外、守成/创新、独行/合作、名声/自由、合群/独立、逃避/面对"等；不要每次都是"冲出去/留下来/折中"这一套模板。
  **张力轴轮换硬约束：本次事件的张力轴必须与上一个事件的张力轴不同。** 上一条事件的选项用的是什么价值轴，这一条就换一条别的轴。例如上一条是"追梦/顾家、闯荡/安稳"，这一条就改写成"理性/感性"（如：按数据和利弊判断 vs 凭直觉和热爱 vs 先不表态再想想）、"名声/自由"（如：要名气和认可 vs 要自在随心 vs 两者都想要一点）、"守成/创新"（如：维持现状 vs 大胆变革 vs 小步试水）、"独行/合作"、"服从/反叛"、"短利/长利"、"逃避/面对"等。同一局内相邻两个节点绝不能用同一条价值轴；连续两三个节点都出现"闯出去/留守/折中"这类三件套，说明你没有换轴。
  写法建议：选项文本里直接点出你要表达的价值立场（如"为了撑住这个家，..."、"我不想被这件事拖住，..."、"找专业的人来帮忙，比我自己扛更靠谱..."），让玩家一眼看出区别。
  **连续性硬约束**：事件必须随时间和玩家的选择推进。严禁原样或近乎原样地复述上一条事件的故事、标题或选项——即使玩家选择了"维持现状、顺其自然"，也要写出新的处境、新的变化和新的选项；连续两个节点绝不能是同一个事件。
   **去模板化硬约束**：人生路径必须多样、自然，不得对任何剧本有偏向。职业不要集中在运动员、艺术家、创业者、医生等少数"有故事感"的模板上——程序员、教师、工人、司机、店员、小生意、自由职业、体制内……任何职业都能承载重要的人生节点。出身档案里的天赋（艺术/运动/学业/社交/动手）只是性格底色与爱好，**不等于职业方向**：有艺术天赋的人可以一生与艺术无关，有运动天赋的人也可以只把它当业余爱好，没有天赋标签的人同样可以学音乐、画画、练体育。不要因为档案里写了天赋，就自动把人生写成"体育生/艺术生/学霸"的剧本；同类剧本连续出现（上一局刚写过运动员，这一局又写运动员）更要避免。
  人生阶段要均衡：工作、家庭、健康、关系、情感都要有机会出现，不要从头到尾只写事业打拼。尤其是感情线：恋爱、婚姻、伴侣、亲密关系是人生的重要部分，应当自然而然地出现并发展——可以是学生时代的初恋、青年时的相遇、中年时的陪伴或晚年的相守。不要总是让玩家一直单身、迟迟不婚或永远只谈事业；也不必强行圆满，一段真实的感情可以有遗憾，但要有发生、有推进、有温度。婚姻的时点可以多样（有人早婚、有人晚婚、有人不婚），关键是有真实的关系与情感线索贯穿人生，而不是全程回避。
- objectiveChanges：本次事件造成的客观变化，可为空对象。
- memory：一句话浓缩这次事件。`;

export const CHILDHOOD_SYSTEM_PROMPT = `你不是奖励玩家成功的游戏系统。模拟真实、复杂、不确定的人生，不定义幸福。全程只用第二人称“你”称呼玩家。禁止出现任何人物姓名、昵称、英文名、姓名占位符；其他人物只能使用关系或角色称谓，例如父亲、母亲、同学、伴侣、老师、邻居。

你正处在童年阶段（15 岁以下）。这个阶段的孩子无法决定人生走向：家庭变故、迁徙、升学、经济状况都由命运和大人的决定塑造。因此绝对不要生成任何 choices（选择），只推进命运本身。人生会自然过渡到成年后的自主选择阶段。

只返回一个 JSON 对象，不要 Markdown 代码块，不要任何额外文字或解释。必须严格使用下面的 camelCase 字段（注意：没有 choices 字段），并按此顺序输出（story 在前、event 在后）：
{"timePassed":5,"story":"...","event":{"type":"family","title":"...","importance":0.8},"objectiveChanges":{},"memory":"..."}
示例（只演示格式与语气，不要照抄内容）：
{"timePassed":5,"story":"你九岁，升入三年级。搬家后你转学到了城东，班里一个扎马尾的女孩在课间递给你半块橡皮，你们成了同桌。","event":{"type":"random","title":"半块橡皮","importance":0.7},"objectiveChanges":{},"memory":"九岁那年，你第一次有了可以一起放学回家的朋友。"}
字段含义：
- story：这段童年里，你的人生现状精准速写（60 至 150 字）。**story 的时间落在这一跳结束后的年龄，第一句以"你Y岁"开头，Y = 当前年龄 + timePassed**：例如当前 10 岁、timePassed 4，就写"你十四岁……"，绝对不要写十岁或更早的年龄。只描述“命运把你带到了哪里、你长成了什么样”，不写任何选择。
- event：这段童年里发生的最重要的一件事（家庭变故、迁徙、入学、亲人生病、交到朋友、学会一件本领等），必须是重要节点；title 用一句话点题，展示在 story 之后。story 里必须写到"发生了什么事"（一次驻足、一次搬家、一场比赛、一句夸奖、一次离别……），不能只是氛围、心情或物件的描写（例如"门后那幅全家福"这种画面不是事件）；**连续性硬约束：严禁原样或近乎原样地复述上一条事件的故事、标题或内容——即使这段时间没有大事，也要写出新的细节、新的处境**；童年同样遵循本局"出身档案"：不是每一局的童年都要写变故或苦难，普通温暖的成长也有分量。
- event.type 只能是英文枚举值之一：career、relationship、health、finance、random、family（不要使用中文或其它单词）。
- timePassed：时间跳跃（建议 4~7 年，童年可以大幅跳跃），**落地年龄（当前年龄 + timePassed）必须小于 15 岁**，不要跳到 15 岁及以后；从 15 岁起进入成年决策阶段，届时会切换到另一套指令。
- objectiveChanges：这段童年造成的客观变化，可为空对象。
- memory：一句话浓缩这段童年。`;
const occupations = ["产品经理", "软件工程师", "教师", "设计师", "研究员"];
export const CHILDHOOD_BOUNDARY = 15;
export const MODEL_REQUEST_TIMEOUT_MS = 60_000;
export const MAX_MODEL_ATTEMPTS = 3;

// 童年节点落地后是否跨入成年（≥15 岁）。判定"该不该给选项"必须用落地年龄，
// 否则会出现"14 岁生成、落到 17 岁却仍是纯叙事节点"的边界错位（17 岁拿不到任何决策）。
export function crossesAdulthoodBoundary(stateAge: number, timePassed: number): boolean {
  return stateAge < CHILDHOOD_BOUNDARY && stateAge + Math.max(1, timePassed) >= CHILDHOOD_BOUNDARY;
}

// 出身档案：见 lib/background.ts。每局开局由 start 路由掷出四维出身并写入 flags，
// 这里把本局出身档案作为系统提示词的固定后缀；同一局内前缀字节稳定，不破坏 DeepSeek 上下文缓存。
// 旧存档（无出身档案）返回基础提示词。
// transitioning=true 表示"成年后的第一个决策节点"（14 岁迈入 15+），追加专属指令：
// 时间已过去、写落地年龄的你、严禁复述上一条童年事件——修"14 岁节点内容在 18 岁重生成"。
export function buildSystemPrompt(expectChoices: boolean, background?: LifeBackground, transitioning = false): string {
  const base = expectChoices ? SYSTEM_PROMPT : CHILDHOOD_SYSTEM_PROMPT;
  const profile = background ? `\n\n${buildBackgroundDirective(background)}` : "";
  if (!transitioning) return `${base}${profile}`;
  return `${base}${profile}\n\n【成年后的第一个决策节点】时间已经过去，你已长大到落地年龄（timePassed 之后的年龄）。写现在的你：新的处境、新的变化、新的细节；严禁复述上一条童年事件的故事或标题。必须给出 2~3 个方向真正不同、有具体立场的选项。`;
}

export class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelError";
  }
}

function logModelDiagnostic(context: string, fields: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test") return;
  const safe = { ...fields };
  if (typeof safe.raw === "string") safe.raw = safe.raw.slice(0, 800);
  console.warn(`[model-diagnostic] ${context} ${JSON.stringify(safe)}`);
}

function toModelError(error: unknown): ModelError {
  if (error instanceof ModelError) return error;
  if (error instanceof DOMException && error.name === "TimeoutError") return new ModelError("模型响应超时（超过 60 秒），请稍后重试或更换模型");
  return new ModelError(error instanceof Error ? `模型请求失败：${error.message}` : "模型请求失败");
}

export interface ModelConfig {
  providerId: string;
  apiKey: string;
  model: string;
}

interface ResolvedModelConfig extends ModelConfig {
  baseUrl: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}

type EnvConfig = Record<string, string | undefined>;

function finiteOrZero(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function resolveModelConfig(config?: Partial<ModelConfig>, env: EnvConfig = process.env): ResolvedModelConfig {
  const providerModel = config?.providerId ? resolveProviderModel(config.providerId, config.model) : undefined;
  const requestedModel = typeof config?.model === "string" && config.model.trim() ? config.model.trim() : undefined;
  // 生产固定模型与 Key：优先环境变量（LLM_MODEL=deepseek-v4-flash / LLM_API_KEY），
  // 忽略前端传入的 apiKey 与 model，避免用户绕过固定配置。
  const fixedModel = (env.LLM_MODEL || env.OPENAI_MODEL || "").trim();
  return {
    apiKey: (env.LLM_API_KEY || env.OPENAI_API_KEY || "").trim(),
    providerId: "environment",
    baseUrl: (env.LLM_BASE_URL || env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/$/, ""),
    model: fixedModel || requestedModel || providerModel?.model || "gpt-4o-mini",
    inputCostPerMillion: providerModel && requestedModel === providerModel.model ? providerModel.inputCostPerMillion : (providerModel ? 0 : finiteOrZero(env.LLM_INPUT_COST_PER_MILLION)),
    outputCostPerMillion: providerModel && requestedModel === providerModel.model ? providerModel.outputCostPerMillion : (providerModel ? 0 : finiteOrZero(env.LLM_OUTPUT_COST_PER_MILLION)),
  };
}

export function sanitizeModelConfig(value: unknown): Partial<ModelConfig> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const provider = typeof input.providerId === "string" ? getProvider(input.providerId) : undefined;
  const model = provider && typeof input.model === "string" && input.model.trim() ? input.model.trim().slice(0, 200) : provider?.models[0].id;
  return {
    providerId: provider?.id,
    apiKey: typeof input.apiKey === "string" ? input.apiKey.slice(0, 500) : undefined,
    model,
  };
}

function variationIndex(state: LifeState, count: number) {
  let hash = state.history.length + 17;
  for (const character of state.lifeId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % count;
}

export function createBirthBackground(state: LifeState) {
  const backgrounds = [
    "你来到一个普通的家庭。有人为你的到来忙碌，也有人在窗边默默看着你。此刻的世界还没有答案，只有漫长而未知的日子。",
    "你出生后的第一个夜晚很安静。家人围在身边，你尚未认识任何人，也尚未知道自己会怎样长大。",
    "你从一声啼哭开始进入这个世界。窗外的城市仍照常运转，而你的人生第一次有了自己的时间。",
    "你出生在一个平凡的清晨。有人把你轻轻抱起，从这一刻起，关系、环境和偶然都会慢慢塑造你。",
  ];
  return backgrounds[variationIndex(state, backgrounds.length)];
}

export function buildFallbackEvent(state: LifeState, choice?: LifeChoice): NextEvent {
  const age = state.basic.age;
  const openings = [
    { type: "family" as const, title: "你的童年开始了", story: "你还不能理解周围的声音，但你会在陪伴与日常中慢慢认识这个世界。", timePassed: 6 },
    { type: "family" as const, title: "一段安静的成长", story: "你在熟悉的屋檐下长大。许多看似微小的日常，正在成为你最早的记忆。", timePassed: 5 },
    { type: "family" as const, title: "你学会表达", story: "你开始用自己的方式回应世界。家人、玩具和窗外的声音，让每天都有新的发现。", timePassed: 6 },
    { type: "family" as const, title: "第一次离开熟悉的怀抱", story: "你开始走进更大的空间。陌生的面孔与新的规则，让你好奇，也让你有一点不安。", timePassed: 5 },
  ];
  const phase = age < 6
    ? openings[variationIndex(state, openings.length)]
    : age < 13
      ? { type: "family" as const, title: "一件只属于童年的事", story: "放学后的傍晚，你在熟悉的街道上发现了一件新鲜事。童年的世界有自己的秘密，也有第一次需要你做出的选择。", timePassed: 6 }
      : age < 18
        ? { type: "random" as const, title: "青春期的岔路", story: "你开始意识到，别人眼中的你和你心里的自己并不总是一样。一个看似微小的选择，可能改变你看待自己的方式。", timePassed: 5 }
        : age < 25
          ? { type: "career" as const, title: "离开熟悉的生活", story: "毕业在即，你第一次需要决定把时间交给哪一种生活。", timePassed: 2 }
          : age < 40
            ? { type: "relationship" as const, title: "一个需要回应的人", story: "一个重要的人向你提出了请求，你意识到继续沉默也是一种选择。", timePassed: 3 }
            : { type: "health" as const, title: "身体发来的提醒", story: "一次体检提醒你，过去习惯的生活方式正在留下痕迹。", timePassed: 3 };
  const objectiveChanges = age < 18 ? {} : phase.type === "career" ? { occupation: occupations[(age / 2) % occupations.length | 0], incomeYearly: 120000, cash: 20000 } : phase.type === "health" ? { physical: -8, cash: -5000 } : { partnerStatus: "稳定交往" };
  return { timePassed: phase.timePassed, story: choice ? `你选择了“${choice.text}”。生活没有给出即时答案，但一些方向开始改变。` : phase.story, event: { type: phase.type, title: phase.title, importance: 0.65 }, choices: [{ id: "A", text: "顺着眼前的变化慢慢适应" }, { id: "B", text: "在熟悉的节奏里再停留一会儿" }, { id: "C", text: "试着用自己的方式回应" }], objectiveChanges, psychologicalObservation: { uncertainty: "你似乎愿意为重要的人承担一些不确定性。" }, memory: `在${age}岁，你面对了${phase.title}。` };
}

function num(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }

// 只匹配明确的命名句式（名叫/名字叫/名字是/名为/叫作/叫做/姓名），
// 避免把“说出自己的名字”“报名字”这类自我介绍叙述误判为给人物起名，也避免“叫外卖”动词误杀。
function containsNameInstruction(value: string) {
  return /(?:名叫|名字叫|名字是|名为|叫作|叫做|姓名)[：:\s]*[\u4e00-\u9fffA-Za-z]{1,12}/u.test(value);
}

const EVENT_TYPES = ["career", "relationship", "health", "finance", "random", "family"] as const;

// 模型偶尔会用中文或同义词写 event.type（事业/家庭/健康…）。
// 对无歧义的别名做模糊映射，把"类型写错"从"整轮重试"降级为"自动纠正"；
// 完全未知的值仍严格失败，保持硬契约精神。
const EVENT_TYPE_ALIASES: Record<string, (typeof EVENT_TYPES)[number]> = {
  career: "career", 职业: "career", 事业: "career", 工作: "career", 学业: "career", 职场: "career", 求学: "career",
  relationship: "relationship", 关系: "relationship", 情感: "relationship", 爱情: "relationship", 感情: "relationship", 人际: "relationship", 婚恋: "relationship", 社交: "relationship", 友情: "relationship",
  family: "family", 家庭: "family", 家人: "family", 家族: "family", 亲情: "family",
  health: "health", 健康: "health", 身体: "health", 疾病: "health", 医疗: "health", 病痛: "health", 生病: "health",
  finance: "finance", 财务: "finance", 金钱: "finance", 经济: "finance", 财富: "finance", 收入: "finance", 资产: "finance", 债务: "finance",
  random: "random", 随机: "random", 意外: "random", 其他: "random", 其它: "random", 命运: "random", 无常: "random",
};

function normalizeEventType(value: unknown): (typeof EVENT_TYPES)[number] | undefined {
  if (typeof value !== "string") return undefined;
  const key = value.trim().toLowerCase();
  if ((EVENT_TYPES as readonly string[]).includes(key)) return key as (typeof EVENT_TYPES)[number];
  return EVENT_TYPE_ALIASES[key];
}

function normalizeChoiceId(id: string, fallback: string): string {
  const cleaned = id.trim().replace(/^(选项|option)\s*/i, "").toUpperCase();
  return /^[A-Z0-9]{1,3}$/.test(cleaned) ? cleaned : fallback;
}

function normalizeChoices(value: unknown): LifeChoice[] {
  const entries: Array<Record<string, unknown>> = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) entries.push({ text: item });
      else if (item && typeof item === "object") entries.push(item as Record<string, unknown>);
    }
  } else if (value && typeof value === "object") {
    // 兼容对象写法 {"A":"选项一","B":"选项二"}
    for (const [id, text] of Object.entries(value as Record<string, unknown>)) entries.push({ id, text });
  }
  // 修复常见的选项格式瑕疵（缺 id / text 用了 option、label / 纯字符串 / 选项A 这类 id），
  // 把"格式小错"从整轮重试降级为自动纠正；真正凑不出 2 个有效选项仍由契约把关。
  const letters = ["A", "B", "C", "D"];
  const used = new Set<string>();
  const choices: LifeChoice[] = [];
  for (const entry of entries) {
    const text = [entry.text, entry.option, entry.label].find((item): item is string => typeof item === "string" && Boolean(item.trim()))?.trim() ?? "";
    if (!text) continue;
    let id = typeof entry.id === "string" && entry.id.trim() ? normalizeChoiceId(entry.id, "") : "";
    if (!id || used.has(id)) {
      id = letters.find((letter) => !used.has(letter)) ?? `X${choices.length + 1}`;
    }
    used.add(id);
    choices.push({ id, text });
    if (choices.length >= 3) break;
  }
  return choices;
}

// 价值张力轴检测：把一组选项归类到它所对抗的价值轴（如“闯荡/留守、理性/感性、服从/反叛…”）。
// 用于“相邻节点不得使用同一条张力轴”的硬契约，阻止模型反复套用“闯出去/留守/折中”同一套模板。
// 返回主导张力轴的 key（如 "闯荡/留守"），检测不出明显对抗时返回 null（不触发该契约）。
interface ValueAxis { key: string; poles: [RegExp, RegExp] }
const VALUE_AXES: ValueAxis[] = [
  { key: "闯荡/留守", poles: [/闯|出去|外地|大城市|打拼|拼一把|赌一把|闯荡|搏|创业|开店|追梦|追|更大的|见世面|闯一闯/, /留守|留在家|本地|照顾家里|顾家|早工作|减轻家里|安稳|稳定|陪在父母|家里|安家|省钱|托付/] },
  { key: "理性/感性", poles: [/理性|理智|分析|利弊|数据|现实|稳妥|靠谱|计算|权衡/, /感性|感觉|直觉|热爱|心动|喜欢|感情|冲动|随性/] },
  { key: "服从/反叛", poles: [/听.{0,3}(父母|家里|老师|家人)|按.{0,4}安排|服从|接受安排|顺着|按部就班/, /反叛|反抗|不听话|坚持自己|自己做主|闹翻|违抗|逆着/] },
  { key: "短利/长利", poles: [/眼前|当下|短期|尽快|快钱|立刻|马上|省事|现成|先赚/, /长远|长期|未来|积累|沉淀|一辈子|打基础|厚积|一劳永逸|走长远/] },
  { key: "向内/向外", poles: [/独处|独自|安静|内敛|自己|一个人的|沉默|低调|向内|躲/, /交朋友|社交|人脉|走出去|认识|结伴|加入|融入|外向|主动接近/] },
  { key: "守成/创新", poles: [/维持|保持现状|守住|不折腾|照旧|现状|稳妥|守成|稳扎稳打/, /创新|突破|转型|尝试新|变革|探索|开辟|开创|试水|扩充/] },
  { key: "独行/合作", poles: [/自己|独自|单干|一个人扛|自己扛/, /合作|合伙|团队|找人|一起|分担|结盟|联手|入股/] },
  { key: "名声/自由", poles: [/名声|名气|认可|荣誉|奖项|头衔|地位|别人眼|出名|影响力/, /自由|自在|随心|不被束缚|不被安排|做自己|无拘/] },
  { key: "合群/独立", poles: [/合群|随大流|跟大家|融入|别人都一样/, /独立|独来独往|不合群|做自己/] },
  { key: "逃避/面对", poles: [/逃避|回避|躲|拖着|放着不管|不去想|算了/, /面对|直面|正视|承担|面对现实|扛|处理/] },
];

// 取历史里最近一个有 choices 的节点（即上一轮给过玩家的决策节点），
// 用于把它的价值张力轴作为本轮“不得重复”的参照。
export function lastChoiceNode(state: Pick<LifeState, "history">): Pick<LifeEvent, "choices"> | undefined {
  for (let i = state.history.length - 1; i >= 0; i--) {
    const node = state.history[i];
    if (node.choices && node.choices.length >= 2) return node;
  }
  return undefined;
}
export function detectValueAxis(choices: LifeChoice[] | undefined): string | null {
  if (!choices || choices.length === 0) return null;
  let best: { key: string; score: number } | null = null;
  for (const axis of VALUE_AXES) {
    let hitsA = 0;
    let hitsB = 0;
    for (const choice of choices) {
      if (axis.poles[0].test(choice.text)) hitsA += 1;
      if (axis.poles[1].test(choice.text)) hitsB += 1;
    }
    if (hitsA > 0 && hitsB > 0) {
      const score = hitsA + hitsB;
      if (!best || score > best.score) best = { key: axis.key, score };
    }
  }
  return best?.key ?? null;
}

function normalizeObjectiveChanges(value: unknown): NextEvent["objectiveChanges"] {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const pick = <K extends keyof NextEvent["objectiveChanges"]>(key: K) => (typeof input[key] === "number" ? input[key] : typeof input[camelToSnake(key) as K] === "number" ? input[camelToSnake(key) as K] : undefined);
  return {
    incomeYearly: pick("incomeYearly") as number | undefined,
    cash: pick("cash") as number | undefined,
    assets: pick("assets") as number | undefined,
    debt: pick("debt") as number | undefined,
    physical: pick("physical") as number | undefined,
    occupation: typeof input.occupation === "string" ? input.occupation : undefined,
    partnerStatus: typeof input.partnerStatus === "string" ? input.partnerStatus : undefined,
  };
}

function camelToSnake(key: string) {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// 容错解析：response_format json_object 保证语法，但个别供应商可能忽略该参数，
// 模型也可能输出 Markdown 围栏、在 JSON 前后夹带文字，或被 max_tokens 截断。
// 依次尝试：原样 → 去围栏 → 截取首个 { 到末尾 }，全部失败才抛错进入重试。
export function parseGeneratedJson(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [trimmed, trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")];
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch { /* try the next candidate */ }
  }
  throw new ModelError("模型返回内容无法解析为 JSON");
}

// 重试时给模型带回失败原因，避免"同样的错再犯一遍"（盲重试）。
// guidance 按场景给出该契约的字段要点。
function withRetryCorrection(attempt: number, messages: NextEventMessage[], failureReason: string, guidance: string): NextEventMessage[] {
  if (attempt === 1 || !failureReason) return messages;
  return [
    ...messages,
    { role: "user", content: `你上一轮输出的 JSON 未通过校验：${failureReason}。请直接重新输出一个完全合规的 JSON 对象：不要 Markdown 代码块、不要任何解释或多余文字。${guidance}` },
  ];
}

// 诊断哪一道契约关卡失败：返回 null 表示通过，否则返回具体原因。
// expectChoices=false 表示童年阶段，不要求 choices 字段。
// previousChoices=上一个节点的选项，用于“相邻节点张力轴不得相同”的轮换硬约束。
export function diagnoseGeneratedEvent(value: unknown, expectChoices = true, previousChoices?: LifeChoice[] | undefined): string | null {
  if (!value || typeof value !== "object") return "返回内容不是 JSON 对象";
  const candidate = value as Record<string, unknown>;
  const event = candidate.event && typeof candidate.event === "object" ? candidate.event as Record<string, unknown> : null;
  if (!event) return "缺少 event 对象";
  if (typeof candidate.story !== "string" || !candidate.story.trim()) return "story 缺失或为空";
  if (typeof event.title !== "string" || !event.title.trim()) return "event.title 缺失或为空";
  if (!normalizeEventType(event.type)) return "event.type 非法：" + String(event.type) + "（应为 career/relationship/health/finance/random/family 之一）";
  if (expectChoices && normalizeChoices(candidate.choices).length < 2) return "choices 少于 2 个有效选项（每项需 id + 非空 text）";
  if (expectChoices) {
    const currentAxis = detectValueAxis(normalizeChoices(candidate.choices));
    const previousAxis = detectValueAxis(previousChoices);
    if (currentAxis && previousAxis && currentAxis === previousAxis) {
      return "价值张力轴与上一节点重复（都是\"" + currentAxis + "\"）。相邻节点必须换一条价值轴：上一节点已是\"" + currentAxis + "\"，本次请改用其它张力轴（如理性/感性、服从/反叛、短利/长利、向内/向外、守成/创新、独行/合作、名声/自由、合群/独立、逃避/面对等），不要再用\"闯出去/留守/折中\"同套模板。";
    }
  }
  const texts = [candidate.story, candidate.memory, event.title, ...normalizeChoices(candidate.choices).map((item) => item.text)]
    .filter((item): item is string => typeof item === "string");
  if (texts.some(containsNameInstruction)) return "文本含姓名指示词（名叫/名字叫/叫作…）";
  return null;
}

// 严格契约：任何关键字段缺失、类型非法、含姓名指示词或张力轴重复都返回 null，调用方抛错。
export function normalizeGeneratedEvent(value: unknown, expectChoices = true, previousChoices?: LifeChoice[] | undefined): NextEvent | null {
  if (diagnoseGeneratedEvent(value, expectChoices, previousChoices) !== null) return null;
  const candidate = value as Record<string, unknown>;
  const event = candidate.event as Record<string, unknown>;
  const story = (candidate.story as string).trim();
  const title = (event.title as string).trim();
  const type = (normalizeEventType(event.type) ?? EVENT_TYPES[0]) as NextEvent["event"]["type"];
  const choices = expectChoices ? normalizeChoices(candidate.choices) : [];
  return {
    timePassed: Math.max(1, Math.min(8, num(candidate.timePassed) || num(candidate.time_passed) || 1)),
    story,
    event: { type, title, importance: Math.max(0, Math.min(1, num(event?.importance) || 0.6)) },
    choices,
    objectiveChanges: normalizeObjectiveChanges(candidate.objectiveChanges ?? candidate.objective_changes),
    memory: typeof candidate.memory === "string" && candidate.memory.trim() ? candidate.memory.trim() : undefined,
  };
}

export type ModelStreamChunk = { text?: string; retry?: boolean; reason?: string };

// 持久化的对话转录：每轮请求 = [system, ...转录, user(本轮)]，纯追加式。
// 这样每一轮请求的输入都是上一轮请求输入的严格前缀，DeepSeek 上下文缓存
// 在“请求边界”持久化的缓存单元会被下一轮完整命中（官方多轮对话示例的命中模式）。
export interface TranscriptMessage {
  role: "user" | "assistant";
  content: string;
}

export function buildModelPrompt(state: LifeState, choice?: LifeChoice) {
  // 旧式单条提示词（无转录的存档/兜底路径）：
  // 字段严格按“稳定在前、易变在后”排列，最大化 DeepSeek 前缀上下文缓存命中率：
  // - life / personality / major_memories 在本局内基本不变；history 是追加式数组，前缀逐轮保持字节级一致；
  // - 只有尾部的 current_state 与 current_choice 每轮变化。
  // 注意：不要把易变字段（age、career、finance…）插入到中部，否则会从那里切断可缓存的公共前缀。
  return JSON.stringify({
    life: {
      id: state.lifeId,
      gender: state.basic.gender,
      city: state.basic.city,
      education: state.basic.education,
      created_at: state.createdAt,
    },
    personality: {
      value_profile: state.psychology.valueProfile,
      behavior_patterns: state.psychology.behaviorPatterns,
      internal_conflicts: state.psychology.internalConflicts,
    },
    major_memories: state.majorMemories,
    history: state.history,
    current_state: {
      age: state.basic.age,
      gender: state.basic.gender,
      career: state.career,
      finance: state.finance,
      health: state.health,
      relationships: state.relationships,
      flags: state.flags,
      dead: state.dead,
    },
    current_choice: choice ?? null,
  });
}

// 转录模式下每轮 user 消息的内容：只有当前状态快照 + 本轮选择（每轮都会变，属于缓存 miss 部分）。
// includeIdentity=true 仅用于开局第一轮，把固定身份/性格/记忆写入转录，之后不再重复发送。
export function buildTranscriptUserContent(state: LifeState, choice?: LifeChoice, includeIdentity = false) {
  const payload: Record<string, unknown> = {};
  if (includeIdentity) {
    payload.life = {
      id: state.lifeId,
      gender: state.basic.gender,
      city: state.basic.city,
      education: state.basic.education,
      created_at: state.createdAt,
    };
    payload.personality = {
      value_profile: state.psychology.valueProfile,
      behavior_patterns: state.psychology.behaviorPatterns,
      internal_conflicts: state.psychology.internalConflicts,
    };
    payload.major_memories = state.majorMemories;
  }
  payload.current_state = {
    age: state.basic.age,
    gender: state.basic.gender,
    career: state.career,
    finance: state.finance,
    health: state.health,
    relationships: state.relationships,
    flags: state.flags,
    dead: state.dead,
  };
  payload.current_choice = choice ?? null;
  return JSON.stringify(payload);
}

// 转录里 assistant 消息的内容：模型产出的规范化事件（去掉 usage 等请求无关字段），字节固定。
export function serializeTranscriptEvent(event: NextEvent): string {
  return JSON.stringify({
    timePassed: event.timePassed,
    story: event.story,
    event: event.event,
    choices: event.choices,
    objectiveChanges: event.objectiveChanges,
    memory: event.memory,
  });
}

export type NextEventMessage = { role: "system" | "user" | "assistant"; content: string };

// transcript 语义：
// - null/undefined → 旧式单条提示词（旧存档或非转录调用方，如 generateNextEvent）
// - []            → 新人生开局第一轮，user 消息携带固定身份（后续存入转录）
// - 非空          → 追加式转录：请求 = [system, ...转录, user(本轮状态+选择)]
export function buildNextEventMessages(
  systemPrompt: string,
  state: LifeState,
  choice: LifeChoice | undefined,
  transcript: TranscriptMessage[] | null | undefined,
): NextEventMessage[] {
  if (transcript === null || transcript === undefined) {
    return [{ role: "system", content: systemPrompt }, { role: "user", content: buildModelPrompt(state, choice) }];
  }
  return [
    { role: "system", content: systemPrompt },
    ...transcript,
    { role: "user", content: buildTranscriptUserContent(state, choice, transcript.length === 0) },
  ];
}

export async function* streamNextEvent(state: LifeState, choice?: LifeChoice, requestConfig?: Partial<ModelConfig>, transcript?: TranscriptMessage[] | null): AsyncGenerator<ModelStreamChunk, NextEvent> {
  const config = resolveModelConfig(requestConfig);
  const { apiKey, baseUrl, model } = config;
  if (!apiKey) throw new ModelError("未配置 API Key，请在模型设置中填写后重试");
  // 从 14 岁起直接进入决策阶段：下一次跳跃（timePassed ≥ 1）必然落地 ≥15 岁，
  // 因此迈入点直接用决策提示词生成带选项的事件，不需要先出童年事件再重生成。
  const expectChoices = state.basic.age + 1 >= CHILDHOOD_BOUNDARY;
  let lastError: ModelError = new ModelError("模型请求失败");
  let lastFailureReason = "";
  for (let attempt = 1; attempt <= MAX_MODEL_ATTEMPTS; attempt++) {
    let generatedText = "";
    let usageRaw: Record<string, unknown> = {};
    try {
      const systemPrompt = buildSystemPrompt(expectChoices, flagsToBackground(state.flags), expectChoices && state.basic.age < CHILDHOOD_BOUNDARY);
      const messages = buildNextEventMessages(systemPrompt, state, choice, transcript);
      const response = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS), body: JSON.stringify({ model, thinking: { type: "disabled" }, temperature: 0.6, max_tokens: 4096, stream: true, stream_options: { include_usage: true }, response_format: { type: "json_object" }, messages: withRetryCorrection(attempt, messages, lastFailureReason, "字段严格按契约（camelCase，story 在前、event 在后，event.type 只用英文枚举 career/relationship/health/finance/random/family，choices 每项含 id 和非空 text）。") }) });
      if (!response.ok) throw new ModelError(`模型服务返回错误（HTTP ${response.status}），请检查 Key 权限或供应商状态`);
      if (!response.body) throw new ModelError("模型服务未返回内容");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
          if (!data || data === "[DONE]") continue;
          try {
            const packet = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
              usage?: Record<string, unknown>;
            };
            const content = packet.choices?.[0]?.delta?.content;
            if (typeof content === "string") {
              generatedText += content;
              yield { text: content };
            }
            if (packet.usage && typeof packet.usage === "object") usageRaw = packet.usage;
          } catch { /* Ignore malformed keepalive frames. */ }
        }
      }
      const generated = parseGeneratedJson(generatedText || "{}");
      const previousChoices = lastChoiceNode(state)?.choices;
      const reason = diagnoseGeneratedEvent(generated, expectChoices, previousChoices);
      if (reason) {
        logModelDiagnostic("event-contract-fail", { age: state.basic.age, phase: expectChoices ? "decision" : "childhood", attempt, reason, raw: generatedText });
        throw new ModelError(`模型返回内容未满足${expectChoices ? "事件" : "童年"}契约：${reason}`);
      }
      const parsed = normalizeGeneratedEvent(generated, expectChoices, previousChoices);
      if (!parsed) throw new ModelError("模型返回内容未满足事件契约");
      if (!expectChoices && crossesAdulthoodBoundary(state.basic.age, parsed.timePassed)) {
        // 安全兜底：童年提示词要求落地 <15 岁，若模型仍越界，硬钳制落地到 14 岁（不重生成）。
        // 正常路径下从 14 岁起已切到决策提示词，这里只防模型违规。
        parsed.timePassed = CHILDHOOD_BOUNDARY - 1 - state.basic.age;
        logModelDiagnostic("childhood-landing-clamped", { age: state.basic.age, clampedTo: CHILDHOOD_BOUNDARY - 1 });
      }
      const usage: ModelUsage = { promptTokens: num(usageRaw.prompt_tokens), completionTokens: num(usageRaw.completion_tokens), totalTokens: num(usageRaw.total_tokens), estimatedCostUsd: num(usageRaw.prompt_tokens) / 1_000_000 * config.inputCostPerMillion + num(usageRaw.completion_tokens) / 1_000_000 * config.outputCostPerMillion, provider: baseUrl, model, promptCacheHitTokens: num(usageRaw.prompt_cache_hit_tokens), promptCacheMissTokens: num(usageRaw.prompt_cache_miss_tokens) };
      return { ...parsed, usage };
    } catch (error) {
      lastError = toModelError(error);
      if (!lastFailureReason) {
        lastFailureReason = lastError.message.includes("无法解析为 JSON")
          ? "JSON 无法解析（可能被截断或混入多余文字）"
          : lastError.message.startsWith("模型返回内容未满足")
            ? lastError.message
            : "";
      }
      logModelDiagnostic("event-attempt-fail", { age: state.basic.age, phase: expectChoices ? "decision" : "childhood", attempt, error: lastError.message, raw: generatedText });
    }
    if (attempt < MAX_MODEL_ATTEMPTS) yield { retry: true, reason: lastFailureReason };
  }
  // 兜底：模型连续失败也不让一局人生永远卡在同一个决策节点上。
  // 用确定性回退事件推进，保证玩家始终能继续；转录同样记录这份回退事件。
  logModelDiagnostic("event-fallback", { age: state.basic.age, phase: expectChoices ? "decision" : "childhood", reason: lastFailureReason || lastError.message });
  const fallback = buildFallbackEvent(state, choice);
  return { ...fallback, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0, provider: baseUrl, model, fallbackReason: lastFailureReason || lastError.message } };
}

export async function generateNextEvent(state: LifeState, choice?: LifeChoice, requestConfig?: Partial<ModelConfig>): Promise<NextEvent> {
  const iterator = streamNextEvent(state, choice, requestConfig);
  let item = await iterator.next();
  while (!item.done) item = await iterator.next();
  return item.value;
}

const ENDING_SYSTEM_PROMPT = `你是一位温和的观察者，正在为一生的选择做一场安静的回顾。
全程只用第二人称“你”称呼当事人；不出现任何姓名、昵称、英文名或姓名占位符；其他人只能用身份词，如父亲、母亲、伴侣、孩子、朋友。
不评价人生好坏，不给出分数、等级或“你就是……”这样的断言；使用“似乎、也许、可能、从你的选择来看”这样的语气。
只返回一个 JSON 对象，不要 Markdown 代码块，不要任何额外文字或解释。必须严格使用下面的 camelCase 字段：
{"age":34,"death":"因病离世","facts":{"occupation":"教师","city":"成都","events":18},"highlights":[{"age":19,"title":"你第一次离开家"},{"age":27,"title":"你选择回到家人身边"}],"patterns":["从你的选择来看，你常常会在真正重要的时刻为关系停下来。","年轻时你也许很在意别人的认可，后来你越来越愿意按照自己的判断生活。"]}
**硬事实约束**：age 必须等于 user 消息里的 current_age（人生实际结束年龄），严禁编造更大或更小的年龄；facts.events 必须等于实际经历的事件数量，不得夸大。highlights 必须是 4 至 8 个真正改变人生方向的节点；patterns 必须是 1 至 3 句观察，不带价值判断。`;

// 诊断人生回顾契约失败原因：返回 null 表示通过，否则返回具体原因。
export function diagnoseEnding(value: unknown): string | null {
  if (!value || typeof value !== "object") return "返回内容不是 JSON 对象";
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.age !== "number") return "age 缺失或非数字";
  const facts = candidate.facts && typeof candidate.facts === "object" ? candidate.facts as Record<string, unknown> : null;
  if (!facts) return "缺少 facts 对象";
  if (typeof facts.occupation !== "string" || !facts.occupation.trim()) return "facts.occupation 缺失或为空";
  if (typeof facts.city !== "string" || !facts.city.trim()) return "facts.city 缺失或为空";
  const highlights = Array.isArray(candidate.highlights)
    ? candidate.highlights.filter((item): item is { title: string } => Boolean(item) && typeof item === "object" && typeof (item as { title?: unknown }).title === "string" && Boolean((item as { title: string }).title.trim()))
    : [];
  if (highlights.length < 2) return "highlights 少于 2 个有效人生节点";
  const patterns = Array.isArray(candidate.patterns) ? candidate.patterns.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
  if (patterns.length < 1) return "patterns 缺失或为空";
  if (typeof candidate.death !== "string" || !candidate.death.trim()) return "death 缺失或为空";
  const texts = [...highlights.map((item) => item.title), ...patterns];
  if (texts.some(containsNameInstruction)) return "文本含姓名指示词（名叫/名字叫/叫作…）";
  return null;
}

// 严格契约：关键字段缺失或含姓名指示词返回 null，调用方抛错。
export function normalizeEnding(value: unknown): LifeEnding | null {
  if (diagnoseEnding(value) !== null) return null;
  const candidate = value as Record<string, unknown>;
  const facts = candidate.facts as Record<string, unknown>;
  const highlights = (Array.isArray(candidate.highlights) ? candidate.highlights : []).flatMap((item) => {
    const highlight = item as Record<string, unknown>;
    return [{ age: typeof highlight.age === "number" ? highlight.age : candidate.age as number, title: (highlight.title as string).trim() }];
  }).slice(0, 8);
  const patterns = (Array.isArray(candidate.patterns) ? candidate.patterns : []).filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 3);
  return {
    age: candidate.age as number,
    death: (candidate.death as string).trim(),
    facts: { occupation: (facts.occupation as string).trim(), city: (facts.city as string).trim(), events: typeof facts.events === "number" ? facts.events : 0 },
    highlights,
    patterns,
    question: "如果可以再活一次，你会做出不同的选择吗？",
  };
}

// 结局硬事实纠正：年龄、事件数、死因必须以状态为准（LLM 可能抄示例编造年龄，
// 如"27 岁人生被写成 81 岁"）；LLM 只负责回顾文字本身。
export function applyEndingHardFacts(ending: LifeEnding, state: LifeState): LifeEnding {
  const cause = typeof state.flags.deathCause === "string" ? DEATH_CAUSE_LABEL[state.flags.deathCause] : undefined;
  return {
    ...ending,
    age: state.basic.age,
    death: cause ?? ending.death,
    facts: { ...ending.facts, events: state.history.length },
  };
}

export async function generateEnding(state: LifeState, requestConfig?: Partial<ModelConfig>): Promise<LifeEnding> {
  const config = resolveModelConfig(requestConfig);
  const { apiKey, baseUrl, model } = config;
  if (!apiKey) throw new ModelError("未配置 API Key，请在模型设置中填写后重试");
  const prompt = JSON.stringify({
    life_state: state,
    recent_history: state.history.slice(-12),
    major_memories: state.majorMemories,
    behavioral_summary: state.psychology.behaviorPatterns,
    current_age: state.basic.age,
    death_cause: state.flags.deathCause ?? "natural",
  });
  const messages = [{ role: "system" as const, content: ENDING_SYSTEM_PROMPT }, { role: "user" as const, content: prompt }];
  let lastError: ModelError = new ModelError("模型请求失败");
  let lastFailureReason = "";
  for (let attempt = 1; attempt <= MAX_MODEL_ATTEMPTS; attempt++) {
    let rawContent = "";
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
        body: JSON.stringify({ model, thinking: { type: "disabled" }, temperature: 0.6, max_tokens: 2048, response_format: { type: "json_object" }, messages: withRetryCorrection(attempt, messages, lastFailureReason, "age 为数字，death 为字符串，facts 含 occupation/city/events，highlights 4-8 条（每项含 age 和 title），patterns 1-3 句，全程不含姓名。") }),
      });
      if (!response.ok) throw new ModelError(`模型服务返回错误（HTTP ${response.status}），请检查 Key 权限或供应商状态`);
      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      rawContent = payload.choices?.[0]?.message?.content ?? "";
      const generated = parseGeneratedJson(rawContent || "{}");
      const reason = diagnoseEnding(generated);
      if (reason) {
        logModelDiagnostic("ending-contract-fail", { attempt, reason, raw: rawContent });
        throw new ModelError(`模型返回内容未满足人生回顾契约：${reason}`);
      }
      const ending = normalizeEnding(generated);
      if (!ending) throw new ModelError("模型返回内容未满足人生回顾契约");
      return applyEndingHardFacts(ending, state);
    } catch (error) {
      lastError = toModelError(error);
      if (!lastFailureReason) {
        lastFailureReason = lastError.message.includes("无法解析为 JSON")
          ? "JSON 无法解析（可能被截断或混入多余文字）"
          : lastError.message.startsWith("模型返回内容未满足")
            ? lastError.message
            : "";
      }
      logModelDiagnostic("ending-attempt-fail", { attempt, error: lastError.message, raw: rawContent });
    }
  }
  throw lastError;
}
