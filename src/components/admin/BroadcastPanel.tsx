import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { listBroadcasts, previewBroadcast, sendBroadcastFn } from "@/lib/admin/broadcast.functions";
import { describeSegment, type Segment } from "@/lib/admin/segment";
import { COUNTRIES } from "@/lib/countries";
import { formatDateFr } from "@/lib/matching";

const selectCls = "rounded-md border border-input bg-card px-2 py-2 text-sm";
const label = "text-xs font-medium text-muted-foreground";

export function BroadcastPanel(props: { bourses: { id: string; university_name: string }[] }) {
  const queryClient = useQueryClient();
  const preview = useServerFn(previewBroadcast);
  const send = useServerFn(sendBroadcastFn);
  const fetchHistory = useServerFn(listBroadcasts);
  const [segment, setSegment] = useState<Segment>({
    bourseId: null,
    status: "active",
    country: null,
  });
  const [channels, setChannels] = useState<("whatsapp" | "email")[]>(["whatsapp", "email"]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");

  const audience = useQuery({
    queryKey: ["admin-broadcast-preview", segment, channels],
    queryFn: () => preview({ data: { segment, channels } }),
    enabled: channels.length > 0,
    retry: false,
  });
  const history = useQuery({
    queryKey: ["admin-broadcasts"],
    queryFn: () => fetchHistory(),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () => send({ data: { segment, channels, title, body, link: link.trim() || null } }),
    onSuccess: (r) => {
      toast.success(`${r.queued} message(s) en file pour ${r.recipients} membre(s)`);
      setTitle("");
      setBody("");
      setLink("");
      void queryClient.invalidateQueries({ queryKey: ["admin-broadcasts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message.slice(0, 200) : "Envoi impossible"),
  });

  const bourseName = props.bourses.find((b) => b.id === segment.bourseId)?.university_name;
  const toggle = (c: "whatsapp" | "email") =>
    setChannels((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  const valid = title.trim().length >= 3 && body.trim().length >= 10 && channels.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4 rounded-xl border border-border bg-card p-5 text-sm">
        <h3 className="font-display text-lg font-semibold">Nouveau message</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="space-y-1">
            <span className={label}>Statut</span>
            <select
              className={`${selectCls} w-full`}
              value={segment.status}
              onChange={(e) =>
                setSegment({ ...segment, status: e.target.value as Segment["status"] })
              }
            >
              <option value="all">Tous les membres</option>
              <option value="active">Membres du Club</option>
              <option value="expired">Anciens membres du Club</option>
              <option value="free">Membres gratuits</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className={label}>Pays</span>
            <select
              className={`${selectCls} w-full`}
              value={segment.country ?? ""}
              onChange={(e) => setSegment({ ...segment, country: e.target.value || null })}
            >
              <option value="">Tous</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className={label}>Bourse suivie</span>
            <select
              className={`${selectCls} w-full`}
              value={segment.bourseId ?? ""}
              onChange={(e) => setSegment({ ...segment, bourseId: e.target.value || null })}
            >
              <option value="">Toutes</option>
              {props.bourses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.university_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={channels.includes("whatsapp")}
              onChange={() => toggle("whatsapp")}
            />
            WhatsApp (modèle « kpb_annonce »)
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={channels.includes("email")}
              onChange={() => toggle("email")}
            />
            Email
          </label>
        </div>
        <label className="block space-y-1">
          <span className={label}>Titre (60 caractères)</span>
          <Input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className={label}>Message (900 caractères)</span>
          <Textarea
            value={body}
            maxLength={900}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-32"
          />
        </label>
        <label className="block space-y-1">
          <span className={label}>Lien (facultatif)</span>
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </label>
        <p className="text-xs text-muted-foreground">
          Seuls les membres qui acceptent les « nouveaux contenus » reçoivent la version WhatsApp.
          L'envoi se fait entre 8 h et 20 h dans le fuseau de chacun.
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <h4 className="font-medium">Aperçu</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {describeSegment(segment, bourseName)}
          </p>
          {audience.data ? (
            <p className="mt-2">
              <strong>{audience.data.total}</strong> membre(s) · {audience.data.whatsapp} sur
              WhatsApp · {audience.data.email} par email
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Calcul…</p>
          )}
          <div className="mt-3 rounded-lg bg-[#e7fbe6] p-3 text-xs text-[#111] dark:bg-[#1f3a2a] dark:text-[#eee]">
            <p className="font-semibold">{title || "Titre"}</p>
            <p className="mt-1 whitespace-pre-wrap">{body || "Ton message…"}</p>
            {link && <p className="mt-1 break-all underline">{link}</p>}
          </div>
          <Button
            className="mt-3 w-full"
            disabled={!valid || mutation.isPending || !audience.data?.total}
            onClick={() => {
              if (confirm(`Envoyer à ${audience.data?.total ?? 0} membre(s) ?`)) mutation.mutate();
            }}
          >
            <Send className="size-4" /> Envoyer
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <h4 className="font-medium">Dernières diffusions</h4>
          <ul className="mt-2 space-y-2 text-xs">
            {(history.data ?? []).map((b) => (
              <li key={b.id}>
                <p className="font-medium">{b.title}</p>
                <p className="text-muted-foreground">
                  {formatDateFr(b.created_at)} · {b.recipients_count} membre(s) · {b.stats.sent}{" "}
                  envoyé(s), {b.stats.pending} en attente, {b.stats.failed} échec(s)
                </p>
              </li>
            ))}
            {history.data?.length === 0 && <li className="text-muted-foreground">Aucune</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
