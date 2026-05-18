import { sql } from "./_lib/db";
import { comparePassword, sign } from "./_lib/auth";
import { error, json, preflight } from "./_lib/http";

export default async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return error("Method not allowed", 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }

  const role = body?.role as "admin" | "truck" | undefined;
  const password = String(body?.password ?? "");
  if (!password) return error("Password required", 400);

  if (role === "admin") {
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!email) return error("Email required", 400);
    const rows = await sql`SELECT id, email, password_hash FROM admins WHERE email = ${email} LIMIT 1`;
    const a = rows[0] as { id: number; email: string; password_hash: string } | undefined;
    if (!a || !(await comparePassword(password, a.password_hash))) {
      return error("Invalid credentials", 401);
    }
    return json({ token: sign({ sub: Number(a.id), role: "admin", label: a.email }), role: "admin", label: a.email });
  }

  if (role === "truck") {
    const username = String(body?.username ?? "").trim().toLowerCase();
    if (!username) return error("Username required", 400);
    const rows = await sql`
      SELECT id, username, name, password_hash, active FROM trucks
      WHERE LOWER(username) = ${username} LIMIT 1
    `;
    const t = rows[0] as { id: number; username: string; name: string; password_hash: string; active: boolean } | undefined;
    if (!t || !t.active || !(await comparePassword(password, t.password_hash))) {
      return error("Invalid credentials", 401);
    }
    return json({ token: sign({ sub: Number(t.id), role: "truck", label: t.name }), role: "truck", label: t.name, truckId: Number(t.id) });
  }

  return error("Unknown role", 400);
};
