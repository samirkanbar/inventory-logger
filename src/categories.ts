// Deterministic warm-only color palette per category.
// No reds, no greens — strictly browns, ambers, oranges, yellows, rose.

export interface CategoryColor {
  bg: string;
  border: string;
  headerBg: string;
  headerText: string;
  dot: string;
  ring: string;
}

const PALETTE: CategoryColor[] = [
  { bg: "bg-amber-50",   border: "border-amber-300",   headerBg: "bg-amber-100",   headerText: "text-amber-900",   dot: "bg-amber-600",   ring: "ring-amber-300" },
  { bg: "bg-orange-50",  border: "border-orange-300",  headerBg: "bg-orange-100",  headerText: "text-orange-900",  dot: "bg-orange-600",  ring: "ring-orange-300" },
  { bg: "bg-yellow-50",  border: "border-yellow-300",  headerBg: "bg-yellow-100",  headerText: "text-yellow-900",  dot: "bg-yellow-700",  ring: "ring-yellow-300" },
  { bg: "bg-rose-50",    border: "border-rose-300",    headerBg: "bg-rose-100",    headerText: "text-rose-900",    dot: "bg-rose-700",    ring: "ring-rose-300" },
  { bg: "bg-stone-100",  border: "border-stone-400",   headerBg: "bg-stone-200",   headerText: "text-stone-900",   dot: "bg-stone-700",   ring: "ring-stone-400" },
];

const NEUTRAL: CategoryColor = {
  bg: "bg-stone-50",
  border: "border-stone-300",
  headerBg: "bg-stone-100",
  headerText: "text-stone-700",
  dot: "bg-stone-500",
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
