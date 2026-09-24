import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircleQuestion, Loader2 } from "lucide-react";
import { askSpending } from "@/lib/ask-spending.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const SUGGESTIONS = [
  "How much did I spend on food last month?",
  "Which merchant costs me the most?",
  "Am I spending more than 3 months ago?",
  "Where can I cut back?",
];

export function AskSpending() {
  const ask = useServerFn(askSpending);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [asked, setAsked] = useState("");

  async function submit(question: string) {
    const text = question.trim();
    if (text.length < 2 || loading) return;
    setLoading(true);
    setAsked(text);
    setAnswer(null);
    try {
      const r = await ask({ data: { question: text } });
      setAnswer(r.answer);
    } catch (e) {
      setAnswer(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface-card space-y-4 p-5">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="size-4 text-primary" />
        <h2 className="font-semibold">Ask about your spending</h2>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. What did I spend on travel this year?"
          maxLength={500}
        />
        <Button type="submit" disabled={loading || q.trim().length < 2}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : "Ask"}
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setQ(s);
              submit(s);
            }}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
      {(loading || answer) && (
        <div className="rounded-lg bg-muted/40 p-4 text-sm">
          <p className="mb-2 text-xs text-muted-foreground">{asked}</p>
          {loading ? (
            <p className="text-muted-foreground">Thinking through your numbers…</p>
          ) : (
            <p className="whitespace-pre-wrap leading-relaxed">{answer}</p>
          )}
        </div>
      )}
    </div>
  );
}
