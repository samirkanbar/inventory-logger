import { neon, neonConfig } from "@neondatabase/serverless";

neonConfig.fetchConnectionCache = true;

const url = process.env.DATABASE_URL;
if (!url) {
  // Logged at cold start; functions will respond 500 via the http helper.
  console.warn("DATABASE_URL is not set");
}

export const sql = neon(url ?? "");
