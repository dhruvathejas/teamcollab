"use client"; // Error boundaries must be Client Components

import { UpdatingScreen } from "@/components/updating-screen";

// A page failed to render or load: show "under updates" and retry, instead of
// leaving a blank or half-working page.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <UpdatingScreen error={error} retry={retry} />;
}
