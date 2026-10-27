import type { Metadata } from "next";
import { ReviewPage } from "@/components/review/ReviewPage";

type Props = { params: Promise<{ runId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { runId } = await params;
  return { title: `Check ${runId}` };
}

export default async function Page({ params }: Props) {
  const { runId } = await params;
  return <ReviewPage runId={runId} />;
}
