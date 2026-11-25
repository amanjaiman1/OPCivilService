"use client";

import { Suspense } from "react";
import { Loading } from "@/components/ui/loading";
import { JournalList } from "@/components/journal/journal-list";

/** The journal on its own, without the Daily Capture form opening over it. */
export default function JournalHistoryPage() {
  return <Suspense fallback={<Loading />}><JournalList legacyComposerLink /></Suspense>;
}
