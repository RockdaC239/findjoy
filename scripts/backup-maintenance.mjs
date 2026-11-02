import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const run = promisify(execFile);
const ARCHIVE_PATTERN = /^findjoy-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})\.(\d{3})Z-[0-9a-f-]+\.dump$/;

export function parseBackupTime(name) {
  const match = ARCHIVE_PATTERN.exec(name);
  if (!match) return null;
  const [, date, hour, minute, second, ms] = match;
  const time = Date.parse(`${date}T${hour}:${minute}:${second}.${ms}Z`);
  return Number.isFinite(time) ? time : null;
}

function isoWeek(date) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((copy - yearStart) / 86400000) + 1) / 7);
  return `${copy.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** 返回应删除的归档文件名：保留最近 daily 天各一份、最近 weekly 周各一份。 */
export function selectExpiredBackups(entries, options = {}) {
  const keepDaily = Number(options.keepDaily ?? 7);
  const keepWeekly = Number(options.keepWeekly ?? 4);
  if (!Number.isSafeInteger(keepDaily) || keepDaily < 1 || keepDaily > 90) throw new Error("日备份保留数量无效");
  if (!Number.isSafeInteger(keepWeekly) || keepWeekly < 1 || keepWeekly > 52) throw new Error("周备份保留数量无效");
  const sorted = entries
    .map((entry) => ({ ...entry, time: parseBackupTime(entry.name) }))
    .filter((entry) => entry.time !== null)
    .sort((a, b) => b.time - a.time);
  const kept = new Set();
  const days = new Set();
  for (const entry of sorted) {
    const day = new Date(entry.time).toISOString().slice(0, 10);
    if (!days.has(day) && days.size < keepDaily) { days.add(day); kept.add(entry.name); }
  }
  const weeks = new Set();
  for (const entry of sorted) {
    const week = isoWeek(new Date(entry.time));
    if (!weeks.has(week) && weeks.size < keepWeekly) { weeks.add(week); kept.add(entry.name); }
  }
  return sorted.filter((entry) => !kept.has(entry.name)).map((entry) => entry.name);
}

export async function pruneBackups(directory, options = {}) {
  const names = (await readdir(directory)).filter((name) => ARCHIVE_PATTERN.test(name));
  const expired = selectExpiredBackups(names.map((name) => ({ name })), options);
  for (const name of expired) {
    await rm(path.join(directory, name), { force: true });
    await rm(path.join(directory, `${name}.json`), { force: true });
  }
  // 清理中断留下的临时文件，避免长期占用磁盘；不碰已完成的归档。
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".partial")) continue;
    const file = path.join(directory, name);
    if ((await stat(file)).mtimeMs < cutoff) await rm(file, { force: true });
  }
  return expired;
}

async function checksum(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function validOffsite(value) {
  return typeof value === "string" && (value.startsWith("rclone:") && value.length > 7 || path.isAbsolute(value));
}

/** 复制完成后验证大小；本地目录额外验证 SHA-256。 */
export async function copyOffsite(archive, manifest, env = process.env) {
  const target = env.FINDJOY_BACKUP_OFFSITE;
  if (!target) return { configured: false };
  if (!validOffsite(target)) throw new Error("异机备份目标格式无效");
  const archiveName = path.basename(archive);
  const manifestName = path.basename(manifest);
  if (target.startsWith("rclone:")) {
    const remote = target.slice("rclone:".length).replace(/\/+$/, "");
    const binary = env.FINDJOY_RCLONE_BIN || "rclone";
    for (const [source, name] of [[archive, archiveName], [manifest, manifestName]]) {
      await run(binary, ["copyto", source, `${remote}/${name}`], { timeout: 600000, maxBuffer: 1024 * 1024 });
    }
    const listed = await run(binary, ["lsjson", `${remote}/${archiveName}`, "--stat"], { timeout: 60000, maxBuffer: 1024 * 1024 });
    const info = JSON.parse(listed.stdout);
    if (Number(info.Size) !== (await stat(archive)).size) throw new Error("异机备份大小校验失败");
    return { configured: true, target: "rclone" };
  }
  await mkdir(target, { recursive: true, mode: 0o700 });
  if (((await stat(target)).mode & 0o077) !== 0) throw new Error("异机备份目录必须私有");
  const archiveTarget = path.join(target, archiveName);
  const manifestTarget = path.join(target, manifestName);
  await copyFile(archive, archiveTarget);
  await chmod(archiveTarget, 0o600);
  await copyFile(manifest, manifestTarget);
  await chmod(manifestTarget, 0o600);
  if (await checksum(archive) !== await checksum(archiveTarget)) throw new Error("异机备份内容校验失败");
  return { configured: true, target: "directory" };
}

export async function sendAlert(env, alert) {
  const webhook = env.FINDJOY_ALERT_WEBHOOK;
  if (!webhook) return false;
  try {
    const url = new URL(webhook);
    if (url.protocol !== "https:" || url.username || url.password) return false;
  } catch {
    return false;
  }
  const payload = JSON.stringify({
    service: "findjoy",
    kind: alert.kind,
    stage: alert.stage,
    at: new Date().toISOString(),
  });
  try {
    const response = await fetch(webhook, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: payload, signal: AbortSignal.timeout(5000), cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}
