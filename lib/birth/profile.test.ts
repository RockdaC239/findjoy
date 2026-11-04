import { describe, expect, it } from "vitest";
import { BIRTH_OCCUPATIONS } from "./occupations";
import { buildBirthDirective, rollBirthProfile, validateBirthProfile } from "./profile";

function seeded(seed: number) {
  let value = seed;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
const options = { economy: "普通", structure: "双亲完整" };
describe("conditional birth household", () => {
  const minimumAge = { 义务教育: 20, 高中或中职: 22, 大专或本科: 24, 研究生: 27 } as const;
  it("round-trips real catalog entries with parental age and sibling constraints", () => {
    for (let i = 0; i < 80; i++) {
      const profile = rollBirthProfile(seeded(i), options);
      expect(validateBirthProfile(JSON.parse(JSON.stringify(profile)))).toEqual(profile);
      expect(profile.era).toBe("当代中国");
      expect(profile.parents).toHaveLength(2);
      for (const parent of profile.parents) {
        expect(parent.birthAge).toBeGreaterThanOrEqual(parent.role.startsWith("养") ? 28 : minimumAge[parent.education]);
        expect(parent.birthAge).toBeLessThanOrEqual(45);
        expect(BIRTH_OCCUPATIONS).toContainEqual(parent.occupation);
        for (const age of profile.household.siblings) expect(parent.birthAge - age).toBeGreaterThanOrEqual(18);
      }
    }
  });
  it("rejects a parent whose age is impossible for their education", () => {
    const profile = rollBirthProfile(seeded(5), options);
    const [father, mother] = profile.parents;
    expect(validateBirthProfile({ ...profile, parents: [{ ...father, education: "研究生", birthAge: 24 }, { ...mother, education: "义务教育" }] })).toBeUndefined();
  });
  it("represents single, migrant, step and adoptive families without inventing death or institutions", () => {
    const single = rollBirthProfile(seeded(12), { ...options, structure: "单亲" });
    expect(single.parents.filter(parent => parent.status === "同住")).toHaveLength(1);
    const migrant = rollBirthProfile(seeded(12), { ...options, structure: "留守隔代" });
    expect(migrant.parents.every(parent => parent.status === "异地")).toBe(true);
    expect(migrant.household.caregiver).toMatch(/祖辈/);
    const step = rollBirthProfile(seeded(12), { ...options, structure: "再婚家庭" });
    expect(step.parents.some(parent => ["继父", "继母"].includes(parent.role))).toBe(true);
    const adoption = rollBirthProfile(seeded(12), { ...options, structure: "收养" });
    expect(adoption.parents.map(parent => parent.role)).toEqual(["养父", "养母"]);
    expect(adoption.household.caregiver).not.toContain("孤儿院");
  });
  it("keeps resources, income opportunity and housing coherent across economy levels", () => {
    for (const economy of ["拮据", "普通", "小康", "富裕", "大富"]) {
      const profiles = Array.from({ length: 50 }, (_, i) => rollBirthProfile(seeded(i), { ...options, economy }));
      expect(new Set(profiles.map(profile => profile.parents[0].occupation.id)).size).toBeGreaterThan(5);
      for (const profile of profiles) {
        expect(profile.household.resources.length).toBeGreaterThan(0);
        if (economy === "大富") {
          expect(profile.household.housing).not.toContain("临时");
          expect(profile.household.resources).toMatch(/资产|经营|积累/);
        }
      }
    }
  });
  it("rejects forged catalog data, malformed fields and impossible relatives", () => {
    const profile = rollBirthProfile(seeded(3), options);
    expect(validateBirthProfile({ ...profile, parents: profile.parents.map(parent => ({ ...parent, birthAge: 19 })) })).toBeUndefined();
    expect(validateBirthProfile({ ...profile, parents: profile.parents.map(parent => ({ ...parent, birthAge: 46 })) })).toBeUndefined();
    expect(validateBirthProfile({ ...profile, parents: profile.parents.map(parent => ({ ...parent, role: "父亲" })) })).toBeUndefined();
    expect(validateBirthProfile({ ...profile, parents: profile.parents.map(parent => ({ ...parent, status: "缺席" })) })).toBeUndefined();
    expect(validateBirthProfile({ ...profile, location: { ...profile.location, county: "不存在的县" } })).toBeUndefined();
    expect(validateBirthProfile({ ...profile, parents: [{ ...profile.parents[0], occupation: { ...profile.parents[0].occupation, label: "伪造职业" } }] })).toBeUndefined();
    expect(validateBirthProfile({ ...profile, household: { ...profile.household, siblings: [13] } })).toBeUndefined();
    expect(validateBirthProfile({ ...profile, household: { ...profile.household, resources: "x".repeat(500) } })).toBeUndefined();
    expect(validateBirthProfile({ ...profile, household: { ...profile.household, siblings: [10] }, parents: profile.parents.map(parent => ({ ...parent, birthAge: 20 })) })).toBeUndefined();
  });
  it("does not reuse the same parent occupation within one family when alternatives exist", () => {
    for (const structure of ["双亲完整", "单亲", "再婚家庭", "收养"] as const) {
      for (let i = 0; i < 80; i++) {
        const profile = rollBirthProfile(seeded(i), { ...options, structure });
        const ids = profile.parents.map(parent => parent.occupation.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
  it("presents birth facts with age arithmetic and leaves the protagonist's future open", () => {
    const profile = rollBirthProfile(seeded(6), options);
    const directive = buildBirthDirective(profile);
    expect(directive).toContain("出生时");
    expect(directive).toContain("加上主角年龄");
    expect(directive).toContain("不预定");
    expect(directive).toContain("事实边界");
    expect(directive).toContain(profile.location.county);
    expect(directive).not.toContain("provinceCode");
    expect(directive).not.toContain("sampling");
    expect(directive).not.toMatch(/你天生|你注定/);
    expect(rollBirthProfile(seeded(6), options)).toEqual(profile);
  });
});
