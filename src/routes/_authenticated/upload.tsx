import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCategories, useKeywordRules, useStatements } from "@/hooks/use-app-data";
import { guessCategoryName, parseStatementFile } from "@/lib/parse-statement";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({
    meta: [
      { title: "Upload statements — Ledger" },
      { name: "description", content: "Upload CSV or Excel bank statements and parse them." },
      { property: "og:title", content: "Upload statements — Ledger" },
      { property: "og:description", content: "Upload CSV or Excel bank statements." },
    ],
  }),
  component: UploadPage,
});

const MAX_SIZE = 20 * 1024 * 1024;

function UploadPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: statements } = useStatements();
  const { data: categories } = useCategories();
  const { data: rules } = useKeywordRules();

  const handleFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_SIZE) {
        toast.error("File is larger than 20MB");
        return;
      }
      setBusy(true);
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "csv";
      const { data: statement, error: stErr } = await supabase
        .from("bank_statements")
        .insert({
          user_id: userId,
          file_name: file.name,
          file_type: ext,
          status: "processing",
        })
        .select()
        .single();

      if (stErr || !statement) {
        toast.error("Could not start the upload");
        setBusy(false);
        return;
      }
      qc.invalidateQueries({ queryKey: ["statements"] });

      try {
        const rows = await parseStatementFile(file);
        if (!rows.length) throw new Error("No transactions found in this file");

        const catByName = new Map((categories ?? []).map((c) => [c.name.toLowerCase(), c.id]));
        const ruleList = (rules ?? []).map((r) => ({
          keyword: r.keyword.toLowerCase(),
          categoryId: r.category_id,
        }));
        const uncategorizedId = catByName.get("uncategorized") ?? null;
        const incomeId = catByName.get("income") ?? null;

        const payload = rows.map((r) => {
          const text = `${r.description} ${r.merchant_name}`.toLowerCase();
          let categoryId: string | null = null;
          const rule = ruleList.find((x) => text.includes(x.keyword));
          if (rule) categoryId = rule.categoryId;
          else if (r.type === "credit") categoryId = incomeId;
          else {
            const guess = guessCategoryName(text);
            categoryId = guess ? (catByName.get(guess.toLowerCase()) ?? null) : uncategorizedId;
          }
          return {
            user_id: userId,
            statement_id: statement.id,
            date: r.date,
            description: r.description,
            merchant_name: r.merchant_name,
            amount: r.amount,
            type: r.type,
            category_id: categoryId,
          };
        });

        for (let i = 0; i < payload.length; i += 500) {
          const { error } = await supabase.from("transactions").insert(payload.slice(i, i + 500));
          if (error) throw error;
        }

        const dates = rows.map((r) => r.date).sort();
        await supabase
          .from("bank_statements")
          .update({
            status: "done",
            period_start: dates[0],
            period_end: dates[dates.length - 1],
            transaction_count: rows.length,
            total_debit: rows.filter((r) => r.type === "debit").reduce((s, r) => s + r.amount, 0),
            total_credit: rows.filter((r) => r.type === "credit").reduce((s, r) => s + r.amount, 0),
          })
          .eq("id", statement.id);

        toast.success(`Imported ${rows.length} transactions`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Parsing failed";
        await supabase
          .from("bank_statements")
          .update({ status: "error", error_message: message })
          .eq("id", statement.id);
        toast.error(message);
      } finally {
        setBusy(false);
        qc.invalidateQueries();
      }
    },
    [categories, rules, qc],
  );

  async function remove(id: string) {
    await supabase.from("bank_statements").delete().eq("id", id);
    qc.invalidateQueries();
    toast.success("Statement and its transactions removed");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload a statement</h1>
        <p className="text-sm text-muted-foreground">
          CSV, XLS or XLSX exports up to 20MB. Columns are detected automatically.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "surface-card flex cursor-pointer flex-col items-center justify-center gap-3 border-dashed p-12 text-center transition-colors",
          dragging && "border-primary bg-primary/5",
        )}
      >
        {busy ? (
          <Loader2 className="size-8 animate-spin text-primary" />
        ) : (
          <UploadCloud className="size-8 text-primary" />
        )}
        <p className="font-medium">{busy ? "Parsing your statement…" : "Drop your file here"}</p>
        <p className="text-sm text-muted-foreground">or click to browse — .csv .xlsx .xls</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      <div className="surface-card overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Upload history</h2>
        </div>
        {!statements?.length ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Nothing uploaded yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {statements.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <FileSpreadsheet className="size-5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.period_start ? `${formatDate(s.period_start)} → ` : ""}
                    {s.period_end ? formatDate(s.period_end) : "—"} · {s.transaction_count}{" "}
                    transactions · {formatMoney(Number(s.total_debit))} out
                  </p>
                  {s.error_message && (
                    <p className="text-xs text-destructive">{s.error_message}</p>
                  )}
                </div>
                <Badge
                  variant={
                    s.status === "done"
                      ? "secondary"
                      : s.status === "error"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {s.status}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => remove(s.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
