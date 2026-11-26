import { cn } from "@/lib/utils";

export function AdminLoader({ label = "Loading Admin Center…", compact = false }: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex justify-center", compact ? "self-start pt-3" : "min-h-52 items-center")}>
      <div role="status" className="flex items-center gap-2.5 rounded-full border border-line bg-card px-4 py-2.5 text-xs font-semibold text-paper shadow-lift">
        <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border-2 border-accent/25 border-t-accent motion-safe:animate-spin" />
        {label}
      </div>
    </div>
  );
}
