"use client";

import { useParams } from "next/navigation";
import { QuoteBuilder } from "@/components/QuoteBuilder";

export default function QuotePage() {
  const { id } = useParams<{ id: string }>();
  return <QuoteBuilder jobId={id} />;
}
