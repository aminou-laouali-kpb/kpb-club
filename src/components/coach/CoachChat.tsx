import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useAiStream } from "@/hooks/useAiStream";

type Message = { role: "user" | "assistant"; content: string; sources?: string[]; error?: boolean };

const SUGGESTIONS = [
  "Quels documents dois-je faire traduire ?",
  "Comment choisir mes recommandateurs ?",
  "Que faire si ma date limite est dans 10 jours ?",
];

export function CoachChat() {
  const { run, streaming } = useAiStream();
  const queryClient = useQueryClient();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  const ask = async (question: string) => {
    if (!question.trim() || streaming) return;
    setInput("");
    setMessages((m) => [
      ...m,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);
    const update = (patch: Partial<Message>) =>
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { ...copy[copy.length - 1]!, ...patch };
        return copy;
      });
    let text = "";
    await run({ mode: "chat", threadId, message: question }, (event) => {
      if (event.type === "thread") setThreadId(event.threadId);
      else if (event.type === "text") {
        text += event.text;
        update({ content: text });
      } else if (event.type === "error") update({ content: event.message, error: true });
      else if (event.type === "done") {
        update({ sources: (event["sources"] as string[] | undefined) ?? [] });
        void queryClient.invalidateQueries({ queryKey: ["ai-overview"] });
      }
    });
  };

  return (
    <div className="space-y-4">
      {messages.length === 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Pose tes questions sur les bourses, l'éligibilité, les documents ou les étapes. Les
            réponses s'appuient sur le guide KPB et le catalogue des bourses.
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => void ask(s)}
                className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-secondary"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[90%] rounded-xl px-4 py-3 text-sm ${
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : m.error
                  ? "border border-destructive/40 bg-destructive/5"
                  : "bg-secondary/70"
            }`}
          >
            <p className="whitespace-pre-wrap">
              {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
            </p>
            {m.sources && m.sources.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Sources : {m.sources.join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          placeholder="Ta question…"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-base"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="inline-flex items-center rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-60"
          aria-label="Envoyer"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
