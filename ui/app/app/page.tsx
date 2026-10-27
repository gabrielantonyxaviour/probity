import type { Metadata } from "next";
import { QueuePage } from "@/components/inbox/QueuePage";

export const metadata: Metadata = { title: "Change requests" };

export default function Page() {
  return <QueuePage />;
}
