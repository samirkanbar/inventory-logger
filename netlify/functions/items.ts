import { sql } from "./_lib/db";
import { requireAuth } from "./_lib/auth";
import { error, json, preflight } from "./_lib/http";

interface ImportRow {
  name: string;
  price_cents: number;
  unit?: string | null;
  category?: string | null;
}

export default async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  if (req.method === "GET") {
    // Both trucks and admins can list items. Admin sees inactive too via ?all=1.
    const url = new URL(req.url);
    const showAll = auth.user.role === "admin" && url.searchParams.get("all") === "1";
    const rows = showAll
      ? await sql`SELECT id, name, price_cents, unit, category, active FROM items ORDER BY active DESC, LOWER(COALESCE(category, 'zzz')) ASC, LOWER(name) ASC`
      : await sql`SELECT id, name, price_cents, unit, category, active FROM items WHERE active = TRUE ORDER BY LOWER(COALESCE(category, 'zzz')) ASC, LOWER(name) ASC`;
    return json({ items: rows });
  }

  // Mutations: admin only
  if (auth.user.role !== "admin") return error("Forbidden", 403);

  if (req.method === "POST") {
    // Bulk import. Body: { items: [{name, price_cents, unit?}], replace?: boolean }
    let body: any;
    try {
      body = await req.json();
    } catch {
      return error("Invalid JSON", 400);
    }
    const raw = Array.isArray(body?.items) ? body.items : null;
    if (!raw) return error("items array required", 400);
    const replace = body?.replace === true;

    const cleaned: ImportRow[] = [];
    for (const r of raw) {
      const name = String(r?.name ?? "").trim();
      const price = Math.round(Number(r?.price_cents));
      const unit = r?.unit ? String(r.unit).trim() : null;
      const category = r?.category ? String(r.category).trim() : null;
      if (!name) return error(`Row missing name: ${JSON.stringify(r)}`, 400);
      if (!Number.isFinite(price) || price < 0) {
        return error(`Invalid price_cents for "${name}"`, 400);
      }
      cleaned.push({ name, price_cents: price, unit, category });
    }

    // Upsert by lower(name). "replace" mode deactivates items not present in the new sheet.
    if (replace) {
      await sql`UPDATE items SET active = FALSE WHERE active = TRUE`;
    }

    let inserted = 0;
    let updated = 0;
    for (const row of cleaned) {
      const result = await sql`
        INSERT INTO items (name, price_cents, unit, category, active, updated_at)
        VALUES (${row.name}, ${row.price_cents}, ${row.unit}, ${row.category}, TRUE, NOW())
        ON CONFLICT (LOWER(name)) DO UPDATE
          SET price_cents = EXCLUDED.price_cents,
              unit        = EXCLUDED.unit,
              category    = EXCLUDED.category,
              active      = TRUE,
              updated_at  = NOW()
        RETURNING (xmax = 0) AS inserted
      `;
      const r0 = result[0] as { inserted: boolean } | undefined;
      if (r0?.inserted) inserted++;
      else updated++;
    }
    return json({ ok: true, inserted, updated, total: cleaned.length, replace });
  }

  if (req.method === "PATCH") {
    // Toggle active or update price for a single item.
    let body: any;
    try {
      body = await req.json();
    } catch {
      return error("Invalid JSON", 400);
    }
    const id = Number(body?.id);
    if (!Number.isFinite(id)) return error("id required", 400);
    if (typeof body?.active === "boolean") {
      await sql`UPDATE items SET active = ${body.active}, updated_at = NOW() WHERE id = ${id}`;
    }
    if (Number.isFinite(Number(body?.price_cents))) {
      const p = Math.round(Number(body.price_cents));
      await sql`UPDATE items SET price_cents = ${p}, updated_at = NOW() WHERE id = ${id}`;
    }
    if (typeof body?.category === "string" || body?.category === null) {
      const cat = body.category === null ? null : String(body.category).trim() || null;
      await sql`UPDATE items SET category = ${cat}, updated_at = NOW() WHERE id = ${id}`;
    }
    return json({ ok: true });
  }

  return error("Method not allowed", 405);
};
