#!/usr/bin/env node
import { Pool } from "pg";

const option = (name, fallback) => {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? fallback;
};
const user = option("user", "");
const reason = option("reason", "manual_adjustment");
const reference = option("reference", "");
const eventId = option("event", "");
const delta = Number(option("delta", "0"));
const apply = process.argv.includes("--apply");
const allowedReasons = new Set(["manual_adjustment", "manual_refund", "manual_grant", "manual_correction"]);
const fail = (message) => { console.error(`[points-adjust] ${message}`); process.exitCode = 1; };

if (!process.env.DATABASE_URL) fail("DATABASE_URL is required");
else if (!user || user.length > 128) fail("--user is required");
else if (!allowedReasons.has(reason)) fail("unsupported --reason");
else if (!reference || !/^[A-Za-z0-9._:-]{1,80}$/.test(reference)) fail("--reference must be 1-80 safe characters");
else if (eventId && !/^[A-Za-z0-9._:-]{1,200}$/.test(eventId)) fail("--event is invalid");
else if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 100000) fail("--delta must be a non-zero integer within ±100000");
else {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 10000, application_name: "findjoy-points-adjustment" });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`credits:${user}`]);
    if (!(await client.query("SELECT 1 FROM identity_users WHERE user_id=$1", [user])).rowCount) throw new Error("account missing");
    const account = (await client.query("SELECT available,held FROM joy_accounts WHERE user_id=$1 FOR UPDATE", [user])).rows[0];
    const existing = (await client.query("SELECT user_id,delta FROM joy_ledger WHERE reason=$1 AND reference=$2", [reason, reference])).rows[0];
    let applied = false;
    if (existing) {
      if (existing.user_id !== user || existing.delta !== delta) throw new Error("reference already used with different adjustment");
    } else {
      if (!account) {
        if (delta < 0) throw new Error("account has no balance");
        await client.query("INSERT INTO joy_accounts(user_id,available,held) VALUES ($1,0,0)", [user]);
      }
      if ((account?.available ?? 0) + delta < 0) throw new Error("adjustment would make available balance negative");
      await client.query("INSERT INTO joy_ledger(user_id,delta,reason,reference,created_at) VALUES ($1,$2,$3,$4,$5)", [user, delta, reason, reference, Date.now()]);
      await client.query("UPDATE joy_accounts SET available=available+$1 WHERE user_id=$2", [delta, user]);
      applied = true;
    }
    if (eventId) {
      const reviewed = await client.query("UPDATE joy_payment_review_events SET status='reviewed',reviewed_at=$1 WHERE event_id=$2 AND status='pending' RETURNING event_id", [Date.now(), eventId]);
      if (!reviewed.rowCount) throw new Error("review event not found or already reviewed");
    }
    const after = (await client.query("SELECT available,held FROM joy_accounts WHERE user_id=$1", [user])).rows[0] ?? { available: 0, held: 0 };
    if (!apply) await client.query("ROLLBACK"); else await client.query("COMMIT");
    console.log(JSON.stringify({
      dryRun: !apply, userId: user, delta, reason, reference, eventId: eventId || null, applied,
      balanceBefore: account ?? { available: 0, held: 0 }, balanceAfter: after,
    }));
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    // 只报告固定原因，不输出连接串或用户资料。
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[points-adjust] refused: ${message}`);
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
}
