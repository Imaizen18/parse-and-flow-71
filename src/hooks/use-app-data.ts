import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Category = {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_default: boolean;
};

export type Transaction = {
  id: string;
  date: string;
  description: string;
  merchant_name: string | null;
  amount: number;
  type: string;
  category_id: string | null;
  notes: string | null;
  tags: string[];
  statement_id: string | null;
};

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,icon,color,is_default")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTransactions(range?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ["transactions", range?.from, range?.to],
    queryFn: async (): Promise<Transaction[]> => {
      let q = supabase
        .from("transactions")
        .select("id,date,description,merchant_name,amount,type,category_id,notes,tags,statement_id")
        .order("date", { ascending: false })
        .limit(5000);
      if (range?.from) q = q.gte("date", range.from);
      if (range?.to) q = q.lte("date", range.to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((t) => ({ ...t, amount: Number(t.amount) }));
    },
  });
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,currency")
        .eq("id", auth.user.id)
        .maybeSingle();
      return data;
    },
  });
}

export function useBudgets(month: string) {
  return useQuery({
    queryKey: ["budgets", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("id,category_id,month,limit_amount,alert_threshold,is_active")
        .eq("month", month);
      if (error) throw error;
      return (data ?? []).map((b) => ({ ...b, limit_amount: Number(b.limit_amount) }));
    },
  });
}

export function useStatements() {
  return useQuery({
    queryKey: ["statements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_statements")
        .select("*")
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useKeywordRules() {
  return useQuery({
    queryKey: ["keyword_rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("keyword_rules")
        .select("id,keyword,category_id")
        .order("keyword");
      if (error) throw error;
      return data ?? [];
    },
  });
}
