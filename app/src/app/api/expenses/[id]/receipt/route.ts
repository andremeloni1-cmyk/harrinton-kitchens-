import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Serves the stored receipt image. Kept out of the list/detail JSON so those
 * payloads stay small. */
export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const expense = await prisma.expense.findUnique({
    where: { id: (await params).id },
    select: { receiptData: true, receiptMime: true },
  });
  if (!expense?.receiptData) return json({ error: "not found" }, 404);
  const bytes = Buffer.from(expense.receiptData, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": expense.receiptMime || "image/jpeg",
      "cache-control": "private, max-age=3600",
    },
  });
}
