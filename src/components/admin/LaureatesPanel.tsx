import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteLaureate, listAdminLaureates, saveLaureate } from "@/lib/admin/laureates.functions";
import { COUNTRIES, countryName } from "@/lib/countries";

const KEY = ["admin-laureates"];
const selectCls = "rounded-md border border-input bg-card px-2 py-2 text-sm";

type Draft = {
  id?: string;
  first_name: string;
  country: string | null;
  bourse_id: string | null;
  bourse_name: string | null;
  year: number | null;
  quote: string | null;
  video_url: string | null;
  verified: boolean;
  consent: boolean;
  is_demo: boolean;
};

export function LaureatesPanel(props: { bourses: { id: string; university_name: string }[] }) {
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listAdminLaureates);
  const save = useServerFn(saveLaureate);
  const remove = useServerFn(deleteLaureate);
  const { data } = useQuery({ queryKey: KEY, queryFn: () => fetchList(), retry: false });
  const [draft, setDraft] = useState<Draft | null>(null);

  const mutation = useMutation({
    mutationFn: (d: Draft) => save({ data: d }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Témoignage enregistré");
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message.slice(0, 200) : "Erreur"),
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Un témoignage n'apparaît sur le site que s'il est vérifié <strong>et</strong> accompagné de
        l'accord écrit du lauréat (à conserver par l'équipe).
      </p>
      <Button
        onClick={() =>
          setDraft({
            first_name: "",
            country: null,
            bourse_id: null,
            bourse_name: null,
            year: new Date().getFullYear(),
            quote: null,
            video_url: null,
            verified: false,
            consent: false,
            is_demo: false,
          })
        }
      >
        <Plus className="size-4" /> Ajouter un lauréat
      </Button>

      {draft && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Prénom"
              value={draft.first_name}
              onChange={(e) => setDraft({ ...draft, first_name: e.target.value })}
            />
            <select
              className={selectCls}
              value={draft.country ?? ""}
              onChange={(e) => setDraft({ ...draft, country: e.target.value || null })}
            >
              <option value="">Pays</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className={selectCls}
              value={draft.bourse_id ?? ""}
              onChange={(e) => {
                const b = props.bourses.find((x) => x.id === e.target.value);
                setDraft({
                  ...draft,
                  bourse_id: b?.id ?? null,
                  bourse_name: b?.university_name ?? draft.bourse_name,
                });
              }}
            >
              <option value="">Bourse (catalogue)</option>
              {props.bourses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.university_name}
                </option>
              ))}
            </select>
            <Input
              placeholder="Nom de la bourse affiché"
              value={draft.bourse_name ?? ""}
              onChange={(e) => setDraft({ ...draft, bourse_name: e.target.value || null })}
            />
            <Input
              type="number"
              placeholder="Année"
              value={draft.year ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, year: e.target.value ? Number(e.target.value) : null })
              }
            />
            <Input
              placeholder="Lien vidéo"
              value={draft.video_url ?? ""}
              onChange={(e) => setDraft({ ...draft, video_url: e.target.value || null })}
            />
          </div>
          <Textarea
            placeholder="Citation (600 caractères au plus)"
            maxLength={600}
            value={draft.quote ?? ""}
            onChange={(e) => setDraft({ ...draft, quote: e.target.value || null })}
          />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.consent}
                onChange={(e) => setDraft({ ...draft, consent: e.target.checked })}
              />
              Accord écrit reçu
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.verified}
                onChange={(e) => setDraft({ ...draft, verified: e.target.checked })}
              />
              Vérifié (publié)
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.is_demo}
                onChange={(e) => setDraft({ ...draft, is_demo: e.target.checked })}
              />
              Témoignage de démonstration
            </label>
          </div>
          <div className="flex gap-2">
            <Button
              disabled={!draft.first_name.trim() || mutation.isPending}
              onClick={() => mutation.mutate(draft)}
            >
              Enregistrer
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
        {(data ?? []).map((l) => (
          <li key={l.id} className="flex items-start justify-between gap-3 p-3">
            <button
              className="text-left"
              onClick={() =>
                setDraft({
                  id: l.id,
                  first_name: l.first_name,
                  country: l.country,
                  bourse_id: l.bourse_id,
                  bourse_name: l.bourse_name,
                  year: l.year,
                  quote: l.quote,
                  video_url: l.video_url,
                  verified: l.verified,
                  consent: Boolean(l.consent_at),
                  is_demo: l.is_demo,
                })
              }
            >
              <span className="font-medium">
                {l.first_name} · {countryName(l.country)} · {l.bourse_name} {l.year}
              </span>
              <span className="block text-xs text-muted-foreground">{l.quote}</span>
            </button>
            <div className="shrink-0 text-right text-xs">
              <p>
                {l.verified && l.consent_at ? "Publié" : "Non publié"}
                {l.is_demo && " · démo"}
              </p>
              <button
                className="mt-1 text-destructive"
                onClick={() => confirm("Supprimer ce témoignage ?") && removeMutation.mutate(l.id)}
              >
                Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
