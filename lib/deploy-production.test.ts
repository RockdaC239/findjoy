import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const root = path.resolve(__dirname, "..");
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function execute(file: string, args: string[], env: NodeJS.ProcessEnv) {
  try {
    const result = await run("bash", ["-x", file, ...args], { env, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 20000 });
    return { status: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { status: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

async function writeFake(bin: string, name: string, body: string) {
  const file = path.join(bin, name);
  await writeFile(file, `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  await chmod(file, 0o755);
}

async function prepareRelease(source: string, target: string) {
  await mkdir(target, { recursive: true });
  await cp(path.join(source, "deploy"), path.join(target, "deploy"), { recursive: true });
  await cp(path.join(source, "migrations"), path.join(target, "migrations"), { recursive: true });
  await mkdir(path.join(target, "scripts"), { recursive: true });
  for (const file of ["preflight-deploy.mjs", "preflight-lib.mjs", "preflight-lib.d.mts"]) {
    await cp(path.join(source, "scripts", file), path.join(target, "scripts", file));
  }
  for (const file of ["package.json", "package-lock.json", "next.config.ts", "tsconfig.json"]) {
    await cp(path.join(source, file), path.join(target, file));
  }
  await symlink(path.join(source, "node_modules"), path.join(target, "node_modules"), "dir");
  await writeFile(path.join(target, "fake-build.txt"), "ready\n");
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("production deploy script integration", () => {
  it("switches an immutable release, then rolls back a failed health check and env update", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const database = `deploy_test_${suffix}`;
    const role = `deploy_app_${suffix}`;
    const appName = `findjoy-deploy-${suffix}`;
    const adminUrl = new URL(process.env.TEST_DATABASE_URL!);
    const admin = new Pool({ connectionString: adminUrl.toString() });
    cleanups.push(() => admin.end());
    const server = await mkdtemp(path.join(tmpdir(), "findjoy-deploy-server-"));
    cleanups.push(() => rm(server, { recursive: true, force: true }));
    const backup = await mkdtemp(path.join(tmpdir(), "findjoy-deploy-backup-"));
    const offsite = await mkdtemp(path.join(tmpdir(), "findjoy-deploy-offsite-"));
    const bin = await mkdtemp(path.join(tmpdir(), "findjoy-deploy-bin-"));
    const state = await mkdtemp(path.join(tmpdir(), "findjoy-deploy-state-"));
    for (const directory of [backup, offsite]) await chmod(directory, 0o700);
    cleanups.push(() => Promise.all([rm(backup, { recursive: true, force: true }), rm(offsite, { recursive: true, force: true }), rm(bin, { recursive: true, force: true }), rm(state, { recursive: true, force: true })]));

    let databaseCreated = false;
    let roleCreated = false;
    let databasePool: Pool | undefined;
    try {
      await admin.query(`CREATE DATABASE ${database}`);
      databaseCreated = true;
      const databaseUrl = new URL(adminUrl); databaseUrl.pathname = `/${database}`;
      await run(process.execPath, ["scripts/migrate-database.mjs"], { env: { ...process.env, DATABASE_URL: databaseUrl.toString() } });
      await admin.query(`CREATE ROLE ${role} LOGIN`);
      roleCreated = true;
      await admin.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
      databasePool = new Pool({ connectionString: databaseUrl.toString() });
      await databasePool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await databasePool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
      await databasePool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
      const appUrl = `postgresql://${role}@${adminUrl.hostname}:${adminUrl.port}/${database}`;
      console.log("deploy-test: database ready");

      const backupResult = await run(process.execPath, ["scripts/backup-database.mjs"], {
        env: { ...process.env, DATABASE_URL: databaseUrl.toString(), FINDJOY_BACKUP_DIR: backup, FINDJOY_BACKUP_OFFSITE: offsite },
        maxBuffer: 10 * 1024 * 1024,
      });
      expect(backupResult.stdout).toContain('"offsite":true');
      console.log("deploy-test: backup ready");

      const envText = (marker: string) => [
        "FINDJOY_APP_ORIGIN=https://findfire.club",
        "AUTHING_ISSUER=https://issuer.example/oidc",
        "AUTHING_CLIENT_ID=deploy-test",
        "DATABASE_URL=" + appUrl,
        "FINDJOY_DB_POOL_MAX=5",
        "FINDJOY_PG_BIN=" + (process.env.FINDJOY_PG_BIN ?? ""),
        "LLM_BASE_URL=https://api.example.com/v1",
        "LLM_API_KEY=deploy-test-key",
        "LLM_MODEL=deploy-test-model",
        "FINDJOY_PAYMENTS_MODE=demo",
        "FINDJOY_TRIAL_CREDITS=100",
        "FINDJOY_GENERATION_ENABLED=true",
        "FINDJOY_GENERATION_MAX_CONCURRENT=4",
        "FINDJOY_RECONCILE_TOKEN=" + "x".repeat(40),
        "FINDJOY_BACKUP_DIR=" + backup,
        "FINDJOY_BACKUP_OFFSITE=" + offsite,
        "FINDJOY_ALERT_WEBHOOK=https://hooks.example.com/findjoy",
        "FINDJOY_BACKUP_KEEP_DAILY=7",
        "FINDJOY_BACKUP_KEEP_WEEKLY=4",
        "DEPLOY_MARKER=" + marker,
        "",
      ].join("\n");
      await writeFile(path.join(server, ".env"), envText("one"), { mode: 0o600 });
      console.log("deploy-test: env ready");

      await writeFake(bin, "sudo", 'echo "sudo $*" >> "$FAKE_STATE/commands.log"; exec "$@"');
      await writeFake(bin, "systemctl", `echo "systemctl $*" >> "$FAKE_STATE/commands.log"; echo "$*" >> "${state}/systemctl.log"`);
      await writeFake(bin, "journalctl", "exit 0");
      await writeFake(bin, "nginx", "exit 0");
      await writeFake(bin, "chown", "exit 0");
      await writeFake(bin, "sleep", "exit 0");
      await writeFake(bin, "curl", 'echo "curl $*" >> "$FAKE_STATE/commands.log"\ntarget=$(readlink "$SERVER_PATH/current" 2>/dev/null || true)\ncase "$target" in *rel2) exit 1;; *) exit 0;; esac');
      await writeFake(bin, "npm", 'echo "npm $*" >> "$FAKE_STATE/commands.log"\nif [ "$1" = "ci" ]; then exit 0; fi\nif [ "$1" = "run" ] && [ "$2" = "build" ]; then mkdir -p .next; echo build > .next/BUILD_ID; exit 0; fi\nexit 0');

      const release1 = path.join(server, "releases", "rel1");
      const release2 = path.join(server, "releases", "rel2");
      await prepareRelease(root, release1);
      await prepareRelease(root, release2);
      console.log("deploy-test: releases ready");
      const baseEnv = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        SERVER_PATH: server,
        DEPLOY_USER: process.env.USER ?? "rocc",
        APP_NAME: appName,
        APP_PORT: "3999",
        UNIT_DIR: path.join(server, "units"),
        NGINX_CONF: path.join(server, "nginx.conf"),
        HEALTH_RETRIES: "1",
        KEEP_RELEASES: "2",
        NPM_BIN: path.join(bin, "npm"),
        FAKE_STATE: state,
        PREFLIGHT_TRACE: "1",
        RELEASE_ID: "rel1",
        RELEASE_DIR: release1,
      };
      await writeFile(`/tmp/${appName}_app_env`, envText("one"), { mode: 0o600 });
      const first = await execute(path.join(release1, "deploy/deploy-production.sh"), [], baseEnv);
      console.log("deploy-test: first done", first.status);
      if (first.status !== 0) {
        console.log("deploy-test: first trace tail\n", first.stderr.slice(-6000));
        console.log("deploy-test: commands\n", await readFile(path.join(state, "commands.log"), "utf8").catch(() => "none"));
      }
      expect(first.status, first.stderr + first.stdout).toBe(0);
      expect(await realpath(path.join(server, "current"))).toBe(await realpath(release1));
      expect(await readFile(path.join(server, ".env"), "utf8")).toContain("DEPLOY_MARKER=one");
      expect(await readFile(path.join(server, "units", `${appName}.service`), "utf8")).toContain(`WorkingDirectory=${path.join(server, "current")}`);
      expect(await readFile(path.join(state, "systemctl.log"), "utf8")).toContain("restart");

      await writeFile(`/tmp/${appName}_app_env`, envText("two"), { mode: 0o600 });
      const second = await execute(path.join(release2, "deploy/deploy-production.sh"), [], { ...baseEnv, RELEASE_ID: "rel2", RELEASE_DIR: release2 });
      console.log("deploy-test: second done", second.status);
      expect(second.status).toBe(1);
      expect(second.stderr).toContain("健康检查失败");
      expect(await realpath(path.join(server, "current"))).toBe(await realpath(release1));
      expect(await readFile(path.join(server, ".env"), "utf8")).toContain("DEPLOY_MARKER=one");
    } finally {
      await rm(`/tmp/${appName}_app_env`, { force: true }).catch(() => {});
      await databasePool?.end().catch(() => {});
      if (databaseCreated) await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`).catch(() => {});
      if (roleCreated) await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => {});
    }
  }, 60000);
});
