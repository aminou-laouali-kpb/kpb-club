import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { confirmLinkPhone, linkPhone } from "@/lib/otp.functions";
import { DIAL_CODES, maskPhone } from "@/lib/phone";

/** Relier (ou changer) le numéro WhatsApp d'un compte, vérifié par code. */
export function WhatsAppLink({ verifiedPhone }: { verifiedPhone: string | null }) {
  const sendCode = useServerFn(linkPhone);
  const confirm = useServerFn(confirmLinkPhone);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(!verifiedPhone);
  const [country, setCountry] = useState("NE");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const request = async (channel: "whatsapp" | "sms") => {
    setBusy(true);
    try {
      const res = await sendCode({ data: { phone: pending ?? phone, country, channel } });
      if (!res.ok) toast.error(res.error);
      else {
        setPending(res.phone);
        toast.success(channel === "sms" ? "Code envoyé par SMS." : "Code envoyé sur WhatsApp.");
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await confirm({ data: { phone: pending, code } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Numéro WhatsApp relié.");
      setEditing(false);
      setPending(null);
      setCode("");
      void queryClient.invalidateQueries({ queryKey: ["member-overview"] });
    } finally {
      setBusy(false);
    }
  };

  if (!editing && verifiedPhone) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="size-4 text-primary" /> WhatsApp vérifié :{" "}
          {maskPhone(verifiedPhone)}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="text-primary underline-offset-4 hover:underline"
        >
          Changer de numéro
        </button>
      </div>
    );
  }

  const field = "rounded-md border border-input bg-background px-3 py-2.5 text-base";
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Relie ton WhatsApp pour te connecter sans mot de passe, recevoir tes rappels et utiliser le
        bot (« statut », « échéances », envoi de documents).
      </p>
      {!pending ? (
        <div className="flex flex-wrap gap-2">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={`w-32 ${field}`}
            aria-label="Indicatif"
          >
            {DIAL_CODES.map((d) => (
              <option key={d.country} value={d.country}>
                {d.label} +{d.code}
              </option>
            ))}
          </select>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Numéro WhatsApp"
            className={`min-w-0 flex-1 ${field}`}
          />
          <button
            type="button"
            disabled={busy || phone.trim().length < 6}
            onClick={() => void request("whatsapp")}
            className="rounded-md bg-primary px-4 py-2.5 font-medium text-primary-foreground disabled:opacity-60"
          >
            Recevoir un code
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="Code à 6 chiffres"
            className={`w-40 font-mono tracking-widest ${field}`}
          />
          <button
            type="button"
            disabled={busy || code.length !== 6}
            onClick={() => void submit()}
            className="rounded-md bg-primary px-4 py-2.5 font-medium text-primary-foreground disabled:opacity-60"
          >
            Vérifier
          </button>
          <button
            type="button"
            onClick={() => void request("sms")}
            disabled={busy}
            className="text-primary underline-offset-4 hover:underline"
          >
            Recevoir par SMS
          </button>
        </div>
      )}
    </div>
  );
}
