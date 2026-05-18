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
    const url = new URL(req.url);

    if (auth.user.role === "truck") {
      // Only items assigned to this truck.
      const rows = await sql`
        SELECT i.id, i.name, i.price_cents, i.unit, i.category, i.active
        FROM items i
        JOIN truck_items ti ON ti.item_id = i.id
        WHERE ti.truck_id = ${Number(auth.user.sub)} AND i.active = TRUE
        ORDER BY LOWER(COALESCE(i.category, 'zzz')) ASC, LOWER(i.name) ASC
      `;
      return json({ items: rows });
    }

    // Admin: list everything, with truck assignment ids per item.
    const showAll = url.searchParams.get("all") === "1";
    const rows = showAll
      ? await sql`
          SELECT i.id, i.name, i.price_cents, i.unit, i.category, i.active,
            COALESCE(
              (SELECT ARRAY_AGG(ti.truck_id ORDER BY ti.truck_id) FROM truck_items ti WHERE ti.item_id = i.id),
              '{}'::bigint[]
            ) AS truck_ids
          FROM items i
          ORDER BY i.active DESC, LOWER(COALESCE(i.category, 'zzz')) ASC, LOWER(i.name) ASC
        `
      : await sql`
          SELECT i.id, i.name, i.price_cents, i.unit, i.category, i.active,
            COALESCE(
              (SELECT ARRAY_AGG(ti.truck_id ORDER BY ti.truck_id) FROM truck_items ti WHERE ti.item_id = i.id),
              '{}'::bigint[]
            ) AS truck_ids
          FROM items i
          WHERE i.active = TRUE
          ORDER BY LOWER(COALESCE(i.category, 'zzz')) ASC, LOWER(i.name) ASC
        `;
    return json({ items: rows });
  }

  // Mutations: admin only
  if (auth.user.role !== "admin") return error("Forbidden", 403);

  if (req.method === "POST") {
    // Bulk import. Body: { items: [...], truck_ids: number[], replace?: boolean }
    let body: any;
    try {
      body = await req.json();
    } catch {
      return error("Invalid JSON", 400);
    }
    const raw = Array.isArray(body?.items) ? body.items : null;
    const rawTruckIds = Array.isArray(body?.truck_ids) ? body.truck_ids : null;
    if (!raw) return error("items array required", 400);
    if (!rawTruckIds || rawTruckIds.length === 0) {
      return error("Pick at least one truck for this import", 400);
    }
    const truckIds = rawTruckIds
      .map((x: unknown) => Number(x))
      .filter((n: number) => Number.isFinite(n) && n > 0);
    if (truckIds.length === 0) return error("Invalid truck_ids", 400);

    // Verify all truck_ids exist.
    const existingTrucks = (await sql`
      SELECT id FROM trucks WHERE id = ANY(${truckIds}::bigint[])
    `) as Array<{ id: number }>;
    if (existingTrucks.length !== truckIds.length) {
      return error("One or more truck IDs do not exist", 400);
    }

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

    let inserted = 0;
    let updated = 0;
    const importedItemIds: number[] = [];
    for (const row of cleaned) {
      const result = (await sql`
        INSERT INTO items (name, price_cents, unit, category, active, updated_at)
        VALUES (${row.name}, ${row.price_cents}, ${row.unit}, ${row.category}, TRUE, NOW())
        ON CONFLICT (LOWER(name)) DO UPDATE
          SET price_cents = EXCLUDED.price_cents,
              unit        = EXCLUDED.unit,
              category    = EXCLUDED.category,
              active      = TRUE,
              updated_at  = NOW()
        RETURNING id, (xmax = 0) AS inserted
      `) as Array<{ id: number; inserted: boolean }>;
      const r0 = result[0];
      if (!r0) continue;
      if (r0.inserted) inserted++;
      else updated++;
      importedItemIds.push(Number(r0.id));
    }

    // Replace mode: for the selected trucks, drop their existing assignments
    // to any items NOT in this import. (Items themselves stay in DB.)
    if (replace && importedItemIds.length > 0) {
      await sql`
        DELETE FROM truck_items
        WHERE truck_id = ANY(${truckIds}::bigint[])
          AND item_id <> ALL(${importedItemIds}::bigint[])
      `;
    }

    // Assign imported items to the selected trucks. ON CONFLICT keeps existing.
    let assignments = 0;
    for (const itemId of importedItemIds) {
      for (const truckId of truckIds) {
        const r = (await sql`
          INSERT INTO truck_items (truck_id, item_id)
          VALUES (${truckId}, ${itemId})
          ON CONFLICT DO NOTHING
          RETURNING 1
        `) as Array<unknown>;
        if (r.length > 0) assignments++;
      }
    }

    return json({
      ok: true,
      inserted,
      updated,
      total: cleaned.length,
      replace,
      truck_ids: truckIds,
      assignments_added: assignments,
    });
  }

  if (req.method === "PATCH") {
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

    // Overwrite truck assignments for this item.
    if (Array.isArray(body?.truck_ids)) {
      const truckIds = (body.truck_ids as unknown[])
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0);
      await sql`DELETE FROM truck_items WHERE item_id = ${id}`;
      for (const truckId of truckIds) {
        await sql`
          INSERT INTO truck_items (truck_id, item_id) VALUES (${truckId}, ${id})
          ON CONFLICT DO NOTHING
        `;
      }
    }

    return json({ ok: true });
  }

  return error("Method not allowed", 405);
};
