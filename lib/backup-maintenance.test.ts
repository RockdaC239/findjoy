import { mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyOffsite, parseBackupTime, pruneBackups, selectExpiredBackups, sendAlert } from "../scripts/backup-maintenance.mjs";

const directories: string[] = [];
async function temp() {
  const directory = await mkdtemp(path.join(tmpdir(), "findjoy-backup-"));
  directories.push(directory);
  return directory;
}
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const name = (iso: string, id: string) => `findjoy-${iso.replaceAll(":", "-")}-${id}.dump`;

describe("backup retention", () => {
  it("parses only completed backup archive names", () => {
    expect(parseBackupTime("findjoy-2026-11-02T10-00-00.000Z-0123abcd.dump")).toBe(Date.parse("2026-11-02T10:00:00.000Z"));
    expect(parseBackupTime("findjoy-2026-11-02T10-00-00.000Z-0123abcd.dump.partial")).toBeNull();
    expect(parseBackupTime("other.dump")).toBeNull();
  });

  it("keeps the newest backup of each recent day and week", () => {
    const entries = [];
    for (let day = 0; day < 40; day += 1) {
      const time = new Date(Date.parse("2026-11-02T03:00:00Z") - day * 86400000);
      entries.push({ name: name(time.toISOString(), `a${day.toString(16)}`) });
    }
    const expired = selectExpiredBackups(entries, { keepDaily: 7, keepWeekly: 4 });
    const kept = entries.map((entry) => entry.name).filter((entry) => !expired.includes(entry));
    expect(kept).toHaveLength(7 + 4 - 2); // 最近 7 天通常跨 2 个 ISO 周，周保留再补 2 个更早的周
    expect(kept).toContain(entries[0].name);
    expect(expired).toContain(entries[39].name);
  });

  it("deletes expired archive/manifest pairs and stale partial files", async () => {
    const directory = await temp();
    const old = name("2026-09-01T03:00:00.000Z", "aa");
    const recent = name("2026-11-02T03:00:00.000Z", "bb");
    for (const archive of [old, recent]) {
      await writeFile(path.join(directory, archive), "dump");
      await writeFile(path.join(directory, `${archive}.json`), "{}");
    }
    const partial = path.join(directory, "findjoy-partial.dump.partial");
    await writeFile(partial, "partial");
    await utimes(partial, new Date("2026-09-01"), new Date("2026-09-01"));
    await pruneBackups(directory, { keepDaily: 1, keepWeekly: 1 });
    expect((await readdir(directory)).sort()).toEqual([recent, `${recent}.json`].sort());
  });
});

describe("offsite backup and alerts", () => {
  it("copies archive and manifest to a private local directory after checksum verification", async () => {
    const source = await temp();
    const target = await temp();
    const archive = path.join(source, "findjoy-test.dump");
    const manifest = `${archive}.json`;
    await writeFile(archive, "archive-bytes");
    await writeFile(manifest, "{}");
    const result = await copyOffsite(archive, manifest, { FINDJOY_BACKUP_OFFSITE: target });
    expect(result).toEqual({ configured: true, target: "directory" });
    expect(await stat(path.join(target, "findjoy-test.dump"))).toBeTruthy();
    expect(await stat(path.join(target, "findjoy-test.dump.json"))).toBeTruthy();
  });

  it("rejects a non-private or invalid offsite target", async () => {
    const source = await temp();
    const target = await temp();
    const archive = path.join(source, "findjoy-test.dump");
    const manifest = `${archive}.json`;
    await writeFile(archive, "archive-bytes");
    await writeFile(manifest, "{}");
    await expect(copyOffsite(archive, manifest, { FINDJOY_BACKUP_OFFSITE: "relative/path" })).rejects.toThrow();
    await expect(copyOffsite(archive, manifest, { FINDJOY_BACKUP_OFFSITE: "https://example.com/backup" })).rejects.toThrow();
  });

  it("only sends alerts to HTTPS webhooks and never throws", async () => {
    await expect(sendAlert({}, { kind: "backup", stage: "offsite" })).resolves.toBe(false);
    await expect(sendAlert({ FINDJOY_ALERT_WEBHOOK: "http://example.com/hook" }, { kind: "backup", stage: "offsite" })).resolves.toBe(false);
    await expect(sendAlert({ FINDJOY_ALERT_WEBHOOK: "not a url" }, { kind: "backup", stage: "offsite" })).resolves.toBe(false);
  });
});
