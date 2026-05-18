import { useState } from "react";
import { useAuth } from "../auth";

type Mode = "truck" | "admin";

export default function Login() {
  const { loginAdmin, loginTruck } = useAuth();
  const [mode, setMode] = useState<Mode>("truck");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "admin") await loginAdmin(email.trim(), password);
      else await loginTruck(username.trim(), password);
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6 touch">
        <h1 className="text-2xl font-semibold text-slate-900">Inventory Logger</h1>
        <p className="text-sm text-slate-500 mt-1">
          {mode === "truck" ? "Truck sign-in" : "Admin sign-in"}
        </p>

        <div className="mt-4 flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => setMode("truck")}
            className={`flex-1 py-2 rounded-lg ${mode === "truck" ? "bg-white shadow text-slate-900" : "text-slate-500"}`}
          >
            Truck
          </button>
          <button
            type="button"
            onClick={() => setMode("admin")}
            className={`flex-1 py-2 rounded-lg ${mode === "admin" ? "bg-white shadow text-slate-900" : "text-slate-500"}`}
          >
            Admin
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          {mode === "admin" ? (
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
            />
          ) : (
            <input
              type="text"
              required
              autoComplete="username"
              placeholder="Truck username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
            />
          )}
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
          />
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button
            disabled={busy}
            type="submit"
            className="w-full rounded-xl bg-slate-900 text-white font-medium py-3 hover:bg-slate-800"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
