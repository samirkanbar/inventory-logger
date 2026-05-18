import { requireAuth } from "./_lib/auth";
import { json, preflight } from "./_lib/http";

export default async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;
  return json({ id: auth.user.sub, role: auth.user.role, label: auth.user.label });
};
