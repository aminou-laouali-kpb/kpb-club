import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { SiteHeader } from "@/components/SiteHeader";
import { consumePendingProfile } from "@/lib/pendingProfile";
import { PhoneLogin } from "@/components/auth/PhoneLogin";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — KPB Education" },
      {
        name: "description",
        content:
          "Connectez-vous à votre espace membre KPB Education ou créez votre compte gratuit.",
      },
      { property: "og:title", content: "Connexion — KPB Education" },
      {
        property: "og:description",
        content: "Accédez à votre espace membre du Club Boursier KPB Education.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function syncPendingProfile() {
    const pending = consumePendingProfile();
    if (!pending) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from("profiles").update(pending).eq("auth_user_id", data.user.id);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setPendingEmail(true);
          toast.success("Compte créé. Vérifiez votre boîte mail pour confirmer.");
          return;
        }
        await syncPendingProfile();
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        await syncPendingProfile();
        navigate({ to: "/dashboard" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Une erreur est survenue";
      toast.error(
        message.includes("Invalid login credentials")
          ? "Email ou mot de passe incorrect."
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Connexion Google indisponible pour le moment.");
      return;
    }
    if (result.redirected) return;
    await syncPendingProfile();
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="font-display text-3xl font-semibold">Connexion ou inscription</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Votre compte sauvegarde votre profil, vos candidatures et vos documents.
        </p>

        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <PhoneLogin
            onSignedIn={async () => {
              await syncPendingProfile();
              navigate({ to: "/dashboard" });
            }}
          />
        </div>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
        </div>

        {!showEmail ? (
          <div className="space-y-3">
            <button
              onClick={() => setShowEmail(true)}
              className="w-full rounded-md border border-input bg-card px-4 py-3 font-medium transition-colors hover:bg-secondary"
            >
              Utiliser mon email
            </button>
            <button
              onClick={handleGoogle}
              className="w-full rounded-md border border-input bg-card px-4 py-3 font-medium transition-colors hover:bg-secondary"
            >
              Continuer avec Google
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-display text-xl font-semibold">
              {mode === "signin" ? "Se connecter par email" : "Créer un compte avec mon email"}
            </h2>

            {pendingEmail ? (
              <div className="mt-6 rounded-xl border border-border bg-card p-5 text-sm">
                Un email de confirmation vient de vous être envoyé à <strong>{email}</strong>.
                Cliquez sur le lien puis revenez vous connecter.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {mode === "signup" && (
                  <div>
                    <label className="text-sm font-medium" htmlFor="fullName">
                      Nom complet
                    </label>
                    <input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      maxLength={120}
                      className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={255}
                    className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor="password">
                    Mot de passe
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {busy ? "Un instant…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}
                </button>
              </form>
            )}

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> ou{" "}
              <span className="h-px flex-1 bg-border" />
            </div>

            <button
              onClick={handleGoogle}
              className="w-full rounded-md border border-input bg-card px-4 py-3 font-medium transition-colors hover:bg-secondary"
            >
              Continuer avec Google
            </button>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signin" ? "Pas encore de compte ?" : "Vous avez déjà un compte ?"}{" "}
              <button
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setPendingEmail(false);
                }}
                className="font-medium text-primary underline underline-offset-4"
              >
                {mode === "signin" ? "Créer un compte" : "Se connecter"}
              </button>
            </p>
          </>
        )}
        <p className="mt-4 text-center text-sm">
          <Link to="/verificateur" className="text-muted-foreground underline underline-offset-4">
            Tester d'abord mon éligibilité
          </Link>
        </p>
      </main>
    </div>
  );
}
