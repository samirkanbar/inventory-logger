import * as SecureStore from "expo-secure-store";
import { API_BASE } from "./config";

// Ported from the web app's src/api.ts. Two differences for native:
//  1. Requests go to an absolute URL (API_BASE) instead of a relative /api.
//  2. The token lives in the device keychain (SecureStore), not localStorage.
const TOKEN_KEY = "il_token";

// In-memory cache so api() doesn't await the keychain on every call.
let cachedToken: string | null = null;
let loaded = false;

export async function loadToken(): Promise<string | null> {
  if (loaded) return cachedToken;
  cachedToken = (await SecureStore.getItemAsync(TOKEN_KEY)) ?? null;
  loaded = true;
  return cachedToken;
}

export async function setToken(t: string | null) {
  cachedToken = t;
  loaded = true;
  if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; json?: unknown; headers?: Record<string, string> } = {}
): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  const token = loaded ? cachedToken : await loadToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let body: string | undefined;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  }

  const res = await fetch(`${API_BASE}/api${path}`, {
    method: opts.method ?? "GET",
    headers,
    body,
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}
