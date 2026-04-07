import type { CapabilityPhase } from "@/types/observatory";
import { normalizePhase, PHASE_TITLE } from "@/lib/kanban-utils";

const VARIANT: Record<
  CapabilityPhase,
  string
> = {
  planning:
    "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200",
  designing:
    "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-200",
  developing:
    "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100",
  testing:
    "bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-100",
  completed:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  released:
    "bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200",
  deprecated:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

type Props = {
  phase: CapabilityPhase | string | undefined;
  className?: string;
};

export function PhaseBadge({ phase, className = "" }: Props) {
  const p = normalizePhase(phase);
  const label = PHASE_TITLE[p];
  return (
    <span
      className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${VARIANT[p]} ${className}`}
    >
      {label}
    </span>
  );
}
