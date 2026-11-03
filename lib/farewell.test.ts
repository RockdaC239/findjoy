import { expect, it } from "vitest";
import { farewellLines } from "./farewell";
it("keeps the terminal story in readable lines and uses factual text for old saves", () => {
  expect(farewellLines("你望向窗外。\n天快亮了。", "自然离世")).toEqual(["你望向窗外。", "天快亮了。"]);
  expect(farewellLines(undefined, "因病离世")).toEqual(["你因病离世。", "这一生，停在了这里。"]);
});
