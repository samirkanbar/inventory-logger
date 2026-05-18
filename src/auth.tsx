import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, getToken, setToken } from "./api";

export type Role = "admin" | "truck";

export interface Me {
  id: number;
  role: Role;
  label: string;
}

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  loginAdmin: (email: string, password: string) => Promise<void>;
  loginTruck: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const m = await api<Me>("/me");
        if (!cancelled) setMe(m);
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loginAdmin(email: string, password: string) {
    const r = await api<{ token: string; label: string }>("/login", {
      method: "POST",
      json: { role: "admin", email, password },
    });
    setToken(r.token);
    const m = await api<Me>("/me");
    setMe(m);
  }

  async function loginTruck(username: string, password: string) {
    const r = await api<{ token: string; label: string }>("/login", {
      method: "POST",
      json: { role: "truck", username, password },
    });
    setToken(r.token);
    const m = await api<Me>("/me");
    setMe(m);
  }

  function logout() {
    setToken(null);
    setMe(null);
  }

  return (
    <Ctx.Provider value={{ me, loading, loginAdmin, loginTruck, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}
