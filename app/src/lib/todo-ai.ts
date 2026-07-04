import Anthropic from "@anthropic-ai/sdk";
import { visionConfigured } from "@/lib/vision";
import type { ChecklistItem } from "@/lib/pdf";

export type TodoContext = {
  title: string;
  description?: string | null;
  address?: string | null;
};

/**
 * Drafts a work to-do list for a job from its description using Claude — the
 * practical steps a joiner would tick off to get this job done. Returns null
 * when AI is not configured or on error (mirrors src/lib/report-ai.ts).
 */
export async function draftTodos(ctx: TodoContext): Promise<ChecklistItem[] | null> {
  if (!visionConfigured()) return null;

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

  const facts = [
    `Job title: ${ctx.title}`,
    ctx.address ? `Site address: ${ctx.address}` : "",
    ctx.description ? `Job details:\n${ctx.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content:
            "You are helping a joiner plan a job. From the job context below, produce a practical, ordered " +
            "to-do list of the concrete steps needed to complete THIS job — the tasks the joiner would tick off " +
            "(e.g. \"Measure and template\", \"Cut and pre-assemble carcasses\", \"Install cabinets\", " +
            "\"Fit benchtop\", \"Align doors & drawers\", \"Silicone & seal\", \"Clean site\"). Base it strictly " +
            "on the context — don't invent measurements, prices, or facts. Keep each item short (a few words). " +
            "Provide 5-12 items.\n\n" +
            `--- JOB CONTEXT ---\n${facts}\n--- END CONTEXT ---\n\n` +
            "Respond as JSON: { items: string[] }.",
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              items: { type: "array", items: { type: "string" } },
            },
            required: ["items"],
            additionalProperties: false,
          },
        },
      },
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (res.stop_reason === "refusal") return null;
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const raw = JSON.parse(text.text) as { items?: string[] };
    return (raw.items || [])
      .map((label) => String(label).trim())
      .filter(Boolean)
      .map((label) => ({ label, done: false }));
  } catch {
    return null;
  }
}
