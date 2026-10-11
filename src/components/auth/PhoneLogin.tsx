import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { otpDeliveryStatus, requestOtp, verifyOtp } from "@/lib/otp.functions";
import { DIAL_CODES, maskPhone } from "@/lib/phone";
import { SMS_FALLBACK_AFTER_MS } from "@/lib/otp";

const inputCls =
  "w-full rounded-md border border-input bg-card px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring";

/** Connexion par code envoyé sur WhatsApp, avec passage automatique au SMS si non livré. */
export function PhoneLogin({ onSignedIn }: { onSignedIn: (created: boolean) => void }) {
  const send = useServerFn(requestOtp);
  const verify = useServerFn(verifyOtp);
  const status = useServerFn(otpDeliveryStatus);

  const [country, setCountry] = useState("NE");
  const [phone, setPhone] = useState("");
  const [e164, setE164] = useState<string | null>(null);
  const [channel, setChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const fallbackDone = useRef(false);

  async function sendCode(via: "whatsapp" | "sms") {
    setBusy(true);
    try {
      const res = await send({ data: { phone: e164 ?? phone, country, channel: via } });
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      setE164(res.phone);
      setChannel(via);
      setCode("");
      setSecondsLeft(Math.round(SMS_FALLBACK_AFTER_MS / 1000));
      if (via === "sms") toast.success("Code envoyé par SMS.");
      return true;
    } catch {
      toast.error("Envoi impossible. Vérifie ta connexion.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Compte à rebours, puis repli SMS automatique si WhatsApp n'a pas livré le code
  useEffect(() => {
    if (!e164 || secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [e164, secondsLeft]);

  useEffect(() => {
    if (!e164 || secondsLeft !== 0 || channel !== "whatsapp" || fallbackDone.current) return;
    fallbackDone.current = true;
    void status({ data: { phone: e164 } }).then((s) => {
      if (!s.delivered) {
        toast.info("Le message WhatsApp n'est pas arrivé : on t'envoie le code par SMS.");
        void sendCode("sms");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, e164, channel]);

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!e164) return;
    setBusy(true);
    try {
      const res = await verify({ data: { phone: e164, code } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { error } = await supabase.auth.verifyOtp({
        token_hash: res.tokenHash,
        type: "magiclink",
      });
      if (error) throw error;
      onSignedIn(res.created);
    } catch {
      toast.error("Connexion impossible. Demande un nouveau code.");
    } finally {
      setBusy(false);
    }
  }

  if (!e164) {
    return (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void sendCode("whatsapp");
        }}
      >
        <label className="block text-sm font-medium" htmlFor="phone">
          Ton numéro WhatsApp
        </label>
        <div className="flex gap-2">
          <select
            aria-label="Indicatif du pays"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-32 rounded-md border border-input bg-card px-2 py-2.5 text-base"
          >
            {DIAL_CODES.map((d) => (
              <option key={d.country} value={d.country}>
                {d.label} +{d.code}
              </option>
            ))}
          </select>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="90 12 34 56"
            className={inputCls}
          />
        </div>
        <button
          type="submit"
          disabled={busy || phone.trim().length < 6}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground disabled:opacity-60"
        >
          <MessageCircle className="size-4" />
          {busy ? "Envoi…" : "Recevoir mon code sur WhatsApp"}
        </button>
        <p className="text-xs text-muted-foreground">
          Pas de mot de passe à retenir. Si tu n'as pas de compte, il est créé automatiquement.
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={submitCode} className="space-y-3">
      <p className="text-sm">
        Code envoyé {channel === "whatsapp" ? "sur WhatsApp" : "par SMS"} au{" "}
        <strong>{maskPhone(e164)}</strong>.
      </p>
      <input
        aria-label="Code à 6 chiffres"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className={`${inputCls} text-center font-mono text-2xl tracking-[0.5em]`}
      />
      <button
        type="submit"
        disabled={busy || code.length !== 6}
        className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Vérification…" : "Se connecter"}
      </button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            setE164(null);
            setCode("");
            fallbackDone.current = false;
          }}
          className="text-muted-foreground underline underline-offset-4"
        >
          Changer de numéro
        </button>
        {secondsLeft > 0 ? (
          <span className="text-muted-foreground">Pas reçu ? SMS dans {secondsLeft} s</span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              fallbackDone.current = true;
              void sendCode("sms");
            }}
            className="font-medium text-primary underline underline-offset-4"
          >
            Recevoir par SMS
          </button>
        )}
      </div>
    </form>
  );
}
