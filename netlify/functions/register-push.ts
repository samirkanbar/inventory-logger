import { sql } from "./_lib/db";
import { requireAuth } from "./_lib/auth";
import { error, json, preflight } from "./_lib/http";

// A phone registers its Expo push token against the logged-in user. Trucks and
// admins both call this; only admins' tokens are used when sending request
// notifications, but we store role so that can change later.
export default async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  if (req.method !== "POST") return error("POST required", 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }

  const token = String(body?.expo_token ?? "").trim();
  if (!token) return error("expo_token required", 400);
  // Expo tokens are ExponentPushToken[...] (or the newer ExpoPushToken[...]).
  if (!/^Expo(nent)?PushToken\[.+\]$/.test(token)) {
    return error("Invalid Expo push token", 400);
  }

  // A device token is globally unique but can move between users — e.g. someone
  // logs out and a different person logs in on the same phone. Upsert re-points
  // the token at whoever is currently logged in.
  await sql`
    INSERT INTO push_tokens (role, user_id, expo_token)
    VALUES (${auth.user.role}, ${Number(auth.user.sub)}, ${token})
    ON CONFLICT (expo_token) DO UPDATE
      SET role = EXCLUDED.role, user_id = EXCLUDED.user_id, updated_at = NOW()
  `;

  return json({ ok: true });
};
