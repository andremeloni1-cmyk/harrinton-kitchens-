import Anthropic from "@anthropic-ai/sdk";
import { visionConfigured } from "@/lib/vision";
import { BRAND } from "@/lib/brand";

export type MessageThreadItem = { sender: string; body: string };
export type SuggestContext = {
  jobTitle: string;
  clientName: string | null;
  companyName?: string;
  thread: MessageThreadItem[];
};

/**
 * Drafts a warm, professional reply the office can edit and send to the client
 * (P11.3). Returns null when AI isn't configured or on error — the human always
 * sends; nothing is ever sent automatically. Mirrors src/lib/todo-ai.ts.
 */
export async function suggestReply(ctx: SuggestContext): Promise<string | null> {
  if (!visionConfigured()) return null;
  if (!ctx.thread.length) return null;

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const company = ctx.companyName || BRAND.name;

  const transcript = ctx.thread
    .map((m) => `${m.sender === "office" ? company : ctx.clientName || "Client"}: ${m.body}`)
    .join("\n");

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content:
            `You draft reply suggestions for the office team at ${company}, a kitchen joinery company, ` +
            `replying to a homeowner client on their project portal. Write the NEXT reply from ${company} to the ` +
            `client — warm, clear, professional, and concise (2-4 sentences). Address their latest message. Do NOT ` +
            `invent dates, prices, or commitments the office hasn't made; if something needs confirming, say the ` +
            `team will confirm it. Sign off as the ${company} team.\n\n` +
            `Job: ${ctx.jobTitle}\n\n--- CONVERSATION ---\n${transcript}\n--- END ---\n\n` +
            `Respond as JSON: { "reply": string }.`,
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { reply: { type: "string" } },
            required: ["reply"],
            additionalProperties: false,
          },
        },
      },
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (res.stop_reason === "refusal") return null;
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const raw = JSON.parse(text.text) as { reply?: string };
    const reply = String(raw.reply || "").trim();
    return reply || null;
  } catch {
    return null;
  }
}
