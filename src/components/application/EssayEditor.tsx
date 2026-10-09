import { useServerFn } from "@tanstack/react-start";
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
  const { text, onChange, state } = useAutosave({
    storageKey: `kpb:essay:${item.id}`,
    serverText: item.essay_draft,
    serverSavedAt: item.essay_draft_saved_at,
    save: (draft, savedAt) =>
      saveDraft({ data: { itemId: item.id, draft, clientSavedAt: savedAt } }),
  });
  const words = countWords(text);
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
    </div>
  );
}
