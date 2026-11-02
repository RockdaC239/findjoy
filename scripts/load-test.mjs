#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const option = (name, fallback) => {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? fallback;
};
const seedPath = option("seed", ".data/load-seed.json");
const durationMs = Math.max(5, Number(option("duration", "20"))) * 1000;
const concurrency = Math.max(1, Number(option("concurrency", "12")));
const kind = option("kind", "mixed");
if (!["mixed", "read", "start"].includes(kind)) throw new Error("kind must be mixed, read or start");
const seed = JSON.parse(await readFile(seedPath, "utf8"));
if (!Array.isArray(seed.tokens) || !seed.tokens.length) throw new Error("seed file has no tokens");
const origin = new URL(seed.base).origin;
const base = seed.base.replace(/\/+$/, "");

const status = new Map();
const kinds = new Map();
const latencies = [];
let networkErrors = 0;
let streamErrors = 0;
let requests = 0;
const startedAt = Date.now();
const deadline = startedAt + durationMs;

function record(name, ms) {
  requests += 1;
  latencies.push(ms);
  status.set(name, (status.get(name) ?? 0) + 1);
}
function noteKind(name) { kinds.set(name, (kinds.get(name) ?? 0) + 1); }

async function request(token, path, init, timeout = 60000) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Origin: origin,
      Cookie: `findjoy_session=${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeout),
  });
  const text = await response.text();
  return { response, text };
}

async function worker(index) {
  let iteration = 0;
  while (Date.now() < deadline) {
    const token = seed.tokens[index % seed.tokens.length];
    const mode = kind === "read" ? "read" : kind === "start" ? "start" : iteration % 3 === 2 ? "start" : "read";
    const started = performance.now();
    try {
      if (mode === "read") {
        const { response } = await request(token, "/findjoy/api/lives", { method: "GET" });
        noteKind("read");
        record(`read-${response.status}`, performance.now() - started);
      } else {
        const key = `${seed.run}-${index}-${iteration}`;
        const { response, text } = await request(token, "/findjoy/api/life/start", {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify({ mode: "normal" }),
        });
        noteKind("start");
        if (response.status === 200 && !text.includes("event: complete")) streamErrors += 1;
        record(`start-${response.status}`, performance.now() - started);
      }
    } catch {
      networkErrors += 1;
    }
    iteration += 1;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
const elapsedMs = Date.now() - startedAt;
latencies.sort((a, b) => a - b);
const percentile = (p) => latencies.length ? Math.round(latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))]) : 0;
const summary = {
  run: seed.run,
  kind,
  concurrency,
  elapsedSeconds: Number((elapsedMs / 1000).toFixed(1)),
  requests,
  throughputPerSecond: Number((requests / (elapsedMs / 1000)).toFixed(2)),
  kinds: Object.fromEntries(kinds),
  statuses: Object.fromEntries([...status.entries()].sort()),
  latencyMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: latencies.at(-1) ?? 0 },
  networkErrors,
  streamErrors,
};
console.log(JSON.stringify(summary, null, 2));
const unexpected = [...status.entries()].filter(([name]) => name.endsWith("-500") || name.endsWith("-502")).reduce((sum, [, value]) => sum + value, 0);
if (networkErrors || streamErrors || unexpected) process.exitCode = 1;
