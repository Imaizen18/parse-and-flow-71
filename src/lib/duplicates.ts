import type { Transaction } from "@/hooks/use-app-data";

export type DuplicateGroup = {
  key: string;
  label: string;
  date: string;
  amount: number;
  type: string;
  items: Transaction[];
};

function normalize(t: Transaction) {
  return (t.merchant_name || t.description || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Groups transactions that share the same day, amount, type and merchant.
 * Those are almost always the same statement imported twice.
 */
export function findDuplicates(txns: Transaction[]): DuplicateGroup[] {
  const map = new Map<string, Transaction[]>();
  for (const t of txns) {
    const key = `${t.date}|${t.type}|${t.amount.toFixed(2)}|${normalize(t)}`;
    const arr = map.get(key);
    if (arr) arr.push(t);
    else map.set(key, [t]);
  }
  return [...map.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({
      key,
      label: items[0]!.merchant_name || items[0]!.description || "Unknown",
      date: items[0]!.date,
      amount: items[0]!.amount,
      type: items[0]!.type,
      items,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Keeps the first row of each group and returns the ids that can be removed. */
export function redundantIds(groups: DuplicateGroup[]): string[] {
  return groups.flatMap((g) => g.items.slice(1).map((t) => t.id));
}
