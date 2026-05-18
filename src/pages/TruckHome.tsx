import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { LogoutButton } from "../App";
import QuantityModal from "../components/QuantityModal";
import ConfirmSubmitModal, { CartLine } from "../components/ConfirmSubmitModal";

interface Item {
  id: number;
  name: string;
  unit: string | null;
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

  useEffect(() => {
    api<{ items: Item[] }>("/items")
      .then((r) => setItems(r.items))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, query]);

  const cartLines = useMemo(() => Array.from(cart.values()), [cart]);
  const totalQty = cartLines.reduce((s, l) => s + l.quantity, 0);

  function addOrUpdate(itemId: number, name: string, qty: number) {
    setCart((prev) => {
      const next = new Map(prev);
      next.set(itemId, { item_id: itemId, name, quantity: qty });
      return next;
    });
  }

  function remove(itemId: number) {
    setCart((prev) => {
      const next = new Map(prev);
      next.delete(itemId);
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

  return (
    <div className="min-h-full pb-32 touch">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Truck</div>
            <div className="font-semibold text-slate-900">{me?.label}</div>
          </div>
          <LogoutButton />
        </div>
        <div className="max-w-2xl mx-auto px-4 pb-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items…"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
          />
        </div>
      </header>

      {flash && (
        <div className="max-w-2xl mx-auto mt-3 px-4">
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 text-sm">
            {flash}
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto p-4">
        {loading ? (
          <div className="text-slate-500">Loading items…</div>
        ) : items.length === 0 ? (
          <div className="text-slate-500">
            No items yet. Your admin needs to upload an inventory list first.
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((it) => {
              const inCart = cart.get(it.id);
              return (
                <li key={it.id}>
                  <button
                    onClick={() => setPendingItem(it)}
                    className={`w-full text-left rounded-2xl border px-4 py-4 bg-white hover:border-slate-900 transition ${
                      inCart ? "border-emerald-500 ring-2 ring-emerald-100" : "border-slate-200"
                    }`}
                  >
                    <div className="font-medium text-slate-900">{it.name}</div>
                    {it.unit && (
                      <div className="text-xs text-slate-500 mt-0.5">per {it.unit}</div>
                    )}
                    {inCart ? (
                      <div className="mt-2 text-sm text-emerald-700 font-medium">
                        Added · qty {inCart.quantity} <span className="text-slate-400">(tap to edit)</span>
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-slate-500">Tap to add</div>
                    )}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="col-span-full text-slate-500 text-sm">No matches.</li>
            )}
          </ul>
        )}
      </main>

      {/* Sticky cart footer */}
      {cartLines.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-semibold text-slate-900">
                {cartLines.length} item{cartLines.length === 1 ? "" : "s"} · {totalQty} qty
              </div>
              <button
                onClick={() => setCart(new Map())}
                className="text-xs text-slate-500 underline"
              >
                Clear
              </button>
            </div>
            <button
              onClick={() => setConfirming(true)}
              className="rounded-xl bg-slate-900 text-white font-medium px-5 py-3"
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
