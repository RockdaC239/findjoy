import { describe, expect, it } from "vitest";
import { BIRTH_OCCUPATIONS, sampleParentOccupation, type BirthOccupation } from "./occupations";

const education: BirthOccupation["education"][] = ["义务教育", "高中或中职", "大专或本科", "研究生"];
function seeded(seed: number) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); }

describe("parent occupation catalogue", () => {
  it("provides 100–150 distinct original roles across modern working lives", () => {
    expect(BIRTH_OCCUPATIONS.length).toBeGreaterThanOrEqual(100);
    expect(BIRTH_OCCUPATIONS.length).toBeLessThanOrEqual(150);
    expect(new Set(BIRTH_OCCUPATIONS.map(role => role.id)).size).toBe(BIRTH_OCCUPATIONS.length);
    expect(new Set(BIRTH_OCCUPATIONS.map(role => role.label)).size).toBe(BIRTH_OCCUPATIONS.length);
    expect(new Set(BIRTH_OCCUPATIONS.map(role => role.sector)).size).toBeGreaterThanOrEqual(12);
    expect(BIRTH_OCCUPATIONS.some(role => role.employment === "灵活就业")).toBe(true);
  });
  it("respects required education and excludes recently used roles when alternatives exist", () => {
    for (const level of education) {
      const rng = seeded(37);
      const avoided = sampleParentOccupation(() => 0, { settlement: "乡村", education: level });
      for (let i = 0; i < 300; i++) {
        const role = sampleParentOccupation(rng, { settlement: "乡村", education: level, avoidIds: [avoided.id] });
        expect(education.indexOf(role.education)).toBeLessThanOrEqual(education.indexOf(level));
        expect(role.id).not.toBe(avoided.id);
      }
    }
  });
  it("samples reproducibly by sector and permits rural digital work", () => {
    const run = () => {
      const rng = seeded(123);
      return Array.from({ length: 4000 }, () => sampleParentOccupation(rng, { settlement: "乡村", education: "研究生" }));
    };
    const roles = run();
    expect(roles.map(role => role.id)).toEqual(run().map(role => role.id));
    expect(new Set(roles.map(role => role.sector)).size).toBeGreaterThanOrEqual(12);
    expect(roles.some(role => role.label === "远程软件开发人员")).toBe(true);
    expect(roles.filter(role => /演员|运动员/.test(role.label)).length / roles.length).toBeLessThan(0.04);
  });
  it("handles random boundaries and an exhausted avoid list without returning undefined", () => {
    for (const value of [0, 1, -1, Infinity, NaN]) {
      expect(BIRTH_OCCUPATIONS).toContain(sampleParentOccupation(() => value, {
        settlement: "城市", education: "义务教育", avoidIds: BIRTH_OCCUPATIONS.map(role => role.id),
      }));
    }
  });
});
