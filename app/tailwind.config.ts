import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Accent: an oak/brass ramp — warm, crafted, print-like. The whole UI
        // references this single `brand` scale, so this is the one place the
        // platform default accent is defined. Per-company overrides regenerate
        // these same steps as CSS variables (see P2.2).
        brand: {
          50: "#fbf7ee",
          100: "#f3e9d4",
          200: "#e7d3ab",
          300: "#d8ba7e",
          400: "#c69f57",
          500: "#b0843b", // ← brass
          600: "#8c6730", // solid accent (white text passes AA)
          700: "#6f5227", // text links
          800: "#574020",
          900: "#46351d",
          950: "#271c10",
        },
        // Warm charcoal "ink" — the dominant pill buttons and dark accent tiles.
        // Anchored on #17130D (the "#16130F family" from the design brief).
        ink: {
          DEFAULT: "#17130d",
          800: "#221d15",
          700: "#2f281c",
        },
        // Neutral warm greys for muted text and hairlines.
        steel: {
          DEFAULT: "#57534e",
          light: "#e7e2d8",
        },
        // Dark-mode surfaces — warm near-black greys in the ink family, so the
        // dark theme reads as charcoal paper rather than cold black.
        night: {
          950: "#121009", // page background
          900: "#1a1610", // card surface
          850: "#221d15", // elevated surface (inputs, raised tiles)
          800: "#2a241a", // tag / chip background
          line: "#37301f", // hairline border / ring
          line2: "#241f16", // subtle divider
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        // Fraunces — a warm display serif for headings and client-facing surfaces.
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      borderRadius: {
        // Workshop Modern geometry — calmer, ~16px (down from the 26px bento).
        bento: "16px",
        "bento-sm": "12px",
      },
      boxShadow: {
        // Flat paper cards: a whisper of shadow over a hairline border.
        card: "0 1px 2px rgba(23,19,13,0.04), 0 1px 3px rgba(23,19,13,0.05)",
        lift: "0 10px 26px -14px rgba(23,19,13,0.20), 0 2px 6px -3px rgba(23,19,13,0.06)",
        bento: "0 6px 20px -12px rgba(23,19,13,0.14), 0 1px 3px rgba(23,19,13,0.05)",
        // Frosted overlays (nav dock, sheets) still read as lifted glass.
        glass:
          "0 14px 44px -16px rgba(23,19,13,0.20), 0 2px 8px -4px rgba(23,19,13,0.08), inset 0 1px 0 0 rgba(255,255,255,0.6)",
        "glass-dark":
          "0 18px 48px -18px rgba(0,0,0,0.6), inset 0 1px 0 0 rgba(255,255,255,0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
