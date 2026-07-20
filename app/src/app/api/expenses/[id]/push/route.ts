import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { pushExpenseToXero, toExpenseDTO } from "@/lib/expenses";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Pushes a captured expense to Xero as a spend-money transaction. Surfaces
 * Xero/validation problems as a 422 so the UI can show the message. */
export async function POST(_req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  try {
    const expense = await pushExpenseToXero((await params).id);
    return json({ expense: toExpenseDTO(expense) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Couldn't push to Xero" }, 422);
  }
}
