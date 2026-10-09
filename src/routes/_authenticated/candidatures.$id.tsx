import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  ChevronDown,
  ExternalLink,
  MessageCircle,
  PlayCircle,
  Trash2,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  deleteApplication,
  getApplication,
  updateApplication,
  updateItemStatus,
} from "@/lib/applications.functions";
import {
  STATUS_LABELS,
  daysUntil,
  deadlineLabel,
  groupItemsByKind,
  type ApplicationStatus,
  type ItemStatus,
} from "@/lib/applications";
import { countryName } from "@/lib/countries";
import { formatDateFr } from "@/lib/matching";
import { ACCOMPANIMENT_CONTACT_URL } from "@/lib/contact";
import { EssayEditor } from "@/components/application/EssayEditor";

export const Route = createFileRoute("/_authenticated/candidatures/$id")({
  head: () => ({
    meta: [{ title: "Ma candidature — KPB Education" }, { name: "robots", content: "noindex" }],
  }),
  component: ApplicationPage,
});

const STATUS_CHOICES: { value: ApplicationStatus; label: string }[] = [
  { value: "preparing", label: "En préparation" },
  { value: "submitted", label: STATUS_LABELS.submitted },
  { value: "interview", label: STATUS_LABELS.interview },
  { value: "accepted", label: STATUS_LABELS.accepted },
  { value: "rejected", label: STATUS_LABELS.rejected },
  { value: "abandoned", label: STATUS_LABELS.abandoned },
];

type Step = { label: string; date?: string | null };

