import { sql } from "./_lib/db";
import { requireAuth } from "./_lib/auth";
import { error, json, preflight } from "./_lib/http";
import { sendExpoPush, PushMessage } from "./_lib/push";

interface Line {
  item_id: number | null;
  name: string;
  quantity: number | null;
}

// One short line summarizing a whole request for the push body.
function summarize(lines: Line[]): string {
  const fmt = (l: Line) => (l.quantity ? `${l.name} ×${l.quantity}` : l.name);
  if (lines.length === 1) return fmt(lines[0]);
  const shown = lines.slice(0, 3).map(fmt).join(", ");
  const extra = lines.length - 3;
  return `${lines.length} items: ${shown}${extra > 0 ? ` +${extra} more` : ""}`;
}

export default async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  if (req.method === "GET") {
    // Admin sees every request; a truck sees only its own.
    if (auth.user.role === "admin") {
      const rows = await sql`
        SELECT r.id, r.truck_id, t.name AS truck_name, r.item_id,
          COALESCE(i.name, r.custom_name) AS item_name,
          r.custom_name, r.quantity, r.note, r.status, r.created_at, r.resolved_at
        FROM requests r
        JOIN trucks t ON t.id = r.truck_id
        LEFT JOIN items i ON i.id = r.item_id
        ORDER BY r.created_at DESC
        LIMIT 500
      `;
      return json({ requests: rows });
    }

    const rows = await sql`
      SELECT r.id, r.item_id,
        COALESCE(i.name, r.custom_name) AS item_name,
        r.custom_name, r.quantity, r.note, r.status, r.created_at
      FROM requests r
      LEFT JOIN items i ON i.id = r.item_id
      WHERE r.truck_id = ${Number(auth.user.sub)}
      ORDER BY r.created_at DESC
      LIMIT 200
    `;
    return json({ requests: rows });
  }

  if (req.method === "POST") {
    // Only trucks raise requests.
    if (auth.user.role !== "truck") return error("Only trucks can request items", 403);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return error("Invalid JSON", 400);
    }

    // Accept a list of items; also tolerate the older single-item shape.
    const rawItems = Array.isArray(body?.items) ? body.items : [body];
    if (rawItems.length === 0) return error("No items in request", 400);

    const lines: Line[] = [];
    for (const r of rawItems) {
      const hasItemId = r?.item_id !== undefined && r?.item_id !== null;
      const customName = String(r?.custom_name ?? "").trim();

      let quantity: number | null = null;
      if (r?.quantity !== undefined && r?.quantity !== null && r?.quantity !== "") {
        const q = Math.round(Number(r.quantity));
        if (!Number.isFinite(q) || q <= 0) return error("Invalid quantity", 400);
        quantity = q;
      }

      if (hasItemId) {
        const id = Number(r.item_id);
        if (!Number.isFinite(id)) return error("Invalid item_id", 400);
        const rows = (await sql`
          SELECT id, name FROM items WHERE id = ${id} AND active = TRUE LIMIT 1
        `) as Array<{ id: number; name: string }>;
        const item = rows[0];
        if (!item) return error("Item not found or inactive", 400);
        lines.push({ item_id: Number(item.id), name: item.name, quantity });
      } else if (customName) {
        lines.push({ item_id: null, name: customName, quantity });
      } else {
        return error("Each item needs an item_id or custom_name", 400);
      }
    }

    // One DB row per requested item.
    for (const l of lines) {
      await sql`
        INSERT INTO requests (truck_id, item_id, custom_name, quantity)
        VALUES (
          ${Number(auth.user.sub)},
          ${l.item_id},
          ${l.item_id ? null : l.name},
          ${l.quantity}
        )
      `;
    }

    // One push to all admins summarizing the whole request.
    const tokenRows = (await sql`
      SELECT expo_token FROM push_tokens WHERE role = 'admin'
    `) as Array<{ expo_token: string }>;

    if (tokenRows.length > 0) {
      const body = summarize(lines);
      const messages: PushMessage[] = tokenRows.map((t) => ({
        to: t.expo_token,
        title: `New request — ${auth.user.label}`,
        body,
        data: { type: "request" },
      }));
      await sendExpoPush(messages);
    }

    return json({ ok: true, count: lines.length }, 201);
  }

  if (req.method === "PATCH") {
    // Admins mark a request as sent or declined (or reopen it).
    if (auth.user.role !== "admin") return error("Only admins can update requests", 403);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return error("Invalid JSON", 400);
    }
    const id = Number(body?.id);
    const status = String(body?.status ?? "");
    if (!Number.isFinite(id)) return error("Invalid id", 400);
    if (!["open", "sent", "declined"].includes(status)) return error("Invalid status", 400);

    // resolved_at is stamped when handled, cleared if reopened.
    const rows =
      status === "open"
        ? ((await sql`
            UPDATE requests SET status = 'open', resolved_at = NULL
            WHERE id = ${id}
            RETURNING id, status, resolved_at
          `) as any[])
        : ((await sql`
            UPDATE requests SET status = ${status}, resolved_at = NOW()
            WHERE id = ${id}
            RETURNING id, status, resolved_at
          `) as any[]);

    if (rows.length === 0) return error("Request not found", 404);
    return json({ request: rows[0] });
  }

  return error("Method not allowed", 405);
};
