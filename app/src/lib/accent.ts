// Generate a full 50→950 accent ramp from a single brand hex, so a company can
// set one colour (CompanySettings.accentColor) and restyle the whole app + portal
// at runtime — no rebuild. The ramp is emitted as CSS variables in RGB-channel
// form ("176 132 59") so Tailwind's `brand` colours (defined as
// `rgb(var(--brand-x) / <alpha-value>)`) keep working with opacity modifiers.

type RGB = { r: number; g: number; b: number };

const WHITE: RGB = { r: 255, g: 255, b: 255 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };

// The input hex is treated as the 500 step; lighter steps mix toward white,
// darker steps toward black, at ratios that echo Tailwind's default scale.
const STEPS: ReadonlyArray<readonly [number, RGB, number]> = [
  [50, WHITE, 0.9],
  [100, WHITE, 0.8],
  [200, WHITE, 0.62],
  [300, WHITE, 0.42],
  [400, WHITE, 0.2],
  [500, WHITE, 0],
  [600, BLACK, 0.16],
  [700, BLACK, 0.32],
  [800, BLACK, 0.46],
  [900, BLACK, 0.58],
  [950, BLACK, 0.74],
];

export function parseHex(hex: string): RGB | null {
  const s = hex.trim().replace(/^#/, "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

const clamp = (n: number) => Math.round(Math.max(0, Math.min(255, n)));
const mix = (c: RGB, t: RGB, amt: number): RGB => ({
  r: c.r + (t.r - c.r) * amt,
  g: c.g + (t.g - c.g) * amt,
  b: c.b + (t.b - c.b) * amt,
});
const channels = (c: RGB) => `${clamp(c.r)} ${clamp(c.g)} ${clamp(c.b)}`;

/** Map of step → "r g b" channel string, or null if the hex is invalid. */
export function generateAccentRamp(hex: string): Record<number, string> | null {
  const base = parseHex(hex);
  if (!base) return null;
  const out: Record<number, string> = {};
  for (const [step, target, amt] of STEPS) out[step] = channels(mix(base, target, amt));
  return out;
}

/** A `:root{ --brand-50: r g b; … }` block overriding the default accent, or
 *  null if the hex is invalid (caller then keeps the platform default). */
export function getAccentVarsCss(hex: string): string | null {
  const ramp = generateAccentRamp(hex);
  if (!ramp) return null;
  const vars = Object.entries(ramp)
    .map(([step, rgb]) => `--brand-${step}:${rgb}`)
    .join(";");
  return `:root{${vars}}`;
}
