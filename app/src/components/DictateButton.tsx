"use client";

import { useEffect, useRef, useState } from "react";

// Minimal shape of the Web Speech API we use.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/**
 * Tap-to-dictate mic that appends spoken text to a field. Only renders where
 * the browser supports the Web Speech API (Chrome/Android/desktop). On iOS
 * Safari — which doesn't — it renders nothing, since the keyboard's own mic
 * already dictates into every field.
 */
export function DictateButton({ onText }: { onText: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSupported(getRecognition() !== null);
    return () => recRef.current?.stop();
  }, []);

  if (!supported) return null;

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    recRef.current = rec;
    rec.lang = "en-AU";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript)
        .join(" ")
        .trim();
      if (text) onText(text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={listening ? "Stop dictation" : "Dictate"}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
        listening
          ? "animate-pulse bg-brand-600 text-white"
          : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-night-800 dark:text-slate-400 dark:hover:bg-night-850"
      }`}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
      </svg>
    </button>
  );
}
