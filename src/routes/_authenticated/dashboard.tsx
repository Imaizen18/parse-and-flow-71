import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, PiggyBank, TrendingUp } from "lucide-react";
import { useBudgets, useCategories, useProfile, useTransactions } from "@/hooks/use-app-data";
import { formatCompact, formatMoney, monthKey, monthLabel, daysLeftInMonth } from "@/lib/format";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Ledger" },
      { name: "description", content: "Your monthly cash flow, category mix and budget progress." },
      { property: "og:title", content: "Dashboard — Ledger" },
      { property: "og:description", content: "Your monthly cash flow, category mix and budgets." },
    ],
  }),
  component: Dashboard,
});

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone?: "default" | "up" | "down";
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon
          className={
            tone === "up"
              ? "size-4 text-success"
              : tone === "down"
                ? "size-4 text-destructive"
                : "size-4 text-primary"
          }
        />
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function Dashboard() {
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "INR";
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const { data: txns, isLoading } = useTransactions({
    from: sixMonthsAgo.toISOString().slice(0, 10),
  });
  const { data: categories } = useCategories();
  const { data: budgets } = useBudgets(monthKey(monthStart));

  const catById = useMemo(
    () => Object.fromEntries((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );

  const thisMonth = useMemo(
    () => (txns ?? []).filter((t) => new Date(t.date) >= monthStart),
    [txns, monthStart],
  );

  const spent = thisMonth.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);
  const income = thisMonth.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0);
  const net = income - spent;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
  const uncategorized = thisMonth.filter((t) => !t.category_id).length;

  const cashFlow = useMemo(() => {
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    let ci = 0;
    let ce = 0;
    const out: { day: string; income: number; expense: number }[] = [];
    for (let d = 1; d <= days; d++) {
      const dayTx = thisMonth.filter((t) => new Date(t.date).getDate() === d);
      ci += dayTx.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0);
      ce += dayTx.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);
      if (d <= now.getDate()) out.push({ day: String(d), income: ci, expense: ce });
    }
    return out;
  }, [thisMonth, now]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of thisMonth) {
      if (t.type !== "debit") continue;
      const key = t.category_id ?? "none";
      map.set(key, (map.get(key) ?? 0) + t.amount);
    }
    return [...map.entries()]
      .map(([id, value]) => ({
        id,
        value,
        name: catById[id]?.name ?? "Uncategorized",
        color: catById[id]?.color ?? "#64748b",
        icon: catById[id]?.icon ?? "❓",
      }))
      .sort((a, b) => b.value - a.value);
  }, [thisMonth, catById]);

  const monthly = useMemo(() => {
    const out: { month: string; spent: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const total = (txns ?? [])
        .filter((t) => t.type === "debit" && new Date(t.date) >= start && new Date(t.date) < end)
        .reduce((s, t) => s + t.amount, 0);
      out.push({ month: monthLabel(start).split(" ")[0]!, spent: total });
    }
    return out;
  }, [txns, now]);

  const recent = (txns ?? []).slice(0, 12);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (!txns?.length) {
    return (
      <div className="surface-card mx-auto mt-10 max-w-lg p-10 text-center">
        <div className="bg-gradient-brand mx-auto flex size-14 items-center justify-center rounded-2xl text-2xl">
          📄
        </div>
        <h2 className="mt-5 text-xl font-bold">No transactions yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload your first bank statement and your dashboard will fill itself in.
        </p>
        <Button asChild className="mt-6">
          <Link to="/upload">Upload a statement</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {monthLabel(monthStart)} <span className="text-muted-foreground">overview</span>
        </h1>
        <p className="text-sm text-muted-foreground">{daysLeftInMonth()} days left in the month</p>
      </div>

      {uncategorized > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
          <div className="flex items-center gap-2.5 text-sm">
            <AlertTriangle className="size-4 text-warning" />
            You have {uncategorized} transaction{uncategorized > 1 ? "s" : ""} that need
            categorization.
          </div>
          <Button asChild size="sm" variant="secondary">
            <Link to="/transactions">Categorize now</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Spent this month"
          value={formatMoney(spent, currency)}
          icon={ArrowDownRight}
          tone="down"
        />
        <StatCard
          label="Income this month"
          value={formatMoney(income, currency)}
          icon={ArrowUpRight}
          tone="up"
        />
        <StatCard label="Net cash flow" value={formatMoney(net, currency)} icon={TrendingUp} />
        <StatCard label="Savings rate" value={`${savingsRate}%`} icon={PiggyBank} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="surface-card p-5 lg:col-span-3">
          <h2 className="font-semibold">Cash flow</h2>
          <p className="text-xs text-muted-foreground">Cumulative income vs expense</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashFlow}>
                <defs>
                  <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-4)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-chart-4)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  tickFormatter={(v) => formatCompact(Number(v), currency)}
                  tickLine={false}
                  axisLine={false}
                  width={58}
                  fontSize={11}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => formatMoney(v, currency)}
                />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="var(--color-chart-1)"
                  fill="url(#gi)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  stroke="var(--color-chart-4)"
                  fill="url(#ge)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-5 lg:col-span-2">
          <h2 className="font-semibold">Spending by category</h2>
          <div className="mt-2 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byCategory}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                  stroke="none"
                >
                  {byCategory.map((c) => (
                    <Cell key={c.id} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => formatMoney(v, currency)}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-1.5">
            {byCategory.slice(0, 6).map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: c.color }}
                    aria-hidden
                  />
                  {c.icon} {c.name}
                </span>
                <span className="font-medium">
                  {spent > 0 ? Math.round((c.value / spent) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {!!budgets?.length && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {budgets.map((b) => {
            const used = byCategory.find((c) => c.id === b.category_id)?.value ?? 0;
            const pct = b.limit_amount > 0 ? Math.round((used / b.limit_amount) * 100) : 0;
            const cat = b.category_id ? catById[b.category_id] : undefined;
            const tone =
              pct >= 100 ? "text-destructive" : pct >= b.alert_threshold ? "text-warning" : "text-success";
            return (
              <div key={b.id} className="surface-card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {b.category_id ? `${cat?.icon ?? ""} ${cat?.name ?? "Category"}` : "🎯 Overall monthly budget"}
                  </span>
                  <span className={`text-sm font-semibold ${tone}`}>{pct}%</span>
                </div>
                <Progress value={Math.min(pct, 100)} className="mt-3" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatMoney(used, currency)} of {formatMoney(b.limit_amount, currency)} ·{" "}
                  {daysLeftInMonth()} days left
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="surface-card p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent transactions</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/transactions">View all</Link>
            </Button>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {recent.map((t) => {
              const cat = t.category_id ? catById[t.category_id] : undefined;
              return (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-base">
                    {cat?.icon ?? "❓"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {t.merchant_name || t.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.date).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                      })}{" "}
                      · {cat?.name ?? "Uncategorized"}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold ${t.type === "credit" ? "text-success" : ""}`}
                  >
                    {t.type === "credit" ? "+" : "−"}
                    {formatMoney(t.amount, currency)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="surface-card p-5 lg:col-span-2">
          <h2 className="font-semibold">Last 6 months</h2>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <Tooltip
                  cursor={{ fill: "var(--color-accent)", opacity: 0.4 }}
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => formatMoney(v, currency)}
                />
                <Bar dataKey="spent" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
