import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { LogoutButton } from "../App";
import ConfirmSubmitModal, { CartLine } from "../components/ConfirmSubmitModal";
import { categoryLabel, groupByCategory } from "../categories";

interface Item {
  id: number;
  name: string;
  unit: string | null;
  category: string | null;
  price_cents: number;
}

function QtyControl({
  qty,
  onChange,
}: {
  qty: number;
  onChange: (q: number) => void;
}) {
  if (qty === 0) {
    return (
      <button
        onClick={() => onChange(1)}
        className="text-sm font-semibold rounded-lg bg-amber-700 text-amber-50 px-4 py-2 hover:bg-amber-800 shadow-sm"
      >
        + Add
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        className="w-9 h-9 rounded-lg bg-amber-100 text-amber-900 text-xl font-bold leading-none hover:bg-amber-200 border border-amber-300"
        aria-label="Decrease"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={qty}
        onClick={(e) => (e.target as HTMLInputElement).select()}
        onChange={(e) => {
          const n = Math.max(0, Math.round(Number(e.target.value) || 0));
          onChange(n);
        }}
        className="w-14 h-9 text-center font-bold text-stone-900 rounded-lg border border-amber-300 bg-white focus:border-amber-700 focus:ring-2 focus:ring-amber-200 outline-none tabular-nums"
      />
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        className="w-9 h-9 rounded-lg bg-amber-700 text-amber-50 text-xl font-bold leading-none hover:bg-amber-800 shadow-sm"
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

export default function TruckHome() {
  const { me } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Map<number, CartLine>>(new Map());
  const [confirming, setConfirming] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    api<{ items: Item[] }>("/items")
      .then((r) => setItems(r.items))
      .finally(() => setLoading(false));
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, q]);

  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);

  function isOpen(category: string) {
    if (q.length > 0) return true;
    return expanded.has(category);
  }

  function toggle(category: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(grouped.map((g) => g.category)));
  }
  function collapseAll() {
    setExpanded(new Set());
  }

  const cartLines = useMemo(() => Array.from(cart.values()), [cart]);
  const totalQty = cartLines.reduce((s, l) => s + l.quantity, 0);

  function setItemQty(item: Item, qty: number) {
    setCart((prev) => {
      const next = new Map(prev);
      if (qty <= 0) next.delete(item.id);
      else next.set(item.id, { item_id: item.id, name: item.name, quantity: qty });
      return next;
    });
  }

  async function submit(title: string) {
    const payload = {
      title,
      items: cartLines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
    };
    await api("/submissions", { method: "POST", json: payload });
    setCart(new Map());
    setConfirming(false);
    setFlash("Submitted! Your boss will see it instantly.");
    setTimeout(() => setFlash(null), 3500);
  }

  function cartCountFor(category: string): number {
    let n = 0;
    for (const it of items) {
      if (categoryLabel(it.category) !== category) continue;
      const line = cart.get(it.id);
      if (line) n += line.quantity;
    }
    return n;
  }

  return (
    <div className="min-h-full pb-32 touch bg-gradient-to-b from-amber-50 via-stone-50 to-amber-100/60">
      {/* Top bar — light cream with brown accents */}
      <header className="sticky top-0 z-10 bg-amber-50/95 backdrop-blur border-b border-amber-300 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-800" />
            <div>
              <div className="text-xs uppercase tracking-wider text-amber-800 font-semibold">Truck</div>
              <div className="font-semibold text-stone-900">{me?.label}</div>
            </div>
          </div>
          <LogoutButton />
        </div>
        <div className="max-w-2xl mx-auto px-4 pb-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items…"
            className="w-full rounded-xl border border-amber-300 bg-white text-stone-900 placeholder:text-stone-400 px-4 py-3 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-200"
          />
        </div>
      </header>

      {flash && (
        <div className="max-w-2xl mx-auto mt-3 px-4">
          <div className="rounded-xl bg-amber-100 border border-amber-300 text-amber-900 px-4 py-3 text-sm font-medium shadow-sm">
            {flash}
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto p-4">
        {loading ? (
          <div className="text-stone-600">Loading items…</div>
        ) : items.length === 0 ? (
          <div className="text-stone-700 bg-white rounded-2xl border border-amber-200 p-6 text-center shadow-sm">
            No items yet. Your admin needs to upload an inventory list first.
          </div>
        ) : (
          <>
            {q.length === 0 && grouped.length > 1 && (
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-stone-600">
                  {grouped.length} categor{grouped.length === 1 ? "y" : "ies"} · tap to expand
                </div>
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={expandAll}
                    className="rounded-lg bg-white border border-amber-300 px-2.5 py-1 text-stone-800 hover:bg-amber-50"
                  >
                    Expand all
                  </button>
                  <button
                    onClick={collapseAll}
                    className="rounded-lg bg-white border border-amber-300 px-2.5 py-1 text-stone-800 hover:bg-amber-50"
                  >
                    Collapse all
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {grouped.map(({ category, items: groupItems }) => {
                const open = isOpen(category);
                const cartN = cartCountFor(category);
                return (
                  <section
                    key={category}
                    className="rounded-2xl border border-stone-300 overflow-hidden bg-white shadow-sm"
                  >
                    <button
                      onClick={() => toggle(category)}
                      disabled={q.length > 0}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-stone-100 text-stone-900 text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-bold tracking-tight uppercase text-sm truncate">{category}</span>
                        <span className="text-xs font-medium text-stone-500 shrink-0">
                          {groupItems.length} item{groupItems.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {cartN > 0 && (
                          <span className="inline-flex items-center text-xs font-semibold bg-amber-700 text-amber-50 px-2 py-0.5 rounded-full">
                            {cartN} in cart
                          </span>
                        )}
                        <span
                          className={`transition-transform ${open ? "rotate-180" : ""} text-current opacity-60`}
                          aria-hidden
                        >
                          ▾
                        </span>
                      </div>
                    </button>

                    {open && (
                      <ul className="divide-y divide-stone-200 bg-stone-50">
                        {groupItems.map((it) => {
                          const inCart = cart.get(it.id);
                          const qty = inCart?.quantity ?? 0;
                          return (
                            <li key={it.id}>
                              <div
                                className={`flex items-center justify-between gap-3 px-4 py-3 transition ${
                                  qty > 0 ? "bg-amber-50" : "bg-white"
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-stone-900 truncate">{it.name}</div>
                                  {it.unit && (
                                    <div className="text-xs text-stone-500 mt-0.5">per {it.unit}</div>
                                  )}
                                </div>
                                <div className="shrink-0">
                                  <QtyControl qty={qty} onChange={(q) => setItemQty(it, q)} />
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}

              {grouped.length === 0 && (
                <div className="text-stone-600 text-sm bg-white border border-amber-200 rounded-2xl p-6 text-center shadow-sm">
                  No matches for "{query}".
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Sticky cart footer — cream, brown accents, dark accent only on button */}
      {cartLines.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-amber-50/95 backdrop-blur border-t-2 border-amber-300 shadow-[0_-4px_16px_rgba(120,53,15,0.12)]">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-semibold text-stone-900">
                {cartLines.length} item{cartLines.length === 1 ? "" : "s"} · {totalQty} qty
              </div>
              <button
                onClick={() => setCart(new Map())}
                className="text-xs text-stone-600 hover:text-amber-800 underline"
              >
                Clear
              </button>
            </div>
            <button
              onClick={() => setConfirming(true)}
              className="rounded-xl bg-stone-900 text-amber-50 font-semibold px-5 py-3 shadow-md hover:bg-stone-800"
            >
              Review & submit
            </button>
          </div>
        </div>
      )}

      {confirming && (
        <ConfirmSubmitModal
          lines={cartLines}
          onCancel={() => setConfirming(false)}
          onConfirm={submit}
        />
      )}
    </div>
  );
}
