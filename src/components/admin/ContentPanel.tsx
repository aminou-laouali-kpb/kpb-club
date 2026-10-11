import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/Markdown";
import {
  deleteContent,
  listAdminContent,
  saveChapter,
  savePost,
  saveTemplate,
} from "@/lib/admin/content.functions";
import { formatDateFr } from "@/lib/matching";

const KEY = ["admin-content"];
const label = "text-xs font-medium text-muted-foreground";
const selectCls = "w-full rounded-md border border-input bg-card px-2 py-2 text-sm";

type Doc = {
  id?: string;
  slug: string;
  title: string;
  summary: string | null;
  body_md: string;
  sort_order: number | null;
  published: boolean;
  category: "cv" | "motivation" | "essay" | "recommendation" | "email" | null;
  prefill: boolean;
};

type Post = {
  id?: string;
  kind: "bourse" | "video" | "method" | "news";
  title: string;
  body_md: string | null;
  url: string | null;
  bourse_id: string | null;
  notify: boolean;
  published: boolean;
};

const POST_KINDS = { bourse: "Bourse", video: "Vidéo", method: "Méthode", news: "Actualité" };

/** Éditeur Markdown avec aperçu côte à côte (onglets sur mobile). */
function MarkdownField(props: { value: string; onChange: (v: string) => void }) {
  return (
    <Tabs defaultValue="edit">
      <TabsList>
        <TabsTrigger value="edit">Écrire</TabsTrigger>
        <TabsTrigger value="preview">Aperçu</TabsTrigger>
      </TabsList>
      <TabsContent value="edit">
        <Textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          className="min-h-80 font-mono text-xs"
        />
      </TabsContent>
      <TabsContent value="preview">
        <div className="prose prose-sm max-h-[32rem] max-w-none overflow-y-auto rounded-md border border-border p-3">
          <Markdown source={props.value} />
        </div>
      </TabsContent>
    </Tabs>
  );
}

