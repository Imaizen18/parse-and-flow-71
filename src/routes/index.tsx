import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, Sparkles, Upload, Wallet } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ledger — Understand where your money goes" },
      {
        name: "description",
        content:
          "Upload your bank statement and Ledger turns it into categorized transactions, cash-flow charts, and budgets that keep you on track.",
      },
      { property: "og:title", content: "Ledger — Understand where your money goes" },
      {
        property: "og:description",
        content:
          "Upload your bank statement and Ledger turns it into categorized transactions, cash-flow charts, and budgets.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Upload,
    title: "Drop in a statement",
    body: "CSV and Excel exports from any bank. Columns are detected automatically.",
  },
  {
    icon: Sparkles,
    title: "Auto-categorized",
    body: "Merchant names are cleaned up and each transaction lands in the right category.",
  },
  {
    icon: BarChart3,
    title: "See the shape of it",
    body: "Cash flow, category mix, and six-month trends the moment your data lands.",
  },
  {
    icon: Wallet,
    title: "Budgets that warn you",
    body: "Set a monthly cap per category and get a nudge before you blow past it.",
  },
];

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-2.5">
          <div className="bg-gradient-brand flex size-9 items-center justify-center rounded-xl text-sm font-black text-primary-foreground">
            L
          </div>
          <span className="text-lg font-bold tracking-tight">Ledger</span>
        </div>
        <Button asChild variant="ghost">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-4xl px-5 pb-16 pt-14 text-center sm:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Personal expense tracking
        </p>
        <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
          Understand where your
          <span className="text-gradient-brand"> money actually goes</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Upload a bank statement. Ledger parses every row, cleans up merchant names, sorts them
          into categories, and shows you the month at a glance.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="glow-ring">
            <Link to="/auth">
              Start tracking <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-5 pb-24 sm:grid-cols-2">
        {features.map((f) => (
          <div key={f.title} className="surface-card p-6">
            <f.icon className="size-5 text-primary" />
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
