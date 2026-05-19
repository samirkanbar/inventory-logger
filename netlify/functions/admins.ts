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
      SELECT id, email, created_at FROM admins ORDER BY email ASC
    `;
    return json({ admins: rows, me: auth.user.sub });
  }

  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return error("Invalid JSON", 400);
    }
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    if (!email || !password) return error("email and password required", 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error("Invalid email", 400);
    if (password.length < 6) return error("Password must be at least 6 characters", 400);
    const hash = await hashPassword(password);
    try {
      const rows = await sql`
        INSERT INTO admins (email, password_hash)
        VALUES (${email}, ${hash})
        RETURNING id, email, created_at
      `;
      return json({ admin: rows[0] }, 201);
    } catch (e: any) {
      if (String(e?.message || "").includes("duplicate")) return error("Email already exists", 409);
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
    if (typeof body?.password === "string" && body.password.length >= 6) {
      const h = await hashPassword(body.password);
      await sql`UPDATE admins SET password_hash = ${h} WHERE id = ${id}`;
      return json({ ok: true });
    }
    return error("Password (min 6 chars) required", 400);
  }

  if (req.method === "DELETE") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return error("Invalid JSON", 400);
    }
    const id = Number(body?.id);
    if (!Number.isFinite(id)) return error("id required", 400);
    if (id === Number(auth.user.sub)) return error("You can't delete your own account", 400);
    const countRows = (await sql`SELECT COUNT(*)::int AS c FROM admins`) as Array<{ c: number }>;
    const total = countRows[0]?.c ?? 0;
    if (total <= 1) return error("Can't delete the last admin", 400);
    await sql`DELETE FROM admins WHERE id = ${id}`;
    return json({ ok: true });
  }

  return error("Method not allowed", 405);
};
