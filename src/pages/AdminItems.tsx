import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { api } from "../api";
import { formatMoney, parseMoneyToCents } from "../money";
import { colorForCategory, categoryLabel } from "../categories";

interface Item {
  id: number;
  name: string;
  price_cents: number;
  unit: string | null;
  category: string | null;
  active: boolean;
  truck_ids: number[];
}

interface Truck {
  id: number;
  name: string;
  username: string;
  active: boolean;
}

interface ParsedRow {
  name: string;
  price_cents: number;
  unit?: string | null;
  category?: string | null;
}

const PRICE_KEYS = ["price", "cost", "unit_price", "unit price", "price ($)"];
const NAME_KEYS = ["name", "item", "item name", "product", "description"];
const UNIT_KEYS = ["unit", "uom", "size"];
const CATEGORY_KEYS = ["category", "cat", "group", "section", "type"];

function pickKey(obj: Record<string, unknown>, candidates: string[]): string | null {
  const lower = Object.keys(obj).reduce<Record<string, string>>((acc, k) => {
    acc[k.trim().toLowerCase()] = k;
    return acc;
  }, {});
  for (const c of candidates) {
    if (lower[c.toLowerCase()]) return lower[c.toLowerCase()];
  }
  return null;
}

function parseSheet(buf: ArrayBuffer): { rows: ParsedRow[]; errors: string[] } {
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const errors: string[] = [];
  const rows: ParsedRow[] = [];

  if (json.length === 0) {
    errors.push("File is empty.");
    return { rows, errors };
  }

  const sample = json[0];
  const nameKey = pickKey(sample, NAME_KEYS);
  const priceKey = pickKey(sample, PRICE_KEYS);
  const unitKey = pickKey(sample, UNIT_KEYS);
  const categoryKey = pickKey(sample, CATEGORY_KEYS);

  if (!nameKey || !priceKey) {
    errors.push(
      `Could not find required columns. Need a 'name' column and a 'price' column. Found: ${Object.keys(sample).join(", ")}`
    );
    return { rows, errors };
  }

  for (const [idx, r] of json.entries()) {
    const name = String(r[nameKey] ?? "").trim();
    if (!name) continue;
    const rawPrice = r[priceKey];
    let cents: number | null = null;
    if (typeof rawPrice === "number") cents = Math.round(rawPrice * 100);
    else cents = parseMoneyToCents(String(rawPrice));
    if (cents == null || cents < 0) {
      errors.push(`Row ${idx + 2}: invalid price for "${name}"`);
      continue;
    }
    const unit = unitKey ? String(r[unitKey] ?? "").trim() || null : null;
    const category = categoryKey ? String(r[categoryKey] ?? "").trim() || null : null;
    rows.push({ name, price_cents: cents, unit, category });
  }
  return { rows, errors };
}

