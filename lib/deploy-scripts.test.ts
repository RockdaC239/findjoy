import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const switchScript = path.join(root, "deploy/switch-release.sh");
let server: string;

beforeAll(async () => {
  server = await mkdtemp(path.join(tmpdir(), "findjoy-release-"));
  for (const name of ["r1", "r2", "r3"]) {
    await mkdir(path.join(server, "releases", name), { recursive: true });
    await writeFile(path.join(server, "releases", name, "marker"), name);
  }
  const base = new Date("2026-01-01T00:00:00Z").getTime() / 1000;
  await utimes(path.join(server, "releases/r1"), base, base);
  await utimes(path.join(server, "releases/r2"), base + 86400, base + 86400);
  await utimes(path.join(server, "releases/r3"), base + 172800, base + 172800);
});

afterAll(async () => { await rm(server, { recursive: true, force: true }); });

const run = (...args: string[]) => execFileSync("bash", [switchScript, ...args], { encoding: "utf8" }).trim();
const release = (name: string) => path.join(server, "releases", name);

describe("deployment scripts", () => {
  it("have valid bash syntax", () => {
    for (const script of ["deploy-production.sh", "apply-nginx.sh", "render-nginx.sh", "switch-release.sh"]) {
      const result = spawnSync("bash", ["-n", path.join(root, "deploy", script)], { encoding: "utf8" });
      expect(result.status, `${script}: ${result.stderr}`).toBe(0);
    }
  });

  it("switches current atomically and rolls back to the previous release", async () => {
    run("switch", server, release("r1"));
    expect(await stat(path.join(server, "current"))).toBeTruthy();
    expect(run("resolve", server)).toBe(await realpath(release("r1")));
    run("switch", server, release("r2"));
    expect(run("resolve", server)).toBe(await realpath(release("r2")));
    run("rollback", server, release("r1"));
    expect(run("resolve", server)).toBe(await realpath(release("r1")));
  });

  it("keeps the active release and the newest N releases when pruning", async () => {
    run("switch", server, release("r1"));
    run("prune", server, "1");
    expect(run("resolve", server)).toBe(await realpath(release("r1")));
    expect(await stat(release("r1"))).toBeTruthy();
    expect(await stat(release("r3"))).toBeTruthy();
    await expect(stat(release("r2"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an invalid release target or retention count", () => {
    expect(spawnSync("bash", [switchScript, "switch", server, path.join(server, "missing")]).status).not.toBe(0);
    expect(spawnSync("bash", [switchScript, "prune", server, "0"]).status).not.toBe(0);
    expect(spawnSync("bash", [switchScript, "prune", server, "many"]).status).not.toBe(0);
  });
});
