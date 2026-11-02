import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backupChecks, databaseChecks, diskChecks, staticChecks, summarize } from "../scripts/preflight-lib.mjs";

let directory: string;
let env: Record<string, string>;

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "findjoy-preflight-"));
  const privateKey = path.join(directory, "merchant.pem");
  const platformKeys = path.join(directory, "platform.json");
  await writeFile(privateKey, "private-key-material\n", { mode: 0o600 });
  await chmod(privateKey, 0o600);
  await writeFile(platformKeys, JSON.stringify({ kid1: "-----BEGIN PUBLIC KEY-----\nkey\n-----END PUBLIC KEY-----" }), { mode: 0o600 });
  await chmod(platformKeys, 0o600);
  env = {
    DATABASE_URL: "postgresql://findjoy_app:redacted@db:5432/findjoy",
    FINDJOY_APP_ORIGIN: "https://findfire.club",
    AUTHING_ISSUER: "https://findjoy.authing.cn/oidc",
    AUTHING_CLIENT_ID: "client",
    LLM_BASE_URL: "https://api.deepseek.com/v1",
    LLM_API_KEY: "sk-test",
    LLM_MODEL: "deepseek-chat",
    FINDJOY_PAYMENTS_MODE: "live",
    FINDJOY_PRODUCTS_JSON: JSON.stringify([{ id: "light", name: "轻量包", credits: 100, amountFen: 990 }]),
    XIAODOU_BASE_URL: "https://api.yuzhideep.cn",
    XIAODOU_APP_ID: "app",
    XIAODOU_KEY_ID: "key",
    XIAODOU_PRIVATE_KEY_FILE: privateKey,
    XIAODOU_PLATFORM_KEYS_FILE: platformKeys,
    XIAODOU_CASHIER_ORIGINS: "https://pay.xiaodouap.cn",
    FINDJOY_RECONCILE_TOKEN: "x".repeat(40),
    FINDJOY_BACKUP_DIR: directory,
    FINDJOY_BACKUP_OFFSITE: "rclone:backup",
    FINDJOY_ALERT_WEBHOOK: "https://hooks.example.com/findjoy",
    FINDJOY_BACKUP_KEEP_DAILY: "7",
    FINDJOY_BACKUP_KEEP_WEEKLY: "4",
  };
});

afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

const failed = (checks: ReturnType<typeof staticChecks>) => checks.filter((check) => check.status === "fail");

describe("deployment preflight static configuration", () => {
  it("passes a complete production configuration", () => {
    expect(failed(staticChecks(env, { requireBackup: true, requireOffsite: true, requireAlert: true }))).toEqual([]);
  });

  it("blocks missing database, insecure origins and incomplete live payments", () => {
    expect(failed(staticChecks({ ...env, DATABASE_URL: "" })).map((check) => check.name)).toContain("database.url");
    expect(failed(staticChecks({ ...env, FINDJOY_APP_ORIGIN: "http://findfire.club" })).map((check) => check.name)).toContain("app.origin");
    expect(failed(staticChecks({ ...env, FINDJOY_PAYMENTS_MODE: "live", FINDJOY_PRODUCTS_JSON: "[]" })).map((check) => check.name)).toContain("payment.products");
    expect(failed(staticChecks({ ...env, FINDJOY_PAYMENTS_MODE: "live", FINDJOY_RECONCILE_TOKEN: "short" })).map((check) => check.name)).toContain("payment.reconcileToken");
    expect(failed(staticChecks({ ...env, XIAODOU_CASHIER_ORIGINS: "http://pay.example.com" })).map((check) => check.name)).toContain("payment.cashierOrigins");
    expect(failed(staticChecks({ ...env, FINDJOY_ALERT_WEBHOOK: "" }, { requireAlert: true })).map((check) => check.name)).toContain("alert.webhook");
    expect(failed(staticChecks({ ...env, FINDJOY_BACKUP_OFFSITE: "relative/path" }, { requireOffsite: true })).map((check) => check.name)).toContain("backup.offsite");
  });

  it("requires a recent backup and an offsite copy in production", () => {
    const checks = staticChecks({ ...env, FINDJOY_BACKUP_DIR: "", FINDJOY_BACKUP_OFFSITE: "" }, { requireBackup: true, requireOffsite: true });
    expect(failed(checks).map((check) => check.name)).toEqual(["backup.directory", "backup.offsite"]);
    const local = staticChecks({ ...env, FINDJOY_BACKUP_DIR: "", FINDJOY_BACKUP_OFFSITE: "" }, { allowHttp: true });
    expect(failed(local)).toEqual([]);
  });
});

