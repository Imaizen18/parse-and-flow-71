import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCategories, useKeywordRules } from "@/hooks/use-app-data";
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

export const Route = createFileRoute("/_authenticated/categories")({
  head: () => ({
    meta: [
      { title: "Categories — Ledger" },
      { name: "description", content: "Manage spending categories and auto-categorization rules." },
      { property: "og:title", content: "Categories — Ledger" },
      { property: "og:description", content: "Manage categories and keyword rules." },
    ],
  }),
  component: CategoriesPage,
});

const EMOJIS = ["🍔", "🚗", "🛒", "🏠", "💊", "🎬", "👗", "📱", "✈️", "🎓", "💼", "💰", "🐾", "🎁"];

function CategoriesPage() {
  const qc = useQueryClient();
  const { data: categories } = useCategories();
  const { data: rules } = useKeywordRules();

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🎁");
  const [color, setColor] = useState("#22c55e");

  const [keyword, setKeyword] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");

  async function addCategory() {
    if (!name.trim()) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase
      .from("categories")
      .insert({ user_id: auth.user.id, name: name.trim(), icon, color });
    if (error) { toast.error("Could not create category"); return; }
    setName("");
    qc.invalidateQueries();
    toast.success("Category created");
  }

  async function removeCategory(id: string) {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) { toast.error("Could not delete category"); return; }
    qc.invalidateQueries();
    toast.success("Category deleted");
  }

  async function addRule() {
    if (!keyword.trim() || !ruleCategory) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase.from("keyword_rules").insert({
      user_id: auth.user.id,
      keyword: keyword.trim(),
      category_id: ruleCategory,
    });
    if (error) { toast.error("Could not save rule"); return; }
    setKeyword("");
    qc.invalidateQueries();
    toast.success("Rule saved — it runs on future uploads");
  }

  async function removeRule(id: string) {
    await supabase.from("keyword_rules").delete().eq("id", id);
    qc.invalidateQueries();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">
          Organize spending and teach Ledger how to sort future uploads.
        </p>
      </div>

      <div className="surface-card p-5">
        <h2 className="font-semibold">Your categories</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(categories ?? []).map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5"
            >
              <span className="text-lg">{c.icon}</span>
              <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: c.color }}
                aria-hidden
              />
              <Button variant="ghost" size="icon" onClick={() => removeCategory(c.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-3 border-t border-border pt-5 sm:grid-cols-[1fr_auto_auto_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">New category</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pets"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Icon</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMOJIS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-color">Color</Label>
            <Input
              id="cat-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-16 p-1"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={addCategory}>
              <Plus className="mr-1 size-4" /> Add
            </Button>
          </div>
        </div>
      </div>

      <div className="surface-card p-5">
        <h2 className="font-semibold">Keyword rules</h2>
        <p className="text-sm text-muted-foreground">
          If a description contains the keyword, the transaction gets this category on future
          uploads.
        </p>

        <div className="mt-4 space-y-2">
          {(rules ?? []).map((r) => {
            const cat = (categories ?? []).find((c) => c.id === r.category_id);
            return (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-sm"
              >
                <span className="font-mono">{r.keyword}</span>
                <span className="text-muted-foreground">→</span>
                <span className="flex-1">
                  {cat?.icon} {cat?.name}
                </span>
                <Button variant="ghost" size="icon" onClick={() => removeRule(r.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
          {!rules?.length && <p className="text-sm text-muted-foreground">No rules yet.</p>}
        </div>

        <div className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="kw">Keyword</Label>
            <Input
              id="kw"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="NETFLIX"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={ruleCategory} onValueChange={setRuleCategory}>
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
          <div className="flex items-end">
            <Button onClick={addRule}>
              <Plus className="mr-1 size-4" /> Add rule
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
