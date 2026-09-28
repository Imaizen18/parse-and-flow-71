import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Notification = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
        
      if (error) {
        // If the table doesn't exist yet, just return empty array instead of breaking the app
        if (error.code === '42P01') return [];
        throw error;
      }
      return data ?? [];
    },
    // Refresh notifications every 5 minutes
    refetchInterval: 1000 * 60 * 5,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("is_read", false)
        .eq("user_id", auth.user.id);
        
      if (error && error.code !== '42P01') throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
