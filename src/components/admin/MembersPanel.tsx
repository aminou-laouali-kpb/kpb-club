import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addAdminNote,
  extendAccess,
  getMemberDetail,
  searchMembers,
} from "@/lib/admin/members.functions";
import { grantSubscription } from "@/lib/admin.functions";
import { COUNTRIES, countryName } from "@/lib/countries";
import { formatDateFr } from "@/lib/matching";
import { formatFcfa } from "@/lib/pricing";

const STATUS = { active: "Club", expired: "Expiré", free: "Gratuit" } as const;
const selectCls = "rounded-md border border-input bg-card px-2 py-2 text-sm";

export function MembersPanel(props: { bourses: { id: string; university_name: string }[] }) {
  const search = useServerFn(searchMembers);
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "expired" | "free">("all");
  const [country, setCountry] = useState("");
  const [bourseId, setBourseId] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filters = {
    q: submitted,
    status,
    country: country || null,
    bourseId: bourseId || null,
  };
  const { data, isPending } = useQuery({
    queryKey: ["admin-members", filters],
    queryFn: () => search({ data: filters }),
    retry: false,
  });

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q);
        }}
      >
        <div className="relative min-w-[14rem] flex-1">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nom, code membre, téléphone, email"
            className="pl-8"
          />
        </div>
        <select
          aria-label="Statut"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className={selectCls}
        >
          <option value="all">Tous les statuts</option>
          <option value="active">Club</option>
          <option value="expired">Expirés</option>
          <option value="free">Gratuits</option>
        </select>
        <select
          aria-label="Pays"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className={selectCls}
        >
          <option value="">Tous les pays</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Bourse ciblée"
          value={bourseId}
          onChange={(e) => setBourseId(e.target.value)}
          className={`${selectCls} max-w-[14rem]`}
        >
          <option value="">Toutes les bourses</option>
          {props.bourses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.university_name}
            </option>
          ))}
        </select>
        <Button type="submit">Rechercher</Button>
      </form>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-normal">Membre</th>
                <th className="p-3 font-normal">Contact</th>
                <th className="p-3 font-normal">Pays</th>
                <th className="p-3 font-normal">Statut</th>
                <th className="p-3 font-normal">Inscrit le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(data ?? []).map((m) => (
                <tr
                  key={m.id}
                  className="cursor-pointer hover:bg-secondary/50"
                  onClick={() => setOpenId(m.id)}
                >
                  <td className="p-3">
                    <span className="font-medium">{m.full_name || "—"}</span>
                    <span className="block text-xs text-muted-foreground">{m.member_code}</span>
                  </td>
                  <td className="p-3 text-xs">
                    {m.phone_e164 ?? m.phone ?? ""}
                    <span className="block text-muted-foreground">{m.email}</span>
                  </td>
                  <td className="p-3">{countryName(m.residence ?? m.nationality)}</td>
                  <td className="p-3">
                    {STATUS[m.status]}
                    {m.deletion_requested_at && (
                      <span className="block text-xs text-destructive">Suppression demandée</span>
                    )}
                  </td>
                  <td className="p-3 text-xs">{formatDateFr(m.created_at)}</td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-muted-foreground">
                    Aucun membre ne correspond.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {openId && <MemberDetail profileId={openId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MemberDetail({ profileId }: { profileId: string }) {
  const fetchDetail = useServerFn(getMemberDetail);
  const note = useServerFn(addAdminNote);
  const extend = useServerFn(extendAccess);
  const grant = useServerFn(grantSubscription);
  const queryClient = useQueryClient();
  const [noteText, setNoteText] = useState("");
  const [days, setDays] = useState(7);
  const key = ["admin-member", profileId];
  const { data } = useQuery({ queryKey: key, queryFn: () => fetchDetail({ data: { profileId } }) });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["admin-members"] });
  };
  const noteMutation = useMutation({
    mutationFn: () => note({ data: { profileId, body: noteText } }),
    onSuccess: () => {
      setNoteText("");
      refresh();
    },
    onError: () => toast.error("Note non enregistrée"),
  });
  const extendMutation = useMutation({
    mutationFn: () => extend({ data: { profileId, days } }),
    onSuccess: (r) => {
      toast.success(`Accès prolongé jusqu'au ${formatDateFr(r.ends_at)}`);
      refresh();
    },
    onError: () => toast.error("Action impossible"),
  });
  const grantMutation = useMutation({
    mutationFn: (plan: "monthly" | "quarterly") => grant({ data: { profileId, plan } }),
    onSuccess: () => {
      toast.success("Formule offerte");
      refresh();
    },
    onError: () => toast.error("Action impossible"),
  });

  if (!data) return <p className="p-4 text-sm text-muted-foreground">Chargement…</p>;
  const p = data.profile;
  const aiCost = Object.values(data.ai.byFeature).reduce((s, f) => s + f.cost, 0);

  return (
    <div className="space-y-6 text-sm">
      <SheetHeader>
        <SheetTitle>{p.full_name || "Membre sans nom"}</SheetTitle>
        <p className="text-xs text-muted-foreground">
          {p.member_code} · {p.phone ?? "pas de téléphone"} · {p.email ?? "pas d'email"} ·{" "}
          {countryName(p.residence ?? p.nationality)} · inscrit le {formatDateFr(p.created_at)}
        </p>
        {p.deletion_requested_at && (
          <p className="text-xs text-destructive">
            Suppression demandée le {formatDateFr(p.deletion_requested_at)}
          </p>
        )}
      </SheetHeader>

      <section>
        <h4 className="font-medium">Accès</h4>
        <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
          {data.subscriptions.slice(0, 4).map((s) => (
            <li key={s.id}>
              {s.source === "payment" ? formatFcfa(s.amount) : s.source} · jusqu'au{" "}
              {formatDateFr(s.ends_at)}
            </li>
          ))}
          {data.subscriptions.length === 0 && <li>Jamais abonné</li>}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-20"
            aria-label="Jours"
          />
          <Button size="sm" variant="outline" onClick={() => extendMutation.mutate()}>
            Prolonger de {days} j
          </Button>
          <Button size="sm" variant="outline" onClick={() => grantMutation.mutate("monthly")}>
            Offrir 1 mois
          </Button>
          <Button size="sm" variant="outline" onClick={() => grantMutation.mutate("quarterly")}>
            Offrir 3 mois
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Paiement manuel : onglet « Paiements & codes ».
        </p>
      </section>

      <section>
        <h4 className="font-medium">Candidatures</h4>
        <ul className="mt-1 space-y-1">
          {data.applications.map((a) => (
            <li key={a.id} className="flex justify-between gap-2">
              <span>{a.bourses?.university_name ?? a.bourse_id}</span>
              <span className="text-xs text-muted-foreground">
                {a.status} · {a.readiness} %{a.deadline ? ` · ${formatDateFr(a.deadline)}` : ""}
              </span>
            </li>
          ))}
          {data.applications.length === 0 && (
            <li className="text-xs text-muted-foreground">Aucune</li>
          )}
        </ul>
      </section>

      <section>
        <h4 className="font-medium">Documents ({data.documents.length})</h4>
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {data.documents.slice(0, 12).map((d) => (
            <li key={d.id}>
              {d.label} · {d.type} · {Math.round((d.size_bytes ?? 0) / 1024)} Ko · {d.source}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="font-medium">Coach IA</h4>
        <p className="text-xs text-muted-foreground">
          {data.ai.total} appels · {aiCost.toFixed(2)} $ —{" "}
          {Object.entries(data.ai.byFeature)
            .map(([f, v]) => `${f} ${v.calls}`)
            .join(", ") || "aucun"}
        </p>
      </section>

      <section>
        <h4 className="font-medium">Paiements</h4>
        <ul className="mt-1 space-y-0.5 text-xs">
          {data.payments.map((pay) => (
            <li key={pay.id} className="flex justify-between">
              <span>
                {formatFcfa(pay.amount)} · {pay.payable_type} · {pay.provider}
              </span>
              <span className="text-muted-foreground">
                {pay.status} · {formatDateFr(pay.created_at)}
              </span>
            </li>
          ))}
          {data.payments.length === 0 && <li className="text-muted-foreground">Aucun</li>}
        </ul>
      </section>

      <section>
        <h4 className="font-medium">Notes de l'équipe</h4>
        <div className="mt-2 space-y-2">
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Appel du 12/10 : attend la réponse de son professeur…"
            maxLength={2000}
          />
          <Button
            size="sm"
            disabled={!noteText.trim() || noteMutation.isPending}
            onClick={() => noteMutation.mutate()}
          >
            Ajouter la note
          </Button>
        </div>
        <ul className="mt-3 space-y-2">
          {data.notes.map((n) => (
            <li key={n.id} className="rounded-md bg-secondary/50 p-2">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDateFr(n.created_at)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
