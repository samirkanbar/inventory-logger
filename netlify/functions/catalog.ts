import { sql } from "./_lib/db";
import { requireAuth } from "./_lib/auth";
import { error, json, preflight } from "./_lib/http";

// Search the FULL catalog of active items, regardless of truck assignment.
// Used by the request flow so a truck can ask for something it isn't currently
// assigned (unlike GET /api/items, which is scoped to a truck's own items).
export default async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  if (req.method !== "GET") return error("Method not allowed", 405);

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();

  // all=1 returns the whole catalog grouped for browsing, so a truck can pick
  // from a category list instead of having to guess a search term.
  if (url.searchParams.get("all") === "1") {
    const rows = await sql`
      SELECT id, name, unit, category
      FROM items
      WHERE active = TRUE
      ORDER BY LOWER(COALESCE(category, 'zzz')) ASC, LOWER(name) ASC
    `;
    return json({ items: rows });
  }

  const rows = q
    ? await sql`
        SELECT id, name, unit, category
        FROM items
        WHERE active = TRUE AND LOWER(name) LIKE ${"%" + q + "%"}
        ORDER BY LOWER(name) ASC
        LIMIT 50
      `
    : await sql`
        SELECT id, name, unit, category
        FROM items
        WHERE active = TRUE
        ORDER BY LOWER(name) ASC
        LIMIT 50
      `;

  return json({ items: rows });
};
