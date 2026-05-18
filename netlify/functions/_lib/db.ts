import { neon, neonConfig } from "@neondatabase/serverless";

neonConfig.fetchConnectionCache = true;

// Netlify DB injects NETLIFY_DB_URL at function runtime.
// Accept the older NETLIFY_DATABASE_URL and a generic DATABASE_URL for local dev too.
const url =
  process.env.NETLIFY_DB_URL ||
  process.env.NETLIFY_DATABASE_URL ||
  process.env.DATABASE_URL;
if (!url) {
  console.warn("No database URL set (NETLIFY_DB_URL / NETLIFY_DATABASE_URL / DATABASE_URL)");
}

export const sql = neon(url ?? "");
