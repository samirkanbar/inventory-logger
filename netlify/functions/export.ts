import * as XLSX from "xlsx";
import { sql } from "./_lib/db";
import { requireAuth } from "./_lib/auth";
import { binary, error, preflight } from "./_lib/http";

export default async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "GET") return error("Method not allowed", 405);

  const auth = requireAuth(req, "admin");
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id)) return error("id required", 400);

  const subRows = await sql`
    SELECT s.id, s.title, s.submitted_at, t.name AS truck_name, t.username AS truck_username
    FROM submissions s JOIN trucks t ON t.id = s.truck_id
    WHERE s.id = ${id} LIMIT 1
  `;
  const sub = subRows[0] as
    | { id: number; title: string; submitted_at: string; truck_name: string; truck_username: string }
    | undefined;
  if (!sub) return error("Not found", 404);

  const lines = (await sql`
    SELECT item_name_snapshot AS name, quantity, unit_price_cents
    FROM submission_items WHERE submission_id = ${id}
    ORDER BY LOWER(item_name_snapshot) ASC
  `) as Array<{ name: string; quantity: number; unit_price_cents: number }>;

  // Build a single sheet with a header block followed by line items + totals.
  const submittedDate = new Date(sub.submitted_at);
  const fmt = submittedDate.toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const aoa: (string | number)[][] = [
    ["Inventory Submission"],
    [],
    ["Title", sub.title],
    ["Truck", sub.truck_name],
    ["Truck username", sub.truck_username],
    ["Submission ID", sub.id],
    ["Submitted at", fmt],
    [],
    ["Item", "Quantity", "Unit price", "Line total"],
  ];

  let totalCents = 0;
  for (const ln of lines) {
    const qty = Number(ln.quantity);
    const unit = Number(ln.unit_price_cents) / 100;
    const lineTotal = (qty * Number(ln.unit_price_cents)) / 100;
    totalCents += qty * Number(ln.unit_price_cents);
    aoa.push([ln.name, qty, unit, lineTotal]);
  }
  aoa.push([], ["", "", "TOTAL", totalCents / 100]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Format currency cells. Column C = unit price, D = line total. Starting at the header row (index 8, 0-based) the line items begin at row 9.
  const startRow = 9; // 0-based row 9 = "Item" header is row 8, data starts row 9 — actually row index 9 is the first data row when title appears at row 0
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let r = startRow; r <= range.e.r; r++) {
    for (const col of ["C", "D"]) {
      const addr = `${col}${r + 1}`;
      const cell = ws[addr];
      if (cell && typeof cell.v === "number") {
        cell.t = "n";
        cell.z = "$#,##0.00";
      }
    }
  }

  ws["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Submission");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  // Filename: 2026-05-18_truck-42_42.xlsx
  const datePart = submittedDate.toISOString().slice(0, 10);
  const safeTruck = sub.truck_username.replace(/[^a-z0-9._-]/gi, "_");
  const filename = `${datePart}_${safeTruck}_${sub.id}.xlsx`;

  return binary(
    buf,
    filename,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
};
