import { describe, expect, it } from "vitest";
import { appPathWithoutBase, safeReturnTo, hasSameOrigin } from "./auth-policy";

describe("authentication redirects and writes", () => {
  it("only returns to this product, including rejecting encoded redirect tricks", () => {
    expect(safeReturnTo("/findjoy/plans?from=login")).toBe("/findjoy/plans?from=login");
    for (const path of ["//evil.test", "https://evil.test", "/findjoy-other", "/findjoy/../admin", "/findjoy/\\evil", "/findjoy/%2e%2e/admin", "/findjoy/%0aevil", "/findjoy/api/auth/login"]) {
      expect(safeReturnTo(path)).toBe("/findjoy");
    }
  });
  it("strips the base path before handing a path to redirect()", () => {
    expect(appPathWithoutBase("/findjoy")).toBe("/");
    expect(appPathWithoutBase("/findjoy/plans?from=login")).toBe("/plans?from=login");
    expect(appPathWithoutBase("/findjoy#top")).toBe("#top");
    expect(appPathWithoutBase("/plans")).toBe("/plans");
  });
  it("rejects cross-site and missing-origin browser writes", () => {
    expect(hasSameOrigin(new Request("https://findfire.club/findjoy/api/auth/logout", {headers:{origin:"https://findfire.club"}}), "https://findfire.club")).toBe(true);
    expect(hasSameOrigin(new Request("https://findfire.club/findjoy/api/auth/logout", {headers:{origin:"https://evil.test"}}), "https://findfire.club")).toBe(false);
    expect(hasSameOrigin(new Request("https://findfire.club/findjoy/api/auth/logout"), "https://findfire.club")).toBe(false);
  });
});
