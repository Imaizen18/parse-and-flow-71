import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Handshake, Clock, CheckCircle2, Circle, ArrowUpRight, ArrowDownRight, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCategories, useTransactions, useProfile } from "@/hooks/use-app-data";
import { formatDate, formatMoney } from "@/lib/format";
import { CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/loans")({
  head: () => ({
    meta: [
      { title: "Loans & Temporary — Ledger" },
      { name: "description", content: "Track loans and temporary transactions. Mark them as settled." },
      { property: "og:title", content: "Loans — Ledger" },
    ],
  }),
  component: LoansPage,
});

// Helper: check if a category is a "neutral" type (loan or temporary)
const NEUTRAL_CATEGORY_NAMES = ["loan", "loans", "temporary", "temp"];
function isNeutralCategory(name: string) {
  return NEUTRAL_CATEGORY_NAMES.includes(name.toLowerCase().trim());
}

function LoansPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "INR";
  const { data: txns } = useTransactions();
  const { data: categories } = useCategories();

  const [settledIds, setSettledIds] = useState<Set<string>>(
    () => new Set(JSON.parse(localStorage.getItem("settled_loan_ids") ?? "[]"))
  );

  // Find the IDs of "Loan" and "Temporary" categories
  const neutralCategoryIds = useMemo(() => {
    if (!categories) return new Set<string>();
    return new Set(
      categories.filter((c) => isNeutralCategory(c.name)).map((c) => c.id)
    );
  }, [categories]);

  // All transactions under neutral categories
  const loanTxns = useMemo(() => {
    if (!txns) return [];
    return txns.filter((t) => t.category_id && neutralCategoryIds.has(t.category_id));
  }, [txns, neutralCategoryIds]);

  const catById = useMemo(
    () => Object.fromEntries((categories ?? []).map((c) => [c.id, c])),
    [categories]
  );

  const loans = loanTxns.filter((t) => {
    const cat = t.category_id ? catById[t.category_id] : null;
    return cat && cat.name.toLowerCase().includes("loan");
  });

  const temporary = loanTxns.filter((t) => {
    const cat = t.category_id ? catById[t.category_id] : null;
    return cat && (cat.name.toLowerCase().includes("temp") || cat.name.toLowerCase() === "temporary");
  });

  function toggleSettled(id: string) {
    setSettledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        toast.info("Marked as unsettled");
      } else {
        next.add(id);
        toast.success("Marked as settled!");
      }
      localStorage.setItem("settled_loan_ids", JSON.stringify([...next]));
      return next;
    });
  }

  async function removeCategory(id: string) {
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: null })
      .eq("id", id);
    if (error) { toast.error("Could not update"); return; }
    qc.invalidateQueries();
    toast.success("Transaction moved back to Uncategorized");
  }

  const totalLoaned = loans.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);
  const totalReceived = loans.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0);
  const totalTemp = temporary.reduce((s, t) => s + (t.type === "debit" ? t.amount : -t.amount), 0);

  function TxnList({ items, emptyLabel }: { items: typeof loanTxns; emptyLabel: string }) {
    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
          <Info className="size-8 opacity-40" />
          <p className="text-sm">{emptyLabel}</p>
        </div>
      );
    }
    return (
      <ul className="divide-y divide-border">
        {items.map((t) => {
          const settled = settledIds.has(t.id);
          const cat = t.category_id ? catById[t.category_id] : null;
          return (
            <li
              key={t.id}
              className={cn(
                "flex items-center gap-3 px-4 py-3 transition-opacity",
                settled && "opacity-50"
              )}
            >
              <button
                onClick={() => toggleSettled(t.id)}
                className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                title={settled ? "Mark as unsettled" : "Mark as settled"}
              >
                {settled ? (
                  <CheckCircle2 className="size-5 text-success" />
                ) : (
                  <Circle className="size-5" />
                )}
              </button>

              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-medium", settled && "line-through")}>
                  {t.merchant_name || t.description}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatDate(t.date)}
                  {cat && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: cat.color + "22", color: cat.color }}>
                      <CategoryIcon icon={cat.icon} className="size-3" />
                      {cat.name}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className={cn("text-sm font-semibold", t.type === "credit" ? "text-success" : "text-destructive")}>
                  {t.type === "credit" ? (
                    <ArrowDownRight className="inline size-3.5" />
                  ) : (
                    <ArrowUpRight className="inline size-3.5" />
                  )}
                  {formatMoney(t.amount, currency)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => removeCategory(t.id)}
                >
                  ×
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Loans & Temporary</h1>
        <p className="text-sm text-muted-foreground">
          These transactions are excluded from your income and expense totals.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-4">
          <p className="text-xs text-muted-foreground">Total Loaned Out</p>
          <p className="mt-1 text-xl font-bold text-destructive">{formatMoney(totalLoaned, currency)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{loans.filter(t => t.type === "debit").length} transactions</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-muted-foreground">Total Received (Loans)</p>
          <p className="mt-1 text-xl font-bold text-success">{formatMoney(totalReceived, currency)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{loans.filter(t => t.type === "credit").length} transactions</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-muted-foreground">Temp Net Flow</p>
          <p className={cn("mt-1 text-xl font-bold", totalTemp >= 0 ? "text-success" : "text-destructive")}>
            {totalTemp >= 0 ? "+" : ""}{formatMoney(Math.abs(totalTemp), currency)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{temporary.length} transactions</p>
        </div>
      </div>

      {/* Loans Section */}
      <div className="surface-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Handshake className="size-4 text-primary" />
          <h2 className="font-semibold">Loans</h2>
          <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
            {loans.length}
          </span>
        </div>
        <TxnList
          items={loans}
          emptyLabel='No loans yet. Categorize a transaction as "Loan" to see it here.'
        />
      </div>

      {/* Temporary Section */}
      <div className="surface-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Clock className="size-4 text-amber-400" />
          <h2 className="font-semibold">Temporary</h2>
          <span className="ml-auto rounded-full bg-amber-400/10 px-2 py-0.5 text-xs text-amber-400">
            {temporary.length}
          </span>
        </div>
        <TxnList
          items={temporary}
          emptyLabel='No temporary transactions. Categorize a transaction as "Temporary" to track it here.'
        />
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        <strong className="text-foreground">How it works:</strong> Transactions categorized as <em>Loan</em> or <em>Temporary</em> are completely excluded from your Dashboard income/expense totals. Check the circle ✓ to mark any transaction as settled.
      </div>
    </div>
  );
}
