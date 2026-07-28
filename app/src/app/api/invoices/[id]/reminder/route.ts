import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { reminderEmailDefaults, sendPaymentReminder } from "@/lib/invoice-email";
import { mintToken, consumeToken } from "@/lib/reminder-tokens";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Preview for the chase-payment sheet. There is no send without one: the
 * response carries a single-use token the POST below requires, so a double-tap
 * or a flaky-network retry can't chase a client twice.
 */
export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const { id } = await params;
  const preview = await reminderEmailDefaults(id);
  if (!preview) return json({ error: "Invoice not found." }, 404);
  return json({ ...preview, token: mintToken(id) });
}

export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (typeof body.token !== "string" || !consumeToken(body.token, id)) {
    return json({ error: "This reminder preview has expired — reopen it to send." }, 409);
  }

  try {
    const { remindedAt } = await sendPaymentReminder(id, {
      to: typeof body.to === "string" ? body.to : "",
      cc: typeof body.cc === "string" ? body.cc : undefined,
      subject: typeof body.subject === "string" ? body.subject : "",
      message: typeof body.message === "string" ? body.message : "",
    });
    return json({ ok: true, remindedAt: remindedAt.toISOString() });
  } catch (e) {
    // "no longer overdue", "Google not connected", "just sent" — all written
    // for the office to read.
    return json({ error: e instanceof Error ? e.message : "Couldn't send the reminder." }, 400);
  }
}
