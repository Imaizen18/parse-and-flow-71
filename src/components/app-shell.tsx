import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Upload,
  Receipt,
  Tags,
  Wallet,
  Sparkles,
  Settings,
  LogOut,
  Menu,
  AlertCircle,
  Handshake,
} from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { GlobalAddTransaction } from "@/components/global-add-transaction";
import { NotificationsPopover } from "@/components/notifications-popover";
import { NotificationGenerator } from "@/components/notification-generator";
import { CategorySeeder } from "@/components/category-seeder";
import { useQueryClient } from "@tanstack/react-query";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/upload", label: "Upload", icon: Upload },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/loans", label: "Loans", icon: Handshake },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/budgets", label: "Budgets", icon: Wallet },
  { to: "/reports", label: "Insights", icon: Sparkles },
  { to: "/suspicious", label: "Suspicious", icon: AlertCircle },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => {
        const active = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className={cn("size-4", active && "text-primary")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1">
      <div className="bg-gradient-brand flex size-8 items-center justify-center rounded-lg text-sm font-black text-primary-foreground">
        L
      </div>
      <span className="text-lg font-bold tracking-tight">Ledger</span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // When CategorySeeder creates new categories, refresh the cache
  useEffect(() => {
    const handler = () => qc.invalidateQueries({ queryKey: ["categories"] });
    window.addEventListener("categories-seeded", handler);
    return () => window.removeEventListener("categories-seeded", handler);
  }, [qc]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background relative">
      <aside className="border-sidebar-border bg-sidebar fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r p-4 lg:flex">
        <div className="flex items-center justify-between">
          <Brand />
          <NotificationsPopover />
        </div>
        <div className="mt-6 flex-1">
          <NavList />
        </div>
        <Button variant="ghost" className="justify-start gap-3" onClick={signOut}>
          <LogOut className="size-4" /> Sign out
        </Button>
      </aside>
      <header className="border-sidebar-border bg-sidebar/80 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          <NotificationsPopover />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-sidebar w-64 p-4">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Brand />
              <div className="mt-6">
                <NavList onNavigate={() => setOpen(false)} />
              </div>
              <Button variant="ghost" className="mt-4 w-full justify-start gap-3" onClick={signOut}>
                <LogOut className="size-4" /> Sign out
              </Button>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="px-4 pb-24 pt-6 lg:ml-60 lg:px-8 lg:pb-12">{children}</main>

      <nav className="border-sidebar-border bg-sidebar/95 fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t px-2 py-2 backdrop-blur lg:hidden">
        {nav.slice(0, 5).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex flex-col items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground [&.active]:text-primary"
            activeProps={{ className: "active" }}
          >
            <item.icon className="size-5" />
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Global Fixed Action Button */}
      <GlobalAddTransaction />

      {/* Background Notification Generator */}
      <NotificationGenerator />

      {/* Auto-seed system categories (Loan, Temporary, Income) if missing */}
      <CategorySeeder />
    </div>
  );
}