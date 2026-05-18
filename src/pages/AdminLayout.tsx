import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { LogoutButton } from "../App";

export default function AdminLayout() {
  const { me } = useAuth();
  return (
    <div className="min-h-full bg-gradient-to-b from-stone-50 to-amber-50/40">
      <header className="bg-white/90 backdrop-blur border-b border-stone-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600" />
            <div>
              <div className="text-xs uppercase tracking-wide text-indigo-600 font-semibold">Admin</div>
              <div className="font-semibold text-slate-900">{me?.label}</div>
            </div>
          </div>
          <LogoutButton />
        </div>
        <nav className="max-w-6xl mx-auto px-4 pb-2 flex gap-1 text-sm">
          {[
            { to: "submissions", label: "Submissions" },
            { to: "items", label: "Items" },
            { to: "trucks", label: "Trucks" },
          ].map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg font-medium transition ${
                  isActive
                    ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-stone-100"
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}
