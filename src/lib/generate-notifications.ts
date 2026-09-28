import { supabase } from "@/integrations/supabase/client";
import { Transaction } from "@/hooks/use-app-data";

export async function generateDailyNotifications(txns: Transaction[], budgets: any[], categories: any[]) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const userId = auth.user.id;

    // We use localStorage to track if we've generated notifications for today to avoid spamming the DB
    const today = new Date().toISOString().split("T")[0];
    const lastGenDate = localStorage.getItem("last_notification_gen_date");
    
    if (lastGenDate === today) {
      return; // Already generated today on this device
    }
    
    // Check if the notifications table exists and if we already generated today in the DB (for multi-device sync)
    const { data: existing, error: checkError } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "daily_summary")
      .gte("created_at", `${today}T00:00:00Z`)
      .limit(1);
      
    if (checkError) {
      if (checkError.code === '42P01') {
        console.warn("Notifications table does not exist yet.");
        return;
      }
      throw checkError;
    }

    if (existing && existing.length > 0) {
      localStorage.setItem("last_notification_gen_date", today);
      return; // Already generated today in DB
    }

    const newNotifications = [];

    // --- 1. Daily Summary ---
    // We check yesterday's spending
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    
    const yesterdayTxns = txns.filter(t => t.date === yesterdayStr);
    const yesterdaySpent = yesterdayTxns.filter(t => t.type === "debit").reduce((acc, t) => acc + t.amount, 0);
    const yesterdayIncome = yesterdayTxns.filter(t => t.type === "credit").reduce((acc, t) => acc + t.amount, 0);

    if (yesterdaySpent > 0 || yesterdayIncome > 0) {
      let msg = "";
      if (yesterdaySpent > 0 && yesterdayIncome > 0) {
        msg = `You spent ₹${yesterdaySpent} and received ₹${yesterdayIncome} yesterday.`;
      } else if (yesterdaySpent > 0) {
        msg = `You spent ₹${yesterdaySpent} across ${yesterdayTxns.filter(t => t.type === "debit").length} transactions yesterday.`;
      } else {
        msg = `You received ₹${yesterdayIncome} yesterday!`;
      }

      newNotifications.push({
        user_id: userId,
        title: "Daily Summary",
        message: msg,
        type: "daily_summary"
      });
    }

    // --- 2. Budget Alerts ---
    // Calculate current month's spending per category
    const currentMonth = today.slice(0, 7); // YYYY-MM
    const monthTxns = txns.filter(t => t.date.startsWith(currentMonth) && t.type === "debit");
    
    const spentByCategory = new Map<string, number>();
    let totalSpentMonth = 0;
    
    for (const t of monthTxns) {
      totalSpentMonth += t.amount;
      if (t.category_id) {
        spentByCategory.set(t.category_id, (spentByCategory.get(t.category_id) || 0) + t.amount);
      }
    }

    // Check overall budget
    const overallBudget = budgets.find(b => b.category_id === null);
    if (overallBudget && overallBudget.limit_amount > 0) {
      const pct = (totalSpentMonth / overallBudget.limit_amount) * 100;
      if (pct >= overallBudget.alert_threshold) {
        newNotifications.push({
          user_id: userId,
          title: "Overall Budget Alert",
          message: `You've used ${Math.round(pct)}% of your overall monthly budget (₹${totalSpentMonth} of ₹${overallBudget.limit_amount}).`,
          type: "budget_alert"
        });
      }
    }

    // Check category budgets
    for (const b of budgets) {
      if (!b.category_id || !b.is_active) continue;
      
      const used = spentByCategory.get(b.category_id) || 0;
      const pct = b.limit_amount > 0 ? (used / b.limit_amount) * 100 : 0;
      
      if (pct >= b.alert_threshold) {
        const catName = categories.find(c => c.id === b.category_id)?.name || "Unknown Category";
        newNotifications.push({
          user_id: userId,
          title: `${catName} Budget Alert`,
          message: `You've used ${Math.round(pct)}% of your ${catName} budget (₹${used} of ₹${b.limit_amount}).`,
          type: "budget_alert"
        });
      }
    }

    if (newNotifications.length > 0) {
      // If we've already inserted these budget alerts today, we shouldn't insert them again.
      // But for simplicity, we just insert all generated notifications and rely on the daily_summary check to prevent re-runs.
      // If there were no txns yesterday, daily_summary won't be pushed. 
      // To ensure we always mark a "run" in the DB, we can insert a hidden system notification.
      if (!newNotifications.some(n => n.type === "daily_summary")) {
          newNotifications.push({
            user_id: userId,
            title: "System",
            message: "Daily check completed",
            type: "daily_summary",
            is_read: true // auto-read so it doesn't bother the user
          });
      }
      
      await supabase.from("notifications").insert(newNotifications);
      
      // Trigger native device notifications
      if ("Notification" in window && Notification.permission === "granted") {
        for (const n of newNotifications) {
          if (n.title !== "System") {
            try {
              new Notification(n.title, {
                body: n.message,
                icon: "/favicon.ico", // Using a default icon
              });
            } catch (e) {
              console.error("Failed to show native notification", e);
            }
          }
        }
      }
    } else {
        // Just insert a hidden one to record the check
        await supabase.from("notifications").insert({
            user_id: userId,
            title: "System",
            message: "Daily check completed",
            type: "daily_summary",
            is_read: true
        });
    }
    
    // Mark as processed for today locally
    localStorage.setItem("last_notification_gen_date", today);
    
  } catch (err) {
    console.error("Failed to generate notifications:", err);
  }
}
