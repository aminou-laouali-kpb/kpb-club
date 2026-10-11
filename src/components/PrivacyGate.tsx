import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  acceptConsent,
  cancelAccountDeletion,
  getPrivacyState,
  trackClientEvent,
} from "@/lib/privacy.functions";
import { readPendingConsent, clearPendingConsent } from "@/lib/consent.browser";

/**
 * Consentement (CGU, données, WhatsApp), bandeau de suppression programmée
 * et suivi des clics depuis les alertes.
 */
export function PrivacyGate() {
  const queryClient = useQueryClient();
  const fetchState = useServerFn(getPrivacyState);
  const accept = useServerFn(acceptConsent);
  const cancel = useServerFn(cancelAccountDeletion);
  const trackFn = useServerFn(trackClientEvent);
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.get("src") !== "alert") return;
    void trackFn({ data: { name: "alert_clicked", source: "alert" } }).catch(() => {});
    url.searchParams.delete("src");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [trackFn]);

  const state = useQuery({
    queryKey: ["privacy"],
    queryFn: () => fetchState(),
    networkMode: "online",
    staleTime: 5 * 60_000,
  });

  // Accord donné sur l'écran de connexion : enregistré dès l'arrivée, sans redemander
  const [pending, setPending] = useState(() => readPendingConsent());
  const consent = useMutation({
    mutationFn: (whatsapp: boolean) => accept({ data: { terms: true, whatsapp } }),
    onSuccess: () => {
      clearPendingConsent();
      void queryClient.invalidateQueries({ queryKey: ["privacy"] });
    },
    onError: () => setPending(null),
  });
  const autoSent = useRef(false);
  const { mutate } = consent;
  useEffect(() => {
    if (!state.data?.needsConsent || !pending || autoSent.current) return;
    autoSent.current = true;
    mutate(pending.whatsapp);
  }, [state.data?.needsConsent, pending, mutate]);

  const cancelMutation = useMutation({
    mutationFn: () => cancel(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["privacy"] }),
  });

  const [terms, setTerms] = useState(false);
  const [whatsapp, setWhatsapp] = useState(true);
  const showDialog = Boolean(state.data?.needsConsent) && !pending;

  return (
    <>
      {state.data?.deletionDueAt && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-center gap-3 bg-destructive px-4 py-2 text-center text-xs text-destructive-foreground"
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          Ton compte et tes documents seront supprimés le{" "}
          {new Date(state.data.deletionDueAt).toLocaleDateString("fr-FR")}.
          <Button
            size="sm"
            variant="secondary"
            className="h-7"
            disabled={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate()}
          >
            Annuler la suppression
          </Button>
        </div>
      )}
      <Dialog open={showDialog}>
        <DialogContent
          className="max-w-md [&>button]:hidden"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Avant de continuer</DialogTitle>
            <DialogDescription>
              Nos conditions ont été mises à jour. Merci de les accepter pour continuer.
            </DialogDescription>
          </DialogHeader>
          <ConsentFields
            terms={terms}
            whatsapp={whatsapp}
            onTerms={setTerms}
            onWhatsapp={setWhatsapp}
          />
          <Button disabled={!terms || consent.isPending} onClick={() => consent.mutate(whatsapp)}>
            Continuer
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Cases de consentement partagées par la connexion et la mise à jour des conditions. */
export function ConsentFields(props: {
  terms: boolean;
  whatsapp: boolean;
  onTerms: (v: boolean) => void;
  onWhatsapp: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <label className="flex items-start gap-2">
        <Checkbox
          checked={props.terms}
          onCheckedChange={(v) => props.onTerms(v === true)}
          className="mt-0.5"
        />
        <span>
          J'accepte les{" "}
          <Link to="/cgu" target="_blank" className="underline">
            conditions d'utilisation
          </Link>{" "}
          et la{" "}
          <Link to="/confidentialite" target="_blank" className="underline">
            politique de données
          </Link>
          .
        </span>
      </label>
      <label className="flex items-start gap-2">
        <Checkbox
          checked={props.whatsapp}
          onCheckedChange={(v) => props.onWhatsapp(v === true)}
          className="mt-0.5"
        />
        <span>
          Je veux recevoir mes rappels et alertes sur WhatsApp (modifiable à tout moment).
        </span>
      </label>
    </div>
  );
}
