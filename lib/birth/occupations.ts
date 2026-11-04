export interface BirthOccupation {
  id: string;
  label: string;
  sector: string;
  education: "义务教育" | "高中或中职" | "大专或本科" | "研究生";
  employment: "受雇" | "个体经营" | "灵活就业";
  schedule: "固定日班" | "轮班" | "弹性工时" | "经常出差";
  incomeBand: 1 | 2 | 3 | 4;
}

// 分类方向参考人社部《职业分类大典（2022年版）》；以下生活角色及属性为原创编辑设计，非官方编码、准入标准或人口统计。
// https://chinajob.mohrss.gov.cn/h5/c/2022-10-08/361551.shtml
const educationLevels: BirthOccupation["education"][] = ["义务教育", "高中或中职", "大专或本科", "研究生"];
type Role = [label: string, education: 0 | 1 | 2 | 3, employment: BirthOccupation["employment"], schedule: BirthOccupation["schedule"], incomeBand: BirthOccupation["incomeBand"]];
const sectors: { id: string; label: string; weight: number; roles: Role[] }[] = [
  { id: "agriculture", label: "农林渔业", weight: 10, roles: [
    ["粮食种植户", 0, "个体经营", "弹性工时", 1],
    ["蔬菜种植户", 0, "个体经营", "弹性工时", 2],
    ["果园经营者", 0, "个体经营", "弹性工时", 2],
    ["水产养殖户", 0, "个体经营", "弹性工时", 2],
    ["畜禽饲养员", 0, "受雇", "轮班", 1],
    ["农机操作员", 1, "受雇", "弹性工时", 2],
    ["林场养护工", 0, "受雇", "固定日班", 1],
    ["园艺育苗工", 0, "受雇", "固定日班", 1],
    ["农业技术服务员", 2, "受雇", "经常出差", 2],
    ["农产品分级包装工", 0, "受雇", "轮班", 1],
  ] },
  { id: "manufacturing", label: "生产制造", weight: 14, roles: [
    ["数控机床操作员", 1, "受雇", "轮班", 2],
    ["电子产品装配工", 0, "受雇", "轮班", 1],
    ["食品生产工", 0, "受雇", "轮班", 1],
    ["服装缝纫工", 0, "受雇", "固定日班", 1],
    ["模具维修工", 1, "受雇", "轮班", 2],
    ["焊接工", 1, "受雇", "固定日班", 2],
    ["产品质检员", 1, "受雇", "轮班", 2],
    ["设备维护技师", 1, "受雇", "轮班", 3],
    ["工艺工程师", 2, "受雇", "固定日班", 3],
    ["化学材料研究员", 3, "受雇", "固定日班", 3],
  ] },
  { id: "transport", label: "物流交通", weight: 10, roles: [
    ["快递分拣员", 0, "受雇", "轮班", 1],
    ["快递员", 0, "受雇", "弹性工时", 2],
    ["仓库管理员", 1, "受雇", "轮班", 2],
    ["货运司机", 1, "受雇", "经常出差", 2],
    ["公交车驾驶员", 1, "受雇", "轮班", 2],
    ["铁路检修工", 1, "受雇", "轮班", 2],
    ["物流调度员", 1, "受雇", "轮班", 2],
    ["报关业务员", 2, "受雇", "固定日班", 2],
    ["船舶轮机人员", 2, "受雇", "经常出差", 3],
    ["网约车司机", 0, "灵活就业", "弹性工时", 2],
  ] },
  { id: "commerce", label: "商贸与办公室", weight: 10, roles: [
    ["超市理货员", 0, "受雇", "轮班", 1],
    ["商场导购员", 0, "受雇", "轮班", 1],
    ["杂货店店主", 0, "个体经营", "弹性工时", 2],
    ["市场摊位经营者", 0, "个体经营", "弹性工时", 2],
    ["采购专员", 2, "受雇", "固定日班", 2],
    ["销售业务员", 1, "受雇", "经常出差", 2],
    ["出纳员", 1, "受雇", "固定日班", 2],
    ["企业会计", 2, "受雇", "固定日班", 2],
    ["行政文员", 1, "受雇", "固定日班", 1],
    ["银行柜员", 2, "受雇", "固定日班", 2],
    ["小微企业经营者", 1, "个体经营", "弹性工时", 4],
    ["金融分析师", 3, "受雇", "固定日班", 4],
  ] },
  { id: "construction", label: "建筑与维修", weight: 8, roles: [
    ["建筑木工", 0, "受雇", "固定日班", 2],
    ["泥瓦工", 0, "灵活就业", "弹性工时", 2],
    ["水电安装工", 1, "受雇", "固定日班", 2],
    ["空调维修工", 1, "个体经营", "弹性工时", 2],
    ["家电维修店主", 1, "个体经营", "弹性工时", 2],
    ["汽车维修技师", 1, "受雇", "固定日班", 2],
    ["电梯维保人员", 1, "受雇", "轮班", 2],
    ["工程造价员", 2, "受雇", "固定日班", 3],
    ["建筑设计人员", 2, "受雇", "固定日班", 3],
    ["道路养护工", 0, "受雇", "固定日班", 1],
    ["装修工程承包商", 1, "个体经营", "经常出差", 4],
  ] },
  { id: "food", label: "餐饮与生活服务", weight: 9, roles: [
    ["餐厅服务员", 0, "受雇", "轮班", 1],
    ["厨师", 1, "受雇", "轮班", 2],
    ["早餐铺经营者", 0, "个体经营", "弹性工时", 2],
    ["面点制作工", 1, "受雇", "轮班", 2],
    ["咖啡店店员", 1, "受雇", "轮班", 1],
    ["理发师", 1, "个体经营", "弹性工时", 2],
    ["家政保洁员", 0, "灵活就业", "弹性工时", 1],
    ["酒店前台", 1, "受雇", "轮班", 1],
    ["洗衣店经营者", 0, "个体经营", "弹性工时", 2],
    ["养老护理员", 1, "受雇", "轮班", 2],
    ["连锁餐饮经营者", 1, "个体经营", "弹性工时", 4],
    ["餐饮门店管理人员", 2, "受雇", "轮班", 3],
  ] },
  { id: "health", label: "医疗与照护", weight: 8, roles: [
    ["医院导诊员", 1, "受雇", "轮班", 1],
    ["医院后勤人员", 0, "受雇", "轮班", 1],
    ["护士", 2, "受雇", "轮班", 2],
    ["基层全科医生", 2, "受雇", "轮班", 3],
    ["临床专科医生", 3, "受雇", "轮班", 4],
    ["医学检验人员", 2, "受雇", "轮班", 2],
    ["康复治疗人员", 2, "受雇", "固定日班", 2],
    ["药师", 2, "受雇", "轮班", 2],
    ["医疗设备技术员", 2, "受雇", "经常出差", 3],
    ["社区助老服务员", 1, "受雇", "固定日班", 1],
    ["药物研发人员", 3, "受雇", "固定日班", 4],
  ] },
  { id: "education", label: "教育与科研", weight: 7, roles: [
    ["小学教师", 2, "受雇", "固定日班", 2],
    ["中学教师", 2, "受雇", "固定日班", 2],
    ["幼儿园教师", 2, "受雇", "固定日班", 2],
    ["幼儿园保育员", 1, "受雇", "固定日班", 1],
    ["职业学校实训教师", 2, "受雇", "固定日班", 2],
    ["大学讲师", 3, "受雇", "弹性工时", 3],
    ["实验室技术员", 2, "受雇", "固定日班", 2],
    ["科研助理", 2, "受雇", "固定日班", 2],
    ["学校食堂员工", 0, "受雇", "固定日班", 1],
    ["图书资料管理员", 2, "受雇", "固定日班", 2],
    ["高校科研人员", 3, "受雇", "弹性工时", 3],
  ] },
  { id: "digital", label: "数字与平台工作", weight: 7, roles: [
    ["远程软件开发人员", 2, "受雇", "弹性工时", 3],
    ["软件测试人员", 2, "受雇", "固定日班", 2],
    ["网络运维人员", 2, "受雇", "轮班", 3],
    ["数据标注员", 1, "灵活就业", "弹性工时", 1],
    ["电商客服", 1, "受雇", "轮班", 1],
    ["网店经营者", 1, "个体经营", "弹性工时", 2],
    ["电商运营人员", 2, "受雇", "固定日班", 2],
    ["平台配送员", 0, "灵活就业", "弹性工时", 2],
    ["网络内容审核员", 1, "受雇", "轮班", 2],
    ["人工智能研究员", 3, "受雇", "弹性工时", 4],
    ["电商企业经营者", 1, "个体经营", "弹性工时", 4],
    ["高级软件工程师", 3, "受雇", "弹性工时", 4],
  ] },
  { id: "public", label: "公共服务", weight: 7, roles: [
    ["社区事务工作人员", 2, "受雇", "固定日班", 2],
    ["基层办事窗口人员", 2, "受雇", "固定日班", 2],
    ["消防救援人员", 1, "受雇", "轮班", 2],
    ["环境监测技术员", 2, "受雇", "固定日班", 2],
    ["环卫作业员", 0, "受雇", "轮班", 1],
    ["供水设施运行工", 1, "受雇", "轮班", 2],
    ["电力线路检修员", 1, "受雇", "经常出差", 3],
    ["公共场馆保安员", 0, "受雇", "轮班", 1],
    ["社区社会工作者", 2, "受雇", "弹性工时", 2],
    ["基层司法辅助人员", 2, "受雇", "固定日班", 2],
    ["政策研究人员", 3, "受雇", "固定日班", 3],
    ["公共事务管理岗位", 2, "受雇", "固定日班", 3],
  ] },
  { id: "culture", label: "文化体育与媒体", weight: 3, roles: [
    ["地方剧团演员", 1, "受雇", "弹性工时", 2],
    ["专业运动员", 1, "受雇", "弹性工时", 2],
    ["健身教练", 1, "灵活就业", "弹性工时", 2],
    ["图书编辑", 2, "受雇", "固定日班", 2],
    ["地方媒体记者", 2, "受雇", "经常出差", 2],
    ["印刷排版员", 1, "受雇", "固定日班", 2],
    ["博物馆讲解员", 2, "受雇", "轮班", 2],
    ["活动执行人员", 1, "受雇", "经常出差", 2],
    ["影院放映员", 1, "受雇", "轮班", 1],
    ["广播音响技术员", 1, "受雇", "轮班", 2],
  ] },
  { id: "independent", label: "独立接单与小型经营", weight: 7, roles: [
    ["自由摄影师", 1, "灵活就业", "弹性工时", 2],
    ["自由译者", 2, "灵活就业", "弹性工时", 2],
    ["独立平面设计师", 2, "灵活就业", "弹性工时", 2],
    ["服装修改店主", 0, "个体经营", "弹性工时", 1],
    ["宠物照护店主", 1, "个体经营", "弹性工时", 2],
    ["上门维修接单人员", 1, "灵活就业", "弹性工时", 2],
    ["旧物修复经营者", 1, "个体经营", "弹性工时", 2],
    ["流动市集摊主", 0, "个体经营", "弹性工时", 1],
    ["旅行向导", 1, "灵活就业", "经常出差", 2],
    ["独立文案撰稿人", 2, "灵活就业", "弹性工时", 2],
  ] },
];

