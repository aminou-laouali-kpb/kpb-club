import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { MemberNav } from "@/components/MemberNav";
import { useServerFn } from "@tanstack/react-start";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { useAttachCapturedReferral } from "@/hooks/useReferralCapture";
import { attachReferral } from "@/lib/referrals.functions";
import { useOfflineReplay } from "@/hooks/useOfflineReplay";
import { PrivacyGate } from "@/components/PrivacyGate";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: MemberLayout,
});

function MemberLayout() {
  useSessionGuard();
  const attach = useServerFn(attachReferral);
  useAttachCapturedReferral((code) => attach({ data: { code } }));
  useOfflineReplay();
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <PrivacyGate />
      <MemberNav />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
