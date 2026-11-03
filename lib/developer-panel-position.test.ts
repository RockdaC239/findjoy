import { expect, it } from "vitest";
import { developerPanelPosition } from "./developer-panel-position";
it("opens eight pixels below the clicked debug icon", () => {
  expect(developerPanelPosition({ left: 160, top: 30, bottom: 74 }, { width: 320, height: 300 }, { width: 1280, height: 800 })).toEqual({ left: 160, top: 82, maxHeight: 702 });
});
it("stays inside the right edge and flips above a low icon", () => {
  expect(developerPanelPosition({ left: 1200, top: 650, bottom: 694 }, { width: 320, height: 300 }, { width: 1280, height: 720 })).toEqual({ left: 944, top: 342, maxHeight: 626 });
});
it("keeps a narrow screen panel within sixteen-pixel gutters", () => {
  expect(developerPanelPosition({ left: 100, top: 20, bottom: 64 }, { width: 288, height: 340 }, { width: 320, height: 600 })).toEqual({ left: 16, top: 72, maxHeight: 512 });
});
it("limits tall content to available space", () => {
  const position = developerPanelPosition({ left: 100, top: 200, bottom: 244 }, { width: 288, height: 700 }, { width: 320, height: 500 });
  expect(position.top + position.maxHeight).toBe(484);
});
