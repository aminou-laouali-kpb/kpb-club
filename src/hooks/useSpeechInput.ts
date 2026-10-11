import { useCallback, useEffect, useRef, useState } from "react";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getRecognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"] ?? null) as
    (new () => Recognition) | null;
}

/**
 * Dictée vocale (Web Speech API, transcription dans le navigateur).
 * `supported` est faux sur les navigateurs qui ne la proposent pas : la saisie au clavier reste.
 */
export function useSpeechInput(language: "fr" | "en", onFinalText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const callback = useRef(onFinalText);
  callback.current = onFinalText;
  const supported = getRecognitionClass() !== null;

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Rec = getRecognitionClass();
    if (!Rec) return;
    const rec = new Rec();
    rec.lang = language === "en" ? "en-US" : "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]!;
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) callback.current(text.trim());
        else partial += text;
      }
      setInterim(partial);
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }, [language]);

  useEffect(() => () => recognition.current?.stop(), []);
  return { supported, listening, interim, start, stop };
}