// 已存档ID使用行业+目录序号；行业内新增只追加，不重排已有角色。
export const BIRTH_OCCUPATIONS: BirthOccupation[] = sectors.flatMap(sector => sector.roles.map(([label, education, employment, schedule, incomeBand], index) => ({
  id: `${sector.id}-${index + 1}`, label, sector: sector.label, education: educationLevels[education], employment, schedule, incomeBand,
})));

// “官二代”不是任意公共服务业岗位都能代表；限定在公共事务/政策/基层治理角色，
// 避免把社区助老、环卫、电力检修等写成干部家庭。
export const PUBLIC_CAPITAL_LABELS = [
  "政策研究人员",
  "公共事务管理岗位",
] as const;

function unitRoll(random: () => number): number {
  const value = random();
  return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : 0;
}

// 城乡只调整农林渔业的相对机会，不屏蔽其他行业：城区仍可有都市农业，
// 但不会像乡村那样成为常见家庭职业。
function agricultureWeight(settlement: string): number {
  if (settlement === "乡村") return 1.8;
  if (settlement === "乡镇") return 1.2;
  if (settlement === "县城") return 0.7;
  if (settlement === "城区") return 0.25;
  return 1;
}

export function sampleParentOccupation(random: () => number, options: {
  settlement: string;
  education: BirthOccupation["education"];
  avoidIds?: readonly string[];
  employment?: BirthOccupation["employment"];
  sectorLabel?: string;
  labels?: readonly string[];
  minIncomeBand?: number;
}): BirthOccupation {
  const level = educationLevels.indexOf(options.education);
  if (level < 0) throw new RangeError("父母教育程度无效");
  const base = BIRTH_OCCUPATIONS.filter(role => educationLevels.indexOf(role.education) <= level
    // 城区不安排农林渔业角色：避免“北京东城粮食种植户/香港果园经营者”这类地理冲突。
    && !(options.settlement === "城区" && role.sector === "农林渔业"));
  const constrained = base.filter(role =>
    (!options.employment || role.employment === options.employment)
    && (!options.sectorLabel || role.sector === options.sectorLabel)
    && (!options.labels || options.labels.includes(role.label))
    && (options.minIncomeBand === undefined || role.incomeBand >= options.minIncomeBand));
  // 稀有开局会限定“个体经营/公共服务”；没有符合条件时才回落到普通合格池。
  const qualified = constrained.length ? constrained : base;
  // 学历高于岗位要求是现实可能，但不应成为默认：优先在“同一档或低一档”的岗位中抽样，
  // 避免研究生被大量安排成饲养员/分拣员。没有合格岗位时才回落到全部合规岗位。
  const preferred = qualified.filter(role => level - educationLevels.indexOf(role.education) <= 1);
  const eligible = preferred.length ? preferred : qualified;
  const fresh = eligible.filter(role => !options.avoidIds?.includes(role.id));
  const pool = fresh.length ? fresh : eligible;
  // 先抽行业，再等概率抽该行业的合格角色；权重是编辑覆盖设计，不是现实就业比例。
  // 乡村增加农林机会，城区降低但不完全排除；数字、公共服务等行业始终可选。
  const available = sectors.map(sector => ({
    roles: pool.filter(role => role.sector === sector.label),
    weight: sector.weight * (sector.id === "agriculture" ? agricultureWeight(options.settlement) : 1),
  })).filter(sector => sector.roles.length > 0);
  let roll = unitRoll(random) * available.reduce((sum, sector) => sum + sector.weight, 0);
  let selected = available[available.length - 1];
  for (const sector of available) {
    roll -= sector.weight;
    if (roll < 0) { selected = sector; break; }
  }
  return selected.roles[Math.floor(unitRoll(random) * selected.roles.length)];
}
