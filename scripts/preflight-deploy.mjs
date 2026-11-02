#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import {
  backupChecks, databaseChecks, diskChecks, formatChecks, REQUIRED_TABLES,
  staticChecks, summarize,
} from "./preflight-lib.mjs";

const args = new Set(process.argv.slice(2));
const option = (name, fallback) => {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};
const local = option("profile", "production") === "local";
const requireBackup = args.has("--require-backup") || (!local && option("require-backup", "true") === "true");
const requireOffsite = args.has("--require-offsite") || (!local && option("require-offsite", "true") === "true");
const requireAlert = args.has("--require-alert") || (!local && option("require-alert", "true") === "true");
const maxBackupAgeHours = Number(option("max-backup-age-hours", "26"));
const minFreeGb = Number(option("min-free-gb", "2"));
const allowPrivilegedRole = local || args.has("--allow-privileged-role");
const skipDb = args.has("--skip-db");
const json = args.has("--json");
const root = fileURLToPath(new URL("../", import.meta.url));
const checks = [...staticChecks(process.env, {
  allowHttp: local, allowLocalModelConfig: local, allowPrivilegedRole, requireBackup, requireOffsite, requireAlert,
})];

async function checkDisk(target, label) {
  try {
    const info = await statfs(target);
    checks.push(...diskChecks(Number(info.bavail) * Number(info.bsize), minFreeGb, label));
  } catch {
    checks.push({ name: "disk.free", status: "fail", detail: `${label}不可读，无法确认磁盘余量` });
  }
}
await checkDisk(process.env.SERVER_PATH || process.cwd(), "应用目录");
if (process.env.FINDJOY_BACKUP_DIR) await checkDisk(process.env.FINDJOY_BACKUP_DIR, "备份目录");

async function expectedMigrations() {
  const directory = path.join(root, "migrations");
  const files = (await readdir(directory)).filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file)).sort();
  return Promise.all(files.map(async (version) => ({
    version,
    checksum: createHash("sha256").update(await readFile(path.join(directory, version))).digest("hex"),
  })));
}

async function checkBackup() {
  const directory = process.env.FINDJOY_BACKUP_DIR;
  if (!directory) return;
  try {
    const names = (await readdir(directory)).filter((name) => /^findjoy-.*\.dump\.json$/.test(name)).sort();
    if (!names.length) {
      checks.push(...backupChecks(null, { requireBackup, maxBackupAgeHours, now: Date.now() }));
      return;
    }
    const manifestPath = path.join(directory, names.at(-1));
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const archive = path.join(directory, manifestPath.slice(0, -".json".length));
    let archiveBytes = 0;
    try { archiveBytes = (await stat(archive)).size; } catch { archiveBytes = -1; }
    let checksumMatches = false;
    if (manifest.sha256 && archiveBytes >= 0) {
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(archive)) hash.update(chunk);
      checksumMatches = hash.digest("hex") === manifest.sha256;
    }
    checks.push(...backupChecks({
      completedAt: manifest.completedAt, bytes: Number(manifest.bytes), sha256: manifest.sha256,
      archiveExists: archiveBytes >= 0, archiveBytes, checksumMatches,
    }, { requireBackup, maxBackupAgeHours, now: Date.now() }));
  } catch {
    checks.push({ name: "backup.latest", status: "fail", detail: "备份清单无法读取或格式无效" });
  }
}
await checkBackup();

if (!skipDb && process.env.DATABASE_URL) {
  let pool;
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL, max: 1,
      connectionTimeoutMillis: 3000, statement_timeout: 5000,
      idle_in_transaction_session_timeout: 5000, application_name: "findjoy-preflight",
    });
    const version = (await pool.query("SELECT current_setting('server_version_num')::int AS num, current_setting('server_version') AS text, current_database() AS database, pg_is_in_recovery() AS recovery")).rows[0];
    const role = (await pool.query("SELECT current_user AS name, rolsuper AS superuser, rolcreatedb AS createdb, rolcreaterole AS createrole FROM pg_roles WHERE rolname=current_user")).rows[0];
    const history = (await pool.query("SELECT version,checksum FROM schema_migrations ORDER BY version")).rows;
    const access = (await pool.query(`SELECT bool_and(COALESCE(has_table_privilege(
      to_regclass(format('%I.%I',current_schema(),name)),privilege),false)) AS ready
      FROM unnest($1::text[]) AS names(name)
      CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS needed(privilege)`, [REQUIRED_TABLES])).rows[0];
    const sequence = (await pool.query("SELECT has_sequence_privilege(pg_get_serial_sequence('joy_ledger','id'),'USAGE') AS ready")).rows[0];
    const connections = (await pool.query("SELECT count(*) FILTER (WHERE datname=current_database())::int AS used, current_setting('max_connections')::int AS max FROM pg_stat_activity")).rows[0];
    checks.push(...databaseChecks({
      serverVersionNum: version.num, serverVersion: version.text, database: version.database,
      inRecovery: version.recovery, role, history,
      tableAccess: Boolean(access.ready), sequenceAccess: Boolean(sequence.ready), connections,
    }, await expectedMigrations(), { allowPrivilegedRole }));
  } catch (error) {
    const code = error && typeof error === "object" && typeof error.code === "string" ? `（${error.code}）` : "";
    checks.push({ name: "database.connect", status: "fail", detail: `无法连接或读取数据库元数据${code}，发布必须停止` });
  } finally {
    await pool?.end().catch(() => {});
  }
} else if (!skipDb) {
  checks.push({ name: "database.connect", status: "fail", detail: "DATABASE_URL 未配置，跳过数据库检查" });
}

const result = summarize(checks);
if (json) {
  console.log(JSON.stringify({ ...result, checks }, null, 2));
} else {
  console.log(formatChecks(checks));
  console.log(`\n${result.ok ? "预检通过" : "预检未通过"}：${result.passes} 通过，${result.warnings} 警告，${result.fails} 失败`);
}
process.exitCode = result.ok ? 0 : 1;
