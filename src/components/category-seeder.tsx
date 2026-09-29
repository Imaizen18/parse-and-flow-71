import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// These categories are always seeded for every user if they don't exist yet.
const SYSTEM_CATEGORIES = [
  { name: "Income",     icon: "TrendingUp",     color: "#22c55e" },
  { name: "Loan",       icon: "Handshake",       color: "#6366f1" },
  { name: "Temporary",  icon: "Clock",           color: "#f59e0b" },
];

export function CategorySeeder() {
  useEffect(() => {
    async function seed() {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) return;

      // Fetch existing category names for this user
      const { data: existing } = await supabase
        .from("categories")
        .select("name")
        .eq("user_id", userId);

      const existingNames = new Set(
        (existing ?? []).map((c) => c.name.toLowerCase().trim())
      );

      // Only insert categories that don't exist yet
      const toInsert = SYSTEM_CATEGORIES.filter(
        (c) => !existingNames.has(c.name.toLowerCase())
      );

      if (toInsert.length === 0) return;

      await supabase.from("categories").insert(
        toInsert.map((c) => ({
          user_id: userId,
          name: c.name,
          icon: c.icon,
          color: c.color,
          is_default: true,
        }))
      );

      // Invalidate the categories cache so dropdowns refresh
      // We can't call useQueryClient here, so dispatch a custom event
      window.dispatchEvent(new CustomEvent("categories-seeded"));
    }

    seed();
  }, []);

  return null;
}
