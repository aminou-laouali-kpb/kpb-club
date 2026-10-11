import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type StreamEvent =
  | { type: "thread"; threadId: string }
  | { type: "text"; text: string }
  | { type: "done"; [key: string]: unknown }
  | { type: "error"; message: string; kind?: string };

/** Appelle la route de flux du coach et remonte le texte au fil de l'eau. */
export function useAiStream() {
  const [streaming, setStreaming] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const run = useCallback(
    async (body: Record<string, unknown>, onEvent: (event: StreamEvent) => void) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setStreaming(true);
      try {
        const { data } = await supabase.auth.getSession();
        const res = await fetch("/api/ai/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.session?.access_token ?? ""}`,
          },
          body: JSON.stringify(body),
          signal: abort.signal,
        });
        if (!res.ok || !res.body) {
          onEvent({ type: "error", message: "Le coach est indisponible. Réessaie plus tard." });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) >= 0) {
            const chunk = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const line = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            try {
              onEvent(JSON.parse(line.slice(6)) as StreamEvent);
            } catch {
              // Morceau illisible : ignoré
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          onEvent({
            type: "error",
            message: "Connexion interrompue. Vérifie ton réseau et réessaie.",
          });
        }
      } finally {
        setStreaming(false);
      }
    },
    [],
  );

  const stop = useCallback(() => controller.current?.abort(), []);
  return { run, stop, streaming };
}
