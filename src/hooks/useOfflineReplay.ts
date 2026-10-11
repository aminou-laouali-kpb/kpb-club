import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { updateItemStatus } from "@/lib/applications.functions";

/** Au retour du réseau (ou au retour sur l'appli), envoie les actions faites hors ligne. */
export function useOfflineReplay() {
  const setItemStatus = useServerFn(updateItemStatus);
  const queryClient = useQueryClient();
  useEffect(() => {
    let running = false;
    const run = async () => {
      if (running || !navigator.onLine) return;
      running = true;
      try {
        const { replay } = await import("@/lib/offline/queue");
        const done = await replay({
          item_status: (op) => setItemStatus({ data: { itemId: op.itemId, status: op.status } }),
        });
        if (done > 0) {
          toast.success(
            `${done} modification${done > 1 ? "s" : ""} faite${done > 1 ? "s" : ""} hors ligne envoyée${done > 1 ? "s" : ""}.`,
          );
          void queryClient.invalidateQueries({ queryKey: ["application"] });
          void queryClient.invalidateQueries({ queryKey: ["applications"] });
          void queryClient.invalidateQueries({ queryKey: ["member-overview"] });
        }
      } finally {
        running = false;
      }
    };
    void run();
    const onVisible = () => document.visibilityState === "visible" && void run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [setItemStatus, queryClient]);
}
