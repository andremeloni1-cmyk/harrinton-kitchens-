import Anthropic from "@anthropic-ai/sdk";
import { visionConfigured } from "@/lib/vision";
import { normalizeCutList, isEmptyCutList, type CutList } from "@/lib/cutlist";

// AI extraction of a CAD-exported cut-list / job PDF into structured cabinets,
// parts and hardware (P8.1). House pattern: JSON-schema output, review before
// commit, graceful null on failure. Works with any CAD package because it reads
// the exported PDF, not a proprietary format.
//
// Cost note: one extraction is a single vision/document call (~a few thousand
// input tokens for a typical multi-page cut list). See docs — budget it like the
// other one-shot AI reads (enquiry photos, site sheets).

export type CutListFile = { data: string; mimeType: string };

function imageMedia(mime: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  const m = mime.toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "image/jpeg";
  if (m === "image/png") return "image/png";
  if (m === "image/gif") return "image/gif";
  if (m === "image/webp") return "image/webp";
  return null;
}

function fileBlock(f: CutListFile): Anthropic.ContentBlockParam | null {
  const media = imageMedia(f.mimeType);
  if (media) return { type: "image", source: { type: "base64", media_type: media, data: f.data } };
  if (/pdf/i.test(f.mimeType)) {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } } as Anthropic.ContentBlockParam;
  }
  return null;
}

const PART_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    material: { type: "string" },
    edging: { type: "string" },
    widthMm: { type: "number" },
    heightMm: { type: "number" },
    qty: { type: "number" },
  },
  required: ["name"],
  additionalProperties: false,
};

const SCHEMA = {
  type: "object",
  properties: {
    cabinets: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, parts: { type: "array", items: PART_SCHEMA } },
        required: ["name"],
        additionalProperties: false,
      },
    },
    hardware: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, qty: { type: "number" } },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  required: ["cabinets", "hardware"],
  additionalProperties: false,
};

export async function extractCutList(files: CutListFile[], hint?: string): Promise<CutList | null> {
  if (!visionConfigured()) return null;
  const blocks = files.map(fileBlock).filter((b): b is Anthropic.ContentBlockParam => b !== null).slice(0, 5);
  if (blocks.length === 0) return null;

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

  const prompt =
    "This is a cabinetmaker's cut list / job sheet exported from a CAD package. Extract every cabinet, its " +
    "component parts (with material, edging spec, width and height in millimetres, and quantity), and any " +
    "loose hardware (hinges, handles, runners, legs) with quantities. Use millimetres for all dimensions. " +
    "Only include what's actually printed — don't invent parts. If it isn't a cut list, return empty arrays." +
    (hint ? `\n\nCompany note about this CAD format: ${hint}` : "");

  const content: Anthropic.ContentBlockParam[] = [...blocks, { type: "text", text: prompt }];

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (res.stop_reason === "refusal") return null;
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const cl = normalizeCutList(JSON.parse(text.text));
    return isEmptyCutList(cl) ? null : cl;
  } catch {
    return null;
  }
}
