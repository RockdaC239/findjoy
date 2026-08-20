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
