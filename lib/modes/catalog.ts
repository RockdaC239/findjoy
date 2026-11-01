import type {
  ModeDefinition,
  ScriptDefinition,
  ScriptEra,
  ThemeDefinition,
  ThemeId,
} from "./types";

export const LIFE_MODES: ModeDefinition[] = [
  {
    id: "normal",
    label: "普通人生",
    eyebrow: "CLASSIC",
    tagline: "随机出身 · 从 0 岁开始",
    description: "没有预设主线。家庭、时代与选择共同决定你会成为谁。",
    access: "free",
  },
  {
    id: "theme",
    label: "主题人生",
    eyebrow: "THEME",
    tagline: "爱情 · 亲情 · 事业",
    description: "给一生加一条主线，看看它会把你带到哪里。",
    access: "free",
  },
  {
    id: "script",
    label: "剧本人生",
    eyebrow: "SCRIPT",
    tagline: "年代短剧 · 脑洞开局",
    description: "进入一个别人的人生，在时代与命运里做自己的选择。",
    access: "free",
  },
  {
    id: "foru",
    label: "ForU 人生",
    eyebrow: "FOR YOU",
    tagline: "以你现在的人生为起点",
    description: "把你此刻的处境交给 AI，推演接下来可能发生的人生。",
    access: "premium",
  },
];

export const THEMES: ThemeDefinition[] = [
  {
    id: "love",
    label: "爱情",
    eyebrow: "LOVE",
    tagline: "在关系里看见自己",
    description: "相遇、靠近、误解、承诺、失去与重新开始。爱情不是奖品，而是一连串真实的选择。",
    focus: ["亲密关系", "边界与承诺", "现实压力"],
    eventTypes: ["relationship"],
  },
  {
    id: "family",
    label: "亲情",
    eyebrow: "FAMILY",
    tagline: "家人如何塑造你",
    description: "父母、伴侣、子女与手足。写照顾、期待、亏欠、边界，也写那些说不出口的爱。",
    focus: ["代际关系", "照护与责任", "和解与告别"],
    eventTypes: ["family", "relationship"],
  },
  {
    id: "career",
    label: "事业",
    eyebrow: "CAREER",
    tagline: "你如何对待野心",
    description: "入行、晋升、失败、转行与退休。工作不只是收入，也是你与世界交手的方式。",
    focus: ["职业选择", "组织与权力", "失败与转型"],
    eventTypes: ["career", "finance"],
  },
];

export const SCRIPT_ERAS: ScriptEra[] = [
  {
    id: "1980s",
    label: "八十年代",
    years: "1980—1989",
    setting:
      "改革开放初期。粮票逐渐退场，国营厂、供销社与个体户并存；电话罕见，消息靠口耳相传，离开一座县城往往意味着换一种人生。",
  },
  {
    id: "1990s",
    label: "九十年代",
    years: "1990—1999",
    setting:
      "南下打工潮、国企改制与下海经商并行。绿皮火车、BP 机、录像厅和工厂宿舍构成许多人的青春；机会与风险常常来自同一个人。",
  },
  {
    id: "2000s",
    label: "千禧年",
    years: "2000—2009",
    setting:
      "网吧、QQ、非典、房价起步与选秀节目进入日常生活。功能机代替不了座机，但已经开始改变人和人联系的方式。",
  },
  {
    id: "republic",
    label: "民国",
    years: "1930s",
    setting:
      "战云逼近的上海。报馆、弄堂、百乐门与码头并存；体面与危险只隔一层楼板，很多告别没有第二次机会。",
  },
  {
    id: "now",
    label: "当代",
    years: "2020s",
    setting:
      "移动互联网与 AI 进入日常，相亲、裁员、房贷、独居和重新开始都很具体。信息很多，确定感很少。",
  },
];

