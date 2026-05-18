import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { LogoutButton } from "../App";

export default function AdminLayout() {
  const { me } = useAuth();
  return (
    <div className="min-h-full bg-gradient-to-b from-amber-50 via-stone-100 to-amber-100/60">
      <header className="bg-stone-950 border-b border-stone-800 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block w-7 h-7 rounded-lg bg-gradient-to-br from-amber-600 to-amber-800" />
            <div>
              <div className="text-xs uppercase tracking-wider text-amber-400 font-semibold">Admin</div>
              <div className="font-semibold text-stone-100">{me?.label}</div>
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
                    ? "bg-amber-700 text-white shadow-sm"
                    : "text-stone-300 hover:bg-stone-800 hover:text-amber-100"
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
