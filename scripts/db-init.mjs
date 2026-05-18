import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No DB URL set. Put NETLIFY_DATABASE_URL or DATABASE_URL in .env.");
  process.exit(1);
}

const sql = neon(url);
const schema = readFileSync(join(__dirname, "..", "db", "schema.sql"), "utf8");

const statements = schema
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

for (const stmt of statements) {
  process.stdout.write(`> ${stmt.split("\n")[0].slice(0, 80)}... `);
  // neon()'s returned function supports both tagged-template and direct-string calls.
  await sql(stmt);
  console.log("ok");
}
console.log("Schema applied.");
