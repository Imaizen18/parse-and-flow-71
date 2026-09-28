export function findOffsettingTransactions<
  T extends {
    id: string;
    type: string;
    amount: number;
    date: string;
    merchant_name?: string | null;
    description?: string | null;
  }
>(txns: T[]) {
  const suspiciousPairs: { credit: T; debit: T }[] = [];
  const used = new Set<string>();

  const credits = txns.filter((t) => t.type === "credit").sort((a, b) => b.date.localeCompare(a.date));
  const debits = txns.filter((t) => t.type === "debit").sort((a, b) => b.date.localeCompare(a.date));

  // Strip out generic banking words AND extremely common middle/last names 
  // that cause false positive overlaps between completely different people.
  const ignoreWords = new Set([
    "money", "upi", "neft", "imps", "rtgs", "vpa", "tpt", "txn", "transaction",
    "transfer", "paid", "received", "sent", "from", "to", "the", "for", "and", 
    "dr", "cr", "mr", "ms", "mrs", "ac", "account", "bank", "deposit", "withdrawal",
    "payment", "fund", "funds", "credited", "debited", "inr", "rs", "net",
    "kumar", "singh", "devi", "bai", "sharma", "das", "pvt", "ltd", "private", "limited"
  ]);

  const getUniqueIdentifiers = (t: T) => {
    const text = `${t.merchant_name || ""} ${t.description || ""}`.toLowerCase();
    return text
      .replace(/[^a-z0-9\s]/g, " ") // keep only letters and numbers
      .split(/\s+/)
      .filter((w) => w.length > 2 && !ignoreWords.has(w));
  };

  for (const c of credits) {
    const cIdentifiers = getUniqueIdentifiers(c);

    const match = debits.find((d) => {
      // Amount must match exactly and transaction shouldn't be already paired
      if (used.has(d.id) || d.amount !== c.amount) return false;

      const dIdentifiers = getUniqueIdentifiers(d);

      // Prevent matching if no meaningful names/numbers could be extracted
      if (cIdentifiers.length === 0 || dIdentifiers.length === 0) return false;

      // Find all overlapping words between the sender and receiver
      const overlap = cIdentifiers.filter((cw) => dIdentifiers.includes(cw));

      // STRICT MATCH: There must be at least one highly unique word overlapping
      return overlap.length > 0;
    });

    if (match) {
      used.add(match.id);
      used.add(c.id);
      suspiciousPairs.push({ credit: c, debit: match });
    }
  }

  // --- Find Potential Income Sources ---
  // Look for sources that ONLY have credit transactions (never debited) and appear multiple times
  const potentialIncomeGroups: { sourceName: string; transactions: T[]; totalAmount: number }[] = [];
  const sourceGroups = new Map<string, { credits: T[]; debits: T[]; originalName: string }>();

  for (const t of txns) {
    const rawName = (t.merchant_name || t.description || "").trim();
    if (!rawName) continue;
    
    // Normalize string to group slight variations
    const normalized = rawName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!normalized || normalized.length < 3) continue;
    
    if (!sourceGroups.has(normalized)) {
      sourceGroups.set(normalized, { credits: [], debits: [], originalName: rawName });
    }
    
    if (t.type === "credit") {
      sourceGroups.get(normalized)!.credits.push(t);
    } else {
      sourceGroups.get(normalized)!.debits.push(t);
    }
  }

  for (const [, group] of sourceGroups.entries()) {
    // Only credits, no debits, and at least 2 instances (repeated income)
    if (group.credits.length >= 2 && group.debits.length === 0) {
      // Filter out any credits that might have been flagged as a suspicious pair somehow
      // (Though theoretically impossible since there are 0 debits in this group)
      const validCredits = group.credits.filter(c => !used.has(c.id));
      
      if (validCredits.length >= 2) {
        const totalAmount = validCredits.reduce((acc, c) => acc + c.amount, 0);
        potentialIncomeGroups.push({
          sourceName: group.originalName,
          transactions: validCredits,
          totalAmount
        });
      }
    }
  }
  
  potentialIncomeGroups.sort((a, b) => b.totalAmount - a.totalAmount);

  return { suspiciousIds: used, suspiciousPairs, potentialIncomeGroups };
}