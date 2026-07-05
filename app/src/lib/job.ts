// Lightweight client-side shape of a Job (dates arrive as ISO strings via JSON).

export interface JobDTO {
  id: string;
  reference: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  durationMins: number;
  quoteAmount?: number | null;
  currency: string;
  address?: string | null;
  companyId?: string | null;
  companyName?: string | null; // resolved client-company label (LeadSource)
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  installerId?: string | null;
  installer?: { id: string; name: string; color?: string | null } | null;
  googleEventId?: string | null;
  driveFolderId?: string | null;
  drivePhotosFolderId?: string | null;
  todos?: string; // JSON [{label,done}]
  maintenanceTasks?: string; // JSON [{label,done}]
  estimateItems?: string; // JSON LineItem[] — component estimate
  leadSource?: string | null;
  gmailMessageId?: string | null;
  flag?: string | null;
  notes?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  documents?: DocumentDTO[];
  tradeVisits?: TradeVisitDTO[];
  reports?: ReportDTO[];
  activities?: ActivityDTO[];
  invoices?: InvoiceDTO[];
  unbilled?: boolean; // completed but not yet billed to the company
  _count?: { reports: number };
}

export interface InvoiceLineItemDTO {
  description: string;
  quantity: number;
  unitAmount: number;
}

export interface InvoiceDTO {
  id: string;
  number: string;
  status: string;
  jobId?: string | null;
  clientId?: string | null;
  issueDate: string;
  dueDate?: string | null;
  currency: string;
  lineItems: string; // JSON array of InvoiceLineItemDTO
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  reference?: string | null;
  xeroInvoiceId?: string | null;
  xeroNumber?: string | null;
  lastSyncedAt?: string | null;
  createdAt?: string;
  overdue?: boolean;
  job?: { id: string; reference: string; title: string; companyId?: string | null } | null;
  client?: { id: string; name: string } | null;
}

export interface DocumentDTO {
  id: string;
  name: string;
  webViewLink?: string | null;
  source: string;
  mimeType?: string;
  createdAt: string;
  sharedWithClient?: boolean;
  reviewStatus?: string | null; // pending | approved | changes_requested
  reviewNote?: string | null;
  reviewedAt?: string | null;
}

export interface TradeVisitDTO {
  id: string;
  trade: string;
  company?: string | null;
  scheduledStart: string;
  scheduledEnd?: string | null;
  notes?: string | null;
  status: string; // scheduled | done | cancelled
}

export interface ReportDTO {
  id: string;
  status: string;
  data?: string;
  installer?: { name: string } | null;
  webViewLink?: string | null;
  sentAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ActivityDTO {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}
