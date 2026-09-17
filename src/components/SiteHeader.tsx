import { Link } from "@tanstack/react-router";
import { useSession } from "@/hooks/useSession";

export function SiteHeader() {
  const { session } = useSession();

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="font-display text-lg font-semibold tracking-tight">
          KPB<span className="text-accent">.</span>Education
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link
            to="/verificateur"
            className="rounded-md px-3 py-2 text-foreground/80 transition-colors hover:bg-secondary"
          >
            Vérificateur
          </Link>
          {session ? (
            <Link
              to="/dashboard"
              className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Mon espace
            </Link>
          ) : (
            <Link
              to="/auth"
              className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Se connecter
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
