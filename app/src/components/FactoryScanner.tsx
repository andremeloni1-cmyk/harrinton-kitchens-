"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { api } from "@/lib/job";
import { INTERNAL } from "@/lib/brand";

// Full-screen QR scanner for the factory floor (P8.2). Reads
// "<INTERNAL.qrPrefix><partId>" labels with the browser's BarcodeDetector where
// available, falling back to jsQR frame decoding, and advances the scanned part
// at the picked station.

type ScanResult = {
  advanced: boolean;
  part: { id: string; name: string; cabinet: string | null };
  station: { id: string; name: string; position: number };
};
type Feedback = { ok: boolean; text: string; key: string };

// Minimal shape of the (still non-standard) BarcodeDetector API.
interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

export function FactoryScanner({
  stationId,
  stationName,
  onClose,
  onScanned,
}: {
  stationId: string;
  stationName: string;
  onClose: () => void;
  onScanned?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busyRef = useRef(false);
  const lastCodeRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<Feedback | null>(null);
  const [recent, setRecent] = useState<Feedback[]>([]);

  const handleCode = useCallback(
    async (raw: string) => {
      if (!raw.startsWith(INTERNAL.qrPrefix)) return; // ignore anything that isn't one of our labels
      const now = Date.now();
      // One physical scan = one advance: ignore the same code for a beat.
      if (raw === lastCodeRef.current.code && now - lastCodeRef.current.at < 2500) return;
      if (busyRef.current) return;
      // Only remember the code once we're actually acting on it. Recording it
      // before the busy bail would make a *different* part scanned mid-request
      // get swallowed by the dedup window on the next frame, with no feedback.
      lastCodeRef.current = { code: raw, at: now };
      busyRef.current = true;
      try {
        const res = await api<ScanResult>("/api/factory/scan", {
          method: "POST",
          body: JSON.stringify({ partId: raw.slice(INTERNAL.qrPrefix.length), stationId }),
        });
        const label = `${res.part.cabinet ? res.part.cabinet + " / " : ""}${res.part.name}`;
        const fb: Feedback = {
          ok: true,
          text: res.advanced ? `${label} → ${res.station.name}` : `${label} · already past ${res.station.name}`,
          key: String(now),
        };
        setLast(fb);
        setRecent((r) => [fb, ...r].slice(0, 6));
        onScanned?.();
        if (navigator.vibrate) navigator.vibrate(res.advanced ? 40 : [20, 40, 20]);
      } catch (e) {
        setLast({ ok: false, text: e instanceof Error ? e.message : "Scan failed", key: String(now) });
        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      } finally {
        busyRef.current = false;
      }
    },
    [stationId, onScanned]
  );

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    let detector: BarcodeDetectorLike | null = null;
    if (Ctor) {
      try { detector = new Ctor({ formats: ["qr_code"] }); } catch { detector = null; }
    }

    async function scanOnce() {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      if (detector) {
        const codes = await detector.detect(video);
        if (codes[0]?.rawValue) await handleCode(codes[0].rawValue);
        return;
      }
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;
      const canvas = canvasRef.current || (canvasRef.current = document.createElement("canvas"));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
      if (code?.data) await handleCode(code.data);
    }

    async function loop() {
      if (stopped) return;
      try { await scanOnce(); } catch { /* skip a bad frame */ }
      if (!stopped) timer = setTimeout(() => { void loop(); }, 180);
    }

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        void loop();
      } catch {
        setError("Couldn't open the camera — allow camera access and try again.");
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [handleCode]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Scanning into</p>
          <p className="text-lg font-bold">{stationName}</p>
        </div>
        <button className="rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold text-white active:scale-95" onClick={onClose}>
          Done
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline />
        {!error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-56 w-56 rounded-3xl border-4 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.35)]" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-white/90">{error}</div>
        )}
        {last && (
          <div
            key={last.key}
            className={`absolute inset-x-4 top-4 rounded-2xl px-4 py-3 text-center text-base font-bold text-white shadow-lg ${last.ok ? "bg-emerald-600" : "bg-red-600"}`}
          >
            {last.ok ? "✓ " : "✕ "}{last.text}
          </div>
        )}
      </div>

      <div className="max-h-40 space-y-1 overflow-y-auto bg-black/90 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Point the camera at a label’s QR code</p>
        {recent.map((r) => (
          <p key={r.key} className={`text-sm ${r.ok ? "text-white/80" : "text-red-300"}`}>{r.ok ? "✓" : "✕"} {r.text}</p>
        ))}
      </div>
    </div>
  );
}
