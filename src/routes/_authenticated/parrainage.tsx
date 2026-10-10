import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Award, Copy, MessageCircle } from "lucide-react";
import { getReferralOverview } from "@/lib/referrals.functions";
import { REFERRALS_PER_REWARD, REWARD_DAYS, referralLink } from "@/lib/referrals";
import { formatDateFr } from "@/lib/matching";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/parrainage")({
  head: () => ({
    meta: [
      { title: "Parrainage — KPB Education" },
      {
        name: "description",
        content: "Invite tes amis au Club Boursier et gagne des mois offerts.",
      },
    ],
  }),
  component: Parrainage,
});

const STATUS: Record<string, string> = {
  signed_up: "Inscrit",
  paid: "A rejoint le Club",
  rewarded: "Récompense obtenue",
};

function Parrainage() {
  const fetchData = useServerFn(getReferralOverview);
  const { data, isPending } = useQuery({ queryKey: ["referrals"], queryFn: () => fetchData() });

  if (isPending || !data) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;

  const link = data.code ? referralLink(window.location.origin, data.code) : "";
  const shareText = `Je prépare mes candidatures aux bourses avec le Club Boursier KPB. Rejoins-moi : ${link}`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 font-display text-3xl font-semibold">
          Parrainage
          {data.isAmbassador && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              <Award className="size-4" /> Ambassadeur KPB
            </span>
          )}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Chaque fois que {REFERRALS_PER_REWARD} personnes invitées rejoignent le Club, tu gagnes{" "}
          {REWARD_DAYS} jours d'abonnement offerts.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Ton code</p>
        <p className="mt-1 font-mono text-2xl font-semibold tracking-wider">{data.code ?? "—"}</p>
        <p className="mt-3 break-all text-sm text-muted-foreground">{link}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            <MessageCircle className="size-4" /> Partager sur WhatsApp
          </a>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                toast.success("Lien copié");
              } catch {
                toast.error("Copie impossible");
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2.5 text-sm"
          >
            <Copy className="size-4" /> Copier le lien
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Inscrits</p>
          <p className="font-display text-2xl font-semibold">{data.counts.signedUp}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Membres du Club</p>
          <p className="font-display text-2xl font-semibold">{data.counts.paid}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Jours gagnés</p>
          <p className="font-display text-2xl font-semibold">{data.daysEarned}</p>
        </div>
      </section>

      <section>
        <p className="text-sm">
          Prochaine récompense : {data.progress} / {REFERRALS_PER_REWARD}
        </p>
        <Progress value={(data.progress / REFERRALS_PER_REWARD) * 100} className="mt-2 h-2" />
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Mes filleuls</h2>
        {data.referrals.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Personne pour l'instant. Partage ton lien dans tes groupes d'études.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {(data.isAmbassador ? data.referrals : data.referrals.slice(0, 20)).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <span className="font-medium">{r.firstName}</span>
                <span className="text-muted-foreground">
                  {STATUS[r.status] ?? r.status} · {formatDateFr(r.paidAt ?? r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
