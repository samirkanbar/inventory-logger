import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { error } from "./http";

const SECRET = process.env.JWT_SECRET || "";

export type Role = "admin" | "truck";

export interface TokenPayload {
  sub: number;            // user id (admin or truck row id)
  role: Role;
  // for trucks: username/name. for admins: email.
  label: string;
}

export function sign(payload: TokenPayload): string {
  if (!SECRET) throw new Error("JWT_SECRET is not set");
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): TokenPayload | null {
  if (!SECRET) return null;
  try {
    const decoded = jwt.verify(token, SECRET);
    if (typeof decoded === "string") return null;
    return decoded as unknown as TokenPayload;
  } catch {
    return null;
  }
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

export function requireAuth(req: Request, role?: Role): { user: TokenPayload } | Response {
  const token = bearer(req);
  if (!token) return error("Missing token", 401);
  const user = verifyToken(token);
  if (!user) return error("Invalid token", 401);
  if (role && user.role !== role) return error("Forbidden", 403);
  return { user };
}
