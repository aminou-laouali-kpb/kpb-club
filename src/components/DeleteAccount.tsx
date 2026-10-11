import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestAccountDeletion } from "@/lib/privacy.functions";
import { DELETION_CONFIRM_WORD, DELETION_DELAY_DAYS } from "@/lib/privacy";

/** « Supprimer mon compte et mes documents » : effacement définitif après 7 jours. */
export function DeleteAccount() {
  const queryClient = useQueryClient();
  const request = useServerFn(requestAccountDeletion);
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const mutation = useMutation({
    mutationFn: () => request({ data: { confirm: DELETION_CONFIRM_WORD } }),
    onSuccess: (res) => {
      setOpen(false);
      setWord("");
      toast.success(
        `Suppression programmée le ${new Date(res.deletionDueAt).toLocaleDateString("fr-FR")}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["privacy"] });
    },
    onError: () => toast.error("La demande n'a pas pu être enregistrée. Réessaie."),
  });

  return (
    <section className="rounded-xl border border-destructive/40 bg-card p-5">
      <h2 className="font-display text-lg font-semibold">Supprimer mon compte et mes documents</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ton profil, tes candidatures, tes essais, tes documents et tes échanges avec le coach sont
        effacés définitivement {DELETION_DELAY_DAYS} jours après ta demande. Tu peux annuler pendant
        ce délai. Tes paiements restent enregistrés pour la comptabilité, sans ton nom.
      </p>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="mt-4">
            <Trash2 className="size-4" /> Supprimer mon compte
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement ton compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              Pour confirmer, écris <strong>{DELETION_CONFIRM_WORD}</strong> ci-dessous. Un
              abonnement en cours n'est pas remboursé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            aria-label="Mot de confirmation"
            autoComplete="off"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Garder mon compte</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={word.trim().toUpperCase() !== DELETION_CONFIRM_WORD || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Confirmer la suppression
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
