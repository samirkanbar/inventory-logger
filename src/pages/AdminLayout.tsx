import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { LogoutButton } from "../App";

export default function AdminLayout() {
  const { me } = useAuth();
  return (
    <div className="min-h-full bg-gradient-to-b from-amber-50 via-stone-50 to-amber-100/60">
      <header className="bg-amber-50/95 backdrop-blur border-b border-amber-300 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-amber-800" />
            <div>
              <div className="text-xs uppercase tracking-wider text-amber-800 font-semibold">Admin</div>
              <div className="font-semibold text-stone-900">{me?.label}</div>
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
                    ? "bg-amber-700 text-amber-50 shadow-sm"
                    : "text-stone-700 hover:bg-amber-100 hover:text-amber-900"
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
