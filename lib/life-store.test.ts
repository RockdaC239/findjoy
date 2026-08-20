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
});
