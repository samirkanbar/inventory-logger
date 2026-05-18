import { useEffect, useState } from "react";
import { api } from "../api";
import { formatDateTime } from "../money";

interface Truck {
  id: number;
  username: string;
  name: string;
  active: boolean;
  created_at: string;
}

export default function AdminTrucks() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [resetting, setResetting] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const r = await api<{ trucks: Truck[] }>("/trucks");
    setTrucks(r.trucks);
    setLoading(false);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/trucks", { method: "POST", json: { name, username, password } });
      setCreated({ username, password });
      setName("");
      setUsername("");
      setPassword("");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(t: Truck) {
    await api("/trucks", { method: "PATCH", json: { id: t.id, active: !t.active } });
    await load();
  }

  async function resetPassword(t: Truck) {
    const newPw = prompt(`New password for ${t.username}? (min 6 chars)`);
    if (!newPw) return;
    if (newPw.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }
    setResetting(t.id);
    try {
      await api("/trucks", { method: "PATCH", json: { id: t.id, password: newPw } });
      alert(`Password updated for ${t.username}.`);
    } finally {
      setResetting(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-stone-900">Trucks</h1>
      <p className="text-sm text-slate-600 mt-1">Create one login per truck — share with the crew.</p>

      <form onSubmit={onCreate} className="mt-4 bg-white rounded-2xl border border-stone-200 shadow-sm p-4 grid sm:grid-cols-3 gap-3">
        <input
          required
          placeholder="Display name (e.g. Truck 42)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-xl border border-stone-300 px-3 py-2 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
        />
        <input
          required
          placeholder="Username (lowercase)"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          className="rounded-xl border border-stone-300 px-3 py-2 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
        />
        <input
          required
          placeholder="Password (min 6)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border border-stone-300 px-3 py-2 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
        />
        <div className="sm:col-span-3 flex items-center justify-between gap-3">
          {err && <div className="text-sm text-rose-600">{err}</div>}
          <button
            disabled={busy}
            type="submit"
            className="ml-auto rounded-xl bg-stone-900 text-amber-50 px-4 py-2 text-sm font-medium hover:bg-stone-800 shadow-sm disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create truck"}
          </button>
        </div>
      </form>

      {created && (
        <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900 shadow-sm">
          Created. Share these credentials with the truck:
          <div className="mt-1 font-mono">
            user: <b>{created.username}</b> · pass: <b>{created.password}</b>
          </div>
          <button
            onClick={() => setCreated(null)}
            className="text-xs underline mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      <h2 className="mt-8 text-lg font-semibold text-stone-900">All trucks</h2>
      {loading ? (
        <div className="text-slate-500 mt-3">Loading…</div>
      ) : trucks.length === 0 ? (
        <div className="text-slate-500 mt-3 bg-white rounded-2xl border border-stone-200 p-6 text-center shadow-sm">No trucks yet.</div>
      ) : (
        <div className="mt-3 bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {trucks.map((t) => (
                <tr key={t.id} className={`${t.active ? "" : "opacity-50"} hover:bg-amber-50/40`}>
                  <td className="px-4 py-3 text-stone-900 font-medium">{t.name}</td>
                  <td className="px-4 py-3 font-mono text-amber-800">{t.username}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {formatDateTime(t.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {t.active ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right flex justify-end gap-2">
                    <button
                      onClick={() => resetPassword(t)}
                      disabled={resetting === t.id}
                      className="text-xs rounded-lg bg-stone-100 text-slate-700 px-3 py-1.5 hover:bg-stone-200"
                    >
                      Reset password
                    </button>
                    <button
                      onClick={() => toggleActive(t)}
                      className="text-xs rounded-lg bg-stone-100 text-slate-700 px-3 py-1.5 hover:bg-stone-200"
                    >
                      {t.active ? "Deactivate" : "Activate"}
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
