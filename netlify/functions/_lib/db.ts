import { neon, neonConfig } from "@neondatabase/serverless";

neonConfig.fetchConnectionCache = true;

// Accept either name — Netlify DB injects NETLIFY_DATABASE_URL automatically.
const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.warn("No database URL set (NETLIFY_DATABASE_URL or DATABASE_URL)");
}

export const sql = neon(url ?? "");
