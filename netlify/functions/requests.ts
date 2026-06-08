import { sql } from "./_lib/db";
import { requireAuth } from "./_lib/auth";
import { error, json, preflight } from "./_lib/http";
import { sendExpoPush, PushMessage } from "./_lib/push";

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
          r.custom_name, r.quantity, r.note, r.status, r.created_at
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

    const hasItemId = body?.item_id !== undefined && body?.item_id !== null;
    const customName = String(body?.custom_name ?? "").trim();
    const note = String(body?.note ?? "").trim() || null;

    // quantity is optional, but if present it must be a positive integer.
    let quantity: number | null = null;
    if (body?.quantity !== undefined && body?.quantity !== null && body?.quantity !== "") {
      const q = Math.round(Number(body.quantity));
      if (!Number.isFinite(q) || q <= 0) return error("Invalid quantity", 400);
      quantity = q;
    }

    let itemId: number | null = null;
    let itemName: string;

    if (hasItemId) {
      const id = Number(body.item_id);
      if (!Number.isFinite(id)) return error("Invalid item_id", 400);
      const rows = (await sql`
        SELECT id, name FROM items WHERE id = ${id} AND active = TRUE LIMIT 1
      `) as Array<{ id: number; name: string }>;
      const item = rows[0];
      if (!item) return error("Item not found or inactive", 400);
      itemId = Number(item.id);
      itemName = item.name;
    } else if (customName) {
      itemName = customName;
    } else {
      return error("Provide an item_id or a custom_name", 400);
    }

    const inserted = (await sql`
      INSERT INTO requests (truck_id, item_id, custom_name, quantity, note)
      VALUES (
        ${Number(auth.user.sub)},
        ${itemId},
        ${itemId ? null : itemName},
        ${quantity},
        ${note}
      )
      RETURNING id, created_at
    `) as Array<{ id: number; created_at: string }>;
    const row = inserted[0];

    // Notify every admin device. auth.user.label is the truck's name.
    const tokenRows = (await sql`
      SELECT expo_token FROM push_tokens WHERE role = 'admin'
    `) as Array<{ expo_token: string }>;

    if (tokenRows.length > 0) {
      const qtySuffix = quantity ? ` × ${quantity}` : "";
      const messages: PushMessage[] = tokenRows.map((t) => ({
        to: t.expo_token,
        title: `New request — ${auth.user.label}`,
        body: `${itemName}${qtySuffix}`,
        data: { type: "request", requestId: row.id },
      }));
      await sendExpoPush(messages);
    }

    return json({ id: row.id, created_at: row.created_at }, 201);
  }

  return error("Method not allowed", 405);
};
