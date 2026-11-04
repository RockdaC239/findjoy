import locations from "./data/locations.json";

export interface BirthLocation {
  provinceCode: string;
  province: string;
  city: string;
  county: string;
  settlement: "城区" | "县城" | "乡镇" | "乡村";
}

function pick<T>(items: readonly T[], random: () => number): T {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("出生地随机数须在[0,1)内");
  return items[Math.floor(value * items.length)];
}

// 省级等权探索，再采样市县；这是编辑分布，不是出生人口概率。
export function sampleBirthLocation(random: () => number, avoidProvinceCodes: readonly string[] = []): BirthLocation {
  const fresh = locations.filter(province => !avoidProvinceCodes.includes(province.code));
  const province = pick(fresh.length ? fresh : locations, random);
  const city = pick(province.cities, random);
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
