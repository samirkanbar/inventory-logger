// Category grouping + labels, copied from the web app so ordering looks the
// same. (The web app also keeps a Tailwind color palette here; the native
// ordering screen uses a simpler header treatment, so colors are omitted.)

export const UNCATEGORIZED_LABEL = "Uncategorized";

export function categoryLabel(cat: string | null | undefined): string {
  const t = (cat ?? "").trim();
  return t || UNCATEGORIZED_LABEL;
}

export function groupByCategory<T extends { category: string | null | undefined }>(
  items: T[]
): Array<{ category: string; items: T[] }> {
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
  return keys.map((category) => ({ category, items: map.get(category)! }));
}
