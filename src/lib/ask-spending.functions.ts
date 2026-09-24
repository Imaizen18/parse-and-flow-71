import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({ question: z.string().min(2).max(500) });

export const askSpending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const [{ data: txns }, { data: cats }, { data: profile }] = await Promise.all([
      supabase
        .from("transactions")
        .select("date,description,merchant_name,amount,type,category_id")
        .order("date", { ascending: false })
        .limit(2000),
      supabase.from("categories").select("id,name"),
      supabase.from("profiles").select("currency").maybeSingle(),
    ]);

    if (!txns?.length) {
      return { answer: "There are no transactions yet — upload a statement and ask again." };
    }

    const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
    const currency = profile?.currency ?? "INR";

    // Monthly + category rollups keep the prompt small while staying accurate.
    const byMonth = new Map<string, { spent: number; earned: number }>();
    const byCat = new Map<string, number>();
    const byMerchant = new Map<string, number>();
    for (const t of txns) {
      const amt = Number(t.amount);
      const m = String(t.date).slice(0, 7);
      const row = byMonth.get(m) ?? { spent: 0, earned: 0 };
      if (t.type === "debit") {
        row.spent += amt;
        const cname = t.category_id ? (catName.get(t.category_id) ?? "Uncategorized") : "Uncategorized";
        byCat.set(cname, (byCat.get(cname) ?? 0) + amt);
        const mer = (t.merchant_name || t.description || "Unknown").trim().slice(0, 40);
        byMerchant.set(mer, (byMerchant.get(mer) ?? 0) + amt);
      } else {
        row.earned += amt;
      }
      byMonth.set(m, row);
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const summary = {
      currency,
      transaction_count: txns.length,
      range: { from: txns[txns.length - 1]?.date, to: txns[0]?.date },
      monthly: [...byMonth.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-18)
        .map(([month, v]) => ({ month, spent: round(v.spent), earned: round(v.earned) })),
      by_category: [...byCat.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, total]) => ({ name, total: round(total) })),
      top_merchants: [...byMerchant.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([name, total]) => ({ name, total: round(total) })),
      recent: txns.slice(0, 60).map((t) => ({
        date: t.date,
        merchant: t.merchant_name || t.description,
        amount: round(Number(t.amount)),
        type: t.type,
        category: t.category_id ? (catName.get(t.category_id) ?? "Uncategorized") : "Uncategorized",
      })),
    };

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions:
          `You are a personal finance analyst. Answer only from the JSON data provided. ` +
          `Amounts are in ${currency}. Be concise (max 6 short sentences or bullets), use concrete numbers, ` +
          `and say plainly when the data does not cover the question. Never invent transactions. Plain text, no markdown tables.`,
        input: `Data:\n${JSON.stringify(summary)}\n\nQuestion: ${data.question}`,
      }),
    });

    if (res.status === 429) return { answer: "Too many requests right now — try again in a minute." };
    if (res.status === 402) return { answer: "AI credits are exhausted. Add credits to keep asking." };
    if (res.status === 403) return { answer: "AI is currently unavailable for this workspace." };
    if (!res.ok || !res.body) throw new Error(`AI request failed (${res.status})`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload) as { type?: string; delta?: string };
          if (ev.type === "response.output_text.delta" && ev.delta) text += ev.delta;
        } catch {
          /* ignore partial */
        }
      }
    }
    return { answer: text.trim() || "No answer generated." };
  });
