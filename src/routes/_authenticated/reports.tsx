import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Sparkles, TrendingDown, TrendingUp, Repeat } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCategories, useProfile, useTransactions } from "@/hooks/use-app-data";
import { formatCompact, formatMoney, monthLabel } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Insights — Ledger" },
      {
        name: "description",
        content: "Spending trends, top merchants, recurring payments and weekly habits.",
      },
      { property: "og:title", content: "Insights — Ledger" },
      { property: "og:description", content: "See where your money actually goes." },
    ],
  }),
  component: ReportsPage,
});

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ReportsPage() {
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "INR";
  const { data: txns } = useTransactions();
  const { data: categories } = useCategories();

  const catById = useMemo(
    () => Object.fromEntries((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );

  const debits = useMemo(() => (txns ?? []).filter((t) => t.type === "debit"), [txns]);
  const credits = useMemo(() => (txns ?? []).filter((t) => t.type === "credit"), [txns]);

  const monthly = useMemo(() => {
    const map = new Map<string, { spent: number; earned: number }>();
    for (const t of txns ?? []) {
      const key = t.date.slice(0, 7);
      const row = map.get(key) ?? { spent: 0, earned: 0 };
      if (t.type === "debit") row.spent += t.amount;
      else row.earned += t.amount;
      map.set(key, row);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([key, v]) => ({ month: monthLabel(`${key}-01`), ...v }));
  }, [txns]);

  const topMerchants = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const t of debits) {
      const name = (t.merchant_name || t.description || "Unknown").trim();
      const row = map.get(name) ?? { total: 0, count: 0 };
      row.total += t.amount;
      row.count += 1;
      map.set(name, row);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [debits]);

  const recurring = useMemo(() => {
    const map = new Map<string, { amounts: number[]; months: Set<string>; last: string }>();
    for (const t of debits) {
      const name = (t.merchant_name || t.description || "Unknown").trim().toLowerCase();
      const row = map.get(name) ?? { amounts: [], months: new Set<string>(), last: t.date };
      row.amounts.push(t.amount);
      row.months.add(t.date.slice(0, 7));
      if (t.date > row.last) row.last = t.date;
      map.set(name, row);
    }
    return [...map.entries()]
      .filter(([, v]) => v.months.size >= 2 && v.amounts.length >= 2)
      .map(([name, v]) => {
        const avg = v.amounts.reduce((s, a) => s + a, 0) / v.amounts.length;
        const spread = Math.max(...v.amounts) - Math.min(...v.amounts);
        return { name, avg, months: v.months.size, last: v.last, stable: spread <= avg * 0.15 };
      })
      .filter((r) => r.stable)
      .sort((a, b) => b.avg * b.months - a.avg * a.months)
      .slice(0, 6);
  }, [debits]);

  const byDay = useMemo(() => {
    const totals = new Array(7).fill(0) as number[];
    for (const t of debits) {
      const d = new Date(t.date).getDay();
      totals[d] = (totals[d] ?? 0) + t.amount;
    }
    const max = Math.max(1, ...totals);
    return totals.map((total, i) => ({ day: DAYS[i]!, total, intensity: total / max }));
  }, [debits]);

  const insights = useMemo(() => {
    const out: string[] = [];
    if (!debits.length) return out;
    const spent = debits.reduce((s, t) => s + t.amount, 0);
    const earned = credits.reduce((s, t) => s + t.amount, 0);
    if (earned > 0) {
      const rate = Math.round(((earned - spent) / earned) * 100);
      out.push(
        rate >= 0
          ? `You are keeping about ${rate}% of what comes in.`
          : `You are spending ${Math.abs(rate)}% more than you earn — worth trimming somewhere.`,
      );
    }
    const catTotals = new Map<string, number>();
    for (const t of debits)
      if (t.category_id) catTotals.set(t.category_id, (catTotals.get(t.category_id) ?? 0) + t.amount);
    const top = [...catTotals.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top)
      out.push(
        `${catById[top[0]]?.name ?? "One category"} is your biggest outflow at ${formatMoney(top[1], currency)} (${Math.round((top[1] / spent) * 100)}% of spending).`,
      );
    if (monthly.length >= 2) {
      const last = monthly[monthly.length - 1]!;
      const prev = monthly[monthly.length - 2]!;
      const diff = prev.spent ? Math.round(((last.spent - prev.spent) / prev.spent) * 100) : 0;
      out.push(
        diff >= 0
          ? `Spending is up ${diff}% versus ${prev.month}.`
          : `Spending is down ${Math.abs(diff)}% versus ${prev.month} — nice.`,
      );
    }
    if (recurring.length)
      out.push(
        `${recurring.length} recurring payments detected, costing about ${formatMoney(recurring.reduce((s, r) => s + r.avg, 0), currency)} a month.`,
      );
    const busiest = [...byDay].sort((a, b) => b.total - a.total)[0];
    if (busiest && busiest.total > 0)
      out.push(`${busiest.day} is your heaviest spending day of the week.`);
    return out;
  }, [debits, credits, catById, currency, monthly, recurring, byDay]);

  if (!txns?.length) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="surface-card p-12 text-center">
          <Sparkles className="mx-auto size-8 text-primary" />
          <h1 className="mt-3 text-xl font-semibold">No insights yet</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a statement and your trends, merchants and recurring payments will show up here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
        <p className="text-sm text-muted-foreground">
          Patterns pulled from {txns.length} transactions.
        </p>
      </div>

      <div className="surface-card p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="font-semibold">What stands out</h2>
        </div>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {insights.map((i) => (
            <li key={i} className="flex gap-2">
              <span className="text-primary">•</span>
              {i}
            </li>
          ))}
        </ul>
      </div>

      <div className="surface-card p-5">
        <h2 className="font-semibold">12-month trend</h2>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis
                tickFormatter={(v) => formatCompact(Number(v), currency)}
                tickLine={false}
                axisLine={false}
                fontSize={12}
                width={70}
              />
              <Tooltip
                formatter={(v: number) => formatMoney(Number(v), currency)}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="earned" name="Income" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="spent" name="Spent" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />
            <h2 className="font-semibold">Top merchants</h2>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {topMerchants.map((m) => (
              <li key={m.name} className="flex items-center justify-between py-2.5 text-sm">
                <span className="min-w-0 truncate pr-3">
                  {m.name}
                  <span className="ml-2 text-xs text-muted-foreground">{m.count}×</span>
                </span>
                <span className="font-medium">{formatMoney(m.total, currency)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="surface-card p-5">
          <div className="flex items-center gap-2">
            <Repeat className="size-4 text-primary" />
            <h2 className="font-semibold">Recurring payments</h2>
          </div>
          {recurring.length ? (
            <ul className="mt-3 divide-y divide-border">
              {recurring.map((r) => (
                <li key={r.name} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="min-w-0 truncate pr-3 capitalize">
                    {r.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {r.months} months
                    </span>
                  </span>
                  <span className="font-medium">{formatMoney(r.avg, currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing repeating consistently yet.
            </p>
          )}
        </div>
      </div>

      <div className="surface-card p-5">
        <div className="flex items-center gap-2">
          <TrendingDown className="size-4 text-primary" />
          <h2 className="font-semibold">Spending by day of week</h2>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-2">
          {byDay.map((d) => (
            <div key={d.day} className="text-center">
              <div
                className="rounded-lg border border-border py-6"
                style={{ backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(d.intensity * 70)}%, transparent)` }}
                title={formatMoney(d.total, currency)}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">{d.day}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
