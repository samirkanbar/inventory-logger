import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import Login from "./pages/Login";
import TruckHome from "./pages/TruckHome";
import AdminLayout from "./pages/AdminLayout";
import AdminSubmissions from "./pages/AdminSubmissions";
import AdminItems from "./pages/AdminItems";
import AdminTrucks from "./pages/AdminTrucks";
import AdminSubmissionDetail from "./pages/AdminSubmissionDetail";

export default function App() {
  const { me, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">Loading…</div>
    );
  }

  if (!me) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (me.role === "truck") {
    return (
      <Routes>
        <Route path="/truck" element={<TruckHome />} />
        <Route path="*" element={<Navigate to="/truck" replace />} />
      </Routes>
    );
  }

  // admin
  return (
    <Routes>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="submissions" replace />} />
        <Route path="submissions" element={<AdminSubmissions />} />
        <Route path="submissions/:id" element={<AdminSubmissionDetail />} />
        <Route path="items" element={<AdminItems />} />
        <Route path="trucks" element={<AdminTrucks />} />
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

export function LogoutButton() {
  const { logout } = useAuth();
  const nav = useNavigate();
  return (
    <button
      className="text-sm font-medium text-stone-300 hover:text-amber-300 rounded-lg px-3 py-1.5 hover:bg-stone-800 transition"
      onClick={() => {
        logout();
        nav("/login", { replace: true });
      }}
    >
      Log out
    </button>
  );
}
