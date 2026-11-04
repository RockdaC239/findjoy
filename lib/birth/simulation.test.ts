import { describe, expect, it } from "vitest";
import { rollBirthProfile } from "./profile";
import { buildBirthDirective } from "./profile";
import { parseSimulationArgs, seededRandom, compatibleManifest, renderBirthReport, summarizeBirthSamples, type BirthSample } from "./simulation";

describe("synthetic opening simulation", () => {
  it("requires an explicit live flag and validates count and seed", () => {
    expect(parseSimulationArgs([])).toMatchObject({ live: false, count: 50 });
    expect(parseSimulationArgs(["--live", "--count", "50", "--seed", "91"])).toMatchObject({ live: true, count: 50, seed: 91 });
    for (const args of [["--count", "0"], ["--count", "1.2"], ["--seed", "NaN"], ["--seed", "9007199254740993"], ["--wat"]]) expect(() => parseSimulationArgs(args)).toThrow();
  });
  it("replays random draws for a sample independent of previous sample consumption", () => {
    const sequence = (seed: number) => { const rng = seededRandom(seed); return Array.from({ length: 20 }, rng); };
    expect(sequence(90)).toEqual(sequence(90));
    expect(sequence(90)).not.toEqual(sequence(91));
    expect(sequence(90).every(value => value >= 0 && value < 1)).toBe(true);
  });
  it("refuses mixed-model, changed-source or changed-run resume", () => {
    const run = { live: true, count: 50, seed: 1, model: "deepseek-flash", fingerprint: "abc" };
    expect(compatibleManifest(run, { ...run })).toBe(true);
    for (const change of [{ live: false }, { count: 49 }, { seed: 2 }, { model: "other" }, { fingerprint: "def" }]) expect(compatibleManifest(run, { ...run, ...change })).toBe(false);
  });
  it("reports all samples including failed ones and treats similarity as a signal only", () => {
    const profile = rollBirthProfile(() => 0.3, { economy: "普通", structure: "双亲完整" });
    const city = `${profile.location.province}·${profile.location.city}·${profile.location.county}`;
    const samples: BirthSample[] = [
      {
        index: 1, seed: 1, status: "ok", durationMs: 100, initial: { ...profile, background: { economy: "普通", structure: "双亲完整", event: "安稳温暖" } },
        startState: {
          basic: { age: 0, gender: "female", city, education: "未开始" },
          career: { occupation: "婴儿", companyType: "家庭", incomeYearly: 0, careerStage: "childhood" },
          finance: { cash: 8000, assets: 8000, debt: 0, housing: profile.household.housing },
          health: { physical: 92, conditions: [], lifestyle: "普通" },
          relationships: { partner: { status: "单身", years: 0 }, children: [], parents: { status: "同住" }, friends: [] },
          flags: { bgEconomy: "普通", bgStructure: "双亲完整", bgEvent: "安稳温暖" },
          scenario: { mode: "normal" },
        },
        event: { timePassed: 5, story: "你五岁，家里换了窗。", event: { title: "换窗", type: "family", importance: 0.5 }, choices: [], objectiveChanges: {} },
      },
      { index: 2, seed: 2, status: "error", durationMs: 500, initial: { province: "乙" }, error: "模型请求失败" },
    ];
    const report = renderBirthReport(samples, { live: true, count: 2, seed: 1, model: "deepseek-flash", fingerprint: "abc" });
    expect(report).toContain("## 001");
    expect(report).toContain("## 002");
    expect(report).toContain("出生地点");
    expect(report).toContain("父母（主角出生时）");
    expect(report).toContain("程序写入的开局状态");
    expect(report).toContain("交给模型的出生设定");
    expect(report).toContain("模型请求失败");
    expect(report).toContain("启发式");
    expect(summarizeBirthSamples(samples)).toMatchObject({
      total: 2, ok: 1, error: 1, validProfiles: 1, missingStartStates: 1,
      structures: { 双亲完整: 1 }, economies: { 普通: 1 }, eventGenres: { 安稳温暖: 1 },
      duplicateOccupations: [],
    });
    expect(summarizeBirthSamples(samples).warnings.some(warning => warning.message.includes("缺少调用前开局状态快照"))).toBe(true);
  });
  it("shows pre-model settings in a dry report without pretending a model ran", () => {
    const profile = rollBirthProfile(() => 0.7, { economy: "大富", structure: "收养" });
    const report = renderBirthReport([{
      index: 1, seed: 1, status: "dry", durationMs: 0, initial: { ...profile, background: { economy: "大富", structure: "收养", event: "家庭变故" } },
    }], { live: false, count: 1, seed: 1, model: "deepseek-flash", fingerprint: "abc" });
    expect(report).toContain("只采样（未调用模型）");
    expect(report).toContain("未调用模型（dry run）");
    expect(report).toContain(buildBirthDirective(profile).slice(0, 40));
    expect(report).not.toContain("规范化事件");
  });
});
