import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Search, AlertCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCategories, useProfile, useTransactions } from "@/hooks/use-app-data";
import { formatDate, formatMoney } from "@/lib/format";
import { findDuplicates, redundantIds } from "@/lib/duplicates";
import { CategoryIcon } from "@/components/category-icon";
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

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
  const [source, setSource] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [deletingDups, setDeletingDups] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  const catById = useMemo(
    () => Object.fromEntries((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );

  const duplicates = useMemo(() => findDuplicates(txns ?? []), [txns]);

  const filtered = useMemo(() => {
    return (txns ?? []).filter((t) => {
      // Type filter
      if (type !== "all" && t.type !== type) return false;

      // Source filter: Auto-imported txns have a statement_id, manual ones do not.
      if (source === "manual" && t.statement_id !== null) return false;
      if (source === "imported" && t.statement_id === null) return false;

      // Category filter
      if (categoryFilter === "none" && t.category_id) return false;
      if (categoryFilter !== "all" && categoryFilter !== "none" && t.category_id !== categoryFilter)
        return false;

      // Date filters
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;

      // Search text
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
  }, [txns, type, source, categoryFilter, from, to, search]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, type, source, categoryFilter, from, to]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginatedTxns = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const total = filtered.reduce((s, t) => s + (t.type === "debit" ? t.amount : -t.amount), 0);

  async function setCategory(ids: string[], categoryId: string) {
    let targetIds = [...ids];

    // If categorizing a single transaction, auto-categorize similar uncategorized ones
    if (ids.length === 1 && txns) {
      const targetTx = txns.find(t => t.id === ids[0]);
      if (targetTx && !targetTx.category_id) {
        // Find matching name to group by
        const matchName = targetTx.merchant_name || targetTx.description;
        if (matchName) {
          const similarUncategorized = txns.filter(t =>
            !t.category_id &&
            t.id !== ids[0] &&
            (t.merchant_name || t.description) === matchName
          );

          if (similarUncategorized.length > 0) {
            const similarIds = similarUncategorized.map(t => t.id);
            targetIds = [...targetIds, ...similarIds];
            toast.info(`Auto-categorizing ${similarIds.length} similar transactions`);
          }
        }
      }
    }

    const { error } = await supabase
      .from("transactions")
      .update({ category_id: categoryId, is_manually_categorized: true })
      .in("id", targetIds);

    if (error) {
      toast.error("Could not update");
      return;
    }
    setSelected([]);
    qc.invalidateQueries();
    toast.success(targetIds.length > 1 ? `${targetIds.length} transactions updated` : "Category updated");
  }

  async function removeDuplicates() {
    const ids = redundantIds(duplicates);
    if (!ids.length) return;

    setDeletingDups(true);
    const { error } = await supabase.from("transactions").delete().in("id", ids);
    setDeletingDups(false);

    if (error) {
      toast.error("Could not remove duplicates");
      return;
    }

    qc.invalidateQueries();
    toast.success(`Cleaned up ${ids.length} overlapping duplicate transactions`);
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

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} results — net {formatMoney(total, currency)}
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-2 size-4" /> Export CSV
        </Button>
      </div>

      {duplicates.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
          <div className="flex items-center gap-2.5 text-sm">
            <AlertCircle className="size-4 text-warning" />
            <div>
              <span className="font-semibold text-warning">Duplicates detected:</span> Ledger found {duplicates.length} overlapping transaction groups from multiple statement uploads.
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-background text-warning border-warning/30 hover:bg-warning/20 hover:text-warning"
            onClick={removeDuplicates}
            disabled={deletingDups}
          >
            <Trash2 className="mr-2 size-4" />
            {deletingDups ? "Removing..." : "Remove duplicates"}
          </Button>
        </div>
      )}

      {/* Expanded Grid Layout to support the new Source filter */}
      <div className="surface-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-7">
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

        <Select value={source} onValueChange={setSource}>
          <SelectTrigger>
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="imported">Auto-imported</SelectItem>
            <SelectItem value="manual">Manually added</SelectItem>
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
                <div className="flex items-center gap-2">
                  <CategoryIcon icon={c.icon} className="size-4" /> {c.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex flex-col sm:flex-row gap-2 lg:col-span-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
          <span className="text-sm">{selected.length} selected</span>
          <Select onValueChange={(v) => setCategory(selected, v)}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Re-categorize to..." />
            </SelectTrigger>
            <SelectContent>
              {(categories ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-2">
                    <CategoryIcon icon={c.icon} className="size-4" /> {c.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}

      <div className="surface-card overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !paginatedTxns.length ? (
          <p className="px-5 py-14 text-center text-sm text-muted-foreground">
            No transactions match these filters.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {paginatedTxns.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Checkbox
                    checked={selected.includes(t.id)}
                    onCheckedChange={(v) =>
                      setSelected((s) => (v ? [...s, t.id] : s.filter((x) => x !== t.id)))
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{t.merchant_name || t.description}</p>
                      {/* Show visual indicator if manually added */}
                      {!t.statement_id && (
                        <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          Manual
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(t.date)} — {t.description}
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
                          <div className="flex items-center gap-2">
                            <CategoryIcon icon={c.icon} className="size-4" /> {c.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span
                    className={`w-28 shrink-0 text-right text-sm font-semibold ${t.type === "credit" ? "text-success" : ""
                      }`}
                  >
                    {t.type === "credit" ? "+" : "-"}
                    {formatMoney(t.amount, currency)}
                  </span>
                </li>
              ))}
            </ul>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="border-t border-border p-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <span className="text-sm text-muted-foreground px-4">
                        Page {currentPage} of {totalPages}
                      </span>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}