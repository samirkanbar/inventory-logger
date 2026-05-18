import { useEffect, useRef, useState } from "react";
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

  async function doImport() {
    if (!preview || preview.length === 0) return;
    if (selectedTrucks.size === 0) {
      setMsg("Pick at least one truck to apply this import to.");
      return;
    }
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

  function truckNameFor(id: number) {
    return trucks.find((t) => t.id === id)?.name || `#${id}`;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-stone-900">Items & prices</h1>
      <p className="text-sm text-slate-600 mt-1">
        Upload a .csv or .xlsx with columns <code className="bg-stone-100 px-1.5 py-0.5 rounded">name</code>,{" "}
        <code className="bg-stone-100 px-1.5 py-0.5 rounded">price</code>, and optionally{" "}
        <code className="bg-stone-100 px-1.5 py-0.5 rounded">unit</code> and{" "}
        <code className="bg-stone-100 px-1.5 py-0.5 rounded">category</code>. Pick which trucks the items go to.
      </p>

      <div className="mt-4 bg-white rounded-2xl border border-stone-200 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={onFile}
            className="text-sm"
          />
          <label className="text-sm text-slate-700 flex items-center gap-2">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />
            Replace mode (un-assign other items from selected trucks)
          </label>
        </div>

        {/* Truck multi-select */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-stone-800">
              Apply to truck{selectedTrucks.size === 1 ? "" : "s"}
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
            <div className="text-sm text-stone-500">No trucks yet — create one in the Trucks tab first.</div>
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
            <div className="text-sm text-slate-700 mb-2">
              Preview ({preview.length} row{preview.length === 1 ? "" : "s"}):
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
            <button
              onClick={doImport}
              disabled={importing || selectedTrucks.size === 0}
              className="mt-3 rounded-xl bg-amber-700 text-amber-50 px-4 py-2 text-sm font-medium hover:bg-amber-800 shadow-sm disabled:opacity-50"
            >
              {importing
                ? "Importing…"
                : selectedTrucks.size === 0
                ? "Pick at least one truck to import"
                : `Import ${preview.length} item${preview.length === 1 ? "" : "s"} → ${selectedTrucks.size} truck${selectedTrucks.size === 1 ? "" : "s"}`}
            </button>
          </div>
        )}

        {msg && <div className="mt-3 text-sm text-slate-700">{msg}</div>}
      </div>

      <h2 className="mt-8 text-lg font-semibold text-stone-900">Current items</h2>
      {loading ? (
        <div className="text-slate-500 mt-3">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-slate-500 mt-3">No items yet. Upload a file above.</div>
      ) : (
        <div className="mt-3 bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Unit</th>
                <th className="px-4 py-3 font-medium text-right">Price</th>
                <th className="px-4 py-3 font-medium">Trucks</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {items.map((it) => {
                const c = colorForCategory(it.category);
                return (
                  <tr key={it.id} className={it.active ? "" : "opacity-50"}>
                    <td className="px-4 py-3 text-stone-900">{it.name}</td>
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
                    <td className="px-4 py-3 text-slate-500">{it.unit || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(it.price_cents)}</td>
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
        <div className="text-sm text-stone-500">Assign trucks</div>
        <h2 className="text-xl font-semibold text-stone-900 mt-1">{item.name}</h2>
        <p className="text-xs text-stone-500 mt-1">
          Trucks selected here can see and submit this item.
        </p>

        {trucks.length === 0 ? (
          <div className="mt-4 text-sm text-stone-500">No trucks exist yet.</div>
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
