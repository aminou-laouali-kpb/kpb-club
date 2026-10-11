/** Édition des bourses par l'équipe : validation, duplication d'une année sur l'autre, export. */
import { z } from "zod";
import type { Tables } from "@/integrations/supabase/types";

export type BourseRow = Tables<"bourses">;
export type RequirementRow = Tables<"bourse_requirements">;

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const iso2 = z.string().regex(/^[A-Z]{2}$/);

export const essayCriteriaSchema = z
  .array(
    z.object({
      name: z.string().min(1).max(80),
      description: z.string().max(400),
      weight: z.number().min(0).max(100),
    }),
  )
  .max(12);

export const operationsOrderSchema = z.array(z.string().min(1).max(200)).max(30);

export const englishTestsSchema = z
  .array(
    z.object({
      test: z.enum(["ielts", "toefl", "duolingo"]),
      min_score: z.number().min(0).max(160),
    }),
  )
  .max(3);

export const bourseSchema = z.object({
  id: z
    .string()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Identifiant : minuscules, chiffres et tirets"),
  university_name: z.string().trim().min(2).max(200),
  country: z.string().trim().min(2).max(80),
  program_url: z.string().url().max(500).nullable(),
  eligible_nationalities: z.array(iso2).max(60),
  gender_restriction: z.enum(["F", "all"]),
  min_education: z.enum(["bac", "licence", "master", "doctorat", "autre"]).nullable(),
  max_age: z.number().int().min(14).max(80).nullable(),
  english_required: z.boolean(),
  financial_need_required: z.boolean(),
  window_opens: date,
  window_closes: date,
  window_confirmed: z.boolean(),
  academic_year: z.number().int().min(2020).max(2100).nullable(),
  notes: z.string().max(4000).nullable(),
  whatsapp_group_url: z.string().url().max(500).nullable(),
  video_url: z.string().url().max(500).nullable(),
  interview_format: z.enum(["none", "video", "panel", "written"]).nullable(),
  essay_criteria: essayCriteriaSchema.nullable(),
  operations_order: operationsOrderSchema.nullable(),
  english_tests: englishTestsSchema.nullable(),
  verified_by_kpb: z.boolean(),
  published: z.boolean(),
  level: z.array(z.enum(["licence", "master", "doctorat", "autre"])).max(4),
  funding: z.enum(["full", "partial", "tuition"]).nullable(),
});

export type BourseInput = z.infer<typeof bourseSchema>;

export const requirementSchema = z.object({
  id: z.string().uuid().optional(),
  bourse_id: z.string().min(1).max(120),
  kind: z.enum(["document", "essay", "recommendation", "form", "test", "other"]),
  label: z.string().trim().min(2).max(200),
  description: z.string().max(1000).nullable(),
  document_type: z.string().max(40).nullable(),
  essay_prompt: z.string().max(2000).nullable(),
  essay_max_words: z.number().int().min(50).max(5000).nullable(),
  essay_language: z.string().max(5).nullable(),
  recommenders_count: z.number().int().min(1).max(5).nullable(),
  sort_order: z.number().int().min(0).max(999),
  days_before_deadline: z.number().int().min(0).max(365).nullable(),
});

export type RequirementInput = z.infer<typeof requirementSchema>;

function shiftYears(day: string | null, years: number): string | null {
  if (!day) return null;
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  // 29 février → 28 février les années non bissextiles
  const target = new Date(Date.UTC(y + years, m - 1, d));
  if (target.getUTCMonth() !== m - 1) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

/** Identifiant de la copie : l'année finale est remplacée, sinon ajoutée. */
export function duplicateId(id: string, year: number) {
  return /-\d{4}$/.test(id) ? id.replace(/-\d{4}$/, `-${year}`) : `${id}-${year}`;
}

/**
 * « Dupliquer pour l'année suivante » : même bourse et mêmes exigences, dates décalées
 * d'un an et marquées à confirmer, non publiée tant que l'équipe n'a pas vérifié.
 */
export function duplicateBourse(
  bourse: BourseRow,
  requirements: RequirementRow[],
  now = new Date(),
) {
  const fromYear = bourse.academic_year ?? now.getUTCFullYear();
  const year = fromYear + 1;
  const id = duplicateId(bourse.id, year);
  const copy: BourseRow = {
    ...bourse,
    id,
    academic_year: year,
    window_opens: shiftYears(bourse.window_opens, 1),
    window_closes: shiftYears(bourse.window_closes, 1),
    window_confirmed: false,
    verified_by_kpb: false,
    published: false,
    updated_at: now.toISOString(),
  };
  const reqs = requirements.map(({ id: _id, ...r }) => ({ ...r, bourse_id: id }));
  return { bourse: copy, requirements: reqs, year };
}

const EXPORT_FIELDS = [
  "id",
  "university_name",
  "country",
  "program_url",
  "eligible_nationalities",
  "gender_restriction",
  "min_education",
  "max_age",
  "english_required",
  "english_tests",
  "financial_need_required",
  "level",
  "funding",
  "window_opens",
  "window_closes",
  "window_confirmed",
  "academic_year",
  "verified_by_kpb",
  "interview_format",
  "essay_criteria",
  "operations_order",
  "video_url",
  "whatsapp_group_url",
  "notes",
  "updated_at",
] as const;

/**
 * `bourses.json` : la base reste la seule source de vérité ; ce fichier sert
 * aux scripts vidéo et au SOP des agents. Seules les bourses publiées sont exportées.
 */
export function toBoursesJson(
  bourses: BourseRow[],
  requirements: RequirementRow[],
  now = new Date(),
) {
  const byBourse = new Map<string, RequirementRow[]>();
  for (const r of requirements) {
    const list = byBourse.get(r.bourse_id) ?? [];
    list.push(r);
    byBourse.set(r.bourse_id, list);
  }
  const list = bourses
    .filter((b) => b.published)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((b) => {
      const entry: Record<string, unknown> = {};
      for (const f of EXPORT_FIELDS) entry[f] = b[f];
      entry["requirements"] = (byBourse.get(b.id) ?? [])
        .sort((x, y) => x.sort_order - y.sort_order)
        .map((r) => ({
          kind: r.kind,
          label: r.label,
          description: r.description,
          document_type: r.document_type,
          essay_prompt: r.essay_prompt,
          essay_max_words: r.essay_max_words,
          essay_language: r.essay_language,
          recommenders_count: r.recommenders_count,
          days_before_deadline: r.days_before_deadline,
        }));
      return entry;
    });
  return { version: 1, generated_at: now.toISOString(), count: list.length, bourses: list };
}
