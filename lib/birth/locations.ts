import locations from "./data/locations.json";

export interface BirthLocation {
  provinceCode: string;
  province: string;
  city: string;
  county: string;
  settlement: "城区" | "县城" | "乡镇" | "乡村";
}

// 编辑探索权重：先抽城市层级，再在层内抽真实城市。不是人口/经济统计。
// 目标：主流城市 > 非主流城市 > 自治区/边远地区，同时保留全部真实地名。
const TIER_WEIGHTS = [["S", 16], ["A", 32], ["B", 42], ["C", 10]] as const;
const S_CITIES = new Set(["北京市", "上海市", "广州市", "深圳市"]);
const A_CITIES = new Set([
  "成都市", "杭州市", "重庆市", "武汉市", "南京市", "西安市", "苏州市", "天津市",
  "长沙市", "郑州市", "青岛市", "宁波市", "东莞市", "佛山市", "合肥市", "济南市",
  "福州市", "厦门市", "昆明市", "沈阳市", "大连市", "无锡市", "常州市", "珠海市",
  "惠州市", "中山市", "温州市", "绍兴市", "嘉兴市", "台州市", "泉州市", "烟台市",
  "徐州市", "洛阳市", "乌鲁木齐市", "南宁市", "呼和浩特市", "银川市", "兰州市",
  "海口市", "三亚市", "石家庄市", "太原市", "南昌市", "贵阳市", "长春市",
  "哈尔滨市", "芜湖市", "扬州市", "盐城市", "泰州市", "镇江市", "湖州市",
  "株洲市", "湘潭市", "衡阳市", "柳州市", "桂林市", "遵义市", "绵阳市",
  "德阳市", "宜宾市", "泸州市", "南充市", "包头市", "鄂尔多斯市", "大庆市",
  "吉林市", "鞍山市", "抚顺市", "齐齐哈尔市", "秦皇岛市", "唐山市",
]);

function tierOf(city: string): "S" | "A" | "B" | "C" {
  if (S_CITIES.has(city)) return "S";
  if (A_CITIES.has(city)) return "A";
  // 自治州、地区、盟等边远/非主流地区降低权重，但不设为 0。
  if (/(自治州|地区|盟)$/.test(city)) return "C";
  return "B";
}

type Province = (typeof locations)[number];
type City = Province["cities"][number];
const ALL_CITIES: Array<{ province: Province; city: City; tier: "S" | "A" | "B" | "C" }> =
  locations.flatMap(province => province.cities.map(city => ({ province, city, tier: tierOf(city.name) })));

function pick<T>(items: readonly T[], random: () => number): T {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("出生地随机数须在[0,1)内");
  return items[Math.floor(value * items.length)];
}

function pickWeighted<T>(entries: ReadonlyArray<readonly [T, number]>, random: () => number): T {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("出生地随机数须在[0,1)内");
  let roll = value * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [item, weight] of entries) {
    roll -= weight;
    if (roll < 0) return item;
  }
  return entries[entries.length - 1][0];
}

export interface BirthLocationOptions {
  /** 测试或复现实验可关闭层级权重，退回旧的省级/城市等概率抽样。 */
  weighted?: boolean;
}

// 城市层级抽样；这是编辑分布，不是出生人口概率。
export function sampleBirthLocation(
  random: () => number,
  avoidProvinceCodes: readonly string[] = [],
  options: BirthLocationOptions = {},
): BirthLocation {
  const avoided = new Set(avoidProvinceCodes);
  let province: Province;
  let city: City;
  if (options.weighted === false) {
    province = pick(locations, random);
    city = pick(province.cities, random);
  } else {
    const tier = pickWeighted(TIER_WEIGHTS.map(([tier, weight]) => [tier, weight] as const), random);
    const pool = ALL_CITIES.filter(item => item.tier === tier);
    const selected = pickWeighted(pool.map(item => [item, avoided.has(item.province.code) ? 0.25 : 1] as const), random);
    province = selected.province;
    city = selected.city;
  }
  const county = pick(city.counties, random);
  const settlement = pick<BirthLocation["settlement"]>(province.code === "81" || province.code === "82" || county.endsWith("区") || county.endsWith("區")
    ? ["城区"] : /[县縣旗]$/.test(county) ? ["县城", "乡镇", "乡村", "乡村"] : ["城区", "乡镇", "乡村"], random);
  return { provinceCode: province.code, province: province.name, city: city.name, county, settlement };
}

export function validateBirthLocation(value: unknown): BirthLocation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const province = locations.find(province => province.code === row.provinceCode && province.name === row.province);
  const city = province?.cities.find(city => city.name === row.city);
  if (typeof row.county !== "string" || !city?.counties.includes(row.county) || !["城区", "县城", "乡镇", "乡村"].includes(row.settlement as string)) return undefined;
  return { provinceCode: province!.code, province: province!.name, city: city.name, county: row.county, settlement: row.settlement as BirthLocation["settlement"] };
}
