import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("./auth", () => ({ currentUser: async () => null }));
vi.mock("./commerce-store", () => ({ commerceStore: { expireOperations: async () => {} } }));
import PlansPage from "../app/plans/page";

afterEach(() => vi.unstubAllEnvs());

it("shows two free lives, a purchasable single life and four packs while hiding the recharge self-link", async () => {
  vi.stubEnv("FINDJOY_PAYMENTS_MODE", "demo");
  vi.stubEnv("FINDJOY_TRIAL_CREDITS", undefined);
  const html = renderToStaticMarkup(await PlansPage());
  const text = html.replace(/<[^>]*>/g, "");
  expect(html).toContain("<h1>给好奇心，多一点可能</h1>");
  expect(text).toContain("新用户注册赠送 40 积分，可免费体验 2 次普通模式");
  expect(text).toContain("普通模式单次购买");
  expect(text).toContain("¥5.90");
  expect(text).not.toContain("不必抵达某个标准答案");
  expect(text).not.toContain("只是再出发一次");
  expect(html).toContain("product%3Dsingle");
  expect(html).not.toMatch(/href="(?:\/findjoy)?\/plans"/);
  expect((html.match(/class="plan-card(?: plan-card-featured)?\s*"/g) ?? [])).toHaveLength(4);
  expect(html).toMatch(/plan-card-featured[\s\S]*?标准包[\s\S]*?class="plan-unit-price">折合 ¥3\.98\/局，比单次购买省约 33%/);
  expect(text).not.toContain("普通人生");
  expect(text).not.toContain("故事优先于数字");
  expect(html).toContain('class="credit-pill points-usage-trigger" type="button">积分使用说明</button>');
  expect(html).toContain('<dialog class="points-usage-dialog"');
  expect(html).not.toContain('class="purchase-notes"');
  for (const price of ["4.95", "3.98", "3.63", "3.33"]) expect(text).toContain(`¥${price}/局`);
});
