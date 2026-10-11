import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useMemberOverview } from "@/hooks/useMemberOverview";
import { saveProfile } from "@/lib/member.functions";
import { WhatsAppLink } from "@/components/auth/WhatsAppLink";
import { DeleteAccount } from "@/components/DeleteAccount";
import { getReceipt } from "@/lib/payments.functions";
import { TIMEZONE_OPTIONS } from "@/lib/relance/window";
import { Download } from "lucide-react";
import { formatFcfa } from "@/lib/pricing";
import { formatDateFr } from "@/lib/matching";
import { COUNTRIES, EDUCATION_OPTIONS, ENGLISH_OPTIONS, GENDER_OPTIONS } from "@/lib/countries";

export const Route = createFileRoute("/_authenticated/compte")({
  head: () => ({
    meta: [
      { title: "Mon compte — KPB Education" },
      { name: "description", content: "Mettez à jour votre profil et consultez vos paiements." },
      { property: "og:title", content: "Mon compte — KPB Education" },
      { property: "og:description", content: "Profil, abonnement et historique de paiements." },
    ],
  }),
  component: Compte,
});

const inputCls =
  "mt-1 w-full rounded-md border border-input bg-card px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring";

const PAYMENT_STATUS: Record<string, string> = {
  pending: "En attente",
  failed: "Non abouti",
  refunded: "Remboursé",
};

type Form = {
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
  whatsapp_optin: boolean;
  email_optin: boolean;
  notif_email: boolean;
  notif_whatsapp_alerts: boolean;
  notif_whatsapp_reminders: boolean;
  notif_whatsapp_content: boolean;
  timezone: string;
};

