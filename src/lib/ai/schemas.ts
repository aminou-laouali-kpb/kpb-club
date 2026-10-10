/**
 * Formats de sortie du coach IA. Ils utilisent `zod/v4`, attendu par l'assistant
 * `betaZodOutputFormat` du SDK Anthropic, et servent aussi à revalider côté serveur.
 */
import * as z from "zod/v4";

const quote = z.string().describe("Citation exacte, mot pour mot, tirée du texte de l'étudiant");

export const EssayReview = z.object({
  refusal: z
    .string()
    .nullable()
    .describe("Rempli seulement si l'étudiant demande qu'on écrive à sa place ; sinon null"),
  overall_score: z.number().int().min(0).max(100),
  verdict: z.string().describe("Deux phrases maximum : où en est l'essai"),
  criteria: z.array(
    z.object({
      name: z.string(),
      score: z.number().int().min(0).max(10),
      justification: z.string(),
    }),
  ),
  strengths: z.array(z.object({ point: z.string(), quote })).max(3),
  gaps: z
    .array(
      z.object({
        criterion: z.string(),
        issue: z.string().describe("Ce qui manque, sans proposer de formulation de remplacement"),
        quote,
      }),
    )
    .max(3),
  questions_to_ask: z.array(z.string()).max(5),
  generic_signals: z
    .array(z.string())
    .describe("Passages génériques ou qui sonnent comme produits par une IA"),
  length: z.object({
    words: z.number().int(),
    max_words: z.number().int().nullable(),
    ok: z.boolean(),
  }),
  language: z.object({ expected: z.string(), detected: z.string(), ok: z.boolean() }),
});
export type EssayReview = z.infer<typeof EssayReview>;

export const CvReview = z.object({
  refusal: z.string().nullable(),
  overall_score: z.number().int().min(0).max(100),
  verdict: z.string(),
  missing_sections: z.array(z.string()),
  date_issues: z.array(z.object({ issue: z.string(), quote })),
  weak_phrasings: z
    .array(z.object({ quote, why: z.string().describe("Pourquoi c'est faible, sans réécrire") }))
    .max(6),
  recommended_order: z.array(z.string()),
  next_steps: z.array(z.string()).max(3),
});
export type CvReview = z.infer<typeof CvReview>;

export const InterviewPlan = z.object({
  questions: z
    .array(
      z.object({ question: z.string(), intent: z.string().describe("Ce que le jury cherche") }),
    )
    .min(6)
    .max(8),
});
export type InterviewPlan = z.infer<typeof InterviewPlan>;

export const InterviewDebrief = z.object({
  overall: z.string(),
  score: z.number().int().min(0).max(100),
  strengths: z.array(z.string()).max(3),
  focus_areas: z
    .array(z.object({ area: z.string(), advice: z.string() }))
    .length(3)
    .describe("Les 3 axes à travailler"),
});
export type InterviewDebrief = z.infer<typeof InterviewDebrief>;

export const DocTypeGuess = z.object({
  type: z.enum([
    "diploma_bac",
    "diploma_licence",
    "diploma_master",
    "transcript",
    "cv",
    "motivation_letter",
    "recommendation_letter",
    "english_test",
    "proof_of_income",
    "proof_of_residence",
    "other",
  ]),
  confidence: z.number().min(0).max(1),
  label: z.string().describe("Nom court du document, ex. « Relevé de notes L3 2025 »"),
});
export type DocTypeGuess = z.infer<typeof DocTypeGuess>;