describe("deployment preflight database metadata", () => {
  const expected = [{ version: "001_initial.sql", checksum: "a" }, { version: "002_generation_admissions.sql", checksum: "b" }];
  const metadata = {
    serverVersionNum: 150019, serverVersion: "15.19", database: "findjoy", inRecovery: false,
    role: { name: "findjoy_app", superuser: false, createdb: false, createrole: false },
    history: expected, tableAccess: true, sequenceAccess: true, connections: { used: 3, max: 100 },
  };

  it("passes a migrated, least-privilege PostgreSQL 15 database", () => {
    expect(failed(databaseChecks(metadata, expected))).toEqual([]);
  });

  it("blocks old versions, migration drift and privileged roles", () => {
    expect(failed(databaseChecks({ ...metadata, serverVersionNum: 140023, serverVersion: "14.23" }, expected)).map((check) => check.name)).toContain("database.version");
    expect(failed(databaseChecks({ ...metadata, history: [{ version: "001_initial.sql", checksum: "edited" }] }, expected)).map((check) => check.name)).toContain("database.migrations");
    expect(failed(databaseChecks({ ...metadata, role: { ...metadata.role, superuser: true } }, expected)).map((check) => check.name)).toContain("database.role");
  });

  it("allows a privileged local role only when explicitly requested", () => {
    const checks = databaseChecks({ ...metadata, role: { ...metadata.role, createdb: true } }, expected, { allowPrivilegedRole: true });
    expect(failed(checks)).toEqual([]);
    expect(checks.find((check) => check.name === "database.role")?.status).toBe("warn");
  });
});

describe("deployment preflight backup and disk checks", () => {
  const now = Date.parse("2026-11-02T10:00:00Z");
  const latest = {
    completedAt: "2026-11-02T09:00:00Z", bytes: 1024, sha256: "abc",
    archiveExists: true, archiveBytes: 1024, checksumMatches: true,
  };

  it("passes a fresh, size-matched and checksum-matched backup", () => {
    expect(failed(backupChecks(latest, { requireBackup: true, now }))).toEqual([]);
  });

  it("blocks stale, missing or corrupted backups", () => {
    expect(failed(backupChecks({ ...latest, completedAt: "2026-11-01T01:00:00Z" }, { requireBackup: true, maxBackupAgeHours: 26, now })).map((check) => check.name)).toContain("backup.latest");
    expect(failed(backupChecks(null, { requireBackup: true, now })).map((check) => check.name)).toContain("backup.latest");
    expect(failed(backupChecks({ ...latest, archiveBytes: 1 }, { requireBackup: true, now })).map((check) => check.name)).toContain("backup.archive");
    expect(failed(backupChecks({ ...latest, checksumMatches: false }, { requireBackup: true, now })).map((check) => check.name)).toContain("backup.checksum");
  });

  it("fails below the configured disk floor", () => {
    expect(failed(diskChecks(3 * 1024 ** 3, 2))).toEqual([]);
    expect(failed(diskChecks(1024 ** 3, 2))).toHaveLength(1);
  });

  it("summarizes failures and warnings", () => {
    const result = summarize([
      { name: "a", status: "pass", detail: "" },
      { name: "b", status: "warn", detail: "" },
      { name: "c", status: "fail", detail: "" },
    ]);
    expect(result).toEqual({ ok: false, fails: 1, warnings: 1, passes: 1 });
  });
});
