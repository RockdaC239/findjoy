import { describe, expect, it } from "vitest";
import { createStarterLife } from "./life";
import { lifeStore } from "./life-store";

describe("life store", () => {
  it("persists and retrieves a life state", () => {
    const life = createStarterLife();
    lifeStore.set(life);

    expect(lifeStore.get(life.lifeId)?.basic.age).toBe(0);
    expect(lifeStore.get(life.lifeId)?.lifeId).toBe(life.lifeId);
  });

  it("overwrites an existing life on re-set", () => {
    const life = createStarterLife();
    lifeStore.set(life);
    life.basic.city = "杭州";
    lifeStore.set(life);

    expect(lifeStore.get(life.lifeId)?.basic.city).toBe("杭州");
  });

  it("returns null for a missing life", () => {
    expect(lifeStore.get("missing-life")).toBeNull();
  });

  it("deletes a stored life", () => {
    const life = createStarterLife();
    lifeStore.set(life);
    lifeStore.delete(life.lifeId);

    expect(lifeStore.get(life.lifeId)).toBeNull();
  });

  it("persists and overwrites a conversation transcript per life", () => {
    const life = createStarterLife();
    const transcript = [
      { role: "user" as const, content: "第一轮输入" },
      { role: "assistant" as const, content: "第一轮输出" },
    ];
    lifeStore.setTranscript(life.lifeId, transcript);
    expect(lifeStore.getTranscript(life.lifeId)).toEqual(transcript);

    const extended = [...transcript, { role: "user" as const, content: "第二轮输入" }];
    lifeStore.setTranscript(life.lifeId, extended);
    expect(lifeStore.getTranscript(life.lifeId)).toEqual(extended);
  });

  it("returns null for a transcript of a life that never had one (legacy save)", () => {
    const life = createStarterLife();
    lifeStore.set(life);

    expect(lifeStore.getTranscript(life.lifeId)).toBeNull();
  });

  it("removes the transcript together with the life", () => {
    const life = createStarterLife();
    lifeStore.setTranscript(life.lifeId, [{ role: "user" as const, content: "x" }]);
    lifeStore.delete(life.lifeId);

    expect(lifeStore.getTranscript(life.lifeId)).toBeNull();
  });

  it("collects recently-used background dimensions for the next life to avoid", () => {
    const remarried = createStarterLife();
    remarried.flags = { bgEconomy: "小康", bgStructure: "再婚家庭", bgEvent: "机会降临" };
    const upheaval = createStarterLife();
    upheaval.flags = { bgEconomy: "普通", bgStructure: "单亲", bgEvent: "家庭变故" };
    lifeStore.set(upheaval);
    lifeStore.set(remarried);

    const avoid = lifeStore.recentBackgroundAvoid(5);
    expect(avoid.structure).toContain("再婚家庭");
    expect(avoid.event).toContain("家庭变故");
  });

  it("collects recent lives' main storylines for the next life to avoid", () => {
    const athlete = createStarterLife({ age: 24 });
    athlete.career.occupation = "运动员";
    athlete.history = [{ id: "1", age: 18, type: "career", title: "进省队", story: "你加入了省队。", importance: 0.8, objectiveChanges: { occupation: "运动员" } }] as never;
    const painter = createStarterLife({ age: 30 });
    painter.career.occupation = "画家";
    painter.history = [{ id: "1", age: 22, type: "career", title: "成为画家", story: "你开始了创作。", importance: 0.8, objectiveChanges: { occupation: "画家" } }] as never;
    lifeStore.set(painter);
    lifeStore.set(athlete);

    const storylines = lifeStore.recentStorylines(100);
    expect(storylines).toContain("sports");
    expect(storylines).toContain("arts");
  });

  it("lists life summaries with correct fields", () => {
    const first = createStarterLife();
    const second = createStarterLife();
    first.basic.age = 30;
    second.basic.age = 50;
    lifeStore.set(second);
    lifeStore.set(first);

    const summaries = lifeStore.listSummaries();
    const firstSummary = summaries.find((item) => item.lifeId === first.lifeId);
    expect(firstSummary?.age).toBe(30);
    expect(firstSummary?.city).toBe(first.basic.city);
    expect(summaries.some((item) => item.lifeId === second.lifeId && item.age === 50)).toBe(true);
  });
});
