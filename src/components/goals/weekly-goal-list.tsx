import { ArrowUpRight, Flag, Target } from "lucide-react";
import { AppLink } from "@/components/layout/app-link";
import { roadmapHref, StatusBadge } from "@/components/roadmap/shared";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { WeeklyGoalItem } from "@/lib/weekly-goal-items";

export function WeeklyGoalList({ rows }: { rows: WeeklyGoalItem[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-paper/65">From your weekly roadmap</h3>
      <ul className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
        {rows.map(({ planId, planTitle, item, due, archived, overdue }) => {
          const milestone = item.kind === "milestone";
          const Icon = milestone ? Flag : Target;
          return (
            <li key={`${planId}:${item.id}`}>
              <Card className="h-full">
                <AppLink href={roadmapHref({ plan: planId, item: item.id })}
                  className="flex h-full items-start gap-3 rounded-2xl p-4 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="break-words text-sm font-semibold text-paper">{item.title}</p>
                    <p className="break-words text-xs text-paper/65">
                      {milestone ? "Milestone" : "Objective"} · {planTitle} · {item.targetDate ? "Due" : "Week ends"} {formatDate(due)}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge status={item.status} />
                      {archived && <Badge tone="ghost">Archived plan</Badge>}
                      {overdue && <Badge tone="danger">Overdue</Badge>}
                    </div>
                  </div>
                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-paper/55" aria-hidden />
                </AppLink>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
