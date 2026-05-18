export function formatMoney(cents: number | string | null | undefined): string {
  const n = Number(cents ?? 0);
  if (!Number.isFinite(n)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

export function parseMoneyToCents(s: string): number | null {
  if (typeof s !== "string") return null;
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
