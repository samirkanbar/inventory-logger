import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadFile } from "../api";
import { formatDateTime, formatMoney } from "../money";

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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-stone-900">Submissions</h1>
        <select
          value={truckFilter}
          onChange={(e) => setTruckFilter(e.target.value)}
          className="rounded-xl border border-stone-300 px-3 py-2 text-sm bg-white shadow-sm focus:border-stone-900 focus:ring-2 focus:ring-stone-200 outline-none"
        >
          <option value="">All trucks</option>
          {trucks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
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
                    <button
                      onClick={() =>
                        downloadFile(`/export?id=${r.id}`, `submission-${r.id}.xlsx`)
                      }
                      className="text-sm rounded-lg bg-amber-700 text-amber-50 px-3 py-1.5 hover:bg-amber-800 shadow-sm"
                    >
                      Excel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
