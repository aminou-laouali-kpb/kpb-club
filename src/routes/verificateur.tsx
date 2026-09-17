import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { listBourses } from "@/lib/bourses.functions";
import { matchBourses, formatDateFr, type EligibilityProfile } from "@/lib/matching";
import { COUNTRIES, EDUCATION_OPTIONS, ENGLISH_OPTIONS, GENDER_OPTIONS } from "@/lib/countries";
import { savePendingProfile } from "@/lib/pendingProfile";

const boursesQuery = queryOptions({
  queryKey: ["bourses"],
  queryFn: () => listBourses(),
});

export const Route = createFileRoute("/verificateur")({
  head: () => ({
    meta: [
      { title: "Vérificateur d'éligibilité — KPB Education" },
      {
        name: "description",
        content:
          "Répondez à quelques questions et découvrez immédiatement les bourses d'études pour lesquelles vous êtes éligible.",
      },
      { property: "og:title", content: "Vérificateur d'éligibilité — KPB Education" },
      {
        property: "og:description",
        content: "Découvrez en 5 minutes les bourses ouvertes qui correspondent à votre profil.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(boursesQuery),
  errorComponent: () => (
    <div className="p-8 text-center text-sm text-muted-foreground">
      Le vérificateur est momentanément indisponible. Réessayez dans un instant.
    </div>
  ),
  component: Verificateur,
});

type FormState = {
  full_name: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  nationality: string;
  residence: string;
  education: string;
  field_of_study: string;
  english_level: string;
  financial_need: boolean;
};

const EMPTY: FormState = {
  full_name: "",
  phone: "",
  date_of_birth: "",
  gender: "",
  nationality: "NE",
  residence: "NE",
  education: "",
  field_of_study: "",
  english_level: "",
  financial_need: true,
};

const inputCls =
  "mt-1 w-full rounded-md border border-input bg-card px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring";

function Verificateur() {
  const { data: bourses } = useSuspenseQuery(boursesQuery);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [result, setResult] = useState<EligibilityProfile | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canContinue =
    step === 0
      ? form.full_name.trim().length > 1 && form.date_of_birth !== "" && form.gender !== ""
      : step === 1
        ? form.nationality !== "" && form.residence !== ""
        : form.education !== "" && form.english_level !== "";

  function submit() {
    const profile: EligibilityProfile = {
      date_of_birth: form.date_of_birth,
      gender: form.gender,
      nationality: form.nationality,
      education: form.education,
      english_level: form.english_level,
      financial_need: form.financial_need,
    };
    savePendingProfile({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      nationality: form.nationality || null,
      residence: form.residence || null,
      education: form.education || null,
      field_of_study: form.field_of_study.trim() || null,
      english_level: form.english_level || null,
      financial_need: form.financial_need,
    });
    setResult(profile);
  }

  if (result) {
    const matches = matchBourses(result, bourses);
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="font-display text-3xl font-semibold">
            {matches.length > 0
              ? `${matches.length} bourse${matches.length > 1 ? "s" : ""} correspond${matches.length > 1 ? "ent" : ""} à votre profil`
              : "Aucune fenêtre ouverte pour l'instant"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {matches.length > 0
              ? "Ces fenêtres sont ouvertes ou ouvrent dans les 60 prochains jours."
              : "Les fenêtres changent chaque mois. Le Club vous prévient dès qu'une s'ouvre pour vous."}
          </p>

          <div className="mt-6 space-y-3">
            {matches.map((b) => (
              <div key={b.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <h2 className="font-display text-lg font-semibold">{b.university_name}</h2>
                    <p className="text-sm text-muted-foreground">
                      Date limite : {formatDateFr(b.window_closes)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-xl bg-primary p-6 text-primary-foreground">
            <h2 className="font-display text-xl font-semibold">
              Créez votre compte gratuit pour sauvegarder votre profil
            </h2>
            <p className="mt-2 text-sm text-primary-foreground/80">
              Vous recevrez vos bourses compatibles dans votre espace membre.
            </p>
            <Link
              to="/auth"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-accent px-5 py-3 font-medium text-accent-foreground"
            >
              Créer mon compte <ArrowRight className="size-4" />
            </Link>
          </div>

          <button
            onClick={() => {
              setResult(null);
              setStep(0);
            }}
            className="mt-6 text-sm text-muted-foreground underline underline-offset-4"
          >
            Modifier mes réponses
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-lg px-4 py-8">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Étape {step + 1} sur 3</p>

        {step === 0 && (
          <div className="mt-6 space-y-4">
            <h1 className="font-display text-2xl font-semibold">Qui êtes-vous ?</h1>
            <div>
              <label className="text-sm font-medium" htmlFor="name">
                Nom complet
              </label>
              <input
                id="name"
                className={inputCls}
                maxLength={120}
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="dob">
                Date de naissance
              </label>
              <input
                id="dob"
                type="date"
                className={inputCls}
                value={form.date_of_birth}
                onChange={(e) => set("date_of_birth", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="gender">
                Genre
              </label>
              <select
                id="gender"
                className={inputCls}
                value={form.gender}
                onChange={(e) => set("gender", e.target.value)}
              >
                <option value="">Choisir…</option>
                {GENDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="phone">
                Téléphone (WhatsApp)
              </label>
              <input
                id="phone"
                inputMode="tel"
                maxLength={24}
                placeholder="+227 ..."
                className={inputCls}
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="mt-6 space-y-4">
            <h1 className="font-display text-2xl font-semibold">D'où venez-vous ?</h1>
            <div>
              <label className="text-sm font-medium" htmlFor="nat">
                Nationalité
              </label>
              <select
                id="nat"
                className={inputCls}
                value={form.nationality}
                onChange={(e) => set("nationality", e.target.value)}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="res">
                Pays de résidence
              </label>
              <select
                id="res"
                className={inputCls}
                value={form.residence}
                onChange={(e) => set("residence", e.target.value)}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-6 space-y-4">
            <h1 className="font-display text-2xl font-semibold">Votre parcours</h1>
            <div>
              <label className="text-sm font-medium" htmlFor="edu">
                Dernier diplôme obtenu
              </label>
              <select
                id="edu"
                className={inputCls}
                value={form.education}
                onChange={(e) => set("education", e.target.value)}
              >
                <option value="">Choisir…</option>
                {EDUCATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="field">
                Domaine d'études
              </label>
              <input
                id="field"
                maxLength={120}
                className={inputCls}
                value={form.field_of_study}
                onChange={(e) => set("field_of_study", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="eng">
                Niveau d'anglais
              </label>
              <select
                id="eng"
                className={inputCls}
                value={form.english_level}
                onChange={(e) => set("english_level", e.target.value)}
              >
                <option value="">Choisir…</option>
                {ENGLISH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-3 rounded-md border border-input bg-card px-3 py-3">
              <input
                type="checkbox"
                className="size-4"
                checked={form.financial_need}
                onChange={(e) => set("financial_need", e.target.checked)}
              />
              <span className="text-sm">J'ai besoin d'un financement pour étudier</span>
            </label>
          </div>
        )}

        <div className="mt-8 flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-4 py-3 font-medium"
            >
              <ArrowLeft className="size-4" /> Retour
            </button>
          )}
          <button
            disabled={!canContinue}
            onClick={() => (step < 2 ? setStep(step + 1) : submit())}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground disabled:opacity-50"
          >
            {step < 2 ? "Continuer" : "Voir mes bourses"} <ArrowRight className="size-4" />
          </button>
        </div>
      </main>
    </div>
  );
}
