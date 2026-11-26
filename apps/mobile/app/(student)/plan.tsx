import { useState } from "react";
import { blankItem, blankPlan, carryable, isArchived, isISODate, LEVEL_LABEL, nextPeriodStart, nextPlanOf, parentCandidates, planName, validatePlan, weekStartOf } from "../../../../src/lib/roadmap";
import type { PlanItemKind, PlanLevel, RoadmapPlan } from "../../../../src/lib/types";
import { toISODate } from "../../../../src/lib/utils";
import { useAccount, useChronicle } from "../../src/session";
import { Action, Card, Copy, Field, Page, Row } from "../../src/ui";
import { OpenModule } from "../../src/navigation";

const levels: PlanLevel[] = ["week", "month", "year"];
const kinds: PlanItemKind[] = ["objective", "activity", "milestone"];

function PlanEditor({ plan, onOpen }: { plan: RoadmapPlan; onOpen: (id: string) => void }) {
  const { store } = useAccount();
  const plans = useChronicle((s) => s.plans);
  const goals = useChronicle((s) => s.goals);
  const [title, setTitle] = useState("");
  const [planTitle, setPlanTitle] = useState(plan.title ?? "");
  const [review, setReview] = useState(plan.review ?? {});
  const [goalId, setGoalId] = useState<string>();
  const [kind, setKind] = useState<PlanItemKind>("objective");
  const [message, setMessage] = useState("");
  const archived = isArchived(plans, plan);
  const successor = nextPlanOf(plans, plan);
  const carry = carryable(plans, plan);
  function add() {
    if (!title.trim()) return;
    try {
      store.getState().savePlanItem(plan.id, { ...blankItem(kind, title), goalId });
      setTitle("");
      setMessage("");
    } catch { setMessage("Could not save the plan item."); }
  }
  return <Card title={planName(plan)}>
    <Copy muted>{plan.start} to {plan.end}{archived ? " · Archived" : ""}</Copy>
    <Copy>{(plan.items ?? []).filter((item) => item.status === "completed").length} of {(plan.items ?? []).length} items complete</Copy>
    {(plan.items ?? []).map((item) => <Action key={item.id} label={`${item.title} · ${item.status === "completed" ? "Complete" : item.kind}`}
      selected={item.status === "completed"} disabled={archived} primary={item.status === "completed"}
      onPress={() => store.getState().setPlanItemStatus(plan.id, item.id, item.status === "completed" ? "notStarted" : "completed")} />)}
    {!archived && <>
      <Field label="Plan title" value={planTitle} onChangeText={setPlanTitle} maxLength={160} />
      <Action label="Save title" disabled={(plan.title ?? "") === planTitle.trim()} onPress={() => {
        const latest = store.getState().plans.find((item) => item.id === plan.id);
        if (latest) store.getState().savePlan({ ...latest, title: planTitle.trim() || undefined });
      }} />
      <Row>{kinds.map((value) => <Action key={value} label={value} primary={kind === value} selected={kind === value} onPress={() => setKind(value)} />)}</Row>
      <Field label={`New ${kind}`} value={title} onChangeText={setTitle} maxLength={160} />
      {goals.some((goal) => goal.status === "Active") && <>
        <Copy muted>Optional goal for the new item</Copy>
        <Row>{goals.filter((goal) => goal.status === "Active").slice(0, 8).map((goal) =>
          <Action key={goal.id} label={goal.title} selected={goalId === goal.id} primary={goalId === goal.id}
            onPress={() => setGoalId(goalId === goal.id ? undefined : goal.id)} />)}</Row>
      </>}
      <Action label={`Add ${kind}`} disabled={!title.trim()} onPress={add} />
      {parentCandidates(plans, plan).length > 0 && <><Copy>Parent plan</Copy>
        <Row>{parentCandidates(plans, plan).map((parent) => <Action key={parent.id} label={planName(parent)}
          selected={plan.parentId === parent.id} primary={plan.parentId === parent.id}
          onPress={() => store.getState().setPlanParent([plan.id], plan.parentId === parent.id ? undefined : parent.id)} />)}</Row>
      </>}
      {!successor && <Action label="Duplicate into next period" onPress={() => {
        const duplicate = store.getState().duplicatePlan(plan.id, { start: nextPeriodStart(plan) });
        if (duplicate) onOpen(duplicate);
        else setMessage("The next period could not be created.");
      }} />}
      {successor && carry.length > 0 && <Action label={`Carry ${carry.length} open items to the next plan`} onPress={() => {
        const count = store.getState().carryForward(plan.id, carry.map((item) => item.id), successor.id);
        setMessage(`${count} items carried forward.`);
      }} />}
      {plan.end <= toISODate(new Date()) && <Card title="Period review">
        <Field label="What went well?" value={review.wentWell ?? ""} multiline onChangeText={(wentWell) => setReview({ ...review, wentWell })} />
        <Field label="What could improve?" value={review.improve ?? ""} multiline onChangeText={(improve) => setReview({ ...review, improve })} />
        <Field label="Next priorities" value={review.nextPriorities ?? ""} multiline onChangeText={(nextPriorities) => setReview({ ...review, nextPriorities })} />
        <Action label="Save period review" onPress={() => { store.getState().savePlanReview(plan.id, review); setMessage("Period review saved."); }} />
        {plan.review?.snapshot && <Copy muted>{plan.review.snapshot.studyHours} h studied · {plan.review.snapshot.topics} topics completed</Copy>}
      </Card>}
    </>}
    {message && <Copy live>{message}</Copy>}
    <Action label={plan.archivedAt ? "Restore plan" : "Archive plan"} onPress={() => store.getState().setPlanArchived(plan.id, !plan.archivedAt)} />
  </Card>;
}

