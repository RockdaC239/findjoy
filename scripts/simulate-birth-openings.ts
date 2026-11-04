import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { createHash } from "node:crypto";
import { parseSimulationArgs, seededRandom, compatibleManifest, renderBirthReport, summarizeBirthSamples, type BirthSample, type BirthStartSnapshot, type SimulationManifest } from "../lib/birth/simulation";
import type { LifeBackground } from "../lib/background";

// 顺序执行；输出目录不能同时交给两个进程。合成资料不写lifeStore，也不扣账号积分。
async function main() {
  const options = parseSimulationArgs(process.argv.slice(2));
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const [{ resolveStartPlan, createStartLife }, { streamNextEvent }, { resolveModelConfig }] = await Promise.all([
    import("../lib/modes/start"), import("../lib/engine/generate"), import("../lib/engine/model-client"),
  ]);
  const config = resolveModelConfig();
  if (options.live && !config.apiKey) throw new Error("live需要模型密钥；未发起请求");
  if (options.live && config.model !== "deepseek-flash") throw new Error("当前配置并非deepseek-flash，不能套用本报告人民币单价；请先确认模型配置");
  const output = resolve(options.output);
  mkdirSync(output, { recursive: true });
  const sourceFiles: string[] = [];
  function collect(path: string) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) collect(child);
      else if (/\.(ts|md|json)$/.test(child) && !child.endsWith(".test.ts")) sourceFiles.push(child);
    }
  }
  for (const directory of ["lib/birth", "lib/engine", "lib/modes"]) collect(directory);
  sourceFiles.push("lib/background.ts", "lib/life.ts", "lib/provider-catalog.ts", "lib/model-config.ts", "scripts/simulate-birth-openings.ts", "docs/development/deepseek-model-pricing.md");
  const hash = createHash("sha256");
  for (const file of sourceFiles.sort()) hash.update(file).update(readFileSync(file));
  hash.update(config.model).update(config.baseUrl);
  const manifest: SimulationManifest = { live: options.live, count: options.count, seed: options.seed, model: config.model, fingerprint: hash.digest("hex") };
  const manifestPath = join(output, "manifest.json");
  function save(path: string, content: string) { writeFileSync(`${path}.tmp`, content); renameSync(`${path}.tmp`, path); }
  if (existsSync(manifestPath)) {
    if (!compatibleManifest(manifest, JSON.parse(readFileSync(manifestPath, "utf8")))) throw new Error("输出目录manifest与本次种子/数量/模式/模型/源码不一致，请使用新目录");
  } else {
    if (readdirSync(output).some(file => /^\d+\.json$/.test(file))) throw new Error("目录有checkpoint却没有manifest，拒绝混入新结果");
    save(manifestPath, JSON.stringify(manifest, null, 2));
  }
  const samples: BirthSample[] = [];
  const recentBirths: NonNullable<ReturnType<typeof resolveStartPlan>["birth"]>[] = [];
  const recentBackgrounds: LifeBackground[] = [];
  function reports() {
    save(join(output, "summary.json"), JSON.stringify({ manifest, ...summarizeBirthSamples(samples) }, null, 2));
    save(join(output, "report.md"), renderBirthReport(samples, manifest));
  }
  for (let index = 1; index <= options.count; index++) {
    const seed = (options.seed ^ Math.imul(index, 0x9e3779b9)) >>> 0;
    const recent = recentBirths.slice(-6);
    const recentBg = recentBackgrounds.slice(-6);
    const plan = resolveStartPlan({ mode: "normal" }, { random: seededRandom(seed), backgroundAvoid: {
      provinceCodes: recent.map(birth => birth.location.provinceCode),
      occupationIds: recent.flatMap(birth => birth.parents.map(parent => parent.occupation.id)),
      economy: recentBg.map(background => background.economy),
      structure: recentBg.map(background => background.structure),
      event: recentBg.map(background => background.event),
    } });
    if (!plan.birth || !plan.background) throw new Error("当前开局尚未接入birth/background，拒绝生成缺失出生条件的报告");
    recentBirths.push(plan.birth);
    recentBackgrounds.push(plan.background);
    const initial = { ...plan.birth, background: plan.background };
    const checkpoint = join(output, `${String(index).padStart(3, "0")}.json`);
    if (existsSync(checkpoint)) {
      const sample = JSON.parse(readFileSync(checkpoint, "utf8")) as BirthSample;
      if (sample.index !== index || sample.seed !== seed || JSON.stringify(sample.initial) !== JSON.stringify(initial) || !["dry", "ok", "fallback", "error"].includes(sample.status)) throw new Error(`checkpoint ${index} 不匹配，拒绝覆盖`);
      samples.push(sample);
      console.log(`${index}/${options.count} resume ${sample.status}`);
      continue;
    }
    // 真实请求顺序执行并留出间隔；DeepSeek 每分钟请求数有限，避免 50 轮在后半段集中撞 429。
    if (options.live && index > 1 && options.delayMs > 0) await new Promise(resolve => setTimeout(resolve, options.delayMs));
    const state = createStartLife(plan, index % 2 ? "female" : "male");
    const startState: BirthStartSnapshot = {
      lifespan: state.lifespan,
      basic: state.basic,
      career: state.career,
      finance: state.finance,
      health: state.health,
      relationships: state.relationships,
      flags: state.flags,
      scenario: state.scenario,
    };
    const started = Date.now();
    const sample: BirthSample = { index, seed, status: "dry", durationMs: 0, retries: 0, initial, startState };
    if (options.live) {
      try {
        const iterator = streamNextEvent(state, undefined, undefined, []);
        let result = await iterator.next();
        while (!result.done) {
          if (result.value.retry) sample.retries = (sample.retries ?? 0) + 1;
          result = await iterator.next();
        }
        sample.event = result.value;
        sample.status = result.value.usage?.fallbackReason ? "fallback" : "ok";
      } catch (error) {
        sample.status = "error";
        const message = error instanceof Error ? error.message : "模型请求失败";
        sample.error = config.apiKey ? message.replaceAll(config.apiKey, "[redacted]") : message;
      }
    }
    sample.durationMs = Date.now() - started;
    save(checkpoint, JSON.stringify(sample, null, 2));
    samples.push(sample);
    reports();
    console.log(`${index}/${options.count} ${sample.status} ${sample.durationMs}ms tokens=${sample.event?.usage?.totalTokens ?? "unknown"} ${sample.event?.event.title ?? ""}`);
  }
  reports();
  console.log(`结果：${relative(process.cwd(), join(output, "report.md"))}`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "验证脚本失败"); process.exitCode = 1; });
