import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { AccessCodeForm } from "./AccessCodeForm";

export function MemberGate() {
  return (
    <div className="rounded-xl border border-accent/50 bg-accent/10 p-6 text-center">
      <Lock className="mx-auto size-6 text-accent-foreground" />
      <h2 className="mt-3 font-display text-xl font-semibold">Réservé aux membres du Club</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Activez votre abonnement pour accéder au guide et aux modèles.
      </p>
      <Link
        to="/offre"
        className="mt-4 inline-flex rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
      >
        Voir les tarifs
      </Link>
      <div className="mt-4 flex justify-center">
        <AccessCodeForm />
      </div>
    </div>
  );
}
