import Anthropic from "@anthropic-ai/sdk";
import { visionConfigured } from "@/lib/vision";
import type { ReportData } from "@/lib/pdf";

export type ReportContext = {
  title: string;
  description?: string | null;
  address?: string | null;
  clientName?: string | null;
  documents?: string[]; // document names for extra hints
};

/**
 * Drafts a maintenance/handover report from a job's context using Claude,
 * broken down by room where the work spans multiple rooms. Returns null when
 * AI is not configured or on error.
 */
export async function draftReport(ctx: ReportContext): Promise<ReportData | null> {
  if (!visionConfigured()) return null;

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

  const facts = [
    `Job title: ${ctx.title}`,
    ctx.address ? `Site address: ${ctx.address}` : "",
    ctx.clientName ? `Client: ${ctx.clientName}` : "",
    ctx.description ? `Job details:\n${ctx.description}` : "",
    ctx.documents && ctx.documents.length ? `Attached documents: ${ctx.documents.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content:
            "You are drafting a professional completion / handover report for a kitchen install job (e.g. a " +
            "kitchen, bathroom, laundry, or wardrobe installation), for the joiner to review, tick off, and send " +
            "to the client. Base it strictly on the job context below — do not invent measurements, prices, or " +
            "facts that aren't implied. Keep language clear and client-friendly.\n\n" +
            `--- JOB CONTEXT ---\n${facts}\n--- END CONTEXT ---\n\n` +
            "Respond as JSON with:\n" +
            "- scope: a short scope-of-work label, e.g. \"Kitchen installation\" or \"Bathroom vanity install\".\n" +
            "- jobType: one of kitchen, bathroom, laundry, wardrobe, other.\n" +
            "- workCarried: a short overall summary.\n" +
            "- rooms: one entry per room/area, each { name, work (brief notes), items: array of short completion-" +
            "checklist steps a fitter would tick off for THIS kind of job (e.g. \"Benchtop fitted\", \"Doors & " +
            "drawers aligned\", \"Silicone & sealing complete\", \"Site cleaned\"). Tailor the items to the job type " +
            "and what the context implies. Provide 5-10 items per room.\n" +
            "- materialsUsed, findings, recommendations, condition (Good | Fair | Needs attention).\n" +
            "Leave a field as an empty string (or empty array) if there isn't enough information.",
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              scope: { type: "string" },
              jobType: { type: "string" },
              workCarried: { type: "string" },
              materialsUsed: { type: "string" },
              findings: { type: "string" },
              recommendations: { type: "string" },
              condition: { type: "string" },
              rooms: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    work: { type: "string" },
                    items: { type: "array", items: { type: "string" } },
                  },
                  required: ["name"],
                  additionalProperties: false,
                },
              },
            },
            required: ["workCarried"],
            additionalProperties: false,
          },
        },
      },
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (res.stop_reason === "refusal") return null;
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    // The model returns checklist items as plain strings; convert them to
    // {label, done:false} so they render as tickable checklist items.
    const raw = JSON.parse(text.text) as Omit<ReportData, "rooms"> & {
      rooms?: { name: string; work?: string; items?: string[] }[];
    };
    return {
      ...raw,
      rooms: (raw.rooms || []).map((r) => ({
        name: r.name,
        work: r.work || "",
        items: (r.items || []).map((label) => ({ label, done: false })),
      })),
    };
  } catch {
    return null;
  }
}
