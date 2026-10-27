import { describe, expect, it } from "vitest";
import { musicSceneFor } from "./music-scene";

describe("musicSceneFor", () => {
  it("uses calm start and reflective review scenes", () => {
    expect(musicSceneFor({ phase: "start" })).toMatchObject({ id: "start", mood: "calm" });
    expect(musicSceneFor({ phase: "review" })).toMatchObject({ id: "review", mood: "reflective" });
  });

  it("follows the current event type in normal lives", () => {
    expect(musicSceneFor({ phase: "event", eventType: "relationship", scenario: { mode: "normal" } })).toMatchObject({
      id: "event-relationship",
      mood: "warm",
    });
    expect(musicSceneFor({ phase: "event", eventType: "health", scenario: { mode: "normal" } })).toMatchObject({
      id: "event-health",
      mood: "reflective",
    });
    expect(musicSceneFor({ phase: "event" })).toMatchObject({ id: "event-random" });
  });

  it("uses the theme as the dominant mood", () => {
    expect(musicSceneFor({ phase: "event", scenario: { mode: "theme", theme: "love" }, eventType: "career" })).toMatchObject({
      id: "theme-love",
      mood: "warm",
    });
    expect(musicSceneFor({ phase: "event", scenario: { mode: "theme", theme: "career" }, eventType: "health" })).toMatchObject({
      id: "theme-career",
      mood: "calm",
    });
  });

  it("uses era-specific colors for script lives", () => {
    const base = {
      mode: "script" as const,
      scriptId: "x",
      eraId: "republic",
      eraLabel: "民国",
      eraYears: "1930s",
      title: "x",
      tagline: "x",
      premise: "x",
      hook: "x",
      coreConflict: "x",
      tone: "x",
      eventType: "relationship" as const,
      start: { age: 24, city: "上海", occupation: "编辑" },
      startAge: 24,
      directive: "x",
    };
    expect(musicSceneFor({ phase: "event", scenario: base, eventType: "relationship" })).toMatchObject({
      id: "era-republic",
      mood: "tense",
    });
    expect(musicSceneFor({ phase: "event", scenario: { ...base, eraId: "2000s" } })).toMatchObject({
      id: "era-2000s",
      mood: "bright",
    });
  });

  it("gives ForU a reflective, non-triumphant bed", () => {
    const scenario = {
      mode: "foru" as const,
      brief: {
        age: 29,
        city: "上海",
        occupation: "产品经理",
        family: "",
        relationship: "single" as const,
        economy: "ordinary" as const,
        health: "ordinary" as const,
        housing: "rent" as const,
        situation: "最近公司在裁员，我在考虑要不要回老家。",
        focus: "",
      },
    };
    const first = musicSceneFor({ phase: "event", scenario, eventType: "career" });
    expect(first).toMatchObject({ id: "foru", mood: "reflective" });
    // 稳定引用，避免每次渲染都触发场景同步 effect。
    expect(musicSceneFor({ phase: "event", scenario, eventType: "career" })).toBe(first);
  });
});
