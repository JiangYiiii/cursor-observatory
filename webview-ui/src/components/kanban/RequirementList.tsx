/**
 * 左列：需求列表。
 */
import { formatRelativeZh } from "@/lib/overview-aggregates";
import { getCapabilityUpdatedIso } from "@/lib/kanban-utils";
import type { Capability } from "@/types/observatory";
import { PhaseBadge } from "./PhaseBadge";

type Props = {
  capabilities: Capability[];
  selectedId: string | null;
  onSelect: (c: Capability) => void;
};

export function RequirementList({
  capabilities,
  selectedId,
  onSelect,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      {capabilities.map((c) => {
        const selected = selectedId === c.id;
        const iso = getCapabilityUpdatedIso(c);
        const rel = iso ? formatRelativeZh(iso) : "—";
        const ts = c.sdd?.taskStats;
        const taskHint =
          ts && ts.total > 0 ? `${ts.completed}/${ts.total} 任务` : null;
        const bugs = c.bugfix?.activeBugs ?? 0;

        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            className={`flex w-full flex-col gap-0.5 rounded-md border px-2.5 py-2 text-left transition ${
              selected
                ? "border-violet-500 bg-violet-50/80 ring-1 ring-violet-500/25 dark:bg-violet-950/30"
                : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-600 dark:bg-[#32324a] dark:hover:bg-zinc-800/80"
            }`}
          >
            <div className="flex items-start gap-2">
              <PhaseBadge phase={c.phase} className="mt-0.5" />
              <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-50">
                {c.sdd?.activeFeature ? (
                  <span
                    className="mr-1 text-amber-600 dark:text-amber-400"
                    title="当前活跃 feature"
                    aria-hidden
                  >
                    ●
                  </span>
                ) : null}
                <span className="line-clamp-2">{String(c.title ?? c.id)}</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-0 text-[10px] text-zinc-500 dark:text-zinc-400">
              <span className="truncate font-mono">{c.id}</span>
              {taskHint ? <span>{taskHint}</span> : null}
              {bugs > 0 ? (
                <span
                  className="inline-flex rounded bg-red-600 px-1 py-px font-semibold text-white"
                  title="未关闭 Bug"
                >
                  {bugs}
                </span>
              ) : null}
              <span className="ml-auto tabular-nums">{rel}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
