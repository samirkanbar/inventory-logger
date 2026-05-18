import { useState } from "react";

export interface CartLine {
  item_id: number;
  name: string;
  quantity: number;
}

interface Props {
  lines: CartLine[];
  onCancel: () => void;
  onConfirm: (title: string) => Promise<void>;
}

export default function ConfirmSubmitModal({ lines, onCancel, onConfirm }: Props) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please add a title.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(title.trim());
    } catch (err: any) {
      setError(err?.message || "Submit failed");
      setBusy(false);
    }
  }

  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="fixed inset-0 bg-black/40 z-30 flex items-end sm:items-center justify-center p-4 touch">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="text-sm text-slate-500">Confirm submission</div>
        <h2 className="text-xl font-semibold text-slate-900 mt-1">
          {lines.length} item{lines.length === 1 ? "" : "s"} · {totalQty} total qty
        </h2>

        <label className="block mt-4 text-sm font-medium text-slate-700">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Morning delivery — Truck 42"
            autoFocus
            className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
          />
        </label>

        <ul className="mt-4 divide-y divide-slate-200 border border-slate-200 rounded-xl">
          {lines.map((l) => (
            <li key={l.item_id} className="flex justify-between px-4 py-3">
              <span className="text-slate-900">{l.name}</span>
              <span className="font-medium text-slate-700">× {l.quantity}</span>
            </li>
          ))}
        </ul>

        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl bg-slate-100 text-slate-700 font-medium py-3"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-xl bg-emerald-600 text-white font-medium py-3 hover:bg-emerald-700"
          >
            {busy ? "Submitting…" : "Confirm & submit"}
          </button>
        </div>
      </form>
    </div>
  );
}
