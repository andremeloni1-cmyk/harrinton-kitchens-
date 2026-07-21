import Anthropic from "@anthropic-ai/sdk";
import { visionConfigured } from "@/lib/vision";
import type { Snapshot } from "@/lib/snapshot";

// Ask-AI over the business snapshot (P12.2). The model answers ONLY from the
// snapshot and quotes figures verbatim; it returns null when AI is off (the
// caller shows the raw snapshot instead). Mirrors the house AI pattern.

export async function answerQuestion(question: string, snapshot: Snapshot): Promise<string | null> {
  if (!visionConfigured()) return null;
  const q = question.trim();
  if (!q) return null;

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content:
            "You are the operations assistant for a kitchen joinery business. Answer the question using ONLY the " +
            "JSON snapshot of the business below. Quote figures and dates verbatim from the snapshot — never invent " +
            "or estimate. If the snapshot doesn't contain the answer, say so plainly. Be concise. If the question is " +
            "about feasibility of a date, compare the relevant lead-time date in the snapshot to the date asked.\n\n" +
            `--- SNAPSHOT ---\n${JSON.stringify(snapshot)}\n--- END SNAPSHOT ---\n\n` +
            `Question: ${q}\n\nRespond as JSON: { "answer": string }.`,
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false },
        },
      },
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (res.stop_reason === "refusal") return null;
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const raw = JSON.parse(text.text) as { answer?: string };
    return String(raw.answer || "").trim() || null;
  } catch {
    return null;
  }
}
