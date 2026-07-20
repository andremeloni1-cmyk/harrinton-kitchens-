import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { visionConfigured } from "@/lib/vision";
import { extractReceipt } from "@/lib/receipt-ai";

export const dynamic = "force-dynamic";

const RASTER = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** Reads a receipt photo and returns the extracted fields for review — does not
 * save. The capture UI calls this, lets the owner correct the fields, then POSTs
 * to /api/expenses to save. */
export async function POST(req: Request) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  if (!visionConfigured()) {
    return json({ error: "AI isn't configured — add ANTHROPIC_API_KEY to read receipts." }, 400);
  }
  const body = await req.json().catch(() => ({}));
  const mime = typeof body.receiptMime === "string" ? body.receiptMime : "";
  if (!RASTER.has(mime) || typeof body.receiptData !== "string") {
    return json({ error: "A receipt image (png/jpeg/webp) is required" }, 400);
  }

  const extracted = await extractReceipt({
    data: Buffer.from(body.receiptData, "base64"),
    mimeType: mime,
    today: new Date().toISOString().slice(0, 10),
  });
  if (extracted === null) return json({ error: "Couldn't read that receipt — enter the details by hand." }, 502);
  return json({ extracted });
}
