#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Pool } from "pg";

const option = (name, fallback) => {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? fallback;
};
const count = Number(option("count", "12"));
const credits = Number(option("credits", "2000"));
const base = option("base", "http://127.0.0.1:3200").replace(/\/+$/, "");
const out = option("out", ".data/load-seed.json");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!Number.isSafeInteger(count) || count < 1 || count > 200) throw new Error("count must be 1-200");
if (!Number.isSafeInteger(credits) || credits < 100 || credits > 100000) throw new Error("credits must be 100-100000");

const run = `load-${Date.now().toString(36)}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 3000 });
const tokens = [];
try {
  for (let index = 0; index < count; index += 1) {
    const userId = `${run}-${index}`;
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    const now = Date.now();
    await pool.query("INSERT INTO identity_users(user_id,display_name,created_at) VALUES ($1,$2,$3)", [userId, `压测用户${index + 1}`, now]);
    await pool.query("INSERT INTO identity_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,$3)", [hash, userId, now + 24 * 60 * 60 * 1000]);
    await pool.query("INSERT INTO joy_accounts(user_id,available,held) VALUES ($1,$2,0)", [userId, credits]);
    await pool.query("INSERT INTO joy_ledger(user_id,delta,reason,reference,created_at) VALUES ($1,$2,'trial',$1,$3)", [userId, credits, now]);
    tokens.push(token);
  }
  await writeFile(out, JSON.stringify({ run, base, tokens }, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ run, users: count, credits, base, out }));
} finally {
  await pool.end();
}
