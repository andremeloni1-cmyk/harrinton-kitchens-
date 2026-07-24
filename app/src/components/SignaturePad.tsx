"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Finger/stylus signature pad. Draws on a canvas and hands the caller a PNG
 * data URL when the stroke ends. `value` (a stored data URL) is shown as the
 * current signature; Clear wipes it.
 */
export function SignaturePad({
  value,
  onChange,
}: {
  value?: string;
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  // Track "has ink" in a ref too — pointerup can fire before a pointermove
  // setState commits, which would otherwise skip persisting a quick one-stroke
  // signature. The ref is always current.
  const inkRef = useRef(Boolean(value));
  const [hasInk, setHasInk] = useState(Boolean(value));

  // Size the canvas to its box (accounting for device pixel ratio) and paint
  // any existing signature in. Re-runs on resize (e.g. the tablet is rotated
  // mid-signature) — setting canvas.width wipes the backing store, so we snapshot
  // the current ink first and repaint it, keeping the strokes aligned to the box
  // instead of offsetting them.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const applySize = (source?: string) => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = rect.width * ratio; // resets the transform + styles below
      canvas.height = rect.height * ratio;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#171717";
      if (source) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = source;
      }
    };

    applySize(value);

    let lastW = canvas.getBoundingClientRect().width;
    const ro = new ResizeObserver(() => {
      const w = canvas.getBoundingClientRect().width;
      if (w === lastW) return; // height is fixed (h-32); only width changes matter
      lastW = w;
      const snapshot = inkRef.current ? canvas.toDataURL("image/png") : undefined;
      applySize(snapshot);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!inkRef.current) {
      inkRef.current = true;
      setHasInk(true);
    }
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const canvas = canvasRef.current;
    if (canvas && inkRef.current) onChange(canvas.toDataURL("image/png"));
  }
  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    inkRef.current = false;
    setHasInk(false);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-32 w-full touch-none rounded-xl bg-white ring-1 ring-inset ring-stone-200 dark:ring-night-line"
      />
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-stone-400 dark:text-slate-500">
          {hasInk ? "Signed" : "Ask the client to sign above"}
        </span>
        <button type="button" onClick={clear} className="text-xs font-semibold text-brand-600">
          Clear
        </button>
      </div>
    </div>
  );
}
