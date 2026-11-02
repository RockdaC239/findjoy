#!/usr/bin/env node
import { sendAlert } from "./backup-maintenance.mjs";

const token = process.env.FINDJOY_RECONCILE_TOKEN ?? "";
const stage = "request";
try {
  if (token.length < 32) throw new Error("FINDJOY_RECONCILE_TOKEN missing or too short");
  const base = process.env.FINDJOY_INTERNAL_BASE_URL ?? `http://127.0.0.1:${process.env.APP_PORT ?? "3001"}/findjoy`;
  const url = new URL(`${base.replace(/\/+$/, "")}/api/internal/reconcile`);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname))) {
    throw new Error("Reconcile endpoint must be HTTPS or loopback HTTP");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-store" },
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Reconcile endpoint returned ${response.status}`);
  const result = await response.json();
  if (!Number.isSafeInteger(result.checked) || !Number.isSafeInteger(result.unconfirmed)) throw new Error("Reconcile response invalid");
  console.log(JSON.stringify({ checked: result.checked, unconfirmed: result.unconfirmed }));
  if (result.unconfirmed > 0) {
    console.error(`[reconcile] ${result.unconfirmed} order(s) not confirmed; platform retry or manual check required`);
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : "unknown error";
  // 不输出令牌或订单数据，只记录固定的失败阶段。
  console.error(`[reconcile] failed at ${stage}: ${detail}`);
  await sendAlert(process.env, { kind: "reconcile", stage });
  process.exitCode = 1;
}
