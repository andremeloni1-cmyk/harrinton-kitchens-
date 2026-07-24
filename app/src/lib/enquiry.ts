// Pure helpers for the public enquiry form (/enquire) — kept out of the route
// so the validation, spam honeypot and image sniffing are unit-testable.

// The project types offered on the public form. Kept generic so the platform
// suits any joinery company, not just kitchens.
export const PROJECT_TYPES = [
  "Kitchen",
  "Wardrobe / storage",
  "Laundry",
  "Vanity / bathroom joinery",
  "Commercial fit-out",
  "Something else",
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export type EnquiryInput = { name?: string; email?: string; phone?: string };

// Deliberately loose — just enough to catch obvious typos, not to police valid
// addresses (over-strict email regexes reject real addresses). Because it
// forbids whitespace (\s), it also rejects CR/LF, which doubles as a guard
// against email header injection wherever an address is later used as a header.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEnquiry(input: EnquiryInput): { ok: true } | { ok: false; error: string } {
  const name = (input.name || "").trim();
  const email = (input.email || "").trim();
  const phone = (input.phone || "").trim();
  if (name.length < 2) return { ok: false, error: "Please tell us your name." };
  if (!email && !phone) return { ok: false, error: "Add an email or phone number so we can get back to you." };
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: "That email address doesn’t look right." };
  return { ok: true };
}

// A hidden form field real people never see, so any value in it means a bot.
export function isHoneypotTripped(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

// Sniff real image magic bytes rather than trusting the client's declared MIME.
// Returns the sniffed content-type, or null if the bytes aren't a supported image.
// (Mirrors the dashboard photo upload's sniffing so both agree on what's valid.)
export function sniffImageType(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (b.toString("ascii", 4, 8) === "ftyp" && /heic|heif|mif1|hevc/.test(b.toString("ascii", 8, 20))) return "image/heic";
  return null;
}

// The job title for an enquiry, from the AI-read photo title if we got one,
// else the chosen project type, else a generic label. Capped for the schema.
export function enquiryTitle(opts: { aiTitle?: string; projectType?: string }): string {
  const ai = (opts.aiTitle || "").trim();
  const type = (opts.projectType || "").trim();
  const base = ai || (type ? `${type} enquiry` : "Website enquiry");
  return base.slice(0, 80);
}
