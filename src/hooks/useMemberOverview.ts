import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMemberOverview } from "@/lib/member.functions";

export function useMemberOverview() {
  const fetchOverview = useServerFn(getMemberOverview);
  return useQuery({
    queryKey: ["member-overview"],
    queryFn: () => fetchOverview(),
  });
}

export function watermarkFor(profile: { full_name?: string | null; member_code?: string | null }) {
  const name = profile.full_name?.trim() || "Membre";
  return `${name.toUpperCase()} — ${profile.member_code ?? "KPB"}`;
}

export function hasAccess(state?: string) {
  return state === "active" || state === "grace";
}
