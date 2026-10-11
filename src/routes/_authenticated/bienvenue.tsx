import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { useMemberOverview, hasAccess } from "@/hooks/useMemberOverview";
import { saveProfile } from "@/lib/member.functions";
import { completeOnboarding } from "@/lib/applications.functions";
import { COUNTRIES, EDUCATION_OPTIONS, ENGLISH_OPTIONS, GENDER_OPTIONS } from "@/lib/countries";
import { formatDateFr } from "@/lib/matching";
import { countryName } from "@/lib/countries";

export const Route = createFileRoute("/_authenticated/bienvenue")({
  head: () => ({
    meta: [{ title: "Bienvenue — KPB Education" }, { name: "robots", content: "noindex" }],
  }),
  component: Onboarding,
});

const inputCls =
  "mt-1 w-full rounded-md border border-input bg-card px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring";

type ProfileForm = {
  full_name: string;
  date_of_birth: string;
  gender: string;
  nationality: string;
  education: string;
  english_level: string;
  financial_need: boolean;
};

const STEPS = ["Ton profil", "Tes bourses", "Tes alertes"];

function Onboarding() {
  const { data } = useMemberOverview();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const save = useServerFn(saveProfile);
  const complete = useServerFn(completeOnboarding);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [whatsapp, setWhatsapp] = useState(true);

  useEffect(() => {
    if (!data || form) return;
    const p = data.profile;
    setForm({
      full_name: p.full_name ?? "",
      date_of_birth: p.date_of_birth ?? "",
      gender: p.gender ?? "",
      nationality: p.nationality ?? "",
      education: p.education ?? "",
      english_level: p.english_level ?? "",
      financial_need: p.financial_need ?? true,
    });
    setWhatsapp(p.whatsapp_optin ?? true);
  }, [data, form]);

  const member = hasAccess(data?.subscriptionState);
  const maxChoices = member ? 3 : 1;

  const profileMutation = useMutation({
    mutationFn: (values: ProfileForm) =>
      save({
        data: {
          full_name: values.full_name.trim(),
          date_of_birth: values.date_of_birth || null,
          gender: (values.gender || null) as "M" | "F" | "other" | null,
          nationality: values.nationality || null,
          education: (values.education || null) as never,
          english_level: (values.english_level || null) as never,
          financial_need: values.financial_need,
        },
      }),
    onSuccess: async () => {
      // Les bourses compatibles dépendent du profil : on les recalcule avant l'étape 2
      await queryClient.invalidateQueries({ queryKey: ["member-overview"] });
      setStep(1);
    },
    onError: () => toast.error("Enregistrement impossible. Réessayez."),
  });

  const finishMutation = useMutation({
    mutationFn: (bourseIds: string[]) =>
      complete({ data: { bourseIds, whatsapp_optin: whatsapp } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["member-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      const first = result.applicationIds[0];
      if (first) navigate({ to: "/candidatures/$id", params: { id: first } });
      else navigate({ to: "/dashboard" });
    },
    onError: () => toast.error("Impossible de terminer. Réessayez."),
  });

  if (!data || !form) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;

  const set = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const toggle = (id: string) =>
    setSelected((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : maxChoices === 1
          ? [id]
          : cur.length < maxChoices
            ? [...cur, id]
            : cur,
    );

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Bienvenue sur KPB</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Trois étapes pour obtenir ta première checklist de candidature.
        </p>
      </div>

      <ol className="flex gap-2" aria-label="Progression">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`flex-1 rounded-full py-1 text-center text-xs font-medium ${
              i <= step
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <form
          className="space-y-4 rounded-xl border border-border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            profileMutation.mutate(form);
          }}
        >
          <p className="text-sm text-muted-foreground">
            Vérifie ces informations : elles déterminent les bourses auxquelles tu as droit.
          </p>
          <div>
            <label className="text-sm font-medium" htmlFor="ob-name">
              Nom complet
            </label>
            <input
              id="ob-name"
              required
              maxLength={120}
              className={inputCls}
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium" htmlFor="ob-nat">
                Nationalité
              </label>
              <select
                id="ob-nat"
                className={inputCls}
                value={form.nationality}
                onChange={(e) => set("nationality", e.target.value)}
              >
                <option value="">—</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="ob-dob">
                Date de naissance
              </label>
              <input
                id="ob-dob"
                type="date"
                className={inputCls}
                value={form.date_of_birth}
                onChange={(e) => set("date_of_birth", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="ob-gender">
                Genre
              </label>
              <select
                id="ob-gender"
                className={inputCls}
                value={form.gender}
                onChange={(e) => set("gender", e.target.value)}
              >
                <option value="">—</option>
                {GENDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="ob-edu">
                Dernier diplôme
              </label>
              <select
                id="ob-edu"
                className={inputCls}
                value={form.education}
                onChange={(e) => set("education", e.target.value)}
              >
                <option value="">—</option>
                {EDUCATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="ob-en">
                Niveau d'anglais
              </label>
              <select
                id="ob-en"
                className={inputCls}
                value={form.english_level}
                onChange={(e) => set("english_level", e.target.value)}
              >
                <option value="">—</option>
                {ENGLISH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.financial_need}
              onChange={(e) => set("financial_need", e.target.checked)}
            />
            J'ai besoin d'un financement pour étudier
          </label>
          <button
            type="submit"
            disabled={profileMutation.isPending}
            className="w-full rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-60"
          >
            {profileMutation.isPending ? "Enregistrement…" : "Continuer"}
          </button>
        </form>
      )}

      {step === 1 && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            {data.matches.length > 0
              ? `Choisis ${maxChoices === 1 ? "la bourse" : `jusqu'à ${maxChoices} bourses`} que tu veux préparer.${member ? "" : " Le compte gratuit permet d'en suivre une ; le Club en débloque autant que tu veux."}`
              : "Aucune bourse ouverte ne correspond à ton profil aujourd'hui. Tu pourras en ajouter depuis le catalogue."}
          </p>
          <ul className="space-y-2">
            {data.matches.map((b) => {
              const on = selected.includes(b.id);
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => toggle(b.id)}
                    aria-pressed={on}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      on ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                        on ? "border-primary bg-primary text-primary-foreground" : "border-input"
                      }`}
                    >
                      {on && <Check className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{b.university_name}</span>
                      <span className="block text-sm text-muted-foreground">
                        {countryName(b.country)} · date limite {formatDateFr(b.window_closes)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="rounded-md border border-border px-4 py-3 text-sm"
            >
              Retour
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex-1 rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground"
            >
              {selected.length > 0 ? "Continuer" : "Continuer sans choisir"}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            On te prévient sur WhatsApp quand une échéance approche ou qu'une bourse compatible
            ouvre. Tu pourras changer d'avis à tout moment dans ton compte.
          </p>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={whatsapp}
              onChange={(e) => setWhatsapp(e.target.checked)}
            />
            Recevoir mes rappels sur WhatsApp
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-md border border-border px-4 py-3 text-sm"
            >
              Retour
            </button>
            <button
              type="button"
              onClick={() => finishMutation.mutate(selected)}
              disabled={finishMutation.isPending}
              className="flex-1 rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-60"
            >
              {finishMutation.isPending ? "Préparation de ta checklist…" : "Terminer"}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => finishMutation.mutate([])}
        disabled={finishMutation.isPending}
        className="block w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Passer pour l'instant
      </button>
    </div>
  );
}
