import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

if (!process.env.DATABASE_URL) {
  console.error("Migration refused: DATABASE_URL is required");
  process.exitCode = 1;
} else {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 3000,
    statement_timeout: 60000,
    idle_in_transaction_session_timeout: 60000,
    application_name: "findjoy-migration",
  });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1927681101)");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const directory = new URL("../migrations/", import.meta.url);
    const files = (await readdir(directory)).filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file)).sort();
    if (!files.length) throw new Error("No migration files");
    const history = (await client.query("SELECT version,checksum FROM schema_migrations")).rows;
    if (history.some((row) => !files.includes(row.version))) throw new Error("Unknown migration history");
    for (const file of files) {
      const sql = await readFile(new URL(file, directory), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = history.find((row) => row.version === file);
      if (previous) {
        if (previous.checksum !== checksum) throw new Error("Migration checksum mismatch");
        continue;
      }
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(version,checksum) VALUES ($1,$2)", [file, checksum]);
    }
    await client.query("COMMIT");
    console.log("PostgreSQL migrations verified and applied");
  } catch {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("PostgreSQL migration failed; deployment must stop. No credentials or SQL parameters logged.");
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
}
