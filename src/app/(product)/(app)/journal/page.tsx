import { Suspense } from "react";
import { Loading } from "@/components/ui/loading";
import { JournalList } from "@/components/journal/journal-list";

export default function JournalPage() {
  return <Suspense fallback={<Loading />}><JournalList /></Suspense>;
}
