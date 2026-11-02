import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ limit: vi.fn(), authorize: vi.fn(), begin: vi.fn() }));
vi.mock("./rate-limit", () => ({ takeRateLimit: mocks.limit }));
vi.mock("./authing", () => ({ authorizationRequest: mocks.authorize }));
vi.mock("./identity-store", () => ({ identityStore: { beginLogin: mocks.begin } }));
vi.mock("./auth", () => ({ appOrigin: () => "http://localhost:3000", cookieOptions: () => ({}), LOGIN_COOKIE: "findjoy_login" }));
import { GET } from "../app/api/auth/login/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  mocks.limit.mockReset();
  mocks.authorize.mockReset();
  mocks.begin.mockReset();
});

it("returns a recoverable login redirect when the database limiter is unavailable", async () => {
  vi.stubEnv("FINDJOY_APP_ORIGIN", "http://localhost:3000");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.limit.mockRejectedValueOnce(new Error("postgresql://secret@db/findjoy"));
  const response = await GET(new Request("http://localhost:3000/findjoy/api/auth/login"));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("http://localhost:3000/findjoy/login?error=unavailable");
  expect(mocks.authorize).not.toHaveBeenCalled();
  expect(mocks.begin).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith("[auth] login unavailable at rate-limit");
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
});

it("reports a fixed authorization stage without leaking the upstream error", async () => {
  vi.stubEnv("FINDJOY_APP_ORIGIN", "http://localhost:3000");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.limit.mockResolvedValueOnce(true);
  mocks.authorize.mockRejectedValueOnce(new Error("https://findjoy.authing.cn?code=secret"));
  const response = await GET(new Request("http://localhost:3000/findjoy/api/auth/login?returnTo=/findjoy/lives"));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("http://localhost:3000/findjoy/login?error=unavailable");
  expect(mocks.begin).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith("[auth] login unavailable at authorization");
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
});

it("sets a short-lived login cookie and redirects to the authorization server", async () => {
  vi.stubEnv("FINDJOY_APP_ORIGIN", "http://localhost:3000");
  mocks.limit.mockResolvedValueOnce(true);
  mocks.authorize.mockResolvedValueOnce({ url: new URL("https://findjoy.authing.cn/oidc/auth?state=s"), pending: { state: "s" } });
  mocks.begin.mockResolvedValueOnce("login-token");
  const response = await GET(new Request("http://localhost:3000/findjoy/api/auth/login?returnTo=/findjoy/lives"));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("https://findjoy.authing.cn/oidc/auth?state=s");
  expect(response.headers.get("set-cookie")).toContain("findjoy_login=login-token");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.authorize).toHaveBeenCalledWith("/findjoy/lives");
});
