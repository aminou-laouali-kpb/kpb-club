import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileText, LayoutDashboard, LogOut, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const items = [
  { to: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { to: "/guide", label: "Guide", icon: BookOpen },
  { to: "/templates", label: "Modèles", icon: FileText },
  { to: "/compte", label: "Compte", icon: User },
] as const;

export function MemberNav() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <>
      <div className="hidden border-b border-border bg-card/60 md:block">
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-2 text-sm">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeProps={{ className: "bg-secondary text-foreground" }}
              className="rounded-md px-3 py-2 text-foreground/70 transition-colors hover:bg-secondary"
            >
              {item.label}
            </Link>
          ))}
          <button
            onClick={signOut}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-foreground/70 transition-colors hover:bg-secondary"
          >
            <LogOut className="size-4" /> Déconnexion
          </button>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-4">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeProps={{ className: "text-primary" }}
              className="flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground"
            >
              <item.icon className="size-5" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
