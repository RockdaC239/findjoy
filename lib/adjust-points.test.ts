import { setupTestPostgres } from "./test-postgres";
setupTestPostgres();
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { afterEach, expect, it } from "vitest";

const run = promisify(execFile);
const script = path.resolve(__dirname, "../scripts/adjust-points.mjs");
const pools: Pool[] = [];
afterEach(async () => { await Promise.all(pools.splice(0).map((pool) => pool.end())); });

async function execute(args: string[]) {
  try {
    const result = await run(process.execPath, [script, ...args], { env: { ...process.env }, encoding: "utf8" });
    return { status: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { status: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

it("adjusts credits only through the ledger, supports dry-run and is idempotent per reference", async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pools.push(pool);
  await pool.query("INSERT INTO identity_users(user_id,display_name,created_at) VALUES ('owner','owner',1)");
  await pool.query("INSERT INTO joy_accounts(user_id,available,held) VALUES ('owner',100,5)");
  await pool.query("INSERT INTO joy_ledger(user_id,delta,reason,reference,created_at) VALUES ('owner',100,'trial','owner',1)");
  await pool.query("INSERT INTO joy_payment_review_events(event_id,event_type,order_id,payload,status,created_at) VALUES ('refund-1','REFUND_SUCCEEDED',NULL,'{}','pending',1)");

  const dry = await execute(["--user=owner", "--delta=50", "--reference=refund-1", "--event=refund-1"]);
  expect(dry.status).toBe(0);
  expect(JSON.parse(dry.stdout)).toMatchObject({ dryRun: true, applied: true, balanceBefore: { available: 100, held: 5 }, balanceAfter: { available: 150, held: 5 } });
  expect((await pool.query("SELECT available FROM joy_accounts WHERE user_id='owner'")).rows).toEqual([{ available: 100 }]);
  expect((await pool.query("SELECT status FROM joy_payment_review_events WHERE event_id='refund-1'")).rows).toEqual([{ status: "pending" }]);

  const applied = await execute(["--user=owner", "--delta=50", "--reference=refund-1", "--event=refund-1", "--apply"]);
  expect(applied.status).toBe(0);
  expect(JSON.parse(applied.stdout)).toMatchObject({ dryRun: false, applied: true, balanceAfter: { available: 150, held: 5 } });
  expect((await pool.query("SELECT status FROM joy_payment_review_events WHERE event_id='refund-1'")).rows).toEqual([{ status: "reviewed" }]);
  const replay = await execute(["--user=owner", "--delta=50", "--reference=refund-1", "--apply"]);
  expect(replay.status).toBe(0);
  expect(JSON.parse(replay.stdout)).toMatchObject({ applied: false, balanceAfter: { available: 150, held: 5 } });

  const conflict = await execute(["--user=owner", "--delta=60", "--reference=refund-1", "--apply"]);
  expect(conflict.status).toBe(1);
  expect(conflict.stderr).toContain("reference already used");
  expect((await pool.query("SELECT available FROM joy_accounts WHERE user_id='owner'")).rows).toEqual([{ available: 150 }]);

  const negative = await execute(["--user=owner", "--delta=-200", "--reference=refund-2", "--apply"]);
  expect(negative.status).toBe(1);
  expect(negative.stderr).toContain("negative");
  expect((await pool.query("SELECT available FROM joy_accounts WHERE user_id='owner'")).rows).toEqual([{ available: 150 }]);

  const rows = await pool.query("SELECT delta,reason,reference FROM joy_ledger WHERE user_id='owner' ORDER BY id");
  expect(rows.rows).toEqual([{ delta: 100, reason: "trial", reference: "owner" }, { delta: 50, reason: "manual_adjustment", reference: "refund-1" }]);
});
