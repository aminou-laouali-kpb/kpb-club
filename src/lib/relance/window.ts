/** Fenêtre d'envoi : messages entre 8 h et 20 h dans le fuseau du membre. */

export const DEFAULT_TIMEZONE = "Africa/Niamey";
export const SEND_START_HOUR = 8;
export const SEND_END_HOUR = 20;

const COUNTRY_TIMEZONES: Record<string, string> = {
  NE: "Africa/Niamey",
  ML: "Africa/Bamako",
  BF: "Africa/Ouagadougou",
  SN: "Africa/Dakar",
  CI: "Africa/Abidjan",
  GN: "Africa/Conakry",
  TG: "Africa/Lome",
  BJ: "Africa/Porto-Novo",
  CM: "Africa/Douala",
  TD: "Africa/Ndjamena",
  GA: "Africa/Libreville",
  CG: "Africa/Brazzaville",
  CD: "Africa/Kinshasa",
  MR: "Africa/Nouakchott",
  MA: "Africa/Casablanca",
  TN: "Africa/Tunis",
  DZ: "Africa/Algiers",
  RW: "Africa/Kigali",
  BI: "Africa/Bujumbura",
  MG: "Indian/Antananarivo",
  KM: "Indian/Comoro",
  DJ: "Africa/Djibouti",
  CF: "Africa/Bangui",
  GH: "Africa/Accra",
  NG: "Africa/Lagos",
  FR: "Europe/Paris",
  BE: "Europe/Brussels",
  CH: "Europe/Zurich",
  CA: "America/Toronto",
  US: "America/New_York",
};

/** Fuseaux proposés dans le profil (sans doublon, triés). */
export const TIMEZONE_OPTIONS = [...new Set(Object.values(COUNTRY_TIMEZONES))].sort();

export function timezoneForCountry(code: string | null | undefined): string {
  return (code && COUNTRY_TIMEZONES[code.toUpperCase()]) || DEFAULT_TIMEZONE;
}

export function isValidTimezone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Heure et minute locales d'un instant dans un fuseau. */
export function localTime(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: get("hour"), minute: get("minute") };
}

/**
 * Prochain instant d'envoi autorisé : maintenant si l'on est dans la fenêtre
 * locale, sinon le prochain 8 h local (à la minute près, changements d'heure compris).
 */
export function nextSendTime(now: Date, timezone: string | null | undefined): Date {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
  const { hour, minute } = localTime(now, tz);
  if (hour >= SEND_START_HOUR && hour < SEND_END_HOUR) return now;
  const minutesNow = hour * 60 + minute;
  const minutesTarget =
    hour < SEND_START_HOUR
      ? SEND_START_HOUR * 60 - minutesNow
      : 24 * 60 - minutesNow + SEND_START_HOUR * 60;
  const candidate = new Date(now.getTime() + minutesTarget * 60_000);
  candidate.setUTCSeconds(0, 0);
  // Correction si un changement d'heure a décalé la cible
  const check = localTime(candidate, tz);
  if (check.hour !== SEND_START_HOUR) {
    candidate.setTime(candidate.getTime() + (SEND_START_HOUR - check.hour) * 3_600_000);
  }
  return candidate;
}
