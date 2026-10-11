import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { redeemAccessCode } from "@/lib/payments.functions";
import { formatDateFr } from "@/lib/matching";

/** Champ « J'ai un code d'accès » : active le Club sans paiement. */
export function AccessCodeForm({ className = "" }: { className?: string }) {
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);
  const redeem = useServerFn(redeemAccessCode);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => redeem({ data: { code } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Accès activé jusqu'au ${formatDateFr(result.endsAt)}.`);
      setCode("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["member-overview"] });
    },
    onError: () => toast.error("Impossible de vérifier ce code. Réessayez."),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline ${className}`}
      >
        <KeyRound className="size-4" /> J'ai un code d'accès
      </button>
    );
  }

  return (
    <form
      className={`flex flex-col gap-2 sm:flex-row ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) mutation.mutate();
      }}
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="XXXX-XXXX-XXXX-XXXX"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={24}
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 font-mono text-sm tracking-wider sm:max-w-xs"
        aria-label="Code d'accès"
      />
      <button
        type="submit"
        disabled={mutation.isPending || !code.trim()}
        className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {mutation.isPending ? "Vérification…" : "Activer"}
      </button>
    </form>
  );
}