export function ContentPanel(props: { bourses: { id: string; university_name: string }[] }) {
  const fetchContent = useServerFn(listAdminContent);
  const { data } = useQuery({ queryKey: KEY, queryFn: () => fetchContent(), retry: false });
  const [doc, setDoc] = useState<{ kind: "chapter" | "template"; value: Doc } | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  if (!data) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  const newDoc = (): Doc => ({
    slug: "",
    title: "",
    summary: null,
    body_md: "",
    sort_order: null,
    published: false,
    category: null,
    prefill: false,
  });

  return (
    <Tabs defaultValue="posts">
      <TabsList>
        <TabsTrigger value="posts">Bibliothèque ({data.posts.length})</TabsTrigger>
        <TabsTrigger value="chapters">Guide ({data.chapters.length})</TabsTrigger>
        <TabsTrigger value="templates">Modèles ({data.templates.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="posts" className="space-y-3">
        <Button
          onClick={() =>
            setPost({
              kind: "news",
              title: "",
              body_md: null,
              url: null,
              bourse_id: null,
              notify: true,
              published: false,
            })
          }
        >
          <Plus className="size-4" /> Nouveau post
        </Button>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {data.posts.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <button
                className="text-left hover:underline"
                onClick={() =>
                  setPost({
                    id: p.id,
                    kind: p.kind as Post["kind"],
                    title: p.title,
                    body_md: p.body_md,
                    url: p.url,
                    bourse_id: p.bourse_id,
                    notify: p.notify,
                    published: Boolean(p.published_at),
                  })
                }
              >
                <span className="font-medium">{p.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {POST_KINDS[p.kind as Post["kind"]] ?? p.kind}
                </span>
              </button>
              <span className="text-xs text-muted-foreground">
                {p.published_at ? `Publié le ${formatDateFr(p.published_at)}` : "Brouillon"}
              </span>
            </li>
          ))}
        </ul>
      </TabsContent>

      {(["chapters", "templates"] as const).map((tab) => {
        const rows = tab === "chapters" ? data.chapters : data.templates;
        const kind = tab === "chapters" ? "chapter" : "template";
        return (
          <TabsContent key={tab} value={tab} className="space-y-3">
            <Button
              onClick={() =>
                setDoc({
                  kind,
                  value: newDoc(),
                })
              }
            >
              <Plus className="size-4" />{" "}
              {tab === "chapters" ? "Nouveau chapitre" : "Nouveau modèle"}
            </Button>
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Table vide : la plateforme affiche encore le contenu livré avec l'application.
                Appliquez la migration 0012 pour l'éditer ici.
              </p>
            )}
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <button
                    className="text-left hover:underline"
                    onClick={() =>
                      setDoc({
                        kind,
                        value: {
                          id: r.id,
                          slug: r.slug,
                          title: r.title,
                          summary: r.summary,
                          body_md: r.body_md,
                          sort_order: r.sort_order,
                          published: r.published,
                          prefill: "prefill" in r ? Boolean(r.prefill) : false,
                          category: "category" in r ? (r.category as Doc["category"]) : null,
                        },
                      })
                    }
                  >
                    <span className="font-medium">{r.title}</span>
                    <span className="block text-xs text-muted-foreground">{r.slug}</span>
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {r.published ? "Publié" : "Brouillon"}
                  </span>
                </li>
              ))}
            </ul>
          </TabsContent>
        );
      })}

      <Sheet open={doc !== null} onOpenChange={(o) => !o && setDoc(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          {doc && <DocEditor kind={doc.kind} initial={doc.value} onDone={() => setDoc(null)} />}
        </SheetContent>
      </Sheet>
      <Sheet open={post !== null} onOpenChange={(o) => !o && setPost(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          {post && (
            <PostEditor initial={post} bourses={props.bourses} onDone={() => setPost(null)} />
          )}
        </SheetContent>
      </Sheet>
    </Tabs>
  );
}

function DocEditor(props: { kind: "chapter" | "template"; initial: Doc; onDone: () => void }) {
  const queryClient = useQueryClient();
  const saveChapterFn = useServerFn(saveChapter);
  const saveTemplateFn = useServerFn(saveTemplate);
  const remove = useServerFn(deleteContent);
  const [d, setD] = useState<Doc>(props.initial);
  const table = props.kind === "chapter" ? "content_chapters" : "content_templates";

  const mutation = useMutation({
    mutationFn: () =>
      props.kind === "chapter"
        ? saveChapterFn({
            data: {
              ...(d.id ? { id: d.id } : {}),
              slug: d.slug,
              title: d.title,
              summary: d.summary,
              body_md: d.body_md,
              sort_order: d.sort_order,
              published: d.published,
            },
          })
        : saveTemplateFn({
            data: {
              ...(d.id ? { id: d.id } : {}),
              slug: d.slug,
              title: d.title,
              summary: d.summary,
              body_md: d.body_md,
              sort_order: d.sort_order,
              published: d.published,
              category: d.category,
              prefill: d.prefill,
            },
          }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Enregistré");
      void queryClient.invalidateQueries({ queryKey: KEY });
      props.onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message.slice(0, 200) : "Erreur"),
  });
  const removeMutation = useMutation({
    mutationFn: () => remove({ data: { table, id: d.id! } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      props.onDone();
    },
  });

  return (
    <div className="space-y-4 text-sm">
      <SheetHeader>
        <SheetTitle>
          {d.id ? d.title : props.kind === "chapter" ? "Nouveau chapitre" : "Nouveau modèle"}
        </SheetTitle>
      </SheetHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={label}>Titre</span>
          <Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className={label}>Identifiant (slug)</span>
          <Input
            value={d.slug}
            onChange={(e) => setD({ ...d, slug: e.target.value.toLowerCase() })}
          />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className={label}>Résumé</span>
          <Input
            value={d.summary ?? ""}
            onChange={(e) => setD({ ...d, summary: e.target.value || null })}
          />
        </label>
        <label className="space-y-1">
          <span className={label}>Ordre</span>
          <Input
            type="number"
            value={d.sort_order ?? ""}
            onChange={(e) =>
              setD({ ...d, sort_order: e.target.value ? Number(e.target.value) : null })
            }
          />
        </label>
        {props.kind === "template" && (
          <label className="space-y-1">
            <span className={label}>Catégorie</span>
            <select
              className={selectCls}
              value={d.category ?? ""}
              onChange={(e) =>
                setD({ ...d, category: (e.target.value || null) as Doc["category"] })
              }
            >
              <option value="">—</option>
              <option value="cv">CV</option>
              <option value="motivation">Lettre de motivation</option>
              <option value="essay">Essai</option>
              <option value="recommendation">Recommandation</option>
              <option value="email">Email</option>
            </select>
          </label>
        )}
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={d.published}
            onChange={(e) => setD({ ...d, published: e.target.checked })}
          />
          Publié
        </label>
        {props.kind === "template" && (
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={d.prefill}
              onChange={(e) => setD({ ...d, prefill: e.target.checked })}
            />
            Pré-remplir avec le profil ({"{{full_name}}"}, {"{{nationality}}"}…)
          </label>
        )}
      </div>
      <MarkdownField value={d.body_md} onChange={(v) => setD({ ...d, body_md: v })} />
      <div className="flex gap-2">
        <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          Enregistrer
        </Button>
        {d.id && (
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => confirm("Supprimer définitivement ?") && removeMutation.mutate()}
          >
            Supprimer
          </Button>
        )}
      </div>
    </div>
  );
}

function PostEditor(props: {
  initial: Post;
  bourses: { id: string; university_name: string }[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(savePost);
  const remove = useServerFn(deleteContent);
  const [p, setP] = useState<Post>(props.initial);
  const firstPublish = p.published && !props.initial.published;

  const mutation = useMutation({
    mutationFn: () => save({ data: p }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.notified ? `Publié · ${r.notified} notification(s) en file` : "Enregistré");
      void queryClient.invalidateQueries({ queryKey: KEY });
      props.onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message.slice(0, 200) : "Erreur"),
  });
  const removeMutation = useMutation({
    mutationFn: () => remove({ data: { table: "content_posts", id: p.id! } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      props.onDone();
    },
  });

  return (
    <div className="space-y-4 text-sm">
      <SheetHeader>
        <SheetTitle>{p.id ? p.title : "Nouveau post"}</SheetTitle>
      </SheetHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className={label}>Titre</span>
          <Input value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className={label}>Type</span>
          <select
            className={selectCls}
            value={p.kind}
            onChange={(e) => setP({ ...p, kind: e.target.value as Post["kind"] })}
          >
            {Object.entries(POST_KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className={label}>Bourse liée</span>
          <select
            className={selectCls}
            value={p.bourse_id ?? ""}
            onChange={(e) => setP({ ...p, bourse_id: e.target.value || null })}
          >
            <option value="">—</option>
            {props.bourses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.university_name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className={label}>Lien (vidéo, article)</span>
          <Input
            value={p.url ?? ""}
            onChange={(e) => setP({ ...p, url: e.target.value || null })}
          />
        </label>
      </div>
      <MarkdownField value={p.body_md ?? ""} onChange={(v) => setP({ ...p, body_md: v || null })} />
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={p.published}
            onChange={(e) => setP({ ...p, published: e.target.checked })}
          />
          Publié
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={p.notify}
            onChange={(e) => setP({ ...p, notify: e.target.checked })}
          />
          Prévenir les membres à la publication
        </label>
      </div>
      {firstPublish && p.notify && (
        <p className="rounded-md bg-secondary p-2 text-xs">
          Les membres seront prévenus (WhatsApp via le modèle « kpb_annonce » et/ou email, selon
          leurs préférences), entre 8 h et 20 h de leur fuseau.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          disabled={mutation.isPending || p.title.trim().length < 3}
          onClick={() => mutation.mutate()}
        >
          Enregistrer
        </Button>
        {p.id && (
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => confirm("Supprimer définitivement ?") && removeMutation.mutate()}
          >
            Supprimer
          </Button>
        )}
      </div>
    </div>
  );
}
