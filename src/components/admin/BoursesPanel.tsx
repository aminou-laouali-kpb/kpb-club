import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, Download, Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteRequirement,
  duplicateBourseForNextYear,
  reorderRequirements,
  saveBourse,
  saveRequirement,
} from "@/lib/admin/bourses.functions";
import type { BourseInput, BourseRow, RequirementRow } from "@/lib/admin/bourses";
import { formatDateFr } from "@/lib/matching";

export const ADMIN_BOURSES_KEY = ["admin-bourses"];

const label = "text-xs font-medium text-muted-foreground";
const selectCls = "w-full rounded-md border border-input bg-card px-2 py-2 text-sm";

function emptyBourse(): BourseInput {
  return {
    id: "",
    university_name: "",
    country: "",
    program_url: null,
    eligible_nationalities: [],
    gender_restriction: "all",
    min_education: null,
    max_age: null,
    english_required: false,
    financial_need_required: false,
    window_opens: null,
    window_closes: null,
    window_confirmed: false,
    academic_year: new Date().getFullYear() + 1,
    notes: null,
    whatsapp_group_url: null,
    video_url: null,
    interview_format: null,
    essay_criteria: null,
    operations_order: null,
    english_tests: null,
    verified_by_kpb: false,
    published: false,
    level: [],
    funding: null,
  };
}

function toInput(b: BourseRow): BourseInput {
  return {
    ...emptyBourse(),
    ...b,
    gender_restriction: b.gender_restriction === "F" ? "F" : "all",
    min_education: (b.min_education as BourseInput["min_education"]) ?? null,
    interview_format: (b.interview_format as BourseInput["interview_format"]) ?? null,
    funding: (b.funding as BourseInput["funding"]) ?? null,
    level: b.level as BourseInput["level"],
    essay_criteria: (b.essay_criteria as BourseInput["essay_criteria"]) ?? null,
    operations_order: (b.operations_order as BourseInput["operations_order"]) ?? null,
    english_tests: (b.english_tests as BourseInput["english_tests"]) ?? null,
  };
}

