import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Eye, FilePlus2, FileText, Trash2 } from "lucide-react";
import { deleteDocument, getDocumentUrl, listDocuments } from "@/lib/documents.functions";
import {
  DOCUMENT_TYPES,
  FREE_DOCUMENT_LIMIT,
  MEMBER_STORAGE_BYTES,
  documentTypeLabel,
  expiryState,
  formatBytes,
} from "@/lib/documents";
import { formatDateFr } from "@/lib/matching";
import { Progress } from "@/components/ui/progress";
import { UploadDialog, type UploadTarget } from "@/components/documents/UploadDialog";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Mes documents — KPB Education" },
      {
        name: "description",
        content: "Votre coffre-fort : pièces classées, réutilisées pour chaque candidature.",
      },
    ],
  }),
  component: Documents,
});

function Documents() {
  const fetchDocs = useServerFn(listDocuments);
  const fetchUrl = useServerFn(getDocumentUrl);
  const remove = useServerFn(deleteDocument);
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<UploadTarget | null>(null);

  const { data, isPending } = useQuery({ queryKey: ["documents"], queryFn: () => fetchDocs() });

  const view = useMutation({
    mutationFn: (id: string) => fetchUrl({ data: { id } }),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener"),
    onError: () => toast.error("Ouverture impossible"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Document supprimé");
      for (const key of ["documents", "application", "applications", "member-overview"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: () => toast.error("Suppression impossible"),
  });

  if (isPending || !data) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;

  const byType = DOCUMENT_TYPES.map((t) => ({
    ...t,
    docs: data.documents.filter((d) => d.type === t.value),
  })).filter((g) => g.docs.length > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Mes documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chaque pièce est enregistrée une fois et servira à toutes tes candidatures.
          </p>
        </div>
        <button
          onClick={() => setTarget({})}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          <FilePlus2 className="size-4" /> Ajouter un document
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        {data.hasAccess ? (
          <>
            <div className="flex justify-between">
              <span>Espace utilisé</span>
              <span className="text-muted-foreground">
                {formatBytes(data.usedBytes)} / {formatBytes(MEMBER_STORAGE_BYTES)}
              </span>
            </div>
            <Progress
              value={Math.min(100, (data.usedBytes / MEMBER_STORAGE_BYTES) * 100)}
              className="mt-2 h-2"
            />
          </>
        ) : (
          <p>
            {data.documents.length} / {FREE_DOCUMENT_LIMIT} documents avec le compte gratuit.{" "}
            <Link
              to="/offre"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Le Club offre 200 Mo
            </Link>
            .
          </p>
        )}
      </div>

      {data.missing.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-semibold">À fournir pour tes candidatures</h2>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-accent/50 bg-accent/5">
            {data.missing.map((m) => (
              <li key={m.itemId} className="flex items-center gap-3 p-4 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{m.label}</p>
                  <p className="text-muted-foreground">
                    {m.bourse}
                    {m.dueDate ? ` · avant le ${formatDateFr(m.dueDate)}` : ""}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setTarget({ type: m.documentType, label: m.label, itemId: m.itemId })
                  }
                  className="shrink-0 rounded-md border border-border bg-card px-3 py-2 text-sm"
                >
                  Ajouter
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-5">
        <h2 className="font-display text-xl font-semibold">Coffre-fort</h2>
        {byType.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Aucun document pour l'instant. Commence par ton passeport ou ton dernier relevé de
            notes.
          </p>
        )}
        {byType.map((group) => (
          <div key={group.value}>
            <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </h3>
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
              {group.docs.map((d) => {
                const expiry = expiryState(d.expires_at);
                return (
                  <li key={d.id} className="flex items-center gap-3 p-4 text-sm">
                    <FileText className="size-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{d.label}</p>
                      <p className="text-muted-foreground">
                        {documentTypeLabel(d.type)}
                        {d.pages ? ` · ${d.pages} page${d.pages > 1 ? "s" : ""}` : ""}
                        {d.size_bytes ? ` · ${formatBytes(d.size_bytes)}` : ""}
                      </p>
                      {(expiry === "soon" || expiry === "expired") && (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-destructive">
                          <AlertTriangle className="size-3.5" />
                          {expiry === "expired" ? "Expiré le " : "Expire bientôt : "}
                          {formatDateFr(d.expires_at)}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => view.mutate(d.id)}
                      className="rounded-md p-2 hover:bg-secondary"
                      aria-label="Voir le document"
                    >
                      <Eye className="size-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `Supprimer « ${d.label} » ? Il sera retiré de tes candidatures.`,
                          )
                        ) {
                          removeMutation.mutate(d.id);
                        }
                      }}
                      className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-destructive"
                      aria-label="Supprimer le document"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <UploadDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        target={target}
      />
    </div>
  );
}
