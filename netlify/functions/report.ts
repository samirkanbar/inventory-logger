import * as XLSX from "xlsx";
import { sql } from "./_lib/db";
import { requireAuth } from "./_lib/auth";
import { binary, error, preflight } from "./_lib/http";

interface Row {
  submission_id: number;
  title: string;
  submitted_at: string;
  day: string;
  truck_id: number;
  truck_name: string;
  item_name: string;
  quantity: number;
  unit_price_cents: number;
}

const MONEY = "$#,##0.00";

// Excel sheet names: max 31 chars, and []:*?/\ are illegal.
function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function money(ws: XLSX.WorkSheet, addr: string) {
  const cell = ws[addr];
  if (cell && typeof cell.v === "number") {
    cell.t = "n";
    cell.z = MONEY;
  }
}

export default async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "GET") return error("Method not allowed", 405);

  const auth = requireAuth(req, "admin");
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const from = (url.searchParams.get("from") || "").trim();
  const to = (url.searchParams.get("to") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return error("from and to are required as YYYY-MM-DD", 400);
  }
  if (from > to) return error("'from' must be on or before 'to'", 400);

  // Empty/absent truck_ids means every location.
  const truckParam = (url.searchParams.get("truck_ids") || "").trim();
  const truckIds = truckParam
    ? truckParam
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];

  const rows = (
    truckIds.length > 0
      ? await sql`
          SELECT s.id AS submission_id, s.title, s.submitted_at,
                 TO_CHAR(s.submitted_at::date, 'YYYY-MM-DD') AS day,
                 s.truck_id, t.name AS truck_name,
                 si.item_name_snapshot AS item_name, si.quantity, si.unit_price_cents
          FROM submissions s
          JOIN trucks t ON t.id = s.truck_id
          JOIN submission_items si ON si.submission_id = s.id
          WHERE s.submitted_at::date >= ${from}::date
            AND s.submitted_at::date <= ${to}::date
            AND s.truck_id = ANY(${truckIds}::bigint[])
          ORDER BY LOWER(t.name) ASC, s.submitted_at ASC, LOWER(si.item_name_snapshot) ASC
        `
      : await sql`
          SELECT s.id AS submission_id, s.title, s.submitted_at,
                 TO_CHAR(s.submitted_at::date, 'YYYY-MM-DD') AS day,
                 s.truck_id, t.name AS truck_name,
                 si.item_name_snapshot AS item_name, si.quantity, si.unit_price_cents
          FROM submissions s
          JOIN trucks t ON t.id = s.truck_id
          JOIN submission_items si ON si.submission_id = s.id
          WHERE s.submitted_at::date >= ${from}::date
            AND s.submitted_at::date <= ${to}::date
          ORDER BY LOWER(t.name) ASC, s.submitted_at ASC, LOWER(si.item_name_snapshot) ASC
        `
  ) as Row[];

  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  // ---- Group: location -> day -> lines -------------------------------------
  const byTruck = new Map<
    number,
    { name: string; days: Map<string, Row[]>; totalCents: number; qty: number; orders: Set<number> }
  >();
  const byDay = new Map<string, { totalCents: number; qty: number; orders: Set<number> }>();
  let grandCents = 0;
  let grandQty = 0;
  const allOrders = new Set<number>();

  for (const r of rows) {
    const lineCents = Number(r.quantity) * Number(r.unit_price_cents);
    const tid = Number(r.truck_id);

    let t = byTruck.get(tid);
    if (!t) {
      t = { name: r.truck_name, days: new Map(), totalCents: 0, qty: 0, orders: new Set() };
      byTruck.set(tid, t);
    }
    if (!t.days.has(r.day)) t.days.set(r.day, []);
    t.days.get(r.day)!.push(r);
    t.totalCents += lineCents;
    t.qty += Number(r.quantity);
    t.orders.add(Number(r.submission_id));

    const d = byDay.get(r.day) ?? { totalCents: 0, qty: 0, orders: new Set<number>() };
    d.totalCents += lineCents;
    d.qty += Number(r.quantity);
    d.orders.add(Number(r.submission_id));
    byDay.set(r.day, d);

    grandCents += lineCents;
    grandQty += Number(r.quantity);
    allOrders.add(Number(r.submission_id));
  }

  // ---- Sheet 1: Summary ----------------------------------------------------
  const summary: (string | number)[][] = [
    ["Inventory Report"],
    [],
    ["Date range", `${from} to ${to}`],
    ["Locations", truckIds.length > 0 ? `${byTruck.size} selected` : "All locations"],
    ["Generated", new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC"],
    [],
  ];

  if (rows.length === 0) {
    summary.push(["No submissions found in this date range."]);
    const ws = XLSX.utils.aoa_to_sheet(summary);
    ws["!cols"] = [{ wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName("Summary", usedNames));
  } else {
    summary.push(["BY LOCATION"], ["Location", "Orders", "Items", "Total cost"]);
    const truckStart = summary.length; // 0-based index of first data row
    for (const [, t] of Array.from(byTruck.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name)
    )) {
      summary.push([t.name, t.orders.size, t.qty, t.totalCents / 100]);
    }
    const truckEnd = summary.length - 1;

    summary.push([], ["BY DATE"], ["Date", "Orders", "Items", "Total cost"]);
    const dayStart = summary.length;
    for (const day of Array.from(byDay.keys()).sort()) {
      const d = byDay.get(day)!;
      summary.push([day, d.orders.size, d.qty, d.totalCents / 100]);
    }
    const dayEnd = summary.length - 1;

    summary.push([], ["GRAND TOTAL", allOrders.size, grandQty, grandCents / 100]);
    const grandRow = summary.length - 1;

    // This tab is totals only. Point at the tabs that carry the line items.
    summary.push(
      [],
      ["This tab shows totals only."],
      ["For every item on every order, see the 'All Orders' tab."],
      ["For one location at a time, see its own tab."]
    );

    const ws = XLSX.utils.aoa_to_sheet(summary);
    for (let r = truckStart; r <= truckEnd; r++) money(ws, `D${r + 1}`);
    for (let r = dayStart; r <= dayEnd; r++) money(ws, `D${r + 1}`);
    money(ws, `D${grandRow + 1}`);
    ws["!cols"] = [{ wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName("Summary", usedNames));
  }

  // ---- Sheet 2: every order, in date order, with its line items ------------
  // The summary only carries totals. This is the combined view: each order
  // spelled out the way a single submission export looks, one after another.
  if (rows.length > 0) {
    const orders = new Map<
      number,
      { day: string; truck: string; title: string; at: string; lines: Row[] }
    >();
    for (const r of rows) {
      const sid = Number(r.submission_id);
      if (!orders.has(sid)) {
        orders.set(sid, {
          day: r.day,
          truck: r.truck_name,
          title: r.title,
          at: r.submitted_at,
          lines: [],
        });
      }
      orders.get(sid)!.lines.push(r);
    }

    const ordered = Array.from(orders.entries()).sort((a, b) => {
      if (a[1].at !== b[1].at) return a[1].at < b[1].at ? -1 : 1;
      return a[0] - b[0];
    });

    const aoa: (string | number)[][] = [
      ["All Orders"],
      [`${from} to ${to}`, "", "", ""],
      [`${ordered.length} order${ordered.length === 1 ? "" : "s"}`, "", "", ""],
      [],
    ];
    const moneyRows: number[] = [];
    let lastDay = "";

    for (const [sid, o] of ordered) {
      // A date banner whenever the day changes, so orders stay visually
      // separated by date rather than running together.
      if (o.day !== lastDay) {
        if (lastDay !== "") aoa.push([]);
        aoa.push([`━━━  ${o.day}  ━━━`]);
        lastDay = o.day;
      }

      aoa.push([`${o.truck}  ·  ${o.title}  (order #${sid})`]);
      aoa.push(["Item", "Qty", "Unit price", "Line total"]);

      let orderCents = 0;
      for (const l of o.lines) {
        const lineCents = Number(l.quantity) * Number(l.unit_price_cents);
        orderCents += lineCents;
        aoa.push([
          l.item_name,
          Number(l.quantity),
          Number(l.unit_price_cents) / 100,
          lineCents / 100,
        ]);
        moneyRows.push(aoa.length - 1);
      }

      aoa.push(["", "", "Order total", orderCents / 100]);
      moneyRows.push(aoa.length - 1);
      aoa.push([]);
    }

    aoa.push(["", "", "REPORT TOTAL", grandCents / 100]);
    moneyRows.push(aoa.length - 1);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    for (const r of moneyRows) {
      money(ws, `C${r + 1}`);
      money(ws, `D${r + 1}`);
    }
    ws["!cols"] = [{ wch: 42 }, { wch: 8 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName("All Orders", usedNames));
  }

  // ---- One sheet per location, sectioned by date ---------------------------
  for (const [, t] of Array.from(byTruck.entries()).sort((a, b) =>
    a[1].name.localeCompare(b[1].name)
  )) {
    const aoa: (string | number)[][] = [[t.name], [`${from} to ${to}`], []];
    const moneyRows: number[] = [];

    for (const day of Array.from(t.days.keys()).sort()) {
      const dayRows = t.days.get(day)!;

      // Group this day's lines by the order they came from, so a location that
      // submitted twice in a day doesn't get its two orders merged together.
      const orders = new Map<number, Row[]>();
      for (const r of dayRows) {
        if (!orders.has(Number(r.submission_id))) orders.set(Number(r.submission_id), []);
        orders.get(Number(r.submission_id))!.push(r);
      }

      aoa.push([day]);
      let dayCents = 0;

      for (const [sid, lines] of orders) {
        const title = lines[0].title;
        const time = new Date(lines[0].submitted_at).toISOString().slice(11, 16);
        aoa.push([`${title}  (#${sid}, ${time} UTC)`]);
        aoa.push(["Item", "Qty", "Unit price", "Line total"]);
        for (const l of lines) {
          const lineCents = Number(l.quantity) * Number(l.unit_price_cents);
          dayCents += lineCents;
          aoa.push([
            l.item_name,
            Number(l.quantity),
            Number(l.unit_price_cents) / 100,
            lineCents / 100,
          ]);
          moneyRows.push(aoa.length - 1);
        }
        aoa.push([]);
      }

      aoa.push(["", "", `${day} total`, dayCents / 100]);
      moneyRows.push(aoa.length - 1);
      aoa.push([]);
    }

    aoa.push(["", "", "LOCATION TOTAL", t.totalCents / 100]);
    moneyRows.push(aoa.length - 1);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    for (const r of moneyRows) {
      money(ws, `C${r + 1}`);
      money(ws, `D${r + 1}`);
    }
    ws["!cols"] = [{ wch: 38 }, { wch: 8 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(t.name, usedNames));
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const filename = `report_${from}_to_${to}.xlsx`;

  return binary(
    buf,
    filename,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
};
