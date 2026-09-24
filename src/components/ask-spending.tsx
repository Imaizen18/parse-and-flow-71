import { useState } from "react";
import { MessageCircleQuestion, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTransactions, useCategories, useProfile } from "@/hooks/use-app-data";

export function AskSpending() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: txns } = useTransactions();
  const { data: categories } = useCategories();
  const { data: profile } = useProfile();

  async function askAI(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || !txns?.length) return;

    setLoading(true);
    setAnswer("");

    // Summarize the most recent data to keep the payload small and fast
    const currency = profile?.currency ?? "INR";
    const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));

    const summary = {
      currency,
      transaction_count: txns.length,
      recent: txns.slice(0, 50).map((t) => ({
        date: t.date,
        merchant: t.merchant_name || t.description,
        amount: t.amount,
        type: t.type,
        category: t.category_id ? catName.get(t.category_id) : "Uncategorized",
      })),
    };

    try {
      // Pulls the API key from your local .env file
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

      if (!apiKey) {
        setAnswer("Please add VITE_OPENAI_API_KEY to your .env file to enable AI insights.");
        setLoading(false);
        return;
      }

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini", // Fast, lightweight model for data queries
          messages: [
            {
              role: "system",
              content: `You are a financial analyst. Answer questions based on this JSON data: ${JSON.stringify(summary)}. Keep answers under 3 sentences. Be concrete, concise, and helpful.`
            },
            { role: "user", content: query }
          ]
        })
      });

      const data = await res.json();
      if (data.choices?.[0]?.message?.content) {
        setAnswer(data.choices[0].message.content);
      } else {
        setAnswer("I couldn't process that request right now.");
      }
    } catch (err) {
      setAnswer("An error occurred while contacting the AI.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface-card flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="size-4 text-primary" />
        <h2 className="font-semibold">Ask about your spending</h2>
      </div>

      <form onSubmit={askAI} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g., How much did I spend on food this month?"
          disabled={loading}
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>

      {answer && (
        <div className="mt-2 rounded-md bg-secondary/50 p-4 text-sm text-secondary-foreground leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
}