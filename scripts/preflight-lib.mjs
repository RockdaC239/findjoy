import { readFileSync, statSync } from "node:fs";
import path from "node:path";

export const REQUIRED_TABLES = [
  "identity_users", "identity_links", "identity_sessions", "identity_login_transactions",
  "lives", "transcripts", "joy_accounts", "joy_ledger", "joy_orders", "joy_order_checks",
  "joy_payment_attempts", "joy_payment_events", "joy_life_operations", "joy_generation_locks",
  "joy_endings", "joy_rate_limits", "joy_migrations", "joy_generation_admissions", "joy_payment_review_events",
];

const pass = (name, detail) => ({ name, status: "pass", detail });
const warn = (name, detail) => ({ name, status: "warn", detail });
const fail = (name, detail) => ({ name, status: "fail", detail });

function positiveInteger(value, min, max) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max;
}

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function webOrigin(value, allowHttp) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return false;
    if (url.protocol === "https:") return true;
    return allowHttp && url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function privateFile(file) {
  try {
    const stat = statSync(file);
    return stat.isFile() && (stat.mode & 0o077) === 0;
  } catch {
    return false;
  }
}

function checkPaymentConfig(env) {
  const checks = [];
  const mode = env.FINDJOY_PAYMENTS_MODE || "demo";
  if (!["demo", "live"].includes(mode)) {
    checks.push(fail("payment.mode", "FINDJOY_PAYMENTS_MODE 只能是 demo 或 live"));
    return checks;
  }
  checks.push(pass("payment.mode", mode === "live" ? "live 模式，将创建真实收款订单" : "demo 模式，不产生真实收款"));
  if (mode !== "live") return checks;

  let products;
  try {
    products = JSON.parse(env.FINDJOY_PRODUCTS_JSON || "");
  } catch {
    products = null;
  }
  const validProducts = Array.isArray(products) && products.length > 0 && products.every((product) =>
    product && typeof product === "object" &&
    typeof product.id === "string" && /^[a-z0-9_-]{1,32}$/.test(product.id) &&
    typeof product.name === "string" && product.name.length >= 1 && product.name.length <= 40 &&
    positiveInteger(product.credits, 1, 1000000) && positiveInteger(product.amountFen, 1, 10000000));
  const uniqueIds = validProducts && new Set(products.map((product) => product.id)).size === products.length;
  checks.push(validProducts && uniqueIds
    ? pass("payment.products", `已配置 ${products.length} 个套餐`)
    : fail("payment.products", "FINDJOY_PRODUCTS_JSON 必须是字段合法且 id 唯一的套餐数组"));

  checks.push(webOrigin(env.XIAODOU_BASE_URL || "", false)
    ? pass("payment.gateway", "支付网关使用 HTTPS")
    : fail("payment.gateway", "XIAODOU_BASE_URL 必须是 HTTPS 地址"));
  checks.push(env.XIAODOU_APP_ID && env.XIAODOU_KEY_ID
    ? pass("payment.credentials", "支付应用标识已配置")
    : fail("payment.credentials", "缺少 XIAODOU_APP_ID 或 XIAODOU_KEY_ID"));

  const privateKey = env.XIAODOU_PRIVATE_KEY_FILE || "";
  checks.push(path.isAbsolute(privateKey) && privateFile(privateKey)
    ? pass("payment.privateKey", "商户私钥位于源码树外且仅本人可读")
    : fail("payment.privateKey", "XIAODOU_PRIVATE_KEY_FILE 必须是绝对路径、可读且权限不大于 600"));

  const platformKeys = env.XIAODOU_PLATFORM_KEYS_FILE || "";
  let keysValid = false;
  try {
    const parsed = JSON.parse(readFileSync(platformKeys, "utf8"));
    keysValid = parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
      Object.keys(parsed).length > 0 && Object.values(parsed).every((pem) => typeof pem === "string" && pem.includes("BEGIN PUBLIC KEY"));
  } catch {
    keysValid = false;
  }
  checks.push(keysValid
    ? pass("payment.platformKeys", "平台公钥已固定")
    : fail("payment.platformKeys", "XIAODOU_PLATFORM_KEYS_FILE 必须包含 kid → PEM 的公钥映射"));

  const origins = (env.XIAODOU_CASHIER_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  checks.push(origins.length > 0 && origins.every((origin) => webOrigin(origin, false))
    ? pass("payment.cashierOrigins", "收银台来源已限制为 HTTPS")
    : fail("payment.cashierOrigins", "XIAODOU_CASHIER_ORIGINS 必须是非空的 HTTPS 来源列表"));

  checks.push((env.FINDJOY_RECONCILE_TOKEN || "").length >= 32
    ? pass("payment.reconcileToken", "对账令牌长度满足要求")
    : fail("payment.reconcileToken", "FINDJOY_RECONCILE_TOKEN 至少需要 32 个字符"));
  return checks;
}

/**
 * 纯配置检查；不连接数据库、不输出任何密钥或连接串。
 * options: { allowHttp, allowPrivilegedRole, requireBackup }
 */
export function staticChecks(env, options = {}) {
  const checks = [];
  const allowHttp = Boolean(options.allowHttp);
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push(nodeMajor >= 22 ? pass("runtime.node", `Node.js ${process.versions.node}`) : fail("runtime.node", "需要 Node.js 22 或更高版本"));

  try {
    const url = new URL(env.DATABASE_URL || "");
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.pathname.slice(1)) throw new Error("invalid");
    checks.push(pass("database.url", "已配置独立 PostgreSQL 连接串"));
  } catch {
    checks.push(fail("database.url", "DATABASE_URL 缺失或不是有效的 PostgreSQL 连接串"));
  }

  checks.push(webOrigin(env.FINDJOY_APP_ORIGIN || "", allowHttp)
    ? pass("app.origin", "应用访问地址合法")
    : fail("app.origin", "FINDJOY_APP_ORIGIN 必须是 HTTPS（本地 profile 允许 localhost HTTP）"));

  try {
    const issuer = new URL(env.AUTHING_ISSUER || "");
    checks.push(issuer.protocol === "https:" && Boolean(env.AUTHING_CLIENT_ID)
      ? pass("auth.config", "OIDC 登录配置完整")
      : fail("auth.config", "AUTHING_ISSUER 必须为 HTTPS 且 AUTHING_CLIENT_ID 不能为空"));
  } catch {
    checks.push(fail("auth.config", "AUTHING_ISSUER 缺失或不是有效 URL"));
  }

  const modelMode = env.FINDJOY_MODEL_CONFIG_MODE || "environment";
  if (modelMode === "local") {
    checks.push(options.allowLocalModelConfig ? warn("model.mode", "使用本地模型配置文件，仅适用于开发环境") : fail("model.mode", "生产环境必须使用 environment 模型配置"));
  } else if (modelMode === "environment") {
    const key = env.LLM_API_KEY || env.OPENAI_API_KEY || "";
    checks.push(httpsUrl(env.LLM_BASE_URL || "") && key && (env.LLM_MODEL || env.OPENAI_MODEL)
      ? pass("model.config", "模型地址、密钥和模型名已配置")
      : fail("model.config", "LLM_BASE_URL 需为 HTTPS，且 LLM_API_KEY / LLM_MODEL 不能为空"));
  } else {
    checks.push(fail("model.mode", "FINDJOY_MODEL_CONFIG_MODE 只能是 environment 或 local"));
  }

  checks.push(positiveInteger(env.FINDJOY_DB_POOL_MAX ?? 5, 1, 20)
    ? pass("database.pool", "连接池上限在 1–20 之间")
    : fail("database.pool", "FINDJOY_DB_POOL_MAX 必须是 1–20 的整数"));
  const generationEnabled = env.FINDJOY_GENERATION_ENABLED ?? "true";
  checks.push(["true", "false"].includes(generationEnabled)
    ? pass("generation.enabled", generationEnabled === "true" ? "新生成已开启" : "新生成已暂停，已有存档仍可恢复")
    : fail("generation.enabled", "FINDJOY_GENERATION_ENABLED 只能是 true 或 false"));
  checks.push(positiveInteger(env.FINDJOY_GENERATION_MAX_CONCURRENT ?? 4, 1, 20)
    ? pass("generation.concurrency", "全站生成并发上限在 1–20 之间")
    : fail("generation.concurrency", "FINDJOY_GENERATION_MAX_CONCURRENT 必须是 1–20 的整数"));
  checks.push(positiveInteger(env.FINDJOY_TRIAL_CREDITS ?? 40, 0, 100)
    ? pass("generation.trialCredits", "新用户赠送积分在 0–100 之间")
    : fail("generation.trialCredits", "FINDJOY_TRIAL_CREDITS 必须是 0–100 的整数"));

  checks.push(...checkPaymentConfig(env));

  if (env.FINDJOY_BACKUP_DIR) {
    checks.push(path.isAbsolute(env.FINDJOY_BACKUP_DIR)
      ? pass("backup.directory", "备份目录为绝对路径")
      : fail("backup.directory", "FINDJOY_BACKUP_DIR 必须是绝对路径"));
  } else {
    checks.push(options.requireBackup ? fail("backup.directory", "FINDJOY_BACKUP_DIR 未配置，无法验证最近备份") : warn("backup.directory", "未配置备份目录，仅适用于本地开发"));
  }

  const offsite = env.FINDJOY_BACKUP_OFFSITE || "";
  const offsiteValid = Boolean(offsite) && (offsite.startsWith("rclone:") && offsite.length > 7 || path.isAbsolute(offsite));
  checks.push(offsiteValid
    ? pass("backup.offsite", "已配置异机备份目标")
    : options.requireOffsite ? fail("backup.offsite", "FINDJOY_BACKUP_OFFSITE 未配置或格式无效（rclone: 远程或绝对目录）") : warn("backup.offsite", "未配置异机备份目标"));
  checks.push(httpsUrl(env.FINDJOY_ALERT_WEBHOOK || "")
    ? pass("alert.webhook", "失败告警 Webhook 使用 HTTPS")
    : options.requireAlert ? fail("alert.webhook", "FINDJOY_ALERT_WEBHOOK 未配置或不是 HTTPS 地址") : warn("alert.webhook", "未配置失败告警 Webhook"));
  checks.push(positiveInteger(env.FINDJOY_BACKUP_KEEP_DAILY ?? 7, 1, 90)
    ? pass("backup.keepDaily", "日备份保留数量在 1–90 之间")
    : fail("backup.keepDaily", "FINDJOY_BACKUP_KEEP_DAILY 必须是 1–90 的整数"));
  checks.push(positiveInteger(env.FINDJOY_BACKUP_KEEP_WEEKLY ?? 4, 1, 52)
    ? pass("backup.keepWeekly", "周备份保留数量在 1–52 之间")
    : fail("backup.keepWeekly", "FINDJOY_BACKUP_KEEP_WEEKLY 必须是 1–52 的整数"));
  return checks;
}

