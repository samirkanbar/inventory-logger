import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const url =
  process.env.NETLIFY_DB_URL ||
  process.env.NETLIFY_DATABASE_URL ||
  process.env.DATABASE_URL;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!url || !email || !password) {
  console.error("Set NETLIFY_DATABASE_URL (or DATABASE_URL), ADMIN_EMAIL, ADMIN_PASSWORD in .env first.");
  process.exit(1);
}

const sql = neon(url);
const hash = await bcrypt.hash(password, 12);

const rows = await sql`
  INSERT INTO admins (email, password_hash)
  VALUES (${email.toLowerCase()}, ${hash})
  ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
  RETURNING id, email
`;
console.log("Admin ready:", rows[0]);
