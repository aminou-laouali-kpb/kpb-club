import { createFileRoute } from "@tanstack/react-router";

/**
 * Export `bourses.json` (scripts vidéo, SOP des agents).
 * Accès : jeton de session d'un admin, ou jeton des tâches planifiées (n8n, scripts).
 */
export const Route = createFileRoute("/api/admin/bourses.json")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token) return new Response("Unauthorized", { status: 401 });

        const { data: auth } = await supabaseAdmin.auth.getUser(token);
        if (auth.user) {
          const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
            _user_id: auth.user.id,
            _role: "admin",
          });
          if (!isAdmin) return new Response("Forbidden", { status: 403 });
        } else {
          const { guardCronRequest } = await import("@/lib/cron-guard.server");
          const denied = await guardCronRequest(request);
          if (denied) return denied;
        }

        const { toBoursesJson } = await import("@/lib/admin/bourses");
        const [{ data: bourses, error }, { data: requirements }] = await Promise.all([
          supabaseAdmin.from("bourses").select("*"),
          supabaseAdmin.from("bourse_requirements").select("*"),
        ]);
        if (error) return new Response(error.message, { status: 500 });
        const body = JSON.stringify(toBoursesJson(bourses ?? [], requirements ?? []), null, 2);
        return new Response(body, {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "content-disposition": 'attachment; filename="bourses.json"',
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
