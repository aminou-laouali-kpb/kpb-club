import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { generateAccessCodes, listAccessCodes, setAccessCodeActive } from "@/lib/admin.functions";
import { formatAccessCode } from "@/lib/access-codes";
import { formatDateFr } from "@/lib/matching";

type Redemption = {
  redeemed_at: string;
  profiles: { full_name: string | null; member_code: string | null } | null;
};

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AccessCodesPanel() {
  const fetchCodes = useServerFn(listAccessCodes);
  const generate = useServerFn(generateAccessCodes);
  const toggle = useServerFn(setAccessCodeActive);
  const queryClient = useQueryClient();

  const [count, setCount] = useState(10);
  const [durationDays, setDurationDays] = useState(30);
  const [maxUses, setMaxUses] = useState(1);
  const [expiresAt, setExpiresAt] = useState("");
  const [batchLabel, setBatchLabel] = useState("");
  const [filter, setFilter] = useState("");

  const { data: codes = [] } = useQuery({
    queryKey: ["admin-access-codes"],
    queryFn: () => fetchCodes(),
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-access-codes"] });

  const generateMutation = useMutation({
    mutationFn: () =>
      generate({
        data: {
          count,
          durationDays,
          maxUses,
          expiresAt: expiresAt || null,
          batchLabel: batchLabel.trim() || null,
        },
      }),
    onSuccess: (result) => {
      toast.success(`${result.codes.length} code(s) générés`);
      downloadCsv(
        `codes-kpb-${batchLabel.trim() || "lot"}-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          ["code", "duree_jours", "usages_max", "expire_le", "lot"],
          ...result.codes.map((c) => [
            formatAccessCode(c),
            String(durationDays),
            String(maxUses),
            expiresAt,
            batchLabel,
          ]),
        ],
      );
      void refresh();
    },
    onError: () => toast.error("Génération impossible"),
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string; active: boolean }) => toggle({ data: vars }),
    onSuccess: () => void refresh(),
    onError: () => toast.error("Action impossible"),
  });

  const visible = codes.filter(
    (c) =>
      !filter ||
      c.code.includes(filter.toUpperCase().replace(/[\s-]/g, "")) ||
      (c.batch_label ?? "").toLowerCase().includes(filter.toLowerCase()),
  );

  const exportVisible = () =>
    downloadCsv(`codes-kpb-export-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["code", "lot", "duree_jours", "usages", "usages_max", "expire_le", "actif", "utilise_par"],
      ...visible.map((c) => [
        formatAccessCode(c.code),
        c.batch_label ?? "",
        String(c.duration_days),
        String(c.uses_count),
        String(c.max_uses),
        c.expires_at ? c.expires_at.slice(0, 10) : "",
        c.active ? "oui" : "non",
        ((c.access_code_redemptions ?? []) as unknown as Redemption[])
          .map((r) => `${r.profiles?.full_name ?? ""} (${r.profiles?.member_code ?? ""})`)
          .join(", "),
      ]),
    ]);

  const field = "rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <section>
      <h2 className="font-display text-xl font-semibold">Codes d'accès au Club</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Chaque code (16 caractères) ouvre l'accès Club pendant la durée choisie, sans paiement.
      </p>

      <form
        className="mt-4 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          generateMutation.mutate();
        }}
      >
        <label className="text-sm">
          Nombre de codes
          <input
            type="number"
            min={1}
            max={500}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className={`mt-1 w-full ${field}`}
          />
        </label>
        <label className="text-sm">
          Durée d'accès (jours)
          <input
            type="number"
            min={1}
            max={730}
            value={durationDays}
            onChange={(e) => setDurationDays(Number(e.target.value))}
            className={`mt-1 w-full ${field}`}
          />
        </label>
        <label className="text-sm">
          Utilisations par code
          <input
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(Number(e.target.value))}
            className={`mt-1 w-full ${field}`}
          />
        </label>
        <label className="text-sm">
          Valable jusqu'au (optionnel)
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={`mt-1 w-full ${field}`}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Libellé du lot (optionnel)
          <input
            value={batchLabel}
            maxLength={80}
            placeholder="ex. Ambassadeurs octobre"
            onChange={(e) => setBatchLabel(e.target.value)}
            className={`mt-1 w-full ${field}`}
          />
        </label>
        <button
          type="submit"
          disabled={generateMutation.isPending}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60 sm:col-span-3 sm:justify-self-start"
        >
          {generateMutation.isPending ? "Génération…" : "Générer et télécharger (CSV)"}
        </button>
      </form>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Rechercher un code ou un lot"
          className={`flex-1 ${field}`}
        />
        <button
          onClick={exportVisible}
          disabled={visible.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60"
        >
          <Download className="size-4" /> Exporter ({visible.length})
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Aucun code.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
          {visible.slice(0, 200).map((c) => {
            const redemptions = (c.access_code_redemptions ?? []) as unknown as Redemption[];
            const expired = c.expires_at && new Date(c.expires_at).getTime() < Date.now();
            return (
              <li
                key={c.id}
                className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center"
              >
                <div className="flex-1">
                  <p className="font-mono font-medium tracking-wider">{formatAccessCode(c.code)}</p>
                  <p className="text-muted-foreground">
                    {c.duration_days} j · {c.uses_count}/{c.max_uses} utilisation(s)
                    {c.batch_label ? ` · ${c.batch_label}` : ""}
                    {c.expires_at
                      ? ` · ${expired ? "expiré" : "valable"} jusqu'au ${formatDateFr(c.expires_at)}`
                      : ""}
                  </p>
                  {redemptions.length > 0 && (
                    <p className="text-muted-foreground">
                      Utilisé par :{" "}
                      {redemptions
                        .map(
                          (r) =>
                            `${r.profiles?.full_name || "—"} (${r.profiles?.member_code ?? ""})`,
                        )
                        .join(", ")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => toggleMutation.mutate({ id: c.id, active: !c.active })}
                  className="rounded-md border border-border px-3 py-1.5 text-xs"
                >
                  {c.active ? "Désactiver" : "Réactiver"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
