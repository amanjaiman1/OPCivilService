import { completedTopicsOf } from "../../../src/lib/topics";
import { isISODate } from "../../../src/lib/roadmap";
import type { JournalEntry, RevisionSession, Subject } from "../../../src/lib/types";
import { round } from "../../../src/lib/utils";

export function mergeStudyEntry(input: {
  today: string; date: string; previous?: JournalEntry; subject?: Subject; topicIds: string[];
  hours: string; reflection: string; revisions: RevisionSession[]; id: string;
}): JournalEntry {
  const { date, today, previous, id, subject, topicIds, reflection, revisions } = input;
  if (!isISODate(date) || date > today) throw new Error("Choose an existing or past date in YYYY-MM-DD format.");
  const amount = input.hours.trim() === "" ? null : Number(input.hours);
  if (amount !== null && (!subject || !Number.isFinite(amount) || amount < 0 || amount > 24)) {
    throw new Error("Choose a subject and enter 0–24 hours.");
  }
  const previousBlocks = previous?.blocks ?? [];
  const existingBlock = previousBlocks.find((block) => block.subjectId === subject?.id);
  const blocks = amount === null || !subject ? previousBlocks : [
    ...previousBlocks.filter((block) => block.subjectId !== subject.id),
    ...(amount > 0 ? [{ ...existingBlock, subjectId: subject.id, hours: amount }] : []),
  ];
  const previousHours = previous?.totalHours ?? 0;
  const blockTotal = blocks.reduce((total, block) => total + block.hours, 0);
  const historicalExtra = Math.max(0, previousHours - previousBlocks.reduce((total, block) => total + block.hours, 0));
  const totalHours = amount === null ? previousHours : round(blockTotal + historicalExtra, 2);
  if (amount !== null && totalHours > 24) throw new Error("The day’s study time exceeds 24 hours.");
  const completedTopics = previous ? [...completedTopicsOf(previous)] : [];
  const known = new Set(completedTopics.map((topic) => topic.topicId));
  for (const topic of subject?.topics ?? []) {
    if (topicIds.includes(topic.id) && !known.has(topic.id)) completedTopics.push({
      id: `completion-${date}-${topic.id}`, name: topic.name, subjectId: subject?.id, topicId: topic.id,
    });
  }
  const existingRevisions = previous?.revisionSessions ?? [];
  const revisionIds = new Set(existingRevisions.map((item) => item.revisionItemId));
  return {
    mood: 0, energy: 0, motivation: 0, focus: 0,
    ...previous, id: previous?.id ?? id, date, blocks, totalHours, completedTopics,
    reflection: reflection === previous?.reflection ? previous.reflection : reflection.trim() || undefined,
    revisionSessions: [...existingRevisions, ...revisions.filter((item) => !revisionIds.has(item.revisionItemId))],
  };
}
