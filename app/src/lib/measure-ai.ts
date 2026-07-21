import Anthropic from "@anthropic-ai/sdk";
import { visionConfigured } from "@/lib/vision";
import { parseMeasure, type Room } from "@/lib/measure";

// AI reader for photographed site sheets / sketches (P5.3). Follows the same
// pattern as lib/vision.ts: returns structured rooms behind a review screen, or
// null when AI isn't configured / the model refuses / the sheet is unreadable —
// callers fall back to manual entry. Never auto-commits.

type SheetImage = { data: Buffer; mimeType: string };

// Anthropic vision supports these; HEIC etc. are filtered out.
function mediaType(mime: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  const m = mime.toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "image/jpeg";
  if (m === "image/png") return "image/png";
  if (m === "image/gif") return "image/gif";
  if (m === "image/webp") return "image/webp";
  return null;
}

const SCHEMA = {
  type: "object",
  properties: {
    rooms: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          ceilingMm: { type: "number" },
          walls: {
            type: "array",
            items: {
              type: "object",
              properties: { label: { type: "string" }, mm: { type: "number" } },
              required: ["label"],
              additionalProperties: false,
            },
          },
          openings: {
            type: "array",
            items: {
              type: "object",
              properties: { label: { type: "string" }, mm: { type: "number" } },
              required: ["label"],
              additionalProperties: false,
            },
          },
          services: {
            type: "object",
            properties: { power: { type: "string" }, water: { type: "string" }, gas: { type: "string" } },
            additionalProperties: false,
          },
          appliances: { type: "string" },
          notes: { type: "string" },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  required: ["rooms"],
  additionalProperties: false,
};

const PROMPT =
  "These image(s) are photos of a hand-drawn kitchen/joinery site-measure sheet or sketch. " +
  "Read the handwriting and diagram and extract the rooms and their measurements. " +
  "All dimensions are millimetres — convert any that are clearly in metres or centimetres to mm. " +
  "For each room capture: a name; the ceiling height; each wall run as a labelled length; each " +
  "opening (door/window) as a labelled width; the power/water/gas service positions; a list of " +
  "appliances; and any other notes. Only include values you can actually read — omit a field rather " +
  "than guessing. If the sheet is illegible or clearly not a measure sheet, return an empty rooms array.";

export async function readSiteSheet(images: SheetImage[]): Promise<Room[] | null> {
  if (!visionConfigured()) return null;
  const usable = images
    .map((img) => ({ ...img, media: mediaType(img.mimeType) }))
    .filter((img) => img.media);
  if (usable.length === 0) return null;

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

  const content: Anthropic.ContentBlockParam[] = usable.map((img) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: img.media!, data: img.data.toString("base64") },
  }));
  content.push({ type: "text", text: PROMPT });

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (res.stop_reason === "refusal") return null;
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;

    // Normalise through the same parser the form uses, so the AI output and
    // manual entry are identical shapes.
    const rooms = parseMeasure(text.text).rooms;
    return rooms.length > 0 ? rooms : null;
  } catch {
    return null;
  }
}
