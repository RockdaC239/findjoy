import { describe, expect, it } from "vitest";
import locations from "./data/locations.json";
import { sampleBirthLocation, validateBirthLocation } from "./locations";

function seeded(seed: number) {
  let value = seed;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
const S = new Set(["北京市", "上海市", "广州市", "深圳市"]);
const A = new Set([
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
const tier = (city: string) => S.has(city) ? "S" : A.has(city) ? "A" : /(自治州|地区|盟)$/.test(city) ? "C" : "B";

describe("birth location sampling", () => {
  it("covers all 34 provincial entries and never uses grouping labels as city names", () => {
    expect(locations).toHaveLength(34);
    expect(new Set(locations.map(p => p.code)).size).toBe(34);
    for (const province of locations) {
      expect(province.cities.length).toBeGreaterThan(0);
      for (const city of province.cities) {
        expect(city.name).not.toMatch(/^(市辖区|县|省直辖县级行政区划|自治区直辖县级行政区划)$/);
        expect(city.counties.length).toBeGreaterThan(0);
      }
    }
  });
  it("samples a real hierarchy for every province and permits deterministic replay", () => {
    const run = (seed: number) => {
      const rng = seeded(seed);
      return Array.from({ length: 5000 }, () => sampleBirthLocation(rng));
    };
    const first = run(20261104);
    expect(first.map(item => `${item.provinceCode}/${item.city}/${item.county}`)).toEqual(run(20261104).map(item => `${item.provinceCode}/${item.city}/${item.county}`));
    const seen = new Set(first.map(item => item.provinceCode));
    expect(seen.size).toBe(34);
    for (const sampled of first) {
      const province = locations.find(p => p.code === sampled.provinceCode);
      expect(province?.name).toBe(sampled.province);
      const city = province?.cities.find(c => c.name === sampled.city);
      expect(city?.counties).toContain(sampled.county);
      expect(["城区", "县城", "乡镇", "乡村"]).toContain(sampled.settlement);
    }
  });
  it("weights mainstream cities above non-mainstream and autonomous/remote areas", () => {
    const rng = seeded(7);
    const counts = { S: 0, A: 0, B: 0, C: 0 };
    for (let i = 0; i < 5000; i++) counts[tier(sampleBirthLocation(rng).city)]++;
    expect(counts.S / 5000).toBeGreaterThan(0.10);
    expect(counts.A / 5000).toBeGreaterThan(0.20);
    expect(counts.B / 5000).toBeGreaterThan(0.30);
    expect(counts.C / 5000).toBeLessThan(0.15);
    expect(counts.S + counts.A).toBeGreaterThan(counts.B);
    expect(counts.B).toBeGreaterThan(counts.C);
  });
  it("soft-avoids recent provinces and rejects invalid RNG values", () => {
    const countBeijing = (avoid: string[]) => {
      const rng = seeded(11);
      let count = 0;
      for (let i = 0; i < 5000; i++) if (sampleBirthLocation(rng, avoid).provinceCode === "11") count++;
      return count;
    };
    const normal = countBeijing([]);
    const avoided = countBeijing(["11"]);
    expect(avoided).toBeLessThan(normal);
    expect(avoided).toBeGreaterThan(0);
    for (const n of [NaN, -1, 1, Infinity]) expect(() => sampleBirthLocation(() => n)).toThrow();
  });
  it("validates actual parentage without treating settlement as an administrative rank", () => {
    const location = sampleBirthLocation(() => 0);
    expect(validateBirthLocation(location)).toEqual(location);
    expect(validateBirthLocation({ ...location, county: "不存在的县" })).toBeUndefined();
    expect(validateBirthLocation({ ...location, province: "四川省" })).toBeUndefined();
    expect(validateBirthLocation({ ...location, settlement: "省会" })).toBeUndefined();
    expect(validateBirthLocation({ ...location, settlement: "乡村", extra: "ignored" })).toEqual({ ...location, settlement: "乡村" });
  });
});
