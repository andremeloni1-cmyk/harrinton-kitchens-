"use client";

import { useParams } from "next/navigation";
import { MeasureForm } from "@/components/MeasureForm";

export default function MeasurePage() {
  const { id } = useParams<{ id: string }>();
  return <MeasureForm jobId={id} />;
}