export default function Plan() {
  const { store } = useAccount();
  const plans = useChronicle((s) => s.plans);
  const weekStart = useChronicle((s) => s.profile.weekStart);
  const [level, setLevel] = useState<PlanLevel>("week");
  const [title, setTitle] = useState("");
  const [id, setId] = useState<string>();
  const [showArchived, setShowArchived] = useState(false);
  const [message, setMessage] = useState("");
  const [limit, setLimit] = useState(12);
  const today = toISODate(new Date());
  const [date, setDate] = useState(today);
  const current = plans.find((plan) => plan.id === id);
  const filtered = plans.filter((plan) => plan.level === level && (showArchived || !isArchived(plans, plan)));
  function create() {
    if (!isISODate(date)) { setMessage("Enter a date in YYYY-MM-DD format."); return; }
    const start = level === "week" ? weekStartOf(date, weekStart) : date;
    const plan = { ...blankPlan(level, { start }), title: title.trim() || undefined };
    const errors = validatePlan(plan, store.getState().plans);
    if (Object.keys(errors).length) { setMessage(Object.values(errors).join(" ")); return; }
    try {
      if (!store.getState().savePlan(plan)) { setMessage("The plan could not be saved."); return; }
      setId(plan.id);
      setTitle("");
      setMessage("");
    } catch { setMessage("Could not save this plan on the device."); }
  }
  return <Page title="Roadmap" intro="Plan your preparation by year, month or week.">
    <Row>{levels.map((item) => <Action key={item} label={LEVEL_LABEL[item]} primary={level === item} selected={level === item} onPress={() => { setLevel(item); setId(undefined); setMessage(""); }} />)}</Row>
    <Card title="Your plans">
      <Action label={showArchived ? "Hide archived" : "Show archived"} onPress={() => setShowArchived(!showArchived)} />
      {filtered.slice(0, limit).map((plan) => <Action key={plan.id} label={planName(plan)} selected={plan.id === id} primary={plan.id === id} onPress={() => setId(plan.id)} />)}
      {filtered.length > limit && <Action label="Show more plans" onPress={() => setLimit(limit + 12)} />}
      {!filtered.length && <Copy muted>No plans for this view.</Copy>}
    </Card>
    {current && <PlanEditor key={current.id} plan={current} onOpen={setId} />}
    <Card title="Create a plan">
      <Field label="Date in the period (YYYY-MM-DD)" value={date} onChangeText={setDate} maxLength={10} />
      <Field label="Plan title (optional)" value={title} onChangeText={setTitle} maxLength={160} />
      {message && <Copy live>{message}</Copy>}
      <Action label="Create plan" primary onPress={create} />
    </Card>
    <OpenModule name="goals" />
  </Page>;
}
