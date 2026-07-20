import Anthropic from "@anthropic-ai/sdk";
import { visionConfigured } from "@/lib/vision";

export type ExtractedReceipt = {
  vendor?: string;
  date?: string; // ISO yyyy-mm-dd
  total?: number; // GST-inclusive amount paid
  gst?: number; // GST portion, if shown
  category?: string; // best-guess expense category
  description?: string; // what was bought (short)
};

function mediaType(mime: string): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | null {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "image/png";
  if (m.includes("jpeg") || m.includes("jpg")) return "image/jpeg";
  if (m.includes("gif")) return "image/gif";
  if (m.includes("webp")) return "image/webp";
  return null;
}

/**
 * Reads a receipt photo and extracts the fields needed for an expense: vendor,
 * date, total, GST, a category guess, and a short description. Mirrors the
 * vision.ts structured-output pattern (json_schema, refusal guard, null on
 * error). Returns null when AI isn't configured or the image is unreadable —
 * the caller then falls back to manual entry.
 */
export async function extractReceipt(input: {
  data: Buffer;
  mimeType: string;
  today?: string; // yyyy-mm-dd, to resolve relative/short dates
}): Promise<ExtractedReceipt | null> {
  if (!visionConfigured()) return null;
  const media = mediaType(input.mimeType);
  if (!media) return null;

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const today = input.today || new Date().toISOString().slice(0, 10);

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: media, data: input.data.toString("base64") },
            },
            {
              type: "text",
              text:
                `Today is ${today}. This is a photo of a purchase receipt or tax invoice for a kitchen ` +
                "business (materials, tools, fuel, hardware, etc.). Extract the expense details.\n" +
                "- vendor: the shop/supplier name.\n" +
                "- date: the purchase date as yyyy-mm-dd (resolve short dates against today; assume the recent past, never the future).\n" +
                "- total: the final GST-INCLUSIVE amount paid, as a number (no currency symbol).\n" +
                "- gst: the GST/tax amount if the receipt shows one, as a number. In Australia GST is 1/11th of a GST-inclusive total; if the receipt says 'GST included' but gives no figure, compute total/11. Omit if clearly GST-free.\n" +
                "- category: a short expense category (e.g. Materials, Hardware, Tools, Fuel, Timber).\n" +
                "- description: a short note of what was bought.\n" +
                "Omit any field you can't read. Respond as JSON.",
            },
          ],
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              vendor: { type: "string" },
              date: { type: "string" },
              total: { type: "number" },
              gst: { type: "number" },
              category: { type: "string" },
              description: { type: "string" },
            },
            additionalProperties: false,
          },
        },
      },
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (res.stop_reason === "refusal") return null;
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const p = JSON.parse(text.text) as ExtractedReceipt;
    return {
      vendor: p.vendor?.trim() || undefined,
      date: p.date?.trim() || undefined,
      total: typeof p.total === "number" && Number.isFinite(p.total) ? p.total : undefined,
      gst: typeof p.gst === "number" && Number.isFinite(p.gst) ? p.gst : undefined,
      category: p.category?.trim() || undefined,
      description: p.description?.trim() || undefined,
    };
  } catch {
    return null;
  }
}