/** 数据库元数据检查；所有输入均由调用方从真实连接读取。 */
export function databaseChecks(metadata, expectedMigrations, options = {}) {
  const checks = [];
  checks.push(metadata.serverVersionNum >= 150000
    ? pass("database.version", `PostgreSQL ${metadata.serverVersion}`)
    : fail("database.version", `需要 PostgreSQL 15 或更高版本，当前 ${metadata.serverVersion}`));
  checks.push(metadata.inRecovery === false ? pass("database.primary", "连接到主库") : fail("database.primary", "不能连接到只读恢复库"));
  if (!/^[a-z0-9_]+$/.test(metadata.database)) checks.push(fail("database.name", "数据库名称异常"));
  else if (metadata.database === "postgres") checks.push(warn("database.name", "正在使用 postgres 默认库，建议使用独立业务库"));
  else checks.push(pass("database.name", `业务库 ${metadata.database}`));

  const history = metadata.history || [];
  const versionsMatch = history.length === expectedMigrations.length &&
    history.every((row, index) => row.version === expectedMigrations[index].version && row.checksum === expectedMigrations[index].checksum);
  checks.push(versionsMatch
    ? pass("database.migrations", `已应用 ${history.length} 个迁移且校验和一致`)
    : fail("database.migrations", "数据库迁移缺失、顺序不一致或被改写，禁止发布；先运行 npm run db:migrate"));

  const privileged = metadata.role.superuser || metadata.role.createdb || metadata.role.createrole;
  if (!privileged) checks.push(pass("database.role", `运行角色 ${metadata.role.name} 无建库/建角色/超级用户权限`));
  else if (options.allowPrivilegedRole) checks.push(warn("database.role", `运行角色 ${metadata.role.name} 权限过高，仅本地测试允许`));
  else checks.push(fail("database.role", `运行角色 ${metadata.role.name} 拥有超级用户/建库/建角色权限，必须改用受限角色`));

  checks.push(metadata.tableAccess ? pass("database.tables", "运行角色具备必要表的读写权限") : fail("database.tables", "运行角色缺少必要表权限或表不存在"));
  checks.push(metadata.sequenceAccess ? pass("database.sequence", "运行角色具备账本序列使用权限") : fail("database.sequence", "运行角色缺少 joy_ledger 序列 USAGE 权限"));

  const used = Number(metadata.connections?.used);
  const max = Number(metadata.connections?.max);
  if (Number.isFinite(used) && Number.isFinite(max) && max > 0) {
    checks.push(used / max >= 0.8
      ? warn("database.connections", `连接使用率 ${used}/${max}，发布前确认余量`)
      : pass("database.connections", `连接使用率 ${used}/${max}`));
  }
  return checks;
}