function ApplicationPage() {
  const { id } = Route.useParams();
  const fetchApp = useServerFn(getApplication);
  const setItemStatus = useServerFn(updateItemStatus);
  const update = useServerFn(updateApplication);
  const remove = useServerFn(deleteApplication);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [openEssay, setOpenEssay] = useState<string | null>(null);

  const queryKey = ["application", id];
  const { data, isPending, isError } = useQuery({
    queryKey,
    queryFn: () => fetchApp({ data: { id } }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ["applications"] });
    void queryClient.invalidateQueries({ queryKey: ["member-overview"] });
  };

  const itemMutation = useMutation({
    mutationFn: (vars: { itemId: string; status: ItemStatus }) => setItemStatus({ data: vars }),
    onMutate: async (vars) => {
      // Mise à jour immédiate de la case, avant la réponse du serveur
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<typeof data>(queryKey);
      queryClient.setQueryData<typeof data>(queryKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((i) =>
                i.id === vars.itemId ? { ...i, status: vars.status } : i,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
      toast.error("Modification non enregistrée. Vérifie ta connexion.");
    },
    onSettled: refresh,
  });

  const statusMutation = useMutation({
    mutationFn: (status: ApplicationStatus) => update({ data: { id, status } }),
    onSuccess: (result) => {
      if (!result.ok) toast.error(result.error);
      refresh();
    },
    onError: () => toast.error("Modification impossible"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Candidature retirée");
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      void queryClient.invalidateQueries({ queryKey: ["member-overview"] });
      navigate({ to: "/candidatures" });
    },
    onError: () => toast.error("Suppression impossible"),
  });

  if (isPending) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;
  if (isError || !data)
    return (
      <div className="py-10 text-sm text-muted-foreground">
        Candidature introuvable.{" "}
        <Link to="/candidatures" className="text-primary underline">
          Retour à mes candidatures
        </Link>
      </div>
    );

  const { application: app, items, bourse, hasAccess } = data;
  const readiness = app.readiness;
  const days = daysUntil(app.deadline);
  const groups = groupItemsByKind(items);
  const steps = (Array.isArray(bourse?.operations_order) ? bourse.operations_order : []) as Step[];
  const showCoachingCta = readiness < 50 && days !== null && days >= 0 && days < 30;

  const scrollToItem = (itemId: string | null) => {
    if (!itemId) return;
    document
      .getElementById(`item-${itemId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    const target = items.find((i) => i.id === itemId);
    if (target?.kind === "essay") setOpenEssay(itemId);
  };

  return (
    <div className="space-y-8">
      <Link
        to="/candidatures"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Mes candidatures
      </Link>

      <header className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold sm:text-3xl">
              {bourse?.university_name ?? "Bourse"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {countryName(bourse?.country)} · date limite {formatDateFr(app.deadline)}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${
              days !== null && days >= 0 && days <= 14
                ? "bg-destructive/10 text-destructive"
                : "bg-secondary"
            }`}
          >
            <CalendarClock className="size-4" /> {deadlineLabel(app.deadline)}
          </span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Progress value={readiness} className="h-3 flex-1" aria-label="Préparation" />
          <span className="w-12 text-right font-display text-lg font-semibold">{readiness}%</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="app-status" className="text-muted-foreground">
            Statut
          </label>
          <select
            id="app-status"
            value={
              ["targeting", "preparing", "ready"].includes(app.status) ? "preparing" : app.status
            }
            onChange={(e) => statusMutation.mutate(e.target.value as ApplicationStatus)}
            disabled={statusMutation.isPending}
            className="rounded-md border border-input bg-background px-2 py-1.5"
          >
            {STATUS_CHOICES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.value === "preparing" && ["targeting", "ready"].includes(app.status)
                  ? STATUS_LABELS[app.status as ApplicationStatus]
                  : s.label}
              </option>
            ))}
          </select>
          {bourse?.program_url && (
            <a
              href={bourse.program_url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              Site officiel <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      </header>

      {app.next_action && (
        <section className="rounded-xl border border-primary/40 bg-primary/5 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            À faire maintenant
          </p>
          <p className="mt-1 font-display text-xl font-semibold">{app.next_action}</p>
          {app.next_item_id && (
            <button
              onClick={() => scrollToItem(app.next_item_id)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              J'y vais <ArrowRight className="size-4" />
            </button>
          )}
        </section>
      )}

      <section className="space-y-6">
        <h2 className="font-display text-xl font-semibold">Checklist</h2>
        {groups.map((group) => (
          <div key={group.kind}>
            <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </h3>
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
              {group.items.map((item) => {
                const itemDays = daysUntil(item.due_date);
                const late = itemDays !== null && itemDays < 0 && item.status !== "done";
                const isNa = item.status === "na";
                return (
                  <li key={item.id} id={`item-${item.id}`} className="p-4">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={item.status === "done"}
                        disabled={isNa}
                        onChange={(e) =>
                          itemMutation.mutate({
                            itemId: item.id,
                            status: e.target.checked ? "done" : "todo",
                          })
                        }
                        className="mt-1 size-5 shrink-0 accent-primary"
                        aria-label={`Marquer « ${item.label} » comme fait`}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`font-medium ${item.status === "done" || isNa ? "text-muted-foreground line-through" : ""}`}
                        >
                          {item.label}
                          {item.status === "in_progress" && (
                            <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-normal no-underline">
                              en cours
                            </span>
                          )}
                        </p>
                        {item.description && !isNa && (
                          <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
                        )}
                        {item.due_date && !isNa && (
                          <p
                            className={`mt-1 text-xs ${late ? "font-medium text-destructive" : "text-muted-foreground"}`}
                          >
                            {late ? "En retard — prévu le " : "À préparer pour le "}
                            {formatDateFr(item.due_date)}
                          </p>
                        )}
                        {item.kind === "essay" && !isNa && (
                          <button
                            onClick={() => setOpenEssay(openEssay === item.id ? null : item.id)}
                            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary"
                          >
                            {openEssay === item.id ? "Fermer l'éditeur" : "Rédiger"}
                            <ChevronDown
                              className={`size-4 transition-transform ${openEssay === item.id ? "rotate-180" : ""}`}
                            />
                          </button>
                        )}
                        {item.kind === "essay" && openEssay === item.id && (
                          <EssayEditor item={item} />
                        )}
                      </div>
                      <button
                        onClick={() =>
                          itemMutation.mutate({ itemId: item.id, status: isNa ? "todo" : "na" })
                        }
                        className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
                        title={isNa ? "Remettre dans la liste" : "Ne s'applique pas à moi"}
                      >
                        {isNa ? "Rétablir" : "Non applicable"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      {steps.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-semibold">Étapes de la sélection</h2>
          <ol className="mt-3 space-y-3 border-l-2 border-border pl-5">
            {steps.map((step, index) => (
              <li key={`${step.label}-${index}`} className="relative">
                <span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-primary bg-background" />
                <p className="font-medium">{step.label}</p>
                {step.date && (
                  <p className="text-sm text-muted-foreground">{formatDateFr(step.date)}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        {bourse?.whatsapp_group_url ? (
          <a
            href={bourse.whatsapp_group_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:bg-secondary"
          >
            <MessageCircle className="size-5 text-primary" />
            <span className="font-medium">Groupe WhatsApp des candidats</span>
          </a>
        ) : (
          !hasAccess && (
            <Link
              to="/offre"
              className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground hover:bg-secondary"
            >
              <MessageCircle className="size-5" />
              Le groupe WhatsApp de cette bourse est réservé aux membres du Club.
            </Link>
          )
        )}
        {bourse?.video_url && (
          <a
            href={bourse.video_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:bg-secondary"
          >
            <PlayCircle className="size-5 text-primary" />
            <span className="font-medium">L'université décortiquée en vidéo</span>
          </a>
        )}
      </section>

      {showCoachingCta && (
        <section className="rounded-xl border border-accent/50 bg-accent/10 p-5">
          <h2 className="font-display text-lg font-semibold">
            Moins d'un mois, et encore beaucoup à faire
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Un conseiller KPB peut reprendre ton dossier avec toi et prioriser ce qui compte
            vraiment.
          </p>
          <a
            href={ACCOMPANIMENT_CONTACT_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Parler à un conseiller
          </a>
        </section>
      )}

      <button
        onClick={() => {
          if (window.confirm("Retirer cette candidature et sa checklist ?"))
            deleteMutation.mutate();
        }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" /> Retirer cette candidature
      </button>
    </div>
  );
}
