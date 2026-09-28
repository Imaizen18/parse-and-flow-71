import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeft, ArrowRight, ArrowRightLeft, Info, ShieldCheck, Wallet, ChevronDown, Check } from "lucide-react";
import { useCategories, useProfile, useTransactions } from "@/hooks/use-app-data";
import { formatMoney, formatDate } from "@/lib/format";
import { findOffsettingTransactions } from "@/lib/offsetting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CategoryIcon } from "@/components/category-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/suspicious")({
  head: () => ({
    meta: [{ title: "Suspicious & Offsetting — Ledger" }],
  }),
  component: SuspiciousPage,
});

function SuspiciousPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "INR";
  const { data: txns } = useTransactions();
  const { data: categories } = useCategories();

  const { suspiciousPairs, potentialIncomeGroups } = useMemo(() => findOffsettingTransactions(txns ?? []), [txns]);

  const totalOffset = suspiciousPairs.reduce((acc, pair) => acc + pair.credit.amount, 0);

  async function handleCategorizeGroup(transactions: any[], categoryId: string) {
    const txIds = transactions.map(t => t.id);
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: categoryId, is_manually_categorized: true })
      .in("id", txIds);

    if (error) {
      toast.error("Failed to categorize transactions");
      return;
    }

    toast.success(`Categorized ${transactions.length} transactions successfully`);
    qc.invalidateQueries();
  }

  if (!txns?.length) {
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Offsetting Pairs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatMoney(totalOffset, currency)} in cancelled-out transfers excluded from your insights.
          </p>
        </div>
        {suspiciousPairs.length > 0 && (
          <Badge variant="secondary" className="w-fit text-sm px-3 py-1 font-medium">
            {suspiciousPairs.length} {suspiciousPairs.length === 1 ? "Pair" : "Pairs"} Detected
          </Badge>
        )}
      </div>

      {suspiciousPairs.length > 0 ? (
        <>
          {/* Explanation Banner */}
          <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-4 text-sm leading-relaxed shadow-sm">
            <Info className="size-5 text-primary shrink-0 mt-0.5" />
            <p>
              These pairs share <strong className="text-foreground font-semibold">exactly matching amounts</strong> and <strong className="text-foreground font-semibold">overlapping names</strong>.
              They are automatically filtered out of your Dashboard and Insights to ensure your true income and spending metrics are not artificially inflated.
            </p>
          </div>

          {/* Transaction Cards */}
          <div className="space-y-5">
            {suspiciousPairs.map((pair, i) => (
              <div key={i} className="surface-card relative overflow-hidden p-0 shadow-sm transition-shadow hover:shadow-md">

                {/* Amount Header Bar */}
                <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Matched Pair
                  </span>
                  <span className="font-bold tracking-tight text-foreground">
                    {formatMoney(pair.debit.amount, currency)}
                  </span>
                </div>

                {/* Split Details Container */}
                <div className="grid divide-y divide-border sm:grid-cols-[1fr_auto_1fr] sm:divide-x sm:divide-y-0">

                  {/* Left Side: Sent (Debit) */}
                  <div className="flex gap-4 p-5 hover:bg-muted/10 transition-colors">
                    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                      <ArrowRight className="size-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Money Sent
                      </p>
                      <p className="truncate font-medium text-foreground">
                        {pair.debit.merchant_name || pair.debit.description}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(pair.debit.date)}
                      </p>
                    </div>
                  </div>

                  {/* Center Visual Connector (Hidden on Mobile) */}
                  <div className="hidden items-center justify-center bg-muted/5 px-5 sm:flex">
                    <div className="rounded-full border border-border bg-background p-2 shadow-sm">
                      <ArrowRightLeft className="size-4 text-muted-foreground/60" />
                    </div>
                  </div>

                  {/* Right Side: Received (Credit) */}
                  <div className="flex gap-4 p-5 hover:bg-muted/10 transition-colors">
                    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                      <ArrowLeft className="size-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Money Received
                      </p>
                      <p className="truncate font-medium text-foreground">
                        {pair.credit.merchant_name || pair.credit.description}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(pair.credit.date)}
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* Potential Income Sources Section */}
      {potentialIncomeGroups.length > 0 && (
        <div className="mt-12 space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-border pt-8">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Recurring Income Sources</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We detected repeated credits from these sources with no offsetting debits.
                You can easily categorize them as Income or Salary here.
              </p>
            </div>
            <Badge variant="outline" className="w-fit text-sm px-3 py-1 bg-success/5 text-success border-success/20">
              {potentialIncomeGroups.length} Sources Found
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {potentialIncomeGroups.map((group, i) => (
              <div key={i} className="surface-card flex flex-col p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
                      <Wallet className="size-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground truncate max-w-[200px]">
                        {group.sourceName}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {group.transactions.length} transactions
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-success">
                      +{formatMoney(group.totalAmount, currency)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                  <span className="text-sm text-muted-foreground">Categorize as:</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1">
                        Select Category <ChevronDown className="size-3 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {(categories ?? []).map((c) => (
                        <DropdownMenuItem
                          key={c.id}
                          onClick={() => handleCategorizeGroup(group.transactions, c.id)}
                          className="cursor-pointer flex items-center gap-2"
                        >
                          <CategoryIcon icon={c.icon} className="size-4" /> {c.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {suspiciousPairs.length === 0 && potentialIncomeGroups.length === 0 && (
        /* Empty State */
        <div className="surface-card mx-auto mt-10 max-w-md p-10 text-center shadow-sm">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-success/10 text-success">
            <ShieldCheck className="size-8" />
          </div>
          <h2 className="mt-5 text-xl font-bold tracking-tight">Clean Ledger</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            We couldn't find any offsetting pairs or recurring income patterns in your records.
          </p>
        </div>
      )}
    </div>
  );
}