export default function AdminItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [replace, setReplace] = useState(false);
  const [selectedTrucks, setSelectedTrucks] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [editingAssignFor, setEditingAssignFor] = useState<Item | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Browsing the catalog: the table is useless at 250+ items without these.
  const [search, setSearch] = useState("");
  const [filterTruck, setFilterTruck] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive" | "unassigned">(
    "all"
  );

  const [showAdd, setShowAdd] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  async function load() {
    setLoading(true);
    const [i, t] = await Promise.all([
      api<{ items: Item[] }>("/items?all=1"),
      api<{ trucks: Truck[] }>("/trucks"),
    ]);
    setItems(i.items);
    setTrucks(t.trucks);
    setLoading(false);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  // What this file will actually do, worked out before anything is committed.
  // Matching mirrors the DB exactly: items are unique on LOWER(name), so a row
  // whose name already exists is an UPDATE, never a duplicate.
  const importDiff = useMemo(() => {
    if (!preview || preview.length === 0) return null;
    const byName = new Map(items.map((i) => [i.name.trim().toLowerCase(), i]));
    const created: ParsedRow[] = [];
    const updated: ParsedRow[] = [];
    const priceChanges: Array<{ item: Item; to: number }> = [];
    const dupesInFile: string[] = [];
    const seen = new Set<string>();

    for (const r of preview) {
      const key = r.name.trim().toLowerCase();
      if (seen.has(key)) dupesInFile.push(r.name);
      seen.add(key);

      const existing = byName.get(key);
      if (!existing) {
        created.push(r);
        continue;
      }
      updated.push(r);
      if (existing.price_cents !== r.price_cents) priceChanges.push({ item: existing, to: r.price_cents });
    }
    return { created, updated, priceChanges, dupesInFile };
  }, [preview, items]);

  // Prices are global, so repricing an item here also reprices it for any other
  // location that shares it. Those locations are NOT part of this import, which
  // is exactly why it needs saying out loud.
  const bystanderTrucks = useMemo(() => {
    if (!importDiff || importDiff.priceChanges.length === 0) return [];
    const ids = new Set<number>();
    for (const { item } of importDiff.priceChanges) {
      for (const raw of item.truck_ids) {
        const tid = Number(raw);
        if (!selectedTrucks.has(tid)) ids.add(tid);
      }
    }
    return Array.from(ids);
  }, [importDiff, selectedTrucks]);

  // How many assignments replace mode would delete, counted exactly.
  const replaceImpact = useMemo(() => {
    if (!replace || !preview || preview.length === 0) return 0;
    const importNames = new Set(preview.map((r) => r.name.trim().toLowerCase()));
    let count = 0;
    for (const it of items) {
      if (importNames.has(it.name.trim().toLowerCase())) continue;
      for (const raw of it.truck_ids) {
        if (selectedTrucks.has(Number(raw))) count++;
      }
    }
    return count;
  }, [replace, preview, items, selectedTrucks]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const i of items) if (i.category) s.add(i.category);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tid = filterTruck ? Number(filterTruck) : null;
    return items.filter((i) => {
      if (q && !i.name.toLowerCase().includes(q)) return false;
      if (tid !== null && !i.truck_ids.some((x) => Number(x) === tid)) return false;
      if (filterCategory && (i.category ?? "") !== filterCategory) return false;
      if (filterStatus === "active" && !i.active) return false;
      if (filterStatus === "inactive" && i.active) return false;
      if (filterStatus === "unassigned" && i.truck_ids.length > 0) return false;
      return true;
    });
  }, [items, search, filterTruck, filterCategory, filterStatus]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const { rows, errors } = parseSheet(buf);
    setPreview(rows);
    setParseErrors(errors);
    setMsg(null);
  }

  function toggleSelected(id: number) {
    setSelectedTrucks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllTrucks() {
    setSelectedTrucks(new Set(trucks.filter((t) => t.active).map((t) => t.id)));
  }
  function clearSelectedTrucks() {
    setSelectedTrucks(new Set());
  }

  // Replace mode deletes assignments. It never runs without an explicit
  // confirmation naming how many.
  function requestImport() {
    if (!preview || preview.length === 0) return;
    if (selectedTrucks.size === 0) {
      setMsg("Pick at least one location to apply this import to.");
      return;
    }
    if (replace && replaceImpact > 0) {
      setConfirmReplace(true);
      return;
    }
    doImport();
  }

  async function addItem(row: ParsedRow, truckIds: number[]) {
    await api("/items", {
      method: "POST",
      json: { items: [row], truck_ids: truckIds, replace: false },
    });
    setShowAdd(false);
    setMsg(`Saved “${row.name}”.`);
    await load();
  }

  async function doImport() {
    if (!preview || preview.length === 0) return;
    if (selectedTrucks.size === 0) {
      setMsg("Pick at least one location to apply this import to.");
      return;
    }
    setConfirmReplace(false);
    setImporting(true);
    setMsg(null);
    try {
      const truckIds = Array.from(selectedTrucks);
      const r = await api<{ inserted: number; updated: number; total: number; assignments_added: number }>(
        "/items",
        { method: "POST", json: { items: preview, replace, truck_ids: truckIds } }
      );
      const truckNames = truckIds
        .map((id) => trucks.find((t) => t.id === id)?.name || `#${id}`)
        .join(", ");
      setMsg(
        `Imported ${r.total} item${r.total === 1 ? "" : "s"} (${r.inserted} new, ${r.updated} updated) → assigned to ${truckNames}.`
      );
      setPreview(null);
      setParseErrors([]);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e: any) {
      setMsg(e?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function toggleActive(item: Item) {
    await api("/items", { method: "PATCH", json: { id: item.id, active: !item.active } });
    await load();
  }

  async function editCategory(item: Item) {
    const next = prompt(`Category for "${item.name}"? (blank to clear)`, item.category || "");
    if (next === null) return;
    await api("/items", {
      method: "PATCH",
      json: { id: item.id, category: next.trim() || null },
    });
    await load();
  }

  async function saveAssignments(item: Item, newIds: number[]) {
    await api("/items", { method: "PATCH", json: { id: item.id, truck_ids: newIds } });
    setEditingAssignFor(null);
    await load();
  }

  async function patchItem(item: Item, patch: Record<string, unknown>) {
    await api("/items", { method: "PATCH", json: { id: item.id, ...patch } });
    await load();
  }

  function truckNameFor(id: number) {
    return trucks.find((t) => t.id === id)?.name || `#${id}`;
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Items & prices</h1>
          <p className="text-sm text-slate-600 mt-1">
            One item can be shared by many locations. Prices are the same everywhere.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="shrink-0 rounded-xl bg-stone-900 text-amber-50 px-4 py-2 text-sm font-medium hover:bg-stone-800 shadow-sm"
        >
          + Add item
        </button>
      </div>

      <div className="mt-4 bg-white rounded-2xl border border-stone-200 shadow-sm p-4">
        <div className="text-sm font-medium text-stone-800">Bulk upload</div>
        <p className="text-xs text-slate-600 mt-0.5 mb-3">
          A .csv or .xlsx with <code className="bg-stone-100 px-1 py-0.5 rounded">name</code> and{" "}
          <code className="bg-stone-100 px-1 py-0.5 rounded">price</code> columns, optionally{" "}
          <code className="bg-stone-100 px-1 py-0.5 rounded">unit</code> and{" "}
          <code className="bg-stone-100 px-1 py-0.5 rounded">category</code>. Re-uploading is safe —
          items are matched by name and updated in place, so you can't create duplicates.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={onFile}
            className="text-sm"
          />
        </div>

        {/* Truck multi-select */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-stone-800">
              Apply to location{selectedTrucks.size === 1 ? "" : "s"}
              {selectedTrucks.size > 0 && (
                <span className="text-stone-500 font-normal"> · {selectedTrucks.size} selected</span>
              )}
            </div>
            <div className="flex gap-2 text-xs">
              <button
                onClick={selectAllTrucks}
                className="rounded-lg bg-stone-100 border border-stone-300 px-2.5 py-1 text-stone-700 hover:bg-stone-200"
              >
                Select all
              </button>
              <button
                onClick={clearSelectedTrucks}
                className="rounded-lg bg-stone-100 border border-stone-300 px-2.5 py-1 text-stone-700 hover:bg-stone-200"
              >
                Clear
              </button>
            </div>
          </div>
          {trucks.length === 0 ? (
            <div className="text-sm text-stone-500">
              No locations yet — create one in the Locations tab first.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {trucks.map((t) => {
                const selected = selectedTrucks.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleSelected(t.id)}
                    className={`text-sm rounded-full px-3 py-1.5 border transition ${
                      selected
                        ? "bg-amber-700 text-amber-50 border-amber-700 shadow-sm"
                        : "bg-white text-stone-700 border-stone-300 hover:border-amber-500"
                    } ${t.active ? "" : "opacity-50"}`}
                  >
                    {selected && <span className="mr-1">✓</span>}
                    {t.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {parseErrors.length > 0 && (
          <ul className="mt-3 text-sm text-rose-700 list-disc pl-5">
            {parseErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}

        {preview && preview.length > 0 && (
          <div className="mt-3">
            {importDiff && (
              <div className="mb-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
                <div className="text-sm font-medium text-stone-800">
                  What this file will do
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  <span className="rounded-full bg-green-100 text-green-800 px-2.5 py-0.5 font-medium">
                    {importDiff.created.length} new
                  </span>
                  <span className="rounded-full bg-blue-100 text-blue-800 px-2.5 py-0.5 font-medium">
                    {importDiff.updated.length} already exist → will update
                  </span>
                  {importDiff.priceChanges.length > 0 && (
                    <span className="rounded-full bg-amber-100 text-amber-900 px-2.5 py-0.5 font-medium">
                      {importDiff.priceChanges.length} price change
                      {importDiff.priceChanges.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

                {importDiff.dupesInFile.length > 0 && (
                  <p className="mt-2 text-xs text-amber-800">
                    Your file lists {importDiff.dupesInFile.length} name
                    {importDiff.dupesInFile.length === 1 ? "" : "s"} more than once (
                    {importDiff.dupesInFile.slice(0, 3).join(", ")}
                    {importDiff.dupesInFile.length > 3 ? "…" : ""}). The last row wins.
                  </p>
                )}

                {importDiff.priceChanges.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-stone-700 mb-1">Price changes</div>
                    <div className="max-h-32 overflow-auto rounded-lg border border-stone-200 bg-white divide-y divide-stone-100">
                      {importDiff.priceChanges.map(({ item, to }) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between px-3 py-1.5 text-sm"
                        >
                          <span className="text-stone-800">{item.name}</span>
                          <span className="tabular-nums">
                            <span className="text-stone-500 line-through">
                              {formatMoney(item.price_cents)}
                            </span>
                            <span className="mx-1.5 text-stone-400">→</span>
                            <span className="font-semibold text-amber-800">{formatMoney(to)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {bystanderTrucks.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                    <p className="text-xs text-amber-900">
                      <strong>Heads up:</strong> prices are shared across locations, so these price
                      changes also apply to {bystanderTrucks.map(truckNameFor).join(", ")} — which
                      {bystanderTrucks.length === 1 ? " isn't" : " aren't"} part of this import.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="text-sm text-slate-700 mb-2">
              All {preview.length} row{preview.length === 1 ? "" : "s"}
              {preview.length > 100 ? " (showing first 100)" : ""}:
            </div>
            <div className="max-h-60 overflow-auto border border-stone-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 sticky top-0">
                  <tr className="text-left text-slate-600">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2 text-right">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {preview.slice(0, 100).map((r, i) => {
                    const c = colorForCategory(r.category);
                    return (
                      <tr key={i}>
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2">
                          {r.category ? (
                            <span className={`inline-flex items-center gap-1.5 ${c.headerBg} ${c.headerText} text-xs font-medium px-2 py-0.5 rounded-full`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                              {r.category}
                            </span>
                          ) : (
                            <span className="text-stone-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{r.unit || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.price_cents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <label className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium text-rose-900">
                  Make this file the complete list for the selected location
                  {selectedTrucks.size === 1 ? "" : "s"}
                </span>
                <span className="block text-xs text-rose-800 mt-0.5">
                  Anything not in this file gets removed from{" "}
                  {selectedTrucks.size === 0
                    ? "them"
                    : Array.from(selectedTrucks).map(truckNameFor).join(", ")}
                  .{" "}
                  {replace && replaceImpact > 0 && (
                    <strong>That's {replaceImpact} item assignments right now.</strong>
                  )}
                  {replace && replaceImpact === 0 && <>Nothing would be removed.</>}
                </span>
              </span>
            </label>

            <button
              onClick={requestImport}
              disabled={importing || selectedTrucks.size === 0}
              className="mt-3 rounded-xl bg-amber-700 text-amber-50 px-4 py-2 text-sm font-medium hover:bg-amber-800 shadow-sm disabled:opacity-50"
            >
              {importing
                ? "Importing…"
                : selectedTrucks.size === 0
                ? "Pick at least one location to import"
                : `Import ${preview.length} item${preview.length === 1 ? "" : "s"} → ${
                    selectedTrucks.size
                  } location${selectedTrucks.size === 1 ? "" : "s"}`}
            </button>
          </div>
        )}

        {msg && <div className="mt-3 text-sm text-slate-700">{msg}</div>}
      </div>

      <div className="mt-8 flex items-baseline justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold text-stone-900">
          {filterTruck
            ? `${truckNameFor(Number(filterTruck))} — ${filteredItems.length} item${
                filteredItems.length === 1 ? "" : "s"
              }`
            : "Current items"}
        </h2>
        {!loading && items.length > 0 && (
          <div className="text-sm text-slate-500">
            Showing {filteredItems.length} of {items.length}
          </div>
        )}
      </div>

      {!loading && items.length > 0 && (
        <div className="mt-3 bg-white rounded-2xl border border-stone-200 shadow-sm p-3 flex flex-wrap gap-2 items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="flex-1 min-w-[180px] rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
          />
          <select
            value={filterTruck}
            onChange={(e) => setFilterTruck(e.target.value)}
            className="rounded-xl border border-stone-300 px-3 py-2 text-sm bg-white outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
          >
            <option value="">All locations</option>
            {trucks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-xl border border-stone-300 px-3 py-2 text-sm bg-white outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="rounded-xl border border-stone-300 px-3 py-2 text-sm bg-white outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
          >
            <option value="all">Any status</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
            <option value="unassigned">Unassigned only</option>
          </select>
          {(search || filterTruck || filterCategory || filterStatus !== "all") && (
            <button
              onClick={() => {
                setSearch("");
                setFilterTruck("");
                setFilterCategory("");
                setFilterStatus("all");
              }}
              className="rounded-xl bg-stone-100 border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-200"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-slate-500 mt-3">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-slate-500 mt-3">No items yet. Add one above or upload a file.</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-slate-600 mt-3 bg-white border border-stone-200 rounded-2xl shadow-sm p-6 text-center">
          No items match these filters.
        </div>
      ) : (
        <div className="mt-3 bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Unit</th>
                <th className="px-4 py-3 font-medium text-right">Price</th>
                <th className="px-4 py-3 font-medium">Locations</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredItems.map((it) => {
                const c = colorForCategory(it.category);
                return (
                  <tr key={it.id} className={it.active ? "" : "opacity-50"}>
                    <td className="px-4 py-3 text-stone-900 font-medium">
                      <EditableText
                        value={it.name}
                        onSave={(v) => patchItem(it, { name: v })}
                        validate={(v) => (v.trim() ? null : "Name cannot be empty")}
                        ariaLabel={`Edit name for ${it.name}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => editCategory(it)}
                        className={`inline-flex items-center gap-1.5 ${c.headerBg} ${c.headerText} text-xs font-medium px-2 py-0.5 rounded-full hover:opacity-80`}
                        title="Click to change"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                        {categoryLabel(it.category)}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      <EditableText
                        value={it.unit || ""}
                        onSave={(v) => patchItem(it, { unit: v.trim() || null })}
                        placeholder="—"
                        ariaLabel={`Edit unit for ${it.name}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <EditableMoney
                        cents={it.price_cents}
                        onSave={(c) => patchItem(it, { price_cents: c })}
                        ariaLabel={`Edit price for ${it.name}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditingAssignFor(it)}
                        className="text-xs rounded-lg bg-stone-100 border border-stone-300 text-stone-700 px-2.5 py-1 hover:bg-stone-200"
                      >
                        {it.truck_ids.length === 0 ? (
                          <span className="text-rose-700">Unassigned</span>
                        ) : it.truck_ids.length <= 3 ? (
                          it.truck_ids.map(truckNameFor).join(", ")
                        ) : (
                          `${it.truck_ids.length} trucks`
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{it.active ? "Active" : "Inactive"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleActive(it)}
                        className="text-xs rounded-lg bg-stone-100 text-slate-700 px-3 py-1.5 hover:bg-stone-200"
                      >
                        {it.active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingAssignFor && (
        <AssignmentModal
          item={editingAssignFor}
          trucks={trucks}
          onCancel={() => setEditingAssignFor(null)}
          onSave={(ids) => saveAssignments(editingAssignFor, ids)}
        />
      )}

      {showAdd && (
        <AddItemModal
          trucks={trucks}
          items={items}
          onCancel={() => setShowAdd(false)}
          onSave={addItem}
        />
      )}

      {confirmReplace && (
        <ConfirmReplaceModal
          count={replaceImpact}
          truckNames={Array.from(selectedTrucks).map(truckNameFor)}
          onCancel={() => setConfirmReplace(false)}
          onConfirm={doImport}
        />
      )}
    </div>
  );
}

function ConfirmReplaceModal({
  count,
  truckNames,
  onCancel,
  onConfirm,
}: {
  count: number;
  truckNames: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-30 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="text-sm text-rose-700 font-medium">Confirm removal</div>
        <h2 className="text-xl font-semibold text-stone-900 mt-1">
          This removes {count} item assignment{count === 1 ? "" : "s"}
        </h2>
        <p className="text-sm text-slate-600 mt-2">
          You've marked this file as the complete list for{" "}
          <strong className="text-stone-900">{truckNames.join(", ")}</strong>. Any item those
          locations currently have that isn't in your file will stop showing in their app.
        </p>
        <p className="text-xs text-slate-500 mt-2">
          The items themselves stay in your catalog — only the assignment is removed, so you can
          re-add them later.
        </p>
        <div className="mt-5 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-rose-700 text-white px-4 py-2 text-sm font-medium hover:bg-rose-800 shadow-sm"
          >
            Yes, remove {count}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddItemModal({
  trucks,
  items,
  onCancel,
  onSave,
}: {
  trucks: Truck[];
  items: Item[];
  onCancel: () => void;
  onSave: (row: ParsedRow, truckIds: number[]) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const i of items) if (i.category) s.add(i.category);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Saving a name that already exists updates that item rather than creating a
  // second one — say so before they hit save, not after.
  const existing = useMemo(() => {
    const key = name.trim().toLowerCase();
    if (!key) return null;
    return items.find((i) => i.name.trim().toLowerCase() === key) ?? null;
  }, [name, items]);

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    const n = name.trim();
    if (!n) return setErr("Name is required.");
    const cents = parseMoneyToCents(price);
    if (cents == null || cents < 0) return setErr("Enter a valid price, e.g. 4.29");
    if (picked.size === 0) return setErr("Pick at least one location.");

    setErr(null);
    setBusy(true);
    try {
      await onSave(
        { name: n, price_cents: cents, unit: unit.trim() || null, category: category.trim() || null },
        Array.from(picked)
      );
    } catch (e: any) {
      setErr(e?.message || "Couldn't save that item");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-30 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="text-sm text-stone-500">New item</div>
        <h2 className="text-xl font-semibold text-stone-900 mt-1">Add a single item</h2>

        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className="text-sm font-medium text-stone-800">Name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Oat Milk"
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
            />
          </label>

          {existing && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
              <p className="text-xs text-blue-900">
                <strong>{existing.name}</strong> already exists at{" "}
                {formatMoney(existing.price_cents)}. Saving will update it and add your selected
                locations — it won't create a duplicate.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-stone-800">Price</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="4.29"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200 tabular-nums"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-stone-800">
                Unit <span className="text-stone-400 font-normal">(optional)</span>
              </span>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="gallon"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-stone-800">
              Category <span className="text-stone-400 font-normal">(optional)</span>
            </span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="category-options"
              placeholder="Dairy"
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
            />
            <datalist id="category-options">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <span className="text-xs text-stone-500 mt-1 block">
              Groups the item in the truck app. Pick an existing one or type a new one.
            </span>
          </label>

          <div>
            <span className="text-sm font-medium text-stone-800">Locations</span>
            {trucks.length === 0 ? (
              <div className="mt-1 text-sm text-stone-500">
                No locations yet — create one in the Locations tab first.
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {trucks.map((t) => {
                  const selected = picked.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggle(t.id)}
                      className={`text-sm rounded-full px-3 py-1.5 border transition ${
                        selected
                          ? "bg-amber-700 text-amber-50 border-amber-700 shadow-sm"
                          : "bg-white text-stone-700 border-stone-300 hover:border-amber-500"
                      } ${t.active ? "" : "opacity-50"}`}
                    >
                      {selected && <span className="mr-1">✓</span>}
                      {t.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {err && <div className="text-sm text-rose-700">{err}</div>}
        </div>

        <div className="mt-5 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-xl bg-stone-900 text-amber-50 px-4 py-2 text-sm font-medium hover:bg-stone-800 shadow-sm disabled:opacity-50"
          >
            {busy ? "Saving…" : existing ? "Update item" : "Add item"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditableText({
  value,
  onSave,
  validate,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onSave: (v: string) => Promise<void> | void;
  validate?: (v: string) => string | null;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  async function commit() {
    if (draft === value) {
      setEditing(false);
      setErr(null);
      return;
    }
    const v = validate ? validate(draft) : null;
    if (v) {
      setErr(v);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setDraft(value);
    setErr(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={ariaLabel}
        className="text-left w-full rounded px-1 -mx-1 py-0.5 hover:bg-amber-50 focus:bg-amber-50 outline-none focus:ring-2 focus:ring-amber-200"
      >
        {value || <span className="text-stone-400">{placeholder || "—"}</span>}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        autoFocus
        value={draft}
        disabled={busy}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className="w-full rounded border border-amber-400 px-2 py-1 outline-none focus:ring-2 focus:ring-amber-200 disabled:opacity-60"
      />
      {err && <div className="text-xs text-rose-600">{err}</div>}
    </div>
  );
}

function EditableMoney({
  cents,
  onSave,
  ariaLabel,
}: {
  cents: number;
  onSave: (c: number) => Promise<void> | void;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => (cents / 100).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft((cents / 100).toFixed(2));
  }, [cents, editing]);

  async function commit() {
    const parsed = parseMoneyToCents(draft);
    if (parsed == null || parsed < 0) {
      setErr("Invalid price");
      return;
    }
    if (parsed === cents) {
      setEditing(false);
      setErr(null);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onSave(parsed);
      setEditing(false);
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setDraft((cents / 100).toFixed(2));
    setErr(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={ariaLabel}
        className="rounded px-1 -mx-1 py-0.5 hover:bg-amber-50 focus:bg-amber-50 outline-none focus:ring-2 focus:ring-amber-200 tabular-nums"
      >
        {formatMoney(cents)}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <span className="text-stone-500">$</span>
        <input
          autoFocus
          inputMode="decimal"
          value={draft}
          disabled={busy}
          aria-label={ariaLabel}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className="w-24 text-right rounded border border-amber-400 px-2 py-1 outline-none focus:ring-2 focus:ring-amber-200 tabular-nums disabled:opacity-60"
        />
      </div>
      {err && <div className="text-xs text-rose-600">{err}</div>}
    </div>
  );
}

function AssignmentModal({
  item,
  trucks,
  onCancel,
  onSave,
}: {
  item: Item;
  trucks: Truck[];
  onCancel: () => void;
  onSave: (ids: number[]) => void | Promise<void>;
}) {
  const [picked, setPicked] = useState<Set<number>>(new Set(item.truck_ids));
  const [busy, setBusy] = useState(false);

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    try {
      await onSave(Array.from(picked));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-30 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="text-sm text-stone-500">Assign locations</div>
        <h2 className="text-xl font-semibold text-stone-900 mt-1">{item.name}</h2>
        <p className="text-xs text-stone-500 mt-1">
          Locations selected here can see and order this item.
        </p>

        {trucks.length === 0 ? (
          <div className="mt-4 text-sm text-stone-500">No locations exist yet.</div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2 max-h-72 overflow-y-auto">
            {trucks.map((t) => {
              const selected = picked.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  className={`text-sm rounded-full px-3 py-1.5 border transition ${
                    selected
                      ? "bg-amber-700 text-amber-50 border-amber-700"
                      : "bg-white text-stone-700 border-stone-300 hover:border-amber-500"
                  } ${t.active ? "" : "opacity-50"}`}
                >
                  {selected && <span className="mr-1">✓</span>}
                  {t.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl bg-stone-100 text-stone-700 font-medium py-2.5 hover:bg-stone-200 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 rounded-xl bg-amber-700 text-amber-50 font-semibold py-2.5 hover:bg-amber-800 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
