import { describe, expect, it } from "vitest";
import locations from "./data/locations.json";
import { sampleBirthLocation, validateBirthLocation } from "./locations";

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
    for (let i = 0; i < locations.length; i++) {
      const rolls = [(i + 0.5) / locations.length, 0.5, 0.5, 0.5];
      const next = () => rolls.shift() ?? 0;
      const sampled = sampleBirthLocation(next);
      const province = locations[i];
      expect(sampled.provinceCode).toBe(province.code);
      expect(province.name).toBe(sampled.province);
      const city = province.cities.find(c => c.name === sampled.city);
      expect(city?.counties).toContain(sampled.county);
      expect(["城区", "县城", "乡镇", "乡村"]).toContain(sampled.settlement);
    }
  });
  it("avoids recent provinces, falls back when all were used, and rejects invalid RNG values", () => {
    const avoided = locations.slice(0, -1).map(p => p.code);
    expect(sampleBirthLocation(() => 0, avoided).provinceCode).toBe(locations.at(-1)?.code);
    expect(sampleBirthLocation(() => 0, locations.map(p => p.code)).provinceCode).toBe(locations[0].code);
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
