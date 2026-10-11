import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowUp, Camera, FileUp, Sparkles, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { confirmUpload, prepareUpload } from "@/lib/documents.functions";
import { DOCUMENT_TYPES, MAX_FILE_BYTES, typeExpires, type DocumentType } from "@/lib/documents";
import { photosToPdf, thumbnailBase64 } from "@/lib/image-to-pdf.browser";
import { suggestDocumentType } from "@/lib/ai.functions";

export type UploadTarget = {
  type?: string | null;
  label?: string;
  itemId?: string | null;
  recommenderId?: string | null;
};

type Mode = "photos" | "pdf";

export function UploadDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target?: UploadTarget | null;
}) {
  const prepare = useServerFn(prepareUpload);
  const confirm = useServerFn(confirmUpload);
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("photos");
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [pdf, setPdf] = useState<File | null>(null);
  const [type, setType] = useState<DocumentType>("other");
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [textMode, setTextMode] = useState(true);
  const [stage, setStage] = useState("");
  const suggest = useServerFn(suggestDocumentType);

  // Identification à la demande seulement : l'étudiant l'utilise pour un document scolaire,
  // jamais pour une pièce d'identité (rappelé à l'écran)
  const identify = useMutation({
    mutationFn: async () => {
      const first = photos[0]?.file;
      return suggest({
        data: {
          fileName: mode === "pdf" ? (pdf?.name ?? "document.pdf") : (first?.name ?? "photo.jpg"),
          imageBase64: mode === "photos" && first ? await thumbnailBase64(first) : null,
        },
      });
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setType(res.guess.type as DocumentType);
      setLabel(res.guess.label);
      toast.success(
        res.guess.confidence >= 0.7
          ? `Reconnu : ${DOCUMENT_TYPES.find((t) => t.value === res.guess.type)?.label ?? "document"}. Vérifie avant d'enregistrer.`
          : "Type incertain : vérifie et corrige si besoin.",
      );
    },
    onError: () => toast.error("Identification impossible. Choisis le type à la main."),
  });

  // Réinitialisation à chaque ouverture, avec le type attendu par l'item d'origine
  useEffect(() => {
    if (!open) return;
    const known = DOCUMENT_TYPES.find((t) => t.value === target?.type)?.value;
    const initial: DocumentType =
      known ?? (target?.recommenderId ? "recommendation_letter" : "other");
    setType(initial);
    setLabel(target?.label ?? DOCUMENT_TYPES.find((t) => t.value === initial)?.label ?? "");
    setExpiresAt("");
    setPdf(null);
    setMode("photos");
    setStage("");
    setPhotos((cur) => {
      cur.forEach((p) => URL.revokeObjectURL(p.url));
      return [];
    });
  }, [open, target]);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotos((cur) => [...cur, ...next].slice(0, 20));
  };
  const removePhoto = (index: number) =>
    setPhotos((cur) => {
      const copy = [...cur];
      const [gone] = copy.splice(index, 1);
      if (gone) URL.revokeObjectURL(gone.url);
      return copy;
    });
  const movePhotoUp = (index: number) =>
    setPhotos((cur) => {
      if (index === 0) return cur;
      const copy = [...cur];
      const [item] = copy.splice(index, 1);
      if (item) copy.splice(index - 1, 0, item);
      return copy;
    });

  const mutation = useMutation({
    mutationFn: async () => {
      let blob: Blob;
      let pages: number | undefined;
      if (mode === "photos") {
        setStage("Préparation des pages…");
        const result = await photosToPdf(
          photos.map((p) => p.file),
          {
            textMode,
            onProgress: (done, total) => setStage(`Préparation des pages… ${done}/${total}`),
          },
        );
        blob = result.blob;
        pages = result.pages;
      } else {
        if (!pdf) throw new Error("Aucun fichier");
        blob = pdf;
      }
      if (blob.size > MAX_FILE_BYTES) throw new Error("Fichier trop lourd (10 Mo maximum).");

      setStage("Envoi…");
      const slot = await prepare({ data: { sizeBytes: blob.size, mimeType: "application/pdf" } });
      if (!slot.ok) throw new Error(slot.error);
      const { error } = await supabase.storage
        .from("documents")
        .uploadToSignedUrl(slot.path, slot.token, blob, { contentType: "application/pdf" });
      if (error) throw new Error("L'envoi a échoué. Vérifiez votre connexion et réessayez.");

      setStage("Classement…");
      const saved = await confirm({
        data: {
          path: slot.path,
          type,
          label: label.trim() || "Document",
          ...(pages ? { pages } : {}),
          source: mode === "photos" ? "camera" : "upload",
          expiresAt: expiresAt || null,
          itemId: target?.itemId ?? null,
          recommenderId: target?.recommenderId ?? null,
        },
      });
      if (!saved.ok) throw new Error(saved.error);
      return saved;
    },
    onSuccess: (saved) => {
      toast.success(
        saved.linked > 0
          ? `Document ajouté et coché dans ${saved.linked} élément(s) de vos candidatures.`
          : "Document ajouté à votre coffre-fort.",
      );
      for (const key of [
        "documents",
        "application",
        "applications",
        "recommenders",
        "member-overview",
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      onOpenChange(false);
    },
    onError: (e) => {
      setStage("");
      toast.error(e instanceof Error ? e.message : "Envoi impossible");
    },
  });

  const ready = mode === "photos" ? photos.length > 0 : Boolean(pdf);
  const field = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-base";

  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un document</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2" role="tablist">
          {(
            [
              ["photos", "Prendre en photo", Camera],
              ["pdf", "Fichier PDF", FileUp],
            ] as const
          ).map(([value, text, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm ${
                mode === value ? "border-primary bg-primary/5 font-medium" : "border-border"
              }`}
            >
              <Icon className="size-4" /> {text}
            </button>
          ))}
        </div>

        {mode === "photos" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Une photo par page, à plat et bien éclairée. Toutes les pages forment un seul PDF.
            </p>
            {photos.length > 0 && (
              <ol className="grid grid-cols-3 gap-2">
                {photos.map((p, i) => (
                  <li
                    key={p.url}
                    className="relative overflow-hidden rounded-md border border-border"
                  >
                    <img
                      src={p.url}
                      alt={`Page ${i + 1}`}
                      className="aspect-[3/4] w-full object-cover"
                    />
                    <span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 text-xs">
                      {i + 1}
                    </span>
                    <div className="absolute bottom-1 right-1 flex gap-1">
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => movePhotoUp(i)}
                          className="rounded bg-background/90 p-1"
                          aria-label="Avancer la page"
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="rounded bg-background/90 p-1"
                        aria-label="Retirer la page"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-4 text-sm font-medium">
              <Camera className="size-4" />
              {photos.length === 0 ? "Prendre ou choisir des photos" : "Ajouter une page"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="sr-only"
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={textMode}
                onChange={(e) => setTextMode(e.target.checked)}
              />
              Document texte (noir et blanc contrasté, plus lisible et plus léger)
            </label>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border px-3 py-6 text-sm">
            <FileUp className="size-5" />
            {pdf ? pdf.name : "Choisir un fichier PDF (10 Mo maximum)"}
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        {type === "other" && ready && (
          <div className="rounded-md bg-secondary/60 p-3 text-sm">
            <button
              type="button"
              onClick={() => identify.mutate()}
              disabled={identify.isPending}
              className="inline-flex items-center gap-1.5 font-medium text-primary disabled:opacity-60"
            >
              <Sparkles className="size-4" />
              {identify.isPending ? "Identification…" : "Identifier le type automatiquement"}
            </button>
            <p className="mt-1 text-xs text-muted-foreground">
              Diplômes, relevés, CV, lettres… Pour un passeport ou une carte d'identité, choisis le
              type toi-même : ces pièces ne sont jamais envoyées à l'IA.
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Type de document
            <select
              className={field}
              value={type}
              onChange={(e) => setType(e.target.value as DocumentType)}
            >
              {DOCUMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Nom du document
            <input
              className={field}
              value={label}
              maxLength={120}
              placeholder="ex. Relevé L3 — 2025"
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          {typeExpires(type) && (
            <label className="text-sm font-medium sm:col-span-2">
              Date d'expiration
              <input
                type="date"
                className={field}
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </label>
          )}
        </div>

        <button
          type="button"
          disabled={!ready || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="w-full rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-60"
        >
          {mutation.isPending ? stage || "Un instant…" : "Enregistrer le document"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
