import { describe, expect, it, vi } from "vitest";
import { apiErrorResponse, readJsonBody, readJsonObject, RequestBodyError, withApiGuard } from "./api-request";
import { isDatabaseUnavailable } from "./database";

describe("request body limits", () => {
  it("parses a JSON object and treats an empty body as an empty object", async () => {
    expect(await readJsonBody(new Request("http://local", { method: "POST", body: '{"a":1}' }))).toEqual({ a: 1 });
    expect(await readJsonBody(new Request("http://local", { method: "POST" }))).toEqual({});
  });

  it("rejects malformed JSON, non-object JSON and invalid UTF-8", async () => {
    await expect(readJsonObject(new Request("http://local", { method: "POST", body: "{" }))).rejects.toMatchObject({ status: 400, code: "INVALID_BODY" });
    await expect(readJsonObject(new Request("http://local", { method: "POST", body: "[1,2]" }))).rejects.toMatchObject({ status: 400 });
    await expect(readJsonObject(new Request("http://local", { method: "POST", body: "null" }))).rejects.toMatchObject({ status: 400 });
    await expect(readJsonBody(new Request("http://local", { method: "POST", body: new Uint8Array([0xff, 0xfe]) }))).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an oversized declared or actual body before parsing", async () => {
    await expect(readJsonBody(new Request("http://local", { method: "POST", headers: { "content-length": "999" }, body: "{}" }), 10))
      .rejects.toMatchObject({ status: 413, code: "BODY_TOO_LARGE" });
    await expect(readJsonBody(new Request("http://local", { method: "POST", body: JSON.stringify({ value: "x".repeat(64) }) }), 16))
      .rejects.toMatchObject({ status: 413 });
  });
});

describe("database unavailability classification", () => {
  it("recognizes connection, authentication, missing database and capacity errors", () => {
    for (const code of ["ECONNREFUSED", "28P01", "3D000", "53300", "57P03"]) {
      expect(isDatabaseUnavailable(Object.assign(new Error("failed"), { code }))).toBe(true);
    }
    expect(isDatabaseUnavailable(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBe(true);
    expect(isDatabaseUnavailable(new Error("必须配置 DATABASE_URL，数据库不可用时不回退临时存储"))).toBe(true);
    expect(isDatabaseUnavailable(Object.assign(new Error("outer"), { cause: { code: "ECONNRESET" } }))).toBe(true);
  });

  it("does not turn business or validation failures into 503", () => {
    expect(isDatabaseUnavailable(Object.assign(new Error("duplicate"), { code: "23505" }))).toBe(false);
    expect(isDatabaseUnavailable(new Error("昵称格式无效"))).toBe(false);
    expect(isDatabaseUnavailable(null)).toBe(false);
  });
});

describe("API error guard", () => {
  it("returns a retryable 503 for database failures without leaking details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = apiErrorResponse(Object.assign(new Error("postgresql://user:secret@db/findjoy"), { code: "57P03" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({ error: "服务暂时不可用，请稍后重试", code: "SERVICE_UNAVAILABLE" });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(log).toHaveBeenCalledWith("[api] database unavailable");
    log.mockRestore();
  });

  it("maps body errors and hides unexpected error details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const tooLarge = apiErrorResponse(new RequestBodyError(413, "BODY_TOO_LARGE", "请求内容过大"));
    expect(tooLarge.status).toBe(413);
    expect((await tooLarge.json()).code).toBe("BODY_TOO_LARGE");

    const guarded = withApiGuard(async () => { throw new Error("secret stack"); });
    const response = await guarded();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(log).toHaveBeenCalledWith("[api] unhandled route error");
    log.mockRestore();
  });
});
