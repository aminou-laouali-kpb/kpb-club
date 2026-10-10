import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, HelpCircle, Quote } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { CvReview, EssayReview } from "@/lib/ai/schemas";

function scoreTone(score: number) {
  if (score >= 75) return "text-primary";
  if (score >= 50) return "text-foreground";
  return "text-destructive";
}

function Quoted({ text }: { text: string }) {
  return (
    <blockquote className="mt-1 flex gap-2 rounded-md border-l-2 border-primary/50 bg-secondary/50 px-3 py-2 text-sm italic">
      <Quote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span>« {text} »</span>
    </blockquote>
  );
}

function ScoreHeader({ score, verdict }: { score: number; verdict: string }) {
  return (
    <div className="flex items-center gap-4">
      <p className={`font-display text-4xl font-semibold ${scoreTone(score)}`}>
        {score}
        <span className="text-lg text-muted-foreground">/100</span>
      </p>
      <p className="text-sm">{verdict}</p>
    </div>
  );
}

function CoachingCta({ score }: { score: number }) {
  if (score >= 60) return null;
  return (
    <div className="rounded-lg border border-accent/50 bg-accent/10 p-3 text-sm">
      Voilà ce qui manque, pas ce qu'il faut écrire : c'est à toi de jouer. Pour avancer plus vite
      avec un agent KPB,{" "}
      <Link
        to="/accompagnement"
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        découvre l'accompagnement
      </Link>
      .
    </div>
  );
}

export function EssayReviewResult({ review }: { review: EssayReview }) {
  return (
    <div className="space-y-5">
      <ScoreHeader score={review.overall_score} verdict={review.verdict} />

      <section className="space-y-3">
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Critères
        </h3>
        {review.criteria.map((c) => (
          <div key={c.name}>
            <div className="flex justify-between text-sm">
              <span className="font-medium">{c.name}</span>
              <span className={scoreTone(c.score * 10)}>{c.score}/10</span>
            </div>
            <Progress value={c.score * 10} className="mt-1 h-1.5" />
            <p className="mt-1 text-sm text-muted-foreground">{c.justification}</p>
          </div>
        ))}
      </section>

      {review.gaps.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Ce qui manque
          </h3>
          {review.gaps.map((g, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <p className="flex items-start gap-2 text-sm font-medium">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                {g.criterion} — {g.issue}
              </p>
              <Quoted text={g.quote} />
            </div>
          ))}
        </section>
      )}

      {review.strengths.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Ce qui fonctionne
          </h3>
          {review.strengths.map((s, i) => (
            <div key={i}>
              <p className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                {s.point}
              </p>
              <Quoted text={s.quote} />
            </div>
          ))}
        </section>
      )}

      {review.questions_to_ask.length > 0 && (
        <section>
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Questions à te poser
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {review.questions_to_ask.map((q, i) => (
              <li key={i} className="flex gap-2">
                <HelpCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {q}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(review.generic_signals.length > 0 || !review.length.ok || !review.language.ok) && (
        <section className="space-y-1 rounded-lg bg-secondary/60 p-3 text-sm">
          {!review.length.ok && (
            <p>
              Longueur : {review.length.words} mots
              {review.length.max_words ? ` pour ${review.length.max_words} autorisés` : ""}.
            </p>
          )}
          {!review.language.ok && (
            <p>
              Langue attendue : {review.language.expected}, langue détectée :{" "}
              {review.language.detected}.
            </p>
          )}
          {review.generic_signals.map((s, i) => (
            <p key={i}>Passage générique : {s}</p>
          ))}
        </section>
      )}

      <CoachingCta score={review.overall_score} />
    </div>
  );
}

export function CvReviewResult({ review }: { review: CvReview }) {
  return (
    <div className="space-y-5">
      <ScoreHeader score={review.overall_score} verdict={review.verdict} />
      {review.missing_sections.length > 0 && (
        <section>
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Sections manquantes
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {review.missing_sections.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}
      {review.date_issues.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Dates à vérifier
          </h3>
          {review.date_issues.map((d, i) => (
            <div key={i}>
              <p className="text-sm">{d.issue}</p>
              <Quoted text={d.quote} />
            </div>
          ))}
        </section>
      )}
      {review.weak_phrasings.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Formulations à retravailler
          </h3>
          {review.weak_phrasings.map((w, i) => (
            <div key={i}>
              <Quoted text={w.quote} />
              <p className="mt-1 text-sm text-muted-foreground">{w.why}</p>
            </div>
          ))}
        </section>
      )}
      {review.recommended_order.length > 0 && (
        <section>
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Ordre recommandé
          </h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {review.recommended_order.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      )}
      {review.next_steps.length > 0 && (
        <section>
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Prochaines étapes
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {review.next_steps.map((s) => (
              <li key={s} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}
      <CoachingCta score={review.overall_score} />
    </div>
  );
}
