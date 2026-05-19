import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { formatDateTime } from "../money";

interface Admin {
  id: number;
  email: string;
  created_at: string;
}

export default function AdminAdmins() {
  const { me } = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [resetting, setResetting] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const r = await api<{ admins: Admin[] }>("/admins");
    setAdmins(r.admins);
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
      await api("/admins", { method: "POST", json: { email, password } });
      setCreated({ email, password });
      setEmail("");
      setPassword("");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(a: Admin) {
    const newPw = prompt(`New password for ${a.email}? (min 6 chars)`);
    if (!newPw) return;
    if (newPw.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }
    setResetting(a.id);
    try {
      await api("/admins", { method: "PATCH", json: { id: a.id, password: newPw } });
      alert(`Password updated for ${a.email}.`);
    } finally {
      setResetting(null);
    }
  }

  async function removeAdmin(a: Admin) {
    if (!confirm(`Remove admin ${a.email}? They will lose access immediately.`)) return;
    try {
      await api("/admins", { method: "DELETE", json: { id: a.id } });
      await load();
    } catch (e: any) {
      alert(e?.message || "Delete failed");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-stone-900">Admins</h1>
      <p className="text-sm text-slate-600 mt-1">
        Anyone you add here can sign in as an admin and manage everything.
      </p>

      <form
        onSubmit={onCreate}
        className="mt-4 bg-white rounded-2xl border border-stone-200 shadow-sm p-4 grid sm:grid-cols-2 gap-3"
      >
        <input
          required
          type="email"
          autoComplete="off"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value.toLowerCase())}
          className="rounded-xl border border-stone-300 px-3 py-2 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
        />
        <input
          required
          placeholder="Password (min 6)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border border-stone-300 px-3 py-2 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
        />
        <div className="sm:col-span-2 flex items-center justify-between gap-3">
          {err && <div className="text-sm text-rose-600">{err}</div>}
          <button
            disabled={busy}
            type="submit"
            className="ml-auto rounded-xl bg-amber-700 text-amber-50 px-4 py-2 text-sm font-medium hover:bg-amber-800 shadow-sm disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create admin"}
          </button>
        </div>
      </form>

      {created && (
        <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900 shadow-sm">
          Created. Share these credentials with the new admin:
          <div className="mt-1 font-mono">
            email: <b>{created.email}</b> · pass: <b>{created.password}</b>
          </div>
          <button onClick={() => setCreated(null)} className="text-xs underline mt-1">
            Dismiss
          </button>
        </div>
      )}

      <h2 className="mt-8 text-lg font-semibold text-stone-900">All admins</h2>
      {loading ? (
        <div className="text-slate-500 mt-3">Loading…</div>
      ) : admins.length === 0 ? (
        <div className="text-slate-500 mt-3 bg-white rounded-2xl border border-stone-200 p-6 text-center shadow-sm">
          No admins yet.
        </div>
      ) : (
        <div className="mt-3 bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {admins.map((a) => {
                const isMe = me?.id === a.id;
                return (
                  <tr key={a.id} className="hover:bg-amber-50/40">
                    <td className="px-4 py-3 text-stone-900 font-medium">
                      {a.email}
                      {isMe && (
                        <span className="ml-2 inline-flex items-center text-xs font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                          you
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDateTime(a.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right flex justify-end gap-2">
                      <button
                        onClick={() => resetPassword(a)}
                        disabled={resetting === a.id}
                        className="text-xs rounded-lg bg-stone-100 text-slate-700 px-3 py-1.5 hover:bg-stone-200"
                      >
                        Reset password
                      </button>
                      <button
                        onClick={() => removeAdmin(a)}
                        disabled={isMe}
                        title={isMe ? "You can't remove yourself" : ""}
                        className="text-xs rounded-lg bg-stone-100 text-slate-700 px-3 py-1.5 hover:bg-rose-100 hover:text-rose-700 disabled:opacity-40 disabled:hover:bg-stone-100 disabled:hover:text-slate-700"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