async function downloadExport() {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/admin/bourses.json", {
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
  });
  if (!res.ok) {
    toast.error("Export impossible");
    return;
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "bourses.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function BoursesPanel(props: { bourses: BourseRow[]; requirements: RequirementRow[] }) {
  const queryClient = useQueryClient();
  const duplicate = useServerFn(duplicateBourseForNextYear);
  const [editing, setEditing] = useState<{ bourse: BourseInput; isNew: boolean } | null>(null);
  const [filter, setFilter] = useState("");

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicate({ data: { id } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Copie ${r.id} créée (non publiée, dates à confirmer)`);
      void queryClient.invalidateQueries({ queryKey: ADMIN_BOURSES_KEY });
    },
    onError: () => toast.error("Duplication impossible"),
  });

  const list = props.bourses.filter(
    (b) =>
      !filter ||
      `${b.id} ${b.university_name} ${b.country}`.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrer les bourses"
          className="max-w-xs"
        />
        <Button onClick={() => setEditing({ bourse: emptyBourse(), isNew: true })}>
          <Plus className="size-4" /> Nouvelle bourse
        </Button>
        <Button variant="outline" onClick={() => void downloadExport()}>
          <Download className="size-4" /> Export bourses.json
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-normal">Bourse</th>
              <th className="p-3 font-normal">Fenêtre</th>
              <th className="p-3 font-normal">État</th>
              <th className="p-3 font-normal" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((b) => {
              const reqCount = props.requirements.filter((r) => r.bourse_id === b.id).length;
              return (
                <tr key={b.id}>
                  <td className="p-3">
                    <button
                      className="text-left font-medium hover:underline"
                      onClick={() => setEditing({ bourse: toInput(b), isNew: false })}
                    >
                      {b.university_name}
                    </button>
                    <span className="block text-xs text-muted-foreground">
                      {b.id} · {b.country} · {reqCount} exigence(s)
                    </span>
                  </td>
                  <td className="p-3 text-xs">
                    {formatDateFr(b.window_opens)} → {formatDateFr(b.window_closes)}
                    {!b.window_confirmed && (
                      <span className="block text-amber-700 dark:text-amber-400">à confirmer</span>
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    {b.published ? "Publiée" : "Brouillon"}
                    {b.verified_by_kpb && <span className="block">✓ Vérifiée KPB</span>}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={duplicateMutation.isPending}
                      onClick={() => duplicateMutation.mutate(b.id)}
                    >
                      <Copy className="size-3.5" /> Dupliquer pour{" "}
                      {(b.academic_year ?? new Date().getFullYear()) + 1}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {editing && (
            <BourseEditor
              key={editing.bourse.id || "new"}
              initial={editing.bourse}
              isNew={editing.isNew}
              requirements={props.requirements.filter((r) => r.bourse_id === editing.bourse.id)}
              onSaved={(b) => setEditing({ bourse: b, isNew: false })}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function jsonText(v: unknown) {
  return v == null ? "" : JSON.stringify(v, null, 2);
}

function BourseEditor(props: {
  initial: BourseInput;
  isNew: boolean;
  requirements: RequirementRow[];
  onSaved: (b: BourseInput) => void;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveBourse);
  const [b, setB] = useState<BourseInput>(props.initial);
  const [json, setJson] = useState({
    essay_criteria: jsonText(props.initial.essay_criteria),
    operations_order: jsonText(props.initial.operations_order),
    english_tests: jsonText(props.initial.english_tests),
  });
  const set = <K extends keyof BourseInput>(key: K, value: BourseInput[K]) =>
    setB((prev) => ({ ...prev, [key]: value }));
  const text = (v: string) => (v.trim() === "" ? null : v.trim());
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed: Partial<BourseInput> = {};
      for (const key of ["essay_criteria", "operations_order", "english_tests"] as const) {
        const raw = json[key].trim();
        try {
          (parsed as Record<string, unknown>)[key] = raw ? JSON.parse(raw) : null;
        } catch {
          throw new Error(`JSON invalide dans « ${key} »`);
        }
      }
      const bourse = { ...b, ...parsed };
      const r = await save({ data: { bourse, isNew: props.isNew } });
      return { r, bourse };
    },
    onSuccess: ({ r, bourse }) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Bourse enregistrée");
      void queryClient.invalidateQueries({ queryKey: ADMIN_BOURSES_KEY });
      props.onSaved(bourse);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message.slice(0, 200) : "Enregistrement impossible"),
  });

  return (
    <div className="space-y-5 text-sm">
      <SheetHeader>
        <SheetTitle>{props.isNew ? "Nouvelle bourse" : b.university_name}</SheetTitle>
      </SheetHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={label}>Identifiant (slug)</span>
          <Input
            value={b.id}
            disabled={!props.isNew}
            onChange={(e) => set("id", e.target.value.toLowerCase())}
            placeholder="chevening-2027"
          />
        </label>
        <label className="space-y-1">
          <span className={label}>Nom</span>
          <Input
            value={b.university_name}
            onChange={(e) => set("university_name", e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className={label}>Pays d'études</span>
          <Input value={b.country} onChange={(e) => set("country", e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className={label}>Année académique</span>
          <Input
            type="number"
            value={b.academic_year ?? ""}
            onChange={(e) => set("academic_year", num(e.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className={label}>Ouverture</span>
          <Input
            type="date"
            value={b.window_opens ?? ""}
            onChange={(e) => set("window_opens", text(e.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className={label}>Date limite</span>
          <Input
            type="date"
            value={b.window_closes ?? ""}
            onChange={(e) => set("window_closes", text(e.target.value))}
          />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className={label}>Site officiel</span>
          <Input
            value={b.program_url ?? ""}
            onChange={(e) => set("program_url", text(e.target.value))}
          />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className={label}>
            Nationalités éligibles (codes ISO séparés par des virgules ; vide = toutes)
          </span>
          <Input
            value={b.eligible_nationalities.join(", ")}
            onChange={(e) =>
              set(
                "eligible_nationalities",
                e.target.value
                  .toUpperCase()
                  .split(/[\s,;]+/)
                  .filter(Boolean),
              )
            }
          />
        </label>
        <label className="space-y-1">
          <span className={label}>Public</span>
          <select
            className={selectCls}
            value={b.gender_restriction}
            onChange={(e) => set("gender_restriction", e.target.value as "F" | "all")}
          >
            <option value="all">Tous</option>
            <option value="F">Femmes uniquement</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className={label}>Diplôme minimum</span>
          <select
            className={selectCls}
            value={b.min_education ?? ""}
            onChange={(e) =>
              set("min_education", (e.target.value || null) as BourseInput["min_education"])
            }
          >
            <option value="">—</option>
            <option value="bac">Bac</option>
            <option value="licence">Licence</option>
            <option value="master">Master</option>
            <option value="doctorat">Doctorat</option>
            <option value="autre">Autre</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className={label}>Âge maximum</span>
          <Input
            type="number"
            value={b.max_age ?? ""}
            onChange={(e) => set("max_age", num(e.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className={label}>Financement</span>
          <select
            className={selectCls}
            value={b.funding ?? ""}
            onChange={(e) => set("funding", (e.target.value || null) as BourseInput["funding"])}
          >
            <option value="">—</option>
            <option value="full">Complet</option>
            <option value="partial">Partiel</option>
            <option value="tuition">Frais de scolarité</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className={label}>Entretien</span>
          <select
            className={selectCls}
            value={b.interview_format ?? ""}
            onChange={(e) =>
              set("interview_format", (e.target.value || null) as BourseInput["interview_format"])
            }
          >
            <option value="">—</option>
            <option value="none">Aucun</option>
            <option value="video">Vidéo</option>
            <option value="panel">Jury</option>
            <option value="written">Écrit</option>
          </select>
        </label>
        <fieldset className="space-y-1">
          <span className={label}>Niveaux visés</span>
          <div className="flex flex-wrap gap-3">
            {(["licence", "master", "doctorat", "autre"] as const).map((lvl) => (
              <label key={lvl} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={b.level.includes(lvl)}
                  onChange={(e) =>
                    set(
                      "level",
                      e.target.checked ? [...b.level, lvl] : b.level.filter((l) => l !== lvl),
                    )
                  }
                />
                {lvl}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="space-y-1">
          <span className={label}>Groupe WhatsApp</span>
          <Input
            value={b.whatsapp_group_url ?? ""}
            onChange={(e) => set("whatsapp_group_url", text(e.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className={label}>Vidéo</span>
          <Input
            value={b.video_url ?? ""}
            onChange={(e) => set("video_url", text(e.target.value))}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {(
          [
            ["english_required", "Anglais exigé"],
            ["financial_need_required", "Besoin de financement exigé"],
            ["window_confirmed", "Dates confirmées"],
            ["verified_by_kpb", "Vérifiée par KPB"],
            ["published", "Publiée"],
          ] as const
        ).map(([key, text]) => (
          <label key={key} className="flex items-center gap-1.5">
            <input type="checkbox" checked={b[key]} onChange={(e) => set(key, e.target.checked)} />
            {text}
          </label>
        ))}
      </div>

      <label className="block space-y-1">
        <span className={label}>Notes</span>
        <Textarea value={b.notes ?? ""} onChange={(e) => set("notes", text(e.target.value))} />
      </label>

      {(
        [
          ["essay_criteria", 'Critères d\'essai — [{"name", "description", "weight"}]'],
          ["operations_order", 'Ordre des opérations — ["Étape 1", "Étape 2"]'],
          ["english_tests", 'Tests d\'anglais — [{"test": "ielts", "min_score": 6.5}]'],
        ] as const
      ).map(([key, text]) => (
        <label key={key} className="block space-y-1">
          <span className={label}>{text}</span>
          <Textarea
            value={json[key]}
            onChange={(e) => setJson((j) => ({ ...j, [key]: e.target.value }))}
            className="min-h-24 font-mono text-xs"
          />
        </label>
      ))}

      <Button
        disabled={mutation.isPending || !b.id || !b.university_name || !b.country}
        onClick={() => mutation.mutate()}
      >
        Enregistrer la bourse
      </Button>

      {!props.isNew && <RequirementsEditor bourseId={b.id} requirements={props.requirements} />}
    </div>
  );
}

type Req = {
  id?: string;
  kind: RequirementRow["kind"];
  label: string;
  description: string | null;
  document_type: string | null;
  essay_prompt: string | null;
  essay_max_words: number | null;
  essay_language: string | null;
  recommenders_count: number | null;
  days_before_deadline: number | null;
};

const KIND_LABELS: Record<RequirementRow["kind"], string> = {
  document: "Document",
  essay: "Essai",
  recommendation: "Recommandation",
  form: "Formulaire",
  test: "Test",
  other: "Autre",
};

function RequirementsEditor(props: { bourseId: string; requirements: RequirementRow[] }) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveRequirement);
  const deleteFn = useServerFn(deleteRequirement);
  const reorderFn = useServerFn(reorderRequirements);
  const [draft, setDraft] = useState<Req | null>(null);
  const sorted = [...props.requirements].sort((a, b) => a.sort_order - b.sort_order);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ADMIN_BOURSES_KEY });

  const saveMutation = useMutation({
    mutationFn: (r: Req) => {
      const existing = sorted.find((x) => x.id === r.id);
      const sortOrder = existing?.sort_order ?? (sorted.at(-1)?.sort_order ?? 0) + 1;
      return saveFn({
        data: { ...r, bourse_id: props.bourseId, sort_order: sortOrder },
      });
    },
    onSuccess: () => {
      setDraft(null);
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message.slice(0, 200) : "Erreur"),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: refresh,
  });
  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorderFn({ data: { ids } }),
    onSuccess: refresh,
  });
  const move = (index: number, delta: number) => {
    const ids = sorted.map((r) => r.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorderMutation.mutate(ids);
  };

  return (
    <section className="space-y-3 border-t border-border pt-5">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-base font-semibold">Exigences (checklist)</h4>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setDraft({
              kind: "document",
              label: "",
              description: null,
              document_type: null,
              essay_prompt: null,
              essay_max_words: null,
              essay_language: "fr",
              recommenders_count: null,
              days_before_deadline: null,
            })
          }
        >
          <Plus className="size-3.5" /> Ajouter
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Les nouvelles candidatures reprennent cette liste. Les checklists déjà créées ne changent
        pas.
      </p>
      <ol className="space-y-1">
        {sorted.map((r, i) => (
          <li key={r.id} className="flex items-center gap-2 rounded-md border border-border p-2">
            <span className="w-24 shrink-0 text-xs text-muted-foreground">
              {KIND_LABELS[r.kind]}
            </span>
            <button className="flex-1 text-left hover:underline" onClick={() => setDraft({ ...r })}>
              {r.label}
            </button>
            <Button size="icon" variant="ghost" aria-label="Monter" onClick={() => move(i, -1)}>
              <ArrowUp className="size-3.5" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Descendre" onClick={() => move(i, 1)}>
              <ArrowDown className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Supprimer"
              onClick={() => {
                if (confirm(`Retirer « ${r.label} » ?`)) deleteMutation.mutate(r.id);
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}
      </ol>

      {draft && (
        <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className={selectCls}
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as Req["kind"] })}
            >
              {Object.entries(KIND_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <Input
              placeholder="Intitulé"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
            <Input
              placeholder="Type de document (passport, transcript…)"
              value={draft.document_type ?? ""}
              onChange={(e) => setDraft({ ...draft, document_type: e.target.value || null })}
            />
            <Input
              type="number"
              placeholder="Jours avant la date limite"
              value={draft.days_before_deadline ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  days_before_deadline: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
            {draft.kind === "essay" && (
              <Input
                type="number"
                placeholder="Mots maximum"
                value={draft.essay_max_words ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    essay_max_words: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            )}
            {draft.kind === "recommendation" && (
              <Input
                type="number"
                placeholder="Nombre de recommandeurs"
                value={draft.recommenders_count ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    recommenders_count: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            )}
          </div>
          <Textarea
            placeholder="Description"
            value={draft.description ?? ""}
            onChange={(e) => setDraft({ ...draft, description: e.target.value || null })}
          />
          {draft.kind === "essay" && (
            <Textarea
              placeholder="Sujet de l'essai"
              value={draft.essay_prompt ?? ""}
              onChange={(e) => setDraft({ ...draft, essay_prompt: e.target.value || null })}
            />
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={draft.label.trim().length < 2 || saveMutation.isPending}
              onClick={() => saveMutation.mutate(draft)}
            >
              Enregistrer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Annuler
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
