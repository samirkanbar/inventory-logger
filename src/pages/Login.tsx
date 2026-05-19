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
    <div className="min-h-full flex items-center justify-center p-4 bg-gradient-to-br from-amber-100 via-stone-100 to-amber-200">
      <div className="w-full max-w-sm bg-white border border-stone-300 rounded-3xl shadow-xl p-6 touch">
        <div className="flex items-center gap-2">
          <span className="inline-block w-8 h-8 rounded-xl bg-gradient-to-br from-stone-900 to-amber-800" />
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Inventory Logger</h1>
        </div>
        <p className="text-sm text-stone-600 mt-2">
          {mode === "truck" ? "Location sign-in" : "Admin sign-in"}
        </p>

        <div className="mt-5 flex rounded-xl bg-stone-200 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => setMode("truck")}
            className={`flex-1 py-2 rounded-lg transition ${
              mode === "truck" ? "bg-white shadow text-stone-900" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Location
          </button>
          <button
            type="button"
            onClick={() => setMode("admin")}
            className={`flex-1 py-2 rounded-lg transition ${
              mode === "admin" ? "bg-white shadow text-stone-900" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Admin
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          {mode === "admin" ? (
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
            />
          ) : (
            <input
              type="text"
              required
              autoComplete="username"
              placeholder="Location username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
            />
          )}
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
          />
          {error && <div className="text-sm text-red-700">{error}</div>}
          <button
            disabled={busy}
            type="submit"
            className="w-full rounded-xl bg-stone-900 text-amber-50 font-semibold py-3 hover:bg-stone-800 shadow-md disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
