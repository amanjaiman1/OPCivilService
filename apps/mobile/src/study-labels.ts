import { healthLabel, type GoalProgress } from "../../../src/lib/goals";

export function buildGoalLabel(progress: GoalProgress) {
  if (progress.current == null) return healthLabel(progress.health);
  return progress.target == null ? String(progress.current) : `${progress.current} of ${progress.target}`;
}

export function bounded(raw: string | undefined, min: number, max: number) {
  if (!raw?.trim()) return false;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max;
}
