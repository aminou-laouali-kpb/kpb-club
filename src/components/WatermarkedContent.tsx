import type { ReactNode } from "react";

export function WatermarkedContent({
  watermark,
  children,
}: {
  watermark: string;
  children: ReactNode;
}) {
  return (
    <div
      className="kpb-protected rounded-xl border border-border bg-card p-5 md:p-8"
      data-watermark={watermark}
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
    >
      {children}
      <p className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
        Contenu réservé aux membres du Club Boursier. Diffusion interdite.
      </p>
    </div>
  );
}
