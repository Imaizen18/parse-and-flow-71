import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, LogOut, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useTransactions, useCategories } from "@/hooks/use-app-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Ledger" },
      { name: "description", content: "Manage your profile, currency and exported data." },
      { property: "og:title", content: "Settings — Ledger" },
      { property: "og:description", content: "Profile and data settings for Ledger." },
    ],
  }),
  component: SettingsPage,
});

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY"];

function SettingsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: txns } = useTransactions();
  const { data: categories } = useCategories();

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [suspiciousLimit, setSuspiciousLimit] = useState("5000");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setCurrency(profile.currency ?? "INR");
      // Load the limit directly from the Supabase profile row
      // @ts-ignore - bypassing strict type checks until user regenerates supabase types
      if (profile.suspicious_limit) setSuspiciousLimit(profile.suspicious_limit.toString());
    }
  }, [profile]);

  async function save() {
    if (!profile) return;
    setSaving(true);
    
    // Save all profile settings to Supabase
    const { error } = await supabase
      .from("profiles")
      .update({ 
        name: name.trim(), 
        currency,
        suspicious_limit: Number(suspiciousLimit) || 5000 
      })
      .eq("id", profile.id);

    setSaving(false);

    if (error) {
      toast.error("Could not save your settings");
      return;
    }

    qc.invalidateQueries();
    toast.success("Settings saved");
  }

  function exportCsv() {
    if (!txns?.length) {
      toast.error("Nothing to export yet");
      return;
    }
    const catById = Object.fromEntries((categories ?? []).map((c) => [c.id, c.name]));

    const header = ["Date", "Description", "Merchant", "Category", "Type", "Amount", "Notes"];
    const rows = txns.map((t) => [
      t.date,
      t.description,
      t.merchant_name ?? "",
      t.category_id ? (catById[t.category_id] ?? "") : "",
      t.type,
      String(t.amount),
      t.notes ?? "",
    ]);

    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function wipeData() {
    if (!confirm("Delete every transaction and uploaded statement? This cannot be undone.")) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    await supabase.from("transactions").delete().eq("user_id", auth.user.id);
    await supabase.from("bank_statements").delete().eq("user_id", auth.user.id);
    qc.invalidateQueries();
    toast.success("All transaction data removed");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Your profile, currency and data.</p>
      </div>

      <div className="surface-card space-y-4 p-5">
        <h2 className="font-semibold">Profile & Preferences</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={profile?.email ?? ""} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Base currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="limit">Suspicious Amount Limit</Label>
            <Input 
              id="limit" 
              type="number" 
              value={suspiciousLimit} 
              onChange={(e) => setSuspiciousLimit(e.target.value)} 
            />
          </div>
        </div>
        <Button onClick={save} disabled={saving}>
          <Save className="mr-1 size-4" /> {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>

      <div className="surface-card space-y-4 p-5">
        <h2 className="font-semibold">Your data</h2>
        <p className="text-sm text-muted-foreground">
          {txns?.length ?? 0} transactions stored.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-1 size-4" /> Export CSV
          </Button>
          <Button variant="destructive" onClick={wipeData}>
            Delete all transactions
          </Button>
        </div>
      </div>

      <div className="surface-card space-y-3 p-5">
        <h2 className="font-semibold">Account</h2>
        <Button variant="outline" onClick={signOut}>
          <LogOut className="mr-1 size-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}