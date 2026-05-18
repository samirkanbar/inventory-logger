import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { LogoutButton } from "../App";

export default function AdminLayout() {
  const { me } = useAuth();
  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Admin</div>
            <div className="font-semibold text-slate-900">{me?.label}</div>
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
                `px-3 py-2 rounded-lg font-medium ${
                  isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
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