function Compte() {
  const { data, isPending } = useMemberOverview();
  const queryClient = useQueryClient();
  const save = useServerFn(saveProfile);
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    if (!data || form) return;
    const p = data.profile;
    setForm({
      full_name: p.full_name ?? "",
      phone: p.phone ?? "",
      date_of_birth: p.date_of_birth ?? "",
      gender: p.gender ?? "",
      nationality: p.nationality ?? "",
      residence: p.residence ?? "",
      education: p.education ?? "",
      field_of_study: p.field_of_study ?? "",
      english_level: p.english_level ?? "",
      financial_need: p.financial_need ?? false,
      whatsapp_optin: p.whatsapp_optin ?? false,
      email_optin: p.email_optin ?? true,
      notif_email: p.notif_email ?? true,
      notif_whatsapp_alerts: p.notif_whatsapp_alerts ?? true,
      notif_whatsapp_reminders: p.notif_whatsapp_reminders ?? true,
      notif_whatsapp_content: p.notif_whatsapp_content ?? true,
      timezone: p.timezone ?? "Africa/Niamey",
    });
  }, [data, form]);

  const receipt = useServerFn(getReceipt);
  const receiptMutation = useMutation({
    mutationFn: (paymentId: string) => receipt({ data: { paymentId } }),
    onSuccess: ({ fileName, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    onError: () => toast.error("Reçu indisponible"),
  });

  const mutation = useMutation({
    mutationFn: (values: Form) =>
      save({
        data: {
          full_name: values.full_name.trim(),
          phone: values.phone.trim() || null,
          date_of_birth: values.date_of_birth || null,
          gender: (values.gender || null) as "M" | "F" | "other" | null,
          nationality: values.nationality || null,
          residence: values.residence || null,
          education: (values.education || null) as never,
          field_of_study: values.field_of_study.trim() || null,
          english_level: (values.english_level || null) as never,
          financial_need: values.financial_need,
          whatsapp_optin: values.whatsapp_optin,
          email_optin: values.email_optin,
          notif_email: values.notif_email,
          notif_whatsapp_alerts: values.notif_whatsapp_alerts,
          notif_whatsapp_reminders: values.notif_whatsapp_reminders,
          notif_whatsapp_content: values.notif_whatsapp_content,
          timezone: values.timezone,
        },
      }),
    onSuccess: () => {
      toast.success("Profil enregistré.");
      queryClient.invalidateQueries({ queryKey: ["member-overview"] });
    },
    onError: () => toast.error("Enregistrement impossible. Réessayez."),
  });

  if (isPending || !data || !form)
    return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Mon compte</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Membre {data.profile.member_code ?? "—"} · crédit{" "}
          {formatFcfa(data.profile.credit_balance ?? 0)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to="/documents"
            className="inline-flex rounded-md border border-border px-3 py-2 text-sm"
          >
            Mes documents
          </Link>
          <Link
            to="/parrainage"
            className="inline-flex rounded-md border border-border px-3 py-2 text-sm"
          >
            Parrainage
          </Link>
          <Link
            to="/accompagnement"
            className="inline-flex rounded-md border border-border px-3 py-2 text-sm"
          >
            Accompagnement
          </Link>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(form);
        }}
        className="space-y-4 rounded-xl border border-border bg-card p-5"
      >
        <h2 className="font-display text-xl font-semibold">Profil</h2>
        <div>
          <label className="text-sm font-medium" htmlFor="full_name">
            Nom complet
          </label>
          <input
            id="full_name"
            maxLength={120}
            className={inputCls}
            value={form.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium" htmlFor="phone">
              Téléphone
            </label>
            <input
              id="phone"
              maxLength={24}
              className={inputCls}
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
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
            <label className="text-sm font-medium" htmlFor="nat">
              Nationalité
            </label>
            <select
              id="nat"
              className={inputCls}
              value={form.nationality}
              onChange={(e) => set("nationality", e.target.value)}
            >
              <option value="">Choisir…</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="res">
              Résidence
            </label>
            <select
              id="res"
              className={inputCls}
              value={form.residence}
              onChange={(e) => set("residence", e.target.value)}
            >
              <option value="">Choisir…</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="edu">
              Dernier diplôme
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
        </div>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="size-4"
            checked={form.financial_need}
            onChange={(e) => set("financial_need", e.target.checked)}
          />
          <span className="text-sm">J'ai besoin d'un financement</span>
        </label>
        <div>
          <label className="text-sm font-medium" htmlFor="timezone">
            Fuseau horaire (nos messages arrivent entre 8 h et 20 h)
          </label>
          <select
            id="timezone"
            className={inputCls}
            value={form.timezone}
            onChange={(e) => set("timezone", e.target.value)}
          >
            {(TIMEZONE_OPTIONS.includes(form.timezone)
              ? TIMEZONE_OPTIONS
              : [form.timezone, ...TIMEZONE_OPTIONS]
            ).map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/^.*\//, "").replace(/_/g, " ")} ({tz.split("/")[0]})
              </option>
            ))}
          </select>
        </div>
        <fieldset className="space-y-3 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-medium">Mes notifications</legend>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sur WhatsApp
          </p>
          {(
            [
              ["Rappels (échéances, abonnement, paiements)", "notif_whatsapp_reminders"],
              ["Alertes de nouvelles bourses", "notif_whatsapp_alerts"],
              ["Nouveaux contenus (bulletin, vidéos)", "notif_whatsapp_content"],
            ] as const
          ).map(([label, key]) => (
            <label key={key} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={form.whatsapp_optin && form[key]}
                disabled={!data.profile.phone_verified_at}
                onChange={(e) => {
                  set(key, e.target.checked);
                  if (e.target.checked) set("whatsapp_optin", true);
                }}
              />
              {label}
            </label>
          ))}
          <p className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Par email
          </p>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={form.email_optin && form.notif_email}
              disabled={!data.profile.email}
              onChange={(e) => {
                set("notif_email", e.target.checked);
                set("email_optin", e.target.checked);
              }}
            />
            {data.profile.email
              ? `Recevoir aussi mes messages à ${data.profile.email}`
              : "Aucune adresse email sur ce compte"}
          </label>
          <p className="text-xs text-muted-foreground">
            {!data.profile.phone_verified_at
              ? "Relie ton WhatsApp ci-dessous pour recevoir tes rappels dessus. "
              : ""}
            Les rappels importants (échéance, fin d'abonnement) continuent par email si tu coupes
            WhatsApp : tu ne perds jamais le fil sans le savoir.
          </p>
        </fieldset>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground disabled:opacity-60"
        >
          {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 font-display text-xl font-semibold">Mon WhatsApp</h2>
        <WhatsAppLink
          verifiedPhone={data.profile.phone_verified_at ? data.profile.phone_e164 : null}
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl font-semibold">Paiements</h2>
        {data.payments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Aucun paiement enregistré.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {data.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5">
                <span>
                  {formatFcfa(p.amount)}
                  <span className="block text-xs text-muted-foreground">
                    {formatDateFr(p.created_at)}
                  </span>
                </span>
                {p.status === "success" ? (
                  <button
                    onClick={() => receiptMutation.mutate(p.id)}
                    disabled={receiptMutation.isPending}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                  >
                    <Download className="size-3.5" /> Reçu
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {PAYMENT_STATUS[p.status] ?? p.status}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <DeleteAccount />
    </div>
  );
}