/** 备份新鲜度检查；latest 由调用方读取 manifest 后传入。 */
export function backupChecks(latest, options = {}) {
  const checks = [];
  const requireBackup = Boolean(options.requireBackup);
  const maxAgeHours = Number(options.maxBackupAgeHours ?? 26);
  if (!latest) {
    checks.push(requireBackup ? fail("backup.latest", "没有找到已完成的备份清单") : warn("backup.latest", "没有找到已完成的备份清单"));
    return checks;
  }
  const ageHours = (options.now - Date.parse(latest.completedAt)) / 3600000;
  if (!Number.isFinite(ageHours) || ageHours < 0) {
    checks.push(fail("backup.latest", "备份完成时间无效"));
  } else if (ageHours > maxAgeHours) {
    checks.push(fail("backup.latest", `最近备份已 ${ageHours.toFixed(1)} 小时，超过 ${maxAgeHours} 小时上限`));
  } else {
    checks.push(pass("backup.latest", `最近备份 ${ageHours.toFixed(1)} 小时前完成`));
  }
  checks.push(latest.archiveExists && latest.archiveBytes === latest.bytes
    ? pass("backup.archive", "备份文件存在且大小与清单一致")
    : fail("backup.archive", "备份文件缺失或大小与清单不一致"));
  if (latest.sha256) {
    checks.push(latest.checksumMatches ? pass("backup.checksum", "备份 SHA-256 与清单一致") : fail("backup.checksum", "备份 SHA-256 与清单不一致"));
  } else {
    checks.push(warn("backup.checksum", "备份清单缺少 SHA-256，无法校验完整性"));
  }
  return checks;
}

/** 磁盘余量检查；freeBytes 由 fs.statfs 读取。 */
export function diskChecks(freeBytes, minFreeGb, label = "应用目录") {
  const minBytes = Number(minFreeGb) * 1024 ** 3;
  if (!Number.isFinite(minBytes) || minBytes < 0) return [fail("disk.free", "磁盘余量阈值配置无效")];
  return [freeBytes >= minBytes
    ? pass("disk.free", `${label}剩余 ${(freeBytes / 1024 ** 3).toFixed(1)} GiB`)
    : fail("disk.free", `${label}剩余 ${(freeBytes / 1024 ** 3).toFixed(1)} GiB，低于 ${minFreeGb} GiB`)];
}

export function summarize(checks) {
  return {
    ok: !checks.some((check) => check.status === "fail"),
    fails: checks.filter((check) => check.status === "fail").length,
    warnings: checks.filter((check) => check.status === "warn").length,
    passes: checks.filter((check) => check.status === "pass").length,
  };
}

export function formatChecks(checks) {
  const marker = { pass: "PASS", warn: "WARN", fail: "FAIL" };
  return checks.map((check) => `[${marker[check.status]}] ${check.name}: ${check.detail}`).join("\n");
}
