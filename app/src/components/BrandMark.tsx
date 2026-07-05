/** The Harrington Kitchens brand mark: a run of kitchen cabinetry — a benchtop
 * over two door fronts with handles. Uses currentColor so it inherits the
 * tile's text colour. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 8l2-4h12l2 4" />
      <path d="M4 8h16" />
      <path d="M5 8v12h14V8" />
      <path d="M12 8v12" />
      <path d="M9 12v3M15 12v3" />
    </svg>
  );
}
