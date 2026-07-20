import Anthropic from "@anthropic-ai/sdk";
import { visionConfigured } from "@/lib/vision";
import { parseCompanyPrices, relevantToCompany, resolvePrice, UNIT_LABELS } from "@/lib/price-list";
import type { LineItem } from "@/lib/invoices";
import type { Job, PriceItem } from "@prisma/client";

/**
 * Suggests billable lines for a job by matching its description against the
 * price list (prices resolved for the job's company). Returns null when AI is
 * not configured or on error — callers fall back to manual picking.
 */
export async function suggestInvoiceLines(
  job: Pick<Job, "title" | "description" | "address" | "companyId">,
  items: PriceItem[]
): Promise<LineItem[] | null> {
  if (!visionConfigured()) return null;
  // Only suggest from the job's company rate card (its priced items + generic
  // items) so one builder's job never gets another builder's components.
  const usable = items.filter(
    (i) => i.active && relevantToCompany(parseCompanyPrices(i.companyPrices), job.companyId)
  );
  if (usable.length === 0) return null;

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

  const catalogue = usable
    .map((i) => `- id: ${i.id} | ${i.name} | per ${UNIT_LABELS[i.unit] || i.unit}`)
    .join("\n");
  const facts = [
    `Job title: ${job.title}`,
    job.address ? `Site address: ${job.address}` : "",
    job.description ? `Job details:\n${job.description}` : "",
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
            "You are helping a kitchen installer bill a job. Below is his PRICE LIST of chargeable install " +
            "components, followed by the job context. Pick the price-list items this job plausibly involves and " +
            "estimate a sensible quantity for each (e.g. number of cabinets, hours, metres) based strictly on the " +
            "job context — don't invent work that isn't implied. If the context is too vague to justify an item, " +
            "leave it out. Fewer accurate lines beat many guesses.\n\n" +
            `--- PRICE LIST ---\n${catalogue}\n--- END PRICE LIST ---\n\n` +
            `--- JOB CONTEXT ---\n${facts}\n--- END CONTEXT ---\n\n` +
            "Respond as JSON: { lines: [ { priceItemId, quantity } ] } using ONLY ids from the price list. " +
            "Return an empty array if nothing clearly matches.",
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              lines: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    priceItemId: { type: "string" },
                    quantity: { type: "number" },
                  },
                  required: ["priceItemId", "quantity"],
                  additionalProperties: false,
                },
              },
            },
            required: ["lines"],
            additionalProperties: false,
          },
        },
      },
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (res.stop_reason === "refusal") return null;
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const raw = JSON.parse(text.text) as { lines?: { priceItemId: string; quantity: number }[] };

    const byId = new Map(usable.map((i) => [i.id, i]));
    return (raw.lines || [])
      .map((l) => {
        const item = byId.get(l.priceItemId);
        if (!item) return null;
        const quantity = Math.max(0, Number(l.quantity) || 0);
        if (!quantity) return null;
        return {
          description: item.name,
          quantity,
          unitAmount: resolvePrice(item, job.companyId),
        } as LineItem;
      })
      .filter((l): l is LineItem => l !== null);
  } catch {
    return null;
  }
}
