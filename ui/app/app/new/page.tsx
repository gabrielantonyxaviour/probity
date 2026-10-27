import type { Metadata } from "next";
import { Suspense } from "react";
import { NewRequestPage } from "@/components/new/NewRequestPage";

export const metadata: Metadata = { title: "New request" };

export default function Page() {
  return (
    <Suspense>
      <NewRequestPage />
    </Suspense>
  );
}
