import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Quote } from "lucide-react";
import { listLaureates } from "@/lib/public.functions";
import { countryName } from "@/lib/countries";

/** Témoignages vérifiés de lauréats (prénom, pays, bourse, année). */
export function LaureatesWall({ limit }: { limit?: number }) {
  const fetchLaureates = useServerFn(listLaureates);
  const { data = [] } = useQuery({ queryKey: ["laureates"], queryFn: () => fetchLaureates() });
  const list = limit ? data.slice(0, limit) : data;
  if (list.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((l) => (
        <figure key={l.id} className="rounded-xl border border-border bg-card p-5">
          <Quote className="size-5 text-primary" />
          <blockquote className="mt-2 text-sm">{l.quote}</blockquote>
          <figcaption className="mt-3 text-sm">
            <span className="font-medium">{l.first_name}</span>
            <span className="text-muted-foreground">
              {" "}
              · {countryName(l.country)} · {l.bourse_name}
              {l.year ? ` ${l.year}` : ""}
            </span>
            {l.is_demo && (
              <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                démo
              </span>
            )}
          </figcaption>
          {l.video_url && (
            <a
              href={l.video_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm text-primary"
            >
              Voir la vidéo
            </a>
          )}
        </figure>
      ))}
    </div>
  );
}
