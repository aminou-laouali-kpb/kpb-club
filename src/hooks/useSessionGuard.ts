import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { touchSession } from "@/lib/sessions.functions";

const KEY = "kpb_session_token";

function getToken() {
  if (typeof window === "undefined") return null;
  let token = window.localStorage.getItem(KEY);
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "");
    window.localStorage.setItem(KEY, token);
  }
  return token;
}

/** Plafond de 2 appareils connectés : déconnecte l'appareil le plus ancien. */
export function useSessionGuard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const stopped = useRef(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function beat() {
      if (stopped.current) return;
      try {
        const result = await touchSession({
          data: { token: token!, userAgent: navigator.userAgent.slice(0, 200) },
        });
        if (!result.allowed) {
          stopped.current = true;
          window.localStorage.removeItem(KEY);
          await queryClient.cancelQueries();
          queryClient.clear();
          await supabase.auth.signOut();
          toast.error("Votre compte est déjà utilisé sur deux appareils. Session fermée ici.");
          navigate({ to: "/auth", replace: true });
        }
      } catch {
        /* réseau indisponible : on réessaie au prochain battement */
      }
    }

    void beat();
    timer = setInterval(() => void beat(), 120_000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [navigate, queryClient]);
}
