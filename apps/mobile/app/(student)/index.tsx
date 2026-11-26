import { useRouter } from "expo-router";
import { useChronicle, useSession } from "../../src/session";
import { Action, Card, Copy, Page, Row } from "../../src/ui";
import { toISODate, daysBetween, formatHours } from "../../../../src/lib/utils";
import { bucketRevisions } from "../../../../src/lib/revision";
import { habitContext, todayHabits } from "../../../../src/lib/habit-engine";
import { weeklyTargets } from "../../../../src/lib/roadmap";
import { OpenModule } from "../../src/navigation";
import { ReviewInvitation } from "../../src/services";
import { MorningCheckIn } from "../../src/morning";

const syncLabels = {
  idle: "Checking cloud copy", syncing: "Saved here · syncing", synced: "Synced",
  offline: "Offline · saved on this device", error: "Sync needs attention",
  held: "Sync needs your review", recovery: "Account recovery needed", outdated: "Update required",
};

export default function Home() {
  const router = useRouter();
  const { sync, account, hasConflicts } = useSession();
  const profile = useChronicle((s) => s.profile);
  const journal = useChronicle((s) => s.journal);
  const revisions = useChronicle((s) => s.revisions);
  const plans = useChronicle((s) => s.plans);
  const lifeLog = useChronicle((s) => s.lifeLog);
  const subjects = useChronicle((s) => s.subjects);
  const habits = useChronicle((s) => s.habits);
  const today = toISODate(new Date());
  const entry = journal.find((day) => day.date === today);
  const weekly = weeklyTargets(plans, today).flatMap((group) => group.items);
  const countdown = daysBetween(today, profile.examDate);
  const queue = bucketRevisions(revisions, today);
  const dueHabits = todayHabits(habits, habitContext({ journal, lifeLog, revisions, plans, subjects, profile }, today)).filter((habit) => habit.due);
  const sleep = lifeLog.find((day) => day.date === today);
  const priorities = weekly.filter((item) => item.status !== "completed").slice(0, 3);

  return <Page title={`Hello, ${profile.name.split(" ")[0] || "aspirant"}`} intro={countdown >= 0 ? `${countdown} days to your exam target` : profile.targetExam}>
    <Card title="Today">
      <Copy>{formatHours(entry?.totalHours ?? 0)} of {formatHours(profile.dailyHourTarget)} studied</Copy>
      <Copy>{queue.overdue.length + queue.dueToday.length} revisions due</Copy>
      <Copy>{weekly.filter((item) => item.status === "completed").length} of {weekly.length} weekly targets complete</Copy>
      {priorities.length > 0 && <Copy muted>Priorities · {priorities.map((item) => item.title).join(" · ")}</Copy>}
      <Copy>{dueHabits.filter((habit) => habit.done).length} of {dueHabits.length} due habits complete</Copy>
      {sleep?.sleepHours != null && <Copy>{formatHours(sleep.sleepHours)} asleep {sleep.sleepHoursSource === "estimated" ? "· estimated" : ""}</Copy>}
      <Action label="Open Daily Capture" primary onPress={() => router.push("/capture")} />
    </Card>
    <MorningCheckIn />
    <Card title="Keep going"><Row><OpenModule name="journal" /><OpenModule name="revision" /><OpenModule name="habits" /><OpenModule name="announcements" /></Row></Card>
    <ReviewInvitation />
    <Card title="Account sync">
      <Copy live>{sync ? syncLabels[sync.status] : "Checking cloud copy"}{sync?.pending && sync.status !== "syncing" ? " · changes pending" : ""}</Copy>
      {hasConflicts && <Copy live>Some edits conflicted during sync. Review your latest records and keep a device backup if needed.</Copy>}
      {sync?.status === "held" ? <>
        <Copy>Keep the cloud copy and merge your device’s additions.</Copy>
        <Action label="Keep cloud records" onPress={() => void account?.engine.resolveHold("restore")} />
      </> : <Action label="Check sync" onPress={() => void account?.engine.retry()} />}
    </Card>
  </Page>;
}
