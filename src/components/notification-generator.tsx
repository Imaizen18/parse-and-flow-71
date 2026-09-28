import { useEffect } from "react";
import { useCategories, useTransactions, useBudgets } from "@/hooks/use-app-data";
import { generateDailyNotifications } from "@/lib/generate-notifications";
import { monthKey } from "@/lib/format";

export function NotificationGenerator() {
  const { data: txns } = useTransactions();
  const { data: categories } = useCategories();
  
  // We only need the current month's budgets for budget alerts
  const currentMonth = monthKey(new Date()).slice(0, 7);
  const { data: budgets } = useBudgets(currentMonth);

  useEffect(() => {
    // Request permission for native push notifications
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    if (txns && budgets && categories) {
      generateDailyNotifications(txns, budgets, categories);
    }
  }, [txns, budgets, categories]);

  return null;
}
