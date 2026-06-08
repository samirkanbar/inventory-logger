import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, setToken, loadToken } from "./api";
import { registerForPushNotifications } from "./push";

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
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await loadToken();
      if (!t) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const m = await api<Me>("/me");
        if (!cancelled) {
          setMe(m);
          // Re-register this device's push token on every cold start.
          registerForPushNotifications().catch(() => {});
        }
      } catch {
        await setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function afterLogin() {
    const m = await api<Me>("/me");
    setMe(m);
    registerForPushNotifications().catch(() => {});
  }

  async function loginAdmin(email: string, password: string) {
    const r = await api<{ token: string }>("/login", {
      method: "POST",
      json: { role: "admin", email, password },
    });
    await setToken(r.token);
    await afterLogin();
  }

  async function loginTruck(username: string, password: string) {
    const r = await api<{ token: string }>("/login", {
      method: "POST",
      json: { role: "truck", username, password },
    });
    await setToken(r.token);
    await afterLogin();
  }

  async function logout() {
    await setToken(null);
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
