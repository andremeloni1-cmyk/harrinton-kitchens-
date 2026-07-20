import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Accent: deep teal — a premium kitchen-showroom green. The whole UI
        // references this single `brand` scale, so this is the one place the
        // accent colour is defined.
        brand: {
          50: "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6", // ← brand teal
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
          950: "#042f2e",
        },
        // Pure near-black "ink" — the dominant pill buttons and dark accent tiles.
        // Anchored on the palette's #171717 (RGB 23,23,23).
        ink: {
          DEFAULT: "#171717",
          800: "#212121",
          700: "#2c2c2c",
        },
        // Neutral greys straight from the palette: #4D4D4D (dark) and #DEDEDE
        // (light). Used for muted text, hairlines and the frosted "table".
        steel: {
          DEFAULT: "#4d4d4d", // palette dark gray
          light: "#dedede", // palette light gray
        },
        // Dark-mode surfaces — neutral near-black greys anchored on #171717 for a
        // crisp B&W dark theme that matches the palette's black.
        night: {
          950: "#0d0d0d", // page background
          900: "#171717", // card surface (= palette black)
          850: "#1f1f1f", // elevated surface (inputs, raised tiles)
          800: "#272727", // tag / chip background
          line: "#313131", // hairline border / ring
          line2: "#202020", // subtle divider
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        // Bento card geometry — large, soft corners.
        bento: "26px",
        "bento-sm": "18px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.08)",
        // Soft, lifted bento shadow (cards float on the muted page background).
        bento: "0 10px 30px -12px rgba(16,24,40,0.18), 0 2px 6px -2px rgba(16,24,40,0.06)",
        lift: "0 6px 16px -4px rgba(16,24,40,0.12), 0 2px 6px -2px rgba(16,24,40,0.08)",
        // Frosted-glass panel: diffuse drop shadow + a faint inner top highlight
        // so translucent surfaces read as lifted, soft glass.
        glass:
          "0 12px 40px -14px rgba(23,23,23,0.22), 0 2px 8px -3px rgba(23,23,23,0.10), inset 0 1px 0 0 rgba(255,255,255,0.55)",
        "glass-dark":
          "0 16px 44px -16px rgba(0,0,0,0.65), inset 0 1px 0 0 rgba(255,255,255,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
