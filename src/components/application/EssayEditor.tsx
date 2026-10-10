import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { reviewEssay } from "@/lib/ai.functions";
import type { EssayReview } from "@/lib/ai/schemas";
import { EssayReviewResult } from "@/components/coach/ReviewResults";
import { AUTOSAVE_LABELS, useAutosave } from "@/hooks/useAutosave";
import { saveItemDraft } from "@/lib/applications.functions";
import { countWords } from "@/lib/applications";

export function EssayEditor({
  item,
}: {
  item: {
    id: string;
    essay_prompt: string | null;
    essay_max_words: number | null;
    essay_draft: string | null;
    essay_draft_saved_at: string | null;
  };
}) {
  const saveDraft = useServerFn(saveItemDraft);
  const { text, onChange, state, flush } = useAutosave({
    storageKey: `kpb:essay:${item.id}`,
    serverText: item.essay_draft,
    serverSavedAt: item.essay_draft_saved_at,
    save: (draft, savedAt) =>
      saveDraft({ data: { itemId: item.id, draft, clientSavedAt: savedAt } }),
  });
  const words = countWords(text);
  const review = useServerFn(reviewEssay);
  const queryClient = useQueryClient();
  const [result, setResult] = useState<EssayReview | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const analyse = useMutation({
    mutationFn: async () => {
      // On analyse la version affichée, même si l'autosave n'a pas encore eu lieu
      await flush();
      return review({ data: { itemId: item.id, text } });
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRefusal("refusal" in res && res.refusal ? res.refusal : null);
      setResult("review" in res && res.review ? res.review : null);
      void queryClient.invalidateQueries({ queryKey: ["ai-overview"] });
    },
    onError: () => toast.error("Le coach est momentanément indisponible."),
  });
  const over = item.essay_max_words != null && words > item.essay_max_words;

  return (
    <div className="mt-3 space-y-2">
      {item.essay_prompt && (
        <p className="rounded-md bg-secondary/60 p-3 text-sm">
          <span className="font-medium">Sujet : </span>
          {item.essay_prompt}
        </p>
      )}
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        maxLength={20_000}
        placeholder="Rédige ton essai ici. Il est enregistré automatiquement."
        className="w-full rounded-md border border-input bg-background p-3 text-base leading-relaxed"
        aria-label="Brouillon de l'essai"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={over ? "font-medium text-destructive" : "text-muted-foreground"}>
          {words} mot{words > 1 ? "s" : ""}
          {item.essay_max_words ? ` / ${item.essay_max_words} maximum` : ""}
        </span>
        <span
          className={
            state === "error" || state === "offline" ? "text-destructive" : "text-muted-foreground"
          }
          aria-live="polite"
        >
          {AUTOSAVE_LABELS[state]}
        </span>
      </div>
      <button
        type="button"
        onClick={() => analyse.mutate()}
        disabled={analyse.isPending || words < 80}
        className="inline-flex items-center gap-1.5 rounded-md border border-primary/50 px-4 py-2 text-sm font-medium text-primary disabled:opacity-50"
        title={words < 80 ? "80 mots minimum pour une analyse" : undefined}
      >
        <Sparkles className="size-4" />
        {analyse.isPending ? "Analyse en cours…" : "Faire analyser par le coach"}
      </button>
      {refusal && <p className="rounded-lg bg-secondary/60 p-3 text-sm">{refusal}</p>}
      {result && (
        <div className="rounded-xl border border-border bg-card p-4">
          <EssayReviewResult review={result} />
        </div>
      )}
    </div>
  );
}
