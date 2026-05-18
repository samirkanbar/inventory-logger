// Deterministic color palette per category — same category always renders the same color.
// Each entry is a self-contained set of Tailwind classes to avoid runtime concatenation
// (which Tailwind's static extractor can't see).

export interface CategoryColor {
  bg: string;      // section background tint
  border: string;
  headerBg: string;
  headerText: string;
  dot: string;     // small color dot
  ring: string;    // active/expanded ring
}

const PALETTE: CategoryColor[] = [
  { bg: "bg-amber-50",    border: "border-amber-200",    headerBg: "bg-amber-100",    headerText: "text-amber-900",    dot: "bg-amber-500",    ring: "ring-amber-300" },
  { bg: "bg-sky-50",      border: "border-sky-200",      headerBg: "bg-sky-100",      headerText: "text-sky-900",      dot: "bg-sky-500",      ring: "ring-sky-300" },
  { bg: "bg-rose-50",     border: "border-rose-200",     headerBg: "bg-rose-100",     headerText: "text-rose-900",     dot: "bg-rose-500",     ring: "ring-rose-300" },
  { bg: "bg-violet-50",   border: "border-violet-200",   headerBg: "bg-violet-100",   headerText: "text-violet-900",   dot: "bg-violet-500",   ring: "ring-violet-300" },
  { bg: "bg-emerald-50",  border: "border-emerald-200",  headerBg: "bg-emerald-100",  headerText: "text-emerald-900",  dot: "bg-emerald-500",  ring: "ring-emerald-300" },
  { bg: "bg-orange-50",   border: "border-orange-200",   headerBg: "bg-orange-100",   headerText: "text-orange-900",   dot: "bg-orange-500",   ring: "ring-orange-300" },
  { bg: "bg-teal-50",     border: "border-teal-200",     headerBg: "bg-teal-100",     headerText: "text-teal-900",     dot: "bg-teal-500",     ring: "ring-teal-300" },
  { bg: "bg-fuchsia-50",  border: "border-fuchsia-200",  headerBg: "bg-fuchsia-100",  headerText: "text-fuchsia-900",  dot: "bg-fuchsia-500",  ring: "ring-fuchsia-300" },
  { bg: "bg-lime-50",     border: "border-lime-200",     headerBg: "bg-lime-100",     headerText: "text-lime-900",     dot: "bg-lime-500",     ring: "ring-lime-300" },
  { bg: "bg-cyan-50",     border: "border-cyan-200",     headerBg: "bg-cyan-100",     headerText: "text-cyan-900",     dot: "bg-cyan-500",     ring: "ring-cyan-300" },
];

const NEUTRAL: CategoryColor = {
  bg: "bg-stone-50",
  border: "border-stone-200",
  headerBg: "bg-stone-100",
  headerText: "text-stone-700",
  dot: "bg-stone-400",
  ring: "ring-stone-300",
};

export const UNCATEGORIZED_LABEL = "Uncategorized";

export function categoryLabel(cat: string | null | undefined): string {
  const t = (cat ?? "").trim();
  return t || UNCATEGORIZED_LABEL;
}

export function colorForCategory(cat: string | null | undefined): CategoryColor {
  const label = categoryLabel(cat);
  if (label === UNCATEGORIZED_LABEL) return NEUTRAL;
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function groupByCategory<T extends { category: string | null | undefined }>(
  items: T[]
): Array<{ category: string; items: T[]; color: CategoryColor }> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const key = categoryLabel(it.category);
    const bucket = map.get(key);
    if (bucket) bucket.push(it);
    else map.set(key, [it]);
  }
  // Sort alphabetically, but push Uncategorized to the end.
  const keys = Array.from(map.keys()).sort((a, b) => {
    if (a === UNCATEGORIZED_LABEL) return 1;
    if (b === UNCATEGORIZED_LABEL) return -1;
    return a.localeCompare(b);
  });
  return keys.map((category) => ({
    category,
    items: map.get(category)!,
    color: colorForCategory(category),
  }));
}
