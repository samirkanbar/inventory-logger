import { useEffect, useRef, useState } from "react";

interface Props {
  itemName: string;
  initial?: number;
  onCancel: () => void;
  onConfirm: (qty: number) => void;
}

export default function QuantityModal({ itemName, initial, onCancel, onConfirm }: Props) {
  const [qty, setQty] = useState<number>(initial ?? 1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.select(), 50);
  }, []);

  function bump(delta: number) {
    setQty((q) => Math.max(1, q + delta));
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (qty > 0) onConfirm(qty);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-30 flex items-end sm:items-center justify-center p-4 touch">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6"
      >
        <div className="text-sm text-slate-500">How many did you receive?</div>
        <div className="text-xl font-semibold text-slate-900 mt-1">{itemName}</div>

        <div className="mt-5 flex items-center gap-3 justify-center">
          <button
            type="button"
            onClick={() => bump(-1)}
            className="w-12 h-12 rounded-xl bg-slate-100 text-2xl font-bold"
            aria-label="Decrease"
          >
            −
          </button>
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.round(Number(e.target.value) || 1)))}
            className="w-28 text-center text-3xl font-semibold rounded-xl border border-slate-300 py-2"
          />
          <button
            type="button"
            onClick={() => bump(1)}
            className="w-12 h-12 rounded-xl bg-slate-100 text-2xl font-bold"
            aria-label="Increase"
          >
            +
          </button>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl bg-slate-100 text-slate-700 font-medium py-3"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 rounded-xl bg-slate-900 text-white font-medium py-3"
          >
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
