import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";
import { listPosts, markPostRead } from "@/lib/content.functions";
import { MemberGate } from "@/components/MemberGate";
import { Markdown } from "@/components/Markdown";
import { formatDateFr } from "@/lib/matching";

export const Route = createFileRoute("/_authenticated/bibliotheque")({
  head: () => ({
    meta: [
      { title: "Bibliothèque — KPB Education" },
      { name: "description", content: "Nouvelles bourses, vidéos, méthodes et bulletins du Club." },
    ],
  }),
  component: Bibliotheque,
});

const KINDS = [
  { id: "all", label: "Tout" },
  { id: "bourse", label: "Bourses" },
  { id: "video", label: "Vidéos" },
  { id: "method", label: "Méthodes" },
  { id: "news", label: "Actualités" },
] as const;

function Bibliotheque() {
  const fetchPosts = useServerFn(listPosts);
  const markRead = useServerFn(markPostRead);
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("all");
  const [open, setOpen] = useState<string | null>(null);
  const { data, isPending } = useQuery({ queryKey: ["posts"], queryFn: () => fetchPosts() });
  const read = useMutation({
    mutationFn: (postId: string) => markRead({ data: { postId } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["posts"] }),
  });

  if (isPending) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;
  if (!data?.access) return <MemberGate />;
  const posts = data.posts.filter((p) => kind === "all" || p.kind === kind);
  const unread = data.posts.filter((p) => p.unread).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Bibliothèque</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {unread > 0
            ? `${unread} nouveauté${unread > 1 ? "s" : ""} depuis ta dernière visite.`
            : "Tu es à jour."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              kind === k.id ? "bg-primary text-primary-foreground" : "border border-border"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Rien ici pour l'instant.</p>
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => (
            <li key={post.id} className="rounded-xl border border-border bg-card p-4">
              <button
                className="flex w-full items-start gap-3 text-left"
                onClick={() => {
                  setOpen(open === post.id ? null : post.id);
                  if (post.unread) read.mutate(post.id);
                }}
              >
                {post.unread && (
                  <span
                    className="mt-2 size-2 shrink-0 rounded-full bg-primary"
                    aria-label="Non lu"
                  />
                )}
                <span className="flex-1">
                  <span className="block font-medium">{post.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {KINDS.find((k) => k.id === post.kind)?.label} ·{" "}
                    {formatDateFr(post.published_at)}
                  </span>
                </span>
              </button>
              {open === post.id && (
                <div className="mt-3 space-y-3 text-sm">
                  {post.body_md && <Markdown source={post.body_md} />}
                  {post.url && (
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary"
                    >
                      Ouvrir <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
