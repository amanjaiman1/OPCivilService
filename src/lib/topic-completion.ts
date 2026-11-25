import type { ISODate, RevisionItem, Subject, Topic } from "./types";
import { fromISODate, toISODate } from "./utils";
import { newRevisionItem } from "./revision";

/* ════════════════════════════════════════════════════════════════
   Completing a syllabus topic, once, for every entry point.

   Subject Progress, the topic explorer, the Daily Journal and Daily Capture
   all mean the same thing by "finished": the topic reaches the top of the
   status ladder (`mastered`), its completion day is recorded, and — unless
   the person opted out — it joins the revision queue once. Reopening it
   takes it back to `learning` without touching revision history.

   Pure functions of (subjects, revisions, ids, date), so the store and the
   tests share one implementation and a second call can never double-apply.
   ════════════════════════════════════════════════════════════════ */

export const COMPLETED_STATUS = "mastered" as const;

/** A topic counts as completed when it sits at the top of the ladder. */
export function isTopicCompleted(topic: Pick<Topic, "status">): boolean {
  return topic.status === COMPLETED_STATUS;
}

/** The confidence a completion guarantees, matching the rest of the app. */
export const COMPLETION_CONFIDENCE = 92;

export interface TopicCompletionData {
  subjects: Subject[];
  revisions: RevisionItem[];
}

export interface TopicCompletionOutcome {
  subjects: Subject[];
  revisions: RevisionItem[];
  /** True when the topic actually changed (a first completion, or a late `completedOn`). */
  changed: boolean;
  /** True when a new revision item joined the queue. */
  revisionAdded: boolean;
  /** The topic as it now stands, when the ids were valid. */
  topic?: Topic;
}

export interface CompleteTopicOptions {
  /**
   * Whether a first revision should join the queue. Defaults to true:
   * completing a topic is what puts it on the revision path. The journal
   * passes the person's own "add to revision queue" choice.
   */
  scheduleRevision?: boolean;
}

function isISODateValue(v: unknown): v is ISODate {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Revision items join the syllabus topic by subject id plus normalised name. */
export function revisionKey(subjectId: string, topicName: string): string {
  return `${subjectId}::${topicName.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/** Finds the revision item that covers a syllabus topic, if one exists. */
export function revisionForTopic(
  revisions: RevisionItem[],
  subjectId: string,
  topicName: string,
): RevisionItem | undefined {
  const key = revisionKey(subjectId, topicName);
  return revisions.find((r) => revisionKey(r.subjectId, r.topic) === key);
}

/**
 * The first pass for a topic finished on `completedAt`: the next day, and
 * never in the past (back-filling an old day must not queue overdue work).
 */
export function firstRevisionDue(completedAt: ISODate, today: ISODate = toISODate(new Date())): ISODate {
  const next = fromISODate(completedAt);
  next.setDate(next.getDate() + 1);
  const due = toISODate(next);
  return due < today ? today : due;
}

function completedTopic(topic: Topic, completedAt: ISODate): Topic {
  return {
    ...topic,
    status: COMPLETED_STATUS,
    confidence: Math.max(topic.confidence, COMPLETION_CONFIDENCE),
    completedOn: completedAt,
    lastTouched: !topic.lastTouched || topic.lastTouched < completedAt ? completedAt : topic.lastTouched,
  };
}

function revisionForCompletion(
  subject: Subject,
  topic: Topic,
  completedAt: ISODate,
  today: ISODate,
): RevisionItem {
  return {
    ...newRevisionItem(subject.id, topic.name, fromISODate(completedAt)),
    nextDue: firstRevisionDue(completedAt, today),
  };
}

/**
 * Marks a topic completed. Idempotent: calling it again on an already
 * completed topic changes nothing and adds no second revision. A topic
 * saved before completion was recorded gets its missing `completedOn` filled
 * in the first time it passes through here.
 */
export function completeTopicInData(
  data: TopicCompletionData,
  subjectId: string,
  topicId: string,
  completedAt: ISODate,
  options: CompleteTopicOptions = {},
): TopicCompletionOutcome {
  const unchanged: TopicCompletionOutcome = {
    subjects: data.subjects,
    revisions: data.revisions,
    changed: false,
    revisionAdded: false,
  };
  if (!subjectId || !topicId || !isISODateValue(completedAt)) return unchanged;

  const subject = data.subjects.find((s) => s.id === subjectId);
  const topic = subject?.topics.find((t) => t.id === topicId);
  if (!subject || !topic) return unchanged;

  const alreadyComplete = topic.status === COMPLETED_STATUS && Boolean(topic.completedOn);
  if (alreadyComplete) {
    return { ...unchanged, topic };
  }

  const nextTopic = completedTopic(topic, completedAt);
  const subjects = data.subjects.map((s) =>
    s.id !== subjectId ? s : { ...s, topics: s.topics.map((t) => (t.id === topicId ? nextTopic : t)) },
  );

  const schedule = options.scheduleRevision !== false;
  let revisions = data.revisions;
  let revisionAdded = false;
  if (schedule && !revisionForTopic(revisions, subjectId, topic.name)) {
    revisions = [...revisions, revisionForCompletion(subject, nextTopic, completedAt, toISODate(new Date()))].sort(
      (a, b) => a.nextDue.localeCompare(b.nextDue),
    );
    revisionAdded = true;
  }

  return { subjects, revisions, changed: true, revisionAdded, topic: nextTopic };
}

/**
 * Takes a completed topic back to "learning". The completion day is cleared
 * and the status dropped, but confidence and revision history stay: a
 * revision item that has ever been reviewed is left exactly where it is, so
 * its sessions and schedule are never silently erased. Only a queue entry
 * that was created by the completion and never used is removed.
 */
export function reopenTopicInData(
  data: TopicCompletionData,
  subjectId: string,
  topicId: string,
  reopenedAt: ISODate = toISODate(new Date()),
): TopicCompletionOutcome {
  const unchanged: TopicCompletionOutcome = {
    subjects: data.subjects,
    revisions: data.revisions,
    changed: false,
    revisionAdded: false,
  };
  if (!subjectId || !topicId) return unchanged;

  const subject = data.subjects.find((s) => s.id === subjectId);
  const topic = subject?.topics.find((t) => t.id === topicId);
  if (!subject || !topic) return unchanged;
  if (topic.status !== COMPLETED_STATUS && !topic.completedOn) return { ...unchanged, topic };

  const nextTopic: Topic = {
    ...topic,
    status: "learning",
    lastTouched: reopenedAt,
  };
  delete nextTopic.completedOn;

  const subjects = data.subjects.map((s) =>
    s.id !== subjectId ? s : { ...s, topics: s.topics.map((t) => (t.id === topicId ? nextTopic : t)) },
  );

  const key = revisionKey(subjectId, topic.name);
  const revisions = data.revisions.filter((r) => {
    if (revisionKey(r.subjectId, r.topic) !== key) return true;
    // Keep anything that has been reviewed or carries real history.
    const untouched = !r.lastRevised && !(r.passes?.length) && r.repetitions === 0;
    return !untouched;
  });

  return { subjects, revisions, changed: true, revisionAdded: false, topic: nextTopic };
}

/** A subject's completion reading: how many topics are done, and the share. */
export function topicCompletion(topics: Pick<Topic, "status">[]): { completed: number; total: number; pct: number } {
  const total = topics.length;
  const completed = topics.filter(isTopicCompleted).length;
  return { completed, total, pct: total ? Math.round((completed / total) * 100) : 0 };
}