export const SCRIPTS: ScriptDefinition[] = [
  {
    id: "1980s-factory-succession",
    eraId: "1980s",
    title: "顶替",
    tagline: "父亲的工位，和一屋子等你表态的人",
    premise:
      "父亲在厂里出了事故，家里得到一个顶替名额。大伯说这个名额该给他儿子，母亲把招工表藏进了米缸。全家人都在等你说一句话。",
    hook: "厂长把招工表推到你面前：“签了，明天上班。你爸那边，我去说。”",
    coreConflict:
      "一个能改变全家命运的岗位，究竟该按血缘、按困难，还是按谁更需要来分配。",
    tone: "冷峻、克制，有时代灰尘感",
    eventType: "career",
    start: { age: 18, city: "沈阳", occupation: "待业青年", education: "高中毕业", finance: "ordinary", cash: 120, assets: 300, debt: 0, incomeYearly: 0, partnerStatus: "单身" },
    access: "free",
  },
  {
    id: "1980s-supply-counter",
    eraId: "1980s",
    title: "供销社最后一任售货员",
    tagline: "柜台见底那天，全公社的糖票都成了废纸",
    premise:
      "供销社要改制，你守着一间即将被承包的柜台。有人劝你趁最后的机会捞一笔，也有人想拉你一起单干。你手里的糖票，突然不知该按哪种规矩算。",
    hook: "柜台上的糖罐见了底，门外还排着长队。主任说：“从明天起，这里不再姓公。”",
    coreConflict: "在旧秩序退场时，是守住一份体面，还是先让自己活下去。",
    tone: "温热、烟火气，有小人物式的精明与善意",
    eventType: "career",
    start: { age: 20, city: "县城", occupation: "供销社售货员", education: "高中毕业", finance: "ordinary", cash: 180, assets: 400, debt: 0, incomeYearly: 600, partnerStatus: "单身" },
    access: "free",
  },
  {
    id: "1990s-southbound-train",
    eraId: "1990s",
    title: "南下的第 37 小时",
    tagline: "有人替你补了一张去往另一种人生的票",
    premise:
      "你揣着八十块钱南下，在绿皮火车上遇到一个自称能介绍工作的人。他帮你补了票，也拿走了你的身份证。第 37 个小时，你开始怀疑这趟车到底会把你带到哪里。",
    hook: "他把你的身份证揣进兜里，笑着说：“到了深圳，跟着我走就行。”",
    coreConflict: "当机会和危险来自同一个人，你是抓住他，还是想办法脱身。",
    tone: "湿热、拥挤，带着冒险和不安",
    eventType: "career",
    start: { age: 20, city: "深圳", occupation: "打工者", education: "初中毕业", finance: "tight", cash: 80, assets: 0, debt: 0, incomeYearly: 0, partnerStatus: "单身" },
    access: "free",
  },
  {
    id: "1990s-plant-seal",
    eraId: "1990s",
    title: "厂长把公章交给我",
    tagline: "一百多号人等着你签下第一张工资单",
    premise:
      "厂子连年亏损，老厂长病退，把公章和一本欠账交到你手里。上面要你三个月内扭亏，下面的人只想知道下个月还有没有工资。你的师傅也在其中。",
    hook: "老厂长把公章放进你掌心：“从今天起，这一百多号人，你管。”",
    coreConflict: "改革要裁掉一些人的饭碗，而那些人里有你的师傅和邻居。",
    tone: "沉重、现实，改革阵痛",
    eventType: "career",
    start: { age: 28, city: "武汉", occupation: "车间主任", education: "中专毕业", finance: "ordinary", cash: 2000, assets: 5000, debt: 0, incomeYearly: 6000, partnerStatus: "未婚" },
    access: "free",
  },
  {
    id: "2000s-internet-cafe",
    eraId: "2000s",
    title: "网吧最后一台机子",
    tagline: "凌晨三点，有人买下了你写的网页",
    premise:
      "你在网吧包夜，替人代练游戏，也偷偷自学写网页。一个陌生人愿意出钱买你的代码，但要求你明天就跟他走。再过四个月，就是高考。",
    hook: "凌晨三点，最后一台机子亮着。QQ 头像闪动：“你写的那个页面，我买了。明天跟我去上海。”",
    coreConflict: "一个来路不明的机会，和即将到来的高考，哪一边才是真正的出口。",
    tone: "躁动、明亮，带一点中二和理想主义",
    eventType: "career",
    start: { age: 17, city: "杭州", occupation: "高中生", education: "高中在读", finance: "ordinary", cash: 300, assets: 0, debt: 0, incomeYearly: 0, partnerStatus: "单身" },
    access: "free",
  },
  {
    id: "2000s-demolition",
    eraId: "2000s",
    title: "拆迁通知贴上门",
    tagline: "补偿款够买两套房，但母亲说这房子不能拆",
    premise:
      "老城区要拆迁，补偿方案按户口和面积算。你已婚，孩子即将出生；母亲却守着老屋不肯签字，说这里有父亲留下的东西。拆迁队明天还会来。",
    hook: "拆迁通知贴在门上，红章很新。母亲坐在门槛上：“要拆，先把我抬走。”",
    coreConflict: "更好的生活和母亲守了一辈子的地方，只能选一个吗。",
    tone: "潮湿、市井，家庭拉扯",
    eventType: "family",
    start: { age: 26, city: "重庆", occupation: "出租车司机", education: "高中毕业", finance: "tight", cash: 3000, assets: 20000, debt: 30000, incomeYearly: 30000, partnerStatus: "已婚" },
    access: "free",
  },
  {
    id: "republic-obituary",
    eraId: "republic",
    title: "我收到了自己的讣告",
    tagline: "明天的报纸上，已经写好了你的死讯",
    premise:
      "你是报馆的夜班编辑。排字房送来一篇讣告，照片和名字都是你。没有人知道是谁写的，也没有人相信你还活着。天亮前，报纸就要付印。",
    hook: "铅字还没干，你的名字躺在头版：“本报编辑，昨夜死于非命。”",
    coreConflict: "当有人提前写好了你的结局，你是逃，是查，还是把这篇讣告改成别人的故事。",
    tone: "悬疑、冷雨，旧上海",
    eventType: "random",
    start: { age: 24, city: "上海", occupation: "报馆编辑", education: "大学肄业", finance: "ordinary", cash: 20, assets: 60, debt: 0, incomeYearly: 0, partnerStatus: "单身" },
    access: "free",
  },
  {
    id: "republic-ballroom",
    eraId: "republic",
    title: "百乐门最后一支舞",
    tagline: "今晚的客人里，有一个必须被送走的人",
    premise:
      "你在百乐门乐队弹琴。战事逼近，今晚最后一支舞，一位常客托你把一只皮箱送上船，条件是永远不要打开。她说船票在夹层，别回头。",
    hook: "最后一支舞开始前，她把皮箱推到你脚边：“船票在夹层。别回头。”",
    coreConflict: "一只不能打开的箱子，和一段不该开始的关系。",
    tone: "华丽、危险，旧梦将醒",
    eventType: "relationship",
    start: { age: 22, city: "上海", occupation: "舞厅乐手", education: "中学毕业", finance: "ordinary", cash: 30, assets: 80, debt: 0, incomeYearly: 0, partnerStatus: "单身" },
    access: "free",
  },
  {
    id: "now-blind-date",
    eraId: "now",
    title: "相亲局上，前任坐在对面",
    tagline: "介绍人说对方条件很好，推门进来的是三年前不告而别的人",
    premise:
      "你被家里安排相亲。坐下十分钟后，前任推门进来，坐在介绍人旁边，像第一次见你。你们都装作不认识。菜还没上，介绍人已经准备走了。",
    hook: "介绍人笑着说：“你们年轻人聊，我先走。”门关上，桌上只剩两个人。",
    coreConflict: "三年前没有说完的话，和现在各自要过的人生。",
    tone: "克制、都市，暗流",
    eventType: "relationship",
    start: { age: 29, city: "上海", occupation: "产品经理", education: "本科毕业", finance: "comfortable", cash: 150000, assets: 400000, debt: 0, incomeYearly: 400000, partnerStatus: "单身" },
    access: "free",
  },
  {
    id: "now-layoff",
    eraId: "now",
    title: "裁员名单上有我的名字",
    tagline: "HR 约你下午三点，名单已经传开",
    premise:
      "你刚背上房贷，孩子明年上小学。公司裁员，你在名单上。领导暗示你可以主动离职换一份体面，猎头电话却在这个时候打了进来。",
    hook: "下午两点五十九，HR 发来消息：“三点，A 会议室，十分钟。”",
    coreConflict: "体面地离开，还是留下来争取一个可能不存在的机会。",
    tone: "冷静、现实，城市中产",
    eventType: "career",
    start: { age: 32, city: "北京", occupation: "大厂中层", education: "本科毕业", finance: "comfortable", cash: 120000, assets: 300000, debt: 1200000, incomeYearly: 600000, partnerStatus: "已婚" },
    access: "free",
  },
];

export function getModeDefinition(id: string): ModeDefinition | undefined {
  return LIFE_MODES.find((mode) => mode.id === id);
}

export function getTheme(id: string): ThemeDefinition | undefined {
  return THEMES.find((theme) => theme.id === id);
}

export function getScript(id: string): ScriptDefinition | undefined {
  return SCRIPTS.find((script) => script.id === id);
}

export function getEra(id: string): ScriptEra | undefined {
  return SCRIPT_ERAS.find((era) => era.id === id);
}

export function scriptsForEra(eraId: string): ScriptDefinition[] {
  return SCRIPTS.filter((script) => script.eraId === eraId);
}

export function isThemeId(value: unknown): value is ThemeId {
  return value === "love" || value === "family" || value === "career";
}
