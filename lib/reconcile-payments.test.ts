import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const script = path.resolve(__dirname, "../scripts/reconcile-payments.mjs");
const run = promisify(execFile);
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function server(handler: (authorization: string) => { status: number; body: unknown }) {
  const instance = createServer((request, response) => {
    const result = handler(String(request.headers.authorization ?? ""));
    response.writeHead(result.status, { "Content-Type": "application/json", Connection: "close" });
    response.end(JSON.stringify(result.body));
  });
  servers.push(instance);
  await new Promise<void>((resolve) => instance.listen(0, "127.0.0.1", () => resolve()));
  const address = instance.address();
  if (!address || typeof address === "string") throw new Error("server address unavailable");
  return `http://127.0.0.1:${address.port}/findjoy`;
}

const env = (base: string, token = "x".repeat(40)) => ({
  ...process.env,
  FINDJOY_RECONCILE_TOKEN: token,
  FINDJOY_INTERNAL_BASE_URL: base,
  FINDJOY_ALERT_WEBHOOK: "",
});

async function execute(environment: NodeJS.ProcessEnv) {
  try {
    const result = await run(process.execPath, [script], { env: environment, encoding: "utf8" });
    return { status: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { status: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

describe("payment reconciliation runner", () => {
  it("posts the bearer token and reports checked/unconfirmed counts", async () => {
    let authorization = "";
    const base = await server((value) => { authorization = value; return { status: 200, body: { checked: 3, unconfirmed: 1 } }; });
    const result = await execute(env(base));
    expect(result.status).toBe(0);
    expect(authorization).toBe(`Bearer ${"x".repeat(40)}`);
    expect(JSON.parse(result.stdout)).toEqual({ checked: 3, unconfirmed: 1 });
    expect(result.stderr).toContain("1 order(s) not confirmed");
  });

  it("fails closed on a non-success response and does not leak the token", async () => {
    const base = await server(() => ({ status: 500, body: { error: "database unavailable" } }));
    const result = await execute(env(base));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[reconcile] failed at request");
    expect(result.stderr).not.toContain("x".repeat(40));
  });

  it("refuses a short token before making a request", async () => {
    const result = await execute(env("http://127.0.0.1:1/findjoy", "short"));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("too short");
  });
});
