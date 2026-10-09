import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarClock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { countryName } from "@/lib/countries";
import {
  STATUS_LABELS,
  daysUntil,
  deadlineLabel,
  type ApplicationStatus,
} from "@/lib/applications";

export type ApplicationSummary = {
  id: string;
  status: string;
  deadline: string | null;
  readiness: number;
  next_action: string | null;
  bourses: unknown;
};

export function ApplicationCard({ app }: { app: ApplicationSummary }) {
  const bourse = app.bourses as { university_name: string; country: string } | null;
  const days = daysUntil(app.deadline);
  const urgent = days !== null && days <= 14 && days >= 0;
  return (
    <Link
      to="/candidatures/$id"
      params={{ id: app.id }}
      className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-semibold">
            {bourse?.university_name ?? "Bourse"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {countryName(bourse?.country)} · {STATUS_LABELS[app.status as ApplicationStatus]}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
            urgent ? "bg-destructive/10 text-destructive" : "bg-secondary text-foreground/80"
          }`}
        >
          <CalendarClock className="size-3.5" /> {deadlineLabel(app.deadline)}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Progress value={app.readiness} className="h-2 flex-1" aria-label="Préparation" />
        <span className="w-10 text-right text-sm font-medium">{app.readiness}%</span>
      </div>
      {app.next_action && (
        <p className="mt-3 flex items-center gap-1.5 text-sm">
          <ArrowRight className="size-4 shrink-0 text-primary" />
          <span className="truncate">{app.next_action}</span>
        </p>
      )}
    </Link>
  );
}
