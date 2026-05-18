import { sql } from "./_lib/db";
import { hashPassword, requireAuth } from "./_lib/auth";
import { error, json, preflight } from "./_lib/http";

export default async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const auth = requireAuth(req, "admin");
  if (auth instanceof Response) return auth;

  if (req.method === "GET") {
    const rows = await sql`
      SELECT id, username, name, active, created_at FROM trucks ORDER BY active DESC, name ASC
    `;
    return json({ trucks: rows });
  }

  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return error("Invalid JSON", 400);
    }
    const username = String(body?.username ?? "").trim().toLowerCase();
    const name = String(body?.name ?? "").trim();
    const password = String(body?.password ?? "");
    if (!username || !name || !password) {
      return error("username, name, password required", 400);
    }
    if (password.length < 6) return error("Password must be at least 6 characters", 400);
    if (!/^[a-z0-9._-]+$/.test(username)) {
      return error("Username may only contain lowercase letters, digits, dot, underscore, dash", 400);
    }
    const hash = await hashPassword(password);
    try {
      const rows = await sql`
        INSERT INTO trucks (username, name, password_hash)
        VALUES (${username}, ${name}, ${hash})
        RETURNING id, username, name, active, created_at
      `;
      return json({ truck: rows[0] }, 201);
    } catch (e: any) {
      if (String(e?.message || "").includes("duplicate")) return error("Username already exists", 409);
      throw e;
    }
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
      await sql`UPDATE trucks SET active = ${body.active} WHERE id = ${id}`;
    }
    if (typeof body?.password === "string" && body.password.length >= 6) {
      const h = await hashPassword(body.password);
      await sql`UPDATE trucks SET password_hash = ${h} WHERE id = ${id}`;
    }
    return json({ ok: true });
  }

  return error("Method not allowed", 405);
};
