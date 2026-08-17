import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadFile } from "../api";
import { formatDateTime, formatMoney } from "../money";

interface PreviewLine {
  id: number;
  item_id: number;
  name: string;
  quantity: number;
  unit_price_cents: number;
}

interface PreviewData {
  submission: {
    id: number;
    title: string;
    submitted_at: string;
    truck_name: string;
    truck_username: string;
  };
  lines: PreviewLine[];
  total_cents: number;
}

interface Row {
  id: number;
  title: string;
  submitted_at: string;
  truck_id: number;
  truck_name: string;
  total_cents: number;
  total_qty: number;
}

interface Truck {
  id: number;
  name: string;
  active: boolean;
}

export default function AdminSubmissions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [truckFilter, setTruckFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);

  async function load() {
    setLoading(true);
    const q = truckFilter ? `?truck_id=${truckFilter}` : "";
    const [s, t] = await Promise.all([
      api<{ submissions: Row[] }>(`/submissions${q}`),
      api<{ trucks: Truck[] }>(`/trucks`),
    ]);
    setRows(s.submissions);
    setTrucks(t.trucks);
    setLoading(false);
  }

  useEffect(() => {
    load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truckFilter]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Submissions</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Orders your locations have sent in. Preview one, or build a report across a date range.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={truckFilter}
            onChange={(e) => setTruckFilter(e.target.value)}
            className="rounded-xl border border-stone-300 px-3 py-2 text-sm bg-white shadow-sm focus:border-stone-900 focus:ring-2 focus:ring-stone-200 outline-none"
          >
            <option value="">All locations</option>
            {trucks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowReport(true)}
            className="rounded-xl bg-stone-900 text-amber-50 px-4 py-2 text-sm font-medium hover:bg-stone-800 shadow-sm whitespace-nowrap"
          >
            Generate report
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-600 bg-white border border-stone-200 rounded-2xl shadow-sm p-6 text-center">
          No submissions yet.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Truck</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium text-right">Items</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-amber-50/40">
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {formatDateTime(r.submitted_at)}
                  </td>
                  <td className="px-4 py-3 text-stone-900">{r.truck_name}</td>
                  <td className="px-4 py-3">
                    <Link className="text-amber-800 hover:underline font-medium" to={`/admin/submissions/${r.id}`}>
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.total_qty}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-amber-800">
                    {formatMoney(r.total_cents)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setPreviewId(r.id)}
                        className="text-sm rounded-lg bg-stone-100 border border-stone-300 text-stone-700 px-3 py-1.5 hover:bg-stone-200"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() =>
                          downloadFile(`/export?id=${r.id}`, `submission-${r.id}.xlsx`)
                        }
                        className="text-sm rounded-lg bg-amber-700 text-amber-50 px-3 py-1.5 hover:bg-amber-800 shadow-sm"
                      >
                        Excel
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {previewId !== null && (
        <PreviewModal id={previewId} onClose={() => setPreviewId(null)} />
      )}

      {showReport && <ReportModal trucks={trucks} onClose={() => setShowReport(false)} />}
    </div>
  );
}

