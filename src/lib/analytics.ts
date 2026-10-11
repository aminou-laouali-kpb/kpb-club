/** Événements produit suivis (spec §17). */
export const EVENT_NAMES = [
  "signup",
  "onboarding_done",
  "application_created",
  "item_done",
  "doc_uploaded",
  "essay_reviewed",
  "chapter_read",
  "payment_success",
  "renewal_success",
  "churned",
  "alert_clicked",
  "whatsapp_command",
  "coach_used",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** Fonctionnalités observées avant un churn (regroupement des événements d'usage). */
export const FEATURE_EVENTS: EventName[] = [
  "application_created",
  "item_done",
  "doc_uploaded",
  "essay_reviewed",
  "chapter_read",
  "whatsapp_command",
  "coach_used",
];
