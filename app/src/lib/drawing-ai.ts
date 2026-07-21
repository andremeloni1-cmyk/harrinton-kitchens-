import Anthropic from "@anthropic-ai/sdk";
import { visionConfigured } from "@/lib/vision";

// AI diff between two drawing revisions (P6.2). Produces a technical bullet
// summary for the workshop plus a plain-language rewrite for the client's
// portal. Returns null when AI isn't configured, the model refuses, or it
// errors — callers show "summary unavailable" and carry on.

export type DrawingFile = { data: string; mimeType: string }; // data = base64

export type RevisionDiff = { internal: string; client: string };

function imageMedia(mime: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  const m = mime.toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "image/jpeg";
  if (m === "image/png") return "image/png";
  if (m === "image/gif") return "image/gif";
  if (m === "image/webp") return "image/webp";
  return null;
}

function fileBlock(f: DrawingFile): Anthropic.ContentBlockParam | null {
  const media = imageMedia(f.mimeType);
  if (media) return { type: "image", source: { type: "base64", media_type: media, data: f.data } };
  if (/pdf/i.test(f.mimeType)) {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } } as Anthropic.ContentBlockParam;
  }
  return null;
}

const SCHEMA = {
  type: "object",
  properties: { internal: { type: "string" }, client: { type: "string" } },
  required: ["internal", "client"],
  additionalProperties: false,
};

const PROMPT =
  "You are comparing two revisions of a kitchen/joinery drawing set — the PREVIOUS revision, then the NEW " +
  "revision. Identify what actually changed between them: layout, cabinet sizes/positions, appliances, " +
  "materials, dimensions, anything notable. Respond as JSON with two fields:\n" +
  "- `internal`: a concise bullet list (use '- ' bullets) of the changes for the workshop; be specific and " +
  "technical. If the two are effectively identical, say exactly 'No material changes.'\n" +
  "- `client`: the same changes rewritten in friendly plain language for the homeowner, no jargon. If nothing " +
  "changed, reassure them nothing has changed.";

export async function summarizeRevisionChanges(
  prev: DrawingFile[],
  next: DrawingFile[]
): Promise<RevisionDiff | null> {
  if (!visionConfigured()) return null;

  const prevBlocks = prev.map(fileBlock).filter((b): b is Anthropic.ContentBlockParam => b !== null).slice(0, 3);
  const nextBlocks = next.map(fileBlock).filter((b): b is Anthropic.ContentBlockParam => b !== null).slice(0, 3);
  if (nextBlocks.length === 0) return null; // nothing readable to compare

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: "PREVIOUS REVISION:" },
    ...prevBlocks,
    { type: "text", text: "NEW REVISION:" },
    ...nextBlocks,
    { type: "text", text: PROMPT },
  ];

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (res.stop_reason === "refusal") return null;
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const parsed = JSON.parse(text.text) as Partial<RevisionDiff>;
    if (typeof parsed.internal !== "string" || typeof parsed.client !== "string") return null;
    return { internal: parsed.internal, client: parsed.client };
  } catch {
    return null;
  }
}
