import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Copy, Download, Search, Trash2 } from "lucide-react";
import { findDuplicates, redundantIds } from "@/lib/duplicates";

const PAGE_SIZE = 50;
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCategories, useProfile, useTransactions } from "@/hooks/use-app-data";
import { formatDate, formatMoney } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — Ledger" },
      { name: "description", content: "Search, filter and categorize every transaction." },
      { property: "og:title", content: "Transactions — Ledger" },
      { property: "og:description", content: "Search, filter and categorize transactions." },
    ],
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "INR";
  const { data: txns, isLoading } = useTransactions();
  const { data: categories } = useCategories();

  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState("date-desc");
  const [page, setPage] = useState(0);
  const [showDups, setShowDups] = useState(false);

  const catById = useMemo(
    () => Object.fromEntries((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );

  const filtered = useMemo(() => {
    return (txns ?? []).filter((t) => {
      if (type !== "all" && t.type !== type) return false;
      if (categoryFilter === "none" && t.category_id) return false;
      if (categoryFilter !== "all" && categoryFilter !== "none" && t.category_id !== categoryFilter)
        return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !t.description.toLowerCase().includes(q) &&
          !(t.merchant_name ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [txns, type, categoryFilter, from, to, search]);

  async function setCategory(ids: string[], categoryId: string) {
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: categoryId, is_manually_categorized: true })
      .in("id", ids);
    if (error) {
      toast.error("Could not update");
      return;
    }
    setSelected([]);
    qc.invalidateQueries();
    toast.success(ids.length > 1 ? `${ids.length} transactions updated` : "Category updated");
  }

  function exportCsv() {
    const header = ["Date", "Merchant", "Description", "Category", "Type", "Amount"];
    const lines = filtered.map((t) =>
      [
        t.date,
        t.merchant_name ?? "",
        t.description.replace(/"/g, "'"),
        t.category_id ? (catById[t.category_id]?.name ?? "") : "Uncategorized",
        t.type,
        t.amount,
      ]
        .map((v) => `"${v}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const total = filtered.reduce((s, t) => s + (t.type === "debit" ? t.amount : -t.amount), 0);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const name = (t: (typeof arr)[number]) => (t.merchant_name || t.description).toLowerCase();
    arr.sort((a, b) => {
      switch (sort) {
        case "date-asc": return a.date.localeCompare(b.date);
        case "amount-desc": return b.amount - a.amount;
        case "amount-asc": return a.amount - b.amount;
        case "merchant": return name(a).localeCompare(name(b));
        default: return b.date.localeCompare(a.date);
      }
    });
    return arr;
  }, [filtered, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const dupGroups = useMemo(() => findDuplicates(txns ?? []), [txns]);

  async function removeIds(ids: string[]) {
    if (!ids.length || !confirm(`Delete ${ids.length} duplicate transaction(s)?`)) return;
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from("transactions").delete().in("id", ids.slice(i, i + 200));
      if (error) {
        toast.error("Could not delete duplicates");
        return;
      }
    }
    qc.invalidateQueries();
    toast.success(`Removed ${ids.length} duplicate${ids.length > 1 ? "s" : ""}`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} results · net {formatMoney(total, currency)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-2 size-4" /> Export CSV
        </Button>
      </div>

      <div className="surface-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search merchant or description"
            className="pl-9"
          />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger>
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="debit">Debit</SelectItem>
            <SelectItem value="credit">Credit</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="none">Uncategorized</SelectItem>
            {(categories ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.icon} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
          <span className="text-sm">{selected.length} selected</span>
          <Select onValueChange={(v) => setCategory(selected, v)}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Re-categorize to…" />
            </SelectTrigger>
            <SelectContent>
              {(categories ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}

      {dupGroups.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Copy className="size-4 text-warning" />
              <span>
                {dupGroups.length} possible duplicate group{dupGroups.length > 1 ? "s" : ""} (
                {redundantIds(dupGroups).length} extra copies)
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowDups((v) => !v)}>
                {showDups ? "Hide" : "Review"}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => removeIds(redundantIds(dupGroups))}>
                <Trash2 className="mr-1 size-4" /> Remove all extras
              </Button>
            </div>
          </div>
          {showDups && (
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {dupGroups.map((g) => (
                <li key={g.key} className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {formatDate(g.date)} · {g.label} · {formatMoney(g.amount, currency)} ×{g.items.length}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => removeIds(g.items.slice(1).map((t) => t.id))}>
                    Keep one
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Sort</span>
          <Select value={sort} onValueChange={(v) => { setSort(v); setPage(0); }}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-desc">Newest first</SelectItem>
              <SelectItem value="date-asc">Oldest first</SelectItem>
              <SelectItem value="amount-desc">Largest amount</SelectItem>
              <SelectItem value="amount-asc">Smallest amount</SelectItem>
              <SelectItem value="merchant">Merchant A–Z</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setSelected((s) => (s.length === pageRows.length ? [] : pageRows.map((t) => t.id)))
            }
          >
            Select page
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            Page {safePage + 1} of {pageCount}
          </span>
          <Button variant="outline" size="icon" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !filtered.length ? (
          <p className="px-5 py-14 text-center text-sm text-muted-foreground">
            No transactions match these filters.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {pageRows.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Checkbox
                  checked={selected.includes(t.id)}
                  onCheckedChange={(v) =>
                    setSelected((s) => (v ? [...s, t.id] : s.filter((x) => x !== t.id)))
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.merchant_name || t.description}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(t.date)} · {t.description}
                  </p>
                </div>
                <Select
                  value={t.category_id ?? ""}
                  onValueChange={(v) => setCategory([t.id], v)}
                >
                  <SelectTrigger className="w-44 shrink-0">
                    <SelectValue placeholder="Uncategorized" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span
                  className={`w-28 shrink-0 text-right text-sm font-semibold ${
                    t.type === "credit" ? "text-success" : ""
                  }`}
                >
                  {t.type === "credit" ? "+" : "−"}
                  {formatMoney(t.amount, currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
