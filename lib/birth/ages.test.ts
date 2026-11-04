import { describe, expect, it } from "vitest";
import { familyAges } from "./ages";
import { rollBirthProfile } from "./profile";

function seeded(seed: number) {
  let value = seed;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

describe("program-maintained family ages", () => {
  it("adds the protagonist's current age to every parent and sibling", () => {
    const profile = rollBirthProfile(seeded(4), { economy: "普通", structure: "双亲完整" });
    const atBirth = familyAges(profile, 0)!;
    const afterThreeYears = familyAges(profile, 3)!;
    expect(afterThreeYears.protagonistAge).toBe(3);
    for (const [index, member] of afterThreeYears.members.entries()) {
      expect(member.currentAge).toBe(member.ageAtBirth + 3);
      expect(member.currentAge).toBe(atBirth.members[index].currentAge + 3);
    }
    expect(profile.parents).toHaveLength(2);
    expect(profile.household.siblings.length).toBeGreaterThanOrEqual(0);
  });
  it("does not mutate the birth profile and handles missing birth data", () => {
    const profile = rollBirthProfile(seeded(8), { economy: "小康", structure: "收养" });
    const before = JSON.stringify(profile);
    familyAges(profile, 5);
    expect(JSON.stringify(profile)).toBe(before);
    expect(familyAges(undefined, 5)).toBeUndefined();
  });
});
