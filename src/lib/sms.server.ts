/** Envoi de SMS (Africa's Talking), utilisé seulement en secours pour les codes de connexion. */

export function smsConfigured() {
  return Boolean(process.env["SMS_API_KEY"] && process.env["SMS_USERNAME"]);
}

export async function sendSms(phone: string, message: string) {
  const apiKey = process.env["SMS_API_KEY"];
  const username = process.env["SMS_USERNAME"];
  if (!apiKey || !username) throw new Error("SMS non configuré");
  const sandbox = username === "sandbox";
  const body = new URLSearchParams({ username, to: phone, message });
  const from = process.env["SMS_SENDER_ID"];
  if (from) body.set("from", from);
  const res = await fetch(
    `https://api.${sandbox ? "sandbox." : ""}africastalking.com/version1/messaging`,
    {
      method: "POST",
      headers: {
        apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  if (!res.ok) throw new Error(`SMS HTTP ${res.status}`);
  const json = (await res.json().catch(() => null)) as {
    SMSMessageData?: { Recipients?: { status: string; messageId: string }[] };
  } | null;
  const recipient = json?.SMSMessageData?.Recipients?.[0];
  if (!recipient || recipient.status !== "Success") throw new Error("SMS refusé par l'opérateur");
  return recipient.messageId;
}
