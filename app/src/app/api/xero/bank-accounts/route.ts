import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { listBankAccounts } from "@/lib/xero/banktransactions";

export const dynamic = "force-dynamic";

/** Lists the connected org's Xero bank accounts, for the Settings picker. */
export async function GET() {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  try {
    const accounts = await listBankAccounts();
    if (accounts === null) return json({ accounts: [], connected: false });
    return json({ accounts, connected: true });
  } catch {
    // Almost always a token that predates the accounting.settings.read scope
    // (connected before receipts shipped). Reconnecting grants it.
    return json({
      accounts: [],
      connected: true,
      error: "Reconnect Xero (Disconnect then Connect above) to grant access to your bank accounts.",
    });
  }
}
