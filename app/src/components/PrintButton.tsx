"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn-primary shrink-0">
      🖨️ Print
    </button>
  );
}
