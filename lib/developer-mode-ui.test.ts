import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { DeveloperModeProvider } from "../components/DeveloperMode";
import { DeveloperLauncher } from "../components/DeveloperLauncher";
import { BrandLogo } from "../components/BrandLogo";
function render(enabled: boolean) {
  return renderToStaticMarkup(createElement(DeveloperModeProvider, { allowed: true, initial: { enabled, mock: false } }, createElement(BrandLogo, { href: "/" })));
}
function renderLauncher() {
  return renderToStaticMarkup(createElement(DeveloperModeProvider, { allowed: true, initial: { enabled: false, mock: false } }, createElement(DeveloperLauncher)));
}
it("keeps normal navigation unchanged and adds only the dev marker and debug icon when enabled", () => {
  const normal = render(false);
  expect(normal).not.toContain("brandGroup");
  expect(normal).not.toContain("调试遥控器");
  const dev = render(true);
  expect(dev).toContain('aria-label="dev 调试模式"');
  expect(dev).toContain('aria-label="打开调试遥控器"');
  expect(dev).toContain('aria-expanded="false"');
  expect(dev).not.toContain("普通模式 Mock");
  expect(dev).not.toContain("页面调试工具");
  expect(dev).not.toContain('role="dialog"');
});
it("offers the admin console from the three-tap developer entry", () => {
  const html = renderLauncher();
  expect(html).toContain("进入后台");
  expect(html).toContain('href="/admin"');
});

