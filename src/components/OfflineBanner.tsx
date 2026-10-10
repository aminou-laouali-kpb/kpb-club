import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** Bandeau affiché tant que l'appareil est hors ligne. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-foreground px-4 py-2 text-center text-xs text-background"
    >
      <WifiOff className="size-3.5 shrink-0" />
      Hors ligne — tes modifications seront envoyées au retour du réseau.
    </div>
  );
}
