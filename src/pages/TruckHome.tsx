import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { LogoutButton } from "../App";
import QuantityModal from "../components/QuantityModal";
import ConfirmSubmitModal, { CartLine } from "../components/ConfirmSubmitModal";
import { categoryLabel, groupByCategory } from "../categories";

interface Item {
  id: number;
  name: string;
  unit: string | null;
  category: string | null;
  price_cents: number;
}

export default function TruckHome() {
  const { me } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Map<number, CartLine>>(new Map());
  const [pendingItem, setPendingItem] = useState<Item | null>(null);
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

  function addOrUpdate(itemId: number, name: string, qty: number) {
    setCart((prev) => {
      const next = new Map(prev);
      next.set(itemId, { item_id: itemId, name, quantity: qty });
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
    <div className="min-h-full pb-32 touch bg-gradient-to-b from-amber-50 via-stone-100 to-amber-100/50">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-stone-950/95 backdrop-blur border-b border-stone-800 shadow-md">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-amber-400 font-semibold">Truck</div>
            <div className="font-semibold text-stone-100">{me?.label}</div>
          </div>
          <LogoutButton />
        </div>
        <div className="max-w-2xl mx-auto px-4 pb-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items…"
            className="w-full rounded-xl border border-stone-700 bg-stone-900 text-stone-100 placeholder:text-stone-500 px-4 py-3 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-900/50"
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
          <div className="text-stone-700 bg-white rounded-2xl border border-stone-300 p-6 text-center shadow-sm">
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
                    className="rounded-lg bg-white border border-stone-300 px-2.5 py-1 text-stone-800 hover:bg-stone-50"
                  >
                    Expand all
                  </button>
                  <button
                    onClick={collapseAll}
                    className="rounded-lg bg-white border border-stone-300 px-2.5 py-1 text-stone-800 hover:bg-stone-50"
                  >
                    Collapse all
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {grouped.map(({ category, items: groupItems, color }) => {
                const open = isOpen(category);
                const cartN = cartCountFor(category);
                return (
                  <section
                    key={category}
                    className={`rounded-2xl border ${color.border} overflow-hidden bg-white shadow-sm`}
                  >
                    <button
                      onClick={() => toggle(category)}
                      disabled={q.length > 0}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-3 ${color.headerBg} ${color.headerText} text-left`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full ${color.dot} shrink-0`} />
                        <span className="font-semibold truncate">{category}</span>
                        <span className="text-xs opacity-70 shrink-0">
                          {groupItems.length} item{groupItems.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {cartN > 0 && (
                          <span className="inline-flex items-center text-xs font-semibold bg-stone-900 text-amber-100 px-2 py-0.5 rounded-full">
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
                      <ul className={`divide-y divide-stone-200 ${color.bg}`}>
                        {groupItems.map((it) => {
                          const inCart = cart.get(it.id);
                          return (
                            <li key={it.id}>
                              <div
                                className={`flex items-center justify-between gap-3 px-4 py-3 transition ${
                                  inCart ? "bg-amber-50/80" : "bg-white"
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-stone-900 truncate">{it.name}</div>
                                  {it.unit && (
                                    <div className="text-xs text-stone-500 mt-0.5">per {it.unit}</div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {inCart ? (
                                    <>
                                      <span className="text-sm font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-lg tabular-nums">
                                        × {inCart.quantity}
                                      </span>
                                      <button
                                        onClick={() => setPendingItem(it)}
                                        className="text-xs font-semibold rounded-lg bg-stone-900 text-amber-100 px-3 py-2 hover:bg-stone-800 shadow-sm"
                                      >
                                        Edit
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => setPendingItem(it)}
                                      className="text-sm font-semibold rounded-lg bg-stone-900 text-amber-100 px-4 py-2 hover:bg-stone-800 shadow-sm"
                                    >
                                      + Add
                                    </button>
                                  )}
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
                <div className="text-stone-600 text-sm bg-white border border-stone-300 rounded-2xl p-6 text-center shadow-sm">
                  No matches for "{query}".
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Sticky cart footer */}
      {cartLines.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-stone-950/95 backdrop-blur border-t border-stone-800 shadow-[0_-4px_16px_rgba(0,0,0,0.2)]">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-semibold text-stone-100">
                {cartLines.length} item{cartLines.length === 1 ? "" : "s"} · {totalQty} qty
              </div>
              <button
                onClick={() => setCart(new Map())}
                className="text-xs text-amber-400 hover:text-amber-300 underline"
              >
                Clear
              </button>
            </div>
            <button
              onClick={() => setConfirming(true)}
              className="rounded-xl bg-amber-700 text-white font-semibold px-5 py-3 shadow-md hover:bg-amber-800"
            >
              Review & submit
            </button>
          </div>
        </div>
      )}

      {pendingItem && (
        <QuantityModal
          itemName={pendingItem.name}
          initial={cart.get(pendingItem.id)?.quantity}
          onCancel={() => setPendingItem(null)}
          onConfirm={(qty) => {
            addOrUpdate(pendingItem.id, pendingItem.name, qty);
            setPendingItem(null);
          }}
        />
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
