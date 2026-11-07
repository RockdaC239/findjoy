import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ user: vi.fn(), access: vi.fn(), countUsers: vi.fn() }));
vi.mock("./auth", () => ({ currentUser: mocks.user }));
vi.mock("./developer", () => ({ hasDeveloperAccess: mocks.access }));
vi.mock("./identity-store", () => ({ identityStore: { countUsers: mocks.countUsers } }));
vi.mock("./commerce-store", () => ({ commerceStore: { expireOperations: async () => {}, balance: async () => ({ available: 0, held: 0 }) } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ toString: () => "" }) }));
import PlansPage from "../app/plans/page";

beforeEach(() => {
  mocks.user.mockResolvedValue(null);
  mocks.access.mockResolvedValue(false);
  mocks.countUsers.mockResolvedValue(12);
});
afterEach(() => vi.unstubAllEnvs());

it("shows the early signup gift, a purchasable single life and four packs while hiding the recharge self-link", async () => {
  vi.stubEnv("FINDJOY_PAYMENTS_MODE", "demo");
  vi.stubEnv("FINDJOY_TRIAL_CREDITS", undefined);
  const html = renderToStaticMarkup(await PlansPage());
  const text = html.replace(/<[^>]*>/g, "");
  expect(html).toContain("<h1>给好奇心，多一点可能</h1>");
  expect(text).toContain("前 100 位新用户注册赠送 100 积分，可免费体验 5 次普通模式");
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

it("以登录账号渲染积分余额，且不因普通登录就露出开发者测试套餐", async () => {
  vi.stubEnv("FINDJOY_PAYMENTS_MODE", "demo");
  mocks.user.mockResolvedValue({ id: "owner", displayName: "探索者" });
  const html = renderToStaticMarkup(await PlansPage());
  expect(html.replace(/<[^>]*>/g, "")).not.toContain("开发者测试支付");
  expect(html).not.toContain("测试支付 ¥0.01");
});

it("调试模式开启后才渲染一分钱测试套餐", async () => {
  vi.stubEnv("FINDJOY_PAYMENTS_MODE", "demo");
  mocks.user.mockResolvedValue({ id: "owner", displayName: "探索者" });
  mocks.access.mockResolvedValue(true);
  const html = renderToStaticMarkup(await PlansPage());
  const text = html.replace(/<[^>]*>/g, "");
  expect(mocks.access).toHaveBeenCalledWith({ id: "owner", displayName: "探索者" }, expect.anything());
  expect(text).toContain("开发者测试支付");
  expect(text).toContain("仅本人可见 · 20 积分 · 演示模式，不会真实扣款");
  expect(html).toContain("预览测试订单");
});

it("前 100 位注册名额用完后回到可配置的普通赠送额度", async () => {
  vi.stubEnv("FINDJOY_PAYMENTS_MODE", "demo");
  vi.stubEnv("FINDJOY_TRIAL_CREDITS", undefined);
  mocks.countUsers.mockResolvedValue(100);
  const text = renderToStaticMarkup(await PlansPage()).replace(/<[^>]*>/g, "");
  expect(text).toContain("新用户注册赠送 40 积分，可免费体验 2 次普通模式");
  expect(text).not.toContain("前 100 位新用户");
});