// Reads the same data the .xlsx is built from, so what you see here is what
// you'd get in the file — without a trip through your downloads folder.
function PreviewModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<PreviewData>(`/submissions?id=${id}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setErr(e?.message || "Couldn't load that submission"));
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-30 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-stone-200 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-stone-500">Preview</div>
            <h2 className="text-xl font-semibold text-stone-900 mt-0.5">
              {data ? data.submission.title : "Loading…"}
            </h2>
            {data && (
              <div className="text-sm text-slate-500 mt-1">
                {data.submission.truck_name} · {formatDateTime(data.submission.submitted_at)} · #
                {data.submission.id}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 text-xl leading-none px-1"
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>

        <div className="overflow-auto flex-1">
          {err ? (
            <div className="p-5 text-rose-700 text-sm">{err}</div>
          ) : !data ? (
            <div className="p-5 text-slate-500 text-sm">Loading…</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-slate-600 sticky top-0">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 font-medium text-right">Qty</th>
                  <th className="px-4 py-2.5 font-medium text-right">Unit price</th>
                  <th className="px-4 py-2.5 font-medium text-right">Line total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5 text-stone-900">{l.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{l.quantity}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMoney(l.unit_price_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {formatMoney(l.quantity * l.unit_price_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data && (
          <div className="p-4 border-t border-stone-200 flex items-center justify-between gap-4 bg-amber-50 rounded-b-2xl">
            <div className="text-sm">
              <span className="text-slate-600">{data.lines.length} line items · </span>
              <span className="font-bold text-amber-900 tabular-nums">
                {formatMoney(data.total_cents)}
              </span>
            </div>
            <div className="flex gap-2">
              <Link
                to={`/admin/submissions/${data.submission.id}`}
                className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-white"
              >
                Open full page
              </Link>
              <button
                onClick={() =>
                  downloadFile(
                    `/export?id=${data.submission.id}`,
                    `submission-${data.submission.id}.xlsx`
                  )
                }
                className="rounded-xl bg-amber-700 text-amber-50 px-4 py-2 text-sm font-medium hover:bg-amber-800 shadow-sm"
              >
                Download Excel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportModal({ trucks, onClose }: { trucks: Truck[]; onClose: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const activeTrucks = useMemo(() => trucks.filter((t) => t.active), [trucks]);

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generate() {
    if (from > to) return setErr("The start date has to be on or before the end date.");
    setErr(null);
    setBusy(true);
    try {
      const truckParam = picked.size > 0 ? `&truck_ids=${Array.from(picked).join(",")}` : "";
      await downloadFile(`/report?from=${from}&to=${to}${truckParam}`, `report_${from}_to_${to}.xlsx`);
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Couldn't build that report");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="text-sm text-stone-500">Report</div>
        <h2 className="text-xl font-semibold text-stone-900 mt-0.5">
          What your locations received
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          One spreadsheet with a summary tab, then a separate tab per location broken down by date.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-stone-800">From</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-stone-800">To</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {[
            { label: "Last 7 days", days: 6 },
            { label: "Last 30 days", days: 29 },
            { label: "Last 90 days", days: 89 },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setFrom(new Date(Date.now() - p.days * 86400_000).toISOString().slice(0, 10));
                setTo(today);
              }}
              className="rounded-lg bg-stone-100 border border-stone-300 px-2.5 py-1 text-stone-700 hover:bg-stone-200"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-stone-800">
              Locations
              <span className="text-stone-500 font-normal">
                {picked.size === 0 ? " · all" : ` · ${picked.size} selected`}
              </span>
            </span>
            {picked.size > 0 && (
              <button
                onClick={() => setPicked(new Set())}
                className="text-xs rounded-lg bg-stone-100 border border-stone-300 px-2.5 py-1 text-stone-700 hover:bg-stone-200"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {activeTrucks.map((t) => {
              const selected = picked.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  className={`text-sm rounded-full px-3 py-1.5 border transition ${
                    selected
                      ? "bg-amber-700 text-amber-50 border-amber-700 shadow-sm"
                      : "bg-white text-stone-700 border-stone-300 hover:border-amber-500"
                  }`}
                >
                  {selected && <span className="mr-1">✓</span>}
                  {t.name}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-stone-500 mt-2">
            Pick none to include every location.
          </p>
        </div>

        {err && <div className="mt-4 text-sm text-rose-700">{err}</div>}

        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={generate}
            disabled={busy}
            className="rounded-xl bg-stone-900 text-amber-50 px-4 py-2 text-sm font-medium hover:bg-stone-800 shadow-sm disabled:opacity-50"
          >
            {busy ? "Building…" : "Download report"}
          </button>
        </div>
      </div>
    </div>
  );
}
