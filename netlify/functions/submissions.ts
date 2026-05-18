import { sql } from "./_lib/db";
import { requireAuth } from "./_lib/auth";
import { error, json, preflight } from "./_lib/http";

interface SubmitItem {
  item_id: number;
  quantity: number;
}

export default async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  if (req.method === "GET") {
    // Admin lists everything. Truck lists only their own.
    const url = new URL(req.url);
    const idParam = url.searchParams.get("id");

    if (idParam) {
      const id = Number(idParam);
      if (!Number.isFinite(id)) return error("Invalid id", 400);
      const submissionRows = await sql`
        SELECT s.id, s.title, s.submitted_at, s.truck_id, t.name AS truck_name, t.username AS truck_username
        FROM submissions s
        JOIN trucks t ON t.id = s.truck_id
        WHERE s.id = ${id}
        LIMIT 1
      `;
      const sub = submissionRows[0] as
        | { id: number; title: string; submitted_at: string; truck_id: number; truck_name: string; truck_username: string }
        | undefined;
      if (!sub) return error("Not found", 404);
      if (auth.user.role === "truck" && Number(sub.truck_id) !== Number(auth.user.sub)) {
        return error("Forbidden", 403);
      }
      const lines = await sql`
        SELECT si.id, si.item_id, si.item_name_snapshot AS name, si.quantity, si.unit_price_cents
        FROM submission_items si
        WHERE si.submission_id = ${id}
        ORDER BY LOWER(si.item_name_snapshot) ASC
      `;
      const total_cents = (lines as any[]).reduce(
        (acc: number, l: any) => acc + Number(l.quantity) * Number(l.unit_price_cents),
        0
      );
      return json({ submission: sub, lines, total_cents });
    }

    if (auth.user.role === "admin") {
      const truckFilter = url.searchParams.get("truck_id");
      const rows = truckFilter
        ? await sql`
            SELECT s.id, s.title, s.submitted_at, s.truck_id, t.name AS truck_name,
              (SELECT COALESCE(SUM(quantity * unit_price_cents), 0) FROM submission_items WHERE submission_id = s.id) AS total_cents,
              (SELECT COALESCE(SUM(quantity), 0) FROM submission_items WHERE submission_id = s.id) AS total_qty
            FROM submissions s JOIN trucks t ON t.id = s.truck_id
            WHERE s.truck_id = ${Number(truckFilter)}
            ORDER BY s.submitted_at DESC
            LIMIT 500
          `
        : await sql`
            SELECT s.id, s.title, s.submitted_at, s.truck_id, t.name AS truck_name,
              (SELECT COALESCE(SUM(quantity * unit_price_cents), 0) FROM submission_items WHERE submission_id = s.id) AS total_cents,
              (SELECT COALESCE(SUM(quantity), 0) FROM submission_items WHERE submission_id = s.id) AS total_qty
            FROM submissions s JOIN trucks t ON t.id = s.truck_id
            ORDER BY s.submitted_at DESC
            LIMIT 500
          `;
      return json({ submissions: rows });
    }

    // Truck: only their own
    const rows = await sql`
      SELECT s.id, s.title, s.submitted_at,
        (SELECT COALESCE(SUM(quantity), 0) FROM submission_items WHERE submission_id = s.id) AS total_qty
      FROM submissions s
      WHERE s.truck_id = ${Number(auth.user.sub)}
      ORDER BY s.submitted_at DESC
      LIMIT 200
    `;
    return json({ submissions: rows });
  }

  if (req.method === "POST") {
    // Trucks submit. Admins cannot submit on behalf of a truck.
    if (auth.user.role !== "truck") return error("Only trucks can submit", 403);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return error("Invalid JSON", 400);
    }
    const title = String(body?.title ?? "").trim();
    const rawItems = Array.isArray(body?.items) ? body.items : null;
    if (!title) return error("Title required", 400);
    if (!rawItems || rawItems.length === 0) return error("At least one item required", 400);

    const items: SubmitItem[] = [];
    for (const r of rawItems) {
      const item_id = Number(r?.item_id);
      const quantity = Math.round(Number(r?.quantity));
      if (!Number.isFinite(item_id) || !Number.isFinite(quantity) || quantity <= 0) {
        return error("Invalid item or quantity", 400);
      }
      items.push({ item_id, quantity });
    }

    const ids = items.map((i) => i.item_id);
    const itemRows = (await sql`
      SELECT id, name, price_cents, active FROM items WHERE id = ANY(${ids}::bigint[])
    `) as Array<{ id: number; name: string; price_cents: number; active: boolean }>;

    const byId = new Map(itemRows.map((r) => [Number(r.id), r]));
    for (const it of items) {
      const row = byId.get(it.item_id);
      if (!row) return error(`Unknown item id ${it.item_id}`, 400);
      if (!row.active) return error(`Item "${row.name}" is no longer available`, 400);
    }

    // Insert submission then line items. submitted_at uses DB default = NOW().
    const subRows = await sql`
      INSERT INTO submissions (truck_id, title)
      VALUES (${Number(auth.user.sub)}, ${title})
      RETURNING id, submitted_at
    `;
    const sub = subRows[0] as { id: number; submitted_at: string };

    for (const it of items) {
      const row = byId.get(it.item_id)!;
      await sql`
        INSERT INTO submission_items (submission_id, item_id, quantity, unit_price_cents, item_name_snapshot)
        VALUES (${sub.id}, ${it.item_id}, ${it.quantity}, ${row.price_cents}, ${row.name})
      `;
    }

    return json({ id: sub.id, submitted_at: sub.submitted_at }, 201);
  }

  return error("Method not allowed", 405);
};
