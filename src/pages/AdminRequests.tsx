import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { formatDateTime } from "../money";

type Status = "open" | "sent" | "declined";

interface RequestRow {
  id: number;
  truck_id: number;
  truck_name: string;
  item_name: string;
  quantity: number | null;
  note: string | null;
  status: Status;
  created_at: string;
  resolved_at: string | null;
}

const BADGE: Record<Exclude<Status, "open">, string> = {
  sent: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-800",
};

export default function AdminRequests() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"open" | "history">("open");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ requests: RequestRow[] }>("/requests");
      setRows(r.requests);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Couldn't load requests");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Requests arrive while the page is open, so poll rather than making the
  // admin refresh to find out a location is waiting on something.
  useEffect(() => {
    const t = setInterval(() => {
      load();
    }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function setStatus(id: number, status: Status) {
    setBusyId(id);
    try {
      const r = await api<{ request: { id: number; status: Status; resolved_at: string | null } }>(
        "/requests",
        { method: "PATCH", json: { id, status } }
      );
      setRows((prev) =>
        prev.map((row) =>
          row.id === id
            ? { ...row, status: r.request.status, resolved_at: r.request.resolved_at }
            : row
        )
      );
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Couldn't update that request — it's unchanged.");
    } finally {
      setBusyId(null);
    }
  }

  const open = useMemo(() => rows.filter((r) => r.status === "open"), [rows]);
  const history = useMemo(() => rows.filter((r) => r.status !== "open"), [rows]);
  const data = tab === "open" ? open : history;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Requests</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Items your locations are asking for. Marking one notifies them on their phone.
          </p>
        </div>
        <div className="inline-flex rounded-xl bg-amber-100 border border-amber-300 p-1">
          {(["open", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
                tab === t ? "bg-white shadow-sm text-stone-900" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {t === "open" ? "Open" : "History"}
              {t === "open" && open.length ? ` (${open.length})` : ""}
              {t === "history" && history.length ? ` (${history.length})` : ""}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-slate-500">Loading…</div>
      ) : data.length === 0 ? (
        <div className="text-slate-600 bg-white border border-stone-200 rounded-2xl shadow-sm p-6 text-center">
          {tab === "open"
            ? "No open requests. When a location asks for something, it shows up here."
            : "Nothing handled yet. Requests you mark Sent or Declined will appear here."}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">{tab === "open" ? "Requested" : "Handled"}</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium text-right">Qty</th>
                <th className="px-4 py-3 font-medium text-right">
                  {tab === "open" ? "Actions" : "Status"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.map((r) => (
                <tr key={r.id} className="hover:bg-amber-50/40">
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {formatDateTime(r.resolved_at ?? r.created_at)}
                  </td>
                  <td className="px-4 py-3 text-amber-800 font-medium">{r.truck_name}</td>
                  <td className="px-4 py-3 text-stone-900 font-medium">{r.item_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.quantity ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {tab === "open" ? (
                      <div className="flex gap-2 justify-end">
                        <button
                          disabled={busyId === r.id}
                          onClick={() => setStatus(r.id, "sent")}
                          className="text-sm rounded-lg bg-green-600 text-white px-3 py-1.5 hover:bg-green-700 shadow-sm disabled:opacity-50"
                        >
                          Sent
                        </button>
                        <button
                          disabled={busyId === r.id}
                          onClick={() => setStatus(r.id, "declined")}
                          className="text-sm rounded-lg border border-red-300 text-red-700 px-3 py-1.5 hover:bg-red-50 disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 justify-end">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            BADGE[r.status as Exclude<Status, "open">]
                          }`}
                        >
                          {r.status === "sent" ? "Sent" : "Declined"}
                        </span>
                        <button
                          disabled={busyId === r.id}
                          onClick={() => setStatus(r.id, "open")}
                          className="text-xs text-stone-500 underline hover:text-stone-800 disabled:opacity-50"
                        >
                          Reopen
                        </button>
                      </div>
                    )}
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
