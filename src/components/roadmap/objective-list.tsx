"use client";

import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import type { ISODate, PlanItemStatus, RoadmapPlan } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import { ITEM_STATUSES, LIMITS, STATUS_LABEL, objectiveCounts } from "@/lib/roadmap";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";

/**
 * A period's objectives as records, not slogans: tick one to finish it, step
 * it back to reopen it, or move it to "in progress" without inventing a second
 * copy anywhere. They are independent of Goals — linking is optional and never
 * required — and never carried forward automatically.
 */
export function ObjectiveList({
  plan,
  today,
  readOnly = false,
}: {
  plan: RoadmapPlan;
  today: ISODate;
  readOnly?: boolean;
}) {
  const addPlanObjective = useChronicle((s) => s.addPlanObjective);
  const setPlanObjectiveStatus = useChronicle((s) => s.setPlanObjectiveStatus);
  const deletePlanObjective = useChronicle((s) => s.deletePlanObjective);
  const [title, setTitle] = useState("");
  const objectives = plan.objectives ?? [];
  const counts = objectiveCounts(plan, today);
  const full = objectives.length >= LIMITS.objectives;

  function add() {
    const t = title.trim();
    if (!t || full) return;
    addPlanObjective(plan.id, t);
    setTitle("");
  }

  return (
    <div className="space-y-2">
      {readOnly && objectives.length === 0 && <p className="text-[0.78rem] text-paper/55">No objectives.</p>}
      {objectives.length > 0 && (
        <ul className="space-y-1.5">
          {objectives.map((o, i) => {
            const done = o.status === "completed";
            return (
              <li
                key={o.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border border-line bg-paper/[0.02] px-3 py-2.5",
                  done && "bg-positive/[0.04]",
                )}
              >
                <button
                  type="button"
                  onClick={() => setPlanObjectiveStatus(plan.id, o.id, done ? "notStarted" : "completed")}
                  disabled={readOnly}
                  aria-pressed={done}
                  aria-label={done ? `Reopen “${o.title}”` : `Mark “${o.title}” complete`}
                  className={cn(
                    "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors disabled:cursor-not-allowed",
                    done ? "border-positive bg-positive text-ink" : "border-paper/35 hover:border-accent",
                  )}
                >
                  {done && <Check className="h-3 w-3" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm font-medium text-paper",
                      done && "text-paper/65 line-through decoration-paper/40",
                    )}
                  >
                    <span className="tabular mr-2 text-[0.7rem] font-bold text-accent">{i + 1}</span>
                    {o.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-paper/60">
                    <span>{STATUS_LABEL[o.status]}</span>
                    {o.targetDate && (
                      <span className={cn(o.status !== "completed" && o.targetDate < today && "font-semibold text-danger")}>
                        By {o.targetDate}
                      </span>
                    )}
                    {done && o.completedAt && <span className="text-positive">Completed {o.completedAt.slice(0, 10)}</span>}
                    {(o.journalDates?.length ?? 0) > 0 && (
                      <span>
                        {o.journalDates!.length} journal day{o.journalDates!.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </div>
                {!readOnly && (
                  <>
                    <Select
                      value={o.status}
                      onChange={(e) => setPlanObjectiveStatus(plan.id, o.id, e.target.value as PlanItemStatus)}
                      aria-label={`Status of “${o.title}”`}
                      className="hidden h-8 w-[8.5rem] shrink-0 rounded-lg py-1 pl-2.5 text-[0.72rem] sm:block"
                    >
                      {ITEM_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => deletePlanObjective(plan.id, o.id)}
                      aria-label={`Remove “${o.title}”`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-paper/50 hover:bg-paper/[0.06] hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!readOnly && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={counts.total ? "Add another objective…" : "What is this period for? Add an objective…"}
            aria-label="New objective"
            maxLength={LIMITS.itemTitle}
            className="flex-1"
            disabled={full}
          />
          <Button type="submit" variant="ghost" disabled={!title.trim() || full} aria-label="Add objective">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>
      )}
      {full && !readOnly && <p className="text-[0.72rem] text-warning">A plan holds up to {LIMITS.objectives} objectives.</p>}
    </div>
  );
}
