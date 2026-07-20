"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// In-app QR scanner using the native BarcodeDetector (Chrome/Android and
// recent Safari). Where it's unavailable, the printed labels still work with
// the phone's own camera app — the QR is just a link.
export default function HardwareScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<"starting" | "scanning" | "unsupported" | "denied">("starting");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let done = false;

    (async () => {
      const Detector = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      if (!Detector) {
        setState("unsupported");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        setState("denied");
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});
      setState("scanning");

      const detector = new Detector({ formats: ["qr_code"] });
      timer = setInterval(async () => {
        if (done || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const raw = codes[0]?.rawValue;
          if (!raw) return;
          // Accept a full label URL or a bare HW-xxxx code.
          const m = raw.match(/\/hardware\/item\/([\w-]+)/) || raw.match(/^(HW-\d+)$/i);
          if (m) {
            done = true;
            router.push(`/hardware/item/${m[1]}`);
          }
        } catch {
          /* keep scanning */
        }
      }, 350);
    })();

    return () => {
      done = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [router]);

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <Link href="/hardware" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 dark:text-slate-400">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Hardware
      </Link>
      <h1 className="mb-3 text-xl font-bold text-stone-900 dark:text-slate-100">Scan a label</h1>

      {state === "unsupported" ? (
        <div className="card p-5 text-sm text-stone-600 dark:text-slate-300">
          <p className="font-semibold text-stone-800 dark:text-slate-100">This browser can&apos;t scan in-app.</p>
          <p className="mt-1">
            No problem — just point your phone&apos;s <b>camera app</b> at the label instead. The QR opens the item&apos;s
            page directly.
          </p>
        </div>
      ) : state === "denied" ? (
        <div className="card p-5 text-sm text-stone-600 dark:text-slate-300">
          <p className="font-semibold text-stone-800 dark:text-slate-100">Camera access was blocked.</p>
          <p className="mt-1">Allow camera access for this site, or point your phone&apos;s camera app at the label instead.</p>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-3xl bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-52 w-52 rounded-3xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          <p className="absolute inset-x-0 bottom-3 text-center text-sm font-medium text-white/90">
            {state === "starting" ? "Starting camera…" : "Point at a hardware label"}
          </p>
        </div>
      )}
    </div>
  );
}
