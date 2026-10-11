/** Ciblage d'une diffusion (bourse suivie, statut d'abonnement, pays). */
import { z } from "zod";

export const segmentSchema = z.object({
  bourseId: z.string().max(120).nullable(),
  status: z.enum(["all", "active", "expired", "free"]),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
});

export type Segment = z.infer<typeof segmentSchema>;

export type SegmentMember = {
  id: string;
  nationality: string | null;
  residence: string | null;
  /** `active` : accès en cours ; `expired` : a déjà payé ; `free` : jamais abonné. */
  status: "active" | "expired" | "free";
  bourseIds: string[];
  deletionRequested: boolean;
};

export function matchesSegment(m: SegmentMember, s: Segment) {
  if (m.deletionRequested) return false;
  if (s.status !== "all" && m.status !== s.status) return false;
  if (s.country && m.nationality !== s.country && m.residence !== s.country) return false;
  if (s.bourseId && !m.bourseIds.includes(s.bourseId)) return false;
  return true;
}

/** Statut d'abonnement à partir de la fin d'accès la plus lointaine. */
export function memberStatus(latestAccessEnd: string | null, now = new Date()) {
  if (!latestAccessEnd) return "free" as const;
  return new Date(latestAccessEnd).getTime() >= now.getTime()
    ? ("active" as const)
    : ("expired" as const);
}

export function describeSegment(s: Segment, bourseName?: string | null) {
  const parts = [
    s.status === "all"
      ? "tous les membres"
      : s.status === "active"
        ? "membres du Club"
        : s.status === "expired"
          ? "anciens membres du Club"
          : "membres gratuits",
  ];
  if (s.country) parts.push(`pays ${s.country}`);
  if (s.bourseId) parts.push(`qui suivent ${bourseName ?? s.bourseId}`);
  return parts.join(", ");
}

export const broadcastSchema = z.object({
  segment: segmentSchema,
  channels: z.array(z.enum(["whatsapp", "email"])).min(1),
  title: z.string().trim().min(3).max(60),
  body: z.string().trim().min(10).max(900),
  link: z.string().url().max(300).nullable(),
});

export type BroadcastInput = z.infer<typeof broadcastSchema>;

/** Texte de l'email d'une diffusion. */
export function broadcastEmail(input: BroadcastInput, fullName: string | null) {
  return `Bonjour ${fullName || ""},\n\n${input.body}${input.link ? `\n\n${input.link}` : ""}\n\nL'équipe KPB Education`;
}
