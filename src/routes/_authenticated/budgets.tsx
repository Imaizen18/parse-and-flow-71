import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBudgets, useCategories, useProfile, useTransactions } from "@/hooks/use-app-data";
import { formatMoney, monthKey, monthLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/budgets")({
  head: () => ({
    meta: [
      { title: "Budgets — Ledger" },
      { name: "description", content: "Set a monthly cap per category and track progress." },
      { property: "og:title", content: "Budgets — Ledger" },
      { property: "og:description", content: "Set monthly budgets per category." },
    ],
  }),
  component: BudgetsPage,
});

function BudgetsPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "INR";
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const month = monthKey(monthStart);

  const { data: budgets } = useBudgets(month);
  const { data: categories } = useCategories();
  const { data: txns } = useTransactions({ from: month });

  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [threshold, setThreshold] = useState("80");

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of txns ?? []) {
      if (t.type !== "debit" || !t.category_id) continue;
      map.set(t.category_id, (map.get(t.category_id) ?? 0) + t.amount);
    }
    return map;
  }, [txns]);

  async function addBudget() {
    const limit = Number(amount);
    if (!categoryId || !limit) { toast.error("Pick a category and an amount"); return; }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase.from("budgets").upsert(
      {
        user_id: auth.user.id,
        category_id: categoryId,
        month,
        limit_amount: limit,
        alert_threshold: Number(threshold) || 80,
      },
      { onConflict: "user_id,category_id,month" },
    );
    if (error) { toast.error("Could not save budget"); return; }
    setAmount("");
    qc.invalidateQueries();
    toast.success("Budget saved");
  }

  async function toggle(id: string, active: boolean) {
    await supabase.from("budgets").update({ is_active: active }).eq("id", id);
    qc.invalidateQueries();
  }

  async function remove(id: string) {
    await supabase.from("budgets").delete().eq("id", id);
    qc.invalidateQueries();
  }

  const totalLimit = (budgets ?? []).reduce((s, b) => s + b.limit_amount, 0);
  const totalSpent = (budgets ?? []).reduce(
    (s, b) => s + (spentByCategory.get(b.category_id) ?? 0),
    0,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Budgets</h1>
        <p className="text-sm text-muted-foreground">
          {monthLabel(monthStart)} · {formatMoney(totalSpent, currency)} of{" "}
          {formatMoney(totalLimit, currency)} budgeted
        </p>
      </div>

      <div className="surface-card grid gap-3 p-5 sm:grid-cols-[1fr_1fr_140px_auto]">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose category" />
            </SelectTrigger>
            <SelectContent>
              {(categories ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="limit">Monthly limit</Label>
          <Input
            id="limit"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10000"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="th">Alert at %</Label>
          <Input
            id="th"
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button onClick={addBudget}>
            <Plus className="mr-1 size-4" /> Save
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(budgets ?? []).map((b) => {
          const cat = (categories ?? []).find((c) => c.id === b.category_id);
          const used = spentByCategory.get(b.category_id) ?? 0;
          const pct = b.limit_amount ? Math.round((used / b.limit_amount) * 100) : 0;
          const tone =
            pct >= 100 ? "text-destructive" : pct >= b.alert_threshold ? "text-warning" : "text-success";
          return (
            <div key={b.id} className="surface-card p-5">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {cat?.icon} {cat?.name}
                </span>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={b.is_active}
                    onCheckedChange={(v) => toggle(b.id, v)}
                    aria-label="Toggle budget"
                  />
                  <Button variant="ghost" size="icon" onClick={() => remove(b.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <Progress value={Math.min(pct, 100)} className="mt-4" />
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {formatMoney(used, currency)} of {formatMoney(b.limit_amount, currency)}
                </span>
                <span className={`font-semibold ${tone}`}>{pct}%</span>
              </div>
              {pct >= b.alert_threshold && (
                <p className="mt-2 text-xs text-warning">
                  You've passed your {b.alert_threshold}% alert threshold.
                </p>
              )}
            </div>
          );
        })}
        {!budgets?.length && (
          <p className="text-sm text-muted-foreground">No budgets set for this month yet.</p>
        )}
      </div>
    </div>
  );
}
