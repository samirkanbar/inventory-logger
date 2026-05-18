import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, downloadFile } from "../api";
import { formatDateTime, formatMoney } from "../money";

interface Line {
  id: number;
  item_id: number;
  name: string;
  quantity: number;
  unit_price_cents: number;
}

interface Detail {
  submission: {
    id: number;
    title: string;
    submitted_at: string;
    truck_name: string;
    truck_username: string;
  };
  lines: Line[];
  total_cents: number;
}

export default function AdminSubmissionDetail() {
  const { id } = useParams();
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Detail>(`/submissions?id=${id}`).then(setData).catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <div className="text-rose-600">{err}</div>;
  if (!data) return <div className="text-slate-500">Loading…</div>;

  const s = data.submission;
  return (
    <div>
      <Link to="/admin/submissions" className="text-sm text-amber-800 hover:text-amber-900">
        ← All submissions
      </Link>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">{s.title}</h1>
          <div className="text-sm text-slate-500 mt-1">
            {s.truck_name} ({s.truck_username}) · {formatDateTime(s.submitted_at)} · #{s.id}
          </div>
        </div>
        <button
          onClick={() => downloadFile(`/export?id=${s.id}`, `submission-${s.id}.xlsx`)}
          className="rounded-xl bg-amber-700 text-amber-50 px-4 py-2 text-sm font-medium hover:bg-amber-800 shadow-sm"
        >
          Download Excel
        </button>
      </div>

      <div className="mt-6 bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium text-right">Qty</th>
              <th className="px-4 py-3 font-medium text-right">Unit price</th>
              <th className="px-4 py-3 font-medium text-right">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.lines.map((l) => (
              <tr key={l.id} className="hover:bg-amber-50/40">
                <td className="px-4 py-3 text-stone-900">{l.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{l.quantity}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(l.unit_price_cents)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {formatMoney(l.quantity * l.unit_price_cents)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-amber-100">
            <tr>
              <td className="px-4 py-3 font-medium text-stone-800" colSpan={3}>
                Total
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-bold text-amber-900">
                {formatMoney(data.total_cents)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
