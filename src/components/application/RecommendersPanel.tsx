import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Mail, MessageCircle, Trash2, Upload, UserPlus } from "lucide-react";
import {
  createRecommender,
  deleteRecommender,
  listRecommenders,
  markRequested,
  updateRecommender,
} from "@/lib/recommenders.functions";
import {
  RECOMMENDER_STATUS_LABELS,
  buildRequestMessage,
  mailtoLink,
  whatsappLink,
  type RecommenderStatus,
} from "@/lib/recommenders";
import { formatDateFr } from "@/lib/matching";
import type { UploadTarget } from "@/components/documents/UploadDialog";

type Props = {
  applicationId: string;
  studentName: string;
  bourseName: string;
  deadline: string | null;
  required: number;
  onUpload: (target: UploadTarget) => void;
};

const emptyForm = {
  full_name: "",
  title: "",
  institution: "",
  email: "",
  phone: "",
  relation: "",
  strengths: "",
};

export function RecommendersPanel(props: Props) {
  const { applicationId } = props;
  const list = useServerFn(listRecommenders);
  const create = useServerFn(createRecommender);
  const update = useServerFn(updateRecommender);
  const remove = useServerFn(deleteRecommender);
  const requested = useServerFn(markRequested);
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [openId, setOpenId] = useState<string | null>(null);
  const [autoRemind, setAutoRemind] = useState(true);

  const queryKey = ["recommenders", applicationId];
  const { data: recommenders = [] } = useQuery({
    queryKey,
    queryFn: () => list({ data: { applicationId } }),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
  };

  const createMutation = useMutation({
    mutationFn: () => create({ data: { applicationId, ...form } }),
    onSuccess: ({ id }) => {
      setForm(emptyForm);
      setAdding(false);
      setOpenId(id);
      refresh();
    },
    onError: () => toast.error("Vérifie les informations (email valide, nom obligatoire)."),
  });
  const requestedMutation = useMutation({
    mutationFn: (id: string) => requested({ data: { id, autoRemind } }),
    onSuccess: () => {
      toast.success("Demande notée. On s'occupe du suivi.");
      refresh();
    },
  });
  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: RecommenderStatus }) => update({ data: vars }),
    onSuccess: refresh,
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: refresh,
  });

  const received = recommenders.filter((r) => r.status === "received").length;
  const field = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base";

  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-muted-foreground">
        {received} / {props.required} lettre{props.required > 1 ? "s" : ""} reçue
        {received > 1 ? "s" : ""}.
      </p>

      <ul className="space-y-2">
        {recommenders.map((r) => {
          const message = buildRequestMessage({
            studentName: props.studentName,
            recommender: r,
            bourseName: props.bourseName,
            deadline: props.deadline,
            strengths: r.strengths,
          });
          const open = openId === r.id;
          return (
            <li key={r.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="font-medium">
                    {r.title ? `${r.title} ` : ""}
                    {r.full_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {[r.relation, r.institution].filter(Boolean).join(" · ") || "—"}
                  </p>
                </button>
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs">
                  {RECOMMENDER_STATUS_LABELS[r.status as RecommenderStatus]}
                </span>
              </div>
              {r.requested_at && r.status !== "received" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Demande du {formatDateFr(r.requested_at)}
                  {r.reminded_at ? ` · relancé le ${formatDateFr(r.reminded_at)}` : ""}
                </p>
              )}

              {open && (
                <div className="mt-3 space-y-3 border-t border-border pt-3">
                  {(r.status === "to_contact" ||
                    r.status === "requested" ||
                    r.status === "reminded") && (
                    <>
                      <p className="text-sm font-medium">Envoyer la demande</p>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={whatsappLink(r.phone, message.body)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => requestedMutation.mutate(r.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm"
                        >
                          <MessageCircle className="size-4" /> WhatsApp
                        </a>
                        {r.email && (
                          <a
                            href={mailtoLink(r.email, message.subject, message.body)}
                            onClick={() => requestedMutation.mutate(r.id)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm"
                          >
                            <Mail className="size-4" /> Email
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(
                                `${message.subject}\n\n${message.body}`,
                              );
                              toast.success("Message copié");
                              requestedMutation.mutate(r.id);
                            } catch {
                              toast.error("Copie impossible");
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm"
                        >
                          <Copy className="size-4" /> Copier le message
                        </button>
                      </div>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={autoRemind}
                          onChange={(e) => setAutoRemind(e.target.checked)}
                        />
                        <span>
                          Sans réponse après 7 jours, KPB envoie une relance courtoise
                          {r.email
                            ? " par email à ce professeur"
                            : " (on te préviendra pour relancer toi-même)"}
                          .
                        </span>
                      </label>
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground">
                          Voir le message
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap rounded-md bg-secondary/60 p-3 font-sans text-sm">
                          {message.body}
                        </pre>
                      </details>
                    </>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {r.status !== "received" && (
                      <button
                        type="button"
                        onClick={() =>
                          props.onUpload({
                            type: "recommendation_letter",
                            label: `Recommandation — ${r.full_name}`,
                            recommenderId: r.id,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                      >
                        <Upload className="size-4" /> Lettre reçue
                      </button>
                    )}
                    {r.status !== "declined" && r.status !== "received" && (
                      <button
                        type="button"
                        onClick={() => statusMutation.mutate({ id: r.id, status: "declined" })}
                        className="rounded-md border border-border px-3 py-2 text-sm"
                      >
                        A décliné
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Retirer ${r.full_name} ?`)) removeMutation.mutate(r.id);
                      }}
                      className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-2 text-sm text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" /> Retirer
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <form
          className="space-y-3 rounded-lg border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Nom complet *
              <input
                required
                maxLength={120}
                className={field}
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Titre (Pr., Dr., M., Mme)
              <input
                maxLength={60}
                className={field}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Établissement
              <input
                maxLength={160}
                className={field}
                value={form.institution}
                onChange={(e) => setForm({ ...form, institution: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Lien avec toi
              <input
                maxLength={120}
                className={field}
                placeholder="ex. Directeur de mémoire"
                value={form.relation}
                onChange={(e) => setForm({ ...form, relation: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Email
              <input
                type="email"
                maxLength={160}
                className={field}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="text-sm">
              WhatsApp
              <input
                type="tel"
                maxLength={24}
                className={field}
                placeholder="+227…"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
          </div>
          <label className="block text-sm">
            Ce qu'il ou elle peut souligner sur toi (une idée par ligne)
            <textarea
              rows={3}
              maxLength={1500}
              className={field}
              value={form.strengths}
              onChange={(e) => setForm({ ...form, strengths: e.target.value })}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              Ajouter
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-md border border-border px-4 py-2 text-sm"
            >
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"
        >
          <UserPlus className="size-4" /> Ajouter un recommandateur
        </button>
      )}
    </div>
  );
}
