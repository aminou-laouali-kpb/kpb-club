import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mic, MicOff, Send } from "lucide-react";
import { finishInterview, startInterview } from "@/lib/ai.functions";
import { useAiStream } from "@/hooks/useAiStream";
import { useSpeechInput } from "@/hooks/useSpeechInput";
import type { InterviewDebrief } from "@/lib/ai/schemas";

type Turn = { question: string; answer: string; feedback: string };

export function InterviewSimulator({
  applications,
}: {
  applications: { id: string; bourseId: string; bourseName: string }[];
}) {
  const start = useServerFn(startInterview);
  const finish = useServerFn(finishInterview);
  const queryClient = useQueryClient();
  const { run, streaming } = useAiStream();

  const [choice, setChoice] = useState(applications[0]?.id ?? "");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [progress, setProgress] = useState({ position: 1, total: 0 });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [debrief, setDebrief] = useState<InterviewDebrief | null>(null);

  const speech = useSpeechInput(language, (text) => setAnswer((a) => (a ? `${a} ${text}` : text)));

  const startMutation = useMutation({
    mutationFn: () => {
      const app = applications.find((a) => a.id === choice);
      return start({
        data: { bourseId: app?.bourseId ?? null, applicationId: app?.id ?? null, language },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setThreadId(result.threadId);
      setQuestion(result.question);
      setProgress({ position: 1, total: result.total });
      setTurns([]);
      setDebrief(null);
      void queryClient.invalidateQueries({ queryKey: ["ai-overview"] });
    },
    onError: () => toast.error("Impossible de démarrer l'entretien."),
  });

  const finishMutation = useMutation({
    mutationFn: () => finish({ data: { threadId: threadId! } }),
    onSuccess: (result) => {
      if (!result.ok) toast.error(result.error);
      else setDebrief(result.debrief as InterviewDebrief);
    },
    onError: () => toast.error("Bilan indisponible pour le moment."),
  });

  const submit = async () => {
    if (!threadId || !question || !answer.trim()) return;
    speech.stop();
    const given = answer.trim();
    setFeedback("");
    let text = "";
    await run({ mode: "interview_answer", threadId, answer: given }, (event) => {
      if (event.type === "text") {
        text += event.text;
        setFeedback(text);
      } else if (event.type === "error") {
        toast.error(event.message);
      } else if (event.type === "done") {
        setTurns((t) => [...t, { question, answer: given, feedback: text }]);
        setFeedback("");
        setAnswer("");
        setQuestion((event["nextQuestion"] as string | null) ?? null);
        setProgress({
          position: Number(event["position"] ?? 1),
          total: Number(event["total"] ?? progress.total),
        });
      }
    });
  };

  if (!threadId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          6 à 8 questions comme celles d'un vrai jury, une par une. Réponds au clavier ou à voix
          haute : tu reçois un retour après chaque réponse, puis un bilan.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Bourse
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-base"
            >
              {applications.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.bourseName}
                </option>
              ))}
              <option value="">Entretien général</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Langue de l'entretien
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "fr" | "en")}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-base"
            >
              <option value="fr">Français</option>
              <option value="en">Anglais</option>
            </select>
          </label>
        </div>
        <button
          onClick={() => startMutation.mutate()}
          disabled={startMutation.isPending}
          className="rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-60"
        >
          {startMutation.isPending ? "Préparation des questions…" : "Commencer l'entretien"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {turns.map((t, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">{t.question}</p>
          <p className="text-muted-foreground">{t.answer}</p>
          <p className="whitespace-pre-wrap rounded-md bg-secondary/60 p-3">{t.feedback}</p>
        </div>
      ))}

      {question && !debrief && (
        <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            Question {progress.position} sur {progress.total}
          </p>
          <p className="font-display text-lg font-semibold">{question}</p>
          <textarea
            value={speech.listening && speech.interim ? `${answer} ${speech.interim}` : answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={5}
            disabled={streaming}
            placeholder="Ta réponse…"
            className="w-full rounded-md border border-input bg-background p-3 text-base"
          />
          <div className="flex flex-wrap gap-2">
            {speech.supported && (
              <button
                type="button"
                onClick={() => (speech.listening ? speech.stop() : speech.start())}
                disabled={streaming}
                className={`inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm ${
                  speech.listening ? "border-destructive text-destructive" : "border-border"
                }`}
              >
                {speech.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                {speech.listening ? "Arrêter la dictée" : "Répondre à voix haute"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={streaming || !answer.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              <Send className="size-4" /> {streaming ? "Analyse…" : "Envoyer ma réponse"}
            </button>
          </div>
          {feedback && (
            <p className="whitespace-pre-wrap rounded-md bg-background p-3 text-sm">{feedback}</p>
          )}
        </div>
      )}

      {!debrief && turns.length > 0 && (
        <button
          onClick={() => finishMutation.mutate()}
          disabled={finishMutation.isPending || streaming}
          className="rounded-md border border-border px-4 py-2.5 text-sm font-medium disabled:opacity-60"
        >
          {finishMutation.isPending
            ? "Bilan en cours…"
            : question
              ? "Terminer et voir le bilan"
              : "Voir le bilan"}
        </button>
      )}

      {debrief && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <p className="font-display text-3xl font-semibold">
            {debrief.score}
            <span className="text-lg text-muted-foreground">/100</span>
          </p>
          <p className="text-sm">{debrief.overall}</p>
          {debrief.strengths.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {debrief.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium">Tes 3 axes de travail</p>
            {debrief.focus_areas.map((f) => (
              <div key={f.area} className="rounded-md bg-secondary/60 p-3 text-sm">
                <p className="font-medium">{f.area}</p>
                <p className="text-muted-foreground">{f.advice}</p>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              setThreadId(null);
              setDebrief(null);
              setTurns([]);
            }}
            className="rounded-md border border-border px-4 py-2 text-sm"
          >
            Nouvel entretien
          </button>
        </div>
      )}
    </div>
  );
}
