import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";

export const dynamic = "force-dynamic";

// Address autocomplete backed by Google Places. Proxied server-side so the
// API key never reaches the browser. Without GOOGLE_MAPS_API_KEY the field
// simply behaves as a plain input (configured: false).
export async function GET(req: Request) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return json({ configured: false, suggestions: [] });
  if (q.length < 4) return json({ configured: true, suggestions: [] });

  try {
    // Places API (New) — projects created after March 2025 can't enable the
    // legacy Places API, so this is the only endpoint that works everywhere.
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify({
        input: q,
        includedRegionCodes: [(process.env.ADDRESS_COUNTRY || "au").toLowerCase()],
      }),
    });
    const data = (await res.json()) as {
      error?: { status?: string; message?: string };
      suggestions?: { placePrediction?: { text?: { text?: string } } }[];
    };
    if (data.error) {
      return json({ configured: true, suggestions: [], error: data.error.status || "places_error" });
    }
    return json({
      configured: true,
      suggestions: (data.suggestions || [])
        .map((s) => s.placePrediction?.text?.text)
        .filter((t): t is string => Boolean(t))
        .slice(0, 6),
    });
  } catch {
    return json({ configured: true, suggestions: [] });
  }
}
