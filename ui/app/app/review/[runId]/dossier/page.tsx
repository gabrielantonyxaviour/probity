import type { Metadata } from "next";
import { DossierPage } from "@/components/dossier/DossierPage";

type Props = { params: Promise<{ runId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { runId } = await params;
  return { title: `Dossier ${runId}` };
}

export default async function Page({ params }: Props) {
  const { runId } = await params;
  return <DossierPage runId={runId} />;
}
